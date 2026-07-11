import { useEffect, useMemo, useState } from 'react'
import { nocobaseClient, toErrorMessage } from './nocobase-client'

export type DataProductViewMode = 'tree-table' | 'table' | 'calendar' | 'kanban' | 'graph' | 'script'

export type DataProductRecord = Record<string, string | number | boolean | null>

export type DataProductField = {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'status' | 'tag'
}

export type DataProductDimension = {
  id: string
  label: string
  field: string
}

export type DataProductApiConfig = {
  endpoint: string
  method: 'GET' | 'POST'
  authMode: string
  refreshInterval: string
}

export type DataProductAuthorizationStatus = 'authorized' | 'restricted'

export type DataProductDefinition = {
  id: string
  name: string
  summary: string
  domain: string
  owner: string
  updateCycle: string
  api: DataProductApiConfig
  fields: DataProductField[]
  dimensions: DataProductDimension[]
  supportedModes: DataProductViewMode[]
  defaultMode: DataProductViewMode
  statusField: string
  dateField: string
  primaryField: string
  authorizationStatus: DataProductAuthorizationStatus
  sampleRows: DataProductRecord[]
  scriptSource: string
}

export type DataProductScriptCard = {
  label: string
  value: string
  note: string
  tone: 'blue' | 'green' | 'amber'
}

type RawDataProductRecord = {
  id?: unknown
  product_code?: unknown
  name?: unknown
  summary?: unknown
  domain?: unknown
  owner?: unknown
  update_cycle?: unknown
  api_endpoint?: unknown
  api_method?: unknown
  api_auth_mode?: unknown
  api_refresh_interval?: unknown
  fields_json?: unknown
  dimensions_json?: unknown
  supported_modes?: unknown
  default_mode?: unknown
  status_field?: unknown
  date_field?: unknown
  primary_field?: unknown
  authorization_status?: unknown
  sample_rows_json?: unknown
  script_source?: unknown
  sort_order?: unknown
}

type RawListResponse<T> = {
  data?: T[]
  meta?: {
    totalPage?: number
  }
}

const DATA_PRODUCT_COLLECTION = 'eco_data_products'
const DATA_PRODUCT_PAGE_SIZE = 200
const EMPTY_DATA_PRODUCTS: DataProductDefinition[] = []

export const DATA_PRODUCT_VIEW_MODE_LABELS: Record<DataProductViewMode, string> = {
  'tree-table': '树表',
  table: '表格',
  calendar: '日历',
  kanban: '看板',
  graph: '图谱',
  script: '脚本',
}

let dataProductsCache: DataProductDefinition[] | null = null
let dataProductsPromise: Promise<DataProductDefinition[]> | null = null

function normalizeText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized || fallback
}

function normalizeJsonArray(value: unknown) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function normalizeFieldType(value: unknown): DataProductField['type'] {
  return value === 'number' || value === 'date' || value === 'status' || value === 'tag' ? value : 'text'
}

function normalizeViewMode(value: unknown): DataProductViewMode | null {
  if (
    value === 'tree-table'
    || value === 'table'
    || value === 'calendar'
    || value === 'kanban'
    || value === 'graph'
    || value === 'script'
  ) {
    return value
  }
  return null
}

function normalizeFields(value: unknown): DataProductField[] {
  return normalizeJsonArray(value)
    .map((item): DataProductField | null => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const key = normalizeText(record.key)
      const label = normalizeText(record.label, key)
      if (!key) return null
      return { key, label, type: normalizeFieldType(record.type) }
    })
    .filter((item): item is DataProductField => Boolean(item))
}

function normalizeDimensions(value: unknown): DataProductDimension[] {
  return normalizeJsonArray(value)
    .map((item): DataProductDimension | null => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const field = normalizeText(record.field)
      if (!field) return null
      return {
        id: normalizeText(record.id, field),
        label: normalizeText(record.label, field),
        field,
      }
    })
    .filter((item): item is DataProductDimension => Boolean(item))
}

function normalizeViewModes(value: unknown): DataProductViewMode[] {
  const modes = normalizeJsonArray(value)
    .map((item) => normalizeViewMode(item))
    .filter((item): item is DataProductViewMode => Boolean(item))
  return modes.length > 0 ? modes : ['table']
}

function normalizeAuthorizationStatus(value: unknown): DataProductAuthorizationStatus {
  return normalizeText(value) === 'restricted' ? 'restricted' : 'authorized'
}

function normalizeApiMethod(value: unknown): DataProductApiConfig['method'] {
  return normalizeText(value).toUpperCase() === 'POST' ? 'POST' : 'GET'
}

function normalizeCellValue(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value
  }
  if (value == null) return null
  return String(value)
}

function normalizeRows(payload: unknown): DataProductRecord[] {
  const rawRows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
        ? (payload as { items: unknown[] }).items
        : payload && typeof payload === 'object' && Array.isArray((payload as { rows?: unknown }).rows)
          ? (payload as { rows: unknown[] }).rows
          : []

  return rawRows
    .filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object' && !Array.isArray(row))
    .map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, normalizeCellValue(value)]),
    ))
}

function normalizeDataProduct(record: RawDataProductRecord): DataProductDefinition | null {
  const id = normalizeText(record.product_code, normalizeText(record.id))
  const name = normalizeText(record.name)
  if (!id || !name) return null

  const fields = normalizeFields(record.fields_json)
  const dimensions = normalizeDimensions(record.dimensions_json)
  const supportedModes = normalizeViewModes(record.supported_modes)
  const defaultMode = normalizeViewMode(record.default_mode) ?? supportedModes[0] ?? 'table'

  return {
    id,
    name,
    summary: normalizeText(record.summary, '暂无摘要说明'),
    domain: normalizeText(record.domain, '未标注领域'),
    owner: normalizeText(record.owner, '未标注责任单位'),
    updateCycle: normalizeText(record.update_cycle, '未标注'),
    api: {
      endpoint: normalizeText(record.api_endpoint),
      method: normalizeApiMethod(record.api_method),
      authMode: normalizeText(record.api_auth_mode, '平台授权'),
      refreshInterval: normalizeText(record.api_refresh_interval, '按需'),
    },
    fields,
    dimensions,
    supportedModes,
    defaultMode,
    statusField: normalizeText(record.status_field, 'status'),
    dateField: normalizeText(record.date_field, 'updatedAt'),
    primaryField: normalizeText(record.primary_field, 'name'),
    authorizationStatus: normalizeAuthorizationStatus(record.authorization_status),
    sampleRows: normalizeRows(record.sample_rows_json),
    scriptSource: normalizeText(record.script_source, 'return []'),
  }
}

async function fetchDataProductsInternal() {
  const rows: RawDataProductRecord[] = []
  let page = 1

  for (;;) {
    const response = await nocobaseClient.resource(DATA_PRODUCT_COLLECTION).list({
      page,
      pageSize: DATA_PRODUCT_PAGE_SIZE,
      sort: 'sort_order',
    })
    const payload = response.data as RawListResponse<RawDataProductRecord>
    rows.push(...(payload.data ?? []))
    const totalPage = Number(payload.meta?.totalPage ?? 0)
    if (!totalPage || page >= totalPage) break
    page += 1
  }

  return rows
    .map((row) => normalizeDataProduct(row))
    .filter((item): item is DataProductDefinition => Boolean(item))
}

export function clearDataProductsCache() {
  dataProductsCache = null
  dataProductsPromise = null
}

export async function fetchDataProducts(options: { force?: boolean } = {}) {
  if (options.force) {
    clearDataProductsCache()
  }

  if (dataProductsCache) return dataProductsCache
  if (dataProductsPromise) return dataProductsPromise

  dataProductsPromise = fetchDataProductsInternal()
    .then((products) => {
      dataProductsCache = products
      return products
    })
    .finally(() => {
      dataProductsPromise = null
    })

  return dataProductsPromise
}

export function useDataProducts(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled !== false
  const [products, setProducts] = useState<DataProductDefinition[]>(() => dataProductsCache ?? EMPTY_DATA_PRODUCTS)
  const [isLoading, setIsLoading] = useState(enabled && !dataProductsCache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setProducts(EMPTY_DATA_PRODUCTS)
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(!dataProductsCache)
    setError(null)

    fetchDataProducts()
      .then((payload) => {
        if (!cancelled) setProducts(payload)
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setProducts(EMPTY_DATA_PRODUCTS)
          setError(toErrorMessage(fetchError, '数据产品加载失败'))
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return useMemo(() => ({ products, isLoading, error }), [error, isLoading, products])
}

export function useDataProduct(productId: string | undefined) {
  const { products, isLoading, error } = useDataProducts()
  const normalizedId = normalizeText(productId)
  const product = useMemo(
    () => products.find((item) => item.id === normalizedId) ?? null,
    [normalizedId, products],
  )

  return useMemo(() => ({ product, products, isLoading, error }), [error, isLoading, product, products])
}

export function getDefaultDataProductView(product: DataProductDefinition) {
  return product.supportedModes.includes(product.defaultMode) ? product.defaultMode : product.supportedModes[0] ?? 'table'
}

async function fetchDataProductRows(product: DataProductDefinition, signal: AbortSignal) {
  if (!product.api.endpoint || product.api.endpoint.startsWith('nocobase://')) {
    return product.sampleRows
  }

  const response = await fetch(product.api.endpoint, {
    method: product.api.method,
    headers: {
      Accept: 'application/json',
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(`数据产品接口返回 ${response.status}`)
  }

  return normalizeRows(await response.json())
}

export function useDataProductRows(product: DataProductDefinition | null) {
  const [rows, setRows] = useState<DataProductRecord[]>(() => product?.sampleRows ?? [])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!product) {
      setRows([])
      setError(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setRows(product.sampleRows)
    setIsLoading(true)
    setError(null)

    fetchDataProductRows(product, controller.signal)
      .then((nextRows) => {
        setRows(nextRows.length > 0 ? nextRows : product.sampleRows)
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return
        setRows(product.sampleRows)
        setError(fetchError instanceof Error ? fetchError.message : '数据产品接口加载失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [product])

  return useMemo(() => ({ rows, isLoading, error }), [error, isLoading, rows])
}

export function stringifyRecordValue(value: DataProductRecord[string]) {
  if (value === null || value === undefined || value === '') return '未标注'
  return String(value)
}

export function filterDataProductRows(
  rows: DataProductRecord[],
  keyword: string,
  dimensionField: string,
  dimensionValue: string,
) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  return rows.filter((row) => {
    const keywordMatched = !normalizedKeyword || Object.values(row).some((value) =>
      stringifyRecordValue(value).toLowerCase().includes(normalizedKeyword),
    )
    const dimensionMatched = !dimensionField || !dimensionValue || stringifyRecordValue(row[dimensionField]) === dimensionValue
    return keywordMatched && dimensionMatched
  })
}

export function buildDataProductFacetOptions(rows: DataProductRecord[], field: string) {
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    const value = stringifyRecordValue(row[field])
    counts.set(value, (counts.get(value) ?? 0) + 1)
  })

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([label, count]) => ({ label, count }))
}

export function buildDataProductMetricCards(product: DataProductDefinition, rows: DataProductRecord[]) {
  const statusCount = new Set(rows.map((row) => stringifyRecordValue(row[product.statusField]))).size
  const dimensionCount = product.dimensions.length
  const avgScore = rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / Math.max(rows.length, 1)

  return [
    { label: '可查数据', value: `${rows.length}`, note: '当前接口返回记录数' },
    { label: '检索维度', value: `${dimensionCount}`, note: '可组合筛选维度' },
    { label: '状态类型', value: `${statusCount}`, note: '用于看板和图谱分组' },
    { label: '质量评分', value: Number.isFinite(avgScore) ? avgScore.toFixed(1) : '-', note: '按 score 字段动态汇总' },
  ]
}

function normalizeScriptCards(value: unknown): DataProductScriptCard[] {
  if (!Array.isArray(value)) return []

  return value.slice(0, 6).map((item, index) => {
    const record = item && typeof item === 'object' ? item as Partial<DataProductScriptCard> : {}
    const tone = record.tone === 'green' || record.tone === 'amber' || record.tone === 'blue' ? record.tone : 'blue'
    return {
      label: typeof record.label === 'string' && record.label.trim() ? record.label.trim() : `脚本指标 ${index + 1}`,
      value: typeof record.value === 'string' && record.value.trim() ? record.value.trim() : stringifyRecordValue(record.value as string | number | boolean | null),
      note: typeof record.note === 'string' ? record.note : '由数据产品脚本动态生成',
      tone,
    }
  })
}

export function runDataProductScript(product: DataProductDefinition, rows: DataProductRecord[]) {
  try {
    const script = new Function(
      'context',
      `"use strict";
const window = undefined;
const document = undefined;
const localStorage = undefined;
const sessionStorage = undefined;
const fetch = undefined;
const { rows, product, metrics } = context;
${product.scriptSource}`,
    ) as (context: {
      rows: DataProductRecord[]
      product: DataProductDefinition
      metrics: ReturnType<typeof buildDataProductMetricCards>
    }) => unknown

    return normalizeScriptCards(script({
      rows,
      product,
      metrics: buildDataProductMetricCards(product, rows),
    }))
  } catch (error) {
    return [
      {
        label: '脚本执行失败',
        value: '0',
        note: error instanceof Error ? error.message : '请检查数据产品脚本配置',
        tone: 'amber' as const,
      },
    ]
  }
}
