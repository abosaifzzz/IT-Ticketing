import { createHash, randomBytes } from 'node:crypto'

const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const roleLabels = {
  employee: 'موظف',
  technician: 'مهندس تكنولوجيا المعلومات',
  manager: 'مدير تكنولوجيا المعلومات',
  admin: 'مسؤول النظام',
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function publicUser(user) {
  return { id: user.id, username: user.email, name: user.full_name, role: user.role, roleLabel: roleLabels[user.role] }
}

export function createAuthService({ provider, sessions,administrationPolicy }) {
  const policy=async()=> (await administrationPolicy?.())?.authentication??{adminSessionMinutes:30,recentAuthenticationMinutes:5}
  return {
    async login(credentials) {
      const user = await provider.authenticate(credentials)
      if (!user) return null
      const token = randomBytes(32).toString('base64url')
      const expiresAt = new Date(Date.now() + (user.role==='admin'?(await policy()).adminSessionMinutes*60000:SESSION_TTL_MS))
      const created = await sessions.create({ tokenHash: hashSessionToken(token), userId: user.id, expiresAt,
        authenticatedUser: user })
      if (created === false) return null
      return { token, user: publicUser(user), expiresAt }
    },
    async getUser(token) {
      return (await this.getSessionInfo(token))?.user??null
    },
    async getSessionInfo(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
      const tokenHash = hashSessionToken(token)
      const user = await sessions.findUserByTokenHash(tokenHash)
      if (!user) return null
      const expiresAt = new Date(user.expires_at).getTime()
      const adminPolicy=user.role==='admin'?await policy():null
      const authenticatedAt=new Date(user.session_created_at).getTime()
      if (!user.is_active || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || (adminPolicy&&(!user.admin_password_verified||!Number.isFinite(authenticatedAt)||authenticatedAt+adminPolicy.adminSessionMinutes*60000<=Date.now()))) {
        await sessions.delete(tokenHash)
        return null
      }
      return {user:publicUser(user),authenticatedAt,recentAuthenticationMinutes:adminPolicy?.recentAuthenticationMinutes??5,expiresAt:new Date(expiresAt)}
    },
    async reauthenticate(token,password) {
      const current=await this.getUser(token)
      if(current?.role!=='admin')return null
      const next=await this.login({email:current.username,password})
      if(!next)return null
      if(next.user.id!==current.id||next.user.role!=='admin'){await this.logout(next.token);return null}
      await this.logout(token)
      return next
    },
    async logout(token) {
      if (typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)) {
        await sessions.delete(hashSessionToken(token))
      }
    },
    async logoutAll(token) {
      const user = await this.getUser(token)
      if (!user) return false
      await sessions.deleteForUser(user.id)
      return true
    },
  }
}
