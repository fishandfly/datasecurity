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

export async function publishSecurityPolicy(id: string) {
  const response = await runtimeRequest<RuntimeResponse<{ policyVersion: number }>>(
    `/management/policies/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
  )
  return response.data
}
