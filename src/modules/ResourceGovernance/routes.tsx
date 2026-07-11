import { lazy } from 'react'
import { Route } from 'react-router-dom'

const CatalogPage = lazy(async () => ({ default: (await import('../../pages/catalog-page')).CatalogPage }))
const DataSourceCatalogPage = lazy(async () => ({ default: (await import('../../pages/data-source-catalog-page')).DataSourceCatalogPage }))
const DetailPage = lazy(async () => ({ default: (await import('../../pages/detail-page')).DetailPage }))
const DocumentsCatalogPage = lazy(async () => ({ default: (await import('../../pages/documents-catalog-page')).DocumentsCatalogPage }))
const GlobalSearchPage = lazy(async () => ({ default: (await import('../../pages/global-search-page')).GlobalSearchPage }))
const KnowledgeDocumentDetailPage = lazy(async () => ({ default: (await import('../../pages/knowledge-document-detail-page')).KnowledgeDocumentDetailPage }))
const LineageNodePopupPage = lazy(async () => ({ default: (await import('../../pages/lineage-node-popup-page')).LineageNodePopupPage }))

export function ResourceGovernanceRoutes() {
  return (
    <>
      <Route path="/documents/:id" element={<KnowledgeDocumentDetailPage />} />
      <Route path="/documents" element={<DocumentsCatalogPage />} />
      <Route path="/catalog" element={<CatalogPage />} />
      <Route path="/data-source-catalog" element={<DataSourceCatalogPage />} />
      <Route path="/catalog/:id" element={<DetailPage />} />
      <Route path="/search" element={<GlobalSearchPage />} />
      <Route path="/lineage-node-popup" element={<LineageNodePopupPage />} />
    </>
  )
}
