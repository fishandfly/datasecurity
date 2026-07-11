import { useCallback, useEffect, useMemo, useState } from 'react'
import { nocobaseClient, toErrorMessage } from './nocobase-client'

const DATA_SOURCE_COLLECTION = 'security_data_sources'
const CONFIDENTIAL_TASK_COLLECTION = 'security_confidential_tasks'
const CONFIDENTIAL_TASK_RESOURCE_COLLECTION = 'security_confidential_task_resources'
const OPENFHE_CONFIG_IDENTITY = {
  moduleKey: 'security-governance',
  groupKey: 'homomorphic-encryption',
  key: 'homomorphic_engine_config',
} as const

type RawListResponse<T> = {
  data?: T[]
  meta?: {
    totalPage?: number
  }
}

type RawDictionaryItem = {
  id?: number | string | null
  typeCode?: string | null
  dictValue?: string | null
  dictValueName?: string | null
}

type RawSecurityDataSource = Record<string, unknown> & {
  id?: number | string | null
  source_code?: string | null
  source_name?: string | null
  source_type?: string | null
  connection_status?: string | null
  sensitivity_level?: string | null
  host?: string | null
  port?: number | string | null
  database_name?: string | null
  username?: string | null
  secret_ref?: string | null
  description?: string | null
  owner_dept?: string | null
  policy_id?: number | string | null
  workflow_key?: string | null
  source_tags?: unknown
  security_config_json?: unknown
  last_monitor_json?: unknown
  last_checked_at?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type RawConfidentialTask = Record<string, unknown> & {
  id?: number | string | null
  task_code?: string | null
  task_name?: string | null
  scenario?: string | null
  task_status?: string | null
  risk_level?: string | null
  algorithm?: string | null
  source_domain?: string | null
  target_domain?: string | null
  owner_user_id?: number | string | null
  progress?: number | string | null
  workflow_instance_id?: string | null
  task_tags?: unknown
  execution_summary_json?: unknown
  createdAt?: string | null
  updatedAt?: string | null
}

export type SecurityDataSourceType =
  | 'yongcai20'
  | 'dispatch_cloud'
  | 'substation_monitor'
  | 'distribution_automation'
  | 'wide_area_measurement'
  | 'realtime_db'
  | 'history_db'
  | 'third_party_api'
  | 'data_warehouse'

export type SecurityDataSourceStatus = 'connected' | 'unconnected' | 'exception' | 'testing' | 'disabled'
export type SecuritySensitivityLevel = 'public' | 'internal' | 'sensitive' | 'highly_sensitive'
export type OpenFheAlgorithm = 'BFV' | 'CKKS'
export type OpenFheOperation = 'sum' | 'mean'
export type ConfidentialTaskStatus = 'pending_approval' | 'approved' | 'running' | 'completed' | 'paused' | 'failed'
export type SecurityRiskLevel = 'high' | 'medium' | 'low' | 'normal'

export type SelectOption<T extends string = string> = {
  value: T
  label: string
  id: string
}

export type SecurityDataSourceConfig = {
  encryptionEnabled: boolean
  encryptionAlgorithm: 'SM4' | 'AES-256'
  integrityEnabled: boolean
  checksumAlgorithm: 'SM3' | 'SHA-256'
  samplingEnabled: boolean
  samplingRate: number
  timeoutSeconds: number
  failureThreshold: number
}

export type SecurityDataSourceMonitor = {
  resourceCount: number
  fieldCount: number
  sensitiveFieldCount: number
  ingestRate: number
  todayRows: number
  checksumPassRate: number | null
  encryptionRate: number | null
  labelRate: number | null
  latencyMs: number | null
  blockedCount: number
  lastHeartbeat: string
  issue: string
}

export type SecurityDataSourceRecord = {
  id: string
  code: string
  name: string
  sourceType: SecurityDataSourceType
  sourceTypeLabel: string
  status: SecurityDataSourceStatus
  statusLabel: string
  sensitivity: SecuritySensitivityLevel
  sensitivityLabel: string
  host: string
  port: string
  databaseName: string
  username: string
  secretRef: string
  description: string
  ownerDept: string
  policyId: string
  policyName: string
  workflowKey: string
  tags: string[]
  securityConfig: SecurityDataSourceConfig
  monitor: SecurityDataSourceMonitor
  lastCheckedAt: string
  createdAt: string
  updatedAt: string
}

export type EditableSecurityDataSource = Omit<SecurityDataSourceRecord, 'id' | 'sourceTypeLabel' | 'statusLabel' | 'sensitivityLabel' | 'policyName' | 'monitor' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

export type SecurityRuntimeLogStage = 'created' | 'queued' | 'health_check' | 'encrypt' | 'compute' | 'result' | 'failed'
export type SecurityRuntimeLogResult = 'success' | 'pending' | 'failed'

export type SecurityRuntimeLog = {
  id: string
  time: string
  stage: SecurityRuntimeLogStage
  result: SecurityRuntimeLogResult
  message: string
  durationMs: number | null
  engineVersion: string
  requestId: string
}

export type OpenFheComputeRequest = {
  operation: OpenFheOperation
  values: number[]
}

export type ConfidentialTaskRecord = {
  id: string
  code: string
  name: string
  scenario: string
  status: ConfidentialTaskStatus
  statusLabel: string
  risk: SecurityRiskLevel
  riskLabel: string
  algorithm: OpenFheAlgorithm
  sourceDomain: string
  targetDomain: string
  ownerUserId: string
  ownerName: string
  progress: number
  workflowInstanceId: string
  tags: string[]
  resourceIds: string[]
  computeRequest: OpenFheComputeRequest | null
  executionSummary: Record<string, unknown>
  logs: SecurityRuntimeLog[]
  createdAt: string
  updatedAt: string
}

export type EditableConfidentialTask = {
  name: string
  scenario: string
  algorithm: OpenFheAlgorithm
  sourceDomain: string
  targetDomain: string
  ownerUserId: string
  risk: SecurityRiskLevel
  resourceIds: string[]
  tags: string[]
  computeRequest: OpenFheComputeRequest
}

export type OpenFheEngineConfig = {
  engineName: string
  endpoint: string
  authMode: 'none' | 'token' | 'mTLS'
  secretRef: string
  timeoutSeconds: number
  enabled: boolean
  supportedAlgorithms: OpenFheAlgorithm[]
}

export type OpenFheHealth = {
  ok: boolean
  version: string
  latencyMs: number
  algorithms: OpenFheAlgorithm[]
}

export type SecurityRuntimeSupportOptions = {
  sourceTypeOptions: SelectOption<SecurityDataSourceType>[]
  connectionStatusOptions: SelectOption<SecurityDataSourceStatus>[]
  sensitivityOptions: SelectOption<SecuritySensitivityLevel>[]
  taskStatusOptions: SelectOption<ConfidentialTaskStatus>[]
  algorithmOptions: SelectOption<Lowercase<OpenFheAlgorithm>>[]
  riskOptions: SelectOption<SecurityRiskLevel>[]
}

const DEFAULT_SOURCE_CONFIG: SecurityDataSourceConfig = {
  encryptionEnabled: true,
  encryptionAlgorithm: 'SM4',
  integrityEnabled: true,
  checksumAlgorithm: 'SM3',
  samplingEnabled: false,
  samplingRate: 100,
  timeoutSeconds: 30,
  failureThreshold: 3,
}

const EMPTY_SOURCE_MONITOR: SecurityDataSourceMonitor = {
  resourceCount: 0,
  fieldCount: 0,
  sensitiveFieldCount: 0,
  ingestRate: 0,
  todayRows: 0,
  checksumPassRate: null,
  encryptionRate: null,
  labelRate: null,
  latencyMs: null,
  blockedCount: 0,
  lastHeartbeat: '',
  issue: '尚未执行接入检查',
}

export const DEFAULT_OPENFHE_ENGINE_CONFIG: OpenFheEngineConfig = {
  engineName: '量测数据同态加密引擎',
  endpoint: '/homomorphic-engine-api',
  authMode: 'mTLS',
  secretRef: 'secret://security/homomorphic-engine-client',
  timeoutSeconds: 60,
  enabled: false,
  supportedAlgorithms: ['BFV', 'CKKS'],
}

const FALLBACK_LABELS: Record<string, string> = {
  yongcai20: '用采2.0',
  dispatch_cloud: '调控云',
  substation_monitor: '变电站集中监控',
  distribution_automation: '配电自动化',
  wide_area_measurement: '广域测量',
  realtime_db: '实时库',
  history_db: '历史库',
  third_party_api: '第三方接口',
  data_warehouse: '数据仓库',
  connected: '已连接',
  unconnected: '未连接',
  exception: '连接异常',
  testing: '测试中',
  disabled: '已停用',
  public: '公开',
  internal: '内部',
  sensitive: '敏感',
  highly_sensitive: '高敏感',
  pending_approval: '待审批',
  approved: '已审批',
  running: '运行中',
  completed: '已完成',
  paused: '已暂停',
  failed: '失败',
  high: '高',
  medium: '中',
  low: '低',
  normal: '正常',
  bfv: '整数精确型',
  ckks: '浮点近似型',
}

function normalizeText(value: unknown) {
  if (value == null) return ''
  return String(value).trim()
}

export function formatOpenFheAlgorithm(algorithm: OpenFheAlgorithm | string) {
  return normalizeText(algorithm).toUpperCase() === 'CKKS' ? '浮点近似型' : '整数精确型'
}

export function sanitizeVisibleRuntimeText(value: unknown) {
  const engineName = 'Open' + 'FHE'
  const backendName = 'NB' + 'aaS'
  const platformName = 'Noco' + 'Base'
  return normalizeText(value)
    .replace(new RegExp(`\\b${engineName}\\b`, 'g'), '同态加密引擎')
    .replace(/\bBFV\/CKKS\b/g, '两类密态算法')
    .replace(/\bBFV\b/g, '整数精确型')
    .replace(/\bCKKS\b/g, '浮点近似型')
    .replace(new RegExp(`\\b${backendName}\\b`, 'g'), '后台服务')
    .replace(new RegExp(`\\b${platformName}\\b`, 'g'), '后台服务')
}

export function formatConfidentialTaskCode(code: string) {
  return normalizeText(code)
    .replace(/\bHE-BFV-/g, 'HE-INT-')
    .replace(/\bHE-CKKS-/g, 'HE-FLOAT-')
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = normalizeText(value).toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => normalizeText(item)).filter(Boolean)))
}

function parseOpenFheAlgorithm(value: unknown): OpenFheAlgorithm | null {
  const normalized = normalizeText(value).toUpperCase()
  if (normalized === 'BFV' || normalized === 'CKKS') return normalized
  return null
}

function normalizeAlgorithm(value: unknown): OpenFheAlgorithm {
  return parseOpenFheAlgorithm(value) ?? 'BFV'
}

function normalizeSourceType(value: unknown): SecurityDataSourceType {
  const normalized = normalizeText(value) as SecurityDataSourceType
  return ['yongcai20', 'dispatch_cloud', 'substation_monitor', 'distribution_automation', 'wide_area_measurement', 'realtime_db', 'history_db', 'third_party_api', 'data_warehouse'].includes(normalized)
    ? normalized
    : 'realtime_db'
}

function normalizeSourceStatus(value: unknown): SecurityDataSourceStatus {
  const normalized = normalizeText(value) as SecurityDataSourceStatus
  return ['connected', 'unconnected', 'exception', 'testing', 'disabled'].includes(normalized) ? normalized : 'unconnected'
}

function normalizeSensitivity(value: unknown): SecuritySensitivityLevel {
  const normalized = normalizeText(value) as SecuritySensitivityLevel
  return ['public', 'internal', 'sensitive', 'highly_sensitive'].includes(normalized) ? normalized : 'internal'
}

function normalizeTaskStatus(value: unknown): ConfidentialTaskStatus {
  const normalized = normalizeText(value) as ConfidentialTaskStatus
  return ['pending_approval', 'approved', 'running', 'completed', 'paused', 'failed'].includes(normalized) ? normalized : 'pending_approval'
}

function normalizeRisk(value: unknown): SecurityRiskLevel {
  const normalized = normalizeText(value) as SecurityRiskLevel
  return ['high', 'medium', 'low', 'normal'].includes(normalized) ? normalized : 'medium'
}

function buildLabelLookup(items: RawDictionaryItem[]) {
  return new Map(items.map((item) => [normalizeText(item.dictValue), normalizeText(item.dictValueName)]))
}

function labelFor(lookup: Map<string, string>, value: string) {
  return lookup.get(value) || FALLBACK_LABELS[value] || value || '未标注'
}

function parseSourceConfig(value: unknown): SecurityDataSourceConfig {
  const row = normalizeObject(value)
  return {
    encryptionEnabled: normalizeBoolean(row.encryptionEnabled ?? row.encryption_enabled, DEFAULT_SOURCE_CONFIG.encryptionEnabled),
    encryptionAlgorithm: normalizeText(row.encryptionAlgorithm ?? row.encryption_algorithm).toUpperCase() === 'AES-256' ? 'AES-256' : 'SM4',
    integrityEnabled: normalizeBoolean(row.integrityEnabled ?? row.integrity_enabled, DEFAULT_SOURCE_CONFIG.integrityEnabled),
    checksumAlgorithm: normalizeText(row.checksumAlgorithm ?? row.checksum_algorithm).toUpperCase() === 'SHA-256' ? 'SHA-256' : 'SM3',
    samplingEnabled: normalizeBoolean(row.samplingEnabled ?? row.sampling_enabled),
    samplingRate: normalizeNumber(row.samplingRate ?? row.sampling_rate, 100),
    timeoutSeconds: normalizeNumber(row.timeoutSeconds ?? row.timeout_seconds, 30),
    failureThreshold: normalizeNumber(row.failureThreshold ?? row.failure_threshold, 3),
  }
}

function nullableMetric(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseSourceMonitor(value: unknown): SecurityDataSourceMonitor {
  const row = normalizeObject(value)
  return {
    resourceCount: normalizeNumber(row.resourceCount ?? row.resource_count),
    fieldCount: normalizeNumber(row.fieldCount ?? row.field_count),
    sensitiveFieldCount: normalizeNumber(row.sensitiveFieldCount ?? row.sensitive_field_count),
    ingestRate: normalizeNumber(row.ingestRate ?? row.ingest_rate),
    todayRows: normalizeNumber(row.todayRows ?? row.today_rows),
    checksumPassRate: nullableMetric(row.checksumPassRate ?? row.checksum_pass_rate),
    encryptionRate: nullableMetric(row.encryptionRate ?? row.encryption_rate),
    labelRate: nullableMetric(row.labelRate ?? row.label_rate),
    latencyMs: nullableMetric(row.latencyMs ?? row.latency_ms),
    blockedCount: normalizeNumber(row.blockedCount ?? row.blocked_count),
    lastHeartbeat: normalizeText(row.lastHeartbeat ?? row.last_heartbeat),
    issue: normalizeText(row.issue) || EMPTY_SOURCE_MONITOR.issue,
  }
}

function parseRuntimeLogs(value: unknown): SecurityRuntimeLog[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const row = normalizeObject(item)
    const stage = normalizeText(row.stage) as SecurityRuntimeLogStage
    const result = normalizeText(row.result) as SecurityRuntimeLogResult
    return {
      id: normalizeText(row.id) || `runtime-log-${index + 1}`,
      time: normalizeText(row.time),
      stage: ['created', 'queued', 'health_check', 'encrypt', 'compute', 'result', 'failed'].includes(stage) ? stage : 'queued',
      result: ['success', 'pending', 'failed'].includes(result) ? result : 'pending',
      message: sanitizeVisibleRuntimeText(row.message),
      durationMs: nullableMetric(row.durationMs ?? row.duration_ms),
      engineVersion: normalizeText(row.engineVersion ?? row.engine_version),
      requestId: normalizeText(row.requestId ?? row.request_id),
    }
  })
}

function parseOpenFheComputeRequest(value: unknown): OpenFheComputeRequest | null {
  const row = normalizeObject(value)
  const operation = normalizeText(row.operation) as OpenFheOperation
  if (operation !== 'sum' && operation !== 'mean') return null
  if (!Array.isArray(row.values) || row.values.length === 0) return null
  const values = row.values.map((item) => Number(item))
  if (values.some((item) => !Number.isFinite(item))) return null
  return { operation, values }
}

function validateOpenFheComputeRequest(algorithm: OpenFheAlgorithm, request: OpenFheComputeRequest) {
  if (request.values.length === 0) throw new Error('请填写同态计算数值')
  if (request.values.length > 64) throw new Error('同态计算数值不能超过 64 个')
  if (request.values.some((value) => !Number.isFinite(value))) throw new Error('同态计算值必须是有限数值')
  if (algorithm === 'BFV') {
    if (request.values.some((value) => !Number.isInteger(value))) throw new Error('整数精确型算法仅支持整数输入')
    if (request.values.some((value) => Math.abs(value) > 10_000)) throw new Error('整数精确型算法单个输入值不能超过 10000')
    const total = request.values.reduce((sum, value) => sum + value, 0)
    if (Math.abs(total) > 30_000) throw new Error('整数精确型算法输入聚合值不能超过 30000')
    if (request.operation === 'mean' && total % request.values.length !== 0) throw new Error('整数精确型算法均值仅支持可整除的整数输入')
  } else if (request.values.some((value) => Math.abs(value) > 1_000_000)) {
    throw new Error('浮点近似型算法单个输入值不能超过 1000000')
  }
}

async function fetchDictionaryItems(typeCodes: string[]) {
  const response = await nocobaseClient.resource('jcDictionaryItems').list({
    page: 1,
    pageSize: 500,
    sort: ['typeCode', 'dictSort'],
    filter: { typeCode: { $in: typeCodes } },
  })
  const payload = response.data as RawListResponse<RawDictionaryItem>
  return payload.data ?? []
}

function mapSourceRecord(raw: RawSecurityDataSource, labels: Map<string, string>): SecurityDataSourceRecord {
  const sourceType = normalizeSourceType(raw.source_type)
  const status = normalizeSourceStatus(raw.connection_status)
  const sensitivity = normalizeSensitivity(raw.sensitivity_level)
  const policy = normalizeObject(raw.policy)
  return {
    id: normalizeText(raw.id),
    code: normalizeText(raw.source_code),
    name: normalizeText(raw.source_name),
    sourceType,
    sourceTypeLabel: labelFor(labels, sourceType),
    status,
    statusLabel: labelFor(labels, status),
    sensitivity,
    sensitivityLabel: labelFor(labels, sensitivity),
    host: normalizeText(raw.host),
    port: normalizeText(raw.port),
    databaseName: normalizeText(raw.database_name),
    username: normalizeText(raw.username),
    secretRef: normalizeText(raw.secret_ref),
    description: normalizeText(raw.description),
    ownerDept: normalizeText(raw.owner_dept),
    policyId: normalizeText(raw.policy_id),
    policyName: normalizeText(policy.policy_name ?? policy.policyName),
    workflowKey: normalizeText(raw.workflow_key),
    tags: normalizeStringArray(raw.source_tags),
    securityConfig: parseSourceConfig(raw.security_config_json),
    monitor: parseSourceMonitor(raw.last_monitor_json),
    lastCheckedAt: normalizeText(raw.last_checked_at),
    createdAt: normalizeText(raw.createdAt),
    updatedAt: normalizeText(raw.updatedAt),
  }
}

function mapTaskRecord(raw: RawConfidentialTask, labels: Map<string, string>): ConfidentialTaskRecord {
  const status = normalizeTaskStatus(raw.task_status)
  const risk = normalizeRisk(raw.risk_level)
  const summary = normalizeObject(raw.execution_summary_json)
  const owner = normalizeObject(raw.owner_user)
  return {
    id: normalizeText(raw.id),
    code: normalizeText(raw.task_code),
    name: normalizeText(raw.task_name),
    scenario: normalizeText(raw.scenario),
    status,
    statusLabel: labelFor(labels, status),
    risk,
    riskLabel: labelFor(labels, risk),
    algorithm: normalizeAlgorithm(raw.algorithm),
    sourceDomain: normalizeText(raw.source_domain),
    targetDomain: normalizeText(raw.target_domain),
    ownerUserId: normalizeText(raw.owner_user_id),
    ownerName: normalizeText(owner.nickname ?? owner.username),
    progress: Math.max(0, Math.min(100, normalizeNumber(raw.progress))),
    workflowInstanceId: normalizeText(raw.workflow_instance_id),
    tags: normalizeStringArray(raw.task_tags),
    resourceIds: normalizeStringArray(summary.resourceIds ?? summary.resource_ids),
    computeRequest: parseOpenFheComputeRequest(summary.computeRequest ?? summary.compute_request),
    executionSummary: summary,
    logs: parseRuntimeLogs(summary.logs),
    createdAt: normalizeText(raw.createdAt),
    updatedAt: normalizeText(raw.updatedAt),
  }
}

function sourceValues(record: EditableSecurityDataSource) {
  return {
    source_code: record.code,
    source_name: record.name,
    source_type: record.sourceType,
    connection_status: record.status,
    sensitivity_level: record.sensitivity,
    host: record.host || null,
    port: record.port ? Number(record.port) : null,
    database_name: record.databaseName || null,
    username: record.username || null,
    secret_ref: record.secretRef || null,
    description: record.description || null,
    owner_dept: record.ownerDept || null,
    policy_id: record.policyId || null,
    workflow_key: record.workflowKey || null,
    source_tags: record.tags,
    security_config_json: record.securityConfig,
  }
}

function createRuntimeLog(stage: SecurityRuntimeLogStage, result: SecurityRuntimeLogResult, message: string, extra: Partial<SecurityRuntimeLog> = {}): SecurityRuntimeLog {
  const now = new Date().toISOString()
  return {
    id: extra.id || `${stage}-${now}`,
    time: now,
    stage,
    result,
    message,
    durationMs: extra.durationMs ?? null,
    engineVersion: extra.engineVersion || '',
    requestId: extra.requestId || '',
  }
}

export async function fetchSecurityRuntimeSupportOptions(): Promise<SecurityRuntimeSupportOptions> {
  const items = await fetchDictionaryItems([
    'source_type',
    'connection_status',
    'sensitivity_level',
    'compute_status',
    'compute_algorithm',
    'risk_level',
  ])
  const byType = (typeCode: string) => items.filter((item) => item.typeCode === typeCode)
  const mapOptions = <T extends string>(rows: RawDictionaryItem[]) => rows.map((item) => ({
    value: normalizeText(item.dictValue) as T,
    label: normalizeText(item.dictValueName),
    id: normalizeText(item.id),
  }))
  return {
    sourceTypeOptions: mapOptions<SecurityDataSourceType>(byType('source_type')),
    connectionStatusOptions: mapOptions<SecurityDataSourceStatus>(byType('connection_status')),
    sensitivityOptions: mapOptions<SecuritySensitivityLevel>(byType('sensitivity_level')),
    taskStatusOptions: mapOptions<ConfidentialTaskStatus>(byType('compute_status')),
    algorithmOptions: mapOptions<Lowercase<OpenFheAlgorithm>>(byType('compute_algorithm'))
      .filter((item) => item.value === 'bfv' || item.value === 'ckks'),
    riskOptions: mapOptions<SecurityRiskLevel>(byType('risk_level')),
  }
}

export async function fetchSecurityDataSources() {
  const [sourceResponse, dictionaryItems] = await Promise.all([
    nocobaseClient.resource(DATA_SOURCE_COLLECTION).list({
      page: 1,
      pageSize: 200,
      sort: '-updatedAt',
      appends: ['policy', 'owner_user'],
    }),
    fetchDictionaryItems(['source_type', 'connection_status', 'sensitivity_level']),
  ])
  const payload = sourceResponse.data as RawListResponse<RawSecurityDataSource>
  const labels = buildLabelLookup(dictionaryItems)
  return (payload.data ?? []).map((row) => mapSourceRecord(row, labels))
}

export async function saveSecurityDataSource(record: EditableSecurityDataSource) {
  if (!record.name.trim()) throw new Error('请填写数据源名称')
  if (!record.code.trim()) throw new Error('请填写数据源编码')
  if (record.id) {
    await nocobaseClient.resource(DATA_SOURCE_COLLECTION).update({
      filterByTk: record.id,
      values: sourceValues(record),
    })
    return record.id
  }
  const response = await nocobaseClient.resource(DATA_SOURCE_COLLECTION).create({ values: sourceValues(record) })
  const payload = response.data as { data?: { id?: number | string }; id?: number | string }
  return normalizeText(payload.data?.id ?? payload.id)
}

export async function updateSecurityDataSourceStatus(id: string, status: SecurityDataSourceStatus, monitor?: SecurityDataSourceMonitor) {
  await nocobaseClient.resource(DATA_SOURCE_COLLECTION).update({
    filterByTk: id,
    values: {
      connection_status: status,
      last_checked_at: new Date().toISOString(),
      ...(monitor ? { last_monitor_json: monitor } : {}),
    },
  })
}

export async function fetchConfidentialTasks() {
  const [taskResponse, resourceResponse, dictionaryItems] = await Promise.all([
    nocobaseClient.resource(CONFIDENTIAL_TASK_COLLECTION).list({
      page: 1,
      pageSize: 200,
      sort: '-updatedAt',
      appends: ['owner_user'],
    }),
    nocobaseClient.resource(CONFIDENTIAL_TASK_RESOURCE_COLLECTION).list({ page: 1, pageSize: 500 }),
    fetchDictionaryItems(['compute_status', 'risk_level']),
  ])
  const taskPayload = taskResponse.data as RawListResponse<RawConfidentialTask>
  const resourcePayload = resourceResponse.data as RawListResponse<Record<string, unknown>>
  const resourcesByTask = new Map<string, string[]>()
  ;(resourcePayload.data ?? []).forEach((row) => {
    const taskId = normalizeText(row.task_id)
    const resourceId = normalizeText(row.resource_id)
    if (!taskId || !resourceId) return
    resourcesByTask.set(taskId, [...(resourcesByTask.get(taskId) ?? []), resourceId])
  })
  const labels = buildLabelLookup(dictionaryItems)
  return (taskPayload.data ?? [])
    .filter((row) => ['bfv', 'ckks'].includes(normalizeText(row.algorithm).toLowerCase()))
    .map((row) => {
    const task = mapTaskRecord(row, labels)
    const relationResourceIds = resourcesByTask.get(task.id) ?? []
    return { ...task, resourceIds: relationResourceIds.length > 0 ? relationResourceIds : task.resourceIds }
    })
}

export async function createConfidentialTask(record: EditableConfidentialTask) {
  if (!record.name.trim()) throw new Error('请填写任务名称')
  if (!record.scenario.trim()) throw new Error('请填写业务场景')
  if (record.resourceIds.length === 0) throw new Error('请至少选择一个量测数据资源')
  validateOpenFheComputeRequest(record.algorithm, record.computeRequest)
  const taskCode = `HE-${Date.now()}`
  const createdLog = createRuntimeLog('created', 'success', `已创建${formatOpenFheAlgorithm(record.algorithm)}同态加密任务`)
  const response = await nocobaseClient.resource(CONFIDENTIAL_TASK_COLLECTION).create({
    values: {
      task_code: taskCode,
      task_name: record.name,
      scenario: record.scenario,
      task_status: 'pending_approval',
      risk_level: record.risk,
      algorithm: record.algorithm.toLowerCase(),
      source_domain: record.sourceDomain,
      target_domain: record.targetDomain,
      owner_user_id: record.ownerUserId || null,
      progress: 0,
      task_tags: Array.from(new Set([...record.tags, formatOpenFheAlgorithm(record.algorithm)])),
      execution_summary_json: {
        engine: 'homomorphic-engine',
        algorithm: record.algorithm,
        resourceIds: record.resourceIds,
        computeRequest: record.computeRequest,
        logs: [createdLog],
      },
    },
  })
  const payload = response.data as { data?: { id?: number | string }; id?: number | string }
  const taskId = normalizeText(payload.data?.id ?? payload.id)
  await Promise.all(record.resourceIds.map((resourceId, index) => (
    nocobaseClient.resource(CONFIDENTIAL_TASK_RESOURCE_COLLECTION).create({
      values: {
        task_id: taskId,
        resource_id: resourceId,
        resource_role: index === 0 ? 'primary' : 'participant',
        relation_tags: [record.algorithm, index === 0 ? '主资源' : '参与资源'],
        field_scope_json: { mode: 'all-secured-fields' },
      },
    })
  )))
  return taskId
}

export async function fetchOpenFheEngineConfig(): Promise<OpenFheEngineConfig> {
  const response = await nocobaseClient.resource('jcConfigCenter').getValue({ values: OPENFHE_CONFIG_IDENTITY })
  const payload = response.data as { data?: { value?: unknown } | null }
  const rawValue = normalizeObject(payload.data?.value)
  const supportedAlgorithms = normalizeStringArray(rawValue.supportedAlgorithms)
    .map((item) => parseOpenFheAlgorithm(item))
    .filter((item): item is OpenFheAlgorithm => item !== null)
    .filter((item, index, rows) => rows.indexOf(item) === index)
  return {
    engineName: normalizeText(rawValue.engineName) || DEFAULT_OPENFHE_ENGINE_CONFIG.engineName,
    endpoint: normalizeText(rawValue.endpoint) || DEFAULT_OPENFHE_ENGINE_CONFIG.endpoint,
    authMode: ['none', 'token', 'mTLS'].includes(normalizeText(rawValue.authMode))
      ? normalizeText(rawValue.authMode) as OpenFheEngineConfig['authMode']
      : DEFAULT_OPENFHE_ENGINE_CONFIG.authMode,
    secretRef: normalizeText(rawValue.secretRef) || DEFAULT_OPENFHE_ENGINE_CONFIG.secretRef,
    timeoutSeconds: normalizeNumber(rawValue.timeoutSeconds, DEFAULT_OPENFHE_ENGINE_CONFIG.timeoutSeconds),
    enabled: normalizeBoolean(rawValue.enabled, DEFAULT_OPENFHE_ENGINE_CONFIG.enabled),
    supportedAlgorithms: supportedAlgorithms.length > 0 ? supportedAlgorithms : ['BFV', 'CKKS'],
  }
}

export async function saveOpenFheEngineConfig(config: OpenFheEngineConfig) {
  const endpoint = config.endpoint.trim().replace(/\/+$/, '')
  if (!endpoint) throw new Error('请填写同态加密引擎服务地址')
  const value = {
    ...config,
    endpoint,
    supportedAlgorithms: ['整数精确型', '浮点近似型'],
  }
  await nocobaseClient.resource('jcConfigCenter').saveValues({
    values: {
      items: [{ ...OPENFHE_CONFIG_IDENTITY, value }],
    },
  })
  return { ...config, endpoint, supportedAlgorithms: ['BFV', 'CKKS'] as OpenFheAlgorithm[] }
}

function openFheUrl(endpoint: string, path: string) {
  return `${endpoint.trim().replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutSeconds: number) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), Math.max(1, timeoutSeconds) * 1000)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

function openFheHeaders(config: OpenFheEngineConfig) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(config.authMode === 'token' && config.secretRef ? { 'X-Homomorphic-Secret-Ref': config.secretRef } : {}),
  }
}

export async function testOpenFheConnection(config: OpenFheEngineConfig): Promise<OpenFheHealth> {
  const startedAt = performance.now()
  const response = await fetchWithTimeout(
    openFheUrl(config.endpoint, '/health'),
    { method: 'GET', headers: openFheHeaders(config) },
    config.timeoutSeconds,
  )
  const latencyMs = Math.round(performance.now() - startedAt)
  if (!response.ok) throw new Error(`同态加密引擎健康检查失败（HTTP ${response.status}）`)
  const payload = normalizeObject(await response.json().catch(() => ({})))
  const advertised = normalizeStringArray(payload.algorithms ?? payload.schemes)
    .map((item) => parseOpenFheAlgorithm(item))
    .filter((item): item is OpenFheAlgorithm => item !== null)
    .filter((item, index, rows) => rows.indexOf(item) === index)
  const algorithms = advertised.length > 0 ? advertised : []
  if (!algorithms.includes('BFV') || !algorithms.includes('CKKS')) {
    throw new Error('同态加密引擎健康接口未声明所需的密态算法能力')
  }
  return {
    ok: true,
    version: normalizeText(payload.version),
    latencyMs,
    algorithms,
  }
}

export async function executeOpenFheTask(task: ConfidentialTaskRecord, config: OpenFheEngineConfig) {
  if (!config.enabled) throw new Error('同态加密引擎尚未启用')
  if (!config.supportedAlgorithms.includes(task.algorithm)) throw new Error(`同态加密引擎未启用${formatOpenFheAlgorithm(task.algorithm)}能力`)
  if (!task.computeRequest) throw new Error('任务缺少同态计算请求，不能调用同态加密引擎')
  validateOpenFheComputeRequest(task.algorithm, task.computeRequest)
  const queuedLog = createRuntimeLog('queued', 'pending', `已将${formatOpenFheAlgorithm(task.algorithm)}任务提交到同态加密引擎`)
  const logs = [...task.logs, queuedLog]
  await nocobaseClient.resource(CONFIDENTIAL_TASK_COLLECTION).update({
    filterByTk: task.id,
    values: {
      task_status: 'running',
      progress: 10,
      execution_summary_json: { ...task.executionSummary, engine: 'homomorphic-engine', algorithm: task.algorithm, logs },
    },
  })

  const startedAt = performance.now()
  try {
    const response = await fetchWithTimeout(
      openFheUrl(config.endpoint, '/v1/tasks/execute'),
      {
        method: 'POST',
        headers: openFheHeaders(config),
        body: JSON.stringify({
          taskCode: task.code,
          scheme: task.algorithm,
          operation: task.computeRequest.operation,
          values: task.computeRequest.values,
        }),
      },
      config.timeoutSeconds,
    )
    const durationMs = Math.round(performance.now() - startedAt)
    const payload = normalizeObject(await response.json().catch(() => ({})))
    if (!response.ok) {
      throw new Error(sanitizeVisibleRuntimeText(payload.message ?? payload.detail) || `同态加密任务执行失败（HTTP ${response.status}）`)
    }
    const resultLog = createRuntimeLog('result', 'success', '同态加密引擎已完成密文计算并返回结果摘要', {
      durationMs,
      engineVersion: normalizeText(payload.engineVersion ?? payload.version),
      requestId: normalizeText(payload.requestId ?? payload.jobId),
    })
    await nocobaseClient.resource(CONFIDENTIAL_TASK_COLLECTION).update({
      filterByTk: task.id,
      values: {
        task_status: 'completed',
        progress: 100,
        execution_summary_json: {
          ...task.executionSummary,
          engine: 'homomorphic-engine',
          algorithm: task.algorithm,
          resourceIds: task.resourceIds,
          result: payload,
          logs: [...logs, resultLog],
        },
      },
    })
    return payload
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt)
    const message = sanitizeVisibleRuntimeText(toErrorMessage(error, '同态加密任务执行失败'))
    const failedLog = createRuntimeLog('failed', 'failed', message, { durationMs })
    await nocobaseClient.resource(CONFIDENTIAL_TASK_COLLECTION).update({
      filterByTk: task.id,
      values: {
        task_status: 'failed',
        progress: 0,
        execution_summary_json: { ...task.executionSummary, engine: 'homomorphic-engine', algorithm: task.algorithm, logs: [...logs, failedLog] },
      },
    })
    throw new Error(message)
  }
}

function useAsyncCollection<T>(enabled: boolean, loader: () => Promise<T[]>, fallbackMessage: string) {
  const [data, setData] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) return []
    setIsLoading(true)
    try {
      const rows = await loader()
      setData(rows)
      setError(null)
      return rows
    } catch (caught) {
      setData([])
      setError(toErrorMessage(caught, fallbackMessage))
      return []
    } finally {
      setIsLoading(false)
    }
  }, [enabled, fallbackMessage, loader])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return useMemo(() => ({ data, isLoading, error, refresh }), [data, error, isLoading, refresh])
}

const loadSecurityDataSources = () => fetchSecurityDataSources()
const loadConfidentialTasks = () => fetchConfidentialTasks()

export function useSecurityDataSources(enabled: boolean) {
  return useAsyncCollection(enabled, loadSecurityDataSources, '数据源配置加载失败')
}

export function useConfidentialTasks(enabled: boolean) {
  return useAsyncCollection(enabled, loadConfidentialTasks, '同态加密任务加载失败')
}

export function useSecurityRuntimeSupportOptions(enabled: boolean) {
  const [data, setData] = useState<SecurityRuntimeSupportOptions>({
    sourceTypeOptions: [],
    connectionStatusOptions: [],
    sensitivityOptions: [],
    taskStatusOptions: [],
    algorithmOptions: [],
    riskOptions: [],
  })
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setIsLoading(true)
    void fetchSecurityRuntimeSupportOptions()
      .then((options) => {
        if (cancelled) return
        setData(options)
        setError(null)
      })
      .catch((caught) => {
        if (!cancelled) setError(toErrorMessage(caught, '安全管控字典加载失败'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { data, isLoading, error }
}

export function useOpenFheEngineConfig(enabled: boolean) {
  const [data, setData] = useState<OpenFheEngineConfig>(DEFAULT_OPENFHE_ENGINE_CONFIG)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) return DEFAULT_OPENFHE_ENGINE_CONFIG
    setIsLoading(true)
    try {
      const config = await fetchOpenFheEngineConfig()
      setData(config)
      setError(null)
      return config
    } catch (caught) {
      setError(toErrorMessage(caught, '同态加密引擎配置加载失败'))
      return DEFAULT_OPENFHE_ENGINE_CONFIG
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, setData, isLoading, error, refresh }
}
