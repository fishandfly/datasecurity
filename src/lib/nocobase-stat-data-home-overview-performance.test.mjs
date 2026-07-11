import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const statDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-stat-data.ts'), 'utf8')

test('首页概览与资源卡片统计使用更小的字段集', () => {
  const currentOverviewFieldsBlock = statDataSource.match(/const CURRENT_OVERVIEW_STAT_ROW_FIELDS = \[[\s\S]*?\] as const/)?.[0] ?? ''
  const latestResourceFieldsBlock = statDataSource.match(/const LATEST_RESOURCE_STAT_ROW_FIELDS = \[[\s\S]*?\] as const/)?.[0] ?? ''
  const fetchCurrentStatRowsBlock = statDataSource.match(
    /async function fetchCurrentStatRows\(options: \{[\s\S]*?return attachStatSourceResources\(rawRows\)\n\}/,
  )?.[0] ?? ''
  const currentOverviewStatsFreshBlock = statDataSource.match(
    /async function fetchCurrentOverviewStatsFresh\(\): Promise<CurrentOverviewStats> \{[\s\S]*?\n\}/,
  )?.[0] ?? ''
  const latestResourceMapBlock = statDataSource.match(
    /async function fetchLatestResourceStatMap\(\): Promise<Map<string, StatRecord>> \{[\s\S]*?\n\}/,
  )?.[0] ?? ''
  const latestResourceBatchBlock = statDataSource.match(
    /async function fetchLatestResourceBatchStat\(resourceId: string\): Promise<LatestResourceBatchStat> \{[\s\S]*?\n\}/,
  )?.[0] ?? ''
  const normalizeResourceIdFilterBlock = statDataSource.match(
    /function normalizeResourceIdFilter\(resourceId: string\) \{[\s\S]*?\n\}/,
  )?.[0] ?? ''

  assert.match(currentOverviewFieldsBlock, /'stat_dayonday'/)
  assert.equal(currentOverviewFieldsBlock.includes("'stat_quality'"), false)
  assert.equal(currentOverviewFieldsBlock.includes("'stat_connect'"), false)
  assert.equal(currentOverviewFieldsBlock.includes("'stat_error'"), false)

  assert.match(latestResourceFieldsBlock, /'stat_metainfo'/)
  assert.equal(latestResourceFieldsBlock.includes("'stat_dayonday'"), false)
  assert.equal(latestResourceFieldsBlock.includes("'stat_quality'"), false)
  assert.equal(latestResourceFieldsBlock.includes("'stat_connect'"), false)
  assert.equal(latestResourceFieldsBlock.includes("'stat_error'"), false)

  assert.match(fetchCurrentStatRowsBlock, /const sanitizedFilter = sanitizeCurrentStatFilter\(options\.filter\)/)
  assert.equal(fetchCurrentStatRowsBlock.includes('filter: options.filter'), false)
  assert.equal(fetchCurrentStatRowsBlock.includes('matchStatRowFilter(row, options.filter)'), false)

  assert.match(currentOverviewStatsFreshBlock, /fields:\s*CURRENT_OVERVIEW_STAT_ROW_FIELDS/)
  assert.equal(currentOverviewStatsFreshBlock.includes('stat_period_code'), false)
  assert.match(currentOverviewStatsFreshBlock, /const dw30Records = mappedRecords\.filter\(\(record\) => isDw30CurrentStatRecord\(record\)\)/)
  assert.match(latestResourceMapBlock, /fields:\s*LATEST_RESOURCE_STAT_ROW_FIELDS/)
  assert.equal(latestResourceMapBlock.includes('ensureLatestDw30PeriodCodes(1)'), false)
  assert.equal(latestResourceMapBlock.includes('stat_period_code'), false)
  assert.match(latestResourceMapBlock, /filter\(\(record\) => isDw30CurrentStatRecord\(record\)\)/)
  assert.equal(latestResourceBatchBlock.includes('ensureLatestDw30PeriodCodes(1)'), false)
  assert.equal(latestResourceBatchBlock.includes('stat_period_code'), false)
  assert.match(latestResourceBatchBlock, /data_resource_id: idFilter/)
  assert.match(latestResourceBatchBlock, /return isDw30CurrentStatRecord\(mapStatRecord\(item\)\)/)
  assert.match(normalizeResourceIdFilterBlock, /return resourceId\.trim\(\)/)
  assert.equal(normalizeResourceIdFilterBlock.includes('Number('), false)
})
