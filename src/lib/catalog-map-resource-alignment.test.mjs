import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const resourceTypeSource = readFileSync(resolve(process.cwd(), 'src/lib/catalog-resource-type.ts'), 'utf8')
const portalDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-data.ts'), 'utf8')
const mapCategorySource = readFileSync(resolve(process.cwd(), 'src/lib/catalog-map-category.ts'), 'utf8')

test('地图 API 在资源类型口径上并入空间资源，并兼容旧 map-api 查询参数', () => {
  assert.match(
    resourceTypeSource,
    /if \(\s*serviceTypeId === DATA_RESOURCE_TYPE_ID[\s\S]*?return 'data-resource'/,
  )
  assert.match(
    resourceTypeSource,
    /serviceTypeId === MAP_API_TYPE_ID[\s\S]*?return 'spatial-resource'/,
  )
  assert.match(
    resourceTypeSource,
    /label === '地图API'/,
  )
  assert.match(
    resourceTypeSource,
    /Boolean\(item\.mapPreview\)/,
  )
  assert.match(
    resourceTypeSource,
    /normalizedResourceType === 'map-api'[\s\S]*?return 'spatial-resource'/,
  )
  assert.equal(resourceTypeSource.includes("'map-api': '地图API'"), false)
})

test('门户数据会把地图资源重挂到一级分类地图数据，并移除其他一级分类', () => {
  assert.match(
    portalDataSource,
    /const \{ categories: mapAdjustedDomainCategories, items: mapAdjustedCatalogItems \} = realignMapResourcesToTopLevelMapCategory\(adjustedDomainCategories, catalogItems\)/,
  )
  assert.match(
    portalDataSource,
    /const categoryTree = buildCatalogCategoryTree\(\s*mapAdjustedDomainCategories,\s*mapAdjustedCatalogItems/,
  )
  assert.match(mapCategorySource, /const BASE_ROOT_LABEL = '基础数据'/)
  assert.match(mapCategorySource, /const MANAGE_ROOT_LABEL = '管理数据'/)
  assert.match(mapCategorySource, /const OTHER_ROOT_LABEL = '其他'/)
  assert.match(mapCategorySource, /const MAP_DATA_CATEGORY_LABEL = '地图数据'/)
  assert.match(mapCategorySource, /\[MANAGE_ROOT_LABEL, 3\][\s\S]*\[MAP_DATA_CATEGORY_LABEL, 4\]/)
  assert.match(mapCategorySource, /Boolean\(item\.mapPreview\)/)
  assert.match(mapCategorySource, /categoryAncestorIds: \[mapCategoryId\]/)
  assert.match(mapCategorySource, /industryCategory: MAP_DATA_CATEGORY_PATH/)
  assert.match(mapCategorySource, /businessCategoryPath: MAP_DATA_CATEGORY_PATH/)
  assert.match(mapCategorySource, /category\.id !== otherRoot\?\.id/)
  assert.match(mapCategorySource, /category\.parentId === otherRoot\.id/)
  assert.match(portalDataSource, /const mapPreview = extractMapPreview\(resource, serviceTypeId\)/)
  assert.doesNotMatch(portalDataSource, /mapPreview\s*\?\s*'地图API'/)
})

test('门户端对带地图预览能力的资源按空间资源口径归类', () => {
  assert.match(resourceTypeSource, /type CatalogResourceTypeLike = \{[\s\S]*mapPreview\?: unknown/)
  assert.match(resourceTypeSource, /if \(isMapApiLike\(item\)\) \{[\s\S]*return 'spatial-resource'/)
  assert.match(portalDataSource, /const mapPreview = extractMapPreview\(resource, serviceTypeId\)/)
})
