import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const catalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/catalog-page.tsx'), 'utf8')
const indexCssSource = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

test('目录列表页每页显示 15 条资源', () => {
  assert.match(catalogPageSource, /const pageSize = 15/)
  assert.match(catalogPageSource, /每页 \{pageSize\} 条/)
})

test('目录资源卡列表固定为一行两个卡片', () => {
  assert.match(catalogPageSource, /className="catalog-resource-card-grid grid gap-5"/)
  assert.match(indexCssSource, /\.catalog-resource-card-grid\s*\{\s*container-type: inline-size;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s)
  assert.doesNotMatch(indexCssSource, /@container \(min-width: 760px\)\s*\{\s*\.catalog-resource-card-grid\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s)
  assert.doesNotMatch(indexCssSource, /@container \(min-width: 1320px\)\s*\{\s*\.catalog-resource-card-grid\s*\{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/s)
})
