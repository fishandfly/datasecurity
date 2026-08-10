import { useEffect, useState } from 'react'
import { assertCanManageCatalogResources } from './admin-role'
import { mergeSupplyDemandSceneEntries } from './demand-scene-submission'
import { nocobaseClient, toErrorMessage } from './nocobase-client'
import { getAvailableCollectionNames } from './nocobase-collections'
import { loadAllPagesParallel } from './paginated-resource-loader'

const SUPPLY_DEMAND_COLLECTION_CANDIDATES = ['eco_supply_demand_infos'] as const
const SUPPLY_DEMAND_LIGHT_APPENDS = [
  'domain_category',
  'data_category',
  'data_frequency_demand',
  'data_source_unit',
  'data_supply_method',
  'list_source',
  'satisfaction_status',
  'data_sync_frequency',
  'external_data_category',
  'business_domain_categories',
] as const

const SUPPLY_DEMAND_FULL_APPENDS = [...SUPPLY_DEMAND_LIGHT_APPENDS, 'linked_data_resources'] as const
const SUPPLY_DEMAND_RELATED_APP_ASSOCIATION_CANDIDATES = ['related_apps', 'related_app'] as const
const SUPPLY_DEMAND_APPLICATION_APPENDS = [
  ...SUPPLY_DEMAND_FULL_APPENDS,
  ...SUPPLY_DEMAND_RELATED_APP_ASSOCIATION_CANDIDATES,
] as const
const LS_CACHE_SUPPLY_DEMAND_SUMMARY = 'eco_supply_demand_summary_v1'
const SUMMARY_CACHE_TTL_MINUTES = 180

type SupplyDemandFetchMode = 'light' | 'full' | 'applications'
type SupplyDemandRelatedAppAssociationName = typeof SUPPLY_DEMAND_RELATED_APP_ASSOCIATION_CANDIDATES[number]
type SupplyDemandAssociationName = 'linked_data_resources' | SupplyDemandRelatedAppAssociationName
type SupplyDemandAppends = readonly string[]

export type SupplyDemandPortalPageResult = {
  items: SupplyDemandInfo[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

type RawDictionaryRelation = {
  id?: number | string | null
  name?: string | null
  dictValueName?: string | null
  dict_value_name?: string | null
}

type RawCategoryRelation = {
  id?: number | string | null
  nodeName?: string | null
  node_name?: string | null
  name?: string | null
}

type RawLinkedResource = {
  id?: number | string | null
  resource_name?: string | null
  resourceName?: string | null
  name?: string | null
}

type RawRelatedApp = {
  id?: number | string | null
  name?: string | null
  tags?: unknown
  contact?: string | null
  description?: string | null
  domain_catagory_id?: number | string | null
  domain_catagory?: RawDictionaryRelation | RawCategoryRelation | null
  screenshot?: unknown
  screenshotUrl?: unknown
  cover?: unknown
  coverUrl?: unknown
  image?: unknown
  imageUrl?: unknown
  images?: unknown
  thumbnail?: unknown
  thumbnailUrl?: unknown
  app_screenshot?: unknown
  app_cover?: unknown
  app_image?: unknown
  attachment?: unknown
  attachments?: unknown
  file?: unknown
  files?: unknown
}

type RawRelationRecord = RawDictionaryRelation | RawCategoryRelation

type RawSupplyDemandInfoRecord = {
  id?: number | string | null
  createdById?: number | string | null
  created_by_id?: number | string | null
  createdBy?: {
    id?: number | string | null
  } | null
  updatedById?: number | string | null
  updated_by_id?: number | string | null
  updatedBy?: {
    id?: number | string | null
  } | null
  scene_name?: string | null
  required_data_resource_name?: string | null
  main_data_items?: string | null
  demand_description?: string | null
  is_required?: boolean | null
  data_status_description?: string | null
  data_source_system?: string | null
  data_contact_person?: string | null
  data_connection_description?: string | null
  distribution_date?: string | null
  data_category_id?: number | string | null
  data_category?: RawDictionaryRelation | RawCategoryRelation | null
  data_source_unit_id?: number | string | null
  data_source_unit?: RawDictionaryRelation | RawCategoryRelation | null
  data_supply_method_id?: number | string | null
  data_supply_method?: RawDictionaryRelation | RawCategoryRelation | null
  domain_category_id?: number | string | null
  domain_category?: RawDictionaryRelation | RawCategoryRelation | null
  external_data_category_id?: number | string | null
  external_data_category?: RawDictionaryRelation | RawCategoryRelation | null
  list_source_id?: number | string | null
  list_source?: RawDictionaryRelation | null
  satisfaction_status_id?: number | string | null
  satisfaction_status?: RawDictionaryRelation | null
  data_frequency_demand_id?: number | string | null
  data_frequency_demand?: RawDictionaryRelation | null
  data_sync_frequency_id?: number | string | null
  data_sync_frequency?: RawDictionaryRelation | null
  business_domain_categories?: RawRelationRecord[] | null
  linked_data_resources?: RawLinkedResource[] | null
  related_apps?: RawRelatedApp[] | null
  related_app?: RawRelatedApp[] | null
  createdAt?: string | null
  updatedAt?: string | null
}

type RawListResponse<T> = {
  data: T[]
  meta?: {
    count?: number
    page?: number
    pageSize?: number
    totalPage?: number
  }
}

type SupplyDemandPortalPageParams = {
  page?: number
  pageSize?: number
  sort?: string | null
  filter?: Record<string, unknown> | null
  includeLinkedResources?: boolean
  includeRelatedApps?: boolean
}

type RawCreateResponse = {
  data?: {
    id?: unknown
    data?: {
      id?: unknown
    } | null
  } | null
}

export type SupplyDemandInfo = {
  id: string
  createdById: string
  updatedById: string
  sceneName: string
  requiredDataResourceName: string
  mainDataItems: string
  demandDescription: string
  isRequired: boolean
  dataStatusDescription: string
  dataSourceSystem: string
  dataContactPerson: string
  dataConnectionDescription: string
  distributionDate: string
  dataCategoryId: string
  dataCategoryName: string
  dataSourceUnitId: string
  dataSourceUnitName: string
  dataSupplyMethodId: string
  dataSupplyMethodName: string
  domainCategoryId: string
  domainCategoryName: string
  externalDataCategoryId: string
  externalDataCategoryName: string
  listSourceId: string
  listSourceName: string
  satisfactionStatusId: string
  satisfactionStatusName: string
  dataFrequencyDemandId: string
  dataFrequencyDemandName: string
  dataSyncFrequencyId: string
  dataSyncFrequencyName: string
  businessDomainCategoryIds: string[]
  businessDomainCategoryNames: string[]
  linkedResourceIds: string[]
  linkedResourceNames: string[]
  relatedAppIds: string[]
  relatedAppNames: string[]
  relatedApps: SupplyDemandRelatedApp[]
  createdAt: string
  updatedAt: string
}

export type SupplyDemandRelatedApp = {
  id: string
  name: string
  tags: string[]
  contact: string
  description: string
  domainCategoryId: string
  domainCategoryName: string
  screenshotUrl: string
}

export const EXTERNAL_SUPPLY_DEMAND_SCENE_NAME = '外部数据'

export function isExternalSupplyDemandItem(
  item: Pick<
    SupplyDemandInfo,
    'sceneName' | 'dataSourceUnitId' | 'dataSourceUnitName' | 'externalDataCategoryId' | 'externalDataCategoryName'
  >,
) {
  return item.sceneName.trim() === EXTERNAL_SUPPLY_DEMAND_SCENE_NAME
    || Boolean(
      item.dataSourceUnitId.trim()
      || item.dataSourceUnitName.trim()
      || item.externalDataCategoryId.trim()
      || item.externalDataCategoryName.trim(),
    )
}

export function isInternalSupplyDemandItem(
  item: Pick<
    SupplyDemandInfo,
    'sceneName' | 'dataSourceUnitId' | 'dataSourceUnitName' | 'externalDataCategoryId' | 'externalDataCategoryName'
  >,
) {
  return !isExternalSupplyDemandItem(item)
}

export type CreateSupplyDemandInfoEntry = {
  requiredDataResourceName: string
  mainDataItems: string
  demandDescription: string
  dataFrequencyDemandId: string
  dataFrequencyDemandName?: string
  linkedResourceIds: string[]
}

export type CreateSupplyDemandInfoBatchParams = {
  sceneName: string
  domainCategoryId?: string
  entries: CreateSupplyDemandInfoEntry[]
}

export type CreateSupplyDemandInfoBatchResult = {
  createdCount: number
  associationWarningCount: number
}

type StorageCacheEntry<T> = {
  data: T
  cachedAt: string
}

const supplyDemandPortalCache: Record<SupplyDemandFetchMode, SupplyDemandInfo[] | null> = {
  light: null,
  full: null,
  applications: null,
}

const supplyDemandPortalPromise: Record<SupplyDemandFetchMode, Promise<SupplyDemandInfo[]> | null> = {
  light: null,
  full: null,
  applications: null,
}

let supplyDemandPortalSummaryCache: SupplyDemandInfo[] | null = null
let supplyDemandPortalSummaryPromise: Promise<SupplyDemandInfo[]> | null = null
const supplyDemandPortalPageCache = new Map<string, SupplyDemandPortalPageResult>()
const supplyDemandPortalPagePromise = new Map<string, Promise<SupplyDemandPortalPageResult>>()

function readStorageCache<T>(key: string): StorageCacheEntry<T> | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return null
    if (!('data' in parsed)) return null

    const cachedAt =
      typeof parsed.cachedAt === 'string'
        ? parsed.cachedAt
        : typeof parsed.date === 'string'
          ? new Date(`${parsed.date}T00:00:00.000Z`).toISOString()
          : new Date().toISOString()

    return {
      data: parsed.data as T,
      cachedAt,
    }
  } catch {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key)
      }
    } catch {
      /* ignore */
    }
    return null
  }
}

function writeStorageCache(key: string, data: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return
    const payload = JSON.stringify({
      cachedAt: new Date().toISOString(),
      data,
    })

    if (payload.length > 4 * 1024 * 1024) return
    localStorage.setItem(key, payload)
  } catch {
    /* ignore */
  }
}

function isCacheFresh(cachedAt: string, ttlMinutes: number): boolean {
  const cachedTime = new Date(cachedAt).getTime()
  if (Number.isNaN(cachedTime)) return false
  return Date.now() - cachedTime < ttlMinutes * 60 * 1000
}

// Restore summary memory cache from localStorage on module load
{
  const summary = readStorageCache<SupplyDemandInfo[]>(LS_CACHE_SUPPLY_DEMAND_SUMMARY)
  if (summary?.data && isCacheFresh(summary.cachedAt, SUMMARY_CACHE_TTL_MINUTES)) {
    supplyDemandPortalSummaryCache = summary.data
  }
}

function normalizeId(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeString(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeText(value: unknown, fallback = '') {
  const normalized = normalizeString(value)
  return normalized || fallback
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean)
  }

  const single = normalizeText(value)
  return single ? [single] : []
}

function normalizeUrlText(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (
    normalized.startsWith('http://')
    || normalized.startsWith('https://')
    || normalized.startsWith('/')
    || normalized.startsWith('./')
    || normalized.startsWith('../')
    || normalized.startsWith('data:image/')
  ) {
    return normalized
  }
  return ''
}

function resolveMediaUrl(candidate: unknown): string {
  const directUrl = normalizeUrlText(candidate)
  if (directUrl) return directUrl

  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const url = resolveMediaUrl(item)
      if (url) return url
    }
    return ''
  }

  if (!candidate || typeof candidate !== 'object') {
    return ''
  }

  const record = candidate as Record<string, unknown>
  for (const key of ['url', 'src', 'href', 'preview', 'previewUrl', 'thumbnail', 'thumbUrl', 'img']) {
    const url = resolveMediaUrl(record[key])
    if (url) return url
  }

  return ''
}

function resolveRelatedAppScreenshotUrl(record: RawRelatedApp) {
  for (const key of [
    'screenshot',
    'screenshotUrl',
    'cover',
    'coverUrl',
    'image',
    'imageUrl',
    'images',
    'thumbnail',
    'thumbnailUrl',
    'app_screenshot',
    'app_cover',
    'app_image',
    'attachment',
    'attachments',
    'file',
    'files',
  ] satisfies Array<keyof RawRelatedApp>) {
    const url = resolveMediaUrl(record[key])
    if (url) return url
  }

  return ''
}

function normalizeRelationName(value: RawDictionaryRelation | RawCategoryRelation | null | undefined, fallback = '') {
  if (!value) return fallback
  const relation = value as RawDictionaryRelation & RawCategoryRelation
  return normalizeText(
    relation.name ?? relation.nodeName ?? relation.node_name ?? relation.dictValueName ?? relation.dict_value_name,
    fallback,
  )
}

function normalizeRelationNames(values: RawRelationRecord[] | null | undefined) {
  return (Array.isArray(values) ? values : []).map((value) => normalizeRelationName(value, '')).filter(Boolean)
}

function normalizeRelationIds(values: RawRelationRecord[] | null | undefined) {
  return (Array.isArray(values) ? values : []).map((value) => normalizeId(value.id)).filter(Boolean)
}

function normalizeRelationInputValue(value: string) {
  const normalized = normalizeId(value)
  if (!normalized) return null
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized
}

function resolveExistingCollection(
  availableCollections: Set<string> | null,
  candidates: readonly [string, ...string[]],
  allowGuess = true,
) {
  if (!availableCollections) {
    return allowGuess ? candidates[0] : null
  }

  for (const candidate of candidates) {
    if (availableCollections.has(candidate)) {
      return candidate
    }
  }

  return null
}

function resolveSupplyDemandFetchMode(includeLinkedResources: boolean, includeRelatedApps: boolean) {
  if (includeRelatedApps) return 'applications'
  return includeLinkedResources ? 'full' : 'light'
}

function getSupplyDemandAppends(mode: SupplyDemandFetchMode) {
  return mode === 'applications'
    ? SUPPLY_DEMAND_APPLICATION_APPENDS
    : mode === 'full'
      ? SUPPLY_DEMAND_FULL_APPENDS
      : SUPPLY_DEMAND_LIGHT_APPENDS
}

function getSupplyDemandAppendCandidates(mode: SupplyDemandFetchMode): SupplyDemandAppends[] {
  const candidates: SupplyDemandAppends[] = [getSupplyDemandAppends(mode)]

  if (mode === 'applications') {
    candidates.push(SUPPLY_DEMAND_FULL_APPENDS)
  }

  if (mode !== 'light') {
    candidates.push(SUPPLY_DEMAND_LIGHT_APPENDS)
  }

  candidates.push([])
  return candidates.filter((candidate, index) =>
    candidates.findIndex((other) => other.join('|') === candidate.join('|')) === index,
  )
}

function getSupplyDemandSortCandidates(sort: string) {
  return sort === '-updatedAt' || sort === '-createdAt'
    ? [sort, '-id']
    : [sort]
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('response' in error)) return null

  const response = error.response
  if (!response || typeof response !== 'object' || !('status' in response)) return null

  const status = Number(response.status)
  return Number.isFinite(status) ? status : null
}

async function listSupplyDemandCollection<T>(
  collectionName: string,
  mode: SupplyDemandFetchMode,
  options: { page: number; pageSize: number; sort: string; filter?: Record<string, unknown> | null },
) {
  let lastError: unknown = null

  for (const sort of getSupplyDemandSortCandidates(options.sort)) {
    for (const appends of getSupplyDemandAppendCandidates(mode)) {
      try {
        const response = await nocobaseClient.resource(collectionName).list({
          ...options,
          sort,
          filter: options.filter ?? undefined,
          appends: [...appends],
        })
        return response.data as RawListResponse<T>
      } catch (error) {
        lastError = error
        // Older deployed schemas may lack audit columns or an appended relation.
        if (getErrorStatus(error) !== 400) throw error
      }
    }
  }

  throw lastError
}

function resolveSupplyDemandCollectionName(availableCollections?: Set<string> | null) {
  const resolvedCollections = availableCollections ?? null
  const supplyDemandCollection = resolveExistingCollection(
    resolvedCollections,
    SUPPLY_DEMAND_COLLECTION_CANDIDATES,
    false,
  )

  if (!supplyDemandCollection) {
    throw new Error('当前环境未启用供需对接信息集合')
  }

  return supplyDemandCollection
}

function normalizePagedMeta(meta: RawListResponse<unknown>['meta'], page: number, pageSize: number) {
  const totalCount = Number(meta?.count ?? 0)
  const safePageSize = Math.max(1, Math.floor(Number(meta?.pageSize ?? pageSize) || pageSize))
  const safePage = Math.max(1, Math.floor(Number(meta?.page ?? page) || page))
  const fallbackTotalPages = Math.ceil(totalCount / safePageSize) || 1
  const totalPages = Math.max(1, Number(meta?.totalPage ?? (fallbackTotalPages)))

  return {
    page: safePage,
    pageSize: safePageSize,
    totalCount,
    totalPages,
  }
}

function buildSupplyDemandPortalPageCacheKey(params: SupplyDemandPortalPageParams) {
  return JSON.stringify({
    includeLinkedResources: params.includeLinkedResources !== false,
    includeRelatedApps: params.includeRelatedApps === true,
    page: Math.max(1, Math.floor(params.page ?? 1)),
    pageSize: Math.max(1, Math.floor(params.pageSize ?? 10)),
    sort: params.sort ?? '-updatedAt',
    filter: params.filter ?? null,
  })
}

async function fetchSupplyDemandPortalCollectionPageInternal(
  params: SupplyDemandPortalPageParams,
): Promise<SupplyDemandPortalPageResult> {
  const availableCollections = await getAvailableCollectionNames()
  const supplyDemandCollection = resolveSupplyDemandCollectionName(availableCollections)
  const includeLinkedResources = params.includeLinkedResources !== false
  const includeRelatedApps = params.includeRelatedApps === true
  const page = Math.max(1, Math.floor(params.page ?? 1))
  const pageSize = Math.max(1, Math.floor(params.pageSize ?? 10))
  const sort = params.sort ?? '-updatedAt'

  try {
    const payload = await listSupplyDemandCollection<RawSupplyDemandInfoRecord>(
      supplyDemandCollection,
      resolveSupplyDemandFetchMode(includeLinkedResources, includeRelatedApps),
      { page, pageSize, sort, filter: params.filter ?? undefined },
    )
    const normalizedMeta = normalizePagedMeta(payload.meta, page, pageSize)

    return {
      items: (payload.data ?? []).map((item) => mapSupplyDemandInfo(item)),
      ...normalizedMeta,
    }
  } catch (error) {
    throw new Error(toErrorMessage(error, '供需对接信息加载失败'))
  }
}

async function fetchSupplyDemandPortalSummaryDataInternal() {
  const availableCollections = await getAvailableCollectionNames()
  const supplyDemandCollection = resolveSupplyDemandCollectionName(availableCollections)

  try {
    const rows = await loadAllPagesParallel(async ({ page, pageSize }) => {
      return listSupplyDemandCollection<RawSupplyDemandInfoRecord>(supplyDemandCollection, 'applications', {
        page,
        pageSize,
        sort: '-updatedAt',
      })
    }, 200)

    return rows.map((item) => mapSupplyDemandInfo(item))
  } catch (error) {
    throw new Error(toErrorMessage(error, '供需对接信息加载失败'))
  }
}

export function clearSupplyDemandPortalCaches() {
  supplyDemandPortalCache.light = null
  supplyDemandPortalCache.full = null
  supplyDemandPortalCache.applications = null
  supplyDemandPortalPromise.light = null
  supplyDemandPortalPromise.full = null
  supplyDemandPortalPromise.applications = null
  supplyDemandPortalSummaryCache = null
  supplyDemandPortalSummaryPromise = null
  supplyDemandPortalPageCache.clear()
  supplyDemandPortalPagePromise.clear()
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_CACHE_SUPPLY_DEMAND_SUMMARY)
    }
  } catch {
    /* ignore */
  }
}

export function mapSupplyDemandInfo(item: RawSupplyDemandInfoRecord): SupplyDemandInfo {
  const linkedResources = Array.isArray(item.linked_data_resources) ? item.linked_data_resources : []
  const businessDomainCategories = Array.isArray(item.business_domain_categories) ? item.business_domain_categories : []
  const relatedApps = Array.isArray(item.related_apps)
    ? item.related_apps
    : Array.isArray(item.related_app)
      ? item.related_app
      : []

  return {
    id: normalizeId(item.id),
    createdById: normalizeId(item.createdById ?? item.created_by_id ?? item.createdBy?.id),
    updatedById: normalizeId(item.updatedById ?? item.updated_by_id ?? item.updatedBy?.id),
    sceneName: normalizeText(item.scene_name, '未命名场景'),
    requiredDataResourceName: normalizeText(item.required_data_resource_name, '未填写资源名称'),
    mainDataItems: normalizeText(item.main_data_items, ''),
    demandDescription: normalizeText(item.demand_description, ''),
    isRequired: Boolean(item.is_required),
    dataStatusDescription: normalizeText(item.data_status_description, ''),
    dataSourceSystem: normalizeText(item.data_source_system, ''),
    dataContactPerson: normalizeText(item.data_contact_person, ''),
    dataConnectionDescription: normalizeText(item.data_connection_description, ''),
    distributionDate: normalizeText(item.distribution_date, ''),
    dataCategoryId: normalizeId(item.data_category_id ?? item.data_category?.id),
    dataCategoryName: normalizeRelationName(item.data_category, '未标注'),
    dataSourceUnitId: normalizeId(item.data_source_unit_id ?? item.data_source_unit?.id),
    dataSourceUnitName: normalizeRelationName(item.data_source_unit, ''),
    dataSupplyMethodId: normalizeId(item.data_supply_method_id ?? item.data_supply_method?.id),
    dataSupplyMethodName: normalizeRelationName(item.data_supply_method, ''),
    domainCategoryId: normalizeId(item.domain_category_id ?? item.domain_category?.id),
    domainCategoryName: normalizeRelationName(item.domain_category, '未标注'),
    externalDataCategoryId: normalizeId(item.external_data_category_id ?? item.external_data_category?.id),
    externalDataCategoryName: normalizeRelationName(item.external_data_category, ''),
    listSourceId: normalizeId(item.list_source_id ?? item.list_source?.id),
    listSourceName: normalizeRelationName(item.list_source, ''),
    satisfactionStatusId: normalizeId(item.satisfaction_status_id ?? item.satisfaction_status?.id),
    satisfactionStatusName: normalizeRelationName(item.satisfaction_status, ''),
    dataFrequencyDemandId: normalizeId(item.data_frequency_demand_id ?? item.data_frequency_demand?.id),
    dataFrequencyDemandName: normalizeRelationName(item.data_frequency_demand, ''),
    dataSyncFrequencyId: normalizeId(item.data_sync_frequency_id ?? item.data_sync_frequency?.id),
    dataSyncFrequencyName: normalizeRelationName(item.data_sync_frequency, ''),
    businessDomainCategoryIds: normalizeRelationIds(businessDomainCategories),
    businessDomainCategoryNames: normalizeRelationNames(businessDomainCategories),
    linkedResourceIds: linkedResources.map((resource: RawLinkedResource) => normalizeId(resource.id)).filter(Boolean),
    linkedResourceNames: linkedResources
      .map((resource: RawLinkedResource) =>
        normalizeText(resource.resource_name ?? resource.resourceName ?? resource.name, ''),
      )
      .filter(Boolean),
    relatedAppIds: relatedApps.map((app) => normalizeId(app.id)).filter(Boolean),
    relatedAppNames: relatedApps.map((app) => normalizeText(app.name, '')).filter(Boolean),
    relatedApps: relatedApps
      .map((app) => ({
        id: normalizeId(app.id),
        name: normalizeText(app.name, '未命名应用'),
        tags: normalizeTags(app.tags),
        contact: normalizeText(app.contact, ''),
        description: normalizeText(app.description, ''),
        domainCategoryId: normalizeId(app.domain_catagory_id ?? app.domain_catagory?.id),
        domainCategoryName: normalizeRelationName(app.domain_catagory, ''),
        screenshotUrl: resolveRelatedAppScreenshotUrl(app),
      }))
      .filter((app) => app.id || app.name),
    createdAt: normalizeText(item.createdAt, ''),
    updatedAt: normalizeText(item.updatedAt, ''),
  }
}

function extractCreatedId(response: RawCreateResponse | null | undefined) {
  const payload = response?.data
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data) {
    return normalizeId(payload.data.id)
  }
  return normalizeId(payload?.id)
}

async function bindLinkedResources(collectionName: string, recordId: string, linkedResourceIds: string[]) {
  if (linkedResourceIds.length === 0) return true

  const associationResource = `${collectionName}.linked_data_resources`
  const valuesAsIds = linkedResourceIds.map((id) => Number(id))
  const valuesAsRecords = valuesAsIds.map((id) => ({ id }))

  const attempts = [
    () => nocobaseClient.resource(associationResource, recordId).set({ values: valuesAsIds }),
    () => nocobaseClient.resource(associationResource, recordId).add({ values: valuesAsIds }),
    () => nocobaseClient.resource(associationResource, recordId).set({ values: valuesAsRecords }),
    () => nocobaseClient.resource(associationResource, recordId).add({ values: valuesAsRecords }),
  ]

  for (const attempt of attempts) {
    try {
      await attempt()
      return true
    } catch {
      continue
    }
  }

  return false
}

async function setSupplyDemandAssociation(
  collectionName: string,
  recordId: string,
  associationName: SupplyDemandAssociationName,
  relationIds: string[],
) {
  const associationResource = `${collectionName}.${associationName}`
  const valuesAsIds = relationIds.map((id) => normalizeRelationInputValue(id)).filter((value) => value !== null)
  const valuesAsRecords = valuesAsIds.map((id) => ({ id }))

  const attempts = [
    () => nocobaseClient.resource(associationResource, recordId).set({ values: valuesAsIds }),
    () => nocobaseClient.resource(associationResource, recordId).set({ values: valuesAsRecords }),
  ]

  for (const attempt of attempts) {
    try {
      await attempt()
      return
    } catch {
      continue
    }
  }

  throw new Error(`更新供需对接关联字段 ${associationName} 失败`)
}

async function setSupplyDemandAssociationByCandidates(
  collectionName: string,
  recordId: string,
  associationNames: readonly SupplyDemandRelatedAppAssociationName[],
  relationIds: string[],
) {
  let lastError: unknown = null

  for (const associationName of associationNames) {
    try {
      await setSupplyDemandAssociation(collectionName, recordId, associationName, relationIds)
      return
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('更新供需对接关联场景应用失败')
}

async function fetchSupplyDemandPortalDataInternal(mode: SupplyDemandFetchMode) {
  try {
    const availableCollections = await getAvailableCollectionNames()
    const supplyDemandCollection = resolveSupplyDemandCollectionName(availableCollections)
    const rows = await loadAllPagesParallel(async ({ page, pageSize }) => {
      return listSupplyDemandCollection<RawSupplyDemandInfoRecord>(supplyDemandCollection, mode, {
        page,
        pageSize,
        sort: '-updatedAt',
      })
    }, 200)

    const mapped = rows.map((item) => mapSupplyDemandInfo(item))
    supplyDemandPortalCache[mode] = mapped
    if (mode === 'applications') {
      supplyDemandPortalCache.full = mapped
      supplyDemandPortalCache.light = mapped
    } else if (mode === 'full') {
      supplyDemandPortalCache.light = mapped
    }
    return mapped
  } catch (error) {
    throw new Error(toErrorMessage(error, '供需对接信息加载失败'))
  }
}

export async function fetchSupplyDemandPortalSummaryData(options: { force?: boolean } = {}) {
  const { force = false } = options

  if (!force && supplyDemandPortalSummaryCache) {
    return supplyDemandPortalSummaryCache
  }

  if (!force) {
    const cached = readStorageCache<SupplyDemandInfo[]>(LS_CACHE_SUPPLY_DEMAND_SUMMARY)
    if (cached?.data && isCacheFresh(cached.cachedAt, SUMMARY_CACHE_TTL_MINUTES)) {
      supplyDemandPortalSummaryCache = cached.data
      return cached.data
    }
  }

  if (!force && supplyDemandPortalSummaryPromise) {
    return supplyDemandPortalSummaryPromise
  }

  const request = fetchSupplyDemandPortalSummaryDataInternal()
    .then((payload) => {
      supplyDemandPortalSummaryCache = payload
      writeStorageCache(LS_CACHE_SUPPLY_DEMAND_SUMMARY, payload)
      return payload
    })
    .finally(() => {
      supplyDemandPortalSummaryPromise = null
    })

  supplyDemandPortalSummaryPromise = request
  return request
}

export async function fetchSupplyDemandPortalPage(
  options: SupplyDemandPortalPageParams & { force?: boolean } = {},
) {
  const { force = false, ...params } = options
  const cacheKey = buildSupplyDemandPortalPageCacheKey(params)

  if (!force) {
    const cached = supplyDemandPortalPageCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const inflight = supplyDemandPortalPagePromise.get(cacheKey)
    if (inflight) {
      return inflight
    }
  }

  const request = fetchSupplyDemandPortalCollectionPageInternal(params)
    .then((payload) => {
      supplyDemandPortalPageCache.set(cacheKey, payload)
      return payload
    })
    .finally(() => {
      supplyDemandPortalPagePromise.delete(cacheKey)
    })

  supplyDemandPortalPagePromise.set(cacheKey, request)
  return request
}

export async function fetchSupplyDemandPortalData(
  options: { force?: boolean; includeLinkedResources?: boolean; includeRelatedApps?: boolean } = {},
) {
  const { force = false, includeLinkedResources = true, includeRelatedApps = false } = options
  const mode = resolveSupplyDemandFetchMode(includeLinkedResources, includeRelatedApps)
  const cache =
    mode === 'light'
      ? supplyDemandPortalCache.light ?? supplyDemandPortalCache.full ?? supplyDemandPortalCache.applications
      : mode === 'full'
        ? supplyDemandPortalCache.full ?? supplyDemandPortalCache.applications
        : supplyDemandPortalCache.applications
  const inflightPromise =
    mode === 'light'
      ? supplyDemandPortalPromise.light ?? supplyDemandPortalPromise.full ?? supplyDemandPortalPromise.applications
      : mode === 'full'
        ? supplyDemandPortalPromise.full ?? supplyDemandPortalPromise.applications
        : supplyDemandPortalPromise.applications

  if (!force && cache) {
    return cache
  }

  if (!force && inflightPromise) {
    return inflightPromise
  }

  const request = fetchSupplyDemandPortalDataInternal(mode)
    .then((payload) => {
      supplyDemandPortalCache[mode] = payload
      return payload
    })
    .finally(() => {
      supplyDemandPortalPromise[mode] = null
    })

  supplyDemandPortalPromise[mode] = request
  return request
}

export function useSupplyDemandPortalData(
  enabled: boolean,
  options: { includeLinkedResources?: boolean; includeRelatedApps?: boolean } = {},
) {
  const { includeLinkedResources = true, includeRelatedApps = false } = options
  const mode = resolveSupplyDemandFetchMode(includeLinkedResources, includeRelatedApps)
  const cachedData =
    mode === 'light'
      ? supplyDemandPortalCache.light ?? supplyDemandPortalCache.full ?? supplyDemandPortalCache.applications
      : mode === 'full'
        ? supplyDemandPortalCache.full ?? supplyDemandPortalCache.applications
        : supplyDemandPortalCache.applications
  const [data, setData] = useState<SupplyDemandInfo[]>(cachedData ?? [])
  const [hasLoaded, setHasLoaded] = useState(() => Boolean(cachedData))
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    const payload = await fetchSupplyDemandPortalData({
      force: true,
      includeLinkedResources,
      includeRelatedApps,
    })
    setData(payload)
    setHasLoaded(true)
    setError(null)
    return payload
  }

  useEffect(() => {
    let cancelled = false

    if (!enabled) {
      return () => {
        cancelled = true
      }
    }

    const activeCache =
      mode === 'light'
        ? supplyDemandPortalCache.light ?? supplyDemandPortalCache.full ?? supplyDemandPortalCache.applications
        : mode === 'full'
          ? supplyDemandPortalCache.full ?? supplyDemandPortalCache.applications
          : supplyDemandPortalCache.applications

    if (activeCache) {
      setData(activeCache)
      setHasLoaded(true)
      return () => {
        cancelled = true
      }
    }

    queueMicrotask(() => {
      if (cancelled) return
      setHasLoaded(false)
      setError(null)
    })

    fetchSupplyDemandPortalData({ includeLinkedResources, includeRelatedApps })
      .then((payload) => {
        if (cancelled) return
        setData(payload)
        setError(null)
        setHasLoaded(true)
      })
      .catch((fetchError) => {
        if (cancelled) return
        setData([])
        setError(fetchError instanceof Error ? fetchError.message : '供需对接信息加载失败')
        setHasLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, includeLinkedResources, includeRelatedApps, mode])

  return {
    data: cachedData ?? data,
    isLoading: enabled ? !cachedData && !hasLoaded : false,
    error: cachedData ? null : error,
    reload,
  }
}

export async function createSupplyDemandInfoBatch(
  params: CreateSupplyDemandInfoBatchParams,
): Promise<CreateSupplyDemandInfoBatchResult> {
  const availableCollections = await getAvailableCollectionNames()
  const supplyDemandCollection = resolveExistingCollection(
    availableCollections,
    SUPPLY_DEMAND_COLLECTION_CANDIDATES,
    false,
  )

  if (!supplyDemandCollection) {
    throw new Error('当前环境未启用供需对接信息集合，无法登记场景需求')
  }

  const normalizedSceneName = normalizeText(params.sceneName)
  if (!normalizedSceneName) {
    throw new Error('场景名称不能为空')
  }

  let createdCount = 0
  let associationWarningCount = 0

  try {
    const mergedEntry = mergeSupplyDemandSceneEntries(params.entries)
    if (mergedEntry.resourceCount === 0) {
      return { createdCount: 0, associationWarningCount: 0 }
    }

    const response = await nocobaseClient.resource(supplyDemandCollection).create({
      values: {
        scene_name: normalizedSceneName,
        required_data_resource_name: normalizeText(mergedEntry.requiredDataResourceName),
        main_data_items: normalizeText(mergedEntry.mainDataItems),
        demand_description: normalizeText(mergedEntry.demandDescription),
        is_required: true,
        data_status_description: '新增场景需求，待研判',
        data_connection_description: '',
        domain_category_id: params.domainCategoryId ? Number(params.domainCategoryId) : null,
        data_frequency_demand_id: mergedEntry.dataFrequencyDemandId ? Number(mergedEntry.dataFrequencyDemandId) : null,
      },
    })

    createdCount = 1

    const createdId = extractCreatedId(response)
    if (createdId && mergedEntry.linkedResourceIds.length > 0) {
      const bindSuccess = await bindLinkedResources(
        supplyDemandCollection,
        createdId,
        mergedEntry.linkedResourceIds,
      )

      if (!bindSuccess) {
        associationWarningCount = 1
      }
    }

    clearSupplyDemandPortalCaches()

    return { createdCount, associationWarningCount }
  } catch (error) {
    throw new Error(toErrorMessage(error, '场景需求登记失败'))
  }
}

export async function updateSupplyDemandLinkedResources(recordId: string, linkedResourceIds: string[]) {
  await assertCanManageCatalogResources()

  const normalizedRecordId = normalizeId(recordId)
  if (!normalizedRecordId) {
    throw new Error('未找到供需对接记录，无法更新对应数据资源')
  }

  const availableCollections = await getAvailableCollectionNames()
  const collectionName = resolveSupplyDemandCollectionName(availableCollections)

  try {
    await setSupplyDemandAssociation(collectionName, normalizedRecordId, 'linked_data_resources', linkedResourceIds)
    clearSupplyDemandPortalCaches()
  } catch (error) {
    throw new Error(toErrorMessage(error, '更新对应数据资源失败'))
  }
}

export async function updateSupplyDemandRelatedApps(recordId: string, relatedAppIds: string[]) {
  await assertCanManageCatalogResources()

  const normalizedRecordId = normalizeId(recordId)
  if (!normalizedRecordId) {
    throw new Error('未找到供需对接记录，无法更新对应场景应用')
  }

  const availableCollections = await getAvailableCollectionNames()
  const collectionName = resolveSupplyDemandCollectionName(availableCollections)

  try {
    await setSupplyDemandAssociationByCandidates(
      collectionName,
      normalizedRecordId,
      SUPPLY_DEMAND_RELATED_APP_ASSOCIATION_CANDIDATES,
      relatedAppIds,
    )
    clearSupplyDemandPortalCaches()
  } catch (error) {
    throw new Error(toErrorMessage(error, '更新对应场景应用失败'))
  }
}
