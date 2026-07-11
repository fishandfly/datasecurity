import { useEffect, useState } from 'react'
import { nocobaseClient, toErrorMessage } from './nocobase-client'
import {
  buildCatalogCategoryTree,
  createCategoryLookup,
  type CatalogCategoryTreeNode,
} from './catalog-category-tree'
import {
  buildTreeSubsetBySeedIds,
  getAvailableCollectionNames,
  normalizeTreeNode,
  resolveCollectionName,
} from './nocobase-collections'
import { loadAllPages } from './paginated-resource-loader'
import { fetchSupplyDemandPortalData, type SupplyDemandInfo } from './nocobase-supply-demand-data'

// 这里的类型定义要与 v2.0 的模型严格匹配
export type DemandCatalogItem = {
  id: string
  name: string
  sceneName: string
  categoryId: string
  category: string
  categoryAncestorIds: string[]
  refSource: string
  updateCycle: string
  description: string
  mappedResources: string[]
  searchText: string
}

export type DemandCatalogPortalData = {
  demandItems: DemandCatalogItem[]
  categoryTree: CatalogCategoryTreeNode[]
  categoryOptions: Array<[string, number]>
  sourceOptions: Array<[string, number]>
  cycleOptions: Array<[string, number]>
  sceneOptions: Array<[string, number]>
}

const DEMAND_APPENDS = ['domain_category', 'ref_source', 'update_cycle', 'mapped_resources'] as const
const DEMAND_COLLECTION_CANDIDATES = ['eco_data_demands'] as const
const SUPPLY_DEMAND_COLLECTION_CANDIDATES = ['eco_supply_demand_infos'] as const
const DICTIONARY_ITEM_COLLECTION_CANDIDATES = ['jcDictionaryItems'] as const
const DEMAND_TICKET_COLLECTION_CANDIDATES = ['ecoDemandTickets', 'eco_demand_tickets'] as const

function normalizeId(value: unknown) {
  if (value === null || value === undefined) return ''
  const normalized = String(value).trim()
  return normalized
}

function normalizeText(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

function normalizeString(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveExistingCollection(
  availableCollections: Set<string> | null,
  candidates: readonly [string, ...string[]],
  allowGuess = true,
) {
  if (!availableCollections) {
    return allowGuess ? candidates[0] : null
  }
  for (const candidate of candidates) {
    if (availableCollections.has(candidate)) {
      return candidate
    }
  }
  return null
}

function mapCatalogDemand(demand: any, categoryLookup: ReturnType<typeof createCategoryLookup>) {
  const categoryId = normalizeId(demand.domain_category_id ?? demand.domainCategoryId ?? demand.domain_category?.id)
  const categoryMeta = categoryLookup.byId.get(categoryId)
  const categoryFromRelation =
    demand.domain_category?.name ??
    demand.domain_category?.nodeName ??
    demand.domain_category?.node_name
  const refSourceName =
    demand.ref_source?.name ??
    demand.ref_source?.dictValueName ??
    demand.ref_source?.dict_value_name
  const updateCycleName =
    demand.update_cycle?.name ??
    demand.update_cycle?.dictValueName ??
    demand.update_cycle?.dict_value_name ??
    demand.update_cycle

  const item = {
    id: normalizeId(demand.id),
    name: normalizeText(demand.demand_name, '未命名需求'),
    sceneName: normalizeText(demand.scene_name, '通用场景'),
    categoryId,
    category: normalizeText(categoryFromRelation ?? categoryMeta?.name, '未标注'),
    categoryAncestorIds: categoryMeta?.ancestorIds ?? (categoryId ? [categoryId] : []),
    refSource: normalizeText(refSourceName, '未标注'),
    updateCycle: normalizeText(updateCycleName, '不定期'),
    description: normalizeText(demand.demand_desc, '暂无描述'),
    mappedResources: (demand.mapped_resources ?? [])
      .map((resource: any) => resource.resource_name ?? resource.resourceName ?? resource.name)
      .filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0),
  }

  return {
    ...item,
    searchText: [
      item.name,
      item.sceneName,
      item.category,
      item.refSource,
      item.updateCycle,
      item.description,
      ...item.mappedResources,
    ]
      .join(' ')
      .toLowerCase(),
  } satisfies DemandCatalogItem
}

export function resolvePortalDemandCollectionName(availableCollections: Set<string> | null) {
  return resolveExistingCollection(availableCollections, DEMAND_COLLECTION_CANDIDATES, false)
    ?? resolveExistingCollection(availableCollections, SUPPLY_DEMAND_COLLECTION_CANDIDATES, availableCollections == null)
}

export function mapSupplyDemandInfoToDemandCatalogItem(
  item: Pick<
    SupplyDemandInfo,
    | 'id'
    | 'sceneName'
    | 'requiredDataResourceName'
    | 'demandDescription'
    | 'domainCategoryId'
    | 'domainCategoryName'
    | 'listSourceName'
    | 'dataSyncFrequencyName'
    | 'dataFrequencyDemandName'
    | 'linkedResourceNames'
  >,
  categoryLookup: ReturnType<typeof createCategoryLookup>,
) {
  const categoryId = normalizeId(item.domainCategoryId)
  const categoryMeta = categoryLookup.byId.get(categoryId)
  const name = normalizeText(item.requiredDataResourceName, normalizeText(item.sceneName, '未命名需求'))
  const sceneName = normalizeText(item.sceneName, '通用场景')

  return {
    id: normalizeId(item.id),
    name,
    sceneName,
    categoryId,
    category: normalizeText(item.domainCategoryName || categoryMeta?.name, '未标注'),
    categoryAncestorIds: categoryMeta?.ancestorIds ?? (categoryId ? [categoryId] : []),
    refSource: normalizeText(item.listSourceName, '未标注'),
    updateCycle: normalizeText(item.dataSyncFrequencyName || item.dataFrequencyDemandName, '不定期'),
    description: normalizeText(item.demandDescription, '暂无描述'),
    mappedResources: item.linkedResourceNames
      .map((resourceName) => normalizeString(resourceName))
      .filter(Boolean),
    searchText: [
      name,
      sceneName,
      normalizeText(item.domainCategoryName || categoryMeta?.name, '未标注'),
      normalizeText(item.listSourceName, '未标注'),
      normalizeText(item.dataSyncFrequencyName || item.dataFrequencyDemandName, '不定期'),
      normalizeText(item.demandDescription, '暂无描述'),
      ...item.linkedResourceNames.map((resourceName) => normalizeString(resourceName)).filter(Boolean),
    ].join(' ').toLowerCase(),
  } satisfies DemandCatalogItem
}

async function fetchPortalDemandCatalogDataInternal(): Promise<DemandCatalogPortalData> {
  const availableCollections = await getAvailableCollectionNames()
  const categoryTreeCollection = resolveCollectionName(availableCollections, ['jcCategoryTreeNodes'])
  const demandCollection = resolvePortalDemandCollectionName(availableCollections)

  const allTreeNodes = await loadAllPages(async ({ page, pageSize }) => {
    const response = await nocobaseClient.resource(categoryTreeCollection).list({
      page,
      pageSize,
      sort: categoryTreeCollection === 'jcCategoryTreeNodes' ? 'nodeSort' : 'node_sort',
    })
    return response.data as any
  }, 200)

  const normalizedTreeNodes = allTreeNodes
    .map((node: any) => normalizeTreeNode(node as Record<string, unknown>))
    .filter((node): node is NonNullable<ReturnType<typeof normalizeTreeNode>> => Boolean(node))

  let demandItems: DemandCatalogItem[] = []

  if (demandCollection === 'eco_supply_demand_infos') {
    const supplyDemandItems = await fetchSupplyDemandPortalData()
    const demandCategoryIds = supplyDemandItems
      .map((item) => normalizeId(item.domainCategoryId))
      .filter(Boolean)
    const domainCategories = buildTreeSubsetBySeedIds(normalizedTreeNodes, demandCategoryIds)
    const lookup = createCategoryLookup(domainCategories)

    demandItems = supplyDemandItems.map((item) => mapSupplyDemandInfoToDemandCatalogItem(item, lookup))

    return {
      demandItems,
      categoryTree: buildCatalogCategoryTree(
        domainCategories,
        demandItems.map((item) => ({ categoryId: item.categoryId, categoryAncestorIds: item.categoryAncestorIds })),
      ),
      categoryOptions: buildOptions(demandItems, (item) => item.category),
      sourceOptions: buildOptions(demandItems, (item) => item.refSource),
      cycleOptions: buildOptions(demandItems, (item) => item.updateCycle),
      sceneOptions: buildOptions(demandItems, (item) => item.sceneName),
    } satisfies DemandCatalogPortalData
  }

  if (!demandCollection) {
    throw new Error('当前环境未启用需求清单集合')
  }

  const allDemands = await loadAllPages(async ({ page, pageSize }) => {
    const response = await nocobaseClient.resource(demandCollection).list({
      page,
      pageSize,
      sort: '-id',
      appends: [...DEMAND_APPENDS],
    })
    return response.data as any
  }, 200)

  const demandCategoryIds = allDemands
    .map((demand: any) => normalizeId(demand.domain_category_id ?? demand.domainCategoryId ?? demand.domain_category?.id))
    .filter(Boolean)
  const domainCategories = buildTreeSubsetBySeedIds(normalizedTreeNodes, demandCategoryIds)
  const lookup = createCategoryLookup(domainCategories)
  demandItems = allDemands.map((demand: any) => mapCatalogDemand(demand, lookup))

  return {
    demandItems,
    categoryTree: buildCatalogCategoryTree(
      domainCategories,
      demandItems.map((item) => ({ categoryId: item.categoryId, categoryAncestorIds: item.categoryAncestorIds })),
    ),
    categoryOptions: buildOptions(demandItems, (item) => item.category),
    sourceOptions: buildOptions(demandItems, (item) => item.refSource),
    cycleOptions: buildOptions(demandItems, (item) => item.updateCycle),
    sceneOptions: buildOptions(demandItems, (item) => item.sceneName),
  } satisfies DemandCatalogPortalData
}

function buildOptions(items: DemandCatalogItem[], selector: (item: DemandCatalogItem) => string) {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    const key = selector(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  const sorted = Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1]
    return left[0].localeCompare(right[0], 'zh-CN')
  })
  return [['全部', items.length] as [string, number], ...sorted]
}

let demandCatalogCache: DemandCatalogPortalData | null = null

export function usePortalDemandCatalogData(enabled: boolean) {
  const [data, setData] = useState<DemandCatalogPortalData>(
    demandCatalogCache ?? {
      demandItems: [],
      categoryTree: [],
      categoryOptions: [['全部', 0]],
      sourceOptions: [['全部', 0]],
      cycleOptions: [['全部', 0]],
      sceneOptions: [['全部', 0]],
    },
  )
  const [isLoading, setIsLoading] = useState(() => enabled && !demandCatalogCache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || demandCatalogCache) return

    let cancelled = false
    setIsLoading(true)

    const fetchData = async () => {
      try {
        const result = await fetchPortalDemandCatalogDataInternal()
        if (cancelled) return

        demandCatalogCache = result
        setData(result)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(toErrorMessage(err, '无法从后台获取需求清单数据'))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void fetchData()
    return () => { cancelled = true }
  }, [enabled])

  return { data, isLoading, error }
}

export type DemandOption = {
  id: number
  name: string
  code?: string
}

export type DemandTicket = {
  id: number
  ticketNo: string
  title: string
  description: string
  useCase: string
  expectedDataContent: string
  processingNotes?: string
  acceptanceNotes?: string
  resolutionNotes?: string
  remark?: string
  statusId: number
  demandTypeId: number
  priorityId: number
  resourceId: number | null
}

export type CreateDemandTicketParams = Omit<DemandTicket, 'id' | 'ticketNo'> & {
  expectedUpdateCycle: string
  expectedTimeRange: string
  expectedRegionRange: string
  requesterName: string
  requesterPhone: string
  requesterOrgName: string
}

function mapDemandOption(item: any, index: number): DemandOption {
  const id = normalizeNumber(item.id) ?? index + 1
  const name = normalizeText(item.name ?? item.dictValueName ?? item.dict_value_name, '未知')
  const code = normalizeString(item.code ?? item.dictValue ?? item.dict_value)
  return code ? { id, name, code } : { id, name }
}

function mapDemandTicket(item: any): DemandTicket {
  const id = normalizeNumber(item.id) ?? 0
  const ticketNo = normalizeString(item.ticket_no ?? item.ticketNo) || `REQ-${id || 0}`
  return {
    id,
    ticketNo,
    title: normalizeText(item.title, '无标题申请'),
    description: normalizeText(item.description, ''),
    useCase: normalizeText(item.use_case ?? item.useCase, ''),
    expectedDataContent: normalizeText(item.expected_data_content ?? item.expectedDataContent, ''),
    processingNotes: normalizeString(item.processing_notes ?? item.processingNotes) || undefined,
    acceptanceNotes: normalizeString(item.acceptance_notes ?? item.acceptanceNotes) || undefined,
    resolutionNotes: normalizeString(item.resolution_notes ?? item.resolutionNotes) || undefined,
    remark: normalizeString(item.remark) || undefined,
    statusId: normalizeNumber(item.status_id ?? item.statusId ?? item.status?.id) ?? 0,
    demandTypeId: normalizeNumber(item.demand_type_id ?? item.demandTypeId ?? item.demand_type?.id) ?? 0,
    priorityId: normalizeNumber(item.priority_id ?? item.priorityId ?? item.priority?.id) ?? 0,
    resourceId: normalizeNumber(item.resource_id ?? item.resourceId ?? item.resource?.id),
  }
}

function pickDictionaryOptions(items: any[], typeCode: string) {
  return items
    .filter((item) => normalizeString(item.typeCode ?? item.type_code) === typeCode)
    .map((item, index) => mapDemandOption(item, index))
}

export async function fetchDemandPortalData() {
  const availableCollections = await getAvailableCollectionNames()
  const dictionaryCollection = resolveExistingCollection(availableCollections, DICTIONARY_ITEM_COLLECTION_CANDIDATES)
  const ticketCollection = resolveExistingCollection(availableCollections, DEMAND_TICKET_COLLECTION_CANDIDATES, false)

  const safeFetchArray = async (resource: string | null, params: Record<string, unknown>) => {
    if (!resource) {
      return []
    }
    try {
      const res = await nocobaseClient.resource(resource).list(params)
      // 后台 list 接口返回结构通常是 { data: [...], meta: {} }
      const payload = res?.data
      if (payload && Array.isArray(payload.data)) {
        return payload.data
      }
      if (Array.isArray(payload)) {
        return payload
      }
      return []
    } catch (e) {
      console.warn(`Backend collection ${resource} not found or error.`, e)
      return []
    }
  }

  const [dictionaryItems, tickets] = await Promise.all([
    safeFetchArray(
      dictionaryCollection,
      {
        sort: dictionaryCollection === 'jcDictionaryItems' ? 'dictSort' : 'dict_sort',
        pageSize: 500,
      },
    ),
    safeFetchArray(ticketCollection, { sort: '-id', pageSize: 50 }),
  ])

  const demandTypes = pickDictionaryOptions(dictionaryItems, 'demand_type')
  const priorities = pickDictionaryOptions(dictionaryItems, 'demand_priority')
  const statuses = pickDictionaryOptions(dictionaryItems, 'demand_ticket_status')

  return {
    demandTypes,
    priorities,
    statuses,
    tickets: (tickets || []).map((item: any) => mapDemandTicket(item)),
  }
}

export async function fetchDemandTicketCount() {
  const availableCollections = await getAvailableCollectionNames()
  const ticketCollection = resolveExistingCollection(availableCollections, DEMAND_TICKET_COLLECTION_CANDIDATES, false)
  if (!ticketCollection) {
    return 0
  }
  try {
    const response = await nocobaseClient.resource(ticketCollection).list({ pageSize: 1 })
    const totalCount = (response as any)?.data?.meta?.count
    return typeof totalCount === 'number' ? totalCount : 0
  } catch {
    return 0
  }
}

export async function createDemandTicket(params: CreateDemandTicketParams) {
  const availableCollections = await getAvailableCollectionNames()
  const ticketCollection = resolveExistingCollection(availableCollections, DEMAND_TICKET_COLLECTION_CANDIDATES)
  if (!ticketCollection) {
    throw new Error('当前环境未启用需求工单集合，无法提交申请')
  }
  try {
    await nocobaseClient.resource(ticketCollection).create({
      values: {
        title: params.title,
        description: params.description,
        use_case: params.useCase,
        expected_data_content: params.expectedDataContent,
        expected_update_cycle: params.expectedUpdateCycle,
        expected_time_range: params.expectedTimeRange,
        expected_region_range: params.expectedRegionRange,
        requester_name: params.requesterName,
        requester_phone: params.requesterPhone,
        requester_org_name: params.requesterOrgName,
        demand_type_id: params.demandTypeId,
        priority_id: params.priorityId,
        status_id: params.statusId,
        resource_id: params.resourceId,
      },
    })
  } catch (error) {
    throw new Error(toErrorMessage(error, '提交需求申请失败'))
  }
}
