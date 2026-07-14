import type { SecurityGovernanceJoinedItem } from './security-governance'
import { resolveSecurityScopeLabel } from './security-governance'
import { formatOpenFheAlgorithm, type ConfidentialTaskRecord, type SecurityDataSourceRecord } from './nocobase-security-runtime'

export type SecurityDashboardRisk = '高' | '中' | '低'

export type SecurityDashboardEvent = {
  time: string
  sortTime: number
  type: string
  description: string
  user: string
  dept: string
  risk: SecurityDashboardRisk
}

export type SecurityDashboardDistributionItem = {
  label: string
  value: number
  color: string
}

export type SecurityDashboardTopActor = {
  user: string
  dept: string
  count: number
  lastSeen: string
  status: string
}

export type SecurityDashboardSourceTrendSeries = {
  key: string
  label: string
  color: string
}

export type SecurityDashboardSourceTrendPoint = {
  label: string
  values: Record<string, number>
}

export type SecurityDashboardSourceHealth = {
  name: string
  status: string
  rate: string
  time: string
  action: string
}

export type SecurityDashboardModuleId = 'data-access' | 'resource-control' | 'access-control' | 'risk-events' | 'homomorphic-encryption'

export type SecurityDashboardModuleSummary = {
  id: SecurityDashboardModuleId
  title: string
  path: string
  value: string
  unit: string
  status: string
  helper: string
  primaryMetric: string
  secondaryMetric: string
  tone: 'blue' | 'green' | 'amber' | 'red'
}

export type SecurityDashboardRealtimeItem = {
  label: string
  value: string
  detail: string
  tone: 'blue' | 'green' | 'amber' | 'red'
}

export type SecurityDashboardMetrics = {
  overallScore: number
  resourceCount: number
  sourceCount: number
  accessIngest: number
  realtimeIngestRate: number
  integrityPassRate: number
  encryptedTransportCoverage: number
  requests: number
  activePolicies: number
  pendingPolicies: number
  alerts: number
  blockedEstimate: number
  importantResources: number
  sensitiveFields: number
  classificationCoverage: number
  fieldSecurityCoverage: number
  enabledPolicyRatio: number
  desensitizationCoverage: number
  homomorphicTaskCount: number
  homomorphicCompletedCount: number
  homomorphicPendingCount: number
  auditLogEstimate: number
  decisionLatencyMs: number
  queueSize: number
  loadBars: number[]
}

export type SecurityDashboardData = {
  metrics: SecurityDashboardMetrics
  moduleSummaries: SecurityDashboardModuleSummary[]
  realtimeItems: SecurityDashboardRealtimeItem[]
  events: SecurityDashboardEvent[]
  abnormalTypes: SecurityDashboardDistributionItem[]
  topActors: SecurityDashboardTopActor[]
  sourceTrend: {
    series: SecurityDashboardSourceTrendSeries[]
    points: SecurityDashboardSourceTrendPoint[]
  }
  sourceHealth: SecurityDashboardSourceHealth[]
}

export type SecurityDashboardRuntimeData = {
  sources: SecurityDataSourceRecord[]
  tasks: ConfidentialTaskRecord[]
}

const TREND_COLORS = ['#3b82f6', '#14b8a6', '#f59e0b', '#8b5cf6']

function normalizeText(value: string | null | undefined, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function parseTime(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) return 0
  const time = Date.parse(normalized)
  return Number.isFinite(time) ? time : 0
}

function formatClock(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) return '--:--:--'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized.slice(11, 19) || '--:--:--'
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function formatDateLabel(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) return '未记录'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized.slice(0, 10) || '未记录'
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function resolveRisk(item: SecurityGovernanceJoinedItem): SecurityDashboardRisk {
  if (item.coreControlFlag || item.approvalRequired || item.sensitiveFieldCount >= 3) return '高'
  if (item.importantDataFlag || item.desensitizationRequired || item.sensitiveFieldCount > 0) return '中'
  return '低'
}

function resolveEventType(item: SecurityGovernanceJoinedItem) {
  if (item.policyStatus === 'pending' || item.securityReviewStatus === 'pending') return '策略变更'
  if (item.policyStatus === 'disabled' || item.securityReviewStatus === 'returned') return '异常访问'
  if (item.approvalRequired) return '访问控制'
  if (item.desensitizationRequired) return '数据接入'
  if (item.coreControlFlag) return '核心数据'
  return '安全档案'
}

function buildEventDescription(item: SecurityGovernanceJoinedItem) {
  const accessScope = resolveSecurityScopeLabel(item.accessScope)
  const exportScope = resolveSecurityScopeLabel(item.exportScope)
  if (item.policyStatus === 'disabled') {
    return `${item.name} 的安全策略已停用，相关访问需重新复核。`
  }
  if (item.securityReviewStatus === 'pending') {
    return `${item.name} 安全档案处于待审核状态，访问范围为 ${accessScope}。`
  }
  if (item.approvalRequired) {
    return `${item.name} 命中审批规则，导出范围为 ${exportScope}。`
  }
  if (item.desensitizationRequired) {
    return `${item.name} 启用 ${resolveSecurityScopeLabel(item.desensitizationMode)}，接口访问方式为 ${resolveSecurityScopeLabel(item.apiAuthMode)}。`
  }
  return `${item.name} 完成安全分类分级，当前等级为 ${item.securityLevel || '未标注'}。`
}

function groupBySource(items: SecurityGovernanceJoinedItem[]) {
  const grouped = new Map<string, SecurityGovernanceJoinedItem[]>()
  items.forEach((item) => {
    const key = normalizeText(item.department) || normalizeText(item.category) || '未标注来源'
    const current = grouped.get(key) ?? []
    current.push(item)
    grouped.set(key, current)
  })
  return grouped
}

function percent(part: number, total: number) {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function formatCount(value: number) {
  return value.toLocaleString('zh-CN')
}

function buildMetrics(items: SecurityGovernanceJoinedItem[], runtime: SecurityDashboardRuntimeData): SecurityDashboardMetrics {
  const totalResources = items.length
  const sourceCount = runtime.sources.length
  const sensitiveFields = items.reduce((sum, item) => sum + item.sensitiveFieldCount, 0)
  const importantResources = items.filter((item) => item.importantDataFlag || item.coreControlFlag).length
  const activePolicies = items.filter((item) => item.policyStatus !== 'disabled' && item.policyStatus !== 'draft').length
  const pendingPolicies = items.filter((item) => item.policyStatus === 'pending' || item.securityReviewStatus === 'pending').length
  const desensitizationCount = items.filter((item) => item.desensitizationRequired).length
  const approvalCount = items.filter((item) => item.approvalRequired).length
  const classifiedResources = items.filter((item) => item.securityCategoryId && item.securityLevelId).length
  const fieldProfileResources = items.filter((item) => item.fieldCount > 0 && (item.sensitiveFieldCount > 0 || item.importantFieldCount > 0 || item.securityCategoryId)).length
  const accessIngest = runtime.sources.reduce((sum, item) => sum + item.monitor.todayRows, 0)
  const realtimeIngestRate = runtime.sources.reduce((sum, item) => sum + item.monitor.ingestRate, 0)
  const integrityValues = runtime.sources.flatMap((item) => item.monitor.checksumPassRate == null ? [] : [item.monitor.checksumPassRate])
  const encryptedValues = runtime.sources.flatMap((item) => item.monitor.encryptionRate == null ? [] : [item.monitor.encryptionRate])
  const integrityPassRate = integrityValues.length ? Math.round(integrityValues.reduce((sum, value) => sum + value, 0) / integrityValues.length) : 0
  const encryptedTransportCoverage = encryptedValues.length ? Math.round(encryptedValues.reduce((sum, value) => sum + value, 0) / encryptedValues.length) : 0
  const homomorphicCompletedCount = runtime.tasks.filter((task) => task.status === 'completed').length
  const homomorphicPendingCount = runtime.tasks.filter((task) => task.status === 'pending_approval' || task.status === 'running').length
  const homomorphicFailedCount = runtime.tasks.filter((task) => task.status === 'failed').length
  const runtimeLogs = runtime.tasks.flatMap((task) => task.logs)
  const durationValues = runtimeLogs.flatMap((log) => log.durationMs == null ? [] : [log.durationMs])
  const decisionLatencyMs = durationValues.length ? Math.round(durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length) : 0
  const sourceAlerts = runtime.sources.filter((source) => source.status === 'exception').length
  const classificationCoverage = percent(classifiedResources, totalResources)
  const enabledPolicyRatio = percent(activePolicies, totalResources)
  const desensitizationCoverage = percent(desensitizationCount, Math.max(1, items.filter((item) => item.sensitiveFieldCount > 0 || item.importantDataFlag).length))
  const overallScore = totalResources > 0
    ? Math.max(0, Math.min(100, Math.round((classificationCoverage + enabledPolicyRatio + integrityPassRate + desensitizationCoverage) / 4) - (sourceAlerts + homomorphicFailedCount) * 2))
    : 0

  return {
    overallScore,
    resourceCount: totalResources,
    sourceCount,
    accessIngest,
    realtimeIngestRate,
    integrityPassRate,
    encryptedTransportCoverage,
    requests: 0,
    activePolicies,
    pendingPolicies,
    alerts: sourceAlerts + homomorphicFailedCount + pendingPolicies,
    blockedEstimate: approvalCount,
    importantResources,
    sensitiveFields,
    classificationCoverage,
    fieldSecurityCoverage: percent(fieldProfileResources, totalResources),
    enabledPolicyRatio,
    desensitizationCoverage,
    homomorphicTaskCount: runtime.tasks.length,
    homomorphicCompletedCount,
    homomorphicPendingCount,
    auditLogEstimate: runtimeLogs.length,
    decisionLatencyMs,
    queueSize: pendingPolicies + approvalCount,
    loadBars: runtime.sources.slice(0, 12).map((source) => Math.max(0, Math.min(100, source.monitor.ingestRate))),
  }
}

function buildModuleSummaries(metrics: SecurityDashboardMetrics): SecurityDashboardModuleSummary[] {
  return [
    {
      id: 'data-access',
      title: '数据接入管理',
      path: '/security-governance/data-access/source-config',
      value: formatCount(metrics.sourceCount),
      unit: '接入来源',
      status: metrics.integrityPassRate >= 98 ? '运行稳定' : metrics.integrityPassRate >= 90 ? '轻微波动' : '存在异常',
      helper: `实时接入 ${formatCount(metrics.realtimeIngestRate)} 条，完整性通过率 ${metrics.integrityPassRate}%`,
      primaryMetric: `加密传输覆盖 ${metrics.encryptedTransportCoverage}%`,
      secondaryMetric: `异常告警 ${formatCount(metrics.alerts)} 项`,
      tone: metrics.integrityPassRate >= 98 ? 'green' : metrics.integrityPassRate >= 90 ? 'amber' : 'red',
    },
    {
      id: 'resource-control',
      title: '数据资源管控',
      path: '/security-governance/resources',
      value: formatCount(metrics.resourceCount),
      unit: '纳管资源',
      status: metrics.classificationCoverage >= 90 ? '分级充分' : metrics.classificationCoverage >= 70 ? '继续补标' : '需补齐分类',
      helper: `分类分级覆盖 ${metrics.classificationCoverage}%，字段安全覆盖 ${metrics.fieldSecurityCoverage}%`,
      primaryMetric: `敏感字段 ${formatCount(metrics.sensitiveFields)} 个`,
      secondaryMetric: `重要/核心资源 ${formatCount(metrics.importantResources)} 个`,
      tone: metrics.classificationCoverage >= 90 ? 'green' : metrics.classificationCoverage >= 70 ? 'amber' : 'red',
    },
    {
      id: 'access-control',
      title: '访问控制管理',
      path: '/security-governance/access-control/policy-engine',
      value: formatCount(metrics.activePolicies),
      unit: '活跃策略',
      status: metrics.queueSize > 0 ? '有待处理项' : '策略生效中',
      helper: `策略启用率 ${metrics.enabledPolicyRatio}%，审批/阻断队列 ${formatCount(metrics.queueSize)} 项`,
      primaryMetric: `需审批 ${formatCount(metrics.blockedEstimate)} 项`,
      secondaryMetric: `脱敏覆盖 ${metrics.desensitizationCoverage}%`,
      tone: metrics.queueSize > 0 ? 'amber' : 'green',
    },
    {
      id: 'homomorphic-encryption',
      title: '数据同态加密',
      path: '/security-governance/homomorphic-encryption',
      value: formatCount(metrics.homomorphicTaskCount),
      unit: '同态任务',
      status: metrics.homomorphicPendingCount > 0 ? '待审批/执行' : metrics.homomorphicTaskCount > 0 ? '任务完成' : '暂无任务',
      helper: `已完成 ${formatCount(metrics.homomorphicCompletedCount)} 项，过程日志 ${formatCount(metrics.auditLogEstimate)} 条`,
      primaryMetric: `待处理 ${formatCount(metrics.homomorphicPendingCount)} 项`,
      secondaryMetric: `平均耗时 ${metrics.decisionLatencyMs} ms`,
      tone: metrics.homomorphicPendingCount > 0 ? 'amber' : 'blue',
    },
  ]
}

function buildRealtimeItems(metrics: SecurityDashboardMetrics): SecurityDashboardRealtimeItem[] {
  return [
    {
      label: '实时接入量',
      value: `${formatCount(metrics.realtimeIngestRate)}/s`,
      detail: `来自 ${formatCount(metrics.sourceCount)} 个接入来源`,
      tone: 'blue',
    },
    {
      label: '资源管控覆盖',
      value: `${metrics.classificationCoverage}%`,
      detail: `${formatCount(metrics.resourceCount)} 个资源纳入安全视图`,
      tone: metrics.classificationCoverage >= 90 ? 'green' : 'amber',
    },
    {
      label: '访问控制队列',
      value: formatCount(metrics.queueSize),
      detail: `审批 ${formatCount(metrics.blockedEstimate)} 项，待生效策略 ${formatCount(metrics.pendingPolicies)} 条`,
      tone: metrics.queueSize > 0 ? 'amber' : 'green',
    },
    {
      label: '同态加密运行',
      value: formatCount(metrics.homomorphicTaskCount),
      detail: `完成 ${formatCount(metrics.homomorphicCompletedCount)} 项，待处理 ${formatCount(metrics.homomorphicPendingCount)} 项`,
      tone: metrics.homomorphicPendingCount > 0 ? 'amber' : 'blue',
    },
  ]
}

function buildEvents(items: SecurityGovernanceJoinedItem[]): SecurityDashboardEvent[] {
  return [...items]
    .sort((left, right) => parseTime(right.updateTime) - parseTime(left.updateTime))
    .slice(0, 8)
    .map((item) => ({
      time: formatClock(item.updateTime),
      sortTime: parseTime(item.updateTime),
      type: resolveEventType(item),
      description: buildEventDescription(item),
      user: normalizeText(item.securityOwnerUserName, item.securityOwnerDept || item.department || '未指定责任人'),
      dept: normalizeText(item.securityOwnerDept, item.department || '未标注部门'),
      risk: resolveRisk(item),
    }))
}

function buildDistribution(events: SecurityDashboardEvent[]): SecurityDashboardDistributionItem[] {
  const total = events.length
  if (total === 0) return []

  const specs: Array<{ risk: SecurityDashboardRisk; label: string; color: string }> = [
    { risk: '高', label: '高风险事件', color: '#ef4444' },
    { risk: '中', label: '中风险事件', color: '#f59e0b' },
    { risk: '低', label: '低风险事件', color: '#3b82f6' },
  ]

  return specs
    .map((spec) => ({
      label: spec.label,
      value: percent(events.filter((event) => event.risk === spec.risk).length, total),
      color: spec.color,
    }))
    .filter((item) => item.value > 0)
}

function buildTopActors(events: SecurityDashboardEvent[]): SecurityDashboardTopActor[] {
  const grouped = new Map<string, SecurityDashboardTopActor & { sortTime: number; highRiskCount: number }>()
  events.forEach((event) => {
    const key = `${event.user}::${event.dept}`
    const current = grouped.get(key) ?? {
      user: event.user,
      dept: event.dept,
      count: 0,
      lastSeen: event.time,
      status: '正常',
      sortTime: 0,
      highRiskCount: 0,
    }
    current.count += 1
    current.highRiskCount += event.risk === '高' ? 1 : 0
    if (event.sortTime >= current.sortTime) {
      current.sortTime = event.sortTime
      current.lastSeen = event.time
    }
    current.status = current.highRiskCount > 0 ? '待处理' : current.count > 1 ? '需复核' : '正常'
    grouped.set(key, current)
  })

  return Array.from(grouped.values())
    .sort((left, right) => right.highRiskCount - left.highRiskCount || right.count - left.count || right.sortTime - left.sortTime)
    .slice(0, 5)
    .map(({ sortTime: _sortTime, highRiskCount: _highRiskCount, ...item }) => item)
}

function buildSourceTrend(sources: SecurityDataSourceRecord[]) {
  const visibleSources = [...sources].sort((left, right) => right.monitor.ingestRate - left.monitor.ingestRate).slice(0, 3)
  const series = visibleSources.map((source, index) => ({
    key: `source-${index}`,
    label: source.name,
    color: TREND_COLORS[index] ?? '#3b82f6',
  }))
  const points = [{ label: '当前', values: Object.fromEntries(visibleSources.map((source, index) => [`source-${index}`, source.monitor.ingestRate])) }]
  return { series, points }
}

function buildSourceHealth(sources: SecurityDataSourceRecord[]): SecurityDashboardSourceHealth[] {
  return [...sources]
    .sort((left, right) => parseTime(right.lastCheckedAt) - parseTime(left.lastCheckedAt))
    .slice(0, 6)
    .map((source) => ({
      name: source.name,
      status: source.statusLabel,
      rate: source.monitor.checksumPassRate == null ? '-' : `${source.monitor.checksumPassRate.toFixed(1)}%`,
      time: formatClock(source.lastCheckedAt),
      action: source.status === 'exception' ? '处理' : '查看配置',
    }))
}

function buildRuntimeEvents(runtime: SecurityDashboardRuntimeData): SecurityDashboardEvent[] {
  const taskEvents = runtime.tasks.flatMap((task) => task.logs.map((log) => ({
    time: formatClock(log.time),
    sortTime: parseTime(log.time),
    type: `同态加密${formatOpenFheAlgorithm(task.algorithm)}`,
    description: `${task.name}：${log.message}`,
    user: task.ownerName || '系统',
    dept: task.sourceDomain || '未指定安全域',
    risk: task.risk === 'high' ? '高' as const : task.risk === 'medium' ? '中' as const : '低' as const,
  })))
  const sourceEvents = runtime.sources.flatMap((source) => source.lastCheckedAt ? [{
    time: formatClock(source.lastCheckedAt),
    sortTime: parseTime(source.lastCheckedAt),
    type: '数据源连接检查',
    description: `${source.name}：${source.monitor.issue}`,
    user: '安全运维',
    dept: source.ownerDept || '未指定责任部门',
    risk: source.status === 'exception' ? '高' as const : source.status === 'connected' ? '低' as const : '中' as const,
  }] : [])
  return [...taskEvents, ...sourceEvents].sort((left, right) => right.sortTime - left.sortTime).slice(0, 8)
}

export function buildSecurityDashboardData(items: SecurityGovernanceJoinedItem[], runtime: SecurityDashboardRuntimeData = { sources: [], tasks: [] }): SecurityDashboardData {
  const events = buildRuntimeEvents(runtime)
  const metrics = buildMetrics(items, runtime)
  return {
    metrics,
    moduleSummaries: buildModuleSummaries(metrics),
    realtimeItems: buildRealtimeItems(metrics),
    events,
    abnormalTypes: buildDistribution(events),
    topActors: buildTopActors(events),
    sourceTrend: buildSourceTrend(runtime.sources),
    sourceHealth: buildSourceHealth(runtime.sources),
  }
}
