import { ApiError } from '../management/validation.js'

export function createMySqlUserRepository(pool) {
  return {
    async findByEmail(email) {
      const [rows] = await pool.execute(
        'SELECT id, email, full_name, role, auth_provider, password_hash, is_active,admin_password_verified FROM users WHERE email = ? LIMIT 1',
        [email],
      )
      return rows[0] ?? null
    },
    async createLocal({ id, email, fullName, role, passwordHash }) {
      const now = new Date()
      await pool.execute(
        'INSERT INTO users (id, email, full_name, role, auth_provider, password_hash, is_active, created_at, updated_at,admin_password_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,?)',
        [id, email, fullName, role, 'local', passwordHash, true, now, now,role==='admin'],
      )
    },
    async replaceLocalPassword(identifier, passwordHash,{adminStrongVerified=false}={}) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [[user]] = await connection.execute('SELECT id, auth_provider,role FROM users WHERE email = ? FOR UPDATE', [identifier])
        if (!user || user.auth_provider !== 'local') throw new ApiError(404, 'الحساب المحلي غير موجود.')
        if(user.role==='admin'&&!adminStrongVerified)throw new ApiError(400,'A strong administrator password is required')
        await connection.execute('UPDATE users SET password_hash = ?, updated_at = ?,admin_password_verified=? WHERE id = ?', [passwordHash, new Date(),user.role==='admin'&&adminStrongVerified, user.id])
        await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [user.id])
        await connection.commit()
        return { id: user.id }
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
  }
}
