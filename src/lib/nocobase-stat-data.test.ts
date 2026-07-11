import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCurrentOverviewStats,
  buildResourceIdFilterBatches,
  buildCurrentRunStatsQueryDefaultsFromJobRows,
  buildRunStatsJobOptions,
  buildRunStatsTaskLookup,
  buildStatSourceDescriptorChain,
  filterStatJobRowsByExecutionDate,
  mergeRunStatsJobRows,
  selectInitialRunStatsPeriodCodes,
} from './nocobase-stat-data.ts'

test('buildRunStatsTaskLookup keeps configured tasks sorted by task_code even when jobs are incomplete', () => {
  const result = buildRunStatsTaskLookup(
    [
      { task_code: 'dw30', task_name: '30分钟数仓统计' },
      { task_code: 'dw1d', task_name: '每日数仓统计' },
      { task_code: 'api_service_stat_job_v2', task_name: 'API 服务统计任务' },
    ],
    [
      { job_code: '20260429_002', task_code: 'dw30', task_name: '30分钟数仓统计' },
    ],
  )

  assert.deepEqual(
    result.taskOptions.map((item) => ({
      taskCode: item.taskCode,
      disabled: item.disabled,
    })),
    [
      { taskCode: 'api_service_stat_job_v2', disabled: true },
      { taskCode: 'dw1d', disabled: true },
      { taskCode: 'dw30', disabled: false },
    ],
  )
})

test('buildRunStatsJobOptions filters the selected task and sorts jobs by latest period first', () => {
  const result = buildRunStatsJobOptions(
    [
      { job_code: '20260429_003', task_code: 'dw30', task_name: '30分钟数仓统计', execute_time: '2026-04-29 17:20:00' },
      { job_code: '20260429_001', task_code: 'dw1d', task_name: '每日数仓统计', execute_time: '2026-04-29 09:00:00' },
      { job_code: '20260429_002', task_code: 'dw30', task_name: '30分钟数仓统计', execute_time: '2026-04-29 16:50:00' },
    ],
    'dw30',
  )

  assert.deepEqual(
    result.map((item) => ({
      periodCode: item.periodCode,
      taskCode: item.taskCode,
      executedAt: item.executedAt,
    })),
    [
      {
        periodCode: '20260429_003',
        taskCode: 'dw30',
        executedAt: '2026-04-29 17:20:00',
      },
      {
        periodCode: '20260429_002',
        taskCode: 'dw30',
        executedAt: '2026-04-29 16:50:00',
      },
    ],
  )
})

test('buildRunStatsTaskLookup only exposes tasks configured in eco_stat_task', () => {
  const result = buildRunStatsTaskLookup(
    [
      { task_code: 'dw1d', task_name: '每日数仓统计' },
      { task_code: 'dw30', task_name: '30分钟数仓统计' },
    ],
    [
      { job_code: '20260429_003', task_code: 'dw30', task_name: '30分钟数仓统计' },
      { job_code: '20260429_002', task_code: 'api_service_stat_job_v2', task_name: 'API 服务统计任务' },
    ],
  )

  assert.deepEqual(
    result.taskOptions.map((item) => item.taskCode),
    ['dw1d', 'dw30'],
  )
  assert.equal(result.periodTaskMap['20260429_002']?.taskCode, 'api_service_stat_job_v2')
})

test('buildStatSourceDescriptorChain only keeps the direct main source when external stat sources are disabled', () => {
  const result = buildStatSourceDescriptorChain(
    {
      resourceName: 'eco_stat_job',
      dataSourceKey: 'main',
      headers: {},
    },
    {
      resourceName: 'eco_stat_job',
      dataSourceKey: 'dw',
      headers: {
        'x-data-source': 'dw',
      },
    },
  )

  assert.deepEqual(result, [
    {
      resourceName: 'eco_stat_job',
      dataSourceKey: 'main',
      headers: {},
    },
  ])
})

test('mergeRunStatsJobRows preserves main-source latest jobs and keeps dw history for older dates', () => {
  const result = mergeRunStatsJobRows([
    { job_code: '20260501_1051', task_code: 'dw30', task_name: '30分钟数仓统计', execute_time: '2026-05-01 10:51:38' },
    { job_code: '20260501_daily', task_code: 'dw1d', task_name: '每日数仓统计', execute_time: '2026-05-01 10:52:27' },
  ], [
    { job_code: '20260429_010', task_code: 'dw1d', task_name: '每日数仓统计', execute_time: '2026-04-29 17:20:42' },
    { job_code: '20260429_009', task_code: 'dw30', task_name: '30分钟数仓统计', execute_time: '2026-04-29 17:20:22' },
    { job_code: '20260501_1051', task_code: 'dw30', task_name: '30分钟数仓统计-旧', execute_time: '2026-05-01 10:50:00' },
  ])

  assert.deepEqual(
    result.map((item) => ({
      periodCode: item.job_code,
      taskCode: item.task_code,
      taskName: item.task_name,
      executedAt: item.execute_time,
    })),
    [
      {
        periodCode: '20260501_daily',
        taskCode: 'dw1d',
        taskName: '每日数仓统计',
        executedAt: '2026-05-01 10:52:27',
      },
      {
        periodCode: '20260501_1051',
        taskCode: 'dw30',
        taskName: '30分钟数仓统计',
        executedAt: '2026-05-01 10:51:38',
      },
      {
        periodCode: '20260429_010',
        taskCode: 'dw1d',
        taskName: '每日数仓统计',
        executedAt: '2026-04-29 17:20:42',
      },
      {
        periodCode: '20260429_009',
        taskCode: 'dw30',
        taskName: '30分钟数仓统计',
        executedAt: '2026-04-29 17:20:22',
      },
    ],
  )
})

test('buildCurrentRunStatsQueryDefaultsFromJobRows uses the latest job row directly without loading current snapshot rows', () => {
  const result = buildCurrentRunStatsQueryDefaultsFromJobRows([
    { job_code: '20260502_1021', task_code: 'dw30', task_name: '30分钟数仓统计', execute_time: '2026-05-02 18:45:00' },
    { job_code: '20260501_daily', task_code: 'dw1d', task_name: '每日数仓统计', execute_time: '2026-05-01 23:50:00' },
  ])

  assert.deepEqual(result, {
    executionDate: '2026-05-02',
    taskCode: 'dw30',
    taskName: '30分钟数仓统计',
    periodCode: '20260502_1021',
  })
})

test('filterStatJobRowsByExecutionDate reuses the cached job rows for the selected execution date', () => {
  const result = filterStatJobRowsByExecutionDate([
    { job_code: '20260502_1023', task_code: 'dw30', task_name: '30分钟数仓统计', execute_time: '2026-05-02 19:24:00' },
    { job_code: '20260502_daily', task_code: 'dw1d', task_name: '每日数仓统计', execute_time: '2026-05-02 10:00:00' },
    { job_code: '20260501_1020', task_code: 'dw30', task_name: '30分钟数仓统计', execute_time: '2026-05-01 18:24:00' },
  ], '2026-05-02')

  assert.deepEqual(
    result.map((item) => item.job_code),
    ['20260502_daily', '20260502_1023'],
  )
})

test('buildResourceIdFilterBatches keeps each batch under the encoded filter limit', () => {
  const resourceIds = Array.from({ length: 12 }, (_, index) => `3300000000${String(index + 1).padStart(3, '0')}`)
  const result = buildResourceIdFilterBatches(resourceIds, 120)

  assert.equal(result.length, 3)
  assert.deepEqual(result.flat().map(String), resourceIds)
  result.forEach((batch) => {
    const encodedLength = encodeURIComponent(JSON.stringify({
      id: {
        $in: batch,
      },
    })).length
    assert.ok(encodedLength <= 120)
  })
})

test('selectInitialRunStatsPeriodCodes keeps only the latest period by default', () => {
  const result = selectInitialRunStatsPeriodCodes([
    '20260502_1021',
    '20260502_0951',
    '20260501_daily',
  ])

  assert.deepEqual(result, ['20260502_1021'])
})

test('buildCurrentOverviewStats keeps the latest record_count while retaining the latest 5 trend periods', () => {
  const buildTrendPoints = (factor: number) =>
    Array.from({ length: 12 }, (_, index) => ({
      stat_period_code: `202404${String(index + 1).padStart(2, '0')}_001`,
      execute_time: `2024-04-${String(index + 1).padStart(2, '0')} 10:00:00`,
      record_count: (index + 1) * factor,
      field_count: 10 + index,
    }))

  const result = buildCurrentOverviewStats([
    {
      id: '1',
      periodCode: '20240412_001',
      executedAt: '2024-04-12 10:00:00',
      resourceId: '3301',
      resourceTypeId: '33',
      resourceCode: 'RES001',
      resourceName: '资源一',
      domainCategoryId: '10',
      domainCategoryName: '业务数据/专题一',
      dataLayerCode: 'DWD',
      dataLayerName: 'DWD',
      connectStatus: '01',
      metainfo: {
        field_count: 120,
        record_count: 999,
      },
      dayOnDay: {
        trend_30d: {
          task_code: 'dw1d',
          points: buildTrendPoints(10),
        },
      },
      quality: {},
      latestPreviewData: null,
      errorList: [],
    },
    {
      id: '2',
      periodCode: '20240412_001',
      executedAt: '2024-04-12 10:00:00',
      resourceId: '3302',
      resourceTypeId: '33',
      resourceCode: 'RES002',
      resourceName: '资源二',
      domainCategoryId: '11',
      domainCategoryName: '管理数据/专题二',
      dataLayerCode: 'DWD',
      dataLayerName: 'DWD',
      connectStatus: '01',
      metainfo: {
        field_count: 80,
        record_count: 888,
      },
      dayOnDay: {
        trend_30d: {
          task_code: 'dw1d',
          points: buildTrendPoints(1),
        },
      },
      quality: {},
      latestPreviewData: null,
      errorList: [],
    },
    {
      id: '3',
      periodCode: '20240412_999',
      executedAt: '2024-04-12 22:00:00',
      resourceId: '3301',
      resourceTypeId: '33',
      resourceCode: 'RES001',
      resourceName: '资源一-30分钟',
      domainCategoryId: '10',
      domainCategoryName: '业务数据/专题一',
      dataLayerCode: 'DWD',
      dataLayerName: 'DWD',
      connectStatus: '01',
      metainfo: {
        field_count: 999,
        record_count: 999999,
      },
      dayOnDay: {
        trend_30d: {
          task_code: 'dw30',
          points: buildTrendPoints(1000),
        },
      },
      quality: {},
      latestPreviewData: null,
      errorList: [],
    },
  ])

  assert.equal(result.themeCount, 2)
  assert.equal(result.resourceCount, 2)
  assert.equal(result.fieldCount, 200)
  assert.equal(result.recordCount, 132)
  assert.equal(result.isFallback, false)
  assert.deepEqual(
    result.trendPoints.map((item) => ({
      periodCode: item.periodCode,
      recordCount: item.recordCount,
    })),
    [
      { periodCode: '20240408_001', recordCount: 88 },
      { periodCode: '20240409_001', recordCount: 99 },
      { periodCode: '20240410_001', recordCount: 110 },
      { periodCode: '20240411_001', recordCount: 121 },
      { periodCode: '20240412_001', recordCount: 132 },
    ],
  )
  assert.deepEqual(result.resourceTrends, [
    {
      resourceId: '3301',
      currentRecordCount: 999,
      points: [
        { periodCode: '20240408_001', recordCount: 80 },
        { periodCode: '20240409_001', recordCount: 90 },
        { periodCode: '20240410_001', recordCount: 100 },
        { periodCode: '20240411_001', recordCount: 110 },
        { periodCode: '20240412_001', recordCount: 120 },
      ],
    },
    {
      resourceId: '3302',
      currentRecordCount: 888,
      points: [
        { periodCode: '20240408_001', recordCount: 8 },
        { periodCode: '20240409_001', recordCount: 9 },
        { periodCode: '20240410_001', recordCount: 10 },
        { periodCode: '20240411_001', recordCount: 11 },
        { periodCode: '20240412_001', recordCount: 12 },
      ],
    },
  ])
})
