export function createMySqlSessionRepository(pool) {
  return {
    async create({ tokenHash, userId, expiresAt, authenticatedUser }) {
      // Recheck local credentials under the same account lock used by password
      // replacement/deactivation, so a concurrent reset cannot mint a stale session.
      // A borrowed connection supports the setup script's enclosing transaction.
      const owned = typeof pool.getConnection === 'function'
      const connection = owned ? await pool.getConnection() : pool
      try {
        if (owned) await connection.beginTransaction()
        const [[current]] = await connection.execute('SELECT email, role, is_active, auth_provider, password_hash FROM users WHERE id = ? FOR UPDATE', [userId])
        if (!current?.is_active || (authenticatedUser && (current.email !== authenticatedUser.email || current.role !== authenticatedUser.role || current.auth_provider !== authenticatedUser.auth_provider ||
          (current.auth_provider === 'local' && current.password_hash !== authenticatedUser.password_hash)))) {
          if (owned) await connection.rollback()
          return false
        }
        await connection.execute('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [tokenHash, userId, new Date(), expiresAt])
        await connection.execute('UPDATE users SET last_login_at=? WHERE id=?',[new Date(),userId])
        if (owned) await connection.commit()
        return true
      } catch (error) { if (owned) await connection.rollback(); throw error }
      finally { if (owned) connection.release() }
    },
    async findUserByTokenHash(tokenHash) {
      const [rows] = await pool.execute(
        `SELECT u.id, u.email, u.full_name, u.role, u.is_active,u.admin_password_verified, s.expires_at,s.created_at AS session_created_at
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? LIMIT 1`,
        [tokenHash],
      )
      return rows[0] ?? null
    },
    async delete(tokenHash) {
      await pool.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [tokenHash])
    },
    async deleteForUser(userId) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId])
        await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [userId])
        await connection.commit()
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
  }
}
