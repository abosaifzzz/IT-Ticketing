import { ApiError } from '../management/validation.js'

// Engineer is represented by the existing technician authentication role.
// Every current and future asset operation shares this policy.
export function requireAssetAccess(user) {
  if (!user || !['technician', 'manager'].includes(user.role)) {
    throw new ApiError(403, 'IT Assets access required')
  }
}
