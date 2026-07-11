import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const catalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/catalog-page.tsx'), 'utf8')

test('文档资源视图保留 category 查询参数，避免覆盖文档页自身分类筛选', () => {
  assert.match(catalogPageSource, /const staleParamKeys = activeCatalogView === 'document'/)
  assert.match(catalogPageSource, /\? \['sidebarKeyword', 'sidebarTab', 'department', 'region', 'openType', 'format', 'serviceType', 'regionNode', 'informationCategoryNode'\] as const/)
  assert.match(catalogPageSource, /: \['sidebarKeyword', 'sidebarTab', 'category', 'department', 'region', 'openType', 'format', 'serviceType', 'regionNode', 'informationCategoryNode'\] as const/)
})
