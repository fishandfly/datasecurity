export type CatalogResourceTypeFilterId = 'data-resource' | 'spatial-resource' | 'data-source' | 'data-api'

export type CatalogResourceTypeQueryId = CatalogResourceTypeFilterId | 'service' | ''

type CatalogResourceTypeLike = {
  serviceTypeId: string
  serviceType: string
  mapPreview?: unknown
}

type CatalogResourceTypeOption = {
  id: '' | CatalogResourceTypeFilterId
  label: string
  count: number
}

const DATA_RESOURCE_TYPE_ID = '33'
const DATA_SOURCE_TYPE_ID = '32'
const MAP_API_TYPE_ID = '35'
const DATA_API_TYPE_IDS = new Set(['34', '36', '37'])

const RESOURCE_TYPE_LABELS: Record<CatalogResourceTypeFilterId, string> = {
  'data-resource': '数据资源',
  'spatial-resource': '空间资源',
  'data-source': '数据源',
  'data-api': '数据API',
}

function normalizeLabel(label: string) {
  return label.replace(/\s+/g, '').trim()
}

function isMapApiLike(item: CatalogResourceTypeLike) {
  const serviceTypeId = item.serviceTypeId.trim()
  const label = normalizeLabel(item.serviceType)

  return (
    Boolean(item.mapPreview)
    || serviceTypeId === MAP_API_TYPE_ID
    || label === '空间服务API'
    || label === '地图API'
    || (label.includes('地图') && label.includes('API'))
    || (label.includes('空间') && label.includes('API'))
  )
}

function isDataSourceLike(item: CatalogResourceTypeLike) {
  const serviceTypeId = item.serviceTypeId.trim()
  const label = normalizeLabel(item.serviceType)

  return serviceTypeId === DATA_SOURCE_TYPE_ID || label === '数据源' || label === '数据来源'
}

export function getCatalogResourceTypeFilterId(item: CatalogResourceTypeLike): CatalogResourceTypeFilterId | null {
  const serviceTypeId = item.serviceTypeId.trim()
  const label = normalizeLabel(item.serviceType)

  if (isDataSourceLike(item)) {
    return 'data-source'
  }

  if (serviceTypeId === DATA_RESOURCE_TYPE_ID || label === '数据资源') {
    return 'data-resource'
  }

  if (isMapApiLike(item)) {
    return 'spatial-resource'
  }

  if (
    DATA_API_TYPE_IDS.has(serviceTypeId)
    || label === '数据API'
    || label === '数据服务API'
    || label === '文件服务API'
    || label === '基础服务API'
    || (label.includes('API') && !label.includes('地图') && !label.includes('空间'))
  ) {
    return 'data-api'
  }

  return null
}

export function isCatalogResourceTypeMatch(item: CatalogResourceTypeLike, activeResourceTypeId: CatalogResourceTypeQueryId) {
  const resourceTypeId = getCatalogResourceTypeFilterId(item)

  if (activeResourceTypeId === 'service') {
    return resourceTypeId === 'data-api'
  }

  if (!activeResourceTypeId) {
    return resourceTypeId !== null
  }

  return resourceTypeId === activeResourceTypeId
}

export function filterCatalogItemsByResourceType<T extends CatalogResourceTypeLike>(
  items: T[],
  activeResourceTypeId: CatalogResourceTypeQueryId,
) {
  return items.filter((item) => isCatalogResourceTypeMatch(item, activeResourceTypeId))
}

export function buildCatalogResourceTypeOptions<T extends CatalogResourceTypeLike>(items: T[]): CatalogResourceTypeOption[] {
  const counts: Record<CatalogResourceTypeFilterId, number> = {
    'data-resource': 0,
    'spatial-resource': 0,
    'data-source': 0,
    'data-api': 0,
  }

  items.forEach((item) => {
    const resourceTypeId = getCatalogResourceTypeFilterId(item)
    if (!resourceTypeId) return
    counts[resourceTypeId] += 1
  })

  return [
    { id: '', label: '全部', count: counts['data-resource'] + counts['spatial-resource'] + counts['data-source'] + counts['data-api'] },
    { id: 'data-resource', label: RESOURCE_TYPE_LABELS['data-resource'], count: counts['data-resource'] },
    { id: 'spatial-resource', label: RESOURCE_TYPE_LABELS['spatial-resource'], count: counts['spatial-resource'] },
    { id: 'data-api', label: RESOURCE_TYPE_LABELS['data-api'], count: counts['data-api'] },
    { id: 'data-source', label: RESOURCE_TYPE_LABELS['data-source'], count: counts['data-source'] },
  ]
}

export function getCatalogResourceTypeLabel(activeResourceTypeId: CatalogResourceTypeQueryId) {
  if (activeResourceTypeId === 'service') {
    return '全部 API'
  }

  if (!activeResourceTypeId) {
    return '全部'
  }

  return RESOURCE_TYPE_LABELS[activeResourceTypeId]
}

export function resolveCatalogResourceTypeQueryId(resourceType: string, legacyView: string): CatalogResourceTypeQueryId {
  const normalizedResourceType = resourceType.trim()

  if (
    normalizedResourceType === 'data-resource'
    || normalizedResourceType === 'spatial-resource'
    || normalizedResourceType === 'data-source'
    || normalizedResourceType === 'data-api'
  ) {
    return normalizedResourceType
  }

  if (normalizedResourceType === 'map-api') {
    return 'spatial-resource'
  }

  if (legacyView.trim() === 'data-source') {
    return 'data-source'
  }

  if (legacyView.trim() === 'service') {
    return 'service'
  }

  return ''
}
