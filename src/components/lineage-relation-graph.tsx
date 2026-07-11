import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppWindow, Database, HardDrive, Layers3, type LucideIcon } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { resolveLineageNodeResourceId } from '../lib/lineage-detail-link'
import type { CatalogItem, CatalogLineageEdge, CatalogLineageNode, CatalogLineageNodeType } from '../lib/nocobase-portal-data'

type PositionedLineageNode = CatalogLineageNode & {
  column: number
  x: number
  y: number
  width: number
  height: number
}

type ColumnLineage = {
  sourceNodes: CatalogLineageNode[]
  warehouseNodes: CatalogLineageNode[]
  serviceNodes: CatalogLineageNode[]
  nodes: CatalogLineageNode[]
  edges: CatalogLineageEdge[]
}

type ItemLineageGraph = {
  currentNode: CatalogLineageNode
  nodes: CatalogLineageNode[]
  edges: CatalogLineageEdge[]
}

type RenderableLineage = {
  currentNode: CatalogLineageNode
  nodes: CatalogLineageNode[]
  edges: CatalogLineageEdge[]
  upstreamNodes: CatalogLineageNode[]
  downstreamNodes: CatalogLineageNode[]
  upstreamTerminals: CatalogLineageNode[]
  downstreamTerminals: CatalogLineageNode[]
}

type GlobalLineageGraph = {
  nodeMap: Map<string, CatalogLineageNode>
  edges: CatalogLineageEdge[]
}

type DragState = {
  nodeId: string
  pointerId: number
  offsetX: number
  offsetY: number
  originX: number
  originY: number
  moved: boolean
}

const NODE_TYPE_LABEL: Record<CatalogLineageNodeType, string> = {
  data_source: '数据源',
  warehouse_resource: '数据资源',
  warehouse_layer: '仓库分层',
  data_api: '数据API',
  unknown: '血缘节点',
}

const LAYER_LABEL: Record<string, string> = {
  ods: 'ODS层',
  dwd: 'DWD层',
  dws: 'DWS层',
  ads: 'ADS层',
  dim: 'DIM层',
}

const LAYER_ORDER: Record<string, number> = {
  ods: 1,
  dwd: 2,
  dim: 3,
  dws: 4,
  ads: 5,
}

function buildFallbackNode(
  id: string,
  name: string,
  nodeType: CatalogLineageNodeType = 'unknown',
  resourceCode = '',
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

function mergeNodeField(primary: string, secondary: string, fallback = '') {
  return primary || secondary || fallback
}

function mergeLineageNode(current: CatalogLineageNode, next: CatalogLineageNode) {
  return {
    id: current.id,
    name: current.name !== current.id ? current.name : mergeNodeField(next.name, current.name, current.id),
    nodeType: current.nodeType !== 'unknown' ? current.nodeType : next.nodeType,
    resourceCode: mergeNodeField(current.resourceCode, next.resourceCode),
    layer: mergeNodeField(current.layer, next.layer),
    ownerId: mergeNodeField(current.ownerId, next.ownerId),
    ownerName: mergeNodeField(current.ownerName, next.ownerName),
    tableCount: Math.max(current.tableCount, next.tableCount),
    tables: current.tables.length > 0 ? current.tables : next.tables,
  } satisfies CatalogLineageNode
}

function dedupeEdges(edges: CatalogLineageEdge[]) {
  const seen = new Set<string>()
  return edges.filter((edge) => {
    const key = `${edge.fromId}->${edge.toId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildLineageEdgeKey(fromId: string, toId: string) {
  const normalizedFromId = fromId.trim()
  const normalizedToId = toId.trim()
  if (!normalizedFromId || !normalizedToId) return ''
  return `${normalizedFromId}->${normalizedToId}`
}

function dedupeNodes(nodes: CatalogLineageNode[]) {
  const map = new Map<string, CatalogLineageNode>()
  nodes.forEach((node) => {
    const existing = map.get(node.id)
    map.set(node.id, existing ? mergeLineageNode(existing, node) : node)
  })
  return Array.from(map.values())
}

function normalizeItemLineage(item: CatalogItem): ItemLineageGraph {
  const currentNode =
    item.dataLineage?.nodes.find((node) => node.id === item.id) ??
    buildFallbackNode(item.id, item.name, 'warehouse_resource', item.code)

  const upstream = item.dataLineage?.upstream ?? []
  const downstream = item.dataLineage?.downstream ?? []
  const upstreamIds = new Set(upstream.map((node) => node.id))
  const downstreamIds = new Set(downstream.map((node) => node.id))
  const nodeMap = new Map<string, CatalogLineageNode>([[currentNode.id, currentNode]])
  const registerNode = (node: CatalogLineageNode) => {
    const existing = nodeMap.get(node.id)
    nodeMap.set(node.id, existing ? mergeLineageNode(existing, node) : node)
  }

  upstream.forEach(registerNode)
  downstream.forEach(registerNode)
  ;(item.dataLineage?.nodes ?? []).forEach(registerNode)

  const lineageEdges =
    item.dataLineage?.edges && item.dataLineage.edges.length > 0
      ? dedupeEdges(item.dataLineage.edges)
      : dedupeEdges([
          ...upstream.map((node) => ({
            fromId: node.id,
            fromName: node.name,
            toId: item.id,
            toName: item.name,
          })),
          ...downstream.map((node) => ({
            fromId: item.id,
            fromName: item.name,
            toId: node.id,
            toName: node.name,
          })),
        ])

  lineageEdges.forEach((edge) => {
    if (!nodeMap.has(edge.fromId)) {
      registerNode(
        buildFallbackNode(
          edge.fromId,
          edge.fromName,
          edge.fromId === item.id
            ? 'warehouse_resource'
            : edge.fromId.startsWith('layer:')
              ? 'warehouse_layer'
              : upstreamIds.has(edge.fromId)
                ? 'data_source'
                : 'unknown',
        ),
      )
    }

    if (!nodeMap.has(edge.toId)) {
      registerNode(
        buildFallbackNode(
          edge.toId,
          edge.toName,
          edge.toId === item.id
            ? 'warehouse_resource'
            : edge.toId.startsWith('layer:')
              ? 'warehouse_layer'
              : downstreamIds.has(edge.toId)
                ? 'data_api'
                : 'unknown',
        ),
      )
    }
  })

  return {
    currentNode: nodeMap.get(item.id) ?? currentNode,
    nodes: dedupeNodes(Array.from(nodeMap.values())),
    edges: lineageEdges,
  }
}

function buildGlobalLineage(catalogItems: CatalogItem[]) {
  const nodeMap = new Map<string, CatalogLineageNode>()
  const edgeBuffer: CatalogLineageEdge[] = []

  catalogItems.forEach((item) => {
    const normalized = normalizeItemLineage(item)
    normalized.nodes.forEach((node) => {
      const existing = nodeMap.get(node.id)
      nodeMap.set(node.id, existing ? mergeLineageNode(existing, node) : node)
    })
    edgeBuffer.push(...normalized.edges)
  })

  return {
    nodeMap,
    edges: dedupeEdges(edgeBuffer),
  } satisfies GlobalLineageGraph
}

function buildAdjacency(edges: CatalogLineageEdge[]) {
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
  const visited = new Set<string>([seedId])
  const queue = [seedId]

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

function buildRenderableLineage(item: CatalogItem, catalogItems: CatalogItem[]): RenderableLineage {
  const global = buildGlobalLineage(catalogItems)
  const currentNode =
    global.nodeMap.get(item.id) ??
    buildFallbackNode(item.id, item.name, 'warehouse_resource', item.code)
  const excludedNodeIds = new Set((item.dataLineage?.excludedNodeIds ?? []).filter((nodeId) => nodeId !== item.id))
  const excludedEdgeKeys = new Set(item.dataLineage?.excludedEdgeKeys ?? [])

  const { incoming, outgoing } = buildAdjacency(global.edges)
  const ancestorIds = collectReachableIds(item.id, incoming)
  const descendantIds = collectReachableIds(item.id, outgoing)

  const upstreamEdges = global.edges.filter((edge) => ancestorIds.has(edge.fromId) && ancestorIds.has(edge.toId))
  const downstreamEdges = global.edges.filter((edge) => descendantIds.has(edge.fromId) && descendantIds.has(edge.toId))
  const edges = dedupeEdges([...upstreamEdges, ...downstreamEdges]).filter((edge) => {
    if (excludedNodeIds.has(edge.fromId) || excludedNodeIds.has(edge.toId)) return false
    return !excludedEdgeKeys.has(buildLineageEdgeKey(edge.fromId, edge.toId))
  })

  const nodeIds = new Set<string>([item.id])
  edges.forEach((edge) => {
    nodeIds.add(edge.fromId)
    nodeIds.add(edge.toId)
  })

  const nodes = dedupeNodes(
    Array.from(nodeIds).map((id) => global.nodeMap.get(id) ?? buildFallbackNode(id, id)),
  ).filter((node) => node.id === item.id || !excludedNodeIds.has(node.id))

  const upstreamNodes = nodes.filter((node) => node.id !== item.id && ancestorIds.has(node.id))
  const downstreamNodes = nodes.filter((node) => node.id !== item.id && descendantIds.has(node.id))

  const upstreamTerminals = upstreamNodes.filter((node) => {
    const hasIncomingWithinAncestors = edges.some(
      (edge) => ancestorIds.has(edge.fromId) && ancestorIds.has(edge.toId) && edge.toId === node.id,
    )
    return node.nodeType === 'data_source' || !hasIncomingWithinAncestors
  })

  const downstreamTerminals = downstreamNodes.filter((node) => {
    const hasOutgoingWithinDescendants = edges.some(
      (edge) => descendantIds.has(edge.fromId) && descendantIds.has(edge.toId) && edge.fromId === node.id,
    )
    return node.nodeType === 'data_api' || !hasOutgoingWithinDescendants
  })

  return {
    currentNode,
    nodes,
    edges,
    upstreamNodes,
    downstreamNodes,
    upstreamTerminals: upstreamTerminals.sort(sortNodes),
    downstreamTerminals: downstreamTerminals.sort(sortNodes),
  }
}

function sortNodes(left: CatalogLineageNode, right: CatalogLineageNode) {
  const typeOrder: Record<CatalogLineageNodeType, number> = {
    data_source: 1,
    warehouse_layer: 2,
    warehouse_resource: 3,
    data_api: 4,
    unknown: 5,
  }

  if (left.nodeType !== right.nodeType) {
    return typeOrder[left.nodeType] - typeOrder[right.nodeType]
  }

  if (left.nodeType === 'warehouse_layer' && right.nodeType === 'warehouse_layer') {
    const leftLayerOrder = LAYER_ORDER[left.layer] ?? 99
    const rightLayerOrder = LAYER_ORDER[right.layer] ?? 99
    if (leftLayerOrder !== rightLayerOrder) {
      return leftLayerOrder - rightLayerOrder
    }
  }

  return left.name.localeCompare(right.name, 'zh-CN')
}

function getNodeSize(node: CatalogLineageNode) {
  if (node.nodeType === 'warehouse_resource') {
    return { width: 296, height: 120 }
  }
  return { width: 256, height: 86 }
}

function getNodeTone(node: CatalogLineageNode) {
  if (node.nodeType === 'warehouse_resource') return 'resource'
  if (node.nodeType === 'warehouse_layer') return 'layer'
  if (node.nodeType === 'data_source') return 'source'
  if (node.nodeType === 'data_api') return 'api'
  return 'unknown'
}

function sortLayerKeys(keys: Iterable<string>) {
  return Array.from(new Set(keys))
    .filter((key) => key in LAYER_LABEL)
    .sort((left, right) => (LAYER_ORDER[left] ?? 99) - (LAYER_ORDER[right] ?? 99))
}

function extractLayersFromText(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return []

  const matches = normalized.match(/\b(ods|dwd|dws|ads|dim)\b/g) ?? []
  return sortLayerKeys(matches)
}

function extractLayersFromTables(node: CatalogLineageNode) {
  const layers = new Set<string>()
  node.tables.forEach((table) => {
    extractLayersFromText(table.rawLayer).forEach((layer) => layers.add(layer))
    const tablePrefix = table.tableName.trim().toLowerCase().match(/^(ods|dwd|dws|ads|dim)_/)
    if (tablePrefix?.[1]) {
      layers.add(tablePrefix[1])
    }
  })
  return sortLayerKeys(layers)
}

function extractLayersFromCatalogItem(item: CatalogItem | undefined) {
  if (!item) return []

  const layers = new Set<string>()
  extractLayersFromText(item.sourceTable).forEach((layer) => layers.add(layer))
  return sortLayerKeys(layers)
}

function formatLayerText(keys: Iterable<string>) {
  return sortLayerKeys(keys)
    .map((layer) => LAYER_LABEL[layer])
    .join(' / ')
}

function getAdjacentLayerKeys(
  node: CatalogLineageNode,
  renderable: RenderableLineage,
) {
  const layers = new Set<string>()

  renderable.edges.forEach((edge) => {
    if (edge.fromId !== node.id && edge.toId !== node.id) return
    const siblingId = edge.fromId === node.id ? edge.toId : edge.fromId
    const siblingNode = renderable.nodes.find((item) => item.id === siblingId)
    if (siblingNode?.nodeType === 'warehouse_layer' && siblingNode.layer in LAYER_LABEL) {
      layers.add(siblingNode.layer)
    }
  })

  return sortLayerKeys(layers)
}

function getPreferredResourceLayers(
  node: CatalogLineageNode,
  renderable: RenderableLineage,
  catalogItemMap: Map<string, CatalogItem>,
) {
  const fromCatalog = extractLayersFromCatalogItem(catalogItemMap.get(node.id))
  if (fromCatalog.length > 0) return fromCatalog

  const fromNode = sortLayerKeys([
    ...(node.layer ? [node.layer] : []),
    ...extractLayersFromTables(node),
  ])
  if (fromNode.length > 0) return fromNode

  return getAdjacentLayerKeys(node, renderable)
}

function getNodeLabel(node: CatalogLineageNode) {
  return NODE_TYPE_LABEL[node.nodeType]
}

function getNodeLevel(
  node: CatalogLineageNode,
  renderable: RenderableLineage,
  catalogItemMap: Map<string, CatalogItem>,
) {
  if (node.nodeType === 'warehouse_resource') {
    return formatLayerText(getPreferredResourceLayers(node, renderable, catalogItemMap))
  }

  return ''
}

function getNodeIcon(node: CatalogLineageNode): LucideIcon {
  if (node.nodeType === 'warehouse_layer') return Layers3
  if (node.nodeType === 'data_source') return HardDrive
  if (node.nodeType === 'data_api') return AppWindow
  return Database
}

function getNodeDisplayName(node: CatalogLineageNode) {
  if (node.nodeType === 'warehouse_layer' && node.layer in LAYER_LABEL) {
    return LAYER_LABEL[node.layer]
  }
  return node.name
}

function getPrimaryLayerOrder(
  node: CatalogLineageNode,
  renderable: RenderableLineage,
  catalogItemMap: Map<string, CatalogItem>,
) {
  const layers = getPreferredResourceLayers(node, renderable, catalogItemMap)
  return Math.min(...layers.map((layer) => LAYER_ORDER[layer] ?? 99), 99)
}

function getPrimaryLayerKey(
  node: CatalogLineageNode,
  renderable: RenderableLineage,
  catalogItemMap: Map<string, CatalogItem>,
) {
  return getPreferredResourceLayers(node, renderable, catalogItemMap)[0] ?? ''
}

function buildColumnLineage(
  renderable: RenderableLineage,
  catalogItemMap: Map<string, CatalogItem>,
): ColumnLineage {
  const nodeMap = new Map(renderable.nodes.map((node) => [node.id, node]))
  const sourceNodes = dedupeNodes(renderable.nodes.filter((node) => node.nodeType === 'data_source')).sort(sortNodes)
  const serviceNodes = dedupeNodes(renderable.nodes.filter((node) => node.nodeType === 'data_api')).sort(sortNodes)
  const warehouseNodes = dedupeNodes(renderable.nodes.filter((node) => node.nodeType === 'warehouse_resource')).sort((left, right) => {
    const leftOrder = getPrimaryLayerOrder(left, renderable, catalogItemMap)
    const rightOrder = getPrimaryLayerOrder(right, renderable, catalogItemMap)

    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    if (left.id === renderable.currentNode.id) return -1
    if (right.id === renderable.currentNode.id) return 1
    return left.name.localeCompare(right.name, 'zh-CN')
  })
  const selectedNodeIds = new Set([
    ...sourceNodes.map((node) => node.id),
    ...warehouseNodes.map((node) => node.id),
    ...serviceNodes.map((node) => node.id),
  ])
  const edges = dedupeEdges(
    renderable.edges.filter((edge) => {
      const fromNode = nodeMap.get(edge.fromId)
      const toNode = nodeMap.get(edge.toId)
      if (!fromNode || !toNode) return false
      if (fromNode.nodeType === 'warehouse_layer' || toNode.nodeType === 'warehouse_layer') return false
      return selectedNodeIds.has(edge.fromId) && selectedNodeIds.has(edge.toId)
    }),
  )

  return {
    sourceNodes,
    warehouseNodes,
    serviceNodes,
    nodes: [...sourceNodes, ...warehouseNodes, ...serviceNodes],
    edges,
  }
}

function distributeYPositions(count: number, top: number, bottom: number) {
  if (count <= 1) {
    return [(top + bottom) / 2]
  }

  return Array.from({ length: count }, (_, index) => top + ((bottom - top) * index) / Math.max(count - 1, 1))
}

function avoidOverlap(positions: number[], minGap: number, top: number, bottom: number) {
  if (positions.length <= 1) return positions
  const output = [...positions].sort((left, right) => left - right)
  for (let index = 1; index < output.length; index += 1) {
    if (output[index] - output[index - 1] < minGap) {
      output[index] = output[index - 1] + minGap
    }
  }
  for (let index = output.length - 2; index >= 0; index -= 1) {
    if (output[index + 1] > bottom) {
      output[index + 1] = bottom
    }
    if (output[index + 1] - output[index] < minGap) {
      output[index] = output[index + 1] - minGap
    }
  }
  if (output[0] < top) {
    const delta = top - output[0]
    return output.map((value) => value + delta)
  }
  return output
}

function buildPositions(
  lineage: ColumnLineage,
  renderable: RenderableLineage,
  catalogItemMap: Map<string, CatalogItem>,
) {
  const sourceColumnX = 190
  const warehouseColumnX = 740
  const serviceColumnX = lineage.serviceNodes.length > 0 ? 1290 : 0
  const graphWidth = lineage.serviceNodes.length > 0 ? 1500 : 1100
  const warehouseLayerKeys = Array.from(
    new Set(
      lineage.warehouseNodes
        .map((node) => getPrimaryLayerKey(node, renderable, catalogItemMap))
        .filter(Boolean),
    ),
  ).sort((left, right) => (LAYER_ORDER[left] ?? 99) - (LAYER_ORDER[right] ?? 99))
  const maxColumnSize = Math.max(lineage.sourceNodes.length, lineage.warehouseNodes.length, lineage.serviceNodes.length, 1)
  const graphHeight = Math.max(620, 220 + maxColumnSize * 108, 220 + warehouseLayerKeys.length * 120)
  const top = 120
  const bottom = graphHeight - 120
  const positionedNodes: PositionedLineageNode[] = []
  const warehousePositionMap = new Map<string, number>()

  if (lineage.warehouseNodes.length > 0) {
    const centers = distributeYPositions(warehouseLayerKeys.length || 1, top, bottom)
    warehouseLayerKeys.forEach((layerKey, layerIndex) => {
      const bucketNodes = lineage.warehouseNodes.filter(
        (node) => getPrimaryLayerKey(node, renderable, catalogItemMap) === layerKey,
      )
      if (bucketNodes.length === 0) return

      const previousCenter = centers[layerIndex - 1] ?? top
      const currentCenter = centers[layerIndex] ?? (top + bottom) / 2
      const nextCenter = centers[layerIndex + 1] ?? bottom
      const bucketTop = layerIndex === 0 ? top : (previousCenter + currentCenter) / 2 + 8
      const bucketBottom = layerIndex === centers.length - 1 ? bottom : (currentCenter + nextCenter) / 2 - 8
      const yPositions = distributeYPositions(bucketNodes.length, bucketTop, bucketBottom)

      bucketNodes.forEach((node, index) => {
        warehousePositionMap.set(node.id, yPositions[index] ?? currentCenter)
      })
    })
  }

  lineage.warehouseNodes.forEach((node) => {
    const { width, height } = getNodeSize(node)
    positionedNodes.push({
      ...node,
      column: 1,
      x: warehouseColumnX,
      y: warehousePositionMap.get(node.id) ?? graphHeight / 2,
      width,
      height,
    })
  })

  const warehouseNodeMap = new Map(positionedNodes.map((node) => [node.id, node]))
  const sourceAnchors = lineage.sourceNodes.map((node) => {
    const targetYs = lineage.edges
      .filter((edge) => edge.fromId === node.id)
      .map((edge) => warehouseNodeMap.get(edge.toId)?.y)
      .filter((value): value is number => typeof value === 'number')
    return targetYs.length > 0 ? targetYs.reduce((sum, value) => sum + value, 0) / targetYs.length : graphHeight / 2
  })
  const sourceY = avoidOverlap(sourceAnchors, 52, top, bottom)

  lineage.sourceNodes.forEach((node, index) => {
    const { width, height } = getNodeSize(node)
    positionedNodes.push({
      ...node,
      column: 0,
      x: sourceColumnX,
      y: sourceY[index] ?? graphHeight / 2,
      width,
      height,
    })
  })

  const serviceAnchors = lineage.serviceNodes.map((node) => {
    const sourceYs = lineage.edges
      .filter((edge) => edge.toId === node.id)
      .map((edge) => warehouseNodeMap.get(edge.fromId)?.y)
      .filter((value): value is number => typeof value === 'number')
    return sourceYs.length > 0 ? sourceYs.reduce((sum, value) => sum + value, 0) / sourceYs.length : graphHeight / 2
  })
  const serviceY = avoidOverlap(serviceAnchors, 52, top, bottom)

  lineage.serviceNodes.forEach((node, index) => {
    const { width, height } = getNodeSize(node)
    positionedNodes.push({
      ...node,
      column: 2,
      x: serviceColumnX,
      y: serviceY[index] ?? graphHeight / 2,
      width,
      height,
    })
  })

  return {
    graphWidth,
    graphHeight,
    nodes: positionedNodes,
  }
}

function getSvgPointerPosition(
  clientX: number,
  clientY: number,
  svgElement: SVGSVGElement,
  graphWidth: number,
  graphHeight: number,
) {
  const rect = svgElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 }
  }
  return {
    x: ((clientX - rect.left) / rect.width) * graphWidth,
    y: ((clientY - rect.top) / rect.height) * graphHeight,
  }
}

export function LineageRelationGraph({
  item,
  catalogItems,
}: {
  item: CatalogItem
  catalogItems: CatalogItem[]
}) {
  const location = useLocation()
  const appBasePath = useMemo(() => {
    if (typeof window === 'undefined') return '/data-catalog'
    const currentPathname = window.location.pathname
    const marker = '/catalog/'
    const markerIndex = currentPathname.indexOf(marker)
    if (markerIndex >= 0) {
      return currentPathname.slice(0, markerIndex) || '/data-catalog'
    }
    return '/data-catalog'
  }, [])
  const renderable = useMemo(() => buildRenderableLineage(item, catalogItems), [catalogItems, item])
  const catalogItemMap = useMemo(() => new Map(catalogItems.map((catalogItem) => [catalogItem.id, catalogItem])), [catalogItems])
  const catalogItemIds = useMemo(() => new Set(catalogItems.map((catalogItem) => catalogItem.id)), [catalogItems])
  const columnLineage = useMemo(
    () => buildColumnLineage(renderable, catalogItemMap),
    [catalogItemMap, renderable],
  )
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [activeDragNodeId, setActiveDragNodeId] = useState<string | null>(null)
  const { graphWidth, graphHeight, nodes } = useMemo(
    () => buildPositions(columnLineage, renderable, catalogItemMap),
    [catalogItemMap, columnLineage, renderable],
  )
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)

  useEffect(() => {
    setManualPositions({})
    setActiveDragNodeId(null)
    dragStateRef.current = null
  }, [item.id])

  const layoutNodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const manualPosition = manualPositions[node.id]
        return manualPosition ? { ...node, ...manualPosition } : node
      }),
    [manualPositions, nodes],
  )

  const positionedNodeMap = new Map(displayNodes.map((node) => [node.id, node]))
  const sortedCards = [...displayNodes].sort((left, right) => {
    if (left.column !== right.column) return left.column - right.column
    return left.y - right.y
  })
  const prefix = `lineage-${item.id}`

  const handleNodePointerDown = useCallback(
    (event: React.PointerEvent<SVGGElement>, node: PositionedLineageNode) => {
      if (event.button !== 0) return
      if (!svgRef.current) return

      const point = getSvgPointerPosition(event.clientX, event.clientY, svgRef.current, graphWidth, graphHeight)
      dragStateRef.current = {
        nodeId: node.id,
        pointerId: event.pointerId,
        offsetX: point.x - node.x,
        offsetY: point.y - node.y,
        originX: node.x,
        originY: node.y,
        moved: false,
      }
      setActiveDragNodeId(node.id)
      event.preventDefault()
    },
    [graphHeight, graphWidth],
  )

  const buildLineageNodeDetailHref = useCallback(
    (node: CatalogLineageNode) => {
      const resourceId = resolveLineageNodeResourceId(node, catalogItemIds, item.id)
      const nextParams = new URLSearchParams(location.search)
      nextParams.set('tab', 'lineage')
      const query = nextParams.toString()
      return `${appBasePath}/catalog/${resourceId}${query ? `?${query}` : ''}`
    },
    [appBasePath, catalogItemIds, item.id, location.search],
  )

  const openLineageNodeDetail = useCallback(
    (node: CatalogLineageNode) => {
      const nextPageHref = buildLineageNodeDetailHref(node)
      const newPage = window.open(nextPageHref, '_blank')
      if (newPage) {
        newPage.opener = null
      }
    },
    [buildLineageNodeDetailHref],
  )

  const renderNodeChip = useCallback(
    (node: CatalogLineageNode) => {
      const Icon = getNodeIcon(node)
      const displayName = getNodeDisplayName(node)
      return (
        <button
          key={node.id}
          type="button"
          onClick={() => openLineageNodeDetail(node)}
          title={`点击在新页面查看 ${displayName} 对应资源详情`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lineage-chip-border)] bg-[linear-gradient(180deg,var(--lineage-chip-bg-start),var(--lineage-chip-bg-end))] px-3 py-1 text-[0.75rem] text-[var(--lineage-chip-text)] transition hover:border-[var(--lineage-chip-hover-border)] hover:text-[var(--primary)]"
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{displayName}</span>
        </button>
      )
    },
    [openLineageNodeDetail],
  )

  useEffect(() => {
    if (!activeDragNodeId) return undefined

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      const svgElement = svgRef.current
      if (!dragState || !svgElement || dragState.pointerId !== event.pointerId) return

      const layoutNode = layoutNodeMap.get(dragState.nodeId)
      if (!layoutNode) return

      const point = getSvgPointerPosition(event.clientX, event.clientY, svgElement, graphWidth, graphHeight)
      const nextX = Math.min(
        graphWidth - layoutNode.width / 2 - 20,
        Math.max(layoutNode.width / 2 + 20, point.x - dragState.offsetX),
      )
      const nextY = Math.min(
        graphHeight - layoutNode.height / 2 - 20,
        Math.max(layoutNode.height / 2 + 20, point.y - dragState.offsetY),
      )

      if (!dragState.moved && (Math.abs(nextX - dragState.originX) > 4 || Math.abs(nextY - dragState.originY) > 4)) {
        dragState.moved = true
      }

      setManualPositions((current) => ({
        ...current,
        [dragState.nodeId]: { x: nextX, y: nextY },
      }))
    }

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return
      dragStateRef.current = null
      setActiveDragNodeId(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [activeDragNodeId, graphHeight, graphWidth, layoutNodeMap])

  return (
    <div className="mt-4 space-y-4 rounded-[12px] border border-[var(--lineage-panel-border)] bg-[linear-gradient(180deg,var(--lineage-panel-bg-start),var(--lineage-panel-bg-end))] p-4 shadow-[var(--shadow-soft)]">
      <div className="rounded-[10px] border border-[var(--lineage-hint-border)] bg-[linear-gradient(180deg,var(--lineage-hint-bg-start),var(--lineage-hint-bg-end))] px-3 py-2 text-[0.75rem] text-[var(--lineage-hint-text)]">
        血缘关系视图：左栏为数据源，中栏为数据资源链路，右栏为数据服务；节点可拖动，下方节点分解标题可在新页面中查看详情。
      </div>
      {columnLineage.sourceNodes.length === 0 ? (
        <div className="rounded-[10px] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-[0.75rem] text-[var(--status-warning-text)]">
          当前血缘未追溯到数据源节点，说明该资源的 ODS / 数据源元数据还未补齐。
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['数据源', `${columnLineage.sourceNodes.length} 个节点`],
          ['数据资源', `${columnLineage.warehouseNodes.length} 个节点`],
          ['关系边', `${columnLineage.edges.length} 条`],
          ['数据服务', `${columnLineage.serviceNodes.length} 个节点`],
        ].map(([title, value]) => (
          <div
            key={title}
            className="rounded-[12px] border border-[var(--lineage-stat-border)] bg-[linear-gradient(180deg,var(--lineage-stat-bg-start),var(--lineage-stat-bg-end))] px-4 py-3 shadow-[var(--shadow-soft)]"
          >
            <div className="text-[0.75rem] text-[var(--lineage-stat-title)]">{title}</div>
            <div className="mt-1 text-[1.375rem] font-semibold text-[var(--lineage-stat-value)]">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${graphWidth} ${graphHeight}`}
          className="min-w-[1200px] rounded-[12px] border border-[var(--lineage-canvas-border)] bg-[radial-gradient(circle_at_18%_18%,var(--lineage-canvas-orb-a),transparent_40%),radial-gradient(circle_at_78%_25%,var(--lineage-canvas-orb-b),transparent_44%),linear-gradient(180deg,var(--lineage-canvas-bg-start),var(--lineage-canvas-bg-end))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          role="img"
          aria-label={`${item.name}血缘关系图`}
        >
          <defs>
            <pattern id={`${prefix}-grid`} width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--lineage-canvas-grid)" strokeWidth="1" />
            </pattern>
            <filter id={`${prefix}-glow`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0
                        0 1 0 0 0
                        0 0 1 0 0
                        0 0 0 0.55 0"
              />
            </filter>
            <linearGradient id={`${prefix}-flow`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-edge-flow-start)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-edge-flow-end)' }} />
            </linearGradient>
            <linearGradient id={`${prefix}-source`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-node-source-start)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-node-source-end)' }} />
            </linearGradient>
            <linearGradient id={`${prefix}-layer`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-node-layer-start)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-node-layer-end)' }} />
            </linearGradient>
            <linearGradient id={`${prefix}-resource`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-node-resource-start)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-node-resource-end)' }} />
            </linearGradient>
            <linearGradient id={`${prefix}-current`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-node-current-start)' }} />
              <stop offset="40%" style={{ stopColor: 'var(--lineage-node-current-mid)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-node-current-end)' }} />
            </linearGradient>
            <linearGradient id={`${prefix}-api`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-node-api-start)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-node-api-end)' }} />
            </linearGradient>
            <linearGradient id={`${prefix}-unknown`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-node-unknown-start)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-node-unknown-end)' }} />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={graphWidth} height={graphHeight} fill={`url(#${prefix}-grid)`} opacity="0.12" />

          {columnLineage.edges.map((edge, index) => {
            const fromNode = positionedNodeMap.get(edge.fromId)
            const toNode = positionedNodeMap.get(edge.toId)
            if (!fromNode || !toNode) return null

            const pathId = `${prefix}-edge-${index}`
            const isCurrentEdge = edge.fromId === item.id || edge.toId === item.id
            const path =
              fromNode.column === toNode.column
                ? `M ${fromNode.x} ${fromNode.y + fromNode.height / 2 - 6} C ${fromNode.x} ${fromNode.y + fromNode.height / 2 + 40} ${toNode.x} ${toNode.y - toNode.height / 2 - 40} ${toNode.x} ${toNode.y - toNode.height / 2 + 6}`
                : `M ${fromNode.x + fromNode.width / 2 - 4} ${fromNode.y} C ${fromNode.x + fromNode.width / 2 + 92} ${fromNode.y} ${toNode.x - toNode.width / 2 - 92} ${toNode.y} ${toNode.x - toNode.width / 2 + 4} ${toNode.y}`

            return (
              <g key={pathId}>
                <path d={path} fill="none" stroke="var(--lineage-edge-track)" strokeWidth={isCurrentEdge ? 6 : 5} strokeLinecap="round" />
                <path
                  id={pathId}
                  d={path}
                  fill="none"
                  stroke={`url(#${prefix}-flow)`}
                  strokeWidth={isCurrentEdge ? 3.2 : 2.6}
                  strokeLinecap="round"
                  strokeDasharray="10 8"
                  filter={`url(#${prefix}-glow)`}
                  opacity="0.98"
                >
                  <animate attributeName="stroke-dashoffset" from="0" to="-72" dur={`${3.4 + index * 0.22}s`} repeatCount="indefinite" />
                </path>
                <circle r={isCurrentEdge ? '4.2' : '3.6'} fill="var(--lineage-edge-dot)" filter={`url(#${prefix}-glow)`}>
                  <animateMotion dur={`${2.4 + index * 0.18}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                </circle>
              </g>
            )
          })}

          {displayNodes.map((node) => {
            const tone = getNodeTone(node)
            const isCurrent = node.id === item.id
            const isDragging = activeDragNodeId === node.id
            const label = getNodeLabel(node)
            const level = getNodeLevel(node, renderable, catalogItemMap)
            const displayName = getNodeDisplayName(node)
            const Icon = getNodeIcon(node)
            const gradientId = `${prefix}-${tone}`
            const left = node.x - node.width / 2
            const top = node.y - node.height / 2
            const contentLeft = left + 18
            const contentTop = top + 14
            const contentWidth = node.width - 36
            const contentHeight = node.height - 28
            const titleStyle = {
              marginTop: node.nodeType === 'warehouse_resource' ? '8px' : '6px',
              color: 'var(--lineage-node-title)',
              fontSize: isCurrent ? '16px' : '14px',
              fontWeight: 700,
              lineHeight: isCurrent ? '1.35' : '1.3',
              wordBreak: 'break-all' as const,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical' as const,
              WebkitLineClamp: node.nodeType === 'warehouse_resource' ? 2 : 1,
            }

            return (
              <g
                key={node.id}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
              >
                <rect
                  x={left}
                  y={top}
                  width={node.width}
                  height={node.height}
                  rx={isCurrent ? '22' : '16'}
                  fill={isCurrent ? `url(#${prefix}-current)` : `url(#${gradientId})`}
                  stroke={isCurrent ? 'var(--lineage-node-stroke-current)' : node.nodeType === 'warehouse_resource' ? 'var(--lineage-node-stroke-strong)' : 'var(--lineage-node-stroke)'}
                  strokeWidth={isCurrent ? '2' : node.nodeType === 'warehouse_resource' ? '1.5' : '1.2'}
                />
                {isCurrent ? (
                  <rect
                    x={left + 6}
                    y={top + 6}
                    width={node.width - 12}
                    height={node.height - 12}
                    rx="18"
                    fill="none"
                    stroke="var(--lineage-node-inner-stroke)"
                    strokeWidth="1"
                  />
                ) : null}
                <foreignObject x={contentLeft} y={contentTop} width={contentWidth} height={contentHeight}>
                  <div
                    style={{
                      display: 'flex',
                      height: '100%',
                      width: '100%',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: 'var(--lineage-node-meta)',
                        fontSize: isCurrent ? '12px' : '11px',
                        lineHeight: '1.2',
                        minHeight: '18px',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '18px',
                          height: '18px',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={16} strokeWidth={2} />
                      </span>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </span>
                    </div>
                    <div style={titleStyle}>{displayName}</div>
                    {level ? (
                      <div
                        style={{
                          marginTop: '8px',
                          color: 'var(--lineage-node-level)',
                          fontSize: '0.6875rem',
                          lineHeight: '1.2',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {level}
                      </div>
                    ) : null}
                  </div>
                </foreignObject>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[12px] border border-[var(--lineage-list-card-border)] bg-[linear-gradient(180deg,var(--lineage-list-card-bg-start),var(--lineage-list-card-bg-end))] px-4 py-4 shadow-[var(--shadow-soft)]">
          <div className="text-[0.875rem] font-semibold text-[var(--lineage-list-card-title)]">数据源</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {columnLineage.sourceNodes.length > 0 ? (
              columnLineage.sourceNodes.map(renderNodeChip)
            ) : (
              <span className="text-[0.8125rem] text-[var(--text-muted)]">未追溯到数据源节点</span>
            )}
          </div>
        </div>

        <div className="rounded-[12px] border border-[var(--lineage-list-card-border)] bg-[linear-gradient(180deg,var(--lineage-list-card-bg-start),var(--lineage-list-card-bg-end))] px-4 py-4 shadow-[var(--shadow-soft)]">
          <div className="text-[0.875rem] font-semibold text-[var(--lineage-list-card-title)]">数据服务</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {columnLineage.serviceNodes.length > 0 ? (
              columnLineage.serviceNodes.map(renderNodeChip)
            ) : (
              <span className="text-[0.8125rem] text-[var(--text-muted)]">当前链路暂无数据服务节点</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sortedCards.map((node) => {
          const Icon = getNodeIcon(node)
          const level = getNodeLevel(node, renderable, catalogItemMap)
          const displayName = getNodeDisplayName(node)
          return (
            <div
              key={`lineage-card-${node.id}`}
              className="rounded-[12px] border border-[var(--lineage-list-card-border)] bg-[linear-gradient(180deg,var(--lineage-list-card-bg-start),var(--lineage-list-card-bg-end))] px-4 py-3 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary-soft)_78%,white)] text-[var(--primary)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <button
                    type="button"
                    onClick={() => openLineageNodeDetail(node)}
                    title={`点击在新页面查看 ${displayName} 对应资源详情`}
                    className="truncate text-left text-[0.875rem] font-semibold text-[var(--lineage-list-card-title)] transition hover:text-[var(--primary)]"
                  >
                    {displayName}
                  </button>
                </div>
                <span className="rounded-full bg-[color-mix(in_srgb,var(--primary-soft)_78%,white)] px-2.5 py-0.5 text-[0.6875rem] text-[var(--primary)]">
                  {getNodeLabel(node)}
                </span>
              </div>
              {level ? <div className="mt-2 text-[0.8125rem] text-[var(--text-secondary)]">{level}</div> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
