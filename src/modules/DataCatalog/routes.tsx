import { Fragment, lazy } from 'react'
import { Navigate, Outlet, Route, useLocation } from 'react-router-dom'
import { RequireAuth } from '../../components/protected-route'
import { appendEmbedToPath, readEmbedMode } from '../../lib/embed-mode'
import { EmbedAwareNavigate } from '../../lib/embed-aware-navigate'
import { getProductFallbackPath, isProductPathEnabled, resolveProductSolution } from '../../lib/product-modules'
import { PORTAL_APP_MODULES } from '../registry'

const LoginPage = lazy(async () => ({ default: (await import('../../pages/login-page')).LoginPage }))
const PersonalCenterPage = lazy(async () => ({ default: (await import('../../pages/personal-center-page')).PersonalCenterPage }))

function ProductModuleGate() {
  const location = useLocation()
  const solution = resolveProductSolution(location.search)
  const isEmbedMode = readEmbedMode(location.search)

  if (!isProductPathEnabled(location.pathname, solution.moduleIds)) {
    return <Navigate to={appendEmbedToPath(getProductFallbackPath(solution.moduleIds), isEmbedMode)} replace />
  }

  return <Outlet />
}

export function DataCatalogRoutes() {
  return (
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/home-preview" element={<EmbedAwareNavigate to="/security-governance" />} />
      <Route path="/home-preview01" element={<EmbedAwareNavigate to="/security-governance" />} />
      <Route path="/home-preview02" element={<EmbedAwareNavigate to="/security-governance" />} />
      <Route path="/home-preview03" element={<EmbedAwareNavigate to="/security-governance" />} />
      <Route element={<RequireAuth />}>
          <Route element={<ProductModuleGate />}>
            <Route index element={<EmbedAwareNavigate to="/security-governance" />} />
          {PORTAL_APP_MODULES.map((module) => (
            <Fragment key={module.manifest.id}>{module.Routes()}</Fragment>
          ))}
          <Route path="/personal-center" element={<PersonalCenterPage />} />
        </Route>
      </Route>
    </>
  )
}
