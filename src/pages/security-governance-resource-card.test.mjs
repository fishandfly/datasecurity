import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./security-governance-page.tsx', import.meta.url), 'utf8')
const portalDataSource = readFileSync(new URL('../lib/nocobase-portal-data.ts', import.meta.url), 'utf8')

test('资源列表卡片隐藏缺失属性并合并安全标注提示', () => {
  assert.match(pageSource, /function hasSecurityCardValue\(value: string\)/)
  assert.match(pageSource, /安全标注待完善/)
  assert.doesNotMatch(pageSource, /\|\| '未标注来源单位'/)
  assert.doesNotMatch(pageSource, /\|\| '未标注安全分类'/)
  assert.doesNotMatch(pageSource, /\|\| '未标注安全等级'/)
  assert.doesNotMatch(pageSource, /要求访问范围/)
  assert.doesNotMatch(pageSource, /字段监督摘要/)
})

test('资源列表卡片聚合 API、接入、访问、同态和日志运行统计', () => {
  assert.match(pageSource, /useResourceSecuritySummaries\(true\)/)
  assert.match(pageSource, /label: 'API'[\s\S]*label: '接入'[\s\S]*label: '访问'[\s\S]*label: '同态'[\s\S]*label: '日志'/)
  assert.match(pageSource, /summary\.publishedApiCount/)
  assert.match(pageSource, /summary\.ingestFailureCount/)
  assert.match(pageSource, /summary\.deniedRequestCount/)
  assert.match(pageSource, /summary\.completedHomomorphicTaskCount/)
  assert.match(pageSource, /summary\.warningCount/)
})

test('资源列表卡片展示有上限的分类标签', () => {
  assert.match(portalDataSource, /'resource_tags'/)
  assert.match(portalDataSource, /normalizeTags\(resource\.resource_tags \?\? resource\.tags\)/)
  assert.match(pageSource, /aria-label="分类标签"/)
  assert.match(pageSource, /item\.tags\.slice\(0, 4\)\.map/)
  assert.match(pageSource, /\+\{item\.tags\.length - 4\}/)
})
