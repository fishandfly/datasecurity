import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const snapshotSource = readFileSync(resolve(process.cwd(), 'src/lib/detail-metric-snapshot.ts'), 'utf8')
const catalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/catalog-page.tsx'), 'utf8')
const detailPageSource = readFileSync(resolve(process.cwd(), 'src/pages/detail-page.tsx'), 'utf8')

test('详情指标快照在业务时间缺失时直接显示当前统计状态，不再回退目录更新时间', () => {
  assert.doesNotMatch(snapshotSource, /fallbackUpdateTime\?: string/)
  assert.doesNotMatch(snapshotSource, /const fallbackUpdateTimeText = \(\(\) => \{/)
  assert.match(snapshotSource, /const updateTimeText = businessTimeText \|\| \(hasLatestRecord \? businessTimeStatusText : '未标注'\)/)
  assert.doesNotMatch(snapshotSource, /目录更新时间/)
})

test('目录页和详情页不再传入目录更新时间作为业务时间兜底', () => {
  assert.doesNotMatch(catalogPageSource, /fallbackUpdateTime: item\.updateTime,/)
  assert.doesNotMatch(detailPageSource, /fallbackUpdateTime: item\.updateTime,/)
})
