import { Navigate, useLocation } from 'react-router-dom'
import { appendEmbedToPath, readEmbedMode } from './embed-mode'

export function EmbedAwareNavigate({ to }: { to: string }) {
  const location = useLocation()
  const isEmbedMode = readEmbedMode(location.search)
  return <Navigate to={appendEmbedToPath(to, isEmbedMode)} replace />
}
