import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRunStatsTrendChartPoints,
  buildRunStatsTrendWindowFromJobOptions,
  buildRunStatsTrendWindow,
  resolveRunStatsTrendPeriodCodes,
} from './run-stats-trend.ts'

test('buildRunStatsTrendWindow keeps same-day multiple job periods as a real trend window', () => {
  const result = buildRunStatsTrendWindow(
    {
      periodCode: '20260501_2210',
      executedAt: '2026-05-01 22:10:01',
      resources: 10,
      totalRecords: 1000,
      totalStorageBytes: 2000,
      avgFieldCount: 10,
      normalCount: 0,
      warningCount: 0,
      errorCount: 0,
      freshResourceCount: 0,
      staleResourceCount: 0,
      missingBusinessTimeCount: 0,
      freshnessRate: 0,
    },
    [
      {
        periodCode: '20260501_2130',
        executedAt: '2026-05-01 21:30:01',
        resources: 10,
        totalRecords: 700,
        totalStorageBytes: 1600,
        avgFieldCount: 10,
        normalCount: 0,
        warningCount: 0,
        errorCount: 0,
        freshResourceCount: 0,
        staleResourceCount: 0,
        missingBusinessTimeCount: 0,
        freshnessRate: 0,
      },
      {
        periodCode: '20260501_2140',
        executedAt: '2026-05-01 21:40:01',
        resources: 10,
        totalRecords: 800,
        totalStorageBytes: 1700,
        avgFieldCount: 10,
        normalCount: 0,
        warningCount: 0,
        errorCount: 0,
        freshResourceCount: 0,
        staleResourceCount: 0,
        missingBusinessTimeCount: 0,
        freshnessRate: 0,
      },
      {
        periodCode: '20260501_2150',
        executedAt: '2026-05-01 21:50:01',
        resources: 10,
        totalRecords: 900,
        totalStorageBytes: 1800,
        avgFieldCount: 10,
        normalCount: 0,
        warningCount: 0,
        errorCount: 0,
        freshResourceCount: 0,
        staleResourceCount: 0,
        missingBusinessTimeCount: 0,
        freshnessRate: 0,
      },
      {
        periodCode: '20260501_2200',
        executedAt: '2026-05-01 22:00:01',
        resources: 10,
        totalRecords: 950,
        totalStorageBytes: 1900,
        avgFieldCount: 10,
        normalCount: 0,
        warningCount: 0,
        errorCount: 0,
        freshResourceCount: 0,
        staleResourceCount: 0,
        missingBusinessTimeCount: 0,
        freshnessRate: 0,
      },
    ],
  )

  assert.deepEqual(result.map((item) => item.periodCode), [
    '20260501_2130',
    '20260501_2140',
    '20260501_2150',
    '20260501_2200',
    '20260501_2210',
  ])
})

test('resolveRunStatsTrendPeriodCodes returns the selected task period and its previous 9 periods', () => {
  const result = resolveRunStatsTrendPeriodCodes(
    [
      { periodCode: '20260502_0820' },
      { periodCode: '20260502_0810' },
      { periodCode: '20260502_0800' },
      { periodCode: '20260502_0750' },
      { periodCode: '20260502_0740' },
      { periodCode: '20260502_0730' },
      { periodCode: '20260502_0720' },
      { periodCode: '20260502_0710' },
      { periodCode: '20260502_0700' },
      { periodCode: '20260502_0650' },
      { periodCode: '20260502_0640' },
      { periodCode: '20260502_0630' },
    ],
    '20260502_0810',
    10,
  )

  assert.deepEqual(result, [
    '20260502_0810',
    '20260502_0800',
    '20260502_0750',
    '20260502_0740',
    '20260502_0730',
    '20260502_0720',
    '20260502_0710',
    '20260502_0700',
    '20260502_0650',
    '20260502_0640',
  ])
})

test('buildRunStatsTrendChartPoints keeps a single-period trend visible', () => {
  const result = buildRunStatsTrendChartPoints([1320299560], 364, 200)

  assert.deepEqual(result, [
    {
      x: 182,
      y: 100,
      value: 1320299560,
    },
  ])
})

test('buildRunStatsTrendChartPoints defaults to range scaling for total metrics', () => {
  const result = buildRunStatsTrendChartPoints([1000, 1010], 100, 100)

  assert.deepEqual(result, [
    {
      x: 0,
      y: 90.3,
      value: 1000,
    },
    {
      x: 100,
      y: 9.7,
      value: 1010,
    },
  ])
})

test('buildRunStatsTrendChartPoints supports zero-baseline scaling for delta metrics', () => {
  const result = buildRunStatsTrendChartPoints([1000, 1010], 100, 100, { scaleMode: 'zero-baseline' })

  assert.deepEqual(result, [
    {
      x: 0,
      y: 2.9,
      value: 1000,
    },
    {
      x: 100,
      y: 1.9,
      value: 1010,
    },
  ])
})

test('buildRunStatsTrendWindowFromJobOptions keeps the selected task latest 10 periods', () => {
  const periodSummaries = Array.from({ length: 12 }, (_, index) => {
    const batch = String(index + 1).padStart(3, '0')
    return {
      periodCode: `20260503_${batch}`,
      executedAt: `2026-05-03 16:${String(index).padStart(2, '0')}:00`,
      resources: 10,
      totalRecords: 1000 + index,
      totalStorageBytes: 2000 + index,
      avgFieldCount: 10,
      normalCount: 0,
      warningCount: 0,
      errorCount: 0,
      freshResourceCount: 0,
      staleResourceCount: 0,
      missingBusinessTimeCount: 0,
      freshnessRate: 0,
    }
  })

  const jobOptions = [...periodSummaries]
    .sort((a, b) => b.periodCode.localeCompare(a.periodCode))
    .map((item) => ({
      periodCode: item.periodCode,
      executedAt: item.executedAt,
    }))

  const result = buildRunStatsTrendWindowFromJobOptions(
    periodSummaries,
    jobOptions,
    '20260503_012',
    10,
  )

  assert.deepEqual(
    result.map((item) => item.periodCode),
    [
      '20260503_003',
      '20260503_004',
      '20260503_005',
      '20260503_006',
      '20260503_007',
      '20260503_008',
      '20260503_009',
      '20260503_010',
      '20260503_011',
      '20260503_012',
    ],
  )
})
