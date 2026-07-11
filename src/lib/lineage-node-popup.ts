import type { CatalogLineageNodeType, CatalogLineageTable } from './nocobase-portal-data'

export type LineageNodePopupNeighbor = {
  id: string
  name: string
  nodeType: CatalogLineageNodeType
}

export type LineageNodePopupPayload = {
  id: string
  name: string
  nodeType: CatalogLineageNodeType
  resourceCode: string
  layer: string
  level: string
  ownerId: string
  ownerName: string
  tableCount: number
  tables: CatalogLineageTable[]
  upstream: LineageNodePopupNeighbor[]
  downstream: LineageNodePopupNeighbor[]
}

export function serializeLineageNodePopupPayload(payload: LineageNodePopupPayload) {
  return JSON.stringify(payload)
}

export function parseLineageNodePopupPayload(raw: string | null) {
  if (!raw) return null

  try {
    const payload = JSON.parse(raw) as Partial<LineageNodePopupPayload> | null
    if (!payload || typeof payload !== 'object') return null
    if (!payload.id || !payload.name || !payload.nodeType) return null

    return {
      id: String(payload.id),
      name: String(payload.name),
      nodeType: payload.nodeType,
      resourceCode: String(payload.resourceCode || ''),
      layer: String(payload.layer || ''),
      level: String(payload.level || ''),
      ownerId: String(payload.ownerId || ''),
      ownerName: String(payload.ownerName || ''),
      tableCount: typeof payload.tableCount === 'number' ? payload.tableCount : 0,
      tables: Array.isArray(payload.tables)
        ? payload.tables.map((table) => ({
            tableName: String(table?.tableName || ''),
            description: String(table?.description || ''),
            rawLayer: String(table?.rawLayer || ''),
          }))
        : [],
      upstream: Array.isArray(payload.upstream)
        ? payload.upstream
            .filter((node) => node && node.id && node.name && node.nodeType)
            .map((node) => ({
              id: String(node.id),
              name: String(node.name),
              nodeType: node.nodeType,
            }))
        : [],
      downstream: Array.isArray(payload.downstream)
        ? payload.downstream
            .filter((node) => node && node.id && node.name && node.nodeType)
            .map((node) => ({
              id: String(node.id),
              name: String(node.name),
              nodeType: node.nodeType,
            }))
        : [],
    } satisfies LineageNodePopupPayload
  } catch {
    return null
  }
}
