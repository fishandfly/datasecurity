import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
import { CockpitLayout } from './layout'

const CockpitPage = lazy(async () => ({ default: (await import('./pages/cockpit-page')).CockpitPage }))

export function CockpitRoutes() {
  return (
    <>
      <Route path="/cockpit" element={<CockpitLayout />}>
        <Route index element={<CockpitPage />} />
      </Route>
      <Route path="/dashboard" element={<Navigate to="/cockpit" replace />} />
    </>
  )
}
