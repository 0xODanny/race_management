import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const auth = useAuth()
  const loc = useLocation()

  if (auth.loading) return <div className="p-6">Loading…</div>
  if (!auth.user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />

  return <Outlet />
}
