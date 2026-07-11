import type { EditableLineageNodeRow, EditableLineageRecord } from './nocobase-resource-structure-edit'
import type { CatalogItem, CatalogLineageNodeType } from './nocobase-portal-data'

export type LineageNodeReference = {
  nodeId: string
  name: string
  nodeType: CatalogLineageNodeType
  resourceCode: string
  layer: string
}

type MinimalCatalogItem = Pick<CatalogItem, 'id' | 'name' | 'code' | 'dataLineage'>
type MinimalGraphNode = {
  id: string
  name: string
  nodeType: CatalogLineageNodeType
  resourceCode: string
  layer: string
}

type MinimalGraphEdge = {
  fromId: string
  fromName: string
  toId: string
  toName: string
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function toSearchText(value: unknown) {
  return normalizeText(value).toLocaleLowerCase('zh-CN')
}

function parseStringList(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => normalizeText(item)).filter(Boolean)))
  }
  return []
}

function buildEdgeKey(fromId: string, toId: string) {
  const normalizedFromId = normalizeText(fromId)
  const normalizedToId = normalizeText(toId)
  if (!normalizedFromId || !normalizedToId) return ''
  return `${normalizedFromId}->${normalizedToId}`
}

function readExcludedNodeIds(rootExtra: Record<string, unknown>) {
  return parseStringList(rootExtra.excluded_node_ids ?? rootExtra.excludedNodeIds)
}

function readExcludedEdgeKeys(rootExtra: Record<string, unknown>) {
  return parseStringList(rootExtra.excluded_edge_keys ?? rootExtra.excludedEdgeKeys)
}

function buildReferenceKey(reference: LineageNodeReference) {
  return [
    normalizeText(reference.nodeId),
    normalizeText(reference.name),
    reference.nodeType,
    normalizeText(reference.resourceCode),
    normalizeText(reference.layer),
  ].join('::')
}

function buildFallbackGraphNode(
  id: string,
  name: string,
  nodeType: CatalogLineageNodeType = 'unknown',
  resourceCode = '',
): MinimalGraphNode {
  return {
    id,
    name: name || id,
    nodeType,
    resourceCode,
    layer: '',
  }
}

function mergeGraphNode(current: MinimalGraphNode, next: MinimalGraphNode) {
  return {
    id: current.id,
    name: current.name !== current.id ? current.name : next.name || current.id,
    nodeType: current.nodeType !== 'unknown' ? current.nodeType : next.nodeType,
    resourceCode: current.resourceCode || next.resourceCode,
    layer: current.layer || next.layer,
  } satisfies MinimalGraphNode
}

function dedupeGraphEdges(edges: MinimalGraphEdge[]) {
  const seen = new Set<string>()
  return edges.filter((edge) => {
    const fromId = normalizeText(edge.fromId)
    const toId = normalizeText(edge.toId)
    if (!fromId || !toId) return false

    const key = `${fromId}->${toId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeItemLineage(item: MinimalCatalogItem) {
  const normalizedItemId = normalizeText(item.id)
  const normalizedItemName = normalizeText(item.name)
  const normalizedItemCode = normalizeText(item.code)
  const currentNode =
    item.dataLineage?.nodes.find((node) => normalizeText(node.id) === normalizedItemId)
    ?? buildFallbackGraphNode(normalizedItemId, normalizedItemName, 'warehouse_resource', normalizedItemCode)

  const upstream = item.dataLineage?.upstream ?? []
  const downstream = item.dataLineage?.downstream ?? []
  const upstreamIds = new Set(upstream.map((node) => normalizeText(node.id)))
  const downstreamIds = new Set(downstream.map((node) => normalizeText(node.id)))
  const nodeMap = new Map<string, MinimalGraphNode>([[normalizedItemId, currentNode]])
  const registerNode = (node: MinimalGraphNode) => {
    const normalizedId = normalizeText(node.id)
    if (!normalizedId) return
    const normalizedNode = {
      ...node,
      id: normalizedId,
      name: normalizeText(node.name) || normalizedId,
      resourceCode: normalizeText(node.resourceCode),
      layer: normalizeText(node.layer),
    } satisfies MinimalGraphNode
    const existing = nodeMap.get(normalizedId)
    nodeMap.set(normalizedId, existing ? mergeGraphNode(existing, normalizedNode) : normalizedNode)
  }

  upstream.forEach((node) => {
    registerNode({
      id: normalizeText(node.id),
      name: normalizeText(node.name),
      nodeType: node.nodeType,
      resourceCode: normalizeText(node.resourceCode),
      layer: normalizeText(node.layer),
    })
  })
  downstream.forEach((node) => {
    registerNode({
      id: normalizeText(node.id),
      name: normalizeText(node.name),
      nodeType: node.nodeType,
      resourceCode: normalizeText(node.resourceCode),
      layer: normalizeText(node.layer),
    })
  })
  ;(item.dataLineage?.nodes ?? []).forEach((node) => {
    registerNode({
      id: normalizeText(node.id),
      name: normalizeText(node.name),
      nodeType: node.nodeType,
      resourceCode: normalizeText(node.resourceCode),
      layer: normalizeText(node.layer),
    })
  })

  const lineageEdges =
    item.dataLineage?.edges && item.dataLineage.edges.length > 0
      ? dedupeGraphEdges(
          item.dataLineage.edges.map((edge) => ({
            fromId: normalizeText(edge.fromId),
            fromName: normalizeText(edge.fromName),
            toId: normalizeText(edge.toId),
            toName: normalizeText(edge.toName),
          })),
        )
      : dedupeGraphEdges([
          ...upstream.map((node) => ({
            fromId: normalizeText(node.id),
            fromName: normalizeText(node.name),
            toId: normalizedItemId,
            toName: normalizedItemName,
          })),
          ...downstream.map((node) => ({
            fromId: normalizedItemId,
            fromName: normalizedItemName,
            toId: normalizeText(node.id),
            toName: normalizeText(node.name),
          })),
        ])

  lineageEdges.forEach((edge) => {
    if (!nodeMap.has(edge.fromId)) {
      registerNode(
        buildFallbackGraphNode(
          edge.fromId,
          edge.fromName,
          edge.fromId === normalizedItemId
            ? 'warehouse_resource'
            : upstreamIds.has(edge.fromId)
              ? 'data_source'
              : 'unknown',
          edge.fromId === normalizedItemId ? normalizedItemCode : '',
        ),
      )
    }

    if (!nodeMap.has(edge.toId)) {
      registerNode(
        buildFallbackGraphNode(
          edge.toId,
          edge.toName,
          edge.toId === normalizedItemId
            ? 'warehouse_resource'
            : downstreamIds.has(edge.toId)
              ? 'data_api'
              : 'unknown',
          edge.toId === normalizedItemId ? normalizedItemCode : '',
        ),
      )
    }
  })

  return {
    currentNode: nodeMap.get(normalizedItemId) ?? currentNode,
    nodes: Array.from(nodeMap.values()),
    edges: lineageEdges,
  }
}

function buildGlobalLineage(catalogItems: MinimalCatalogItem[]) {
  const nodeMap = new Map<string, MinimalGraphNode>()
  const edgeBuffer: MinimalGraphEdge[] = []

  catalogItems.forEach((item) => {
    const normalized = normalizeItemLineage(item)
    normalized.nodes.forEach((node) => {
      const existing = nodeMap.get(node.id)
      nodeMap.set(node.id, existing ? mergeGraphNode(existing, node) : node)
    })
    edgeBuffer.push(...normalized.edges)
  })

  return {
    nodeMap,
    edges: dedupeGraphEdges(edgeBuffer),
  }
}

function buildAdjacency(edges: MinimalGraphEdge[]) {
  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()

  edges.forEach((edge) => {
    const outList = outgoing.get(edge.fromId) ?? []
    outList.push(edge.toId)
    outgoing.set(edge.fromId, outList)

    const inList = incoming.get(edge.toId) ?? []
    inList.push(edge.fromId)
    incoming.set(edge.toId, inList)
  })

  return { outgoing, incoming }
}

function collectReachableIds(seedId: string, adjacency: Map<string, string[]>) {
  const normalizedSeedId = normalizeText(seedId)
  const visited = new Set<string>(normalizedSeedId ? [normalizedSeedId] : [])
  const queue = normalizedSeedId ? [normalizedSeedId] : []

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    ;(adjacency.get(current) ?? []).forEach((nextId) => {
      if (visited.has(nextId)) return
      visited.add(nextId)
      queue.push(nextId)
    })
  }

  return visited
}

function buildVisibleCatalogGraph(resourceId: string, catalogItems: MinimalCatalogItem[]) {
  const normalizedResourceId = normalizeText(resourceId)
  if (!normalizedResourceId) {
    return { nodes: [] as MinimalGraphNode[], edges: [] as MinimalGraphEdge[] }
  }

  const global = buildGlobalLineage(catalogItems)
  const currentItem = catalogItems.find((item) => normalizeText(item.id) === normalizedResourceId)
  const currentNode =
    global.nodeMap.get(normalizedResourceId)
    ?? buildFallbackGraphNode(
      normalizedResourceId,
      normalizeText(currentItem?.name) || normalizedResourceId,
      'warehouse_resource',
      normalizeText(currentItem?.code),
    )

  const { incoming, outgoing } = buildAdjacency(global.edges)
  const ancestorIds = collectReachableIds(normalizedResourceId, incoming)
  const descendantIds = collectReachableIds(normalizedResourceId, outgoing)
  const upstreamEdges = global.edges.filter((edge) => ancestorIds.has(edge.fromId) && ancestorIds.has(edge.toId))
  const downstreamEdges = global.edges.filter((edge) => descendantIds.has(edge.fromId) && descendantIds.has(edge.toId))
  const edges = dedupeGraphEdges([...upstreamEdges, ...downstreamEdges])

  const visibleNodeIds = new Set<string>([currentNode.id])
  edges.forEach((edge) => {
    const fromNode = global.nodeMap.get(edge.fromId)
    const toNode = global.nodeMap.get(edge.toId)
    if (fromNode?.nodeType !== 'warehouse_layer') {
      visibleNodeIds.add(edge.fromId)
    }
    if (toNode?.nodeType !== 'warehouse_layer') {
      visibleNodeIds.add(edge.toId)
    }
  })

  const nodes = Array.from(visibleNodeIds)
    .map((id) => global.nodeMap.get(id) ?? buildFallbackGraphNode(id, id))
    .filter((node) => node.nodeType !== 'warehouse_layer')

  const nodeIdSet = new Set(nodes.map((node) => node.id))
  return {
    nodes,
    edges: edges.filter((edge) => nodeIdSet.has(edge.fromId) && nodeIdSet.has(edge.toId)),
  }
}

export function dedupeLineageNodeReferences(references: LineageNodeReference[]) {
  const seen = new Set<string>()
  const result: LineageNodeReference[] = []

  references.forEach((reference) => {
    const normalized: LineageNodeReference = {
      nodeId: normalizeText(reference.nodeId),
      name: normalizeText(reference.name),
      nodeType: reference.nodeType,
      resourceCode: normalizeText(reference.resourceCode),
      layer: normalizeText(reference.layer),
    }
    if (!normalized.nodeId || !normalized.name) return
    const key = buildReferenceKey(normalized)
    if (seen.has(key)) return
    seen.add(key)
    result.push(normalized)
  })

  return result
}

export function buildLineageNodeReferences(catalogItems: MinimalCatalogItem[]) {
  const references: LineageNodeReference[] = []

  catalogItems.forEach((item) => {
    if (!item) return

    const currentNode = item.dataLineage?.nodes.find((node) => normalizeText(node.id) === normalizeText(item.id))
    references.push({
      nodeId: normalizeText(item.id),
      name: normalizeText(item.name),
      nodeType: 'warehouse_resource',
      resourceCode: normalizeText(item.code),
      layer: normalizeText(currentNode?.layer),
    })

    item.dataLineage?.nodes.forEach((node) => {
      references.push({
        nodeId: normalizeText(node.id),
        name: normalizeText(node.name),
        nodeType: node.nodeType,
        resourceCode: normalizeText(node.resourceCode),
        layer: normalizeText(node.layer),
      })
    })
  })

  return dedupeLineageNodeReferences(references)
}

export function searchLineageNodeReferences(
  references: LineageNodeReference[],
  keyword: string,
  currentNodeType?: CatalogLineageNodeType,
) {
  const normalizedKeyword = toSearchText(keyword)
  if (!normalizedKeyword) return []

  const score = (reference: LineageNodeReference) => {
    const nameText = toSearchText(reference.name)
    const idText = toSearchText(reference.nodeId)
    const codeText = toSearchText(reference.resourceCode)
    const exactName = nameText === normalizedKeyword ? 0 : nameText.startsWith(normalizedKeyword) ? 1 : nameText.includes(normalizedKeyword) ? 2 : 3
    const exactType = currentNodeType && reference.nodeType === currentNodeType ? 0 : 1
    const idHit = idText.includes(normalizedKeyword) ? 0 : 1
    const codeHit = codeText.includes(normalizedKeyword) ? 0 : 1
    return exactName * 100 + exactType * 10 + idHit * 2 + codeHit
  }

  return dedupeLineageNodeReferences(references)
    .filter((reference) => {
      const nameText = toSearchText(reference.name)
      const idText = toSearchText(reference.nodeId)
      const codeText = toSearchText(reference.resourceCode)
      return nameText.includes(normalizedKeyword) || idText.includes(normalizedKeyword) || codeText.includes(normalizedKeyword)
    })
    .sort((left, right) => {
      const diff = score(left) - score(right)
      if (diff !== 0) return diff
      return left.name.localeCompare(right.name, 'zh-CN', { sensitivity: 'base', numeric: true })
    })
}

export function findExactLineageNodeReference(
  references: LineageNodeReference[],
  name: string,
  preferredNodeType?: CatalogLineageNodeType,
) {
  const normalizedName = normalizeText(name)
  if (!normalizedName) return null

  const exactMatches = dedupeLineageNodeReferences(references).filter(
    (reference) => normalizeText(reference.name) === normalizedName,
  )
  if (exactMatches.length === 0) return null

  if (preferredNodeType) {
    const matched = exactMatches.find((reference) => reference.nodeType === preferredNodeType)
    if (matched) return matched
  }

  return exactMatches[0] ?? null
}

export function applyLineageNodeReference(
  node: EditableLineageNodeRow,
  reference: LineageNodeReference,
): EditableLineageNodeRow {
  return {
    ...node,
    nodeId: normalizeText(reference.nodeId),
    name: normalizeText(reference.name),
    nodeType: reference.nodeType,
    resourceCode: normalizeText(reference.resourceCode),
    layer: normalizeText(reference.layer),
  }
}

export function syncLineageNodeDraftForType(
  node: EditableLineageNodeRow,
  nextNodeType: CatalogLineageNodeType,
  references: LineageNodeReference[],
): EditableLineageNodeRow {
  const nextNode = {
    ...node,
    nodeType: nextNodeType,
  }

  const exactReference = findExactLineageNodeReference(references, node.name, nextNodeType)
  if (exactReference) {
    return applyLineageNodeReference(nextNode, exactReference)
  }

  if (nextNodeType === 'warehouse_layer') {
    return {
      ...nextNode,
      resourceCode: '',
    }
  }

  if (nextNodeType === 'data_source' || nextNodeType === 'data_api' || nextNodeType === 'unknown') {
    return {
      ...nextNode,
      layer: '',
    }
  }

  return nextNode
}

export function mergeLineageRecordWithCatalogGraph(
  record: EditableLineageRecord,
  resourceId: string,
  catalogItems: MinimalCatalogItem[],
): EditableLineageRecord {
  const visibleGraph = buildVisibleCatalogGraph(resourceId, catalogItems)
  if (visibleGraph.nodes.length === 0 && visibleGraph.edges.length === 0) {
    return record
  }

  const currentResourceId = normalizeText(resourceId)
  const excludedNodeIds = new Set(readExcludedNodeIds(record.rootExtra).filter((nodeId) => nodeId !== currentResourceId))
  const excludedEdgeKeys = new Set(readExcludedEdgeKeys(record.rootExtra))
  const filteredGraphEdges = visibleGraph.edges.filter((edge) => {
    if (excludedNodeIds.has(edge.fromId) || excludedNodeIds.has(edge.toId)) return false
    return !excludedEdgeKeys.has(buildEdgeKey(edge.fromId, edge.toId))
  })
  const allowedGraphNodeIds = new Set<string>([currentResourceId])
  filteredGraphEdges.forEach((edge) => {
    allowedGraphNodeIds.add(edge.fromId)
    allowedGraphNodeIds.add(edge.toId)
  })
  const filteredGraphNodes = visibleGraph.nodes.filter(
    (node) => !excludedNodeIds.has(node.id) && allowedGraphNodeIds.has(node.id),
  )
  const graphNodeMap = new Map(filteredGraphNodes.map((node) => [node.id, node]))
  const mergedNodes = record.nodes.map((node) => {
    const normalizedNodeId = normalizeText(node.nodeId)
    const graphNode = graphNodeMap.get(normalizedNodeId)
    if (!graphNode) return node

    return {
      ...node,
      name: normalizeText(node.name) || graphNode.name,
      nodeType: node.nodeType === 'unknown' ? graphNode.nodeType : node.nodeType,
      resourceCode: normalizeText(node.resourceCode) || graphNode.resourceCode,
      layer: normalizeText(node.layer) || graphNode.layer,
    }
  })

  const existingNodeIds = new Set(mergedNodes.map((node) => normalizeText(node.nodeId)).filter(Boolean))
  filteredGraphNodes.forEach((node) => {
    if (existingNodeIds.has(node.id)) return
    mergedNodes.push({
      id: `catalog-lineage-node:${node.id}`,
      nodeId: node.id,
      name: node.name,
      nodeType: node.nodeType,
      resourceCode: node.resourceCode,
      layer: node.layer,
      extra: {},
    })
    existingNodeIds.add(node.id)
  })

  const mergedEdges = [...record.edges]
  const existingEdgeKeys = new Set(
    mergedEdges
      .map((edge) => `${normalizeText(edge.fromId)}->${normalizeText(edge.toId)}`)
      .filter((key) => key !== '->'),
  )

  filteredGraphEdges.forEach((edge) => {
    const key = buildEdgeKey(edge.fromId, edge.toId)
    if (!key) return
    if (existingEdgeKeys.has(key)) return
    mergedEdges.push({
      id: `catalog-lineage-edge:${key}`,
      fromId: edge.fromId,
      toId: edge.toId,
      extra: {},
    })
    existingEdgeKeys.add(key)
  })

  return {
    ...record,
    nodes: mergedNodes,
    edges: mergedEdges,
  }
}
