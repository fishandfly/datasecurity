export type LineageDetailTargetNode = {
  id: string
  ownerId?: string | null
}

export function resolveLineageNodeResourceId(
  node: LineageDetailTargetNode,
  catalogItemIds: Iterable<string>,
  fallbackResourceId: string,
) {
  const knownIds = new Set(catalogItemIds)
  const nodeId = node.id.trim()

  if (nodeId && knownIds.has(nodeId)) {
    return nodeId
  }

  const ownerId = typeof node.ownerId === 'string' ? node.ownerId.trim() : ''
  if (ownerId && knownIds.has(ownerId)) {
    return ownerId
  }

  return fallbackResourceId
}
