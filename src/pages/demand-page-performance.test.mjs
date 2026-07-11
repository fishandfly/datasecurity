import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const demandPageSource = readFileSync(resolve(process.cwd(), 'src/pages/demand-page-internal.tsx'), 'utf8')
const portalContextSource = readFileSync(resolve(process.cwd(), 'src/lib/portal-context.tsx'), 'utf8')
const supplyDemandSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-supply-demand-data.ts'), 'utf8')
const demandPageSupportSource = readFileSync(resolve(process.cwd(), 'src/lib/demand-page-support-data.ts'), 'utf8')

test('/demand 页面改为使用轻量支撑数据而不是复用全量目录上下文', () => {
  assert.match(demandPageSource, /useDemandPageSupportData\(/)
  assert.equal(demandPageSource.includes('const { data } = usePortalContext()'), false)
  assert.equal(demandPageSource.includes('const { catalogItems, categoryTree, editOptions } = data'), false)
})

test('PortalProvider 不再为 /demand 首屏预加载整套目录资源', () => {
  assert.match(portalContextSource, /const shouldLoadPortalCatalogData = \(appPathname === '\/security-governance' \|\| appPathname\.startsWith\('\/security-governance\/'\)\)/)
  assert.doesNotMatch(portalContextSource, /appPathname !== '\/demand'/)
})

test('供需台账数据层同时提供分页列表和轻量摘要能力', () => {
  assert.match(supplyDemandSource, /const supplyDemandPortalPromise: Record<SupplyDemandFetchMode, Promise<SupplyDemandInfo\[\]> \| null> = \{/)
  assert.match(supplyDemandSource, /export async function fetchSupplyDemandPortalData\(\s*options: \{ force\?: boolean; includeLinkedResources\?: boolean; includeRelatedApps\?: boolean \} = \{\},\s*\)/)
  assert.match(supplyDemandSource, /let supplyDemandPortalSummaryPromise: Promise<SupplyDemandInfo\[\]> \| null = null/)
  assert.match(supplyDemandSource, /const supplyDemandPortalPageCache = new Map<string, SupplyDemandPortalPageResult>\(\)/)
  assert.match(supplyDemandSource, /export async function fetchSupplyDemandPortalSummaryData\(\s*options: \{ force\?: boolean \} = \{\}\s*\)/)
  assert.match(supplyDemandSource, /export async function fetchSupplyDemandPortalPage\(\s*options: SupplyDemandPortalPageParams & \{ force\?: boolean \} = \{\},?\s*\)/)
  assert.match(supplyDemandSource, /loadAllPagesParallel/)
  assert.match(demandPageSource, /fetchSupplyDemandPortalSummaryData\(\)/)
  assert.match(demandPageSource, /fetchSupplyDemandPortalPage\(\{\s*page: requestedPage,\s*pageSize: PAGE_SIZE,\s*sort: serverSort,\s*filter: serverFilter,\s*includeLinkedResources: needsFullSupplyDemandData,\s*\}\)/)
})

test('/demand 分类树计数按当前需求台账重算，而不是复用目录总量', () => {
  assert.match(demandPageSource, /const categoryFacetItems = useMemo\(/)
  assert.match(demandPageSource, /ignoreDomainFilter: true/)
  assert.match(demandPageSource, /const categoryCountsById = useMemo\(/)
  assert.match(demandPageSource, /getDemandCategoryAncestorIds\(item, domainCategoryLookup\)/)
  assert.match(demandPageSource, /mapCategoryTreeCounts\(baseCategoryTree, categoryCountsById\)/)
})

test('/demand 列表改为服务端分页，关联资源列仍按需升级', () => {
  assert.match(demandPageSource, /const needsFullSupplyDemandData = visibleColumnKeys\.some/)
  assert.match(demandPageSource, /const \[pagedResult, setPagedResult\] = useState<SupplyDemandPortalPageResult>\(EMPTY_SUPPLY_DEMAND_PAGE_RESULT\)/)
  assert.match(demandPageSource, /const filteredItemCount = pagedResult\.totalCount/)
  assert.match(demandPageSource, /setPageRefreshKey\(\(current\) => current \+ 1\)/)
  assert.match(supplyDemandSource, /const SUPPLY_DEMAND_LIGHT_APPENDS = \[/)
  assert.match(supplyDemandSource, /const SUPPLY_DEMAND_FULL_APPENDS = \[\.\.\.SUPPLY_DEMAND_LIGHT_APPENDS, 'linked_data_resources'\]/)
})

test('/demand 资源关联选项延迟到弹窗打开时再加载', () => {
  assert.match(demandPageSource, /useDemandPageSupportData\(\s*true,\s*isCreateDialogOpen,\s*\)/)
  assert.match(demandPageSupportSource, /usePortalCatalogData\(enabled && includeResourceOptions, 'list'\)/)
})
