import { Navigate } from 'react-router-dom'
import { requiresAccountSetup, ROLE_DESTINATIONS } from '../../services/auth/roles'
import { useAuth } from './useAuth'
import { SessionStatus } from './SessionStatus'
export function HomeRedirect() {
  const { status, isAuthenticated, user } = useAuth()
  if (status === 'loading' || status === 'error') return <SessionStatus />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (requiresAccountSetup(user)) return <Navigate to="/setup" replace />
  return <Navigate to={ROLE_DESTINATIONS[user.role] ?? '/unauthorized'} replace />
}
