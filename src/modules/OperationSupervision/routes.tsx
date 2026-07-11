import { lazy } from 'react'
import { Route } from 'react-router-dom'
import { EmbedAwareNavigate } from '../../lib/embed-aware-navigate'

const OperationsPage = lazy(async () => ({ default: (await import('../../pages/operations-page')).OperationsPage }))
const RunStatsPage = lazy(async () => ({ default: (await import('../../pages/run-stats-page')).RunStatsPage }))
const RunStatsReportPage = lazy(async () => ({ default: (await import('../../pages/run-stats-report-page')).RunStatsReportPage }))

export function OperationSupervisionRoutes() {
  return (
    <>
      <Route path="/run-stats" element={<RunStatsPage />} />
      <Route path="/run-stats/report" element={<RunStatsReportPage />} />
      <Route path="/run-stats/operations" element={<OperationsPage />} />
      <Route path="/operations" element={<EmbedAwareNavigate to="/run-stats/operations" />} />
    </>
  )
}
