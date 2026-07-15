import { useEffect, useState } from 'react'
import { assertCanManageCatalogResources } from './admin-role'
import { nocobaseClient, toErrorMessage } from './nocobase-client'

type RawEditableResource = {
  id?: number | string
  resource_code?: string | null
  resource_name?: string | null
  data_source_id?: number | string | null
  protection_level?: string | null
  summary?: string | null
  contact_info?: string | null
  domain_category_id?: number | string | null
  provider_org_id?: number | string | null
  provider_unit_id?: number | string | null
  hj417_category_id?: number | string | null
  sharing_attribute_id?: number | string | null
  data_resource_type_id?: number | string | null
  supply_method_id?: number | string | null
  update_cycle_id?: number | string | null
  time_range?: string | null
  region_category_id?: number | string | null
  region_coverage?: string | null
  remarks?: string | null
  tags?: unknown
  source_table?: string | null
  stat_base?: unknown
  access_url?: unknown
}

export type EditableResourceRecord = {
  id: string
  resourceCode: string
  resourceName: string
  dataSourceId: string
  protectionLevel: string
  summary: string
  contactInfo: string
  domainCategoryId: string
  providerField: 'provider_org_id' | 'provider_unit_id'
  providerNodeId: string
  informationCategoryId: string
  sharingAttributeId: string
  dataResourceTypeId: string
  supplyMethodId: string
  updateCycleId: string
  timeRange: string
  regionCategoryId: string
  regionCoverage: string
  remarks: string
  tags: string[]
  baselineTable: string
  querySql: string
  queryDefaultParamsText: string
  statBase: Record<string, unknown>
}

export type EditableResourceLinkItem = {
  id: string
  label: string
  url: string
  description: string
}

export type EditableResourceLinkRecord = {
  primary: string
  items: EditableResourceLinkItem[]
}

const EMPTY_EDITABLE_RESOURCE: EditableResourceRecord = {
  id: '',
  resourceCode: '',
  resourceName: '',
  dataSourceId: '',
  protectionLevel: 'l2',
  summary: '',
  contactInfo: '',
  domainCategoryId: '',
  providerField: 'provider_org_id',
  providerNodeId: '',
  informationCategoryId: '',
  sharingAttributeId: '',
  dataResourceTypeId: '',
  supplyMethodId: '',
  updateCycleId: '',
  timeRange: '',
  regionCategoryId: '',
  regionCoverage: '',
  remarks: '',
  tags: [],
  baselineTable: '',
  querySql: '',
  queryDefaultParamsText: '{}',
  statBase: {},
}

const EMPTY_EDITABLE_RESOURCE_LINKS: EditableResourceLinkRecord = {
  primary: '',
  items: [],
}

export function createEmptyEditableResource(): EditableResourceRecord {
  return {
    ...EMPTY_EDITABLE_RESOURCE,
    tags: [],
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  return value == null ? '' : String(value).trim()
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeText(item)).filter(Boolean)
}

function createDraftLinkId(seed = '') {
  return `access-link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${seed ? `-${seed}` : ''}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonRecord(value: unknown) {
  if (isRecord(value)) return value
  if (typeof value !== 'string') return {}

  const normalized = value.trim()
  if (!normalized) return {}

  try {
    const parsed = JSON.parse(normalized)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const normalized = value.trim()
  if (!normalized) return null
  try {
    return JSON.parse(normalized)
  } catch {
    return normalized
  }
}

function mapEditableResourceLinkInfo(rawValue: unknown): EditableResourceLinkRecord {
  const parsed = parseJsonValue(rawValue)
  const items: EditableResourceLinkItem[] = []
  let primary = ''

  const addItem = (urlValue: unknown, labelValue: unknown, descriptionValue: unknown, seed = '') => {
    const url = normalizeText(urlValue)
    if (!url) return
    items.push({
      id: createDraftLinkId(seed || String(items.length + 1)),
      label: normalizeText(labelValue),
      url,
      description: normalizeText(descriptionValue),
    })
  }

  if (typeof parsed === 'string') {
    primary = parsed
    addItem(parsed, '主链接', '', 'primary')
  } else if (Array.isArray(parsed)) {
    parsed
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .forEach((item, index) => {
        addItem(item.url ?? item.href ?? item.link, item.label ?? item.name ?? item.title, item.description ?? item.remark ?? item.note, String(index))
      })
  } else if (isRecord(parsed)) {
    primary = normalizeText(parsed.primary ?? parsed.url ?? parsed.href ?? parsed.service_url ?? parsed.serviceUrl)
    const itemList = [parsed.items, parsed.links, parsed.list, parsed.urls].find((candidate) => Array.isArray(candidate))
    if (Array.isArray(itemList)) {
      itemList
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .forEach((item, index) => {
          addItem(item.url ?? item.href ?? item.link, item.label ?? item.name ?? item.title, item.description ?? item.remark ?? item.note, String(index))
        })
    } else {
      addItem(parsed.url ?? parsed.href ?? parsed.link, parsed.label ?? parsed.name, parsed.description ?? parsed.remark, 'single')
    }
  }

  if (!primary && items.length > 0) {
    primary = items[0].url
  }

  if (primary && !items.some((item) => item.url === primary)) {
    items.unshift({
      id: createDraftLinkId('primary'),
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
          .filter((item) => item.url.trim())
          .map((item) => [`${item.label.trim()}|${item.url.trim()}`, item]),
      ).values(),
    ),
  }
}

function buildAccessUrlValues(values: EditableResourceLinkRecord) {
  const primary = normalizeText(values.primary)
  const items = values.items
    .map((item, index) => ({
      label: normalizeText(item.label) || `链接 ${index + 1}`,
      url: normalizeText(item.url),
      description: normalizeText(item.description),
    }))
    .filter((item) => item.url)

  const normalizedPrimary = primary || items[0]?.url || ''
  if (!normalizedPrimary && items.length === 0) {
    return null
  }

  const normalizedItems = items.some((item) => item.url === normalizedPrimary)
    ? items
    : [{ label: '主链接', url: normalizedPrimary, description: '' }, ...items]

  return {
    primary: normalizedPrimary,
    items: normalizedItems,
  }
}

function mapEditableResource(raw: RawEditableResource): EditableResourceRecord {
  const providerOrgId = normalizeId(raw.provider_org_id)
  const providerUnitId = normalizeId(raw.provider_unit_id)
  const statBase = parseJsonRecord(raw.stat_base)
  const apiQuery = parseJsonRecord(statBase.api_query ?? statBase.apiQuery)
  const defaultParams = parseJsonRecord(apiQuery.default_params ?? apiQuery.defaultParams)
  return {
    id: normalizeId(raw.id),
    resourceCode: normalizeText(raw.resource_code),
    resourceName: normalizeText(raw.resource_name),
    dataSourceId: normalizeId(raw.data_source_id),
    protectionLevel: normalizeText(raw.protection_level) || 'l2',
    summary: normalizeText(raw.summary),
    contactInfo: normalizeText(raw.contact_info),
    domainCategoryId: normalizeId(raw.domain_category_id),
    providerField: providerOrgId ? 'provider_org_id' : 'provider_unit_id',
    providerNodeId: providerOrgId || providerUnitId,
    informationCategoryId: normalizeId(raw.hj417_category_id),
    sharingAttributeId: normalizeId(raw.sharing_attribute_id),
    dataResourceTypeId: normalizeId(raw.data_resource_type_id),
    supplyMethodId: normalizeId(raw.supply_method_id),
    updateCycleId: normalizeId(raw.update_cycle_id),
    timeRange: normalizeText(raw.time_range),
    regionCategoryId: normalizeId(raw.region_category_id),
    regionCoverage: normalizeText(raw.region_coverage),
    remarks: normalizeText(raw.remarks),
    tags: normalizeTags(raw.tags),
    baselineTable: normalizeText(statBase.base_table_name ?? statBase.baseTableName ?? raw.source_table),
    querySql: normalizeText(apiQuery.query_sql ?? apiQuery.querySql),
    queryDefaultParamsText: JSON.stringify(defaultParams, null, 2),
    statBase,
  }
}

export function createEmptyEditableResourceLinkRecord(): EditableResourceLinkRecord {
  return {
    primary: '',
    items: [],
  }
}

function buildEditableResourceValues(values: EditableResourceRecord) {
  const normalizedProviderId = toNullableId(values.providerNodeId)
  const queryDefaultParams = parseDefaultParams(values.queryDefaultParamsText)
  const baselineTable = values.baselineTable.trim()

  return {
    resource_code: values.resourceCode.trim(),
    resource_name: values.resourceName.trim(),
    data_source_id: toNullableId(values.dataSourceId),
    protection_level: values.protectionLevel.trim() || 'l2',
    summary: values.summary.trim(),
    contact_info: values.contactInfo.trim(),
    domain_category_id: toNullableId(values.domainCategoryId),
    provider_org_id: values.providerField === 'provider_org_id' ? normalizedProviderId : null,
    provider_unit_id: values.providerField === 'provider_unit_id' ? normalizedProviderId : null,
    hj417_category_id: toNullableId(values.informationCategoryId),
    sharing_attribute_id: toNullableId(values.sharingAttributeId),
    data_resource_type_id: toNullableId(values.dataResourceTypeId),
    supply_method_id: toNullableId(values.supplyMethodId),
    update_cycle_id: toNullableId(values.updateCycleId),
    time_range: values.timeRange.trim(),
    region_category_id: toNullableId(values.regionCategoryId),
    region_coverage: values.regionCoverage.trim(),
    remarks: values.remarks.trim(),
    tags: values.tags,
    source_table: baselineTable,
    stat_base: {
      ...values.statBase,
      base_table_name: baselineTable,
      api_query: {
        query_sql: values.querySql.trim(),
        default_params: queryDefaultParams,
      },
    },
  }
}

function parseDefaultParams(value: string) {
  const normalized = value.trim()
  if (!normalized) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  } catch {
    throw new Error('API 默认参数必须是有效的 JSON 对象')
  }
  if (!isRecord(parsed)) {
    throw new Error('API 默认参数必须是 JSON 对象')
  }
  return parsed
}

function toNullableId(value: string) {
  const normalized = value.trim()
  return normalized ? normalized : null
}

async function fetchEditableResource(resourceId: string): Promise<EditableResourceRecord> {
  const row = await fetchEditableResourceRow(resourceId)
  return mapEditableResource(row)
}

async function fetchEditableResourceRow(resourceId: string): Promise<RawEditableResource> {
  const response = await nocobaseClient.resource('eco_data_resources').get({
    filterByTk: resourceId,
  })
  const payload = response.data as { data?: RawEditableResource | null } | RawEditableResource | null
  const row = (payload && 'data' in payload ? payload.data : payload) as RawEditableResource | null | undefined
  if (!row) {
    throw new Error('未找到可编辑的数据资源记录')
  }
  return row
}

export async function saveEditableResource(resourceId: string, values: EditableResourceRecord) {
  await assertCanManageCatalogResources()
  await nocobaseClient.resource('eco_data_resources').update({
    filterByTk: resourceId,
    values: buildEditableResourceValues(values),
  })
}

async function fetchEditableResourceLinkInfo(resourceId: string): Promise<EditableResourceLinkRecord> {
  const row = await fetchEditableResourceRow(resourceId)
  return mapEditableResourceLinkInfo(row.access_url)
}

export async function saveEditableResourceLinkInfo(resourceId: string, values: EditableResourceLinkRecord) {
  await assertCanManageCatalogResources()
  await nocobaseClient.resource('eco_data_resources').update({
    filterByTk: resourceId,
    values: {
      access_url: buildAccessUrlValues(values),
    },
  })
}

export async function createEditableResource(values: EditableResourceRecord) {
  await assertCanManageCatalogResources()
  await nocobaseClient.resource('eco_data_resources').create({
    values: buildEditableResourceValues(values),
  })
}

export async function saveResourceStatBaseConfig(
  resourceId: string,
  values: {
    baselineTable: string
    freshFieldName: string
  },
) {
  await assertCanManageCatalogResources()
  const row = await fetchEditableResourceRow(resourceId)
  const currentStatBase = parseJsonRecord(row.stat_base)

  await nocobaseClient.resource('eco_data_resources').update({
    filterByTk: resourceId,
    values: {
      stat_base: {
        ...currentStatBase,
        base_table_name: values.baselineTable.trim(),
        fresh_field_name: values.freshFieldName.trim(),
      },
    },
  })
}

export function useEditableResource(resourceId: string | undefined, enabled: boolean) {
  const normalizedResourceId = normalizeId(resourceId)
  const [data, setData] = useState<EditableResourceRecord>(EMPTY_EDITABLE_RESOURCE)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !normalizedResourceId) return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    void fetchEditableResource(normalizedResourceId)
      .then((payload) => {
        if (cancelled) return
        setData(payload)
      })
      .catch((fetchError) => {
        if (cancelled) return
        setError(toErrorMessage(fetchError, '读取可编辑资源详情失败'))
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled, normalizedResourceId])

  return { data, isLoading, error, setData }
}

export function useEditableResourceLinkInfo(resourceId: string | undefined, enabled: boolean) {
  const normalizedResourceId = normalizeId(resourceId)
  const [data, setData] = useState<EditableResourceLinkRecord>(EMPTY_EDITABLE_RESOURCE_LINKS)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !normalizedResourceId) return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    void fetchEditableResourceLinkInfo(normalizedResourceId)
      .then((payload) => {
        if (cancelled) return
        setData(payload)
      })
      .catch((fetchError) => {
        if (cancelled) return
        setError(toErrorMessage(fetchError, '读取链接信息失败'))
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled, normalizedResourceId])

  return { data, isLoading, error, setData }
}
