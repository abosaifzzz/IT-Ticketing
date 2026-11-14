import { randomUUID } from 'node:crypto'
import { hashPassword } from './passwords.js'
import {roles,requireStrongAdminPassword,strongAdminPassword} from '../administration/policy.js'

// Local provisioning is separate from the replaceable authentication provider.
export function createLocalAccountService(users) {
  return {
    async create({ email, fullName, role, password }) {
      email = typeof email === 'string' ? email.trim().toLowerCase() : ''
      fullName = typeof fullName === 'string' ? fullName.trim() : ''
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        fullName.length < 2 || fullName.length > 160 ||
        !roles.includes(role)) {
        throw new Error('Invalid email, full name or role')
      }
      if(role==='admin')requireStrongAdminPassword(password)
      const passwordHash = await hashPassword(password)
      const id = randomUUID()
      await users.createLocal({ id, email, fullName, role, passwordHash })
      return { id, email, fullName, role }
    },
    async replacePassword(identifier, password) {
      if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254) throw new Error('Invalid account identifier')
      const user=await users.findByEmail(identifier.trim().toLowerCase())
      if(user?.role==='admin')requireStrongAdminPassword(password)
      return users.replaceLocalPassword(identifier.trim().toLowerCase(), await hashPassword(password),{adminStrongVerified:strongAdminPassword(password)})
    },
  }
}
