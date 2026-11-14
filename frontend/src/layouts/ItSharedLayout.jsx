import { AppLayout } from './AppLayout'
import { portalRoutes } from '../app/routeConfig'
import { useAuth } from '../features/auth/useAuth'

export function ItSharedLayout() {
  const { user } = useAuth()
  const portal = portalRoutes.find((item) => item.role === user.role)
  return <AppLayout portal={portal} />
}
