import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { PageLoader } from '../components/form'

// Pages that need a login send visitors to /login and back again afterwards
export function RequireAuth({ children, role, admin = false }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <PageLoader />
  if (!user) return <Navigate to={admin ? '/admin/login' : `/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (admin && !user.isAdmin) return <Navigate to="/" replace />
  if (!admin && user.isAdmin && !location.pathname.startsWith('/admin')) return <Navigate to="/admin" replace />
  if (role && !user.roles.some((r) => [].concat(role).includes(r))) return <Navigate to="/me" replace />
  return children
}
