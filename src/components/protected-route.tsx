import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { usePortalContext } from '../lib/portal-context'

export function RequireAuth() {
  const location = useLocation()
  const { authRequired, isAuthenticated, isBootstrapping } = usePortalContext()

  if (isBootstrapping) {
    return <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在建立访问会话...</div>
  }

  if (authRequired && !isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ redirectTo: `${location.pathname}${location.search}` }}
      />
    )
  }

  return <Outlet />
}
