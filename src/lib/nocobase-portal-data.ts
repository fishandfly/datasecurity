import { useCallback, useEffect, useMemo, useState } from 'react'
import { nocobaseClient, toErrorMessage } from './nocobase-client'
import {
  buildCatalogCategoryTree,
  createCategoryLookup,
  type CatalogCategoryTreeNode,
} from './catalog-category-tree'
import {
  buildTreeSubsetBySeedIds,
  getAvailableCollectionNames,
  normalizeTreeNode,
  resolveCollectionName,
} from './nocobase-collections'
import { realignMapResourcesToTopLevelMapCategory } from './catalog-map-category'
import { realignNoiseResourcesToBusinessCategory } from './catalog-noise-category'
import { createDemoPortalData, isDemoFallbackEnabled } from './demo-security-data'
import { loadAllPages, loadAllPagesParallel } from './paginated-resource-loader'

type PrimitiveOption = Array<[string, number]>

export type SelectOption = {
  value: string
  label: string
}

export type CatalogFieldRow = {
  fieldName: string
  englishName: string
  fieldType: string
  length: string
  nullable: string
  shared: string
  primary: string
  description: string
}

export type CatalogLineageNodeType = 'data_source' | 'warehouse_resource' | 'warehouse_layer' | 'data_api' | 'unknown'

export type CatalogLineageTable = {
  tableName: string
  description: string
  rawLayer: string
}

export type CatalogLineageNode = {
  id: string
  name: string
  nodeType: CatalogLineageNodeType
  resourceCode: string
  layer: string
  ownerId: string
  ownerName: string
  tableCount: number
  tables: CatalogLineageTable[]
}

export type CatalogLineageEdge = {
  fromId: string
  fromName: string
  toId: string
  toName: string
}

export type CatalogLineage = {
  upstream: CatalogLineageNode[]
  downstream: CatalogLineageNode[]
  nodes: CatalogLineageNode[]
  edges: CatalogLineageEdge[]
  excludedNodeIds: string[]
  excludedEdgeKeys: string[]
}

export type CatalogPhysicalTables = {
  baseline: string
  businessTimeField: string
  tables: string[]
  sourceSystems: string[]
  rows: Array<{
    tableName: string
    sourceSystem: string
    businessTimeField: string
    isBaseline: boolean
  }>
}

export type CatalogMapPreviewLayerKind = 'tile' | 'map-image' | 'feature' | 'scene' | 'amap'

export type CatalogMapPreview = {
  serviceUrl: string
  previewUrl: string
  serviceType: string
  layerKind: CatalogMapPreviewLayerKind
  authMode: string
  isCached: boolean
  initialExtent: Record<string, unknown> | null
  spatialReference: Record<string, unknown> | null
}

export type CatalogLinkInfoItem = {
  label: string
  url: string
  description: string
}

export type CatalogLinkInfo = {
  primary: string
  items: CatalogLinkInfoItem[]
}

export type CatalogItem = {
  id: string
  code: string
  name: string
  categoryId: string
  category: string
  categoryAncestorIds: string[]
  businessAttributeId: string
  businessAttribute: string
  businessAttributePath: string
  businessAttributeAncestorIds: string[]
  industryCategory: string
  businessCategoryId: string
  businessCategory: string
  businessCategoryPath: string
  informationCategoryId: string
  informationCategoryAncestorIds: string[]
  informationCategory: string
  informationCategoryPath: string
  openTypeId: string
  openType: string
  serviceTypeId: string
  serviceType: string
  supplyMethod: string
  sharingAttribute: string
  departmentId: string
  department: string
  departmentAncestorIds: string[]
  regionId: string
  regionAncestorIds: string[]
  contact: string
  tags: string[]
  description: string
  summary: string
  updateCycleId: string
  updateCycle: string
  format: string[]
  timeScope: string
  publishDate: string
  updateTime: string
  areaScope: string
  count: string
  countValue: number
  fieldCount: number
  usageCount: number
  apiCount: number
  fieldRows: CatalogFieldRow[]
  dataLineage: CatalogLineage | null
  sourceSystem: string
  sourceTable: string
  physicalTables: CatalogPhysicalTables
  mapPreview: CatalogMapPreview | null
  linkInfo: CatalogLinkInfo
  remarks: string
  searchText: string
}

export type PortalData = {
  catalogItems: CatalogItem[]
  categoryTree: CatalogCategoryTreeNode[]
  businessAttributeTree: CatalogCategoryTreeNode[]
  sourceTree: CatalogCategoryTreeNode[]
  regionTree: CatalogCategoryTreeNode[]
  informationCategoryTree: CatalogCategoryTreeNode[]
  categoryOptions: PrimitiveOption
  openOptions: PrimitiveOption
  departmentOptions: PrimitiveOption
  regionOptions: PrimitiveOption
  editOptions: {
    updateCycleOptions: SelectOption[]
    sharingAttributeOptions: SelectOption[]
    serviceTypeOptions: SelectOption[]
    supplyMethodOptions: SelectOption[]
  }
}

type RawDictionaryItem = {
  id?: string | number
  typeCode?: string
  type_code?: string
  dictValue?: string
  dict_value?: string
  dictValueName?: string
  dict_value_name?: string
  dictSort?: number | string
  dict_sort?: number | string
}

type RawDictionaryRelation = {
  id?: number | string | null
  name?: string | null
  dictValue?: string | null
  dict_value?: string | null
  dictValueName?: string | null
  dict_value_name?: string | null
}

type RawCategoryTreeRelation = {
  id?: number | string | null
  nodeName?: string | null
  node_name?: string | null
  typeCode?: string | null
  type_code?: string | null
}

type RawCategoryTreeNode = {
  id: string | number
  type_code?: string
  typeCode?: string
  node_name?: string
  nodeName?: string
  parent_node_id?: string | number | null
  parentNodeId?: string | number | null
}

type RawDataItem = {
  code?: string | null
  name?: string | null
  dataType?: string | null
  data_type?: string | null
  type?: string | null
  description?: string | null
}

type RawResource = {
  id: number
  display_seq?: number | string | null
  displaySeq?: number | string | null
  resource_name?: string | null
  resource_code?: string | null
  summary?: string | null
  contact_info?: string | null
  field_count?: number | string | null
  time_range?: string | null
  region_coverage?: string | null
  data_updated_at?: string | null
  published_at?: string | null
  source_system?: string | null
  sourceSystem?: string | null
  source_table?: string | null
  sourceTable?: string | null
  source_tablelist?: unknown
  sourceTablelist?: unknown
  stat_base?: unknown
  access_url?: unknown
  remarks?: string | null
  data_items_json?: RawDataItem[] | Record<string, unknown> | string | null
  data_items?: RawDataItem[] | Record<string, unknown> | string | null
  data_lineage?: unknown
  dataLineage?: unknown
  data_volume?: string | number | null
  usage_count?: number | string | null
  domain_category_id?: number | string | null
  domain_category?: RawCategoryTreeRelation | null
  business_attribute_categorization_id?: number | string | null
  business_attribute_categorization?: RawCategoryTreeRelation | null
  hj417_category_id?: number | string | null
  hj417_category?: RawCategoryTreeRelation | null
  region_category_id?: number | string | null
  regionCategoryId?: number | string | null
  provider_unit_id?: number | string | null
  providerUnitId?: number | string | null
  provider_org_id?: number | string | null
  providerOrgId?: number | string | null
  // Dictionary codes / ids / relations
  update_cycle?: string | RawDictionaryRelation | null
  update_cycle_id?: number | string | null
  updateCycleId?: number | string | null
  sharing_attribute?: string | RawDictionaryRelation | null
  sharing_attribute_id?: number | string | null
  sharingAttributeId?: number | string | null
  supply_method?: string | RawDictionaryRelation | null
  supply_method_id?: number | string | null
  supplyMethodId?: number | string | null
  data_resource_type_id?: number | string | null
  dataResourceTypeId?: number | string | null
  data_resource_type?: RawDictionaryRelation | null
  tags?: unknown[] | null
  resource_tags?: unknown[] | null
}

type ListResponse<T> = {
  data: T[]
  meta?: {
    totalPage?: number
  }
}

type PortalDataMode = 'full' | 'list'
const PORTAL_TREE_NODE_PAGE_SIZE = 1000
const PORTAL_DICTIONARY_PAGE_SIZE = 1000
const PORTAL_LIST_RESOURCE_PAGE_SIZE = 1000
const PORTAL_FULL_RESOURCE_PAGE_SIZE = 200

const EMPTY_PORTAL_DATA: PortalData = {
  catalogItems: [],
  categoryTree: [],
  businessAttributeTree: [],
  sourceTree: [],
  regionTree: [],
  informationCategoryTree: [],
  categoryOptions: [['全部', 0]],
  openOptions: [['全部', 0]],
  departmentOptions: [['全部', 0]],
  regionOptions: [['全部', 0]],
  editOptions: {
    updateCycleOptions: [],
    sharingAttributeOptions: [],
    serviceTypeOptions: [],
    supplyMethodOptions: [],
  },
}

const PORTAL_LIST_RESOURCE_FIELDS = [
  'id',
  'display_seq',
  'resource_name',
  'resource_code',
  'summary',
  'contact_info',
  'published_at',
  'data_items',
  'domain_category_id',
  'business_attribute_categorization_id',
  'hj417_category_id',
  'region_category_id',
  'provider_org_id',
  'update_cycle_id',
  'sharing_attribute_id',
  'supply_method_id',
  'data_resource_type_id',
  'source_tablelist',
  'stat_base',
  'access_url',
  'resource_tags',
] as const

// == localStorage cache persistence for portal data ==
const LS_CACHE_PORTAL_LIST = 'eco_cache_portal_list_v4'
const LS_CACHE_RAW_RESOURCES = 'eco_cache_raw_resources_v4'
const CACHE_TTL_MINUTES = 30

function readStorageCache<T>(key: string): { data: T; cachedAt: string } | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return null
    if (!('data' in parsed)) return null
    const cachedAt = typeof parsed.cachedAt === 'string'
      ? parsed.cachedAt
      : (typeof parsed.date === 'string'
        ? new Date(parsed.date + 'T00:00:00.000Z').toISOString()
        : new Date().toISOString())
    return { data: parsed.data as T, cachedAt }
  } catch {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key) } catch { /* ignore */ }
    return null
  }
}

function writeStorageCache(key: string, data: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return
    const payload = JSON.stringify({ cachedAt: new Date().toISOString(), data })
    if (payload.length > 4 * 1024 * 1024) return // skip if >4MB
    localStorage.setItem(key, payload)
  } catch { /* ignore */ }
}

function isCacheFresh(cachedAt: string): boolean {
  const cachedTime = new Date(cachedAt).getTime()
  if (isNaN(cachedTime)) return false
  return (Date.now() - cachedTime) < CACHE_TTL_MINUTES * 60 * 1000
}

let portalDataCache: Record<PortalDataMode, PortalData | null> = {
  full: null,
  list: null,
}
let portalDataPromise: Record<PortalDataMode, Promise<PortalData> | null> = {
  full: null,
  list: null,
}

// Restore list-mode memory cache from localStorage on module load
{
  const cached = readStorageCache<PortalData>(LS_CACHE_PORTAL_LIST)
  if (cached?.data) {
    portalDataCache.list = cached.data
  }
}

function getPortalResourceFields(mode: PortalDataMode) {
  return mode === 'list' ? [...PORTAL_LIST_RESOURCE_FIELDS] : undefined
}

function getPortalResourcePageSize(mode: PortalDataMode) {
  return mode === 'list' ? PORTAL_LIST_RESOURCE_PAGE_SIZE : PORTAL_FULL_RESOURCE_PAGE_SIZE
}

function readPortalDataCache(mode: PortalDataMode) {
  if (mode === 'list') {
    return portalDataCache.list ?? portalDataCache.full
  }
  return portalDataCache.full
}

function text(value: string | null | undefined, fallback = '未标注') {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : fallback
}

function formatDate(value: string | null | undefined) {
  if (!value) return '未标注'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未标注'
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '未标注'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未标注'
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function parseMetricNumber(value: string | number | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : 0
  }

  if (!value) {
    return 0
  }

  const normalized = String(value).trim()
  if (!normalized) return 0

  const parsed = Number.parseFloat(normalized.replace(/,/g, ''))
  if (!Number.isFinite(parsed)) return 0

  let multiplier = 1
  if (normalized.endsWith('万')) multiplier = 10000
  if (normalized.endsWith('亿')) multiplier = 100000000

  return Math.round(parsed * multiplier)
}

function parseSortNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function compareIdAscending(left: unknown, right: unknown) {
  const leftNumber = parseSortNumber(left)
  const rightNumber = parseSortNumber(right)

  if (leftNumber != null && rightNumber != null && leftNumber !== rightNumber) {
    return leftNumber - rightNumber
  }

  return String(left ?? '').localeCompare(String(right ?? ''), 'zh-CN', { numeric: true })
}

function compareNullableNumberAscending(left: number | null, right: number | null) {
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  return left - right
}

function compareRawResourcesByDisplaySeq(left: RawResource, right: RawResource) {
  const leftDisplaySeq = parseSortNumber(left.display_seq ?? left.displaySeq)
  const rightDisplaySeq = parseSortNumber(right.display_seq ?? right.displaySeq)
  const displaySeqDiff = compareNullableNumberAscending(leftDisplaySeq, rightDisplaySeq)

  if (displaySeqDiff !== 0) {
    return displaySeqDiff
  }

  return compareIdAscending(left.id, right.id)
}

function sortResourcesByDisplaySeq<T extends RawResource>(resources: T[]) {
  return [...resources].sort(compareRawResourcesByDisplaySeq)
}

function formatMetricNumber(value: number, unit?: string) {
  const base = value.toLocaleString('en-US')
  return unit ? `${base} ${unit}` : base
}

type DictionaryMap = Record<string, Record<string, string>>
type DictionaryNameByIdMap = Map<string, string>
type DictionaryValueByIdMap = Map<string, string>

function inferFormats(supplyCode: string, dictMap: DictionaryMap) {
  const formats = new Set<string>()

  if (supplyCode === 'api') {
    formats.add('API')
    formats.add('JSON')
  }

  if (supplyCode === 'file') {
    formats.add('XLS')
    formats.add('CSV')
  }

  if (supplyCode === 'database') {
    formats.add('数据库')
  }

  if (formats.size === 0) {
    formats.add(dictMap['data_supply_method']?.[supplyCode] || '其他')
  }

  return Array.from(formats)
}

function stringifyUnknown(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonNullable<T>(value: T | null | undefined): value is T {
  return value != null
}

function parseJsonLike(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const normalized = value.trim()
  if (!normalized) return null
  try {
    return JSON.parse(normalized)
  } catch {
    return null
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  const parsed = parseJsonLike(value)
  return isRecord(parsed) ? parsed : null
}

function normalizeRawDataItems(items: unknown): RawDataItem[] {
  if (Array.isArray(items)) {
    return items
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .map((item) => ({
        code: stringifyUnknown(item.code ?? item.fieldCode ?? item.field_code ?? item.key),
        name: stringifyUnknown(item.name ?? item.fieldName ?? item.field_name ?? item.label ?? item.code ?? item.key),
        dataType: stringifyUnknown(item.dataType ?? item.data_type ?? item.type),
        description: stringifyUnknown(item.description ?? item.desc ?? item.value),
      }))
  }

  if (typeof items === 'string') {
    const textValue = items.trim()
    if (!textValue) return []
    try {
      return normalizeRawDataItems(JSON.parse(textValue))
    } catch {
      return []
    }
  }

  if (isRecord(items)) {
    const wrappedCandidates = [
      items.items,
      items.list,
      items.rows,
      items.data,
      items.fields,
      items.dataItems,
      items.data_items,
    ]
    for (const candidate of wrappedCandidates) {
      const normalized = normalizeRawDataItems(candidate)
      if (normalized.length > 0) {
        return normalized
      }
    }

    return Object.entries(items).map(([key, value]) => ({
      code: key,
      name: key,
      dataType: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
      description: stringifyUnknown(value),
    }))
  }

  return []
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  return tags
    .map((tag) => {
      if (typeof tag === 'string') return tag.trim()
      if (isRecord(tag)) return stringifyUnknown(tag.tag_name ?? tag.tagName ?? tag.name).trim()
      return ''
    })
    .filter((tag) => tag.length > 0)
}

function mapFieldRows(items: unknown) {
  return normalizeRawDataItems(items).map((item) => ({
    fieldName: text(item.name),
    englishName: text(item.code),
    fieldType: text(item.dataType),
    length: '-',
    nullable: '未标注',
    shared: '未标注',
    primary: '未标注',
    description: text(item.description),
  })) satisfies CatalogFieldRow[]
}

function normalizeLineageLayer(value: unknown) {
  const normalized = stringifyUnknown(value).trim().toLowerCase()
  return normalized
}

function normalizeLineageNodeType(value: unknown): CatalogLineageNodeType {
  const normalized = stringifyUnknown(value).trim().toLowerCase()
  if (normalized === 'data_source') return 'data_source'
  if (normalized === 'warehouse_resource') return 'warehouse_resource'
  if (normalized === 'warehouse_layer') return 'warehouse_layer'
  if (normalized === 'data_api') return 'data_api'
  return 'unknown'
}

function normalizeLineageTables(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      tableName: stringifyUnknown(item.table_name ?? item.tableName).trim(),
      description: stringifyUnknown(item.description).trim(),
      rawLayer: stringifyUnknown(item.raw_layer ?? item.rawLayer).trim(),
    }))
    .filter((item) => item.tableName || item.description || item.rawLayer) satisfies CatalogLineageTable[]
}

function parseLineageNode(value: unknown): CatalogLineageNode | null {
  if (!isRecord(value)) return null

  const id = stringifyUnknown(value.id).trim()
  if (!id) return null

  const name = stringifyUnknown(value.name).trim() || id
  const tables = normalizeLineageTables(value.tables)
  const rawTableCount = value.table_count ?? value.tableCount

  return {
    id,
    name,
    nodeType: normalizeLineageNodeType(value.node_type ?? value.nodeType),
    resourceCode: stringifyUnknown(value.resource_code ?? value.resourceCode).trim(),
    layer: normalizeLineageLayer(value.layer),
    ownerId: stringifyUnknown(value.owner_id ?? value.ownerId).trim(),
    ownerName: stringifyUnknown(value.owner_name ?? value.ownerName).trim(),
    tableCount:
      parseMetricNumber(typeof rawTableCount === 'string' || typeof rawTableCount === 'number' ? rawTableCount : null) || tables.length,
    tables,
  } satisfies CatalogLineageNode
}

function parseLineageEdge(value: unknown): CatalogLineageEdge | null {
  if (!isRecord(value)) return null

  const fromId = stringifyUnknown(value.from_id ?? value.fromId).trim()
  const toId = stringifyUnknown(value.to_id ?? value.toId).trim()
  if (!fromId || !toId) return null

  return {
    fromId,
    fromName: stringifyUnknown(value.from_name ?? value.fromName).trim(),
    toId,
    toName: stringifyUnknown(value.to_name ?? value.toName).trim(),
  } satisfies CatalogLineageEdge
}

function buildFallbackLineageNode(
  id: string,
  name: string,
  resourceCode = '',
  nodeType: CatalogLineageNodeType = 'unknown',
): CatalogLineageNode {
  return {
    id,
    name: name || id,
    nodeType,
    resourceCode,
    layer: '',
    ownerId: '',
    ownerName: '',
    tableCount: 0,
    tables: [],
  }
}

function parseLineageStringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => stringifyUnknown(item).trim()).filter(Boolean)))
}

function parseResourceLineage(
  rawValue: unknown,
  currentResource: {
    resourceId: string
    resourceName: string
    resourceCode: string
  },
): CatalogLineage | null {
  if (!rawValue) return null

  let parsedValue = rawValue
  if (typeof rawValue === 'string') {
    const textValue = rawValue.trim()
    if (!textValue) return null
    try {
      parsedValue = JSON.parse(textValue)
    } catch {
      return null
    }
  }

  if (!isRecord(parsedValue)) return null

  const upstream = Array.isArray(parsedValue.upstream) ? parsedValue.upstream.map(parseLineageNode).filter(isNonNullable) : []
  const downstream = Array.isArray(parsedValue.downstream) ? parsedValue.downstream.map(parseLineageNode).filter(isNonNullable) : []
  const nodes = Array.isArray(parsedValue.nodes) ? parsedValue.nodes.map(parseLineageNode).filter(isNonNullable) : []
  const edges = Array.isArray(parsedValue.edges) ? parsedValue.edges.map(parseLineageEdge).filter(isNonNullable) : []
  const excludedNodeIds = parseLineageStringList(parsedValue.excluded_node_ids ?? parsedValue.excludedNodeIds)
  const excludedEdgeKeys = parseLineageStringList(parsedValue.excluded_edge_keys ?? parsedValue.excludedEdgeKeys)

  const nodeMap = new Map<string, CatalogLineageNode>()
  const registerNode = (node: CatalogLineageNode) => {
    nodeMap.set(node.id, node)
  }

  upstream.forEach(registerNode)
  downstream.forEach(registerNode)
  nodes.forEach(registerNode)

  const currentNode =
    nodeMap.get(currentResource.resourceId) ??
    buildFallbackLineageNode(
      currentResource.resourceId,
      currentResource.resourceName,
      currentResource.resourceCode,
      'warehouse_resource',
    )
  registerNode({
    ...currentNode,
    nodeType: currentNode.nodeType === 'unknown' ? 'warehouse_resource' : currentNode.nodeType,
    resourceCode: currentNode.resourceCode || currentResource.resourceCode,
    name: currentNode.name || currentResource.resourceName,
  })

  edges.forEach((edge) => {
    if (!nodeMap.has(edge.fromId)) {
      registerNode(
        buildFallbackLineageNode(
          edge.fromId,
          edge.fromName,
          edge.fromId === currentResource.resourceId ? currentResource.resourceCode : '',
          edge.fromId === currentResource.resourceId ? 'warehouse_resource' : edge.fromId.startsWith('layer:') ? 'warehouse_layer' : 'unknown',
        ),
      )
    }
    if (!nodeMap.has(edge.toId)) {
      registerNode(
        buildFallbackLineageNode(
          edge.toId,
          edge.toName,
          edge.toId === currentResource.resourceId ? currentResource.resourceCode : '',
          edge.toId === currentResource.resourceId ? 'warehouse_resource' : edge.toId.startsWith('layer:') ? 'warehouse_layer' : 'unknown',
        ),
      )
    }
  })

  const normalizedEdges =
    edges.length > 0
      ? edges
      : [
          ...upstream.map((node) => ({
            fromId: node.id,
            fromName: node.name,
            toId: currentResource.resourceId,
            toName: currentResource.resourceName,
          })),
          ...downstream.map((node) => ({
            fromId: currentResource.resourceId,
            fromName: currentResource.resourceName,
            toId: node.id,
            toName: node.name,
          })),
        ]

  const derivedUpstream =
    upstream.length > 0
      ? upstream
      : normalizedEdges
          .filter((edge) => edge.toId === currentResource.resourceId)
          .map((edge) => nodeMap.get(edge.fromId))
          .filter((node): node is CatalogLineageNode => Boolean(node))

  const derivedDownstream =
    downstream.length > 0
      ? downstream
      : normalizedEdges
          .filter((edge) => edge.fromId === currentResource.resourceId)
          .map((edge) => nodeMap.get(edge.toId))
          .filter((node): node is CatalogLineageNode => Boolean(node))

  if (nodeMap.size <= 1 && normalizedEdges.length === 0 && derivedUpstream.length === 0 && derivedDownstream.length === 0) {
    return null
  }

  return {
    upstream: derivedUpstream,
    downstream: derivedDownstream,
    nodes: Array.from(nodeMap.values()),
    edges: normalizedEdges,
    excludedNodeIds,
    excludedEdgeKeys,
  } satisfies CatalogLineage
}

function extractSourceInfo(resource: RawResource) {
  const sourceSystemRaw = resource.source_system ?? resource.sourceSystem
  const sourceTableRaw = resource.source_table ?? resource.sourceTable
  const tableListRaw = resource.source_tablelist ?? resource.sourceTablelist
  const statBaseRaw = resource.stat_base

  let tableNames: string[] = []
  let rowSourceSystems: string[] = []
  let baselineTable = ''
  let businessTimeField = ''
  let tableRows: CatalogPhysicalTables['rows'] = []

  const normalizedTableList = parseJsonObject(tableListRaw)
  if (isRecord(normalizedTableList)) {
    const tables = normalizedTableList.tables
    if (Array.isArray(tables)) {
      const normalizedRows = tables.filter((row): row is Record<string, unknown> => isRecord(row))
      tableNames = normalizedRows
        .map((row) => stringifyUnknown(row.table_name ?? row.tableName).trim())
        .filter(Boolean)
      rowSourceSystems = normalizedRows
        .map((row) => stringifyUnknown(row.source_system ?? row.sourceSystem).trim())
        .filter(Boolean)
      tableRows = normalizedRows
        .map((row) => ({
          tableName: stringifyUnknown(row.table_name ?? row.tableName).trim(),
          sourceSystem: stringifyUnknown(row.source_system ?? row.sourceSystem).trim(),
          businessTimeField: stringifyUnknown(row.fresh_field_name ?? row.freshFieldName).trim(),
          isBaseline: coerceBoolean(row.is_baseline ?? row.isBaseline ?? row.baseline),
        }))
        .filter((row) => row.tableName)
    }
    baselineTable = stringifyUnknown(normalizedTableList.baseline_table ?? normalizedTableList.baselineTable).trim()
  }

  const normalizedStatBase = parseJsonObject(statBaseRaw)
  if (isRecord(normalizedStatBase)) {
    baselineTable = stringifyUnknown(normalizedStatBase.base_table_name ?? normalizedStatBase.baseTableName).trim() || baselineTable
    businessTimeField = stringifyUnknown(normalizedStatBase.fresh_field_name ?? normalizedStatBase.freshFieldName).trim()
  }

  const fallbackTables =
    tableNames.length > 0
      ? tableNames
      : stringifyUnknown(sourceTableRaw)
          .split(/[、,，;；\n\r]+/)
          .map((item) => item.trim())
          .filter(Boolean)
  const dedupedTables = Array.from(new Set(fallbackTables))
  const dedupedSourceSystems = Array.from(
    new Set(
      [stringifyUnknown(sourceSystemRaw).trim(), ...rowSourceSystems]
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
  const baseline = baselineTable || dedupedTables[0] || ''
  const normalizedRows = (
    tableRows.length > 0
      ? tableRows
      : dedupedTables.map((tableName) => ({
          tableName,
          sourceSystem: '',
          businessTimeField: '',
          isBaseline: false,
        }))
  ).map((row) => {
    const isBaseline = row.isBaseline || (!!baseline && row.tableName === baseline)
    return {
      ...row,
      isBaseline,
      businessTimeField: isBaseline ? (row.businessTimeField || businessTimeField) : row.businessTimeField,
    }
  })

  return {
    sourceSystem: text(sourceSystemRaw ?? rowSourceSystems[0]),
    sourceTable: text(sourceTableRaw ?? dedupedTables.slice(0, 4).join('、') ?? baseline),
    physicalTables: {
      baseline,
      businessTimeField,
      tables: dedupedTables,
      sourceSystems: dedupedSourceSystems,
      rows: normalizedRows,
    },
  }
}

function coerceBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  const normalized = stringifyUnknown(value).trim().toLowerCase()
  if (!normalized) return false
  return ['1', 'true', 'yes', 'y', '是'].includes(normalized)
}

function resolveMapPreviewLayerKind(serviceType: string, isCached: boolean): CatalogMapPreviewLayerKind | null {
  const normalized = serviceType.trim().toLowerCase()
  if (normalized === 'amap') return 'amap'
  if (normalized === 'mapserver') {
    return isCached ? 'tile' : 'map-image'
  }
  if (normalized === 'featureserver') return 'feature'
  if (normalized === 'sceneserver') return 'scene'
  return null
}

function extractMapPreview(resource: RawResource, serviceTypeId: string): CatalogMapPreview | null {
  const statBase = parseJsonObject(resource.stat_base)
  const accessUrl = parseJsonObject(resource.access_url)

  const serviceUrl =
    stringifyUnknown(statBase?.service_url ?? statBase?.serviceUrl).trim() ||
    stringifyUnknown(accessUrl?.primary).trim()
  if (!serviceUrl) return null

  const statServiceType = stringifyUnknown(statBase?.service_type ?? statBase?.serviceType).trim()
  const serviceType = statServiceType || (serviceTypeId === '35' ? 'MapServer' : '')
  const isCached = coerceBoolean(statBase?.is_cached ?? statBase?.isCached)
  const layerKind = resolveMapPreviewLayerKind(serviceType, isCached)
  if (!layerKind) return null

  const previewUrl =
    stringifyUnknown(statBase?.preview_url ?? statBase?.previewUrl).trim() ||
    (Array.isArray(accessUrl?.items)
      ? accessUrl.items
          .filter((item): item is Record<string, unknown> => isRecord(item))
          .map((item) => stringifyUnknown(item.url).trim())
          .find(Boolean) ?? ''
      : '') ||
    `${serviceUrl}?f=jsapi`

  const authMode = stringifyUnknown(statBase?.auth_mode ?? statBase?.authMode).trim() || 'anonymous'
  const initialExtent = parseJsonObject(statBase?.initial_extent ?? statBase?.initialExtent)
  const spatialReference = parseJsonObject(statBase?.spatial_reference ?? statBase?.spatialReference)
  const isSpaceServiceResource = serviceTypeId === '35'

  if (!isSpaceServiceResource && !serviceType) {
    return null
  }

  return {
    serviceUrl,
    previewUrl,
    serviceType,
    layerKind,
    authMode,
    isCached,
    initialExtent,
    spatialReference,
  }
}

function parseResourceLinkInfo(rawValue: unknown): CatalogLinkInfo {
  const parsedValue = parseJsonLike(rawValue)
  const items: CatalogLinkInfoItem[] = []
  let primary = ''

  const addItem = (urlValue: unknown, labelValue: unknown, descriptionValue: unknown) => {
    const url = stringifyUnknown(urlValue).trim()
    if (!url) return
    items.push({
      label: stringifyUnknown(labelValue).trim() || `链接 ${items.length + 1}`,
      url,
      description: stringifyUnknown(descriptionValue).trim(),
    })
  }

  if (typeof parsedValue === 'string') {
    primary = parsedValue.trim()
    if (primary) {
      addItem(primary, '主链接', '')
    }
  } else if (Array.isArray(parsedValue)) {
    parsedValue
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .forEach((item, index) => {
        addItem(
          item.url ?? item.href ?? item.link,
          item.label ?? item.name ?? item.title ?? `链接 ${index + 1}`,
          item.description ?? item.remark ?? item.note,
        )
      })
  } else if (isRecord(parsedValue)) {
    primary =
      stringifyUnknown(parsedValue.primary ?? parsedValue.url ?? parsedValue.href ?? parsedValue.service_url ?? parsedValue.serviceUrl).trim()

    const itemCandidates = [parsedValue.items, parsedValue.links, parsedValue.list, parsedValue.urls]
    const itemList = itemCandidates.find((candidate) => Array.isArray(candidate))
    if (Array.isArray(itemList)) {
      itemList
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .forEach((item, index) => {
          addItem(
            item.url ?? item.href ?? item.link,
            item.label ?? item.name ?? item.title ?? `链接 ${index + 1}`,
            item.description ?? item.remark ?? item.note,
          )
        })
    } else {
      addItem(
        parsedValue.url ?? parsedValue.href ?? parsedValue.link,
        parsedValue.label ?? parsedValue.name ?? '主链接',
        parsedValue.description ?? parsedValue.remark,
      )
    }
  }

  if (!primary && items.length > 0) {
    primary = items[0].url
  }

  if (primary && !items.some((item) => item.url === primary)) {
    items.unshift({
      label: '主链接',
      url: primary,
      description: '',
    })
  }

  return {
    primary,
    items: Array.from(
      new Map(
        items
          .filter((item) => item.url)
          .map((item, index) => [
            `${item.label}|${item.url}`,
            {
              label: item.label || `链接 ${index + 1}`,
              url: item.url,
              description: item.description,
            },
          ]),
      ).values(),
    ),
  }
}

function buildDescription(resource: RawResource, provider: string, fields: CatalogFieldRow[], tags: string[]) {
  const summary = text(resource.summary, '')

  if (summary) {
    return `${provider}汇聚${text(resource.resource_name)}相关数据，${summary}。`
  }

  const fieldNames = fields.slice(0, 4).map((field) => field.fieldName).filter(Boolean).join('、')
  const tagSummary = tags.slice(0, 3).join('、')
  const fieldText = fieldNames ? `覆盖${fieldNames}` : '覆盖核心业务字段'

  if (tagSummary) {
    return `${provider}汇聚${text(resource.resource_name)}相关数据，${fieldText}，适用于${tagSummary}等场景。`
  }

  return `${provider}汇聚${text(resource.resource_name)}相关数据，${fieldText}，可用于目录浏览与业务协同。`
}

function buildSearchText({
  code,
  name,
  category,
  businessAttribute,
  businessAttributePath,
  industryCategory,
  businessCategory,
  businessCategoryPath,
  informationCategory,
  informationCategoryPath,
  openType,
  supplyMethod,
  sharingAttribute,
  serviceType,
  department,
  contact,
  description,
  summary,
  updateCycle,
  format,
  timeScope,
  areaScope,
  count,
  fieldRows: fields,
  sourceSystem,
  sourceTable,
  physicalTables,
  mapPreview,
  linkInfo,
  remarks,
  tags,
}: Pick<
  CatalogItem,
  | 'code'
  | 'name'
  | 'category'
  | 'businessAttribute'
  | 'businessAttributePath'
  | 'industryCategory'
  | 'businessCategory'
  | 'businessCategoryPath'
  | 'informationCategory'
  | 'informationCategoryPath'
  | 'openType'
  | 'supplyMethod'
  | 'sharingAttribute'
  | 'serviceType'
  | 'department'
  | 'contact'
  | 'tags'
  | 'description'
  | 'summary'
  | 'updateCycle'
  | 'format'
  | 'timeScope'
  | 'areaScope'
  | 'count'
  | 'fieldRows'
  | 'sourceSystem'
  | 'sourceTable'
  | 'physicalTables'
  | 'mapPreview'
  | 'linkInfo'
  | 'remarks'
>) {
  return [
    code,
    name,
    category,
    businessAttribute,
    businessAttributePath,
    industryCategory,
    businessCategory,
    businessCategoryPath,
    informationCategory,
    informationCategoryPath,
    openType,
    supplyMethod,
    sharingAttribute,
    serviceType,
    department,
    contact,
    description,
    summary,
    updateCycle,
    timeScope,
    areaScope,
    count,
    sourceSystem,
    sourceTable,
    physicalTables.baseline,
    physicalTables.businessTimeField,
    linkInfo.primary,
    remarks,
    ...tags,
    ...format,
    ...physicalTables.tables,
    ...physicalTables.sourceSystems,
    ...physicalTables.rows.flatMap((row) => [
      row.tableName,
      row.sourceSystem,
      row.businessTimeField,
      row.isBaseline ? '基准表' : '非基准表',
    ]),
    ...(mapPreview
      ? [
          mapPreview.serviceUrl,
          mapPreview.previewUrl,
          mapPreview.serviceType,
          mapPreview.layerKind,
          mapPreview.authMode,
          mapPreview.isCached ? '缓存服务' : '非缓存服务',
        ]
      : []),
    ...linkInfo.items.flatMap((item: CatalogLinkInfoItem) => [item.label, item.url, item.description]),
    ...fields.flatMap((field: CatalogFieldRow) => [field.fieldName, field.englishName, field.fieldType, field.description]),
  ].join(' ')
}

function mapResource(
  resource: RawResource,
  categoryLookup: ReturnType<typeof createCategoryLookup>,
  businessAttributeLookup: ReturnType<typeof createCategoryLookup>,
  businessCategoryLookup: ReturnType<typeof createCategoryLookup>,
  informationCategoryLookup: ReturnType<typeof createCategoryLookup>,
  providerLookup: ReturnType<typeof createCategoryLookup>,
  regionLookup: ReturnType<typeof createCategoryLookup>,
  dictMap: DictionaryMap,
  dictNameById: DictionaryNameByIdMap,
  dictValueById: DictionaryValueByIdMap,
) {
  const normalizeValue = (value: unknown) => {
    if (typeof value !== 'string') return ''
    return value.trim()
  }

  const asRelation = (value: unknown): RawDictionaryRelation | null => {
    if (!value || typeof value === 'string') return null
    return value as RawDictionaryRelation
  }

  const pickCodeById = (idLike: unknown) => {
    if (idLike == null) return ''
    const key = String(idLike).trim()
    if (!key) return ''
    return dictValueById.get(key) ?? ''
  }

  const resolveDictCode = ({
    relationValue,
    idValue,
    codeValue,
  }: {
    relationValue?: unknown
    idValue?: unknown
    codeValue?: unknown
  }) => {
    const explicitCode = normalizeValue(codeValue)
    if (explicitCode) return explicitCode

    const relation = asRelation(relationValue)
    const relationCode = normalizeValue(relation?.dictValue ?? relation?.dict_value)
    if (relationCode) return relationCode

    const idCode = pickCodeById(idValue ?? relation?.id)
    if (idCode) return idCode
    return ''
  }

  const resolveDictId = ({
    relationValue,
    idValue,
  }: {
    relationValue?: unknown
    idValue?: unknown
  }) => {
    const relation = asRelation(relationValue)
    const idLike = idValue ?? relation?.id
    if (idLike == null) return ''
    const id = String(idLike).trim()
    return id
  }

  const resolveDictName = (
    typeCode: string,
    {
      relationValue,
      idValue,
      codeValue,
    }: {
      relationValue?: unknown
      idValue?: unknown
      codeValue?: unknown
    },
  ) => {
    const relation = asRelation(relationValue)
    const relationName = normalizeValue(relation?.dictValueName ?? relation?.dict_value_name ?? relation?.name)
    if (relationName) return relationName

    const idLike = idValue ?? relation?.id
    if (idLike != null) {
      const idKey = String(idLike).trim()
      if (idKey) {
        const byIdName = dictNameById.get(idKey)
        if (byIdName) return byIdName

        const byIdCode = dictValueById.get(idKey)
        if (byIdCode) {
          const byIdCodeName = dictMap[typeCode]?.[byIdCode]
          if (byIdCodeName) return byIdCodeName
        }
      }
    }

    const code = resolveDictCode({ relationValue, idValue, codeValue })
    if (!code) return '未标注'
    return dictMap[typeCode]?.[code] || code
  }

  const fieldRows = mapFieldRows(resource.data_items ?? resource.data_items_json)
  const tags = normalizeTags(resource.resource_tags ?? resource.tags)
  const fieldCount = parseMetricNumber(resource.field_count) || fieldRows.length
  const countValue = parseMetricNumber(resource.data_volume)
  const usageCount = parseMetricNumber(resource.usage_count)
  const apiCount = 0 // Api list might be missing in reduced fields
  const code = text(resource.resource_code)
  const name = text(resource.resource_name)
  const dataLineage = parseResourceLineage(resource.data_lineage ?? resource.dataLineage, {
    resourceId: String(resource.id),
    resourceName: name,
    resourceCode: code,
  })
  
  const categoryId = String(resource.domain_category_id ?? '')
  const categoryMeta = categoryLookup.byId.get(categoryId)
  const category = categoryMeta?.name ?? '未标注'
  const industryCategory = categoryMeta?.pathLabel ?? category
  const categoryAncestorIds = categoryMeta?.ancestorIds ?? (categoryId ? [categoryId] : [])
  const businessAttributeId = String(resource.business_attribute_categorization_id ?? '')
  const businessAttributeMeta = businessAttributeLookup.byId.get(businessAttributeId)
  const businessAttributeAncestorIds = businessAttributeMeta?.ancestorIds ?? (businessAttributeId ? [businessAttributeId] : [])
  const businessAttribute = businessAttributeMeta?.name ?? '未标注'
  const businessAttributePath = businessAttributeMeta?.pathLabel ?? businessAttribute
  const businessCategoryMeta = businessCategoryLookup.byId.get(categoryId)
  const businessCategoryId = businessCategoryMeta?.id ?? ''
  const businessCategory = businessCategoryMeta?.name ?? '未标注'
  const businessCategoryPath = businessCategoryMeta?.pathLabel ?? businessCategory
  const rawInformationCategoryId = String(resource.hj417_category_id ?? resource.hj417_category?.id ?? '')
  const informationCategoryId = informationCategoryLookup.byId.get(rawInformationCategoryId)?.id ?? ''
  const informationCategoryMeta = informationCategoryLookup.byId.get(informationCategoryId)
  const informationCategoryAncestorIds = informationCategoryMeta?.ancestorIds ?? (informationCategoryId ? [informationCategoryId] : [])
  const informationCategory = informationCategoryMeta?.name ?? '未标注'
  const informationCategoryPath = informationCategoryMeta?.pathLabel ?? informationCategory

  const supplyMethodCode = resolveDictCode({
    relationValue: resource.supply_method,
    idValue: resource.supply_method_id ?? resource.supplyMethodId,
    codeValue: resource.supply_method,
  })
  const supplyMethodName = resolveDictName('data_supply_method', {
    relationValue: resource.supply_method,
    idValue: resource.supply_method_id ?? resource.supplyMethodId,
    codeValue: resource.supply_method,
  })
  const sharingAttributeName = resolveDictName('sharing_attribute', {
    relationValue: resource.sharing_attribute,
    idValue: resource.sharing_attribute_id ?? resource.sharingAttributeId,
    codeValue: resource.sharing_attribute,
  })
  const sharingAttributeId = resolveDictId({
    relationValue: resource.sharing_attribute,
    idValue: resource.sharing_attribute_id ?? resource.sharingAttributeId,
  })
  const openType = sharingAttributeName
  const serviceTypeName = resolveDictName('data_resource_type', {
    relationValue: resource.data_resource_type,
    idValue: resource.data_resource_type_id ?? resource.dataResourceTypeId,
  })
  const serviceTypeId = resolveDictId({
    relationValue: resource.data_resource_type,
    idValue: resource.data_resource_type_id ?? resource.dataResourceTypeId,
  })
  const mapPreview = extractMapPreview(resource, serviceTypeId)
  const serviceType = serviceTypeName === '未标注' ? supplyMethodName : serviceTypeName
  
  const departmentId = String(
    resource.provider_org_id ??
    resource.providerOrgId ??
    resource.provider_unit_id ??
    resource.providerUnitId ??
    '',
  )
  const providerMeta = providerLookup.byId.get(departmentId)
  const department = providerMeta?.name ?? '未标注'
  const departmentAncestorIds = providerMeta?.ancestorIds ?? (departmentId ? [departmentId] : [])
  const regionId = String(resource.region_category_id ?? resource.regionCategoryId ?? '')
  const regionMeta = regionLookup.byId.get(regionId)
  const regionAncestorIds = regionMeta?.ancestorIds ?? (regionId ? [regionId] : [])
  
  const contact = text(resource.contact_info)
  const description = buildDescription(resource, department, fieldRows, tags)
  const summary = text(resource.summary, '暂无摘要说明')
  const updateCycle = resolveDictName('update_cycle', {
    relationValue: resource.update_cycle,
    idValue: resource.update_cycle_id ?? resource.updateCycleId,
    codeValue: resource.update_cycle,
  })
  const updateCycleId = resolveDictId({
    relationValue: resource.update_cycle,
    idValue: resource.update_cycle_id ?? resource.updateCycleId,
  })
  const format = inferFormats(supplyMethodCode, dictMap)
  const timeScope = text(resource.time_range)
  const areaScope = regionMeta?.name ?? text(resource.region_coverage)
  const count =
    countValue > 0
      ? formatMetricNumber(countValue, '条')
      : text(resource.data_volume == null ? undefined : String(resource.data_volume))
  const { sourceSystem, sourceTable, physicalTables } = extractSourceInfo(resource)
  const linkInfo = parseResourceLinkInfo(resource.access_url)
  const remarks = text(resource.remarks, '')
  const searchText = buildSearchText({
    code,
    name,
    category,
    businessAttribute,
    businessAttributePath,
    industryCategory,
    businessCategory,
    businessCategoryPath,
    informationCategory,
    informationCategoryPath,
    openType,
    supplyMethod: supplyMethodName,
    sharingAttribute: sharingAttributeName,
    serviceType,
    department,
    contact,
    tags,
    description,
    summary,
    updateCycle,
    format,
    timeScope,
    areaScope,
    count,
    fieldRows,
    sourceSystem,
    sourceTable,
    physicalTables,
    mapPreview,
    linkInfo,
    remarks,
  })

  return {
    id: String(resource.id),
    code,
    name,
    categoryId,
    category,
    categoryAncestorIds,
    businessAttributeId,
    businessAttribute,
    businessAttributePath,
    businessAttributeAncestorIds,
    industryCategory,
    businessCategoryId,
    businessCategory,
    businessCategoryPath,
    informationCategoryId,
    informationCategoryAncestorIds,
    informationCategory,
    informationCategoryPath,
    openTypeId: sharingAttributeId,
    openType,
    serviceTypeId,
    serviceType,
    departmentId,
    department,
    departmentAncestorIds,
    regionId,
    regionAncestorIds,
    contact,
    tags,
    description,
    summary,
    updateCycleId,
    updateCycle,
    format,
    timeScope,
    publishDate: formatDate(resource.published_at),
    updateTime: resource.data_updated_at ? formatDateTime(resource.data_updated_at) : formatDate(resource.published_at),
    areaScope,
    count,
    countValue,
    fieldCount,
    usageCount,
    apiCount,
    fieldRows,
    dataLineage,
    sourceSystem,
    sourceTable,
    physicalTables,
    mapPreview,
    linkInfo,
    remarks,
    searchText,
    supplyMethod: supplyMethodName,
    sharingAttribute: sharingAttributeName,
  } satisfies CatalogItem
}

function buildOptions(items: CatalogItem[], selector: (item: CatalogItem) => string) {
  const counts = new Map<string, number>()

  items.forEach((item) => {
    const key = selector(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  const sorted = Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1]
    return left[0].localeCompare(right[0], 'zh-CN')
  })

  return [['全部', items.length], ...sorted] satisfies PrimitiveOption
}

function buildRegionOptions(items: CatalogItem[], regionCategories: Array<{ name: string }>) {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    counts.set(item.areaScope, (counts.get(item.areaScope) ?? 0) + 1)
  })

  const orderedLabels = Array.from(
    new Set(
      regionCategories
        .map((region) => region.name.trim())
        .filter(Boolean),
    ),
  )
  const orderedLabelSet = new Set(orderedLabels)
  const extraLabels = Array.from(counts.entries())
    .filter(([label]) => !orderedLabelSet.has(label))
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0], 'zh-CN')
    })
    .map(([label]) => label)

  const options: PrimitiveOption = [['全部', items.length]]
  ;[...orderedLabels, ...extraLabels].forEach((label) => {
    options.push([label, counts.get(label) ?? 0])
  })

  return options
}

function buildDictionarySelectOptions(items: RawDictionaryItem[], typeCode: string): SelectOption[] {
  return items
    .filter((item) => (item.typeCode ?? item.type_code ?? '').trim() === typeCode)
    .map((item) => ({
      value: item.id == null ? '' : String(item.id).trim(),
      label: (item.dictValueName ?? item.dict_value_name ?? '').trim(),
      sort: Number(item.dictSort ?? item.dict_sort ?? 0),
    }))
    .filter((item) => item.value && item.label)
    .sort((left, right) => {
      if (left.sort !== right.sort) return left.sort - right.sort
      return left.label.localeCompare(right.label, 'zh-CN')
    })
    .map(({ value, label }) => ({ value, label }))
}

async function fetchPortalDataInternal(mode: PortalDataMode) {
  const availableCollections = await getAvailableCollectionNames()
  const categoryTreeCollection = resolveCollectionName(availableCollections, ['jcCategoryTreeNodes'])
  const dictionaryCollection = resolveCollectionName(availableCollections, ['jcDictionaryItems'])

  // Try to use cached raw resources for list mode to avoid the slow API call
  let allResources: RawResource[] | null = null
  const rawResourcesCache = mode === 'list'
    ? readStorageCache<RawResource[]>(LS_CACHE_RAW_RESOURCES)
    : null
  const hasCachedResources = rawResourcesCache?.data && isCacheFresh(rawResourcesCache.cachedAt)
  if (hasCachedResources) {
    allResources = sortResourcesByDisplaySeq(rawResourcesCache.data)
  }

  const resourcesPromise = allResources
    ? Promise.resolve(allResources)
    : loadAllPagesParallel(async ({ page, pageSize }) => {
        const response = await nocobaseClient.resource('eco_data_resources').list({
          page,
          pageSize,
          sort: 'display_seq',
          fields: getPortalResourceFields(mode),
        })
        return response.data as ListResponse<RawResource>
      }, getPortalResourcePageSize(mode))
        .then((result) => {
          const sortedResult = sortResourcesByDisplaySeq(result)
          // Persist raw resource response for list mode
          if (mode === 'list' && sortedResult.length > 0) {
            writeStorageCache(LS_CACHE_RAW_RESOURCES, sortedResult)
          }
          return sortedResult
        })

  const [allNodes, allDictItems, allResourcesResult] = await Promise.all([
    loadAllPages(async ({ page, pageSize }) => {
      const response = await nocobaseClient.resource(categoryTreeCollection).list({
        page,
        pageSize,
        sort: categoryTreeCollection === 'jcCategoryTreeNodes' ? 'nodeSort' : 'node_sort',
      })
      return response.data as ListResponse<RawCategoryTreeNode>
    }, PORTAL_TREE_NODE_PAGE_SIZE),
    loadAllPages(async ({ page, pageSize }) => {
      const response = await nocobaseClient.resource(dictionaryCollection).list({
        page,
        pageSize,
        sort: 'dictSort',
      })
      return response.data as ListResponse<RawDictionaryItem>
    }, PORTAL_DICTIONARY_PAGE_SIZE),
    resourcesPromise,
  ])
  allResources = allResourcesResult

  // Process Dictionaries
  const dictMap: DictionaryMap = {}
  const dictNameById: DictionaryNameByIdMap = new Map()
  const dictValueById: DictionaryValueByIdMap = new Map()
  allDictItems.forEach((item) => {
    const id = item.id == null ? '' : String(item.id).trim()
    const typeCode = (item.typeCode ?? item.type_code ?? '').trim()
    const dictValue = (item.dictValue ?? item.dict_value ?? '').trim()
    const dictValueName = (item.dictValueName ?? item.dict_value_name ?? '').trim()

    if (id && dictValue) {
      dictValueById.set(id, dictValue)
    }

    if (id && dictValueName) {
      dictNameById.set(id, dictValueName)
    }

    if (!typeCode || !dictValue || !dictValueName) {
      return
    }

    if (!dictMap[typeCode]) {
      dictMap[typeCode] = {}
    }
    dictMap[typeCode][dictValue] = dictValueName
  })

  const normalizedNodes = allNodes
    .map((node) => normalizeTreeNode(node as Record<string, unknown>))
    .filter((node): node is NonNullable<ReturnType<typeof normalizeTreeNode>> => Boolean(node))

  const domainCategorySeedIds = allResources
    .map((resource) => (resource.domain_category_id == null ? '' : String(resource.domain_category_id).trim()))
    .filter(Boolean)
  const businessCategorySeedIds = allResources
    .map((resource) => (resource.domain_category_id == null ? '' : String(resource.domain_category_id).trim()))
    .filter(Boolean)
  const businessAttributeSeedIds = allResources
    .map((resource) =>
      resource.business_attribute_categorization_id == null
        ? ''
        : String(resource.business_attribute_categorization_id).trim(),
    )
    .filter(Boolean)
  const informationCategorySeedIds = allResources
    .map((resource) => (resource.hj417_category_id == null ? '' : String(resource.hj417_category_id).trim()))
    .filter(Boolean)
  const providerUnitSeedIds = allResources
    .map((resource) => {
      const providerId =
        resource.provider_org_id ??
        resource.providerOrgId ??
        resource.provider_unit_id ??
        resource.providerUnitId
      return providerId == null ? '' : String(providerId).trim()
    })
    .filter(Boolean)
  const regionCategorySeedIds = allResources
    .map((resource) => {
      const regionId = resource.region_category_id ?? resource.regionCategoryId
      return regionId == null ? '' : String(regionId).trim()
    })
    .filter(Boolean)
  const allBusinessCategoryNodes = normalizedNodes.filter((node) => node.typeCode === 'eco_domain_category')
  const allBusinessAttributeNodes = normalizedNodes.filter((node) => node.typeCode === 'business_attribute_categorization')
  const allInformationCategoryNodes = normalizedNodes.filter((node) => node.typeCode === 'HJ417-2025')
  const allProviderUnitNodes = normalizedNodes.filter((node) => node.typeCode === 'eco_provider_units')
  const allRegionNodes = normalizedNodes.filter((node) => node.typeCode === 'eco_region_categories')

  const domainCategories = buildTreeSubsetBySeedIds(
    allBusinessCategoryNodes.length > 0 ? allBusinessCategoryNodes : normalizedNodes,
    domainCategorySeedIds,
  )
  const businessCategories = buildTreeSubsetBySeedIds(allBusinessCategoryNodes, businessCategorySeedIds)
  const businessAttributeCategories =
    allBusinessAttributeNodes.length > 0
      ? buildTreeSubsetBySeedIds(allBusinessAttributeNodes, businessAttributeSeedIds)
      : buildTreeSubsetBySeedIds(normalizedNodes, businessAttributeSeedIds)
  const informationCategories =
    allInformationCategoryNodes.length > 0
      ? buildTreeSubsetBySeedIds(allInformationCategoryNodes, allInformationCategoryNodes.map((node) => node.id))
      : buildTreeSubsetBySeedIds(normalizedNodes, informationCategorySeedIds)
  const providerUnits =
    allProviderUnitNodes.length > 0
      ? buildTreeSubsetBySeedIds(allProviderUnitNodes, allProviderUnitNodes.map((node) => node.id))
      : buildTreeSubsetBySeedIds(normalizedNodes, providerUnitSeedIds)
  const regionCategories =
    allRegionNodes.length > 0
      ? buildTreeSubsetBySeedIds(allRegionNodes, allRegionNodes.map((node) => node.id))
      : buildTreeSubsetBySeedIds(normalizedNodes, regionCategorySeedIds)

  const categoryLookup = createCategoryLookup(domainCategories)
  const businessAttributeLookup = createCategoryLookup(businessAttributeCategories)
  const businessCategoryLookup = createCategoryLookup(businessCategories)
  const informationCategoryLookup = createCategoryLookup(informationCategories)
  const providerLookup = createCategoryLookup(providerUnits)
  const regionLookup = createCategoryLookup(regionCategories)
  const resourceById = new Map(allResources.map((resource) => [String(resource.id), resource]))
  
  let catalogItems = allResources.map((resource) => 
    mapResource(
      resource,
      categoryLookup,
      businessAttributeLookup,
      businessCategoryLookup,
      informationCategoryLookup,
      providerLookup,
      regionLookup,
      dictMap,
      dictNameById,
      dictValueById,
    )
  )
  const { categories: adjustedDomainCategories, items: adjustedCatalogItems } = realignNoiseResourcesToBusinessCategory(domainCategories, catalogItems)
  catalogItems = adjustedCatalogItems
  const { categories: mapAdjustedDomainCategories, items: mapAdjustedCatalogItems } = realignMapResourcesToTopLevelMapCategory(adjustedDomainCategories, catalogItems)
  catalogItems = mapAdjustedCatalogItems

  const categoryTree = buildCatalogCategoryTree(
    mapAdjustedDomainCategories,
    mapAdjustedCatalogItems
      .filter((item) => item.categoryId)
      .map((item) => ({
        categoryId: item.categoryId,
        categoryAncestorIds: item.categoryAncestorIds,
      })),
  )
  const sourceTree = buildCatalogCategoryTree(
    providerUnits,
    catalogItems
      .filter((item) => item.departmentId)
      .map((item) => ({
        categoryId: item.departmentId,
        categoryAncestorIds: item.departmentAncestorIds,
      })),
  )
  const businessAttributeTree = buildCatalogCategoryTree(
    businessAttributeCategories,
    catalogItems
      .filter((item) => item.businessAttributeId)
      .map((item) => ({
        categoryId: item.businessAttributeId,
        categoryAncestorIds: item.businessAttributeAncestorIds,
      })),
  )
  const regionTree = buildCatalogCategoryTree(
    regionCategories,
    catalogItems
      .map((item) => {
        const resource = resourceById.get(item.id)
        const regionId = String(resource?.region_category_id ?? resource?.regionCategoryId ?? '').trim()
        const matched = regionLookup.byId.get(regionId)
        return {
          categoryId: matched?.id ?? '',
          categoryAncestorIds: matched?.ancestorIds ?? [],
        }
      })
      .filter((item) => item.categoryId),
  )
  const informationCategoryTree = buildCatalogCategoryTree(
    informationCategories,
    catalogItems
      .filter((item) => item.informationCategoryId)
      .map((item) => ({
        categoryId: item.informationCategoryId,
        categoryAncestorIds: item.informationCategoryAncestorIds,
      })),
  )

  return {
    catalogItems,
    categoryTree,
    businessAttributeTree,
    sourceTree,
    regionTree,
    informationCategoryTree,
    categoryOptions: buildOptions(catalogItems, (item) => item.category),
    openOptions: buildOptions(catalogItems, (item) => item.openType),
    departmentOptions: buildOptions(catalogItems, (item) => item.department),
    regionOptions: buildRegionOptions(catalogItems, regionCategories),
    editOptions: {
      updateCycleOptions: buildDictionarySelectOptions(allDictItems, 'update_cycle'),
      sharingAttributeOptions: buildDictionarySelectOptions(allDictItems, 'sharing_attribute'),
      serviceTypeOptions: buildDictionarySelectOptions(allDictItems, 'data_resource_type'),
      supplyMethodOptions: buildDictionarySelectOptions(allDictItems, 'data_supply_method'),
    },
  } satisfies PortalData
}

async function fetchPortalData(mode: PortalDataMode) {
  // Memory cache hit
  const cachedData = readPortalDataCache(mode)
  if (cachedData) return cachedData

  // Check localStorage for list mode data before network fetch
  if (mode === 'list') {
    const lsCache = readStorageCache<PortalData>(LS_CACHE_PORTAL_LIST)
    if (lsCache?.data && isCacheFresh(lsCache.cachedAt)) {
      portalDataCache.list = lsCache.data
      return lsCache.data
    }
  }

  // Deduplicate concurrent requests
  if (portalDataPromise[mode]) {
    return portalDataPromise[mode] as Promise<PortalData>
  }

  portalDataPromise[mode] = fetchPortalDataInternal(mode)
    .then((result) => {
      portalDataCache[mode] = result
      if (mode === 'list') {
        writeStorageCache(LS_CACHE_PORTAL_LIST, result)
      }
      return result
    })
    .catch((error) => {
      if (!isDemoFallbackEnabled()) {
        throw error
      }

      const fallback = createDemoPortalData()
      portalDataCache[mode] = fallback
      if (mode === 'list') {
        writeStorageCache(LS_CACHE_PORTAL_LIST, fallback)
      }
      return fallback
    })
    .finally(() => {
      portalDataPromise[mode] = null
    })

  return portalDataPromise[mode] as Promise<PortalData>
}

export function clearPortalDataCache() {
  portalDataCache = {
    full: null,
    list: null,
  }
  portalDataPromise = {
    full: null,
    list: null,
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_CACHE_PORTAL_LIST)
      localStorage.removeItem(LS_CACHE_RAW_RESOURCES)
    }
  } catch { /* ignore */ }
}

export function usePortalCatalogData(enabled = true, mode: PortalDataMode = 'full') {
  const portalData = usePortalDataFetcher(enabled, mode)
  return useMemo(
    () => ({
      data: portalData.data,
      catalogItems: portalData.data.catalogItems,
      isLoading: portalData.isLoading,
      error: portalData.error,
      refresh: portalData.refresh,
    }),
    [portalData],
  )
}

export function usePortalDataFetcher(enabled = true, mode: PortalDataMode = 'full') {
  const [data, setData] = useState<PortalData>(() => readPortalDataCache(mode) ?? EMPTY_PORTAL_DATA)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    clearPortalDataCache()
    setIsLoading(true)
    try {
      const next = await fetchPortalData(mode)
      setData(next)
      setError(null)
    } catch (fetchError) {
      setData(EMPTY_PORTAL_DATA)
      setError(toErrorMessage(fetchError, '目录数据刷新失败'))
    } finally {
      setIsLoading(false)
    }
  }, [mode])

  useEffect(() => {
    let cancelled = false

    if (!enabled) {
      return () => {
        cancelled = true
      }
    }

    const cachedData = readPortalDataCache(mode)
    if (cachedData) {
      setData(cachedData)
      setError(null)
      setIsLoading(false)

      // Background refresh for list mode if cached data is stale
      if (mode === 'list') {
        const lsCache = readStorageCache<PortalData>(LS_CACHE_PORTAL_LIST)
        if (!lsCache || !isCacheFresh(lsCache.cachedAt)) {
          portalDataCache.list = null
          fetchPortalData('list')
            .then((next) => {
              if (!cancelled) setData(next)
            })
            .catch(() => { /* keep stale data on error */ })
        }
      }
      return () => {
        cancelled = true
      }
    }

    setData(EMPTY_PORTAL_DATA)
    setIsLoading(true)

    fetchPortalData(mode)
      .then((next) => {
        if (!cancelled) {
          setData(next)
          setError(null)
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setData(EMPTY_PORTAL_DATA)
          setError(toErrorMessage(fetchError, '目录数据加载失败'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled, mode])

  return useMemo(
    () => ({
      data,
      isLoading,
      error,
      refresh,
    }),
    [data, error, isLoading, refresh],
  )
}
