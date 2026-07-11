export type RunStatsReportFilterInput = {
  queryExecutionDate: string
  queryTaskCode: string
  defaultExecutionDate: string
}

export type PreferredRunStatsReportFilterSyncInput = {
  queryPeriod: string
  selectedExecutionDate: string
  selectedTaskCode: string
}

export type AutoQueryRunStatsReportListInput = {
  selectedExecutionDate: string
  selectedTaskCode: string
  queriedExecutionDate: string
  queriedTaskCode: string
  isExecutionDateLoadingWithTask: boolean
  isSubmittingQuery: boolean
  queryPeriod: string
  hasSyncedQueryPeriod: boolean
}

export type RunStatsReportSelectionSearchInput = {
  selectedExecutionDate: string
  selectedTaskCode: string
}

export function resolveRunStatsReportFilters(input: RunStatsReportFilterInput) {
  return {
    selectedExecutionDate: input.queryExecutionDate || input.defaultExecutionDate,
    selectedTaskCode: input.queryTaskCode,
  }
}

export function shouldApplyPreferredRunStatsReportFilters(input: PreferredRunStatsReportFilterSyncInput) {
  if (input.queryPeriod) return false
  return !input.selectedExecutionDate && !input.selectedTaskCode
}

export function shouldAutoQueryRunStatsReportList(input: AutoQueryRunStatsReportListInput) {
  if (!input.selectedExecutionDate || !input.selectedTaskCode) return false
  if (input.isExecutionDateLoadingWithTask || input.isSubmittingQuery) return false
  if (input.queryPeriod && !input.hasSyncedQueryPeriod) return false

  return !(
    input.selectedExecutionDate === input.queriedExecutionDate
    && input.selectedTaskCode === input.queriedTaskCode
  )
}

export function buildRunStatsReportSelectionSearch(input: RunStatsReportSelectionSearchInput) {
  const params = new URLSearchParams()
  const executionDate = String(input.selectedExecutionDate ?? '').trim()
  const taskCode = String(input.selectedTaskCode ?? '').trim()

  if (executionDate) {
    params.set('executionDate', executionDate)
  }
  if (taskCode) {
    params.set('taskCode', taskCode)
  }

  return params.toString()
}
