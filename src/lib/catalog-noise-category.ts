import { createCategoryLookup, type CategoryLookup, type DomainCategoryRecord } from './catalog-category-tree'

const BUSINESS_ROOT_LABEL = '业务数据'
const OTHER_ROOT_LABEL = '其他'
const NOISE_CATEGORY_LABEL = '噪声'
const NOISE_CATEGORY_PATH = `${BUSINESS_ROOT_LABEL} / ${NOISE_CATEGORY_LABEL}`
const NOISE_KEYWORDS = ['噪声', '声环境', 'noise']

type NoiseCategoryPhysicalTables = {
  baseline: string
  businessTimeField: string
  tables: string[]
  sourceSystems: string[]
}

type NoiseCategoryCandidateItem = {
  categoryId: string
  category: string
  categoryAncestorIds: string[]
  industryCategory: string
  businessCategoryId: string
  businessCategory: string
  businessCategoryPath: string
  informationCategory: string
  informationCategoryPath: string
  name: string
  summary: string
  sourceTable: string
  remarks: string
  searchText: string
  physicalTables?: NoiseCategoryPhysicalTables
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? ''
}

function extractPathSegments(value: string | null | undefined) {
  return normalizeText(value)
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function resolveTopCategoryLabel(item: NoiseCategoryCandidateItem, categoryLookup: CategoryLookup) {
  const topCategoryId = item.categoryAncestorIds[0]
  const topCategory = topCategoryId ? categoryLookup.byId.get(topCategoryId)?.name ?? '' : ''
  if (topCategory) {
    return topCategory
  }

  return extractPathSegments(item.industryCategory)[0] ?? normalizeText(item.category)
}

function containsNoiseKeyword(value: string | null | undefined) {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) {
    return false
  }

  return NOISE_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()))
}

function isNoiseRelatedItem(item: NoiseCategoryCandidateItem, categoryLookup: CategoryLookup) {
  const topCategory = resolveTopCategoryLabel(item, categoryLookup)

  const signals = [
    item.name,
    item.summary,
    item.category,
    item.industryCategory,
    item.businessCategory,
    item.businessCategoryPath,
    item.informationCategory,
    item.informationCategoryPath,
    item.sourceTable,
    item.remarks,
    item.searchText,
    item.physicalTables?.baseline ?? '',
    ...(item.physicalTables?.tables ?? []),
  ]

  return topCategory === OTHER_ROOT_LABEL && signals.some((value) => containsNoiseKeyword(value))
}

function appendNoiseCategorySearchText(searchText: string) {
  if (searchText.includes(NOISE_CATEGORY_PATH)) {
    return searchText
  }

  return [searchText, BUSINESS_ROOT_LABEL, NOISE_CATEGORY_LABEL, NOISE_CATEGORY_PATH]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ')
}

export function realignNoiseResourcesToBusinessCategory<T extends NoiseCategoryCandidateItem>(
  categories: DomainCategoryRecord[],
  items: T[],
) {
  const categoryLookup = createCategoryLookup(categories)
  const businessRoot = categories.find((category) => category.parentId === null && category.name === BUSINESS_ROOT_LABEL)
  if (!businessRoot) {
    return {
      categories,
      items,
      movedCount: 0,
    }
  }

  const reusedNoiseCategory = categories.find(
    (category) => category.parentId === businessRoot.id && category.name === NOISE_CATEGORY_LABEL,
  )
  const noiseCategoryId = reusedNoiseCategory?.id ?? `${businessRoot.id}::__noise__`

  let movedCount = 0
  const nextItems = items.map((item) => {
    if (!isNoiseRelatedItem(item, categoryLookup)) {
      return item
    }

    movedCount += 1
    return {
      ...item,
      categoryId: noiseCategoryId,
      category: NOISE_CATEGORY_LABEL,
      categoryAncestorIds: [businessRoot.id, noiseCategoryId],
      industryCategory: NOISE_CATEGORY_PATH,
      businessCategoryId: noiseCategoryId,
      businessCategory: NOISE_CATEGORY_LABEL,
      businessCategoryPath: NOISE_CATEGORY_PATH,
      searchText: appendNoiseCategorySearchText(item.searchText),
    }
  })

  if (movedCount === 0 || reusedNoiseCategory) {
    return {
      categories,
      items: nextItems,
      movedCount,
    }
  }

  return {
    categories: [
      ...categories,
      {
        id: noiseCategoryId,
        name: NOISE_CATEGORY_LABEL,
        parentId: businessRoot.id,
      },
    ],
    items: nextItems,
    movedCount,
  }
}
