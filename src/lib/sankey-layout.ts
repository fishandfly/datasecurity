export type SankeyDetailColumn = {
  key: string
  label: string
  width?: number
}

export type SankeyDetailRule = {
  title: string
  collection: 'sources' | 'resources' | 'policies' | 'tasks' | 'decisionLogs' | 'ingestLogs' | 'subjects' | 'apis' | 'streamingRuns' | 'streamingWindows'
  columns: SankeyDetailColumn[]
  filter: (record: Record<string, unknown>, nodeId: string) => boolean
  transform?: (record: Record<string, unknown>, nodeId: string) => Record<string, unknown>
}

export type SankeyNodeSpec = {
  id: string
  label: string
  column: number
  color?: string
  detail?: SankeyDetailRule
  href?: string
}

export type SankeyLinkSpec = {
  from: string
  to: string
  value: number
  detail?: SankeyDetailRule
}

export type PositionedSankeyNode = SankeyNodeSpec & {
  x: number
  y: number
  width: number
  height: number
  value: number
}

export type PositionedSankeyLink = SankeyLinkSpec & {
  path: string
  strokeWidth: number
  color: string
}

const DEFAULT_NODE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#6366f1', '#14b8a6']
const MIN_NODE_HEIGHT = 14
const MAX_LINK_WIDTH = 8
const NODE_GAP = 12
const TOP_PADDING = 14

export function layoutSankey(
  nodes: SankeyNodeSpec[],
  links: SankeyLinkSpec[],
  width: number,
  height: number,
): { nodes: PositionedSankeyNode[]; links: PositionedSankeyLink[] } {
  const nodeValue = new Map<string, number>()
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  for (const link of links) {
    incoming.set(link.to, (incoming.get(link.to) ?? 0) + Math.max(0, link.value))
    outgoing.set(link.from, (outgoing.get(link.from) ?? 0) + Math.max(0, link.value))
  }
  for (const node of nodes) {
    nodeValue.set(node.id, Math.max(incoming.get(node.id) ?? 0, outgoing.get(node.id) ?? 0, 1))
  }

  const columnCount = Math.max(0, ...nodes.map((node) => node.column)) + 1
  const columnWidth = columnCount > 0 ? width / columnCount : width
  const nodeWidth = Math.min(150, Math.max(96, columnWidth * 0.6))
  const byColumn = new Map<number, SankeyNodeSpec[]>()
  for (const node of nodes) {
    const column = byColumn.get(node.column) ?? []
    column.push(node)
    byColumn.set(node.column, column)
  }

  const positionedNodes: PositionedSankeyNode[] = []
  for (const [column, columnNodes] of byColumn) {
    const total = columnNodes.reduce((sum, node) => sum + (nodeValue.get(node.id) ?? 1), 0)
    const availableHeight = Math.max(1, height - TOP_PADDING * 2 - NODE_GAP * Math.max(0, columnNodes.length - 1))
    let cursor = TOP_PADDING
    for (const node of columnNodes) {
      const value = nodeValue.get(node.id) ?? 1
      const nodeHeight = Math.max(MIN_NODE_HEIGHT, (value / total) * availableHeight)
      positionedNodes.push({
        ...node,
        x: column * columnWidth,
        y: cursor,
        width: nodeWidth,
        height: nodeHeight,
        value,
        color: node.color ?? DEFAULT_NODE_COLORS[column % DEFAULT_NODE_COLORS.length],
      })
      cursor += nodeHeight + NODE_GAP
    }
  }

  const positionedById = new Map(positionedNodes.map((node) => [node.id, node]))
  const maxLinkValue = Math.max(1, ...links.map((link) => Math.max(0, link.value)))
  const positionedLinks: PositionedSankeyLink[] = []
  for (const link of links) {
    const source = positionedById.get(link.from)
    const target = positionedById.get(link.to)
    if (!source || !target) continue
    const sourceX = source.x + source.width
    const sourceY = source.y + source.height / 2
    const targetX = target.x
    const targetY = target.y + target.height / 2
    const curve = Math.max(24, (targetX - sourceX) / 2)
    const path = `M ${sourceX} ${sourceY} C ${sourceX + curve} ${sourceY}, ${targetX - curve} ${targetY}, ${targetX} ${targetY}`
    positionedLinks.push({
      ...link,
      path,
      strokeWidth: Math.max(1.5, (Math.max(0, link.value) / maxLinkValue) * MAX_LINK_WIDTH),
      color: source.color ?? DEFAULT_NODE_COLORS[source.column % DEFAULT_NODE_COLORS.length],
    })
  }
  return { nodes: positionedNodes, links: positionedLinks }
}
