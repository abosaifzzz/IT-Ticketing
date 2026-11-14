import { hashPassword, verifyPassword } from './passwords.js'
import {strongAdminPassword} from '../administration/policy.js'

// The provider is replaceable by a future external identity API implementation.
export async function createLocalPasswordProvider(users) {
  const dummyHash = await hashPassword('not-a-real-account-password')

  return {
    async authenticate({ email, password }) {
      const user = await users.findByEmail(email)
      const valid = await verifyPassword(user?.auth_provider === 'local' && user.password_hash ? user.password_hash : dummyHash, password)
      if (!valid || !user?.is_active || user.auth_provider !== 'local') return null
      if (user.role==='admin'&&(!user.admin_password_verified||!strongAdminPassword(password)))return null
      return user
    },
  }
}
