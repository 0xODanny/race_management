import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import type { UserRole } from './auth'

export function RequireRole(props: { allow: UserRole[] }) {
  const auth = useAuth()
  if (auth.loading) return <div className="p-6">Loading…</div>
  if (!auth.user) return <Navigate to="/login" replace />
  if (!auth.role || !props.allow.includes(auth.role)) return <Navigate to="/" replace />
  return <Outlet />
}
