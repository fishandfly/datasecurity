import { lazy } from 'react'
import { Route } from 'react-router-dom'

const DemandCatalogPage = lazy(async () => ({ default: (await import('../../pages/demand-catalog-page')).DemandCatalogPage }))
const DemandDetailPage = lazy(async () => ({ default: (await import('../../pages/demand-detail-page')).DemandDetailPage }))
const DemandPage = lazy(async () => ({ default: (await import('../../pages/demand-page')).DemandPage }))
const DemandApplicationDetailPage = lazy(async () => ({ default: (await import('../../pages/demand-application-detail-page')).DemandApplicationDetailPage }))
const SupplyDemandDetailPage = lazy(async () => ({ default: (await import('../../pages/supply-demand-detail-page')).SupplyDemandDetailPage }))

export function ApplicationGovernanceRoutes() {
  return (
    <>
      <Route path="/demand-catalog" element={<DemandCatalogPage />} />
      <Route path="/demand-catalog/:id" element={<DemandDetailPage />} />
      <Route path="/demand" element={<DemandPage />} />
      <Route path="/demand/applications/:id" element={<DemandApplicationDetailPage />} />
      <Route path="/demand/:id" element={<SupplyDemandDetailPage />} />
    </>
  )
}
