import { useEffect, useMemo, useState } from 'react'
import {
  buildCatalogCategoryTree,
  type CatalogCategoryTreeNode,
} from './catalog-category-tree'
import type { ResourceSearchItem } from './demand-form-helpers'
import { nocobaseClient, toErrorMessage } from './nocobase-client'
import {
  getAvailableCollectionNames,
  normalizeTreeNode,
  resolveCollectionName,
} from './nocobase-collections'
import { type SelectOption, usePortalCatalogData } from './nocobase-portal-data'
import { loadAllPagesParallel } from './paginated-resource-loader'

export type DemandPageResourceOption = ResourceSearchItem

export type DemandPageSupportData = {
  categoryTree: CatalogCategoryTreeNode[]
  resourceOptions: DemandPageResourceOption[]
  updateCycleOptions: SelectOption[]
}

type RawDictionaryItem = {
  id?: number | string | null
  typeCode?: string | null
  type_code?: string | null
  dictValueName?: string | null
  dict_value_name?: string | null
  dictSort?: number | string | null
  dict_sort?: number | string | null
}

type BaseDemandPageSupportData = Pick<DemandPageSupportData, 'categoryTree' | 'updateCycleOptions'>

const EMPTY_DEMAND_PAGE_SUPPORT_DATA: DemandPageSupportData = {
  categoryTree: [],
  resourceOptions: [],
  updateCycleOptions: [],
}

let demandPageBaseSupportCache: BaseDemandPageSupportData | null = null
let demandPageBaseSupportPromise: Promise<BaseDemandPageSupportData> | null = null

function buildDictionarySelectOptions(items: RawDictionaryItem[], typeCode: string): SelectOption[] {
  return items
    .filter((item) => (item.typeCode ?? item.type_code ?? '').trim() === typeCode)
    .map((item) => ({
      value: item.id == null ? '' : String(item.id).trim(),
      label: (item.dictValueName ?? item.dict_value_name ?? '').trim(),
      sort: Number(item.dictSort ?? item.dict_sort ?? 0),
    }))
    .filter((item) => item.value && item.label)
    .sort((left, right) => {
      if (left.sort !== right.sort) return left.sort - right.sort
      return left.label.localeCompare(right.label, 'zh-CN')
    })
    .map(({ value, label }) => ({ value, label }))
}

async function fetchDemandPageBaseSupportData() {
  if (demandPageBaseSupportCache) {
    return demandPageBaseSupportCache
  }

  if (demandPageBaseSupportPromise) {
    return demandPageBaseSupportPromise
  }

  demandPageBaseSupportPromise = (async () => {
    const availableCollections = await getAvailableCollectionNames()
    const categoryTreeCollection = resolveCollectionName(availableCollections, ['jcCategoryTreeNodes'])
    const dictionaryCollection = resolveCollectionName(availableCollections, ['jcDictionaryItems'])

    const [allTreeNodes, allDictItems] = await Promise.all([
      loadAllPagesParallel(async ({ page, pageSize }) => {
        const response = await nocobaseClient.resource(categoryTreeCollection).list({
          page,
          pageSize,
          sort: categoryTreeCollection === 'jcCategoryTreeNodes' ? 'nodeSort' : 'node_sort',
        })
        return response.data as { data: Record<string, unknown>[]; meta?: { totalPage?: number } }
      }, 200),
      loadAllPagesParallel(async ({ page, pageSize }) => {
        const response = await nocobaseClient.resource(dictionaryCollection).list({
          page,
          pageSize,
          sort: 'dictSort',
        })
        return response.data as { data: RawDictionaryItem[]; meta?: { totalPage?: number } }
      }, 1000),
    ])

    const domainCategories = allTreeNodes
      .map((node) => normalizeTreeNode(node))
      .filter((node): node is NonNullable<ReturnType<typeof normalizeTreeNode>> => Boolean(node))
      .filter((node) => node.typeCode === 'eco_domain_category')

    const result = {
      categoryTree: buildCatalogCategoryTree(domainCategories, []),
      updateCycleOptions: buildDictionarySelectOptions(allDictItems, 'update_cycle'),
    } satisfies BaseDemandPageSupportData

    demandPageBaseSupportCache = result
    return result
  })()
    .finally(() => {
      demandPageBaseSupportPromise = null
    })

  return demandPageBaseSupportPromise
}

export function useDemandPageSupportData(enabled: boolean, includeResourceOptions = false) {
  const [baseData, setBaseData] = useState<BaseDemandPageSupportData>(
    demandPageBaseSupportCache ?? {
      categoryTree: [],
      updateCycleOptions: [],
    },
  )
  const [baseError, setBaseError] = useState<string | null>(null)
  const [isBaseLoading, setIsBaseLoading] = useState(() => enabled && !demandPageBaseSupportCache)
  const portalData = usePortalCatalogData(enabled && includeResourceOptions, 'list')

  useEffect(() => {
    let cancelled = false

    if (!enabled) {
      setBaseData({
        categoryTree: [],
        updateCycleOptions: [],
      })
      setBaseError(null)
      setIsBaseLoading(false)
      return () => {
        cancelled = true
      }
    }

    if (demandPageBaseSupportCache) {
      setBaseData(demandPageBaseSupportCache)
      setBaseError(null)
      setIsBaseLoading(false)
      return () => {
        cancelled = true
      }
    }

    setIsBaseLoading(true)

    fetchDemandPageBaseSupportData()
      .then((payload) => {
        if (cancelled) return
        setBaseData(payload)
        setBaseError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setBaseError(toErrorMessage(error, '需求页支撑数据加载失败'))
      })
      .finally(() => {
        if (!cancelled) {
          setIsBaseLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  const data = useMemo<DemandPageSupportData>(() => {
    if (!enabled) {
      return EMPTY_DEMAND_PAGE_SUPPORT_DATA
    }

    return {
      categoryTree: baseData.categoryTree,
      resourceOptions: includeResourceOptions
        ? portalData.data.catalogItems.map((item) => ({
            id: item.id,
            name: item.name,
            code: item.code,
            department: item.department,
            category: item.category,
          }))
        : [],
      updateCycleOptions: baseData.updateCycleOptions,
    }
  }, [baseData.categoryTree, baseData.updateCycleOptions, enabled, includeResourceOptions, portalData.data.catalogItems])

  return useMemo(
    () => ({
      data,
      isLoading: isBaseLoading || (includeResourceOptions && portalData.isLoading),
      error: baseError ?? (includeResourceOptions ? portalData.error : null),
      refresh: async () => {
        demandPageBaseSupportCache = null
        await fetchDemandPageBaseSupportData()
        if (includeResourceOptions) {
          await portalData.refresh()
        }
      },
    }),
    [baseError, data, includeResourceOptions, isBaseLoading, portalData],
  )
}
