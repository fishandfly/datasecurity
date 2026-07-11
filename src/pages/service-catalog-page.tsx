import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { CatalogPage } from './catalog-page'

export function ServiceCatalogPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const requestedTab = (searchParams.get('tab') ?? '').trim()
  const isEmbedMode = readEmbedMode(location.search)

  if (requestedTab === 'application') {
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'application')
    return <Navigate to={appendEmbedToPath(`/demand?${next.toString()}`, isEmbedMode)} replace />
  }

  return <CatalogPage forceView="service" />
}
