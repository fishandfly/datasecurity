import { listSecurityV3Records, sanitizeSecurityVisibleText, type SecurityV3Record } from './nocobase-security-v3'
import type {
  SecurityDashboardData,
  SecurityDashboardDistributionItem,
  SecurityDashboardEvent,
  SecurityDashboardMetrics,
  SecurityDashboardModuleSummary,
  SecurityDashboardRealtimeItem,
  SecurityDashboardSourceHealth,
  SecurityDashboardTopActor,
} from './security-dashboard-data'

export type SecurityDashboardCoreMetric = {
  key: 'resources' | 'apis' | 'policies' | 'requests' | 'rejects' | 'tasks'
  label: string
  value: number
  helper: string
  path: string
  tone: 'blue' | 'green' | 'amber' | 'red'
  trend: number[]
}

export type SecurityDashboardV3Data = SecurityDashboardData & {
  coreMetrics: SecurityDashboardCoreMetric[]
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function text(value: unknown, fallback = '') {
  return sanitizeSecurityVisibleText(value) || fallback
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function clock(value: unknown) {
  const date = new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? '--:--:--' : date.toLocaleTimeString('zh-CN', { hour12: false })
}

function timestamp(value: unknown) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function riskLabel(value: unknown): '高' | '中' | '低' {
  const normalized = String(value || '').toLowerCase()
  if (['high', 'critical', '高'].some((item) => normalized.includes(item))) return '高'
  if (['medium', '中'].some((item) => normalized.includes(item))) return '中'
  return '低'
}

function taskEvents(tasks: SecurityV3Record[]): SecurityDashboardEvent[] {
  return tasks.flatMap((task) => {
    const summary = record(task.execution_summary_json)
    const events = Array.isArray(summary.events) ? summary.events : []
    const subject = record(task.subject)
    return events.map((rawEvent) => {
      const event = record(rawEvent)
      const eventTime = event.time || event.created_at || task.updatedAt
      return {
        time: clock(eventTime),
        sortTime: timestamp(eventTime),
        type: '同态任务',
        description: `${text(task.task_name, '未命名任务')}：${text(event.message, '任务状态已更新')}`,
        user: text(subject.subject_name, '系统任务'),
        dept: '跨域密态计算',
        risk: String(event.result) === 'failed' ? '高' as const : '低' as const,
      }
    })
  })
}

function runtimeEvents(
  ingestLogs: SecurityV3Record[],
  decisions: SecurityV3Record[],
  tasks: SecurityV3Record[],
) {
  const ingestEvents: SecurityDashboardEvent[] = ingestLogs.map((item) => ({
    time: clock(item.started_at || item.createdAt), sortTime: timestamp(item.started_at || item.createdAt), type: '接入校验',
    description: `${text(item.batch_code, '接入批次')}：通过 ${number(item.passed_count)} 条，拒绝 ${number(item.rejected_count)} 条。`,
    user: '数据接入服务', dept: text(record(item.data_source).source_name, '接入来源'), risk: number(item.rejected_count) > 0 ? '中' : '低',
  }))
  const decisionEvents: SecurityDashboardEvent[] = decisions.map((item) => ({
    time: clock(item.requested_at || item.createdAt), sortTime: timestamp(item.requested_at || item.createdAt), type: '访问决策',
    description: `${text(item.request_id, '访问请求')}：${text(item.decision_result, '已决策')}，返回 ${number(item.returned_rows)} 行。`,
    user: text(record(item.subject).subject_name, '数据应用'), dept: text(record(item.api_resource).api_name, '数据 API'), risk: riskLabel(item.risk_level),
  }))
  return [...ingestEvents, ...decisionEvents, ...taskEvents(tasks)]
    .sort((left, right) => right.sortTime - left.sortTime)
    .slice(0, 10)
}

function distribution(events: SecurityDashboardEvent[]): SecurityDashboardDistributionItem[] {
  if (!events.length) return []
  return [
    { label: '高风险', risk: '高', color: '#ef4444' },
    { label: '中风险', risk: '中', color: '#f59e0b' },
    { label: '低风险', risk: '低', color: '#3b82f6' },
  ].map((item) => ({ label: item.label, color: item.color, value: percent(events.filter((event) => event.risk === item.risk).length, events.length) }))
    .filter((item) => item.value > 0)
}

function actors(events: SecurityDashboardEvent[]): SecurityDashboardTopActor[] {
  const grouped = new Map<string, SecurityDashboardTopActor & { sortTime: number; highest: number }>()
  events.forEach((event) => {
    const key = `${event.user}:${event.dept}`
    const current = grouped.get(key) || { user: event.user, dept: event.dept, count: 0, lastSeen: event.time, status: '正常', sortTime: 0, highest: 0 }
    current.count += 1
    current.highest = Math.max(current.highest, event.risk === '高' ? 3 : event.risk === '中' ? 2 : 1)
    if (event.sortTime >= current.sortTime) { current.sortTime = event.sortTime; current.lastSeen = event.time }
    current.status = current.highest === 3 ? '待处理' : current.highest === 2 ? '需复核' : '正常'
    grouped.set(key, current)
  })
  return [...grouped.values()].sort((left, right) => right.highest - left.highest || right.count - left.count).slice(0, 5).map(({ sortTime: _sortTime, highest: _highest, ...item }) => item)
}

function sourceData(sources: SecurityV3Record[]) {
  const colors = ['#3b82f6', '#14b8a6', '#f59e0b']
  const sorted = [...sources].sort((left, right) => number(record(right.last_monitor_json).ingestRate) - number(record(left.last_monitor_json).ingestRate))
  const series = sorted.map((source, index) => ({ key: `source-${index}`, label: text(source.source_name), color: colors[index] || '#8b5cf6' }))
  const points = [{ label: '当前', values: Object.fromEntries(sorted.map((source, index) => [`source-${index}`, number(record(source.last_monitor_json).ingestRate)])) }]
  const health: SecurityDashboardSourceHealth[] = sorted.map((source) => {
    const monitor = record(source.last_monitor_json)
    const status = source.connection_status === 'connected' ? '已连接' : source.connection_status === 'testing' ? '检查中' : '未连接'
    return { name: text(source.source_name), status, rate: monitor.checksumPassRate == null ? '-' : `${number(monitor.checksumPassRate).toFixed(2)}%`, time: clock(monitor.lastHeartbeat || source.updatedAt), action: '查看配置' }
  })
  return { trend: { series, points }, health }
}

export const EMPTY_SECURITY_DASHBOARD_V3_DATA: SecurityDashboardV3Data = {
  metrics: {
    overallScore: 0, resourceCount: 0, sourceCount: 0, accessIngest: 0, realtimeIngestRate: 0, integrityPassRate: 0,
    encryptedTransportCoverage: 0, requests: 0, activePolicies: 0, pendingPolicies: 0, alerts: 0, blockedEstimate: 0,
    importantResources: 0, sensitiveFields: 0, classificationCoverage: 0, fieldSecurityCoverage: 0, enabledPolicyRatio: 0,
    desensitizationCoverage: 0, homomorphicTaskCount: 0, homomorphicCompletedCount: 0, homomorphicPendingCount: 0,
    auditLogEstimate: 0, decisionLatencyMs: 0, queueSize: 0, loadBars: [],
  },
  moduleSummaries: [], realtimeItems: [], events: [], abnormalTypes: [], topActors: [], sourceTrend: { series: [], points: [] }, sourceHealth: [], coreMetrics: [],
}

export async function loadSecurityDashboardV3Data(): Promise<SecurityDashboardV3Data> {
  const [allResources, allFields, allSources, apis, allPolicies, ingestLogs, decisions, allTasks, streamingRuns] = await Promise.all([
    listSecurityV3Records('eco_data_resources'),
    listSecurityV3Records('eco_resource_security_fields'),
    listSecurityV3Records('security_data_sources'),
    listSecurityV3Records('security_api_resources'),
    listSecurityV3Records('eco_resource_security_policies'),
    listSecurityV3Records('security_ingest_logs', { appends: ['data_source'] }),
    listSecurityV3Records('security_policy_decision_logs', { appends: ['subject', 'api_resource'] }),
    listSecurityV3Records('security_confidential_tasks', { appends: ['subject'] }),
    listSecurityV3Records('security_streaming_runs'),
  ])

  const resources = allResources
  const resourceIds = new Set(resources.map((item) => String(item.id)))
  const fields = allFields.filter((item) => resourceIds.has(String(item.resource_id)))
  const sources = allSources.filter((item) => item.connection_status !== 'disabled')
  const policies = allPolicies.filter((item) => item.policy_kind === 'access_policy')
  const tasks = allTasks.filter((item) => item.task_status !== 'archived' && !['bfv', 'BFV'].includes(String(item.algorithm || '')))
  const monitorRows = sources.map((item) => record(item.last_monitor_json))
  const integrityValues = monitorRows.map((item) => number(item.checksumPassRate)).filter((value) => value > 0)
  const encryptedSourceCount = sources.filter((item) => Boolean(record(item.security_config_json).encryptionEnabled)).length
  const classifiedResourceCount = resources.filter((item) => item.region_category_id && item.provider_org_id && Array.isArray(item.resource_tags) && item.resource_tags.length > 0).length
  const securedFieldCount = fields.filter((item) => item.information_category_id && item.security_level).length
  const sensitiveFields = fields.filter((item) => ['sensitive', 'important', 'core'].includes(String(item.security_level))).length
  const importantResources = resources.filter((item) => ['l2', 'l3'].includes(String(item.protection_level))).length
  const enabledPolicies = policies.filter((item) => item.policy_status === 'enabled')
  const pendingPolicies = policies.filter((item) => item.publish_status !== 'success')
  const deniedRequests = decisions.filter((item) => ['deny', 'denied', '拒绝'].includes(String(item.decision_result))).length
  const pendingTasks = tasks.filter((item) => ['pending', 'running'].includes(String(item.task_status))).length
  const completedTasks = tasks.filter((item) => ['success', 'completed'].includes(String(item.task_status))).length
  const failedTasks = tasks.filter((item) => item.task_status === 'failed').length
  const streamingRunCount = streamingRuns.length
  const streamingWindowCount = streamingRuns.reduce((total, run) => total + number(run.window_count), 0)
  const streamingEventCount = streamingRuns.reduce((total, run) => total + number(run.processed_events), 0)
  const streamingAnomalyCount = streamingRuns.reduce((total, run) => total + number(run.anomaly_count), 0)
  const streamingAlert = streamingRuns.some((run) => ['warning', 'failed'].includes(String(run.status)))
  const allEvents = runtimeEvents(ingestLogs, decisions, tasks)
  const taskEventCount = tasks.reduce((total, task) => total + (Array.isArray(record(task.execution_summary_json).events) ? (record(task.execution_summary_json).events as unknown[]).length : 0), 0)
  const durationValues = decisions.map((item) => number(item.duration_ms)).filter((value) => value > 0)
  const classificationCoverage = percent(classifiedResourceCount, resources.length)
  const fieldSecurityCoverage = percent(securedFieldCount, fields.length)
  const integrityPassRate = integrityValues.length ? Math.round(integrityValues.reduce((total, value) => total + value, 0) / integrityValues.length) : 0
  const enabledPolicyRatio = percent(enabledPolicies.length, policies.length)
  const encryptedTransportCoverage = percent(encryptedSourceCount, sources.length)
  const alerts = deniedRequests + failedTasks + sources.filter((item) => item.connection_status === 'exception').length
  const overallScore = Math.max(0, Math.min(100, Math.round((classificationCoverage + fieldSecurityCoverage + integrityPassRate + enabledPolicyRatio + encryptedTransportCoverage) / 5) - alerts * 3))
  const sourceRates = monitorRows.map((item) => number(item.ingestRate))
  const maxSourceRate = Math.max(...sourceRates, 1)

  const metrics: SecurityDashboardMetrics = {
    overallScore, resourceCount: resources.length, sourceCount: sources.length,
    accessIngest: monitorRows.reduce((total, item) => total + number(item.todayRows), 0),
    realtimeIngestRate: monitorRows.reduce((total, item) => total + number(item.ingestRate), 0),
    integrityPassRate, encryptedTransportCoverage, requests: decisions.length, activePolicies: enabledPolicies.length,
    pendingPolicies: pendingPolicies.length, alerts, blockedEstimate: deniedRequests, importantResources, sensitiveFields,
    classificationCoverage, fieldSecurityCoverage, enabledPolicyRatio, desensitizationCoverage: fieldSecurityCoverage,
    homomorphicTaskCount: tasks.length, homomorphicCompletedCount: completedTasks, homomorphicPendingCount: pendingTasks,
    auditLogEstimate: ingestLogs.length + decisions.length + taskEventCount,
    decisionLatencyMs: durationValues.length ? Math.round(durationValues.reduce((total, value) => total + value, 0) / durationValues.length) : 0,
    queueSize: deniedRequests + pendingTasks + pendingPolicies.length,
    loadBars: sourceRates.map((value) => Math.round((value / maxSourceRate) * 100)),
  }

  const moduleSummaries: SecurityDashboardModuleSummary[] = [
    { id: 'data-access', title: '接入校验', path: '/security-governance/ingest/sources', value: String(sources.length), unit: '接入来源', status: alerts ? '需关注' : '运行稳定', helper: `当前接入 ${metrics.realtimeIngestRate.toLocaleString()} 条/秒`, primaryMetric: `完整性 ${integrityPassRate}%`, secondaryMetric: `传输保护 ${encryptedTransportCoverage}%`, tone: alerts ? 'amber' : 'green' },
    { id: 'resource-control', title: '数据资源', path: '/security-governance/resources/catalog', value: String(resources.length), unit: '核心资源', status: classificationCoverage === 100 ? '边界完整' : '待补标', helper: `${fields.length} 个资源字段纳入管控`, primaryMetric: `分类分级 ${classificationCoverage}%`, secondaryMetric: `字段安全 ${fieldSecurityCoverage}%`, tone: classificationCoverage === 100 ? 'green' : 'amber' },
    { id: 'access-control', title: '访问策略', path: '/security-governance/access/publish', value: String(enabledPolicies.length), unit: '启用策略', status: pendingPolicies.length ? '待发布' : '已发布', helper: `真实调用 ${decisions.length} 次，拒绝 ${deniedRequests} 次`, primaryMetric: `策略启用 ${enabledPolicyRatio}%`, secondaryMetric: `待发布 ${pendingPolicies.length} 条`, tone: pendingPolicies.length ? 'amber' : 'green' },
    { id: 'risk-events', title: '访问日志', path: '/security-governance/logs', value: String(decisions.length), unit: '访问日志', status: deniedRequests ? '有拒绝' : '运行正常', helper: `拒绝 ${deniedRequests} 次`, primaryMetric: `审计 ${decisions.length} 条`, secondaryMetric: '保留完整访问链路', tone: deniedRequests ? 'amber' : 'blue' },
    { id: 'homomorphic-encryption', title: '同态加密', path: '/security-governance/homomorphic/tasks', value: String(tasks.length), unit: '验证任务', status: pendingTasks ? '待执行' : completedTasks ? '已完成' : '暂无任务', helper: `成功 ${completedTasks} 项，阶段事件 ${taskEventCount} 条`, primaryMetric: `待处理 ${pendingTasks} 项`, secondaryMetric: `失败 ${failedTasks} 项`, tone: failedTasks ? 'red' : pendingTasks ? 'amber' : 'blue' },
  ]

  const realtimeItems: SecurityDashboardRealtimeItem[] = [
    { label: '实时接入', value: `${metrics.realtimeIngestRate.toLocaleString()}/s`, detail: `${sources.length} 个启用来源`, tone: 'blue' },
    { label: '资源与 API', value: `${resources.length} / ${apis.length}`, detail: '启用资源 / 纳管 API', tone: 'green' },
    { label: '访问决策', value: decisions.length.toLocaleString(), detail: `拒绝 ${deniedRequests} 次`, tone: deniedRequests ? 'amber' : 'green' },
    { label: '访问日志', value: decisions.length.toLocaleString(), detail: `拒绝 ${deniedRequests} 次`, tone: deniedRequests ? 'amber' : 'green' },
    { label: '密态任务', value: tasks.length.toLocaleString(), detail: `待执行 ${pendingTasks} 项`, tone: pendingTasks ? 'amber' : 'blue' },
    { label: '流式处理', value: streamingWindowCount.toLocaleString(), detail: `累计 ${streamingEventCount} 事件 / 异常 ${streamingAnomalyCount}`, tone: streamingAlert ? 'amber' : 'blue' },
  ]

  const source = sourceData(sources)
  const coreMetrics: SecurityDashboardCoreMetric[] = [
    { key: 'resources', label: '核心资源', value: resources.length, helper: `字段安全覆盖 ${fieldSecurityCoverage}%`, path: '/security-governance/resources/catalog', tone: 'blue', trend: sourceRates },
    { key: 'apis', label: '资源 API', value: apis.length, helper: `已发布 ${apis.filter((item) => item.publish_status === 'success').length} 个`, path: '/security-governance/resources/catalog', tone: 'green', trend: apis.map((item) => number(item.publish_version)) },
    { key: 'policies', label: '启用策略', value: enabledPolicies.length, helper: `待发布 ${pendingPolicies.length} 条`, path: '/security-governance/access/publish', tone: 'amber', trend: policies.map((item) => number(item.policy_version)) },
    { key: 'requests', label: '访问调用', value: decisions.length, helper: '来自真实决策日志', path: '/security-governance/access/audit', tone: 'blue', trend: decisions.map((item) => number(item.duration_ms)) },
    { key: 'rejects', label: '拒绝调用', value: deniedRequests, helper: '仅统计真实拒绝决策', path: '/security-governance/access/audit', tone: deniedRequests ? 'red' : 'green', trend: decisions.map((item) => ['deny', 'denied', '拒绝'].includes(String(item.decision_result)) ? 100 : 0) },
    { key: 'tasks', label: '同态任务', value: tasks.length, helper: `待执行 ${pendingTasks} 项`, path: '/security-governance/homomorphic/tasks', tone: pendingTasks ? 'amber' : 'blue', trend: tasks.map((item) => number(item.progress)) },
  ]

  return { metrics, moduleSummaries, realtimeItems, events: allEvents, abnormalTypes: distribution(allEvents), topActors: actors(allEvents), sourceTrend: source.trend, sourceHealth: source.health, coreMetrics }
}
