import { NOCOBASE_AUTHENTICATOR, nocobaseClient } from './nocobase-client'

export type SecurityRuntimeHealth = {
  status: 'ok' | 'degraded'
  checkedAt: string
  services: {
    configuration: 'ok' | 'unavailable'
    dataAccess: 'ok' | 'unavailable'
    policyControl: 'ok' | 'unavailable'
    homomorphicComputation: 'ok' | 'unavailable'
  }
  configuration: {
    sources: number
    apis: number
    policies: number
    subjects: number
    calls: number
    risks: number
  }
}

export type DataSourceTestResult = {
  sourceId: number
  status: 'connected' | 'exception'
  checkedAt: string
  latencyMs: number | null
  message: string
}

export type ResourceLatestRows = {
  resourceId: number
  tableName: string
  orderField: string
  limit: number
  candidateCount: number
  sampleCount: number
  passedCount: number
  rejectedCount: number
  samplingEnabled: boolean
  samplingRate: number
  integrityEnabled: boolean
  checksumAlgorithm: string
  validationRule: {
    requiredFields: string[]
    numericRanges: Record<string, unknown>
    duplicateKeys: string[]
  }
  columns: Array<{ code: string; name: string; dataType: string }>
  rows: Array<Record<string, unknown>>
  validationResults: Array<{ passed: boolean; issues: string[] }>
}

export type BehaviorBaselineInput = {
  sample_from: string
  sample_to: string
  sample_count: number
  frequency_avg: number
  frequency_stddev: number
  query_days_avg: number
  query_days_stddev: number
  rows_avg: number
  rows_stddev: number
  failure_avg: number
  baseline_status: 'draft' | 'enabled' | 'disabled'
}

type RuntimeResponse<T> = { data: T }

async function runtimeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = nocobaseClient.auth.token
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('X-Authenticator', NOCOBASE_AUTHENTICATOR)
  }
  const response = await fetch(`/security-runtime-api${path}`, { ...init, headers })
  const payload = await response.json().catch(() => null) as { message?: string } | null
  if (!response.ok) {
    throw new Error(payload?.message || `运行服务请求失败（HTTP ${response.status}）`)
  }
  return payload as T
}

export function fetchSecurityRuntimeHealth() {
  return runtimeRequest<SecurityRuntimeHealth>('/health')
}

export async function testSecurityDataSource(id: string) {
  const response = await runtimeRequest<RuntimeResponse<DataSourceTestResult>>(
    `/management/data-sources/${encodeURIComponent(id)}/test`,
    { method: 'POST' },
  )
  return response.data
}

export async function publishSecurityApi(id: string) {
  const response = await runtimeRequest<RuntimeResponse<{ publishVersion: number }>>(
    `/management/apis/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
  )
  return response.data
}

export async function ensureDefaultSecurityApi(resourceId: string) {
  const response = await runtimeRequest<RuntimeResponse<{ id: number; created: boolean; publishStatus: string }>>(
    `/management/resources/${encodeURIComponent(resourceId)}/default-api`,
    { method: 'POST' },
  )
  return response.data
}

export async function fetchResourceLatestRows(resourceId: string) {
  const response = await runtimeRequest<RuntimeResponse<ResourceLatestRows>>(
    `/management/resources/${encodeURIComponent(resourceId)}/latest-rows`,
  )
  return response.data
}

export async function unpublishSecurityApi(id: string) {
  const response = await runtimeRequest<RuntimeResponse<{ id: number; publishStatus: string; apiStatus: string }>>(
    `/management/apis/${encodeURIComponent(id)}/unpublish`,
    { method: 'POST' },
  )
  return response.data
}

export async function publishSecurityPolicy(id: string) {
  const response = await runtimeRequest<RuntimeResponse<{ policyVersion: number }>>(
    `/management/policies/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
  )
  return response.data
}

export async function saveResourceBehaviorBaseline(apiId: string, subjectId: string, values: BehaviorBaselineInput) {
  const response = await runtimeRequest<RuntimeResponse<{ id: number; baseline_code: string; baseline_version: number; baseline_status: string }>>(
    `/management/apis/${encodeURIComponent(apiId)}/subjects/${encodeURIComponent(subjectId)}/behavior-baseline`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    },
  )
  return response.data
}
