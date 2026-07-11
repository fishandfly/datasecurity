export type ResourcePreviewRow = Record<string, unknown>

export type LatestPreviewTableData = {
  tableName: string
  sortField: string
  limit: number
  columns: string[]
  columnLabels: Record<string, string>
  rows: ResourcePreviewRow[]
  generatedAt: string
  error: string | null
  isBaseline: boolean
  businessTimeFieldName: string
  businessTimeFieldDescription: string
  description: string
  layer: string
  sourceSystem: string
}

export type LatestPreviewData = LatestPreviewTableData & {
  relatedTablePreviews: LatestPreviewTableData[]
  relatedTablePreviewCount: number
  allPreviewTableNames: string[]
  previewTables: LatestPreviewTableData[]
}

function normalizePreviewSortField(fieldName: string | null | undefined) {
  const normalized = String(fieldName ?? '').trim()
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized) ? normalized : ''
}

export function stringifyPreviewValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyPreviewValue(item))
      .filter(Boolean)
      .join(', ')
  }
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return String(value)
  }
}

export function buildPreviewSortCandidates(businessTimeFieldName?: string | null) {
  return Array.from(
    new Set(
      [
        normalizePreviewSortField(businessTimeFieldName),
        'updatedAt',
        'updated_at',
        'createdAt',
        'created_at',
        'id',
      ].filter(Boolean),
    ),
  )
}

export function buildPreviewColumnKeys(
  rows: ResourcePreviewRow[],
  preferredKeys: string[] = [],
  declaredColumns: string[] = [],
) {
  const discoveredKeys: string[] = []
  const discoveredKeySet = new Set<string>()
  const declaredKeySet = new Set<string>()
  declaredColumns.forEach((key) => {
    const normalizedKey = key.trim()
    if (normalizedKey) {
      declaredKeySet.add(normalizedKey)
    }
  })

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!discoveredKeySet.has(key)) {
        discoveredKeySet.add(key)
        discoveredKeys.push(key)
      }
    })
  })

  const orderedKeys: string[] = []
  const pushKey = (key: string) => {
    const normalizedKey = key.trim()
    if (!normalizedKey || orderedKeys.includes(normalizedKey)) return
    if (!declaredKeySet.has(normalizedKey) && !discoveredKeySet.has(normalizedKey)) return
    orderedKeys.push(normalizedKey)
  }

  preferredKeys.forEach((key) => pushKey(normalizePreviewSortField(key) || key.trim()))
  declaredColumns.forEach(pushKey)
  ;['id', 'updatedAt', 'updated_at', 'createdAt', 'created_at'].forEach(pushKey)
  discoveredKeys.forEach(pushKey)

  return orderedKeys
}

function normalizePreviewColumnLabels(value: unknown, columns: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const labels: Record<string, string> = {}
  const raw = value as Record<string, unknown>
  columns.forEach((column) => {
    const label = String(raw[column] ?? '').trim()
    if (label) {
      labels[column] = label
    }
  })
  return labels
}

export function getPreviewColumnDisplayName(columnKey: string, columnLabels?: Record<string, string> | null) {
  const label = String(columnLabels?.[columnKey] ?? '').trim()
  return label || columnKey
}

function normalizePreviewLimit(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  if (typeof value === 'string') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0
  }
  return 0
}

function normalizePreviewRows(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is ResourcePreviewRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
}

function normalizePreviewColumns(value: unknown, rows: ResourcePreviewRow[]) {
  const declared = Array.isArray(value)
    ? value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    : []

  return declared.length > 0 ? Array.from(new Set(declared)) : buildPreviewColumnKeys(rows)
}

function normalizePreviewText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizePreviewBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  const normalized = normalizePreviewText(value).toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
  return false
}

function normalizePreviewTableNames(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => normalizePreviewText(item)).filter(Boolean)))
}

function dedupePreviewTables(items: LatestPreviewTableData[]) {
  const previewTableMap = new Map<string, LatestPreviewTableData>()
  items.forEach((item) => {
    const normalizedTableName = item.tableName.trim()
    if (!normalizedTableName || previewTableMap.has(normalizedTableName)) return
    previewTableMap.set(normalizedTableName, item)
  })
  return Array.from(previewTableMap.values())
}

function normalizePreviewTableData(value: unknown): LatestPreviewTableData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const raw = value as Record<string, unknown>
  const rows = normalizePreviewRows(raw.rows)
  const tableName = normalizePreviewText(raw.table_name ?? raw.tableName)
  const sortField = normalizePreviewText(raw.sort_field ?? raw.sortField)
  const generatedAt = normalizePreviewText(raw.generated_at ?? raw.generatedAt)
  const errorText = normalizePreviewText(raw.error)

  if (!tableName && rows.length === 0 && !errorText) {
    return null
  }

  const columns = normalizePreviewColumns(raw.columns, rows)

  return {
    tableName,
    sortField,
    limit: normalizePreviewLimit(raw.limit),
    columns,
    columnLabels: normalizePreviewColumnLabels(raw.column_labels ?? raw.columnLabels, columns),
    rows,
    generatedAt,
    error: errorText || null,
    isBaseline: normalizePreviewBoolean(raw.is_baseline ?? raw.isBaseline),
    businessTimeFieldName: normalizePreviewText(raw.business_time_field_name ?? raw.businessTimeFieldName),
    businessTimeFieldDescription: normalizePreviewText(raw.business_time_field_description ?? raw.businessTimeFieldDescription),
    description: normalizePreviewText(raw.description),
    layer: normalizePreviewText(raw.layer),
    sourceSystem: normalizePreviewText(raw.source_system ?? raw.sourceSystem),
  }
}

export function normalizeLatestPreviewData(value: unknown): LatestPreviewData | null {
  const baselinePreview = normalizePreviewTableData(value)
  if (!baselinePreview) {
    return null
  }

  const raw = value as Record<string, unknown>
  const rawRelatedTablePreviews = raw.related_table_previews ?? raw.relatedTablePreviews
  const relatedTablePreviews = Array.isArray(rawRelatedTablePreviews)
    ? rawRelatedTablePreviews
        .map((item: unknown) => normalizePreviewTableData(item))
        .filter((item: LatestPreviewTableData | null): item is LatestPreviewTableData => Boolean(item))
    : []
  const dedupedRelatedTablePreviews = dedupePreviewTables(
    relatedTablePreviews.filter((item: LatestPreviewTableData) => item.tableName.trim() !== baselinePreview.tableName.trim()),
  )
  const previewTables = dedupePreviewTables([baselinePreview, ...dedupedRelatedTablePreviews])
  const allPreviewTableNames = normalizePreviewTableNames(raw.all_preview_table_names ?? raw.allPreviewTableNames)
  const normalizedPreviewTableNames = allPreviewTableNames.length > 0
    ? allPreviewTableNames
    : previewTables.map((item) => item.tableName).filter(Boolean)

  return {
    ...baselinePreview,
    relatedTablePreviews: dedupedRelatedTablePreviews,
    relatedTablePreviewCount: normalizePreviewLimit(raw.related_table_preview_count ?? raw.relatedTablePreviewCount) || dedupedRelatedTablePreviews.length,
    allPreviewTableNames: normalizedPreviewTableNames,
    previewTables,
  }
}
