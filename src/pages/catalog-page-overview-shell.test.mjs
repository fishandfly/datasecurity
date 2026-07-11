import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const catalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/catalog-page.tsx'), 'utf8')
const overviewPanelSource = readFileSync(resolve(process.cwd(), 'src/components/catalog-overview-panel.tsx'), 'utf8')
const spatialOverviewPanelSource = readFileSync(resolve(process.cwd(), 'src/components/catalog-spatial-overview-panel.tsx'), 'utf8')
const serviceOverviewPanelSource = readFileSync(resolve(process.cwd(), 'src/components/catalog-service-overview-panel.tsx'), 'utf8')
const sourceOverviewPanelSource = readFileSync(resolve(process.cwd(), 'src/components/catalog-source-overview-panel.tsx'), 'utf8')

test('目录页顶部统计区域使用独立白底外层和标题，不影响统计卡内容组件复用', () => {
  assert.match(catalogPageSource, /const DEFAULT_CATALOG_VIEW_TABS: Array<\{/)
  assert.match(catalogPageSource, /id: 'data-resource'[\s\S]*?label: '数据资源'[\s\S]*?id: 'document'[\s\S]*?label: '文档资源'[\s\S]*?visibleInTabs: true[\s\S]*?id: 'spatial-resource'[\s\S]*?label: '空间资源'[\s\S]*?visibleInTabs: true[\s\S]*?id: 'data-source'[\s\S]*?label: '数据源'/)
  assert.match(catalogPageSource, /id: 'service'[\s\S]*?label: '数据API服务'[\s\S]*?visibleInTabs: false/)
  assert.match(catalogPageSource, /const tabbedCatalogViews = resolvedCatalogTabs\.filter\(\(tab\) => tab\.visibleInTabs\)/)
  assert.match(catalogPageSource, /tabbedCatalogViews\.map\(\(tab\) => \{/)
  assert.match(catalogPageSource, /<CatalogOverviewPanel[\s\S]*?variant="plain"[\s\S]*?activeCategoryNodeId=\{activeCategoryNodeId\}[\s\S]*?onCategorySelect=\{\(id\) => updateParams\(\{ categoryNode: id, page: '1' \}\)\}[\s\S]*?\/>/)
  assert.match(catalogPageSource, /activeCatalogView === 'spatial-resource' \? \(\s*<CatalogSpatialOverviewPanel/)
  assert.match(catalogPageSource, /<CatalogSpatialOverviewPanel[\s\S]*?items=\{rawCatalogItems\}[\s\S]*?activeLayerKind=\{activeSpatialLayerKind\}[\s\S]*?onLayerKindSelect=\{\(id\) => updateParams\(\{ spatialLayerKind: id, page: '1' \}\)\}[\s\S]*?\/>/)
  assert.match(catalogPageSource, /activeCatalogView === 'data-source' \? \(\s*<CatalogSourceOverviewPanel/)
  assert.match(catalogPageSource, /<CatalogSourceOverviewPanel[\s\S]*?sourceTree=\{baseSourceTree\}[\s\S]*?items=\{rawCatalogItems\}[\s\S]*?activeDepartmentNodeId=\{activeDepartmentNodeId\}[\s\S]*?onDepartmentSelect=\{\(id\) => updateParams\(\{ departmentNode: id, page: '1' \}\)\}[\s\S]*?\/>/)
  assert.match(catalogPageSource, /activeCatalogView === 'service' \? \(\s*<CatalogServiceOverviewPanel/)
  assert.match(catalogPageSource, /activeCatalogView === 'document'[\s\S]*?<KnowledgeDocumentsPage[\s\S]*?\/>/)
  assert.match(catalogPageSource, /<CatalogServiceOverviewPanel[\s\S]*?businessAttributeTree=\{baseBusinessAttributeTree\}[\s\S]*?items=\{rawCatalogItems\}[\s\S]*?activeBusinessAttributeNodeId=\{activeBusinessAttributeNodeId\}[\s\S]*?onBusinessAttributeSelect=\{\(id\) => updateParams\(\{ businessAttributeNode: id, page: '1' \}\)\}[\s\S]*?\/>/)
  assert.doesNotMatch(catalogPageSource, /<div className="text-\[1\.875rem\] font-semibold leading-tight text-\[var\(--text-main\)\]">\{activeViewMeta\.title\}<\/div>/)
  assert.match(
    catalogPageSource,
    /<section className="overflow-hidden rounded-\[24px\] border border-\[var\(--surface-outline-strong\)\] bg-\[linear-gradient\(135deg,var\(--surface-hero-start\),var\(--surface-hero-end\)\)\] px-6 py-6 shadow-\[var\(--shadow-elevated\)\]">/,
  )
  assert.equal(catalogPageSource.includes('新建数据资源'), true)
  assert.equal(catalogPageSource.split('新建数据资源').length - 1, 1)
  assert.match(catalogPageSource, /canManageResources && activeCatalogView === 'data-resource'/)
  assert.match(catalogPageSource, /activeCatalogView === 'data-resource' \? \(\s*<CatalogOverviewPanel/)
  assert.match(overviewPanelSource, /variant = 'default'/)
  assert.match(overviewPanelSource, /variant === 'plain'/)
  assert.match(spatialOverviewPanelSource, /export function CatalogSpatialOverviewPanel/)
  assert.doesNotMatch(spatialOverviewPanelSource, /总空间资源/)
  assert.match(serviceOverviewPanelSource, /export function CatalogServiceOverviewPanel/)
  assert.match(sourceOverviewPanelSource, /export function CatalogSourceOverviewPanel/)
})
