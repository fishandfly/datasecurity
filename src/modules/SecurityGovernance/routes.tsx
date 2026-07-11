import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'

const SecurityDashboardPage = lazy(async () => ({ default: (await import('../../pages/security-dashboard-page')).SecurityDashboardPage }))
const SecurityDataLabelsPage = lazy(async () => ({ default: (await import('../../pages/security-data-labels-page')).SecurityDataLabelsPage }))
const SecuritySourceConfigPage = lazy(async () => ({ default: (await import('../../pages/security-source-config-page')).SecuritySourceConfigPage }))
const SecurityAccessRuleConfigPage = lazy(async () => ({ default: (await import('../../pages/security-access-rule-config-page')).SecurityAccessRuleConfigPage }))
const SecurityAccessMonitoringPage = lazy(async () => ({ default: (await import('../../pages/security-access-monitoring-page')).SecurityAccessMonitoringPage }))
const SecurityLogQueryPage = lazy(async () => ({ default: (await import('../../pages/security-log-query-page')).SecurityLogQueryPage }))
const SecurityPolicyEnginePage = lazy(async () => ({ default: (await import('../../pages/security-policy-engine-page')).SecurityPolicyEnginePage }))
const SecurityConfidentialComputingPage = lazy(async () => ({ default: (await import('../../pages/security-confidential-computing-page')).SecurityConfidentialComputingPage }))
const SecurityHomomorphicLogsPage = lazy(async () => ({ default: (await import('../../pages/security-homomorphic-logs-page')).SecurityHomomorphicLogsPage }))
const SecurityGovernancePage = lazy(async () => ({ default: (await import('../../pages/security-governance-page')).SecurityGovernancePage }))
const SecurityGovernanceDetailPage = lazy(async () => ({ default: (await import('../../pages/security-governance-detail-page')).SecurityGovernanceDetailPage }))

export function SecurityGovernanceRoutes() {
  return (
    <>
      <Route path="/security-governance" element={<Navigate to="/security-governance/dashboard" replace />} />
      <Route path="/security-governance/dashboard" element={<SecurityDashboardPage />} />
      <Route path="/security-governance/data-access" element={<Navigate to="/security-governance/data-access/source-config" replace />} />
      <Route path="/security-governance/data-access/source-config" element={<SecuritySourceConfigPage />} />
      <Route path="/security-governance/data-access/rule-config" element={<SecurityAccessRuleConfigPage />} />
      <Route path="/security-governance/data-access/monitoring" element={<SecurityAccessMonitoringPage />} />
      <Route path="/security-governance/access-control" element={<Navigate to="/security-governance/access-control/classification" replace />} />
      <Route path="/security-governance/access-control/classification" element={<SecurityDataLabelsPage />} />
      <Route path="/security-governance/access-control/policy-engine" element={<SecurityPolicyEnginePage />} />
      <Route path="/security-governance/access-control/role-permission" element={<Navigate to="/security-governance/access-control/policy-engine" replace />} />
      <Route path="/security-governance/access-control/approval" element={<Navigate to="/security-governance/access-control/policy-engine" replace />} />
      <Route path="/security-governance/access-control/confidential-computing" element={<Navigate to="/security-governance/homomorphic-encryption" replace />} />
      <Route path="/security-governance/homomorphic-encryption" element={<SecurityConfidentialComputingPage />} />
      <Route path="/security-governance/homomorphic-encryption/engine" element={<Navigate to="/security-governance/homomorphic-encryption" replace />} />
      <Route path="/security-governance/homomorphic-encryption/logs" element={<SecurityHomomorphicLogsPage />} />
      <Route path="/security-governance/homomorphic-engine" element={<Navigate to="/security-governance/homomorphic-encryption" replace />} />
      <Route path="/security-governance/homomorphic-logs" element={<Navigate to="/security-governance/homomorphic-encryption/logs" replace />} />
      <Route path="/security-governance/confidential-computing" element={<Navigate to="/security-governance/homomorphic-encryption" replace />} />
      <Route path="/security-governance/audit" element={<Navigate to="/security-governance/audit/log-query" replace />} />
      <Route path="/security-governance/audit/log-query" element={<SecurityLogQueryPage />} />
      <Route path="/security-governance/audit/trace" element={<Navigate to="/security-governance/audit/log-query" replace />} />
      <Route path="/security-governance/audit/report" element={<Navigate to="/security-governance/audit/log-query" replace />} />
      <Route path="/security-governance/config" element={<Navigate to="/security-governance/access-control/classification" replace />} />
      <Route path="/security-governance/config/data-labels" element={<Navigate to="/security-governance/access-control/classification" replace />} />
      <Route path="/security-governance/config/system-params" element={<Navigate to="/security-governance/dashboard" replace />} />
      <Route path="/security-governance/config/version" element={<Navigate to="/security-governance/dashboard" replace />} />
      <Route path="/security-governance/source-config" element={<Navigate to="/security-governance/data-access/source-config" replace />} />
      <Route path="/security-governance/data-labels" element={<Navigate to="/security-governance/access-control/classification" replace />} />
      <Route path="/security-governance/policy-engine" element={<Navigate to="/security-governance/access-control/policy-engine" replace />} />
      <Route path="/security-governance/confidential" element={<Navigate to="/security-governance/homomorphic-encryption" replace />} />
      <Route path="/security-governance/trace" element={<Navigate to="/security-governance/audit/log-query" replace />} />
      <Route path="/security-governance/log-query" element={<Navigate to="/security-governance/audit/log-query" replace />} />
      <Route path="/security-governance/resources" element={<SecurityGovernancePage />} />
      <Route path="/security-governance/:id" element={<SecurityGovernanceDetailPage />} />
    </>
  )
}
