import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dataProductsSource = readFileSync(resolve(process.cwd(), 'src/lib/data-products.ts'), 'utf8')
const listPageSource = readFileSync(resolve(process.cwd(), 'src/pages/data-product-list-page.tsx'), 'utf8')
const detailPageSource = readFileSync(resolve(process.cwd(), 'src/pages/data-product-detail-page.tsx'), 'utf8')
const tabsSource = readFileSync(resolve(process.cwd(), 'src/components/data-product-catalog-tabs.tsx'), 'utf8')
const navigationSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-navigation.ts'), 'utf8')

test('数据产品模型支持外部 API、授权、检索维度、多视图和脚本配置', () => {
  assert.match(dataProductsSource, /export type DataProductViewMode = 'tree-table' \| 'table' \| 'calendar' \| 'kanban' \| 'graph' \| 'script'/)
  assert.match(dataProductsSource, /export type DataProductApiConfig = \{/)
  assert.match(dataProductsSource, /authorizationStatus: DataProductAuthorizationStatus/)
  assert.match(dataProductsSource, /dimensions: DataProductDimension\[]/)
  assert.match(dataProductsSource, /scriptSource: string/)
  assert.match(dataProductsSource, /const DATA_PRODUCT_COLLECTION = 'eco_data_products'/)
  assert.match(dataProductsSource, /nocobaseClient\.resource\(DATA_PRODUCT_COLLECTION\)\.list/)
  assert.match(dataProductsSource, /product\.api\.endpoint\.startsWith\('nocobase:\/\/'\)/)
  assert.match(dataProductsSource, /new Function\([\s\S]*?const window = undefined;[\s\S]*?const document = undefined;[\s\S]*?const fetch = undefined;/)
})

test('数据产品列表放在资源目录二级导航下，并提供授权、嵌入和多模式入口', () => {
  assert.match(navigationSource, /id: 'data-resource'[\s\S]*id: 'data-product'[\s\S]*href: '\/data-products'/)
  assert.match(tabsSource, /export function DataProductCatalogTabs\(\{ activeId \}/)
  assert.match(listPageSource, /<DataProductCatalogTabs activeId="data-product" \/>/)
  assert.match(listPageSource, /树表/)
  assert.match(listPageSource, /表格/)
  assert.match(listPageSource, /日历/)
  assert.match(listPageSource, /看板/)
  assert.match(listPageSource, /图谱/)
  assert.match(listPageSource, /脚本/)
  assert.match(listPageSource, /\/data-products\/\$\{product\.id\}\?embed=1&view=/)
})

test('数据产品详情页支持树表、表格、日历、看板、图谱、脚本预览和 embed 复用', () => {
  assert.match(detailPageSource, /function DataProductTreeTable/)
  assert.match(detailPageSource, /function DataProductTable/)
  assert.match(detailPageSource, /function DataProductCalendar/)
  assert.match(detailPageSource, /function DataProductKanban/)
  assert.match(detailPageSource, /function DataProductGraph/)
  assert.match(detailPageSource, /function DataProductScriptPanel/)
  assert.match(detailPageSource, /readEmbedMode\(location\.search\)/)
  assert.match(detailPageSource, /const embedPath = product \? `\/data-products\/\$\{product\.id\}\?embed=1&view=\$\{viewMode\}` : '\/data-products\?embed=1'/)
  assert.match(detailPageSource, /已授权可直接使用/)
  assert.match(detailPageSource, /需获得授权后使用/)
})
