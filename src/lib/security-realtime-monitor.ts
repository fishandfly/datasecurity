import { listSecurityV3Records } from './nocobase-security-v3'
import type { SankeyDetailRule, SankeyLinkSpec, SankeyNodeSpec } from './sankey-layout'

export type RealtimeMonitorInput = {
  sources: Array<Record<string, unknown>>
  resources: Array<Record<string, unknown>>
  policies: Array<Record<string, unknown>>
  tasks: Array<Record<string, unknown>>
  decisionLogs: Array<Record<string, unknown>>
  ingestLogs: Array<Record<string, unknown>>
  subjects: Array<Record<string, unknown>>
  apis: Array<Record<string, unknown>>
  streamingRuns: Array<Record<string, unknown>>
  streamingWindows: Array<Record<string, unknown>>
  windowHours: number
}

export type RealtimeMonitorCollections = Pick<
  RealtimeMonitorInput,
  'sources' | 'resources' | 'policies' | 'tasks' | 'decisionLogs' | 'ingestLogs' | 'subjects' | 'apis' | 'streamingRuns' | 'streamingWindows'
>

export type RealtimeSankeyGraph = {
  id: string
  title: string
  description: string
  nodes: SankeyNodeSpec[]
  links: SankeyLinkSpec[]
}

export type RealtimeMonitorKpi = {
  label: string
  value: number
  tone?: 'normal' | 'warning' | 'danger'
}

export type RealtimeMonitorData = {
  graphs: RealtimeSankeyGraph[]
  kpis: RealtimeMonitorKpi[]
  collections: RealtimeMonitorCollections
  fetchedAt: string
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function inWindow(value: unknown, windowHours: number) {
  if (windowHours <= 0) return true
  const raw = text(value)
  if (!raw) return false
  const time = new Date(raw).getTime()
  if (Number.isNaN(time)) return false
  return Date.now() - time <= windowHours * 3600_000
}

function countBy(items: Array<Record<string, unknown>>, pick: (item: Record<string, unknown>) => string) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = pick(item)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function bucketTop(items: Array<{ key: string; value: number }>, limit: number) {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, limit)
  const rest = sorted.slice(limit)
  if (rest.length) {
    top.push({ key: '其他', value: rest.reduce((sum, item) => sum + item.value, 0) })
  }
  return top
}

function nodeValue(nodeId: string) {
  return nodeId.slice(nodeId.indexOf(':') + 1)
}

function reverseLabel(labels: Record<string, string>) {
  return Object.fromEntries(Object.entries(labels).map(([key, value]) => [value, key]))
}

const CHANNEL_LABEL: Record<string, string> = {
  file_e: 'E 文件通道',
  message_queue: '流式处理引擎',
  existing_api: '已有 API',
  third_party_api: '已有 API',
}

function channelOf(sourceType: string) {
  return CHANNEL_LABEL[sourceType] ?? '数据库直连'
}

const LEVEL_LABEL: Record<string, string> = {
  l1: 'l1 仅聚合',
  l2: 'l2 明细受控',
  l3: 'l3 仅密态',
}

const OUTPUT_LABEL: Record<string, string> = {
  detail: '明细输出',
  masked: '脱敏输出',
  aggregate: '聚合输出',
  encrypted: '密态输出',
}

const ALGORITHM_LABEL: Record<string, string> = {
  bfv: '整数精确型',
  ckks: '浮点近似型',
}

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: '待执行',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  success: '已完成',
}

const SOURCE_COLUMNS = [
  { key: 'source_code', label: '数据源编码' },
  { key: 'source_name', label: '数据源名称' },
  { key: 'source_type', label: '来源类型' },
  { key: 'connection_status', label: '连接状态' },
  { key: 'owner_dept', label: '责任部门' },
  { key: 'secret_ref', label: '凭据引用' },
]

const RESOURCE_COLUMNS = [
  { key: 'resource_code', label: '资源编码' },
  { key: 'resource_name', label: '资源名称' },
  { key: 'protection_level', label: '防护层' },
  { key: 'link_status', label: '关联状态' },
  { key: 'resource_status', label: '资源状态' },
  { key: 'source_table', label: '基准物理表' },
]

const POLICY_COLUMNS = [
  { key: 'policy_code', label: '策略编码' },
  { key: 'policy_name', label: '策略名称' },
  { key: 'output_mode', label: '输出模式' },
  { key: 'policy_status', label: '策略状态' },
  { key: 'publish_status', label: '发布状态' },
  { key: 'scenario', label: '使用场景' },
]

const SUBJECT_COLUMNS = [
  { key: 'subject_code', label: '应用编码' },
  { key: 'subject_name', label: '应用名称' },
  { key: 'subject_type', label: '应用类型' },
  { key: 'organization_name', label: '所属组织' },
  { key: 'subject_status', label: '状态' },
]

const TASK_COLUMNS = [
  { key: 'task_code', label: '任务编码' },
  { key: 'task_name', label: '任务名称' },
  { key: 'algorithm', label: '算法' },
  { key: 'operation', label: '操作' },
  { key: 'task_status', label: '任务状态' },
  { key: 'measure_field_code', label: '量测字段' },
  { key: 'sample_count', label: '样本数' },
]

const INGEST_LOG_COLUMNS = [
  { key: 'batch_code', label: '批次编号' },
  { key: 'execution_type', label: '执行类型' },
  { key: 'result_status', label: '执行结果' },
  { key: 'started_at', label: '开始时间' },
  { key: 'input_count', label: '输入数' },
  { key: 'passed_count', label: '通过数' },
  { key: 'rejected_count', label: '拒绝数' },
]

const DECISION_LOG_COLUMNS = [
  { key: 'request_id', label: '请求编号' },
  { key: 'requested_at', label: '请求时间' },
  { key: 'subject_name', label: '数据应用' },
  { key: 'api_name', label: 'API' },
  { key: 'decision_result', label: '决策' },
  { key: 'risk_level', label: '风险级别' },
  { key: 'effective_output_mode', label: '输出模式' },
  { key: 'returned_rows', label: '返回行数' },
]

const STREAMING_RUN_COLUMNS = [
  { key: 'run_code', label: '批次编码' },
  { key: 'started_at', label: '开始时间' },
  { key: 'processed_events', label: '消费事件数' },
  { key: 'window_count', label: '窗口数' },
  { key: 'anomaly_count', label: '异常数' },
  { key: 'status', label: '状态' },
  { key: 'duration_ms', label: '耗时' },
]

const STREAMING_WINDOW_COLUMNS = [
  { key: 'window_start', label: '窗口开始' },
  { key: 'region_code', label: '区域' },
  { key: 'measure_type', label: '量测项' },
  { key: 'event_count', label: '事件数' },
  { key: 'anomaly_count', label: '异常数' },
  { key: 'sum_value', label: '合计' },
  { key: 'avg_value', label: '均值' },
]

const SUBJECT_CALL_COLUMNS = [
  ...SUBJECT_COLUMNS,
  { key: '__calls', label: '窗口调用' },
  { key: '__allow', label: '放行' },
  { key: '__deny', label: '拒绝' },
]

function sourceDetail(): SankeyDetailRule {
  return {
    title: '数据源明细',
    collection: 'sources',
    columns: SOURCE_COLUMNS,
    filter: (record, nodeId) => text(record.source_code) === nodeValue(nodeId),
  }
}

function channelDetail(): SankeyDetailRule {
  return {
    title: '接入通道数据源明细',
    collection: 'sources',
    columns: SOURCE_COLUMNS,
    filter: (record, nodeId) => channelOf(text(record.source_type)) === nodeValue(nodeId),
  }
}

function resourceLevelDetail(): SankeyDetailRule {
  return {
    title: '防护层资源明细',
    collection: 'resources',
    columns: RESOURCE_COLUMNS,
    filter: (record, nodeId) => text(record.protection_level) === nodeValue(nodeId),
  }
}

function resourceDetail(): SankeyDetailRule {
  return {
    title: '数据资源明细',
    collection: 'resources',
    columns: RESOURCE_COLUMNS,
    filter: (record, nodeId) => text(record.resource_code) === nodeValue(nodeId),
  }
}

function policyOutputDetail(): SankeyDetailRule {
  const reverse = reverseLabel(OUTPUT_LABEL)
  return {
    title: '输出模式访问策略明细',
    collection: 'policies',
    columns: POLICY_COLUMNS,
    filter: (record, nodeId) => text(record.output_mode) === reverse[nodeValue(nodeId)],
  }
}

type SubjectCallStats = { calls: number; allow: number; deny: number }

function subjectDetail(stats: Map<string, SubjectCallStats>): SankeyDetailRule {
  return {
    title: '数据应用明细',
    collection: 'subjects',
    columns: SUBJECT_CALL_COLUMNS,
    filter: (record, nodeId) => text(record.subject_name) === nodeValue(nodeId),
    transform: (record, nodeId) => {
      const current = stats.get(nodeValue(nodeId))
      return {
        ...record,
        __calls: current?.calls ?? 0,
        __allow: current?.allow ?? 0,
        __deny: current?.deny ?? 0,
      }
    },
  }
}

function ingestBySourceDetail(sourceId: unknown): SankeyDetailRule {
  return {
    title: '接入校验日志',
    collection: 'ingestLogs',
    columns: INGEST_LOG_COLUMNS,
    filter: (record) => String(record.data_source_id) === String(sourceId),
  }
}

function streamingRunDetail(): SankeyDetailRule {
  return {
    title: '流式处理批次日志',
    collection: 'streamingRuns',
    columns: STREAMING_RUN_COLUMNS,
    filter: () => true,
  }
}

function streamingWindowDetail(): SankeyDetailRule {
  return {
    title: '流式窗口统计',
    collection: 'streamingWindows',
    columns: STREAMING_WINDOW_COLUMNS,
    filter: () => true,
  }
}

function decisionByOutputDetail(input: RealtimeMonitorInput, output: string): SankeyDetailRule {
  const subjectById = new Map(input.subjects.map((subject) => [String(subject.id), subject]))
  const apiById = new Map(input.apis.map((api) => [String(api.id), api]))
  return {
    title: '调用与决策日志',
    collection: 'decisionLogs',
    columns: DECISION_LOG_COLUMNS,
    filter: (record) => (OUTPUT_LABEL[text(record.effective_output_mode)] ?? text(record.effective_output_mode)) === output,
    transform: (record) => ({
      ...record,
      subject_name: text(subjectById.get(String(record.subject_id))?.subject_name) || `主体${record.subject_id}`,
      api_name: text(apiById.get(String(record.api_resource_id))?.api_name) || `API${record.api_resource_id}`,
    }),
  }
}

function decisionBySubjectOutputDetail(input: RealtimeMonitorInput, subjectName: string, output: string): SankeyDetailRule {
  const subjectById = new Map(input.subjects.map((subject) => [String(subject.id), subject]))
  const apiById = new Map(input.apis.map((api) => [String(api.id), api]))
  return {
    title: '调用与决策日志',
    collection: 'decisionLogs',
    columns: DECISION_LOG_COLUMNS,
    filter: (record) =>
      (text(subjectById.get(String(record.subject_id))?.subject_name) || `主体${record.subject_id}`) === subjectName
      && (OUTPUT_LABEL[text(record.effective_output_mode)] ?? text(record.effective_output_mode)) === output,
    transform: (record) => ({
      ...record,
      subject_name: text(subjectById.get(String(record.subject_id))?.subject_name) || `主体${record.subject_id}`,
      api_name: text(apiById.get(String(record.api_resource_id))?.api_name) || `API${record.api_resource_id}`,
    }),
  }
}

function decisionAllDetail(input: RealtimeMonitorInput): SankeyDetailRule {
  const subjectById = new Map(input.subjects.map((subject) => [String(subject.id), subject]))
  const apiById = new Map(input.apis.map((api) => [String(api.id), api]))
  return {
    title: '调用与决策日志',
    collection: 'decisionLogs',
    columns: DECISION_LOG_COLUMNS,
    filter: () => true,
    transform: (record) => ({
      ...record,
      subject_name: text(subjectById.get(String(record.subject_id))?.subject_name) || `主体${record.subject_id}`,
      api_name: text(apiById.get(String(record.api_resource_id))?.api_name) || `API${record.api_resource_id}`,
    }),
  }
}

function taskDetail(input: RealtimeMonitorInput): SankeyDetailRule {
  const apiById = new Map(input.apis.map((api) => [String(api.id), api]))
  const resourceById = new Map(input.resources.map((resource) => [String(resource.id), resource]))
  return {
    title: '同态加密任务明细',
    collection: 'tasks',
    columns: TASK_COLUMNS,
    filter: (task, nodeId) => {
      const api = apiById.get(String(task.api_resource_id))
      const resource = resourceById.get(String(api?.resource_id))
      const resourceName = text(resource?.resource_name) || text(api?.api_name) || '未关联资源'
      return resourceName === nodeValue(nodeId)
    },
  }
}

function taskAlgorithmDetail(): SankeyDetailRule {
  const reverse = reverseLabel(ALGORITHM_LABEL)
  return {
    title: '算法任务明细',
    collection: 'tasks',
    columns: TASK_COLUMNS,
    filter: (record, nodeId) => reverse[nodeValue(nodeId)] === text(record.algorithm).toLowerCase(),
  }
}

function taskOperationDetail(): SankeyDetailRule {
  return {
    title: '计算操作任务明细',
    collection: 'tasks',
    columns: TASK_COLUMNS,
    filter: (record, nodeId) => {
      const operation = text(record.operation) === 'sum' ? '求和' : text(record.operation) === 'mean' ? '平均值' : '未标注'
      return operation === nodeValue(nodeId)
    },
  }
}

function taskStatusDetail(): SankeyDetailRule {
  const reverse = reverseLabel(TASK_STATUS_LABEL)
  return {
    title: '任务状态明细',
    collection: 'tasks',
    columns: TASK_COLUMNS,
    filter: (record, nodeId) => reverse[nodeValue(nodeId)] === text(record.task_status),
  }
}

function taskVerificationDetail(): SankeyDetailRule {
  return {
    title: '结果校验任务明细',
    collection: 'tasks',
    columns: TASK_COLUMNS,
    filter: (record, nodeId) => {
      const expected = nodeValue(nodeId)
      if (expected === '未执行校验') {
        return !['completed', 'success'].includes(text(record.task_status))
      }
      const summary = (record.execution_summary_json ?? {}) as Record<string, unknown>
      const result = (summary.result ?? {}) as Record<string, unknown>
      const resultSummary = (result.resultSummary ?? {}) as Record<string, unknown>
      const passed = resultSummary.verificationPassed === true
      return expected === (passed ? '校验通过' : '校验失败')
    },
  }
}

function buildFlowGraph(input: RealtimeMonitorInput): RealtimeSankeyGraph {
  const sourceById = new Map(input.sources.map((source) => [String(source.id), source]))
  const enabledResources = input.resources.filter((resource) => text(resource.resource_status) !== 'disabled')
  // 第一列与系统数据源管理保持一致：展示全部活动数据源（源端系统）
  const activeSources = input.sources.filter((source) => text(source.connection_status) !== 'disabled')
  const nodes: SankeyNodeSpec[] = []
  const links: SankeyLinkSpec[] = []
  const sourceIds = new Set<string>()
  for (const source of activeSources) {
    const code = text(source.source_code)
    if (!code || sourceIds.has(code)) continue
    sourceIds.add(code)
    nodes.push({
      id: `src:${code}`,
      label: text(source.source_name) || code,
      column: 0,
      detail: sourceDetail(),
      href: '/security-governance/ingest/sources',
    })
    const channel = channelOf(text(source.source_type))
    if (!nodes.some((node) => node.id === `ch:${channel}`)) {
      nodes.push({ id: `ch:${channel}`, label: channel, column: 1, detail: channel === '流式处理引擎' ? streamingRunDetail() : channelDetail() })
    }
    links.push({ from: `src:${code}`, to: `ch:${channel}`, value: 1, detail: ingestBySourceDetail(source.id) })
  }
  // 数据资源层：每个启用资源从其所属源的接入通道流入具体资源节点
  for (const resource of enabledResources) {
    const code = text(resource.resource_code)
    const level = text(resource.protection_level) || 'l2'
    const source = sourceById.get(String(resource.data_source_id))
    const sourceCode = text(source?.source_code)
    if (!nodes.some((node) => node.id === `res:${code}`)) {
      nodes.push({
        id: `res:${code}`,
        label: text(resource.resource_name) || code,
        column: 2,
        detail: resourceDetail(),
        href: `/security-governance/resources/${String(resource.id)}`,
      })
    }
    if (!nodes.some((node) => node.id === `pr:${level}`)) {
      nodes.push({ id: `pr:${level}`, label: LEVEL_LABEL[level] ?? level, column: 3, detail: resourceLevelDetail() })
    }
    if (sourceCode) {
      const channel = channelOf(text(source?.source_type))
      links.push({ from: `ch:${channel}`, to: `res:${code}`, value: 1, detail: ingestBySourceDetail(resource.data_source_id) })
    }
    links.push({ from: `res:${code}`, to: `pr:${level}`, value: 1, detail: ingestBySourceDetail(resource.data_source_id) })
  }

  // 流式数据接入分支：接入通道（流式处理引擎）→ 流式量测窗口统计（虚拟资源）→ 防护层 l2 → 聚合输出 → 客户应用
  if (nodes.some((node) => node.id === 'ch:流式处理引擎')) {
    if (!nodes.some((node) => node.id === 'res:STREAM-WINDOW')) {
      nodes.push({ id: 'res:STREAM-WINDOW', label: '流式量测窗口统计', column: 2, detail: streamingWindowDetail() })
    }
    links.push({ from: 'ch:流式处理引擎', to: 'res:STREAM-WINDOW', value: 1, detail: streamingWindowDetail() })
    if (!nodes.some((node) => node.id === 'pr:l2')) {
      nodes.push({ id: 'pr:l2', label: LEVEL_LABEL['l2'] ?? 'l2', column: 3, detail: resourceLevelDetail() })
    }
    links.push({ from: 'res:STREAM-WINDOW', to: 'pr:l2', value: 1, detail: streamingWindowDetail() })
    if (!nodes.some((node) => node.id === 'om:聚合输出')) {
      nodes.push({ id: 'om:聚合输出', label: '聚合输出', column: 4, detail: policyOutputDetail() })
    }
    if (!links.some((link) => link.from === 'pr:l2' && link.to === 'om:聚合输出')) {
      links.push({ from: 'pr:l2', to: 'om:聚合输出', value: 1, detail: streamingWindowDetail() })
    }
    for (const subjectName of ['智慧城市大脑应用', '全链路监控应用']) {
      if (!nodes.some((node) => node.id === `app:${subjectName}`)) {
        nodes.push({
          id: `app:${subjectName}`,
          label: subjectName,
          column: 5,
          detail: subjectDetail({} as Map<string, SubjectCallStats>),
          href: '/security-governance/access/subjects',
        })
      }
      if (!links.some((link) => link.from === 'om:聚合输出' && link.to === `app:${subjectName}`)) {
        links.push({ from: 'om:聚合输出', to: `app:${subjectName}`, value: 1, detail: streamingWindowDetail() })
      }
    }
  }

  const publishedPolicies = input.policies.filter(
    (policy) =>
      text(policy.policy_kind) === 'access_policy'
      && text(policy.policy_status) === 'enabled'
      && text(policy.publish_status) === 'success',
  )
  const apiById = new Map(input.apis.map((api) => [String(api.id), api]))
  const subjectById = new Map(input.subjects.map((subject) => [String(subject.id), subject]))
  // 窗口内调用与决策日志：输出模式 → 数据应用 按真实调用量加权，应用明细附加放行/拒绝统计
  const windowDecisionLogs = input.decisionLogs.filter((log) => inWindow(log.requested_at, input.windowHours))
  const subjectCallStats = new Map<string, SubjectCallStats>()
  const outputAppCounts = new Map<string, number>()
  for (const log of windowDecisionLogs) {
    const subjectName = text(subjectById.get(String(log.subject_id))?.subject_name) || `主体${log.subject_id}`
    const outputMode = text(log.effective_output_mode) || 'detail'
    const output = OUTPUT_LABEL[outputMode] ?? outputMode
    const current = subjectCallStats.get(subjectName) ?? { calls: 0, allow: 0, deny: 0 }
    current.calls += 1
    if (text(log.decision_result) === 'allow') current.allow += 1
    if (text(log.decision_result) === 'deny') current.deny += 1
    subjectCallStats.set(subjectName, current)
    const key = `${output}|${subjectName}`
    outputAppCounts.set(key, (outputAppCounts.get(key) ?? 0) + 1)
  }
  const subjectDetailRule = subjectDetail(subjectCallStats)
  const authorizedAppKeys = new Set<string>()
  for (const policy of publishedPolicies) {
    const outputMode = text(policy.output_mode) || 'detail'
    const output = OUTPUT_LABEL[outputMode] ?? outputMode
    if (!nodes.some((node) => node.id === `om:${output}`)) nodes.push({ id: `om:${output}`, label: output, column: 4, detail: policyOutputDetail() })
    const profile = (policy.security_profile_json ?? {}) as Record<string, unknown>
    const rawLevels = profile.protectionLevels
    let levels: string[] = Array.isArray(rawLevels) ? rawLevels.map((item) => text(item)).filter(Boolean) : []
    if (!levels.length && policy.api_resource_id) {
      const api = apiById.get(String(policy.api_resource_id))
      const apiLevel = text(api?.protection_level)
      if (apiLevel) levels = [apiLevel]
    }
    if (!levels.length) levels = ['未指定']
    for (const level of levels) {
      if (!nodes.some((node) => node.id === `pr:${level}`)) nodes.push({ id: `pr:${level}`, label: LEVEL_LABEL[level] ?? level, column: 3, detail: resourceLevelDetail() })
      links.push({ from: `pr:${level}`, to: `om:${output}`, value: 1, detail: decisionByOutputDetail(input, output) })
    }
    const subjectName = text(subjectById.get(String(policy.subject_id))?.subject_name)
    if (subjectName) {
      if (!nodes.some((node) => node.id === `app:${subjectName}`)) {
        nodes.push({
          id: `app:${subjectName}`,
          label: subjectName,
          column: 5,
          detail: subjectDetailRule,
          href: '/security-governance/access/subjects',
        })
      }
      authorizedAppKeys.add(`${output}|${subjectName}`)
    }
  }
  for (const [key, value] of outputAppCounts) {
    const [output, subjectName] = key.split('|')
    if (!nodes.some((node) => node.id === `om:${output}`)) nodes.push({ id: `om:${output}`, label: output, column: 4, detail: policyOutputDetail() })
    if (!nodes.some((node) => node.id === `app:${subjectName}`)) nodes.push({ id: `app:${subjectName}`, label: subjectName, column: 5, detail: subjectDetailRule })
    links.push({
      from: `om:${output}`,
      to: `app:${subjectName}`,
      value: Math.max(1, value),
      detail: decisionBySubjectOutputDetail(input, subjectName, output),
    })
  }
  // 已授权但窗口内未调用的应用：保留授权基线流量，应用节点仍可见
  for (const key of authorizedAppKeys) {
    if (outputAppCounts.has(key)) continue
    const [output, subjectName] = key.split('|')
    if (!nodes.some((node) => node.id === `om:${output}`)) nodes.push({ id: `om:${output}`, label: output, column: 4, detail: policyOutputDetail() })
    if (!nodes.some((node) => node.id === `app:${subjectName}`)) nodes.push({ id: `app:${subjectName}`, label: subjectName, column: 5, detail: subjectDetailRule })
    links.push({
      from: `om:${output}`,
      to: `app:${subjectName}`,
      value: 1,
      detail: decisionBySubjectOutputDetail(input, subjectName, output),
    })
  }
  return {
    id: 'flow',
    title: '分层策略流转',
    description: '数据源（源端系统）→ 接入通道（含流式处理引擎）→ 数据资源 → 数据中台资源防护层 → 数据服务输出模式 → 数据应用',
    nodes,
    links,
  }
}

function buildHomomorphicGraph(input: RealtimeMonitorInput): RealtimeSankeyGraph {
  const nodes: SankeyNodeSpec[] = []
  const links: SankeyLinkSpec[] = []
  const apiById = new Map(input.apis.map((api) => [String(api.id), api]))
  const resourceById = new Map(input.resources.map((resource) => [String(resource.id), resource]))
  const taskResourceCounts = new Map<string, number>()
  for (const task of input.tasks) {
    const api = apiById.get(String(task.api_resource_id))
    const resource = resourceById.get(String(api?.resource_id))
    const key = text(resource?.resource_name) || text(api?.api_name) || '未关联资源'
    taskResourceCounts.set(key, (taskResourceCounts.get(key) ?? 0) + 1)
  }
  const topResources = bucketTop(
    [...taskResourceCounts].map(([key, value]) => ({ key, value })),
    8,
  )
  const taskDetailRule = taskDetail(input)
  for (const item of topResources) nodes.push({ id: `tr:${item.key}`, label: item.key, column: 0, detail: taskDetailRule })

  for (const task of input.tasks) {
    const api = apiById.get(String(task.api_resource_id))
    const resource = resourceById.get(String(api?.resource_id))
    const resourceKey = text(resource?.resource_name) || text(api?.api_name) || '未关联资源'
    const sourceNode = topResources.some((item) => item.key === resourceKey) ? `tr:${resourceKey}` : `tr:其他`
    const algorithm = ALGORITHM_LABEL[text(task.algorithm).toLowerCase()] ?? text(task.algorithm) ?? '未标注'
    if (!nodes.some((node) => node.id === `al:${algorithm}`)) nodes.push({ id: `al:${algorithm}`, label: algorithm, column: 1, detail: taskAlgorithmDetail() })
    links.push({ from: sourceNode, to: `al:${algorithm}`, value: 1 })
    const operation = text(task.operation) === 'sum' ? '求和' : text(task.operation) === 'mean' ? '平均值' : '未标注'
    if (!nodes.some((node) => node.id === `op:${operation}`)) nodes.push({ id: `op:${operation}`, label: operation, column: 2, detail: taskOperationDetail() })
    links.push({ from: `al:${algorithm}`, to: `op:${operation}`, value: 1 })
    const status = TASK_STATUS_LABEL[text(task.task_status)] ?? text(task.task_status) ?? '待执行'
    if (!nodes.some((node) => node.id === `ts:${status}`)) nodes.push({ id: `ts:${status}`, label: status, column: 3, detail: taskStatusDetail() })
    links.push({ from: `op:${operation}`, to: `ts:${status}`, value: 1 })
    let verification = '未执行校验'
    if (text(task.task_status) === 'completed' || text(task.task_status) === 'success') {
      const summary = (task.execution_summary_json ?? {}) as Record<string, unknown>
      const result = (summary.result ?? {}) as Record<string, unknown>
      const resultSummary = (result.resultSummary ?? {}) as Record<string, unknown>
      verification = resultSummary.verificationPassed === true ? '校验通过' : '校验失败'
    }
    if (!nodes.some((node) => node.id === `vf:${verification}`)) nodes.push({ id: `vf:${verification}`, label: verification, column: 4, detail: taskVerificationDetail() })
    links.push({ from: `ts:${status}`, to: `vf:${verification}`, value: 1 })
  }
  return {
    id: 'homomorphic',
    title: '同态加密流转',
    description: '数据资源 → 算法 → 计算操作 → 任务状态 → 结果校验',
    nodes,
    links,
  }
}

export function buildRealtimeMonitorGraphs(input: RealtimeMonitorInput): RealtimeMonitorData {
  const activeSources = input.sources.filter((source) => text(source.connection_status) !== 'disabled')
  const enabledResources = input.resources.filter((resource) => text(resource.resource_status) !== 'disabled')
  const publishedPolicies = input.policies.filter(
    (policy) =>
      text(policy.policy_kind) === 'access_policy'
      && text(policy.policy_status) === 'enabled'
      && text(policy.publish_status) === 'success',
  )
  const tasks = input.tasks
  const windowLogs = input.decisionLogs.filter((log) => inWindow(log.requested_at, input.windowHours))
  const windowIngestLogs = input.ingestLogs.filter((log) => inWindow(log.started_at, input.windowHours))
  const allowCount = windowLogs.filter((log) => text(log.decision_result) === 'allow').length
  const denyCount = windowLogs.filter((log) => text(log.decision_result) === 'deny').length
  const completedTasks = tasks.filter((task) => ['completed', 'success'].includes(text(task.task_status))).length
  const failedTasks = tasks.filter((task) => text(task.task_status) === 'failed').length
  const exceptionSources = activeSources.filter((source) => text(source.connection_status) === 'exception').length
  const failedIngest = windowIngestLogs.filter((log) => text(log.result_status) === 'failed').length

  return {
    graphs: [
      buildFlowGraph(input),
      buildHomomorphicGraph(input),
    ],
    kpis: [
      { label: '数据源（活动）', value: activeSources.length, tone: exceptionSources ? 'warning' : 'normal' },
      { label: '接入校验失败', value: failedIngest, tone: failedIngest ? 'danger' : 'normal' },
      { label: '资源（启用）', value: enabledResources.length },
      { label: '已发布访问策略', value: publishedPolicies.length },
      { label: '密态任务已完成', value: completedTasks },
      { label: '密态任务失败', value: failedTasks, tone: failedTasks ? 'danger' : 'normal' },
      { label: '窗口放行', value: allowCount },
      { label: '窗口拒绝', value: denyCount, tone: denyCount ? 'warning' : 'normal' },
    ],
    collections: {
      sources: input.sources,
      resources: input.resources,
      policies: input.policies,
      tasks: input.tasks,
      decisionLogs: input.decisionLogs,
      ingestLogs: input.ingestLogs,
      subjects: input.subjects,
      apis: input.apis,
      streamingRuns: input.streamingRuns,
      streamingWindows: input.streamingWindows,
    },
    fetchedAt: new Date().toISOString(),
  }
}

export async function fetchRealtimeMonitorData(windowHours: number): Promise<RealtimeMonitorData> {
  const since = windowHours > 0 ? new Date(Date.now() - windowHours * 3600_000).toISOString() : undefined
  const decisionFilter = since ? { requested_at: { $gte: since } } : undefined
  const [sources, resources, policies, tasks, decisionLogs, ingestLogs, subjects, apis, streamingRuns, streamingWindows] = await Promise.all([
    listSecurityV3Records('security_data_sources'),
    listSecurityV3Records('eco_data_resources'),
    listSecurityV3Records('eco_resource_security_policies'),
    listSecurityV3Records('security_confidential_tasks'),
    listSecurityV3Records('security_policy_decision_logs', { filter: decisionFilter, sort: ['-requested_at'] }),
    listSecurityV3Records('security_ingest_logs', { sort: ['-started_at'] }),
    listSecurityV3Records('security_access_subjects'),
    listSecurityV3Records('security_api_resources'),
    listSecurityV3Records('security_streaming_runs', { sort: ['-started_at'] }),
    listSecurityV3Records('security_streaming_windows', { sort: ['-window_start'] }),
  ])
  return buildRealtimeMonitorGraphs({ sources, resources, policies, tasks, decisionLogs, ingestLogs, subjects, apis, streamingRuns, streamingWindows, windowHours })
}
