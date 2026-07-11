import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const detailPageSource = readFileSync(resolve(process.cwd(), 'src/pages/detail-page.tsx'), 'utf8')
const resourceEditSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-resource-edit.ts'), 'utf8')
const portalDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-data.ts'), 'utf8')

test('详情页增加链接信息 tab 与专用编辑入口', () => {
  assert.match(detailPageSource, /type DetailTabKey = 'basicInfo' \| 'mapPreview' \| 'linkInfo' \| 'fields'/)
  assert.match(detailPageSource, /const shouldShowLinkInfoTab = item \? !isStrictDataResource\(item\) : false/)
  assert.match(detailPageSource, /\['linkInfo', '链接信息'\]/)
  assert.match(detailPageSource, /\.filter\(\(\[key\]\) => shouldShowLinkInfoTab \|\| key !== 'linkInfo'\)/)
  assert.match(detailPageSource, /activeTab === 'linkInfo'/)
  assert.match(detailPageSource, /title="链接信息"/)
  assert.match(detailPageSource, /badgeLabel=\{latestStatus \? latestStatus\.label : undefined\}/)
  assert.match(detailPageSource, /编辑链接信息/)
  assert.match(detailPageSource, /<LinkInfoList item=\{item\} \/>/)
  assert.match(detailPageSource, /<ResourceLinkEditDialog/)
})

test('资源编辑层提供 access_url 的读写能力', () => {
  assert.match(resourceEditSource, /export type EditableResourceLinkRecord = \{/)
  assert.match(resourceEditSource, /function buildAccessUrlValues\(values: EditableResourceLinkRecord\)/)
  assert.match(resourceEditSource, /access_url: buildAccessUrlValues\(values\)/)
  assert.match(resourceEditSource, /export async function saveEditableResourceLinkInfo/)
  assert.match(resourceEditSource, /export function useEditableResourceLinkInfo/)
})

test('门户数据层把 access_url 映射为详情页可消费的链接信息结构', () => {
  assert.match(portalDataSource, /export type CatalogLinkInfo = \{/)
  assert.match(portalDataSource, /function parseResourceLinkInfo\(rawValue: unknown\): CatalogLinkInfo/)
  assert.match(portalDataSource, /const linkInfo = parseResourceLinkInfo\(resource\.access_url\)/)
  assert.match(portalDataSource, /linkInfo,/)
})
