import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const homePageSource = readFileSync(resolve(process.cwd(), 'src/pages/home-page.tsx'), 'utf8')
const catalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/catalog-page.tsx'), 'utf8')
const primaryOverviewCardsSource = readFileSync(resolve(process.cwd(), 'src/components/primary-overview-cards.tsx'), 'utf8')
const catalogOverviewPanelSource = readFileSync(resolve(process.cwd(), 'src/components/catalog-overview-panel.tsx'), 'utf8')

test('首页默认态不展示分类四卡，列表页 plain 变体继续展示基础、业务、管理、地图数据分类统计与趋势图', () => {
  assert.match(homePageSource, /<CatalogOverviewPanel \/>/)
  assert.match(
    catalogPageSource,
    /<CatalogOverviewPanel[\s\S]*?variant="plain"[\s\S]*?activeCategoryNodeId=\{activeCategoryNodeId\}[\s\S]*?onCategorySelect=\{\(id\) => updateParams\(\{ categoryNode: id, page: '1' \}\)\}[\s\S]*?\/>/,
  )

  const serviceStatsBlock = catalogOverviewPanelSource.match(
    /const serviceStatsRow = useMemo<OverviewMetricCardItem\[\]>\(\(\) => \{[\s\S]*?\n  \}, \[[\s\S]*?\]\)/,
  )?.[0] ?? ''

  assert.equal(catalogOverviewPanelSource.includes("label: '基础数据'"), true)
  assert.equal(catalogOverviewPanelSource.includes("label: '业务数据'"), true)
  assert.equal(catalogOverviewPanelSource.includes("label: '管理数据'"), true)
  assert.equal(catalogOverviewPanelSource.includes("label: '地图数据'"), true)
  assert.match(serviceStatsBlock, /resourceTypeId === 'data-resource'/)
  assert.equal(serviceStatsBlock.includes("label: '数据服务'"), false)
  assert.equal(serviceStatsBlock.includes("label: '空间服务数量'"), false)
  assert.equal(serviceStatsBlock.includes("label: '调用次数'"), false)
  assert.equal(serviceStatsBlock.includes("label: '连通情况'"), false)
  assert.equal(serviceStatsBlock.includes('showTrend: false'), false)
  assert.match(catalogOverviewPanelSource, /variant !== 'plain'\s*\?\s*<PrimaryOverviewCards data=\{overviewCardData\} \/>\s*:\s*null/)
  assert.match(catalogOverviewPanelSource, /variant === 'plain'\s*\?\s*\(?\s*<OverviewMetricCardsGrid[\s\S]*?items=\{serviceStatsRow\}/)
  assert.match(serviceStatsBlock, /overviewCardData\.trendPeriodCodes/)
  assert.match(serviceStatsBlock, /overviewCardData\.resourceTrends/)
  assert.match(serviceStatsBlock, /catalogCategoryCounts/)
  assert.match(serviceStatsBlock, /currentCategoryStatCounts/)
  assert.match(serviceStatsBlock, /currentCategoryRecordCounts/)
  assert.match(serviceStatsBlock, /item\.currentRecordCount/)
  assert.match(serviceStatsBlock, /valueNode: buildResourceCategoryMetricValueNode\(/)
  assert.match(serviceStatsBlock, /hideDeltaText: true/)
  assert.match(serviceStatsBlock, /onClick: variant === 'plain' && onCategorySelect && topCategoryNodeIdByKey\[item\.key\]/)
  assert.match(serviceStatsBlock, /isActive: Boolean\(activeCategoryNodeId\) && activeCategoryNodeId === topCategoryNodeIdByKey\[item\.key\]/)
  assert.doesNotMatch(serviceStatsBlock, /asideNode: buildResourceCategoryMetricAsideNode\(item\.key\)/)
  assert.doesNotMatch(serviceStatsBlock, /已纳入/)
  assert.doesNotMatch(serviceStatsBlock, /暂无上期对比/)
})

test('首页顶部数据资源卡按数据资源类型统计，数据条数来自 current 汇总', () => {
  assert.match(primaryOverviewCardsSource, /getCatalogResourceTypeFilterId\(item\)/)
  assert.match(primaryOverviewCardsSource, /resourceTypeId === 'data-resource'/)
  assert.match(primaryOverviewCardsSource, /currentOverviewStats\.recordCount/)
  assert.match(primaryOverviewCardsSource, /currentOverviewStats\.fieldCount/)
  assert.match(primaryOverviewCardsSource, /currentOverviewStats\.resourceCount/)
  assert.match(primaryOverviewCardsSource, /asideNode\?: ReactNode/)
})
