import type { DomainCategoryRecord } from './catalog-category-tree'

const BASE_ROOT_LABEL = '基础数据'
const BUSINESS_ROOT_LABEL = '业务数据'
const MANAGE_ROOT_LABEL = '管理数据'
const OTHER_ROOT_LABEL = '其他'
const MAP_DATA_CATEGORY_LABEL = '地图数据'
const MAP_DATA_CATEGORY_PATH = MAP_DATA_CATEGORY_LABEL

type MapCategoryCandidateItem = {
  categoryId: string
  category: string
  categoryAncestorIds: string[]
  industryCategory: string
  businessCategoryId: string
  businessCategory: string
  businessCategoryPath: string
  searchText: string
  mapPreview?: unknown
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? ''
}

function appendMapCategorySearchText(searchText: string) {
  if (searchText.includes(MAP_DATA_CATEGORY_PATH)) {
    return searchText
  }

  return [searchText, MAP_DATA_CATEGORY_LABEL, MAP_DATA_CATEGORY_PATH]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ')
}

function removeOtherPrefix(path: string) {
  const normalized = normalizeText(path)
  if (!normalized) {
    return path
  }

  if (normalized === OTHER_ROOT_LABEL) {
    return ''
  }

  if (normalized.startsWith(`${OTHER_ROOT_LABEL} / `)) {
    return normalized.slice(`${OTHER_ROOT_LABEL} / `.length)
  }

  return path
}

function reorderCategories(categories: DomainCategoryRecord[]) {
  const byParent = new Map<string | null, DomainCategoryRecord[]>()

  categories.forEach((category) => {
    const bucket = byParent.get(category.parentId) ?? []
    bucket.push(category)
    byParent.set(category.parentId, bucket)
  })

  const rootPriority = new Map<string, number>([
    [BASE_ROOT_LABEL, 1],
    [BUSINESS_ROOT_LABEL, 2],
    [MANAGE_ROOT_LABEL, 3],
    [MAP_DATA_CATEGORY_LABEL, 4],
  ])

  const ordered: DomainCategoryRecord[] = []
  const visit = (category: DomainCategoryRecord) => {
    ordered.push(category)
    ;(byParent.get(category.id) ?? []).forEach((child) => {
      visit(child)
    })
  }

  const roots = [...(byParent.get(null) ?? [])].sort((left, right) => {
    const leftPriority = rootPriority.get(left.name) ?? Number.MAX_SAFE_INTEGER
    const rightPriority = rootPriority.get(right.name) ?? Number.MAX_SAFE_INTEGER
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }
    return 0
  })

  roots.forEach((root) => {
    visit(root)
  })

  return ordered
}

export function realignMapResourcesToTopLevelMapCategory<T extends MapCategoryCandidateItem>(
  categories: DomainCategoryRecord[],
  items: T[],
) {
  const otherRoot = categories.find((category) => category.parentId === null && category.name === OTHER_ROOT_LABEL)
  const baseRoot = categories.find((category) => category.parentId === null && category.name === BASE_ROOT_LABEL)
  if (!baseRoot && !otherRoot) {
    return {
      categories,
      items,
      movedCount: 0,
    }
  }

  const reusedMapCategory = categories.find((category) => category.name === MAP_DATA_CATEGORY_LABEL)
  const mapCategoryId = reusedMapCategory?.id ?? '__top_level_map_data__'

  let movedCount = 0
  const nextItems = items.map((item) => {
    if (Boolean(item.mapPreview)) {
      movedCount += 1
      return {
        ...item,
        categoryId: mapCategoryId,
        category: MAP_DATA_CATEGORY_LABEL,
        categoryAncestorIds: [mapCategoryId],
        industryCategory: MAP_DATA_CATEGORY_PATH,
        businessCategoryId: mapCategoryId,
        businessCategory: MAP_DATA_CATEGORY_LABEL,
        businessCategoryPath: MAP_DATA_CATEGORY_PATH,
        searchText: appendMapCategorySearchText(item.searchText),
      }
    }

    if (otherRoot && item.categoryAncestorIds.includes(otherRoot.id)) {
      return {
        ...item,
        categoryAncestorIds: item.categoryAncestorIds.filter((ancestorId) => ancestorId !== otherRoot.id),
        industryCategory: removeOtherPrefix(item.industryCategory),
      }
    }

    return item
  })

  const adjustedCategories = categories
    .filter((category) => category.id !== otherRoot?.id)
    .map((category) => {
      if (category.id === mapCategoryId) {
        return {
          ...category,
          parentId: null,
          name: MAP_DATA_CATEGORY_LABEL,
        }
      }

      if (otherRoot && category.parentId === otherRoot.id) {
        return {
          ...category,
          parentId: null,
        }
      }

      return category
    })

  if (!reusedMapCategory) {
    adjustedCategories.push({
      id: mapCategoryId,
      name: MAP_DATA_CATEGORY_LABEL,
      parentId: null,
    })
  }

  return {
    categories: reorderCategories(adjustedCategories),
    items: nextItems,
    movedCount,
  }
}
