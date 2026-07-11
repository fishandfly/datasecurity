import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const catalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/catalog-page.tsx'), 'utf8')
const portalContextSource = readFileSync(resolve(process.cwd(), 'src/lib/portal-context.tsx'), 'utf8')
const portalDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-data.ts'), 'utf8')

test('目录页首屏仅依赖轻量资源统计映射，不直接接入全量运行统计状态', () => {
  assert.equal(catalogPageSource.includes('useLatestResourceStatMap'), true)
  assert.equal(catalogPageSource.includes('currentStatRecordByResourceId'), false)
  assert.equal(catalogPageSource.includes('useRunStatsData('), false)
  assert.equal(catalogPageSource.includes('useCurrentRunStats('), false)
})

test('PortalContext 对安全管控列表路由使用轻量数据模式', () => {
  assert.match(portalContextSource, /const portalDataMode = appPathname === '\/security-governance'[\s\S]*appPathname === '\/security-governance\/dashboard'[\s\S]*appPathname === '\/security-governance\/resources'[\s\S]*appPathname === '\/'[\s\S]*\? 'list'[\s\S]*: 'full'/)
  assert.match(portalContextSource, /usePortalCatalogData\(shouldLoadPortalCatalogData, portalDataMode\)/)
})

test('目录轻量模式会为资源列表请求裁剪字段', () => {
  assert.match(portalDataSource, /type PortalDataMode = 'full' \| 'list'/)
  assert.match(portalDataSource, /function getPortalResourceFields\(mode: PortalDataMode\)/)
  assert.match(portalDataSource, /fields: getPortalResourceFields\(mode\)/)
})

test('目录轻量字段列表不直接请求高风险关系字段', () => {
  const listFieldsBlock = portalDataSource.match(/const PORTAL_LIST_RESOURCE_FIELDS = \[[\s\S]*?\] as const/)?.[0] ?? ''

  assert.equal(listFieldsBlock.includes("'display_seq'"), true)
  assert.equal(listFieldsBlock.includes("'tags'"), false)
  assert.equal(listFieldsBlock.includes("'update_cycle'"), false)
  assert.equal(listFieldsBlock.includes("'sharing_attribute'"), false)
  assert.equal(listFieldsBlock.includes("'supply_method'"), false)
  assert.equal(listFieldsBlock.includes("'data_resource_type'"), false)
  assert.equal(listFieldsBlock.includes("'data_items_json'"), false)
  assert.equal(listFieldsBlock.includes("'field_count'"), false)
  assert.equal(listFieldsBlock.includes("'time_range'"), false)
  assert.equal(listFieldsBlock.includes("'region_coverage'"), false)
  assert.equal(listFieldsBlock.includes("'data_updated_at'"), false)
  assert.equal(listFieldsBlock.includes("'source_system'"), false)
  assert.equal(listFieldsBlock.includes("'source_table'"), false)
  assert.equal(listFieldsBlock.includes("'remarks'"), false)
  assert.equal(listFieldsBlock.includes("'data_volume'"), false)
  assert.equal(listFieldsBlock.includes("'usage_count'"), false)
  assert.equal(listFieldsBlock.includes("'provider_unit_id'"), false)
})

test('目录列表读取后端显示顺序并避免前端二次覆盖排序', () => {
  assert.match(portalDataSource, /sort:\s*'display_seq'/)
  assert.equal(catalogPageSource.includes("searchParams.get('sortBy')"), false)
  assert.equal(catalogPageSource.includes("updateParams({ sortBy: option.key })"), false)
})
