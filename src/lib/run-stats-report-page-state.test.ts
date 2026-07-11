import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRunStatsReportSelectionSearch,
  resolveRunStatsReportFilters,
  shouldAutoQueryRunStatsReportList,
  shouldApplyPreferredRunStatsReportFilters,
} from './run-stats-report-page-state.ts'

test('resolveRunStatsReportFilters prefers query execution date and task code', () => {
  assert.deepEqual(
    resolveRunStatsReportFilters({
      queryExecutionDate: '2026-04-29',
      queryTaskCode: 'dw30',
      defaultExecutionDate: '2026-04-30',
    }),
    {
      selectedExecutionDate: '2026-04-29',
      selectedTaskCode: 'dw30',
    },
  )
})

test('resolveRunStatsReportFilters falls back to current date when query execution date is missing', () => {
  assert.deepEqual(
    resolveRunStatsReportFilters({
      queryExecutionDate: '',
      queryTaskCode: '',
      defaultExecutionDate: '2026-04-30',
    }),
    {
      selectedExecutionDate: '2026-04-30',
      selectedTaskCode: '',
    },
  )
})

test('shouldApplyPreferredRunStatsReportFilters returns true when current selection is empty', () => {
  assert.equal(
    shouldApplyPreferredRunStatsReportFilters({
      queryPeriod: '',
      selectedExecutionDate: '',
      selectedTaskCode: '',
    }),
    true,
  )
})

test('shouldApplyPreferredRunStatsReportFilters returns false after user changes date', () => {
  assert.equal(
    shouldApplyPreferredRunStatsReportFilters({
      queryPeriod: '',
      selectedExecutionDate: '2026-05-01',
      selectedTaskCode: 'dw1d',
    }),
    false,
  )
})

test('shouldAutoQueryRunStatsReportList returns true after the user selects a task for the chosen date', () => {
  assert.equal(
    shouldAutoQueryRunStatsReportList({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: 'dw30',
      queriedExecutionDate: '',
      queriedTaskCode: '',
      isExecutionDateLoadingWithTask: false,
      isSubmittingQuery: false,
      queryPeriod: '',
      hasSyncedQueryPeriod: true,
    }),
    true,
  )
})

test('shouldAutoQueryRunStatsReportList returns false when the current selection was already queried', () => {
  assert.equal(
    shouldAutoQueryRunStatsReportList({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: 'dw30',
      queriedExecutionDate: '2026-05-02',
      queriedTaskCode: 'dw30',
      isExecutionDateLoadingWithTask: false,
      isSubmittingQuery: false,
      queryPeriod: '',
      hasSyncedQueryPeriod: true,
    }),
    false,
  )
})

test('shouldAutoQueryRunStatsReportList returns false while a query-period deep link is still syncing', () => {
  assert.equal(
    shouldAutoQueryRunStatsReportList({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: 'dw30',
      queriedExecutionDate: '',
      queriedTaskCode: '',
      isExecutionDateLoadingWithTask: false,
      isSubmittingQuery: false,
      queryPeriod: '20260502_1023',
      hasSyncedQueryPeriod: false,
    }),
    false,
  )
})

test('buildRunStatsReportSelectionSearch persists execution date and task code while clearing stale period', () => {
  assert.equal(
    buildRunStatsReportSelectionSearch({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: 'dw30',
    }),
    'executionDate=2026-05-02&taskCode=dw30',
  )
})

test('buildRunStatsReportSelectionSearch keeps only execution date when task is reset', () => {
  assert.equal(
    buildRunStatsReportSelectionSearch({
      selectedExecutionDate: '2026-05-02',
      selectedTaskCode: '',
    }),
    'executionDate=2026-05-02',
  )
})
