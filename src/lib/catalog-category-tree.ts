export type DomainCategoryRecord = {
  id: string
  name: string
  parentId: string | null
}

export type CatalogCategoryItem = {
  categoryId: string
  categoryAncestorIds: string[]
}

export type CategoryLookupNode = DomainCategoryRecord & {
  pathLabel: string
  ancestorIds: string[]
}

export type CategoryLookup = {
  byId: Map<string, CategoryLookupNode>
}

export type TopCategoryLookupNode = {
  id: string
  label: string
  order: number
}

export type TopCategoryLookup = {
  byId: Map<string, TopCategoryLookupNode>
}

export type CatalogCategoryTreeNode = {
  id: string
  label: string
  pathLabel: string
  count: number
  depth: number
  children: CatalogCategoryTreeNode[]
}

export function createCategoryLookup(categories: DomainCategoryRecord[]): CategoryLookup {
  const rawById = new Map(categories.map((category) => [category.id, category]))
  const cache = new Map<string, CategoryLookupNode>()

  const buildNode = (id: string): CategoryLookupNode | undefined => {
    if (cache.has(id)) {
      return cache.get(id)
    }

    const category = rawById.get(id)
    if (!category) {
      return undefined
    }

    const parent = category.parentId ? buildNode(category.parentId) : undefined
    const ancestorIds = [...(parent?.ancestorIds ?? []), category.id]
    const pathLabel = [...(parent ? [parent.pathLabel] : []), category.name].filter(Boolean).join(' / ')

    const node: CategoryLookupNode = {
      ...category,
      pathLabel,
      ancestorIds,
    }
    cache.set(id, node)
    return node
  }

  categories.forEach((category) => {
    buildNode(category.id)
  })

  return {
    byId: cache,
  }
}

export function createTopCategoryLookup(tree: CatalogCategoryTreeNode[]): TopCategoryLookup {
  const byId = new Map<string, TopCategoryLookupNode>()

  const visit = (node: CatalogCategoryTreeNode, topNode: TopCategoryLookupNode) => {
    byId.set(node.id, topNode)
    node.children.forEach((child) => {
      visit(child, topNode)
    })
  }

  tree.forEach((node, index) => {
    const topNode: TopCategoryLookupNode = {
      id: node.id,
      label: node.label,
      order: index + 1,
    }
    visit(node, topNode)
  })

  return { byId }
}

export function buildCatalogCategoryTree(
  categories: DomainCategoryRecord[],
  items: CatalogCategoryItem[],
): CatalogCategoryTreeNode[] {
  const lookup = createCategoryLookup(categories)
  const childIdsByParent = new Map<string | null, string[]>()
  const counts = new Map<string, number>()

  categories.forEach((category) => {
    const key = category.parentId
    const bucket = childIdsByParent.get(key) ?? []
    bucket.push(category.id)
    childIdsByParent.set(key, bucket)
  })

  items.forEach((item) => {
    item.categoryAncestorIds.forEach((id) => {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    })
  })

  const buildTreeNode = (id: string, depth: number): CatalogCategoryTreeNode => {
    const node = lookup.byId.get(id)
    const count = counts.get(id) ?? 0
    const children = (childIdsByParent.get(id) ?? []).map((childId) => buildTreeNode(childId, depth + 1))

    return {
      id: node?.id ?? id,
      label: node?.name ?? id,
      pathLabel: node?.pathLabel ?? id,
      count,
      depth,
      children,
    }
  }

  return (childIdsByParent.get(null) ?? []).map((id) => buildTreeNode(id, 0))
}

export function pruneEmptyCategoryTreeNodes(
  tree: CatalogCategoryTreeNode[],
  options?: { keepNodeIds?: string[] },
): CatalogCategoryTreeNode[] {
  const keepNodeIds = new Set(
    (options?.keepNodeIds ?? [])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean),
  )

  return tree.flatMap((node) => {
    const children = pruneEmptyCategoryTreeNodes(node.children, options)
    const shouldKeep = keepNodeIds.has(node.id) || node.count > 0 || children.length > 0
    if (!shouldKeep) {
      return []
    }

    return [{
      ...node,
      children,
    }]
  })
}

export function matchesCategoryTreeSelection(item: CatalogCategoryItem, activeCategoryNodeId: string) {
  if (!activeCategoryNodeId) {
    return true
  }

  return item.categoryAncestorIds.includes(activeCategoryNodeId)
}

export function createInitialExpandedCategoryIds(tree: CatalogCategoryTreeNode[], activeNodeId = '') {
  if (!activeNodeId) {
    return []
  }

  const expanded: string[] = []
  const seen = new Set<string>()

  const addFront = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id)
      expanded.unshift(id)
    }
  }

  const visit = (node: CatalogCategoryTreeNode): boolean => {
    let containsActive = node.id === activeNodeId

    node.children.forEach((child) => {
      if (visit(child)) {
        containsActive = true
      }
    })

    if (node.children.length > 0 && containsActive) {
      addFront(node.id)
    }

    return containsActive
  }

  tree.forEach((node) => {
    visit(node)
  })

  return expanded
}

export function toggleExpandedCategoryId(expandedIds: string[], nodeId: string) {
  const next = new Set(expandedIds)
  if (next.has(nodeId)) {
    next.delete(nodeId)
  } else {
    next.add(nodeId)
  }
  return Array.from(next)
}
