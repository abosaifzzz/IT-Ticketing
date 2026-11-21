import { HttpError } from '../http/client.js'
import { ROLE_DESTINATIONS } from './roles.js'

function toSession(data) {
  const user = data?.user
  if (!user || !Object.hasOwn(ROLE_DESTINATIONS, user.role) || ['id', 'username', 'name', 'roleLabel'].some((field) => typeof user[field] !== 'string' || !user[field])) throw new HttpError('بيانات الجلسة غير صالحة.', { code: 'response' })
  // Explicit allowlist: never retain unexpected token/password response fields.
  return { provider: 'api', role: user.role, user: { id: user.id, username: user.username, name: user.name, role: user.role, roleLabel: user.roleLabel, mustChangePassword: user.mustChangePassword === true, mustCompleteProfile: user.mustCompleteProfile === true } }
}
export function createApiAuthProvider(client) {
  return {
    async login({ username, password }) {
      const identifier = username.trim()
      return toSession(await client.request('/auth/login', { method: 'POST', body: { [identifier.includes('@') ? 'email' : 'username']: identifier, password }, anonymous: true }))
    },
    async restoreSession() {
      try { return toSession(await client.request('/auth/me', { anonymous: true })) }
      catch (error) { if (error.status === 401) return null; throw error }
    },
    async logout() {
      // A missing/expired session is already logged out; network failure is not.
      try { await client.request('/auth/logout', { method: 'POST' }) }
      catch (error) { if (error.status !== 401) throw error }
    },
  }
}
