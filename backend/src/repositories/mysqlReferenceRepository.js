import { randomUUID } from 'node:crypto'
import { ApiError } from '../management/validation.js'
import { lockManager } from '../management/authorization.js'

const tables = { departments: 'departments', categories: 'fault_categories', subcategories: 'fault_subcategories' }
const missing = () => new ApiError(404, 'السجل غير موجود.')

function map(row) {
  return { id: row.id, name: row.name, isActive: Boolean(row.is_active),
    ...(row.ticket_count !== undefined ? { ticketCount: Number(row.ticket_count) } : {}),
    ...(row.category_id ? { categoryId: row.category_id } : {}) }
}

export function createMySqlReferenceRepository(pool, kind) {
  const table = tables[kind]
  if (!table) throw new Error('Unknown reference repository')
  const subcategory = kind === 'subcategories'
  return {
    async list({ activeOnly = false, categoryId, search = '', includeCounts = false } = {}) {
      const where = [], params = []
      if (activeOnly) where.push('r.is_active = TRUE')
      if (subcategory && activeOnly) where.push('c.is_active = TRUE')
      if (subcategory && categoryId) { where.push('r.category_id = ?'); params.push(categoryId) }
      if (search) { where.push('LOCATE(?, r.name) > 0'); params.push(search) }
      const ticketField = { departments: 'department_id', categories: 'category_id', subcategories: 'subcategory_id' }[kind]
      const [rows] = await pool.execute(`SELECT r.* ${includeCounts ? `, (SELECT COUNT(*) FROM tickets t WHERE t.${ticketField} = r.id) ticket_count` : ''} FROM ${table} r ${subcategory ? 'JOIN fault_categories c ON c.id = r.category_id' : ''}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.name, r.id`, params)
      return rows.map(map)
    },
    async getById(id, activeOnly = false) {
      const [rows] = await pool.execute(`SELECT r.* FROM ${table} r ${subcategory ? 'JOIN fault_categories c ON c.id = r.category_id' : ''}
        WHERE r.id = ? ${activeOnly ? `AND r.is_active = TRUE ${subcategory ? 'AND c.is_active = TRUE' : ''}` : ''}`, [id])
      return rows[0] ? map(rows[0]) : null
    },
    async save(input, id = null, actor) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await lockManager(connection, actor)
        let current
        if (id) {
          const [rows] = await connection.execute(`SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id])
          if (!rows[0]) throw missing()
          current = map(rows[0])
        }
        const record = { ...current, ...input, id: id ?? randomUUID() }
        if (subcategory) {
          const [parents] = await connection.execute('SELECT is_active FROM fault_categories WHERE id = ? FOR SHARE', [record.categoryId])
          if (!parents[0]) throw new ApiError(400, 'نوع العطل الرئيسي غير موجود.')
          if (!parents[0].is_active && record.isActive) throw new ApiError(409, 'نوع العطل الرئيسي غير نشط.')
        }
        const now = new Date()
        if (id) {
          await connection.execute(`UPDATE ${table} SET name = ?, is_active = ?, updated_at = ? ${subcategory ? ', category_id = ?' : ''} WHERE id = ?`,
            [record.name, record.isActive, now, ...(subcategory ? [record.categoryId] : []), id])
        } else {
          await connection.execute(`INSERT INTO ${table} (id, name, is_active, created_at, updated_at ${subcategory ? ', category_id' : ''}) VALUES (?, ?, ?, ?, ? ${subcategory ? ', ?' : ''})`,
            [record.id, record.name, record.isActive, now, now, ...(subcategory ? [record.categoryId] : [])])
        }
        await connection.commit()
        return record
      } catch (error) {
        await connection.rollback()
        throw error
      } finally { connection.release() }
    },
  }
}
