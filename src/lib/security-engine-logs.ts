import {
  listSecurityV3Records,
  sanitizeSecurityVisibleText,
  type SecurityV3Record,
} from './nocobase-security-v3'

export type SecurityEngineType = 'ingest' | 'access' | 'homomorphic' | 'streaming'
export type SecurityEngineLogStatus = 'success' | 'warning' | 'failed' | 'running'

export type SecurityEngineLog = {
  id: string
  engine: SecurityEngineType
  engineLabel: string
  time: string
  code: string
  title: string
  status: SecurityEngineLogStatus
  message: string
  resource: string
  subject: string
  requestId: string
  durationMs: number | null
  detailRows?: Array<Record<string, string>>
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

function ingestStatus(value: unknown): SecurityEngineLogStatus {
  if (value === 'failed') return 'failed'
  if (value === 'warning' || value === 'partial') return 'warning'
  if (value === 'running') return 'running'
  return 'success'
}

function ingestTitle(value: unknown) {
  const labels: Record<string, string> = {
    connection_test: '数据源连接检查',
    validation: '数据接入校验',
    validation_preview: '资源抽样校验',
    resource_delivery_validation: '资源交付校验',
    resource_delivery_error: '资源交付异常',
    tagging: '数据标签执行',
  }
  return labels[String(value || '')] || '接入引擎执行'
}

function buildIngestLogs(records: SecurityV3Record[]): SecurityEngineLog[] {
  return records.map((record) => {
    const detail = asRecord(record.result_detail_json)
    const source = asRecord(record.data_source)
    const api = asRecord(record.api_resource)
    const rejectedCount = Number(record.rejected_count || 0)
    const passedCount = Number(record.passed_count || 0)
    return {
      id: `ingest-${record.id}`,
      engine: 'ingest',
      engineLabel: '接入校验引擎',
      time: String(record.started_at || record.createdAt || ''),
      code: safeText(record.batch_code),
      title: ingestTitle(record.execution_type),
      status: ingestStatus(record.result_status),
      message: safeText(record.error_summary, `通过 ${passedCount} 条，拒绝 ${rejectedCount} 条`),
      resource: safeText(api.api_name || source.source_name),
      subject: '安全运行服务',
      requestId: safeText(detail.requestId, ''),
      durationMs: numberOrNull(record.duration_ms),
    }
  })
}

function buildAccessLogs(records: SecurityV3Record[]): SecurityEngineLog[] {
  return records.map((record) => {
    const subject = asRecord(record.subject)
    const api = asRecord(record.api_resource)
    const denied = record.decision_result === 'deny' || record.decision_result === 'denied'
    const riskScore = Number(record.risk_score || 0)
    return {
      id: `access-${record.id}`,
      engine: 'access',
      engineLabel: '访问策略引擎',
      time: String(record.requested_at || record.createdAt || ''),
      code: safeText(record.request_id),
      title: denied ? '访问策略拒绝' : '访问策略放行',
      status: denied ? 'failed' : riskScore > 0 ? 'warning' : 'success',
      message: safeText(record.decision_reason, denied ? '请求未通过访问策略校验' : '请求通过访问策略校验'),
      resource: safeText(api.api_name),
      subject: safeText(subject.subject_name),
      requestId: safeText(record.request_id, ''),
      durationMs: numberOrNull(record.duration_ms),
    }
  })
}

function homomorphicStatus(value: unknown, taskStatus: unknown): SecurityEngineLogStatus {
  if (value === 'failed') return 'failed'
  if (value === 'success') return 'success'
  if (value === 'pending' || taskStatus === 'running' || taskStatus === 'pending') return 'running'
  if (taskStatus === 'failed') return 'failed'
  return 'success'
}

function buildHomomorphicLogs(records: SecurityV3Record[]): SecurityEngineLog[] {
  return records.flatMap((record) => {
    const summary = asRecord(record.execution_summary_json)
    const events = Array.isArray(summary.events) ? summary.events : Array.isArray(summary.logs) ? summary.logs : []
    const subject = asRecord(record.subject)
    const api = asRecord(record.api_resource)
    const normalizedEvents = events.length ? events : [{
      id: `task-${record.id}`,
      time: record.updatedAt || record.createdAt,
      stage: record.task_status === 'failed' ? 'failed' : 'created',
      result: record.task_status,
      message: record.error_summary || `任务状态：${safeText(record.task_status)}`,
      requestId: summary.requestId,
      durationMs: record.duration_ms,
    }]
    return normalizedEvents.map((rawEvent, index) => {
      const event = asRecord(rawEvent)
      const stage = String(event.stage || 'created')
      const stageLabels: Record<string, string> = {
        created: '同态任务创建',
        validation: '同态范围校验',
        resource_read: '同态资源取数',
        encrypt: '同态密文准备',
        compute: '同态密文计算',
        result: '同态结果回传',
        failed: '同态引擎异常',
      }
      const requestId = event.requestId || event.request_id || summary.requestId
      return {
        id: `homomorphic-${record.id}-${event.id || index}`,
        engine: 'homomorphic' as const,
        engineLabel: '同态加密引擎',
        time: String(event.time || record.updatedAt || record.createdAt || ''),
        code: safeText(record.task_code),
        title: stageLabels[stage] || '同态任务状态更新',
        status: homomorphicStatus(event.result, record.task_status),
        message: safeText(event.message || record.error_summary, '同态任务状态已更新'),
        resource: safeText(api.api_name || asRecord(summary.resource).name),
        subject: safeText(subject.subject_name),
        requestId: safeText(requestId, ''),
        durationMs: numberOrNull(event.durationMs ?? event.duration_ms ?? record.duration_ms),
      }
    })
  })
}

function streamingStatus(value: unknown): SecurityEngineLogStatus {
  if (value === 'failed') return 'failed'
  if (value === 'running') return 'running'
  if (value === 'warning') return 'warning'
  return 'success'
}

function buildStreamingLogs(records: SecurityV3Record[]): SecurityEngineLog[] {
  return records.map((record) => {
    const detail = asRecord(record.result_detail_json)
    const processedEvents = Number(record.processed_events || 0)
    const windowCount = Number(record.window_count || 0)
    const anomalyCount = Number(record.anomaly_count || 0)
    const injectedEventCount = Number(detail.injectedEventCount || 0)
    const anomalyRatio = Number(detail.anomalyRatio ?? 0)
    const anomalyEventCodes = Array.isArray(detail.anomalyEventCodes) ? detail.anomalyEventCodes : []
    const windows = Array.isArray(detail.windows) ? detail.windows : []
    const timeRange = detail.eventTimeStart && detail.eventTimeEnd
      ? `${String(detail.eventTimeStart).slice(11, 19)}~${String(detail.eventTimeEnd).slice(11, 19)}`
      : ''
    const detailRows = windows.map((window) => {
      const row = asRecord(window)
      return {
        窗口: String(row.windowStart || '').slice(11, 19),
        区域: safeText(row.region),
        量测项: safeText(row.measureType),
        事件数: String(row.eventCount ?? 0),
        异常数: String(row.anomalyCount ?? 0),
        合计: String(row.sum ?? ''),
        均值: String(row.avg ?? ''),
      }
    })
    return {
      id: `streaming-${record.id}`,
      engine: 'streaming' as const,
      engineLabel: '流式处理引擎',
      time: String(record.started_at || record.createdAt || ''),
      code: safeText(record.run_code),
      title: `流式窗口处理（${windowCount} 个窗口）`,
      status: streamingStatus(record.status),
      message: safeText(
        record.error_summary,
        `消费 ${processedEvents} 条事件（注入 ${injectedEventCount} 条），窗口 ${windowCount} 个，异常 ${anomalyCount} 条（${(anomalyRatio * 100).toFixed(1)}%）${timeRange ? `，时段 ${timeRange}` : ''}`,
      ),
      resource: safeText(record.source_code, '配电云主站量测'),
      subject: '流式处理引擎',
      requestId: safeText(detail.requestId, ''),
      durationMs: numberOrNull(record.duration_ms),
      detailRows: detailRows.length ? detailRows : undefined,
    }
  })
}

export async function loadSecurityEngineLogs() {
  const [ingestRecords, accessRecords, homomorphicRecords, streamingRecords] = await Promise.all([
    listSecurityV3Records('security_ingest_logs', {
      appends: ['data_source', 'api_resource'],
      sort: ['-started_at'],
    }),
    listSecurityV3Records('security_policy_decision_logs', {
      appends: ['subject', 'api_resource'],
      sort: ['-requested_at'],
    }),
    listSecurityV3Records('security_confidential_tasks', {
      appends: ['subject', 'api_resource'],
      sort: ['-updatedAt', '-createdAt'],
    }),
    listSecurityV3Records('security_streaming_runs', {
      sort: ['-started_at'],
    }),
  ])
  return [
    ...buildIngestLogs(ingestRecords),
    ...buildAccessLogs(accessRecords),
    ...buildHomomorphicLogs(homomorphicRecords),
    ...buildStreamingLogs(streamingRecords),
  ].sort((left, right) => right.time.localeCompare(left.time))
}
