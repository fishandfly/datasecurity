import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const globalSearchPageSource = readFileSync(resolve(process.cwd(), 'src/pages/global-search-page.tsx'), 'utf8')
const catalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/catalog-page.tsx'), 'utf8')
const demandPageSource = readFileSync(resolve(process.cwd(), 'src/pages/demand-page-internal.tsx'), 'utf8')
const demandCatalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/demand-catalog-page.tsx'), 'utf8')
const portalDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-data.ts'), 'utf8')

test('全局搜索接入全文匹配，并补充场景应用结果分组', () => {
  assert.match(globalSearchPageSource, /compareFullTextSearch, matchesFullTextSearch, normalizeFullTextSearch/)
  assert.match(globalSearchPageSource, /usePortalAppCatalogData/)
  assert.match(globalSearchPageSource, /useSupplyDemandPortalData\(!isBootstrapping, \{ includeRelatedApps: true \}\)/)
  assert.match(globalSearchPageSource, /const applicationResults = useMemo\(\(\) => \{/)
  assert.match(globalSearchPageSource, /title="场景应用命中"/)
  assert.match(globalSearchPageSource, /场景应用/)
  assert.match(globalSearchPageSource, /appKeyword=/)
  assert.match(globalSearchPageSource, /to=\{withEmbed\(`\/demand\/applications\/\$\{item\.id\}`\)\}/)
  assert.match(globalSearchPageSource, /matchesFullTextSearch\(item\.searchText, normalizedKeyword\)/)
  assert.match(globalSearchPageSource, /matchesFullTextSearch\(buildSupplyDemandSearchText\(item\), normalizedKeyword\)/)
  assert.match(globalSearchPageSource, /matchesFullTextSearch\(buildTaskSearchText\(item\), normalizedKeyword\)/)
})

test('目录页与供需页关键词筛选统一切换到全文匹配', () => {
  assert.match(catalogPageSource, /matchesFullTextSearch\(item\.searchText, keyword\)/)
  assert.match(demandPageSource, /matchesFullTextSearch\(buildDemandKeywordHaystack\(item\), keyword\)/)
  assert.match(demandPageSource, /activeDemandTab === 'application' \? <PortalApplicationCatalogSection \/> : null/)
  assert.match(demandCatalogPageSource, /matchesFullTextSearch\(item\.searchText, keyword\)/)
})

test('目录资源搜索索引补充物理表与地图服务字段', () => {
  assert.match(portalDataSource, /physicalTables\.baseline/)
  assert.match(portalDataSource, /physicalTables\.rows\.flatMap/)
  assert.match(portalDataSource, /mapPreview\.serviceUrl/)
  assert.match(portalDataSource, /mapPreview\.previewUrl/)
  assert.match(portalDataSource, /mapPreview\.layerKind/)
  assert.match(portalDataSource, /supplyMethod/)
  assert.match(portalDataSource, /sharingAttribute/)
})
