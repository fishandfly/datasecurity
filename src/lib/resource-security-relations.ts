import { useCallback, useEffect, useMemo, useState } from 'react'
import { toErrorMessage } from './nocobase-client'
import { listSecurityV3Records, type SecurityV3Record } from './nocobase-security-v3'

export type ResourceSecurityRelations = {
  apis: SecurityV3Record[]
  sources: SecurityV3Record[]
  ingestLogs: SecurityV3Record[]
  decisionLogs: SecurityV3Record[]
  accessPolicies: SecurityV3Record[]
  homomorphicTasks: SecurityV3Record[]
  homomorphicFieldCodes: Set<string>
}

const EMPTY_RELATIONS: ResourceSecurityRelations = {
  apis: [],
  sources: [],
  ingestLogs: [],
  decisionLogs: [],
  accessPolicies: [],
  homomorphicTasks: [],
  homomorphicFieldCodes: new Set(),
}

function normalizeId(value: unknown) {
  return value == null ? '' : String(value).trim()
}

function normalizeFieldCodes(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toUpperCase()).filter(Boolean)
  if (typeof value !== 'string') return []
  try {
    return normalizeFieldCodes(JSON.parse(value))
  } catch {
    return value.split(/[、,，;；]/).map((item) => item.trim().toUpperCase()).filter(Boolean)
  }
}

async function loadResourceSecurityRelations(resourceId: string): Promise<ResourceSecurityRelations> {
  const [resources, allApis, allSources, allLogs, allDecisions, allPolicies, allTasks] = await Promise.all([
    listSecurityV3Records('eco_data_resources'),
    listSecurityV3Records('security_api_resources', { appends: ['data_source'] }),
    listSecurityV3Records('security_data_sources'),
    listSecurityV3Records('security_ingest_logs', { appends: ['data_source', 'api_resource'], sort: ['-started_at'] }),
    listSecurityV3Records('security_policy_decision_logs', { sort: ['-requested_at'] }),
    listSecurityV3Records('eco_resource_security_policies', { appends: ['subject', 'api_resource'] }),
    listSecurityV3Records('security_confidential_tasks', { appends: ['api_resource'] }),
  ])

  const resource = resources.find((item) => normalizeId(item.id) === resourceId)
  const apis = allApis.filter((item) => normalizeId(item.resource_id) === resourceId)
  const apiIds = new Set(apis.map((item) => normalizeId(item.id)).filter(Boolean))
  const sourceIds = new Set([
    normalizeId(resource?.data_source_id),
    ...apis.map((item) => normalizeId(item.data_source_id)),
  ].filter(Boolean))
  const sources = allSources.filter((item) => sourceIds.has(normalizeId(item.id)))
  const accessPolicies = allPolicies.filter((item) => (
    normalizeId(item.resource_id) === resourceId
    || apiIds.has(normalizeId(item.api_resource_id))
  ) && item.policy_kind === 'access_policy')
  const homomorphicTasks = allTasks.filter((item) => apiIds.has(normalizeId(item.api_resource_id)) && item.task_status !== 'archived')
  const decisionLogs = allDecisions.filter((item) => apiIds.has(normalizeId(item.api_resource_id)))
  const ingestLogs = allLogs
    .filter((item) => sourceIds.has(normalizeId(item.data_source_id)) || apiIds.has(normalizeId(item.api_resource_id)))
    .slice(0, 10)

  return {
    apis,
    sources,
    ingestLogs,
    decisionLogs,
    accessPolicies,
    homomorphicTasks,
    homomorphicFieldCodes: new Set(homomorphicTasks.flatMap((item) => normalizeFieldCodes(item.measure_field_code))),
  }
}

export function useResourceSecurityRelations(resourceId: string | undefined, enabled = true) {
  const [data, setData] = useState<ResourceSecurityRelations>(EMPTY_RELATIONS)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!enabled || !resourceId) {
      setData(EMPTY_RELATIONS)
      setError('')
      return
    }
    setIsLoading(true)
    setError('')
    try {
      setData(await loadResourceSecurityRelations(resourceId))
    } catch (currentError) {
      setError(toErrorMessage(currentError, '加载资源关联的 API 与接入安全信息失败'))
    } finally {
      setIsLoading(false)
    }
  }, [enabled, resourceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return useMemo(() => ({ data, isLoading, error, refresh }), [data, error, isLoading, refresh])
}
