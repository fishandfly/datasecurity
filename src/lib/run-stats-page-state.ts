export type RunStatsReportCenterPathInput = {
  withEmbed: (path: string) => string
  selectedExecutionDate: string
  selectedTaskCode: string
  selectedPeriod: string
  queriedExecutionDate: string
  queriedTaskCode: string
  queriedPeriod: string
}

export type RunStatsQueryControlStateInput = {
  selectedExecutionDate: string
  selectedTaskCode: string
  selectedPeriod: string
  taskOptionCount: number
  jobOptionCount: number
  isTaskLoading: boolean
  isJobLoading: boolean
  isSubmittingQuery: boolean
}

export type PreferredRunStatsJobSelectionInput = {
  selectedExecutionDate: string
  selectedTaskCode: string
  queriedExecutionDate: string
  queriedTaskCode: string
  queriedPeriod: string
  jobOptions: Array<{ periodCode: string }>
}

export type RunStatsPendingQueryChangesInput = {
  selectedExecutionDate: string
  selectedTaskCode: string
  selectedPeriod: string
  queriedExecutionDate: string
  queriedTaskCode: string
  queriedPeriod: string
}

export type RunStatsTaskSelectionResetInput = {
  selectedTaskCode: string
  taskOptions: Array<{ taskCode: string }>
  isTaskCatalogLoading: boolean
}

export type RunStatsJobOptionsLoadInput = {
  selectedExecutionDate: string
  selectedTaskCode: string
}

export type RunStatsDetailRowsPaginationResult<T> = {
  items: T[]
  safePage: number
  totalPages: number
  pageSize: number
}

export function resolveRunStatsQueryControlState(input: RunStatsQueryControlStateInput) {
  const hasExecutionDate = Boolean(input.selectedExecutionDate)
  const hasTask = Boolean(input.selectedTaskCode)
  const hasJob = Boolean(input.selectedPeriod)
  const busy = input.isSubmittingQuery

  return {
    taskEnabled: hasExecutionDate && !input.isTaskLoading && !busy && input.taskOptionCount > 0,
    jobEnabled: hasExecutionDate && hasTask && !input.isTaskLoading && !input.isJobLoading && !busy && input.jobOptionCount > 0,
    queryEnabled: hasExecutionDate && hasTask && hasJob && !input.isTaskLoading && !input.isJobLoading && !busy,
  }
}

export function resolvePreferredRunStatsJobSelection(input: PreferredRunStatsJobSelectionInput) {
  const normalizedOptions = input.jobOptions
    .map((item) => String(item.periodCode ?? '').trim())
    .filter(Boolean)
  if (normalizedOptions.length === 0) return ''

  const canReuseQueriedPeriod = Boolean(
    input.selectedExecutionDate
    && input.selectedTaskCode
    && input.selectedExecutionDate === input.queriedExecutionDate
    && input.selectedTaskCode === input.queriedTaskCode
    && input.queriedPeriod
    && normalizedOptions.includes(input.queriedPeriod),
  )

  if (canReuseQueriedPeriod) {
    return input.queriedPeriod
  }

  return normalizedOptions[0] ?? ''
}

export function hasRunStatsPendingQueryChanges(input: RunStatsPendingQueryChangesInput) {
  const hasQueriedFilters = Boolean(input.queriedExecutionDate && input.queriedTaskCode)
  if (!hasQueriedFilters) return false

  return (
    input.selectedExecutionDate !== input.queriedExecutionDate
    || input.selectedTaskCode !== input.queriedTaskCode
    || input.selectedPeriod !== input.queriedPeriod
  )
}

export function buildRunStatsReportCenterPath(input: RunStatsReportCenterPathInput) {
  const params = new URLSearchParams()
  const executionDate = input.selectedExecutionDate || input.queriedExecutionDate
  const taskCode = input.selectedTaskCode || input.queriedTaskCode
  const keepCurrentPeriod = Boolean(
    input.selectedExecutionDate
    && input.selectedTaskCode
    && input.selectedPeriod
    && input.selectedExecutionDate === input.queriedExecutionDate
    && input.selectedTaskCode === input.queriedTaskCode
    && input.selectedPeriod === input.queriedPeriod
  )

  if (executionDate) {
    params.set('executionDate', executionDate)
  }
  if (taskCode) {
    params.set('taskCode', taskCode)
  }
  if (keepCurrentPeriod) {
    params.set('period', input.selectedPeriod)
  }

  const query = params.toString()
  return input.withEmbed(`/run-stats/report${query ? `?${query}` : ''}`)
}

export function shouldResetRunStatsTaskSelection(input: RunStatsTaskSelectionResetInput) {
  if (!input.selectedTaskCode) return false
  if (input.isTaskCatalogLoading) return false
  return !input.taskOptions.some((option) => option.taskCode === input.selectedTaskCode)
}

export function shouldLoadRunStatsJobOptions(input: RunStatsJobOptionsLoadInput) {
  return Boolean(input.selectedExecutionDate && input.selectedTaskCode)
}

export function paginateRunStatsDetailRows<T>(
  rows: T[],
  currentPage: number,
  pageSize: number,
): RunStatsDetailRowsPaginationResult<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize) || 1)
  const totalPages = Math.max(1, Math.ceil(rows.length / safePageSize))
  const safePage = Math.min(Math.max(1, Math.floor(currentPage) || 1), totalPages)
  const start = (safePage - 1) * safePageSize

  return {
    items: rows.slice(start, start + safePageSize),
    safePage,
    totalPages,
    pageSize: safePageSize,
  }
}
