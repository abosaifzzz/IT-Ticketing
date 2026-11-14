export const ROLE_DESTINATIONS = Object.freeze({ employee: '/employee', technician: '/technician', manager: '/manager', admin: '/admin' })
export function routeAccess({ status, user, allowedRoles }) {
  if (status === 'loading') return 'loading'
  if (status === 'error') return 'error'
  if (!user || !Object.hasOwn(ROLE_DESTINATIONS, user.role)) return 'login'
  if (allowedRoles && !allowedRoles.includes(user.role)) return 'unauthorized'
  return 'allowed'
}
