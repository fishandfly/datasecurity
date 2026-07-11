import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const homePageSource = readFileSync(resolve(process.cwd(), 'src/pages/home-page.tsx'), 'utf8')

test('首页推荐区显式使用当前资源统计映射来展示业务时间', () => {
  assert.equal(homePageSource.includes("import { buildDetailMetricSnapshot } from '../lib/detail-metric-snapshot'"), false)
  assert.equal(homePageSource.includes("import { useLatestResourceStatMap } from '../lib/nocobase-stat-data'"), true)
  assert.equal(homePageSource.includes('useLatestResourceStatMap(statEnabled)'), true)
  assert.equal(homePageSource.includes('resolveLatestBusinessUpdateTimeText(item.id, latestResourceStatMap)'), true)
  assert.equal(homePageSource.includes('buildDetailMetricSnapshot({'), false)
})
