import { useEffect, useState } from 'react'
import { assertCanManageCatalogResources } from './admin-role'
import { nocobaseClient, toErrorMessage } from './nocobase-client'
import type { CatalogLineageNodeType } from './nocobase-portal-data'

type RawEditableResourceStructure = {
  id?: number | string
  resource_name?: string | null
  resource_code?: string | null
  field_count?: number | string | null
  data_items?: unknown
  source_tablelist?: unknown
  source_system?: string | null
  source_table?: string | null
  data_lineage?: unknown
  stat_base?: unknown
}

export type CurrentResourceIdentity = {
  resourceId: string
  resourceName: string
  resourceCode: string
}

export type EditableDataItemRow = {
  id: string
  code: string
  name: string
  dataType: string
  description: string
  extra: Record<string, unknown>
}

export type EditablePhysicalTableRow = {
  id: string
  tableName: string
  layer: string
  description: string
  sourceSystem: string
  isBaseline: boolean
  freshFieldName: string
  extra: Record<string, unknown>
}

export type EditablePhysicalTablesRecord = {
  baselineLayer: string
  baselineTable: string
  freshFieldName: string
  currentSourceSystem: string
  rows: EditablePhysicalTableRow[]
  rootExtra: Record<string, unknown>
}

export type EditableLineageNodeRow = {
  id: string
  nodeId: string
  name: string
  nodeType: CatalogLineageNodeType
  resourceCode: string
  layer: string
  extra: Record<string, unknown>
}

export type EditableLineageEdgeRow = {
  id: string
  fromId: string
  toId: string
  extra: Record<string, unknown>
}

export type EditableLineageRecord = {
  nodes: EditableLineageNodeRow[]
  edges: EditableLineageEdgeRow[]
  rootExtra: Record<string, unknown>
}

export type EditableResourceStructureRecord = {
  resourceId: string
  resourceName: string
  resourceCode: string
  dataItems: EditableDataItemRow[]
  physicalTables: EditablePhysicalTablesRecord
  lineage: EditableLineageRecord
}

const EMPTY_EDITABLE_RESOURCE_STRUCTURE: EditableResourceStructureRecord = {
  resourceId: '',
  resourceName: '',
  resourceCode: '',
  dataItems: [],
  physicalTables: {
    baselineLayer: '',
    baselineTable: '',
    freshFieldName: '',
    currentSourceSystem: '',
    rows: [],
    rootExtra: {},
  },
  lineage: {
    nodes: [],
    edges: [],
    rootExtra: {},
  },
}

const CANONICAL_PHYSICAL_TABLE_LAYERS = ['ods', 'dwd', 'dws', 'ads', 'dim'] as const

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  return value == null ? '' : String(value).trim()
}

function normalizeBooleanLike(value: unknown) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeText(value).toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y' || normalized === '是'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    return (value as T) ?? fallback
  }

  const normalized = value.trim()
  if (!normalized) return fallback

  try {
    return JSON.parse(normalized) as T
  } catch {
    return fallback
  }
}

function omitKeys<T extends Record<string, unknown>>(value: T, keys: string[]) {
  const next: Record<string, unknown> = {}
  Object.entries(value).forEach(([key, currentValue]) => {
    if (!keys.includes(key)) {
      next[key] = currentValue
    }
  })
  return next
}

function parseStringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => normalizeText(item)).filter(Boolean)))
}

function buildLineageEdgeKey(fromId: string, toId: string) {
  const normalizedFromId = normalizeId(fromId)
  const normalizedToId = normalizeId(toId)
  if (!normalizedFromId || !normalizedToId) return ''
  return `${normalizedFromId}->${normalizedToId}`
}

function extractLineageExclusions(rootExtra: Record<string, unknown>) {
  const {
    excluded_edge_keys: excludedEdgeKeysSnake,
    excludedEdgeKeys,
    excluded_node_ids: excludedNodeIdsSnake,
    excludedNodeIds,
    ...restRootExtra
  } = rootExtra

  return {
    restRootExtra,
    excludedEdgeKeys: parseStringList(excludedEdgeKeysSnake ?? excludedEdgeKeys),
    excludedNodeIds: parseStringList(excludedNodeIdsSnake ?? excludedNodeIds),
  }
}

function createDraftId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`
}

function normalizeNodeType(value: unknown): CatalogLineageNodeType {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'data_source') return 'data_source'
  if (normalized === 'warehouse_resource') return 'warehouse_resource'
  if (normalized === 'warehouse_layer') return 'warehouse_layer'
  if (normalized === 'data_api') return 'data_api'
  return 'unknown'
}

export function normalizePhysicalTableLayer(value: unknown) {
  const normalized = normalizeText(value).toLowerCase().replace(/\s+/g, '')
  if (!normalized) return ''

  if (CANONICAL_PHYSICAL_TABLE_LAYERS.includes(normalized as (typeof CANONICAL_PHYSICAL_TABLE_LAYERS)[number])) {
    return normalized
  }

  if (normalized.startsWith('ods') || normalized.includes('源数据层')) return 'ods'
  if (normalized.startsWith('dwd') || normalized.includes('明细数据层')) return 'dwd'
  if (normalized.startsWith('dws') || normalized.includes('属性/汇总层') || normalized.includes('属性汇总层') || normalized.includes('汇总层')) return 'dws'
  if (normalized.startsWith('ads') || normalized.includes('应用数据层')) return 'ads'
  if (normalized.startsWith('dim') || normalized.includes('维度层')) return 'dim'

  return ''
}

export function parseEditableDataItems(value: unknown): EditableDataItemRow[] {
  const parsed = parseJsonValue<unknown>(value, [])
  if (!Array.isArray(parsed)) return []

  return parsed
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item, index) => ({
      id: createDraftId('data-item', index),
      code: normalizeText(item.code ?? item.fieldCode ?? item.field_code ?? item.key),
      name: normalizeText(item.name ?? item.fieldName ?? item.field_name ?? item.label),
      dataType: normalizeText(item.dataType ?? item.data_type ?? item.type),
      description: normalizeText(item.description ?? item.desc ?? item.value),
      extra: omitKeys(item, ['code', 'fieldCode', 'field_code', 'key', 'name', 'fieldName', 'field_name', 'label', 'dataType', 'data_type', 'type', 'description', 'desc', 'value']),
    }))
}

export function buildDataItemsPayload(rows: EditableDataItemRow[]) {
  return rows
    .map((row) => ({
      ...row.extra,
      code: row.code.trim(),
      name: row.name.trim(),
      dataType: row.dataType.trim(),
      description: row.description.trim(),
    }))
    .filter((row) => row.code || row.name || row.dataType || row.description)
}

export function parseEditablePhysicalTables(value: unknown, currentSourceSystem: unknown = ''): EditablePhysicalTablesRecord {
  const parsed = parseJsonValue<Record<string, unknown>>(value, {})
  const rows = Array.isArray(parsed.tables)
    ? parsed.tables
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map((item, index) => ({
          id: createDraftId('physical-table', index),
          tableName: normalizeText(item.table_name ?? item.tableName),
          layer: normalizePhysicalTableLayer(item.layer ?? item.raw_layer ?? item.rawLayer),
          description: normalizeText(item.description),
          sourceSystem: normalizeText(item.source_system ?? item.sourceSystem),
          isBaseline: normalizeBooleanLike(item.is_baseline ?? item.isBaseline ?? item.baseline),
          freshFieldName: normalizeText(item.fresh_field_name ?? item.freshFieldName),
          extra: omitKeys(item, ['table_name', 'tableName', 'layer', 'raw_layer', 'rawLayer', 'description', 'source_system', 'sourceSystem', 'is_baseline', 'isBaseline', 'baseline', 'fresh_field_name', 'freshFieldName']),
        }))
    : []

  return {
    baselineLayer: normalizePhysicalTableLayer(parsed.baseline_layer ?? parsed.baselineLayer),
    baselineTable: normalizeText(parsed.baseline_table ?? parsed.baselineTable),
    freshFieldName: '',
    currentSourceSystem: normalizeText(currentSourceSystem),
    rows,
    rootExtra: omitKeys(parsed, ['tables', 'baseline_ldm', 'baselineLdm', 'baseline_layer', 'baselineLayer', 'baseline_table', 'baselineTable']),
  }
}

function parseEditableStatBase(value: unknown) {
  const parsed = parseJsonValue<Record<string, unknown>>(value, {})

  return {
    baselineTable: normalizeText(parsed.base_table_name ?? parsed.baseTableName),
    freshFieldName: normalizeText(parsed.fresh_field_name ?? parsed.freshFieldName),
  }
}

export function buildPhysicalTablesPayload(record: EditablePhysicalTablesRecord) {
  const rows = record.rows
    .map((row) => ({
      ...row.extra,
      table_name: row.tableName.trim(),
      layer: normalizePhysicalTableLayer(row.layer),
      description: row.description.trim(),
      source_system: row.sourceSystem.trim(),
      fresh_field_name: row.freshFieldName.trim(),
      is_baseline: row.isBaseline,
    }))
    .filter((row) => row.table_name)

  const explicitBaselineRow = rows.find((row) => normalizeBooleanLike(row.is_baseline))
  const effectiveBaselineTable = explicitBaselineRow?.table_name || record.baselineTable.trim() || rows[0]?.table_name || ''
  const normalizedRows = rows.map((row) => ({
    ...row,
    is_baseline: row.table_name === effectiveBaselineTable,
  }))
  const matchedBaselineRow = normalizedRows.find((row) => row.table_name === effectiveBaselineTable)
  const effectiveBaselineLayer = normalizePhysicalTableLayer(record.baselineLayer) || matchedBaselineRow?.layer || ''

  return {
    ...record.rootExtra,
    tables: normalizedRows,
    baseline_layer: effectiveBaselineLayer,
    baseline_table: effectiveBaselineTable,
  }
}

function buildCurrentResourceLineageNode(currentResource: CurrentResourceIdentity) {
  return {
    id: currentResource.resourceId,
    name: currentResource.resourceName,
    node_type: 'warehouse_resource',
    resource_code: currentResource.resourceCode,
    layer: '',
  }
}

export function parseEditableLineage(value: unknown, currentResource: CurrentResourceIdentity): EditableLineageRecord {
  const parsed = parseJsonValue<Record<string, unknown>>(value, {})
  const parsedNodes = Array.isArray(parsed.nodes)
    ? parsed.nodes
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map((item, index) => ({
          id: createDraftId('lineage-node', index),
          nodeId: normalizeId(item.id),
          name: normalizeText(item.name),
          nodeType: normalizeNodeType(item.node_type ?? item.nodeType),
          resourceCode: normalizeText(item.resource_code ?? item.resourceCode),
          layer: normalizeText(item.layer),
          extra: omitKeys(item, ['id', 'name', 'node_type', 'nodeType', 'resource_code', 'resourceCode', 'layer']),
        }))
    : []

  const hasCurrentNode = parsedNodes.some((node) => node.nodeId === currentResource.resourceId)
  const nodes = hasCurrentNode
    ? parsedNodes
    : [
        {
          id: createDraftId('lineage-node', parsedNodes.length),
          nodeId: currentResource.resourceId,
          name: currentResource.resourceName,
          nodeType: 'warehouse_resource' as const,
          resourceCode: currentResource.resourceCode,
          layer: '',
          extra: {},
        },
        ...parsedNodes,
      ]

  const edges = Array.isArray(parsed.edges)
    ? parsed.edges
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .map((item, index) => ({
          id: createDraftId('lineage-edge', index),
          fromId: normalizeId(item.from_id ?? item.fromId),
          toId: normalizeId(item.to_id ?? item.toId),
          extra: omitKeys(item, ['from_id', 'fromId', 'to_id', 'toId', 'from_name', 'fromName', 'to_name', 'toName']),
        }))
    : []

  return {
    nodes,
    edges,
    rootExtra: omitKeys(parsed, ['nodes', 'edges', 'upstream', 'downstream']),
  }
}

export function buildLineagePayload(record: EditableLineageRecord, currentResource: CurrentResourceIdentity) {
  const nodeMap = new Map<string, Record<string, unknown>>()
  const { restRootExtra, excludedEdgeKeys: rawExcludedEdgeKeys, excludedNodeIds: rawExcludedNodeIds } = extractLineageExclusions(record.rootExtra)

  record.nodes.forEach((node) => {
    const nodeId = node.nodeId.trim()
    if (!nodeId) return
    nodeMap.set(nodeId, {
      ...node.extra,
      id: nodeId,
      name: node.name.trim() || nodeId,
      node_type: nodeId === currentResource.resourceId ? 'warehouse_resource' : node.nodeType,
      resource_code: nodeId === currentResource.resourceId ? currentResource.resourceCode : node.resourceCode.trim(),
      layer: node.layer.trim(),
    })
  })

  if (!nodeMap.has(currentResource.resourceId)) {
    nodeMap.set(currentResource.resourceId, buildCurrentResourceLineageNode(currentResource))
  }

  const normalizedEdges = record.edges
    .map((edge) => ({
      ...edge.extra,
      from_id: edge.fromId.trim(),
      to_id: edge.toId.trim(),
    }))
    .filter((edge) => edge.from_id && edge.to_id && nodeMap.has(edge.from_id) && nodeMap.has(edge.to_id))
    .map((edge) => ({
      ...edge,
      from_name: String(nodeMap.get(edge.from_id)?.name ?? edge.from_id),
      to_name: String(nodeMap.get(edge.to_id)?.name ?? edge.to_id),
    }))

  const dedupedEdges = normalizedEdges.filter((edge, index, collection) => {
    const currentKey = `${edge.from_id}->${edge.to_id}`
    return collection.findIndex((candidate) => `${candidate.from_id}->${candidate.to_id}` === currentKey) === index
  })

  const nodeRows = Array.from(nodeMap.values())
  const persistedNodeIds = new Set(nodeMap.keys())
  const persistedEdgeKeys = new Set(
    dedupedEdges
      .map((edge) => buildLineageEdgeKey(String(edge.from_id), String(edge.to_id)))
      .filter(Boolean),
  )
  const excludedNodeIds = rawExcludedNodeIds.filter(
    (nodeId) => nodeId !== currentResource.resourceId && !persistedNodeIds.has(nodeId),
  )
  const excludedEdgeKeys = rawExcludedEdgeKeys.filter((edgeKey) => !persistedEdgeKeys.has(edgeKey))
  const upstreamNodeIds = Array.from(
    new Set(
      dedupedEdges
        .filter((edge) => edge.to_id === currentResource.resourceId)
        .map((edge) => edge.from_id),
    ),
  )
  const downstreamNodeIds = Array.from(
    new Set(
      dedupedEdges
        .filter((edge) => edge.from_id === currentResource.resourceId)
        .map((edge) => edge.to_id),
    ),
  )

  return {
    ...restRootExtra,
    ...(excludedNodeIds.length > 0 ? { excluded_node_ids: excludedNodeIds } : {}),
    ...(excludedEdgeKeys.length > 0 ? { excluded_edge_keys: excludedEdgeKeys } : {}),
    nodes: nodeRows,
    edges: dedupedEdges,
    upstream: upstreamNodeIds.map((nodeId) => nodeMap.get(nodeId)).filter(isRecord),
    downstream: downstreamNodeIds.map((nodeId) => nodeMap.get(nodeId)).filter(isRecord),
  }
}

export async function fetchEditableResourceStructure(resourceId: string): Promise<EditableResourceStructureRecord> {
  const response = await nocobaseClient.resource('eco_data_resources').get({
    filterByTk: resourceId,
  })
  const payload = response.data as { data?: RawEditableResourceStructure | null } | RawEditableResourceStructure | null
  const row = (payload && 'data' in payload ? payload.data : payload) as RawEditableResourceStructure | null | undefined
  if (!row) {
    throw new Error('未找到可编辑的数据资源结构记录')
  }

  const currentResource = {
    resourceId: normalizeId(row.id),
    resourceName: normalizeText(row.resource_name),
    resourceCode: normalizeText(row.resource_code),
  }
  const physicalTables = parseEditablePhysicalTables(row.source_tablelist, row.source_system)
  const statBase = parseEditableStatBase(row.stat_base)
  const effectiveBaselineTable = statBase.baselineTable || physicalTables.baselineTable
  const matchedBaselineRow = physicalTables.rows.find(
    (item) => normalizeText(item.tableName) === normalizeText(effectiveBaselineTable),
  )
  const effectiveBaselineLayer =
    matchedBaselineRow?.layer
    || (effectiveBaselineTable === physicalTables.baselineTable ? physicalTables.baselineLayer : '')
  const effectiveFreshFieldName = statBase.freshFieldName || matchedBaselineRow?.freshFieldName || physicalTables.freshFieldName
  const rows = physicalTables.rows.map((row) => {
    const isBaseline = normalizeText(row.tableName) !== '' && normalizeText(row.tableName) === normalizeText(effectiveBaselineTable)
    return {
      ...row,
      isBaseline,
      freshFieldName: isBaseline ? (effectiveFreshFieldName || row.freshFieldName) : row.freshFieldName,
    }
  })

  return {
    resourceId: currentResource.resourceId,
    resourceName: currentResource.resourceName,
    resourceCode: currentResource.resourceCode,
    dataItems: parseEditableDataItems(row.data_items),
    physicalTables: {
      ...physicalTables,
      baselineTable: effectiveBaselineTable,
      baselineLayer: effectiveBaselineLayer,
      freshFieldName: effectiveFreshFieldName,
      rows,
    },
    lineage: parseEditableLineage(row.data_lineage, currentResource),
  }
}

export async function saveResourceDataItems(resourceId: string, rows: EditableDataItemRow[]) {
  await assertCanManageCatalogResources()
  const payload = buildDataItemsPayload(rows)
  await nocobaseClient.resource('eco_data_resources').update({
    filterByTk: resourceId,
    values: {
      data_items: payload,
      field_count: payload.length,
    },
  })
}

export async function saveResourcePhysicalTables(resourceId: string, record: EditablePhysicalTablesRecord) {
  await assertCanManageCatalogResources()
  const payload = buildPhysicalTablesPayload(record)
  const tableNames = Array.isArray(payload.tables)
    ? payload.tables
        .map((row) => normalizeText(isRecord(row) ? row.table_name : ''))
        .filter(Boolean)
    : []
  const firstSourceSystem =
    Array.isArray(payload.tables)
      ? payload.tables
          .map((row) => normalizeText(isRecord(row) ? row.source_system : ''))
          .find(Boolean) ?? ''
      : ''

  await nocobaseClient.resource('eco_data_resources').update({
    filterByTk: resourceId,
    values: {
      source_tablelist: payload,
      source_table: tableNames.join('、'),
      source_system: firstSourceSystem || record.currentSourceSystem,
    },
  })
}

export async function saveResourceLineage(resourceId: string, record: EditableLineageRecord, currentResource: CurrentResourceIdentity) {
  await assertCanManageCatalogResources()
  const payload = buildLineagePayload(record, currentResource)
  await nocobaseClient.resource('eco_data_resources').update({
    filterByTk: resourceId,
    values: {
      data_lineage: payload,
    },
  })
}

export function useEditableResourceStructure(resourceId: string | undefined, enabled: boolean) {
  const normalizedResourceId = normalizeId(resourceId)
  const [data, setData] = useState<EditableResourceStructureRecord>(EMPTY_EDITABLE_RESOURCE_STRUCTURE)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !normalizedResourceId) return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    void fetchEditableResourceStructure(normalizedResourceId)
      .then((payload) => {
        if (cancelled) return
        setData(payload)
      })
      .catch((fetchError) => {
        if (cancelled) return
        setError(toErrorMessage(fetchError, '读取可编辑资源结构失败'))
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
