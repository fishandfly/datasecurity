import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'

const SecurityDashboardPage = lazy(async () => ({ default: (await import('../../pages/security-dashboard-page')).SecurityDashboardPage }))
const SecurityDataLabelsPage = lazy(async () => ({ default: (await import('../../pages/security-data-labels-page')).SecurityDataLabelsPage }))
const SecuritySourceConfigPage = lazy(async () => ({ default: (await import('../../pages/security-source-config-page')).SecuritySourceConfigPage }))
const SecurityAccessRuleConfigPage = lazy(async () => ({ default: (await import('../../pages/security-access-rule-config-page')).SecurityAccessRuleConfigPage }))
const SecurityHomomorphicLogsPage = lazy(async () => ({ default: (await import('../../pages/security-homomorphic-logs-page')).SecurityHomomorphicLogsPage }))
const SecurityGovernancePage = lazy(async () => ({ default: (await import('../../pages/security-governance-page')).SecurityGovernancePage }))
const SecurityGovernanceDetailPage = lazy(async () => ({ default: (await import('../../pages/security-governance-detail-page')).SecurityGovernanceDetailPage }))
const SecurityTagRulesPage = lazy(async () => ({ default: (await import('../../pages/security-v3-pages')).SecurityTagRulesPage }))
const SecurityIngestLogsPage = lazy(async () => ({ default: (await import('../../pages/security-v3-pages')).SecurityIngestLogsPage }))
const SecurityTagResultsPage = lazy(async () => ({ default: (await import('../../pages/security-v3-pages')).SecurityTagResultsPage }))
const SecurityAccessSubjectsPage = lazy(async () => ({ default: (await import('../../pages/security-v3-pages')).SecurityAccessSubjectsPage }))
const SecurityBehaviorBaselinesPage = lazy(async () => ({ default: (await import('../../pages/security-v3-pages')).SecurityBehaviorBaselinesPage }))
const SecurityPolicyPublishPage = lazy(async () => ({ default: (await import('../../pages/security-v3-pages')).SecurityPolicyPublishPage }))
const SecurityDecisionAuditPage = lazy(async () => ({ default: (await import('../../pages/security-v3-pages')).SecurityDecisionAuditPage }))
const SecurityRiskEventsPage = lazy(async () => ({ default: (await import('../../pages/security-v3-pages')).SecurityRiskEventsPage }))
const SecurityCryptoKeysPage = lazy(async () => ({ default: (await import('../../pages/security-v3-pages')).SecurityCryptoKeysPage }))
const SecurityHomomorphicTasksPage = lazy(async () => ({ default: (await import('../../pages/security-v3-pages')).SecurityHomomorphicTasksPage }))
const SecurityHomomorphicResultsPage = lazy(async () => ({ default: (await import('../../pages/security-v3-pages')).SecurityHomomorphicResultsPage }))

export function SecurityGovernanceRoutes() {
  return (
    <>
      <Route path="/security-governance" element={<Navigate to="/security-governance/dashboard" replace />} />
      <Route path="/security-governance/dashboard" element={<SecurityDashboardPage />} />

      <Route path="/security-governance/resources" element={<Navigate to="/security-governance/resources/catalog" replace />} />
      <Route path="/security-governance/resources/catalog" element={<SecurityGovernancePage />} />
      <Route path="/security-governance/resources/fields" element={<Navigate to="/security-governance/resources/catalog" replace />} />
      <Route path="/security-governance/resources/tags" element={<Navigate to="/security-governance/tags/catalog" replace />} />
      <Route path="/security-governance/resources/apis" element={<Navigate to="/security-governance/resources/catalog" replace />} />
      <Route path="/security-governance/resources/:id" element={<SecurityGovernanceDetailPage />} />

      <Route path="/security-governance/ingest" element={<Navigate to="/security-governance/ingest/sources" replace />} />
      <Route path="/security-governance/ingest/sources" element={<SecuritySourceConfigPage />} />
      <Route path="/security-governance/ingest/validation-rules" element={<SecurityAccessRuleConfigPage />} />
      <Route path="/security-governance/ingest/tag-rules" element={<Navigate to="/security-governance/tags/rules" replace />} />
      <Route path="/security-governance/ingest/logs" element={<SecurityIngestLogsPage />} />
      <Route path="/security-governance/ingest/tag-results" element={<Navigate to="/security-governance/tags/records" replace />} />

      <Route path="/security-governance/tags" element={<Navigate to="/security-governance/tags/catalog" replace />} />
      <Route path="/security-governance/tags/catalog" element={<SecurityDataLabelsPage />} />
      <Route path="/security-governance/tags/rules" element={<SecurityTagRulesPage />} />
      <Route path="/security-governance/tags/records" element={<SecurityTagResultsPage />} />

      <Route path="/security-governance/access" element={<Navigate to="/security-governance/access/subjects" replace />} />
      <Route path="/security-governance/access/subjects" element={<SecurityAccessSubjectsPage />} />
      <Route path="/security-governance/access/policies" element={<Navigate to="/security-governance/access/publish" replace />} />
      <Route path="/security-governance/access/baselines" element={<SecurityBehaviorBaselinesPage />} />
      <Route path="/security-governance/access/publish" element={<SecurityPolicyPublishPage />} />
      <Route path="/security-governance/access/audit" element={<SecurityDecisionAuditPage />} />

      <Route path="/security-governance/risks" element={<Navigate to="/security-governance/risks/events" replace />} />
      <Route path="/security-governance/risks/events" element={<SecurityRiskEventsPage />} />

      <Route path="/security-governance/homomorphic" element={<Navigate to="/security-governance/homomorphic/tasks" replace />} />
      <Route path="/security-governance/homomorphic/keys" element={<SecurityCryptoKeysPage />} />
      <Route path="/security-governance/homomorphic/tasks" element={<SecurityHomomorphicTasksPage />} />
      <Route path="/security-governance/homomorphic/results" element={<SecurityHomomorphicResultsPage />} />
      <Route path="/security-governance/homomorphic/logs" element={<SecurityHomomorphicLogsPage />} />

      <Route path="/security-governance/data-access/*" element={<Navigate to="/security-governance/ingest/sources" replace />} />
      <Route path="/security-governance/access-control/classification" element={<Navigate to="/security-governance/tags/catalog" replace />} />
      <Route path="/security-governance/access-control/policy-engine" element={<Navigate to="/security-governance/access/publish" replace />} />
      <Route path="/security-governance/access-control/*" element={<Navigate to="/security-governance/access/subjects" replace />} />
      <Route path="/security-governance/audit/*" element={<Navigate to="/security-governance/access/audit" replace />} />
      <Route path="/security-governance/homomorphic-encryption/logs" element={<Navigate to="/security-governance/homomorphic/logs" replace />} />
      <Route path="/security-governance/homomorphic-encryption/*" element={<Navigate to="/security-governance/homomorphic/tasks" replace />} />
      <Route path="/security-governance/homomorphic-logs" element={<Navigate to="/security-governance/homomorphic/logs" replace />} />
      <Route path="/security-governance/confidential-computing" element={<Navigate to="/security-governance/homomorphic/tasks" replace />} />
      <Route path="/security-governance/source-config" element={<Navigate to="/security-governance/ingest/sources" replace />} />
      <Route path="/security-governance/data-labels" element={<Navigate to="/security-governance/tags/catalog" replace />} />
      <Route path="/security-governance/policy-engine" element={<Navigate to="/security-governance/access/publish" replace />} />
      <Route path="/security-governance/log-query" element={<Navigate to="/security-governance/access/audit" replace />} />
      <Route path="/security-governance/trace" element={<Navigate to="/security-governance/access/audit" replace />} />
      <Route path="/security-governance/config/*" element={<Navigate to="/security-governance/dashboard" replace />} />
    </>
  )
}
