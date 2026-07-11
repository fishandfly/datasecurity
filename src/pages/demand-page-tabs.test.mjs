import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const demandPageSource = readFileSync(resolve(process.cwd(), 'src/pages/demand-page.tsx'), 'utf8')
const demandInternalSource = readFileSync(resolve(process.cwd(), 'src/pages/demand-page-internal.tsx'), 'utf8')
const navigationSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-navigation.ts'), 'utf8')
const externalTabSource = readFileSync(resolve(process.cwd(), 'src/components/demand-external-tab-view.tsx'), 'utf8')
const supplyDemandDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-supply-demand-data.ts'), 'utf8')

test('/demand 页面继续由 DemandPageInternal 统一承载', () => {
  assert.match(demandPageSource, /return <DemandPageInternal \/>/)
  assert.doesNotMatch(demandPageSource, /demandOnly/)
})

test('/demand 页面提供场景需求、外部需求、场景应用三个 tab，并把场景应用放到外部需求后面', () => {
  assert.match(demandInternalSource, /import \{ PortalApplicationCatalogSection \} from '\.\.\/components\/portal-application-catalog-section'/)
  assert.match(demandInternalSource, /type DemandViewTabId = 'demand' \| 'external' \| 'application'/)
  assert.match(demandInternalSource, /const \{ navigations, demandTabs \} = usePortalNavigations\(true, ALL_PRODUCT_MODULE_IDS\)/)
  assert.match(demandInternalSource, /const hasDemandNavigation = navigations\.some\(\(item\) => item\.target === '\/demand'\)/)
  assert.match(demandInternalSource, /const resolvedDemandTabs = demandTabs\.length > 0 \|\| hasDemandNavigation \? demandTabs : getDefaultDemandTabs\(\)/)
  assert.match(navigationSource, /const DEFAULT_DEMAND_TABS:/)
  assert.match(navigationSource, /id: 'demand', label: '场景需求'/)
  assert.match(navigationSource, /id: 'external', label: '外部需求'/)
  assert.match(navigationSource, /id: 'application', label: '场景应用'/)
  assert.match(demandInternalSource, /if \(normalizedValue === 'application'\) \{\s+return 'application'/s)
  assert.match(demandInternalSource, /activeDemandTab === 'application' \? <PortalApplicationCatalogSection \/> : null/)
})

test('场景需求表格继续走供需对接分页接口，并在服务端排除外部数据场景', () => {
  assert.match(demandInternalSource, /fetchSupplyDemandPortalPage\(\{/)
  assert.match(demandInternalSource, /scene_name:\s*\{\s*\$ne:\s*'外部数据'\s*\}/)
  assert.match(demandInternalSource, /summaryItems\.filter\(\(item\) => isInternalSupplyDemandItem\(item\)\)/)
})

test('外部需求 tab 使用左侧部门检索和右侧表格样式，并支持业务分类与关键词筛选', () => {
  assert.match(demandInternalSource, /<DemandExternalTabView/)
  assert.match(demandInternalSource, /items=\{externalSummaryItems\}/)
  assert.match(externalTabSource, /const PAGE_SIZE = 10/)
  assert.match(externalTabSource, /xl:grid-cols-\[260px_minmax\(0,1fr\)\]/)
  assert.match(externalTabSource, /部门检索/)
  assert.match(externalTabSource, /placeholder="搜索部门名称"/)
  assert.match(externalTabSource, /placeholder="搜索资源名称、业务分类、共享方式"/)
  assert.match(externalTabSource, /<span className="mb-2 block text-\[0\.8125rem\] text-\[var\(--text-main\)\]">业务分类<\/span>/)
  assert.match(externalTabSource, /buildDepartmentOptions\(entries\.map\(\(entry\) => entry\.sourceName\)\)/)
  assert.match(externalTabSource, /filteredDepartmentOptions/)
  assert.match(externalTabSource, /<table className="w-full min-w-\[1120px\] table-auto/)
  assert.match(externalTabSource, /<th className=\{TABLE_HEAD_CELL_CLASS\}>来源单位<\/th>/)
  assert.match(externalTabSource, /<th className=\{TABLE_HEAD_CELL_CLASS\}>业务分类<\/th>/)
  assert.match(externalTabSource, /查看详情/)
})

test('供需对接数据层补充外部需求识别方法，供 /demand 页面复用', () => {
  assert.match(supplyDemandDataSource, /export const EXTERNAL_SUPPLY_DEMAND_SCENE_NAME = '外部数据'/)
  assert.match(supplyDemandDataSource, /export function isExternalSupplyDemandItem\(/)
  assert.match(supplyDemandDataSource, /export function isInternalSupplyDemandItem\(/)
  assert.match(supplyDemandDataSource, /item\.sceneName\.trim\(\) === EXTERNAL_SUPPLY_DEMAND_SCENE_NAME/)
})
