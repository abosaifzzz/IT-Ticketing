import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import { requiresAccountSetup, routeAccess } from '../../services/auth/roles'
import { SessionStatus } from './SessionStatus'
import { ApiFeatureBoundary } from './ApiFeatureBoundary'

export function ProtectedRoute({ allowedRoles, children, apiReady = false }) {
  const auth = useAuth()
  const location = useLocation()
  const access = routeAccess({ ...auth, allowedRoles })
  if (access === 'loading' || access === 'error') return <SessionStatus />
  if (access === 'login') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (auth.mode === 'api' && requiresAccountSetup(auth.user)) return <Navigate to="/setup" replace />
  if (access === 'unauthorized') return <Navigate to="/unauthorized" replace />
  if (auth.mode === 'api' && allowedRoles && !apiReady) return <ApiFeatureBoundary />
  return children
}
