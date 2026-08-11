import {
  listSecurityV3Records,
  sanitizeSecurityVisibleText,
  type SecurityV3Record,
} from './nocobase-security-v3'
import { groupSecurityLabels } from './security-label-hierarchy'

export type SecurityEngineLogStatus = 'success' | 'warning' | 'failed'

export type SecurityEngineLog = {
  id: string
  time: string
  code: string
  title: string
  status: SecurityEngineLogStatus
  message: string
  dataSource: string
  dataResource: string
  subject: string
  api: string
  requestId: string
  durationMs: number | null
  riskScore: number
  trace: Array<{
    name: string
    status: string
    outcome: string
    matchedLabels: string[]
    fieldTags: string[]
    protectionLevel: string
    sensitivity: string
    policyCode: string
    policyVersion: string
    outputMode: string
  }>
  policyEvaluations: Array<{ policyCode: string; result: string; reason: string }>
  labelGroups: Array<{ name: string; labels: string[] }>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function safeText(value: unknown, fallback = '-') {
  const normalized = sanitizeSecurityVisibleText(value).trim()
  return normalized || fallback
}

function numberOrNull(value: unknown) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : null
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return asRecord(JSON.parse(value)) } catch { return {} }
  }
  return asRecord(value)
}

function buildAccessLogs(records: SecurityV3Record[]): SecurityEngineLog[] {
  return records.filter((record) => {
    const evidence = parseJson(record.applied_limits_json)
    return Array.isArray(evidence.runtimeTrace) && asRecord(evidence.accessPath).dataSource && asRecord(evidence.accessPath).dataResource && asRecord(evidence.accessPath).dataApplication
  }).map((record) => {
    const subject = asRecord(record.subject)
    const api = asRecord(record.api_resource)
    const evidence = parseJson(record.applied_limits_json)
    const accessPath = asRecord(evidence.accessPath)
    const source = asRecord(accessPath.dataSource)
    const resource = asRecord(accessPath.dataResource)
    const trace = Array.isArray(evidence.runtimeTrace)
      ? evidence.runtimeTrace.map((item) => {
          const step = asRecord(item)
          const fieldTags = asRecord(step.fieldTags)
          return {
            name: safeText(step.name, '运行阶段'),
            status: safeText(step.status, '未知'),
            outcome: safeText(step.outcome, ''),
            matchedLabels: Array.isArray(step.matchedLabels) ? step.matchedLabels.map((label) => safeText(label)).filter(Boolean) : [],
            fieldTags: Object.entries(fieldTags).flatMap(([field, tags]) => {
              const values = Array.isArray(tags) ? tags.map((tag) => safeText(tag)).filter(Boolean) : []
              return values.length ? [`${safeText(field)}：${values.join('、')}`] : []
            }),
            protectionLevel: safeText(step.protectionLevel, ''),
            sensitivity: safeText(step.sensitivity, ''),
            policyCode: safeText(step.policyCode, ''),
            policyVersion: step.policyVersion == null ? '' : safeText(step.policyVersion, ''),
            outputMode: safeText(step.outputMode, ''),
          }
        })
      : []
    const policyEvaluations = Array.isArray(evidence.policyEvaluations)
      ? evidence.policyEvaluations.map((item) => {
          const evaluation = asRecord(item)
          return {
            policyCode: safeText(evaluation.policyCode || evaluation.policy_code, '运行规则'),
            result: safeText(evaluation.result, 'unknown'),
            reason: safeText(evaluation.reason, ''),
          }
        })
      : []
    const denied = record.decision_result === 'deny' || record.decision_result === 'denied'
    const riskScore = Number(record.risk_score || 0)
    const outputMode = safeText(record.effective_output_mode || record.requested_output_mode, 'detail')
    return {
      id: `access-${record.id}`,
      time: String(record.requested_at || record.createdAt || ''),
      code: safeText(record.request_id),
      title: denied ? '数据 API 访问拒绝' : '数据 API 访问放行',
      status: denied ? 'failed' : riskScore > 0 ? 'warning' : 'success',
      message: safeText(record.decision_reason, denied ? '请求未通过动态策略' : `请求已放行，输出方式：${outputMode}`),
      dataSource: safeText(source.name || source.source_name),
      dataResource: safeText(resource.name || resource.resource_name || api.resource_name),
      subject: safeText(subject.subject_name),
      api: safeText(api.api_name),
      requestId: safeText(record.request_id, ''),
      durationMs: numberOrNull(record.duration_ms),
      riskScore,
      trace,
      policyEvaluations,
      labelGroups: groupSecurityLabels(trace.find((step) => step.name === '标签补全')?.matchedLabels || []),
    }
  })
}

export async function loadSecurityEngineLogs() {
  const records = await listSecurityV3Records('security_policy_decision_logs', {
    appends: ['subject', 'api_resource'],
    sort: ['-requested_at'],
  })
  return buildAccessLogs(records)
}
