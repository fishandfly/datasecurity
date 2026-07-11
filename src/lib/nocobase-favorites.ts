import { nocobaseClient, toErrorMessage } from './nocobase-client'

export const FAVORITES_RESOURCE_NAME = 'favorites'
export const FAVORITE_RESOURCE_COLLECTION_NAME = 'eco_data_resources'
export const FAVORITE_RESOURCE_DATA_SOURCE_KEY = 'main'

export type FavoriteIdentity = {
  dataSourceKey: string
  collectionName: string
  recordPk: string
  detailUrl?: string
}

export type FavoriteItem = {
  id: string
  userId: number
  dataSourceKey: string
  collectionName: string
  recordPk: string
  recordTitle: string
  titleField: string
  detailUrl: string
  createdAt: string
  updatedAt: string
}

export type FavoriteStatusResult = {
  isFavorited: boolean
  item: FavoriteItem | null
}

export type FavoriteToggleResult = FavoriteStatusResult & {
  action?: 'created' | 'destroyed'
}

export type FavoriteResolveResult = {
  status: string
  message?: string
  url?: string
  openMode?: string
}

export type FavoriteResourceCatalogSource = {
  id: string
  name: string
  summary: string
  department: string
  businessCategoryPath: string
  category: string
  updateTime: string
}

export type FavoriteResourceSummary = {
  favoriteId: string
  resourceId: string
  name: string
  summary: string
  department: string
  businessCategory: string
  updateTime: string
  detailUrl: string
  favoritedAt: string
  missing: boolean
}

type FavoriteListMinePayload = {
  items?: unknown[]
}

type FavoriteStatusPayload = {
  isFavorited?: boolean
  item?: unknown
  action?: 'created' | 'destroyed'
}

type FavoriteResolvePayload = {
  status?: string
  message?: string
  url?: string
  openMode?: string
}

type NocoDataWrapper<T> = {
  data?: T
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeFavoriteItem(value: unknown): FavoriteItem | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Record<string, unknown>
  const recordPk = normalizeString(candidate.recordPk)
  const collectionName = normalizeString(candidate.collectionName)

  if (!recordPk || !collectionName) return null

  return {
    id: normalizeString(candidate.id) || `${collectionName}:${recordPk}`,
    userId: normalizeNumber(candidate.userId),
    dataSourceKey: normalizeString(candidate.dataSourceKey) || FAVORITE_RESOURCE_DATA_SOURCE_KEY,
    collectionName,
    recordPk,
    recordTitle: normalizeString(candidate.recordTitle),
    titleField: normalizeString(candidate.titleField),
    detailUrl: normalizeString(candidate.detailUrl),
    createdAt: normalizeString(candidate.createdAt),
    updatedAt: normalizeString(candidate.updatedAt),
  }
}

function sortByCreatedAtDesc(items: FavoriteItem[]) {
  return [...items].sort((left, right) => {
    const rightTime = Date.parse(right.createdAt)
    const leftTime = Date.parse(left.createdAt)

    if (Number.isFinite(rightTime) && Number.isFinite(leftTime) && rightTime !== leftTime) {
      return rightTime - leftTime
    }

    return right.createdAt.localeCompare(left.createdAt, 'zh-CN')
  })
}

export function extractNocoDataPayload<T>(value: unknown) {
  if (!value || typeof value !== 'object') return null

  const candidate = value as T & NocoDataWrapper<T>
  if (candidate.data && typeof candidate.data === 'object') {
    return candidate.data
  }

  return candidate as T
}

export function buildResourceFavoriteIdentity(resourceId: string, detailUrl?: string): FavoriteIdentity {
  return {
    dataSourceKey: FAVORITE_RESOURCE_DATA_SOURCE_KEY,
    collectionName: FAVORITE_RESOURCE_COLLECTION_NAME,
    recordPk: String(resourceId).trim(),
    ...(detailUrl ? { detailUrl } : {}),
  }
}

export function buildFavoriteResourceIdSet(items: FavoriteItem[]) {
  return new Set(
    items
      .filter((item) => item.collectionName === FAVORITE_RESOURCE_COLLECTION_NAME)
      .map((item) => item.recordPk),
  )
}

export function buildFavoriteResourceSummaries(
  favorites: FavoriteItem[],
  catalogItems: FavoriteResourceCatalogSource[],
): FavoriteResourceSummary[] {
  const catalogMap = new Map(catalogItems.map((item) => [item.id, item] as const))

  return sortByCreatedAtDesc(favorites)
    .filter((item) => item.collectionName === FAVORITE_RESOURCE_COLLECTION_NAME)
    .map((item) => {
      const catalogItem = catalogMap.get(item.recordPk)
      const portalDetailUrl = `/catalog/${item.recordPk}`

      if (catalogItem) {
        return {
          favoriteId: item.id,
          resourceId: item.recordPk,
          name: catalogItem.name,
          summary: catalogItem.summary,
          department: catalogItem.department,
          businessCategory: catalogItem.businessCategoryPath || catalogItem.category || '未标注',
          updateTime: catalogItem.updateTime,
          detailUrl: portalDetailUrl,
          favoritedAt: item.createdAt,
          missing: false,
        } satisfies FavoriteResourceSummary
      }

      return {
        favoriteId: item.id,
        resourceId: item.recordPk,
        name: item.recordTitle || item.recordPk,
        summary: '该资源当前未在目录缓存中命中，仍保留收藏记录。',
        department: '收藏记录',
        businessCategory: '未标注',
        updateTime: '',
        detailUrl: item.detailUrl || portalDetailUrl,
        favoritedAt: item.createdAt,
        missing: true,
      } satisfies FavoriteResourceSummary
    })
}

export async function fetchFavoriteListMine() {
  if (!nocobaseClient.auth.token) {
    return [] as FavoriteItem[]
  }

  try {
    const response = await nocobaseClient.resource(FAVORITES_RESOURCE_NAME).listMine()
    const payload = extractNocoDataPayload<FavoriteListMinePayload>(response.data)

    return (payload?.items ?? [])
      .map((item) => normalizeFavoriteItem(item))
      .filter((item): item is FavoriteItem => Boolean(item))
  } catch (error) {
    throw new Error(toErrorMessage(error, '我的收藏加载失败'))
  }
}

export async function fetchFavoriteStatus(identity: FavoriteIdentity) {
  try {
    const response = await nocobaseClient.resource(FAVORITES_RESOURCE_NAME).status({ values: identity })
    const payload = extractNocoDataPayload<FavoriteStatusPayload>(response.data)

    return {
      isFavorited: Boolean(payload?.isFavorited),
      item: normalizeFavoriteItem(payload?.item) ?? null,
    } satisfies FavoriteStatusResult
  } catch (error) {
    throw new Error(toErrorMessage(error, '收藏状态加载失败'))
  }
}

export async function toggleFavorite(identity: FavoriteIdentity) {
  try {
    const response = await nocobaseClient.resource(FAVORITES_RESOURCE_NAME).toggle({ values: identity })
    const payload = extractNocoDataPayload<FavoriteStatusPayload>(response.data)

    return {
      action: payload?.action,
      isFavorited: Boolean(payload?.isFavorited),
      item: normalizeFavoriteItem(payload?.item) ?? null,
    } satisfies FavoriteToggleResult
  } catch (error) {
    throw new Error(toErrorMessage(error, '收藏操作失败'))
  }
}

export async function removeFavorite(identity: FavoriteIdentity) {
  try {
    const response = await nocobaseClient.resource(FAVORITES_RESOURCE_NAME).destroy({ values: identity })
    const payload = extractNocoDataPayload<FavoriteStatusPayload>(response.data)

    return {
      isFavorited: Boolean(payload?.isFavorited),
      item: normalizeFavoriteItem(payload?.item) ?? null,
    } satisfies FavoriteStatusResult
  } catch (error) {
    throw new Error(toErrorMessage(error, '取消收藏失败'))
  }
}

export async function resolveFavorite(identity: FavoriteIdentity) {
  try {
    const response = await nocobaseClient.resource(FAVORITES_RESOURCE_NAME).resolve({ values: identity })
    const payload = extractNocoDataPayload<FavoriteResolvePayload>(response.data)

    return {
      status: normalizeString(payload?.status) || 'route_resolve_failed',
      message: normalizeString(payload?.message),
      url: normalizeString(payload?.url),
      openMode: normalizeString(payload?.openMode),
    } satisfies FavoriteResolveResult
  } catch (error) {
    throw new Error(toErrorMessage(error, '收藏跳转地址解析失败'))
  }
}
