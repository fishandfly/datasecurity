import { lazy } from 'react'
import { Route } from 'react-router-dom'

const ServiceCatalogPage = lazy(async () => ({ default: (await import('../../pages/service-catalog-page')).ServiceCatalogPage }))

export function SharingGovernanceRoutes() {
  return (
    <>
      <Route path="/service-catalog" element={<ServiceCatalogPage />} />
    </>
  )
}
