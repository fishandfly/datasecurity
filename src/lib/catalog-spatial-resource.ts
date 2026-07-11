import type { CatalogMapPreview, CatalogMapPreviewLayerKind } from './nocobase-portal-data'

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumberLike(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  const normalized = normalizeText(value)
  return normalized || ''
}

export function getSpatialLayerKindLabel(layerKind: CatalogMapPreviewLayerKind) {
  switch (layerKind) {
    case 'tile':
      return '瓦片图层'
    case 'map-image':
      return '动态图层'
    case 'feature':
      return '要素图层'
    case 'scene':
      return '三维场景'
    case 'amap':
      return '高德地图'
    default:
      return layerKind
  }
}

export function getSpatialAuthModeLabel(authMode: string) {
  const normalized = authMode.trim().toLowerCase()
  if (!normalized || normalized === 'anonymous') return '匿名访问'
  if (normalized === 'token') return 'Token 鉴权'
  if (normalized === 'oauth2') return 'OAuth 2.0'
  if (normalized === 'apikey' || normalized === 'api-key') return 'API Key'
  return authMode.trim() || '未标注'
}

export function getSpatialCacheModeLabel(isCached: boolean) {
  return isCached ? '缓存服务' : '实时服务'
}

export function getSpatialReferenceLabel(spatialReference: CatalogMapPreview['spatialReference']) {
  if (!spatialReference) return '未标注'

  const wkid = readNumberLike(spatialReference.wkid ?? spatialReference.latestWkid)
  if (wkid === '4490') return 'CGCS2000 / 4490'
  if (wkid === '4326') return 'WGS84 / 4326'
  if (wkid === '3857' || wkid === '102100') return 'WebMercator / 3857'
  if (wkid) return `WKID ${wkid}`

  const wkt = normalizeText(spatialReference.wkt ?? spatialReference.latestWkt ?? spatialReference.wellKnownText)
  if (!wkt) return '未标注'

  if (/CGCS ?2000/i.test(wkt)) return 'CGCS2000'
  if (/WGS ?84/i.test(wkt)) return 'WGS84'
  if (/Mercator/i.test(wkt)) return 'WebMercator'

  return wkt.length > 28 ? `${wkt.slice(0, 28)}...` : wkt
}
