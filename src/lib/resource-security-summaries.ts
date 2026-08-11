import { useCallback, useEffect, useMemo, useState } from 'react'
import { toErrorMessage } from './nocobase-client'
import { listSecurityV3Records, type SecurityV3Record } from './nocobase-security-v3'

export type ResourceSecuritySummary = {
  apiCount: number
  publishedApiCount: number
  sourceCount: number
  connectedSourceCount: number
  ingestCheckCount: number
  ingestFailureCount: number
  accessPolicyCount: number
  publishedPolicyCount: number
  accessRequestCount: number
  deniedRequestCount: number
  homomorphicTaskCount: number
  completedHomomorphicTaskCount: number
  failedHomomorphicTaskCount: number
  warningCount: number
}

const EMPTY_SUMMARY: ResourceSecuritySummary = {
  apiCount: 0,
  publishedApiCount: 0,
  sourceCount: 0,
  connectedSourceCount: 0,
  ingestCheckCount: 0,
  ingestFailureCount: 0,
  accessPolicyCount: 0,
  publishedPolicyCount: 0,
  accessRequestCount: 0,
  deniedRequestCount: 0,
  homomorphicTaskCount: 0,
  completedHomomorphicTaskCount: 0,
  failedHomomorphicTaskCount: 0,
  warningCount: 0,
}

let summaryCache: Map<string, ResourceSecuritySummary> | null = null
let summaryPromise: Promise<Map<string, ResourceSecuritySummary>> | null = null

function id(value: unknown) {
  return value == null ? '' : String(value).trim()
}

function countMatching(records: SecurityV3Record[], predicate: (record: SecurityV3Record) => boolean) {
  return records.reduce((count, record) => count + (predicate(record) ? 1 : 0), 0)
}

export function buildResourceSecuritySummaries({
  resources,
  apis,
  sources,
  ingestLogs,
  accessPolicies,
  decisions,
  homomorphicTasks,
}: {
  resources: SecurityV3Record[]
  apis: SecurityV3Record[]
  sources: SecurityV3Record[]
  ingestLogs: SecurityV3Record[]
  accessPolicies: SecurityV3Record[]
  decisions: SecurityV3Record[]
  homomorphicTasks: SecurityV3Record[]
}) {
  return new Map(resources.map((resource) => {
    const resourceId = id(resource.id)
    const resourceApis = apis.filter((record) => id(record.resource_id) === resourceId)
    const apiIds = new Set(resourceApis.map((record) => id(record.id)).filter(Boolean))
    const sourceIds = new Set([
      id(resource.data_source_id),
      ...resourceApis.map((record) => id(record.data_source_id)),
    ].filter(Boolean))
    const resourceSources = sources.filter((record) => sourceIds.has(id(record.id)) && record.connection_status !== 'disabled')
    const resourceIngestLogs = ingestLogs.filter((record) => sourceIds.has(id(record.data_source_id)) || apiIds.has(id(record.api_resource_id)))
    const resourcePolicies = accessPolicies.filter((record) => (
      id(record.resource_id) === resourceId || apiIds.has(id(record.api_resource_id))
    ) && record.policy_kind === 'access_policy')
    const resourceDecisions = decisions.filter((record) => apiIds.has(id(record.api_resource_id)))
    const resourceTasks = homomorphicTasks.filter((record) => apiIds.has(id(record.api_resource_id)) && record.task_status !== 'archived')
    const ingestFailureCount = countMatching(resourceIngestLogs, (record) => ['failed', 'partial'].includes(String(record.result_status)))
    const failedHomomorphicTaskCount = countMatching(resourceTasks, (record) => record.task_status === 'failed')
    const exceptionSourceCount = countMatching(resourceSources, (record) => record.connection_status === 'exception')

    return [resourceId, {
      apiCount: resourceApis.length,
      publishedApiCount: countMatching(resourceApis, (record) => record.publish_status === 'success'),
      sourceCount: resourceSources.length,
      connectedSourceCount: countMatching(resourceSources, (record) => record.connection_status === 'connected'),
      ingestCheckCount: resourceIngestLogs.length,
      ingestFailureCount,
      accessPolicyCount: resourcePolicies.length,
      publishedPolicyCount: countMatching(resourcePolicies, (record) => record.publish_status === 'success'),
      accessRequestCount: resourceDecisions.length,
      deniedRequestCount: countMatching(resourceDecisions, (record) => ['deny', 'denied', '拒绝'].includes(String(record.decision_result))),
      homomorphicTaskCount: resourceTasks.length,
      completedHomomorphicTaskCount: countMatching(resourceTasks, (record) => ['success', 'completed'].includes(String(record.task_status))),
      failedHomomorphicTaskCount,
      warningCount: ingestFailureCount + failedHomomorphicTaskCount + exceptionSourceCount + countMatching(resourceDecisions, (record) => ['deny', 'denied', '拒绝'].includes(String(record.decision_result))),
    } satisfies ResourceSecuritySummary] as const
  }))
}

async function loadResourceSecuritySummaries() {
  if (summaryCache) return summaryCache
  if (summaryPromise) return summaryPromise

  summaryPromise = Promise.all([
    listSecurityV3Records('eco_data_resources'),
    listSecurityV3Records('security_api_resources'),
    listSecurityV3Records('security_data_sources'),
    listSecurityV3Records('security_ingest_logs'),
    listSecurityV3Records('eco_resource_security_policies'),
    listSecurityV3Records('security_policy_decision_logs'),
    listSecurityV3Records('security_confidential_tasks'),
  ]).then(([resources, apis, sources, ingestLogs, accessPolicies, decisions, homomorphicTasks]) => {
    summaryCache = buildResourceSecuritySummaries({ resources, apis, sources, ingestLogs, accessPolicies, decisions, homomorphicTasks })
    return summaryCache
  }).finally(() => {
    summaryPromise = null
  })

  return summaryPromise
}

export function useResourceSecuritySummaries(enabled = true) {
  const [data, setData] = useState<Map<string, ResourceSecuritySummary>>(() => summaryCache ?? new Map())
  const [isLoading, setIsLoading] = useState(enabled && !summaryCache)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!enabled) return
    setIsLoading(true)
    setError('')
    try {
      setData(await loadResourceSecuritySummaries())
    } catch (currentError) {
      setError(toErrorMessage(currentError, '加载资源安全运行统计失败'))
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return useMemo(() => ({
    data,
    emptySummary: EMPTY_SUMMARY,
    isLoading,
    error,
    refresh,
  }), [data, error, isLoading, refresh])
}
