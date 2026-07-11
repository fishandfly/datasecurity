import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRunStatsReportCenterPath,
  hasRunStatsPendingQueryChanges,
  paginateRunStatsDetailRows,
  resolvePreferredRunStatsJobSelection,
  resolveRunStatsQueryControlState,
  shouldLoadRunStatsJobOptions,
  shouldResetRunStatsTaskSelection,
} from './run-stats-page-state.ts'

test('buildRunStatsReportCenterPath carries current execution date and task code', () => {
  assert.equal(
    buildRunStatsReportCenterPath({
      withEmbed: (path) => path,
      selectedExecutionDate: '2026-04-29',
      selectedTaskCode: 'dw30',
      selectedPeriod: '',
      queriedExecutionDate: '',
      queriedTaskCode: '',
      queriedPeriod: '',
    }),
    '/run-stats/report?executionDate=2026-04-29&taskCode=dw30',
  )
})

test('buildRunStatsReportCenterPath keeps current queried period when current selection matches it', () => {
  assert.equal(
    buildRunStatsReportCenterPath({
      withEmbed: (path) => path,
      selectedExecutionDate: '2026-04-29',
      selectedTaskCode: 'dw30',
      selectedPeriod: '20260429_007',
      queriedExecutionDate: '2026-04-29',
      queriedTaskCode: 'dw30',
      queriedPeriod: '20260429_007',
    }),
    '/run-stats/report?executionDate=2026-04-29&taskCode=dw30&period=20260429_007',
  )
})

test('resolveRunStatsQueryControlState follows date -> task -> job progression', () => {
  assert.deepEqual(
    resolveRunStatsQueryControlState({
      selectedExecutionDate: '',
      selectedTaskCode: '',
      selectedPeriod: '',
      taskOptionCount: 2,
      jobOptionCount: 0,
      isTaskLoading: false,
      isJobLoading: false,
      isSubmittingQuery: false,
    }),
    {
      taskEnabled: false,
      jobEnabled: false,
      queryEnabled: false,
    },
  )

  assert.deepEqual(
    resolveRunStatsQueryControlState({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: '',
      selectedPeriod: '',
      taskOptionCount: 2,
      jobOptionCount: 0,
      isTaskLoading: false,
      isJobLoading: false,
      isSubmittingQuery: false,
    }),
    {
      taskEnabled: true,
      jobEnabled: false,
      queryEnabled: false,
    },
  )

  assert.deepEqual(
    resolveRunStatsQueryControlState({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: 'dw30',
      selectedPeriod: '20260502_0810',
      taskOptionCount: 2,
      jobOptionCount: 4,
      isTaskLoading: false,
      isJobLoading: false,
      isSubmittingQuery: false,
    }),
    {
      taskEnabled: true,
      jobEnabled: true,
      queryEnabled: true,
    },
  )
})

test('resolvePreferredRunStatsJobSelection keeps the queried period when the same date and task are re-opened', () => {
  assert.equal(
    resolvePreferredRunStatsJobSelection({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: 'dw30',
      queriedExecutionDate: '2026-05-02',
      queriedTaskCode: 'dw30',
      queriedPeriod: '20260502_0800',
      jobOptions: [
        { periodCode: '20260502_0810' },
        { periodCode: '20260502_0800' },
      ],
    }),
    '20260502_0800',
  )
})

test('resolvePreferredRunStatsJobSelection falls back to the latest loaded job when there is no matching queried period', () => {
  assert.equal(
    resolvePreferredRunStatsJobSelection({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: 'dw30',
      queriedExecutionDate: '2026-05-01',
      queriedTaskCode: 'dw30',
      queriedPeriod: '20260501_2210',
      jobOptions: [
        { periodCode: '20260502_0810' },
        { periodCode: '20260502_0800' },
      ],
    }),
    '20260502_0810',
  )
})

test('hasRunStatsPendingQueryChanges treats period changes as pending query changes too', () => {
  assert.equal(
    hasRunStatsPendingQueryChanges({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: 'dw30',
      selectedPeriod: '20260502_0810',
      queriedExecutionDate: '2026-05-02',
      queriedTaskCode: 'dw30',
      queriedPeriod: '20260502_0800',
    }),
    true,
  )
})

test('shouldResetRunStatsTaskSelection waits for task catalog loading to finish', () => {
  assert.equal(
    shouldResetRunStatsTaskSelection({
      selectedTaskCode: 'dw30',
      taskOptions: [],
      isTaskCatalogLoading: true,
    }),
    false,
  )

  assert.equal(
    shouldResetRunStatsTaskSelection({
      selectedTaskCode: 'dw30',
      taskOptions: [],
      isTaskCatalogLoading: false,
    }),
    true,
  )
})

test('shouldLoadRunStatsJobOptions only loads after date and task are both selected', () => {
  assert.equal(
    shouldLoadRunStatsJobOptions({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: '',
    }),
    false,
  )

  assert.equal(
    shouldLoadRunStatsJobOptions({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: 'dw30',
    }),
    true,
  )
})

test('paginateRunStatsDetailRows slices the current detail rows by page size', () => {
  const rows = Array.from({ length: 45 }, (_, index) => index + 1)

  assert.deepEqual(
    paginateRunStatsDetailRows(rows, 2, 20),
    {
      items: Array.from({ length: 20 }, (_, index) => index + 21),
      safePage: 2,
      totalPages: 3,
      pageSize: 20,
    },
  )
})

test('paginateRunStatsDetailRows clamps an out-of-range page to the last valid page', () => {
  const rows = Array.from({ length: 45 }, (_, index) => index + 1)

  assert.deepEqual(
    paginateRunStatsDetailRows(rows, 9, 20),
    {
      items: [41, 42, 43, 44, 45],
      safePage: 3,
      totalPages: 3,
      pageSize: 20,
    },
  )
})
