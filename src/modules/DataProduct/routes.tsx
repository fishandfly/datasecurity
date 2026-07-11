import { lazy } from 'react'
import { Route } from 'react-router-dom'

const DataProductListPage = lazy(async () => ({ default: (await import('../../pages/data-product-list-page')).DataProductListPage }))
const DataProductDetailPage = lazy(async () => ({ default: (await import('../../pages/data-product-detail-page')).DataProductDetailPage }))

export function DataProductRoutes() {
  return (
    <>
      <Route path="/data-products" element={<DataProductListPage />} />
      <Route path="/data-products/:id" element={<DataProductDetailPage />} />
    </>
  )
}
