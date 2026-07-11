import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const portalDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-data.ts'), 'utf8')
const noiseCategorySource = readFileSync(resolve(process.cwd(), 'src/lib/catalog-noise-category.ts'), 'utf8')

test('门户数据在构建领域分类树前，会把其他分类下的噪声资源重挂到业务数据/噪声', () => {
  assert.match(
    portalDataSource,
    /const \{ categories: adjustedDomainCategories, items: adjustedCatalogItems \} = realignNoiseResourcesToBusinessCategory\(domainCategories, catalogItems\)/,
  )
  assert.match(
    portalDataSource,
    /const \{ categories: mapAdjustedDomainCategories, items: mapAdjustedCatalogItems \} = realignMapResourcesToTopLevelMapCategory\(adjustedDomainCategories, catalogItems\)/,
  )
  assert.match(
    portalDataSource,
    /const categoryTree = buildCatalogCategoryTree\(\s*mapAdjustedDomainCategories,\s*mapAdjustedCatalogItems/,
  )
  assert.match(
    portalDataSource,
    /catalogItems,\s*categoryTree,/,
  )
})

test('噪声归并逻辑只处理其他分类资源，并新增业务数据下的噪声二级分类', () => {
  assert.match(noiseCategorySource, /const NOISE_CATEGORY_LABEL = '噪声'/)
  assert.match(noiseCategorySource, /const BUSINESS_ROOT_LABEL = '业务数据'/)
  assert.match(noiseCategorySource, /const OTHER_ROOT_LABEL = '其他'/)
  assert.match(noiseCategorySource, /return topCategory === OTHER_ROOT_LABEL/)
  assert.match(noiseCategorySource, /categoryAncestorIds: \[businessRoot\.id, noiseCategoryId\]/)
  assert.match(noiseCategorySource, /industryCategory: NOISE_CATEGORY_PATH/)
  assert.match(noiseCategorySource, /businessCategoryPath: NOISE_CATEGORY_PATH/)
})
