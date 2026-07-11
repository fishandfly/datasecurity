import { encodeKnowledgeDocumentId, type KnowledgeDocumentManifestItem, type KnowledgeDocumentSearchItem } from './knowledgebase-api'
import type { CatalogItem } from './nocobase-portal-data'

export type CatalogClaimCartItem = {
  resourceId: string
  linkedResourceId: string
  detailPath: string
  resourceCode: string
  resourceName: string
  category: string
  department: string
  updateCycle: string
  description: string
}

export type DemandPageClaimCartPrefillRow = {
  claimCartItemId: string
  linkedResourceId?: string
  resourceName: string
  title: string
  description: string
  useCase?: string
}

const LS_CATALOG_CLAIM_CART = 'eco_catalog_claim_cart_v1'

function normalizeClaimCartText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCatalogClaimCartItem(value: unknown): CatalogClaimCartItem | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Partial<CatalogClaimCartItem> & Record<string, unknown>
  const resourceId = normalizeClaimCartText(raw.resourceId)
  const resourceName = normalizeClaimCartText(raw.resourceName)

  if (!resourceId || !resourceName) {
    return null
  }

  return {
    resourceId,
    linkedResourceId: normalizeClaimCartText(raw.linkedResourceId),
    detailPath: normalizeClaimCartText(raw.detailPath),
    resourceCode: normalizeClaimCartText(raw.resourceCode),
    resourceName,
    category: normalizeClaimCartText(raw.category),
    department: normalizeClaimCartText(raw.department),
    updateCycle: normalizeClaimCartText(raw.updateCycle),
    description: normalizeClaimCartText(raw.description),
  }
}

function normalizeCatalogClaimCartItems(items: unknown[]): CatalogClaimCartItem[] {
  const deduplicated = new Map<string, CatalogClaimCartItem>()

  items.forEach((item) => {
    const normalized = normalizeCatalogClaimCartItem(item)
    if (!normalized) return
    deduplicated.set(normalized.resourceId, normalized)
  })

  return Array.from(deduplicated.values())
}

function writeCatalogClaimCart(items: CatalogClaimCartItem[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(LS_CATALOG_CLAIM_CART, JSON.stringify(items))
}

export function readCatalogClaimCart(): CatalogClaimCartItem[] {
  if (typeof localStorage === 'undefined') return []

  try {
    const raw = localStorage.getItem(LS_CATALOG_CLAIM_CART)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? normalizeCatalogClaimCartItems(parsed) : []
  } catch {
    return []
  }
}

export function buildCatalogClaimCartItem(
  resource: Pick<CatalogItem, 'id' | 'code' | 'name' | 'category' | 'department' | 'updateCycle' | 'summary' | 'description'>,
): CatalogClaimCartItem {
  return {
    resourceId: resource.id,
    linkedResourceId: resource.id,
    detailPath: `/catalog/${resource.id}`,
    resourceCode: normalizeClaimCartText(resource.code),
    resourceName: normalizeClaimCartText(resource.name),
    category: normalizeClaimCartText(resource.category),
    department: normalizeClaimCartText(resource.department),
    updateCycle: normalizeClaimCartText(resource.updateCycle),
    description: normalizeClaimCartText(resource.summary || resource.description),
  }
}

export function buildKnowledgeDocumentClaimCartId(relativePath: string) {
  return `knowledge:${normalizeClaimCartText(relativePath)}`
}

export function buildKnowledgeDocumentClaimCartItem(
  item: KnowledgeDocumentManifestItem | KnowledgeDocumentSearchItem,
): CatalogClaimCartItem {
  const extension = normalizeClaimCartText(item.extension).toUpperCase()
  const year = normalizeClaimCartText(item.year)
  const knowledgeTypeName = normalizeClaimCartText(item.knowledgeTypeName)
  const sourceName = normalizeClaimCartText(item.sourceName)

  return {
    resourceId: buildKnowledgeDocumentClaimCartId(item.relativePath),
    linkedResourceId: '',
    detailPath: `/documents/${encodeKnowledgeDocumentId(item.relativePath)}`,
    resourceCode: normalizeClaimCartText(item.knowledgeTypeCode) || extension,
    resourceName: normalizeClaimCartText(item.title),
    category: normalizeClaimCartText(item.rootCategory),
    department: knowledgeTypeName || sourceName,
    updateCycle: year,
    description: normalizeClaimCartText(item.excerpt) || `${item.categoryPathLabel} · ${year || '未标注年份'} · ${extension || '文档'}`,
  }
}

export function addCatalogClaimCartItem(item: CatalogClaimCartItem): CatalogClaimCartItem[] {
  const nextItems = normalizeCatalogClaimCartItems([...readCatalogClaimCart(), item])
  writeCatalogClaimCart(nextItems)
  return nextItems
}

export function removeCatalogClaimCartItem(resourceId: string): CatalogClaimCartItem[] {
  const normalizedResourceId = normalizeClaimCartText(resourceId)
  const nextItems = readCatalogClaimCart().filter((item) => item.resourceId !== normalizedResourceId)
  writeCatalogClaimCart(nextItems)
  return nextItems
}

export function removeCatalogClaimCartItems(resourceIds: string[]): CatalogClaimCartItem[] {
  const excludedIds = new Set(resourceIds.map((item) => normalizeClaimCartText(item)).filter(Boolean))
  if (excludedIds.size === 0) {
    return readCatalogClaimCart()
  }

  const nextItems = readCatalogClaimCart().filter((item) => !excludedIds.has(item.resourceId))
  writeCatalogClaimCart(nextItems)
  return nextItems
}

export function clearCatalogClaimCart() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(LS_CATALOG_CLAIM_CART)
}

export function buildDemandPagePrefillRowsFromClaimCart(items: CatalogClaimCartItem[]): DemandPageClaimCartPrefillRow[] {
  return items.map((item) => ({
    claimCartItemId: item.resourceId,
    linkedResourceId: item.linkedResourceId || undefined,
    resourceName: item.resourceName,
    title: item.resourceName,
    description: item.description,
  }))
}
