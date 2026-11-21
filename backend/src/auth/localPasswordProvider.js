import { hashPassword, verifyPassword } from './passwords.js'
import {strongAdminPassword,requireStrongAdminPassword} from '../administration/policy.js'
import {ApiError} from '../management/validation.js'

// The provider is replaceable by a future external identity API implementation.
export async function createLocalPasswordProvider(users) {
  const dummyHash = await hashPassword('not-a-real-account-password')

  return {
    async changePassword({identifier,currentPassword,newPassword,profile}) {
      const user=await this.authenticate({email:identifier,password:currentPassword})
      if(!user)throw new ApiError(401,'Current password is incorrect')
      if(newPassword===currentPassword||newPassword==='123')throw new ApiError(400,'Choose a different password')
      if(user.role==='admin')requireStrongAdminPassword(newPassword)
      await users.changeOwnPassword(user.id,user.password_hash,await hashPassword(newPassword),{adminStrongVerified:strongAdminPassword(newPassword),profile})
    },
    async authenticate({ email, password }) {
      const user = await users.findByEmail(email)
      const valid = await verifyPassword(user?.auth_provider === 'local' && user.password_hash ? user.password_hash : dummyHash, password)
      if (!valid || !user?.is_active || user.auth_provider !== 'local') return null
      if (user.role==='admin'&&(!user.admin_password_verified||!strongAdminPassword(password)))return null
      return user
    },
  }
}
