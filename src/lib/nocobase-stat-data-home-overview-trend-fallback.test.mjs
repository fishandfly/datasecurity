import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-stat-data.ts'), 'utf8')

function loadMergeCurrentOverviewTrendWindows() {
  const functionSource = source.match(
    /function mergeCurrentOverviewTrendWindows\([\s\S]*?\n\}/,
  )?.[0] ?? ''

  assert.notEqual(functionSource, '', '未找到 mergeCurrentOverviewTrendWindows 实现')

  const executableSource = functionSource
    .replace(
      /function mergeCurrentOverviewTrendWindows\([\s\S]*?\n\): CurrentOverviewTrendWindow \{/,
      'function mergeCurrentOverviewTrendWindows(primaryWindow, fallbackWindow, limit = 5) {',
    )
    .replace(/\): CurrentOverviewTrendWindow \{/g, ') {')
    .replace(/: CurrentOverviewTrendWindow/g, '')
    .replace(/: CurrentOverviewTrendPoint\[\]/g, '')
    .replace(/: CurrentOverviewResourceTrend\[\]/g, '')
    .replace(/: number/g, '')
    .replace(/: string/g, '')
    .replace(/: boolean/g, '')
    .replace(/<string,\s*CurrentOverviewTrendPoint>/g, '')
    .replace(/<string,\s*number>/g, '')
    .replace(/const resourceBucket = new Map<string,[\s\S]*?\>\(\)/g, 'const resourceBucket = new Map()')
    .replace(/compareCurrentOverviewTrendPoints/g, '((left, right) => left.periodCode.localeCompare(right.periodCode, \'zh-CN\') || left.executedAt.localeCompare(right.executedAt, \'zh-CN\'))')

  return new Function(`${executableSource}\nreturn mergeCurrentOverviewTrendWindows`)()
}

test('首页概览趋势窗口在 current 只有 1 个点时使用历史真实周期补足最近 5 次', () => {
  const mergeCurrentOverviewTrendWindows = loadMergeCurrentOverviewTrendWindows()

  const result = mergeCurrentOverviewTrendWindows(
    {
      trendPoints: [
        { periodCode: '20260505_001', executedAt: '2026-05-05 10:00:00', recordCount: 550 },
      ],
      resourceTrends: [
        {
          resourceId: 'resource-a',
          currentRecordCount: 550,
          points: [{ periodCode: '20260505_001', recordCount: 550 }],
        },
      ],
    },
    {
      trendPoints: [
        { periodCode: '20260501_001', executedAt: '2026-05-01 10:00:00', recordCount: 510 },
        { periodCode: '20260502_001', executedAt: '2026-05-02 10:00:00', recordCount: 520 },
        { periodCode: '20260503_001', executedAt: '2026-05-03 10:00:00', recordCount: 530 },
        { periodCode: '20260504_001', executedAt: '2026-05-04 10:00:00', recordCount: 540 },
        { periodCode: '20260505_001', executedAt: '2026-05-05 09:00:00', recordCount: 545 },
      ],
      resourceTrends: [
        {
          resourceId: 'resource-a',
          currentRecordCount: 545,
          points: [
            { periodCode: '20260501_001', recordCount: 510 },
            { periodCode: '20260502_001', recordCount: 520 },
            { periodCode: '20260503_001', recordCount: 530 },
            { periodCode: '20260504_001', recordCount: 540 },
            { periodCode: '20260505_001', recordCount: 545 },
          ],
        },
      ],
    },
    5,
  )

  assert.deepEqual(
    result.trendPoints.map((item) => [item.periodCode, item.recordCount]),
    [
      ['20260501_001', 510],
      ['20260502_001', 520],
      ['20260503_001', 530],
      ['20260504_001', 540],
      ['20260505_001', 550],
    ],
  )
  assert.deepEqual(
    result.resourceTrends[0]?.points.map((item) => [item.periodCode, item.recordCount]),
    [
      ['20260501_001', 510],
      ['20260502_001', 520],
      ['20260503_001', 530],
      ['20260504_001', 540],
      ['20260505_001', 550],
    ],
  )
  assert.equal(result.resourceTrends[0]?.currentRecordCount, 550)
})

test('fetchCurrentOverviewStats 在 current 趋势不足时会回退补足最近 5 次真实周期', () => {
  const fetchBlock = source.match(
    /async function fetchCurrentOverviewStatsFresh\(\): Promise<CurrentOverviewStats> \{[\s\S]*?currentOverviewStatsCache = payload[\s\S]*?\n\s*\}\)/,
  )?.[0] ?? ''

  assert.match(fetchBlock, /payload\.trendPoints\.length < CURRENT_OVERVIEW_TREND_POINT_LIMIT/)
  assert.match(fetchBlock, /fetchCurrentOverviewTrendFallbackRecords\(/)
  assert.match(fetchBlock, /buildCurrentOverviewStats\(records,\s*fallbackRecords\)/)
})
