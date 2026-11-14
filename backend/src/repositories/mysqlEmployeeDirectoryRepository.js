import { randomUUID } from 'node:crypto'
import { ApiError } from '../management/validation.js'

function map(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    isActive: Boolean(row.is_active),
    createdByAccountId: row.created_by_account_id,
    createdAt: row.created_at,
  }
}

export function createMySqlEmployeeDirectoryRepository(pool) {
  return {
    async list(search = '', page = 1, { options = false } = {}) {
      const term = search.trim()
      const where = `e.is_active = TRUE ${options ? 'AND d.is_active = TRUE' : ''} AND (? = '' OR LOCATE(?, e.full_name) > 0)`
      const parameters = [term, term]
      const connection = await pool.getConnection()
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        await connection.beginTransaction()
        const [[count]] = await connection.execute(
          `SELECT COUNT(*) AS total FROM employee_directory e JOIN departments d ON d.id=e.department_id WHERE ${where}`,
          parameters,
        )
        const [rows] = await connection.execute(
          `SELECT e.*, d.name AS department_name
           FROM employee_directory e JOIN departments d ON d.id = e.department_id
           WHERE ${where}
           ORDER BY e.full_name, e.id LIMIT 25 OFFSET ?`,
          [...parameters, (page - 1) * 25],
        )
        await connection.commit()
        return { items: rows.map(row => options ? { id: row.id, fullName: row.full_name, departmentId: row.department_id, departmentName: row.department_name } : map(row)), total: Number(count.total), page, pageSize: 25 }
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
    async create(input, actor) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [[current]] = await connection.execute('SELECT role, is_active FROM users WHERE id = ? FOR SHARE', [actor.id])
        if (!current?.is_active || !['technician', 'manager'].includes(current.role)) {
          throw new ApiError(403, 'ليس لديك صلاحية لإضافة موظف.')
        }
        const [[department]] = await connection.execute('SELECT name, is_active FROM departments WHERE id = ? FOR SHARE', [input.departmentId])
        if (!department?.is_active) throw new ApiError(400, 'اختر قسمًا نشطًا.')
        const id = randomUUID()
        const now = new Date()
        await connection.execute(
          `INSERT INTO employee_directory
           (id, full_name, department_id, is_active, created_by_account_id, created_at, updated_at)
           VALUES (?, ?, ?, TRUE, ?, ?, ?)`,
          [id, input.fullName, input.departmentId, actor.id, now, now],
        )
        await connection.commit()
        return { id, ...input, departmentName: department.name, isActive: true, createdByAccountId: actor.id, createdAt: now }
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },
  }
}
