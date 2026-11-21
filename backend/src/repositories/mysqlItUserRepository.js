import { randomUUID } from 'node:crypto'
import { ApiError } from '../management/validation.js'
import { lockManager } from '../management/authorization.js'
import {guard} from '../administration/repository.js'

const columns = 'id, email,username, full_name, role, is_active, is_available'
function map(row) {
  return { id: row.id, email: row.email, username: row.username??row.email, fullName: row.full_name, role: row.role,
    ...(row.assigned_count !== undefined ? { assignedTicketCount: Number(row.assigned_count), activeTicketCount: Number(row.active_count) } : {}),
    isActive: Boolean(row.is_active), isAvailable: row.role === 'technician' ? Boolean(row.is_available) : null }
}

export function createMySqlItUserRepository(pool) {
  return {
    async list(optionsOnly = false, { search = '', activeOnly = false, role } = {}) {
      const where = [optionsOnly ? "role = 'technician' AND is_active = TRUE" : "role IN ('technician', 'manager')"], values = []
      if (activeOnly) where.push('is_active = TRUE')
      if (role) { where.push('role = ?'); values.push(role) }
      if (search) { where.push('(LOCATE(?, full_name) > 0 OR LOCATE(?, COALESCE(username,email)) > 0 OR LOCATE(?, email)>0 OR LOCATE(?, role) > 0)'); values.push(search, search, search,search) }
      const counts = optionsOnly ? '' : `, (SELECT COUNT(*) FROM tickets t WHERE t.assigned_technician_id = users.id) assigned_count,
        (SELECT COUNT(*) FROM tickets t WHERE t.assigned_technician_id = users.id AND t.status NOT IN ('resolved', 'closed')) active_count`
      const [rows] = await pool.execute(`SELECT ${columns}${counts} FROM users WHERE ${where.join(' AND ')} ORDER BY full_name, id`, values)
      return rows.map((row) => optionsOnly ? { id: row.id, fullName: row.full_name, isAvailable: Boolean(row.is_available) } : map(row))
    },
    async getById(id, optionsOnly = false) {
      const [rows] = await pool.execute(`SELECT ${columns} FROM users WHERE id = ? AND ${optionsOnly ? "role = 'technician' AND is_active = TRUE" : "role IN ('technician', 'manager')"}`, [id])
      if (!rows[0]) return null
      return optionsOnly ? { id: rows[0].id, fullName: rows[0].full_name, isAvailable: Boolean(rows[0].is_available) } : map(rows[0])
    },
    async create(input, actor) {
      const id = randomUUID(), now = new Date()
      // Management never accepts credentials. New identities cannot password-login until separately provisioned.
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await guard(connection)
        await lockManager(connection, actor)
        const [[collision]]=await connection.execute('SELECT id FROM users WHERE email=? OR username=? LIMIT 1',[input.email,input.email])
        if(collision)throw new ApiError(409,'اسم المستخدم موجود بالفعل.')
        await connection.execute(`INSERT INTO users (id, email,username, full_name, role, is_active,must_complete_profile, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?,TRUE, ?, ?)`, [id, input.email,input.email.includes('@')?null:input.email, input.fullName, input.role, input.isActive, now, now])
        await connection.commit()
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
      return this.getById(id)
    },
    async update(id, input, actor) {
      const mapping = { email: 'email', fullName: 'full_name', role: 'role', isActive: 'is_active' }
      const entries = Object.entries(input)
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await guard(connection)
        await lockManager(connection, actor)
        const [[current]] = await connection.execute("SELECT email,username, role, is_active FROM users WHERE id = ? AND role IN ('technician', 'manager') FOR UPDATE", [id])
        if (!current) throw new ApiError(404, 'المستخدم غير موجود.')
        if(input.email){
          const [[collision]]=await connection.execute('SELECT id FROM users WHERE id<>? AND (email=? OR username=?) LIMIT 1',[id,input.email,input.email])
          if(collision)throw new ApiError(409,'اسم المستخدم موجود بالفعل.')
          const username=input.email.includes('@')?(current.username===current.email?null:current.username):input.email
          await connection.execute('UPDATE users SET username=? WHERE id=?',[username,id])
        }
        await connection.execute(`UPDATE users SET ${entries.map(([key]) => `${mapping[key]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...entries.map(([, value]) => value), new Date(), id])
        if (input.isActive === false || (input.role && input.role !== current.role) || (input.email && input.email !== current.email)) await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [id])
        await connection.commit()
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
      return this.getById(id)
    },
    async setOwnAvailability(id, isAvailable) {
      const [result] = await pool.execute("UPDATE users SET is_available = ?, updated_at = ? WHERE id = ? AND role = 'technician' AND is_active = TRUE", [isAvailable, new Date(), id])
      if (!result.affectedRows) throw new ApiError(403, 'الطلب غير مسموح.')
      return { id, isAvailable }
    },
  }
}
