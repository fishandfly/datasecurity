import { saveResourceStatBaseConfig } from './nocobase-resource-edit'
import { fetchEditableResourceStructure, saveResourceDataItems, saveResourceLineage, saveResourcePhysicalTables, type EditableDataItemRow, type EditableLineageRecord, type EditablePhysicalTablesRecord } from './nocobase-resource-structure-edit'

export const RESOURCE_CONFIG_SCHEMA_VERSION = 'eco-resource-config.v1'

export type ResourceConfigIdentity = {
  resourceId: string
  resourceCode: string
  resourceName: string
}

type ExportedPhysicalTablesConfig = Omit<EditablePhysicalTablesRecord, 'freshFieldName'>

export type ExportedResourceConfig = {
  schemaVersion: string
  exportedAt: string
  resourceIdentity: ResourceConfigIdentity
  fresh_field_name: string
  baseline_table: string
  dataItems: EditableDataItemRow[]
  lineage: EditableLineageRecord
  physicalTables: ExportedPhysicalTablesConfig
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toTrimmedString(value: unknown) {
  return String(value ?? '').trim()
}

export async function buildExportedResourceConfig(
  resourceId: string,
): Promise<ExportedResourceConfig> {
  const data = await fetchEditableResourceStructure(resourceId)
  const freshFieldName = toTrimmedString(data.physicalTables.freshFieldName)
  const baselineTable = toTrimmedString(data.physicalTables.baselineTable || data.physicalTables.rows[0]?.tableName)
  const { freshFieldName: _freshFieldName, ...physicalTables } = data.physicalTables

  return {
    schemaVersion: RESOURCE_CONFIG_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    resourceIdentity: {
      resourceId: data.resourceId,
      resourceCode: data.resourceCode,
      resourceName: data.resourceName,
    },
    fresh_field_name: freshFieldName,
    baseline_table: baselineTable,
    dataItems: data.dataItems,
    lineage: data.lineage,
    physicalTables,
  }
}

export function parseImportedResourceConfigText(
  text: string,
  currentResource: Pick<ResourceConfigIdentity, 'resourceId' | 'resourceCode'>,
): ExportedResourceConfig {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('导入失败：文件不是有效的 JSON。')
  }

  if (!isRecord(parsed)) {
    throw new Error('导入失败：配置文件结构无效。')
  }

  if (parsed.schemaVersion !== RESOURCE_CONFIG_SCHEMA_VERSION) {
    throw new Error('导入失败：配置文件版本不支持。')
  }
  if (!isRecord(parsed.resourceIdentity)) {
    throw new Error('导入失败：缺少 resourceIdentity 配置区块。')
  }
  if (!('dataItems' in parsed)) {
    throw new Error('导入失败：缺少 dataItems 配置区块。')
  }
  if (!('lineage' in parsed)) {
    throw new Error('导入失败：缺少 lineage 配置区块。')
  }
  if (!('physicalTables' in parsed)) {
    throw new Error('导入失败：缺少 physicalTables 配置区块。')
  }

  const resourceId = toTrimmedString(parsed.resourceIdentity.resourceId)
  const resourceCode = toTrimmedString(parsed.resourceIdentity.resourceCode)
  if (resourceId !== currentResource.resourceId || resourceCode !== currentResource.resourceCode) {
    throw new Error('导入失败：该文件不是当前资源导出的配置文件。')
  }

  return parsed as ExportedResourceConfig
}

export async function importResourceConfig(config: ExportedResourceConfig, currentResource: ResourceConfigIdentity) {
  await saveResourceDataItems(currentResource.resourceId, config.dataItems)
  await saveResourceLineage(currentResource.resourceId, config.lineage, {
    resourceId: currentResource.resourceId,
    resourceCode: currentResource.resourceCode,
    resourceName: currentResource.resourceName,
  })
  await saveResourcePhysicalTables(currentResource.resourceId, {
    ...config.physicalTables,
    freshFieldName: toTrimmedString(config.fresh_field_name),
  })
  await saveResourceStatBaseConfig(currentResource.resourceId, {
    baselineTable: config.baseline_table,
    freshFieldName: toTrimmedString(config.fresh_field_name),
  })
}
