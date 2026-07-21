import { SlidersHorizontal, UploadCloud } from 'lucide-react'
import { useState } from 'react'
import { SecurityHomomorphicRuntimeDrawer } from '../components/security-homomorphic-runtime-drawer'
import { SecurityRuntimeStatusAction } from '../components/security-runtime-status-drawer'
import { SecurityV3CollectionPage, type SecurityV3CollectionPageConfig, type SecurityV3Option } from '../components/security-v3-collection-page'
import { Button } from '../components/ui'
import { useOpenFheEngineConfig } from '../lib/nocobase-security-runtime'
import { publishSecurityApi, publishSecurityPolicy } from '../lib/security-runtime-client'

const enabledOptions: SecurityV3Option[] = [{ value: 'draft', label: '草稿' }, { value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]
const outputOptions: SecurityV3Option[] = [{ value: 'detail', label: '明细' }, { value: 'masked', label: '脱敏' }, { value: 'aggregate', label: '聚合' }, { value: 'encrypted', label: '密态' }]
const homomorphicAlgorithmOptions: SecurityV3Option[] = [{ value: 'bfv', label: '整数精确型' }, { value: 'ckks', label: '浮点近似型' }]

function homomorphicAlgorithmLabel(value: unknown) {
  return ['ckks', 'float_approx'].includes(String(value || '').toLowerCase()) ? '浮点近似型' : '整数精确型'
}

function formatLocalDateTime(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return '-'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized.replace('T', ' ')
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const apiResourcesConfig: SecurityV3CollectionPageConfig = {
  module: 'services', title: 'API 资源', collection: 'security_api_resources', appends: ['resource', 'data_source'],
  columns: [{ key: 'api_code', label: 'API 编码' }, { key: 'api_name', label: 'API 名称' }, { key: 'access_mode', label: '接入模式' }, { key: 'resource', label: '数据资源' }, { key: 'data_source', label: '数据源' }, { key: 'gateway_path', label: '发布路径' }, { key: 'publish_status', label: '发布状态', tone: 'status' }],
  fields: [
    { name: 'api_code', label: 'API 编码', required: true }, { name: 'api_name', label: 'API 名称', required: true },
    { name: 'resource_id', label: '数据资源', required: true, relation: { collection: 'eco_data_resources', labelKey: 'resource_name' } },
    { name: 'data_source_id', label: '数据源', relation: { collection: 'security_data_sources', labelKey: 'source_name' } },
    { name: 'access_mode', label: '接入模式', type: 'select', required: true, options: [{ value: 'direct', label: '直接纳管' }, { value: 'develop', label: '数据库服务化' }, { value: 'orchestrate', label: '编排增强' }] },
    { name: 'http_method', label: '请求方法', type: 'select', options: [{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }], defaultValue: 'GET' },
    { name: 'upstream_url', label: '上游地址' }, { name: 'orchestrator_path', label: '处理路径' }, { name: 'gateway_path', label: '发布路径', required: true },
    { name: 'protection_level', label: '防护层', type: 'select', options: [{ value: 'l1', label: '普通共享层' }, { value: 'l2', label: '内部受控层' }, { value: 'l3', label: '跨域密态层' }], defaultValue: 'l2' },
    { name: 'supports_row_filter', label: '支持行过滤', type: 'boolean' }, { name: 'supports_field_filter', label: '支持字段过滤', type: 'boolean' },
    { name: 'supports_aggregate', label: '支持聚合', type: 'boolean' }, { name: 'supports_homomorphic', label: '支持密态任务', type: 'boolean' },
    { name: 'api_status', label: 'API 状态', type: 'select', options: enabledOptions, defaultValue: 'draft' },
  ],
  transformSaveValues: (values) => ({ ...values, publish_status: 'unpublished', publish_error: null }),
  rowActions: [{
    key: 'publish-api', title: '校验并发布', icon: UploadCloud,
    execute: async (record) => {
      const result = await publishSecurityApi(String(record.id || ''))
      return `API 已发布，版本 ${result.publishVersion}`
    },
  }],
  extraActions: <SecurityRuntimeStatusAction />,
}

const tagRulesConfig: SecurityV3CollectionPageConfig = {
  module: 'tags', title: '标签规则', collection: 'security_data_sources',
  rowFilter: (record) => record.connection_status !== 'disabled',
  columns: [{ key: 'source_code', label: '数据源编码' }, { key: 'source_name', label: '数据源' }, { key: 'source_type', label: '来源类型' }, { key: 'tag_rules_json', label: '标签规则' }, { key: 'source_tags', label: '当前标签' }],
  fields: [{ name: 'source_code', label: '数据源编码', readOnly: true }, { name: 'source_name', label: '数据源', readOnly: true }, { name: 'tag_rules_json', label: '标签规则', type: 'json', defaultValue: {} }, { name: 'source_tags', label: '数据源标签', type: 'json', defaultValue: [] }],
}

const ingestLogsBase: Omit<SecurityV3CollectionPageConfig, 'title' | 'filter'> = {
  module: 'ingest', collection: 'security_ingest_logs', readOnly: true, appends: ['data_source', 'api_resource'],
  columns: [{ key: 'batch_code', label: '批次编号' }, { key: 'execution_type', label: '执行类型' }, { key: 'data_source', label: '数据源' }, { key: 'started_at', label: '开始时间' }, { key: 'input_count', label: '输入数' }, { key: 'passed_count', label: '通过数' }, { key: 'rejected_count', label: '拒绝数' }, { key: 'result_status', label: '结果', tone: 'status' }],
  fields: [
    { name: 'batch_code', label: '批次编号', readOnly: true },
    { name: 'execution_type', label: '执行类型', type: 'select', readOnly: true, options: [{ value: 'connection_test', label: '连接检查' }, { value: 'validation', label: '数据校验' }, { value: 'tagging', label: '标签执行' }] },
    { name: 'data_source_id', label: '数据源', readOnly: true, relation: { collection: 'security_data_sources', labelKey: 'source_name' } },
    { name: 'api_resource_id', label: 'API 资源', readOnly: true, relation: { collection: 'security_api_resources', labelKey: 'api_name' } },
    { name: 'rule_version', label: '规则版本', type: 'number', readOnly: true },
    { name: 'started_at', label: '开始时间', type: 'datetime', readOnly: true },
    { name: 'finished_at', label: '完成时间', type: 'datetime', readOnly: true },
    { name: 'input_count', label: '输入数', type: 'number', readOnly: true },
    { name: 'passed_count', label: '通过数', type: 'number', readOnly: true },
    { name: 'rejected_count', label: '拒绝数', type: 'number', readOnly: true },
    { name: 'duration_ms', label: '执行耗时（毫秒）', type: 'number', readOnly: true },
    { name: 'result_status', label: '执行结果', type: 'select', readOnly: true, options: [{ value: 'success', label: '成功' }, { value: 'partial', label: '部分成功' }, { value: 'failed', label: '失败' }] },
    { name: 'error_summary', label: '错误摘要', type: 'textarea', readOnly: true },
    { name: 'result_detail_json', label: '结果详情', type: 'json', readOnly: true, defaultValue: {} },
  ],
}

const subjectsConfig: SecurityV3CollectionPageConfig = {
  module: 'access', title: '访问主体', collection: 'security_access_subjects',
  columns: [{ key: 'subject_code', label: '主体编码' }, { key: 'subject_name', label: '主体名称' }, { key: 'subject_type', label: '主体类型' }, { key: 'organization_name', label: '所属组织' }, { key: 'allowed_api_codes_json', label: '授权 API' }, { key: 'credential_version', label: 'API Key 版本' }, { key: 'subject_status', label: '状态', tone: 'status' }],
  fields: [
    { name: 'subject_code', label: '主体编码', required: true }, { name: 'subject_name', label: '主体名称', required: true },
    { name: 'subject_type', label: '主体类型', type: 'select', required: true, options: [{ value: 'internal_app', label: '内部应用' }, { value: 'external_party', label: '外部访问方' }] },
    { name: 'organization_code', label: '组织编码', required: true }, { name: 'organization_name', label: '组织名称', required: true },
    { name: 'credential_ref', label: 'API Key 安全引用', required: true }, { name: 'credential_version', label: 'API Key 版本', type: 'number', defaultValue: 1 },
    { name: 'allowed_api_codes_json', label: '授权 API 编码列表', type: 'json', required: true, defaultValue: [] },
    { name: 'ip_whitelist_json', label: 'IP 白名单', type: 'json', defaultValue: [] }, { name: 'subject_status', label: '主体状态', type: 'select', options: enabledOptions, defaultValue: 'draft' },
    { name: 'valid_from', label: '生效时间', type: 'datetime' }, { name: 'valid_to', label: '失效时间', type: 'datetime' }, { name: 'description', label: '说明', type: 'textarea' },
  ],
}

const policiesConfig: SecurityV3CollectionPageConfig = {
  module: 'access', title: '访问策略', createLabel: '新增访问策略', collection: 'eco_resource_security_policies', filter: { policy_kind: 'access_policy' }, appends: ['subject', 'api_resource'],
  columns: [{ key: 'policy_code', label: '策略编码' }, { key: 'policy_name', label: '策略名称' }, { key: 'access_scope', label: '作用范围', value: (record) => record.access_scope === 'label_group' ? '标签组合' : '单个资源' }, { key: 'security_tags', label: '资源标签条件' }, { key: 'subject', label: '访问主体' }, { key: 'api_resource', label: '例外 API' }, { key: 'output_mode', label: '输出模式' }, { key: 'risk_threshold', label: '风险阈值' }, { key: 'policy_version', label: '策略版本' }, { key: 'publish_status', label: '发布状态', tone: 'status' }, { key: 'published_at', label: '发布时间', value: (record) => formatLocalDateTime(record.published_at) }],
  fields: [
    { name: 'policy_code', label: '策略编码', required: true }, { name: 'policy_name', label: '策略名称', required: true }, { name: 'policy_kind', label: '策略类型', type: 'select', options: [{ value: 'access_policy', label: '访问策略' }], defaultValue: 'access_policy' },
    { name: 'access_scope', label: '策略作用范围', type: 'select', required: true, defaultValue: 'label_group', options: [{ value: 'label_group', label: '按分类分级与标签组合' }, { value: 'resource', label: '单个数据资源例外' }] },
    { name: 'security_tags', label: '必须命中的资源标签（JSON 数组）', type: 'json', defaultValue: [] },
    { name: 'security_profile_json', label: '标签组合条件（match/priority/protectionLevels/fieldTags）', type: 'json', defaultValue: { match: 'all', priority: 100, protectionLevels: [], fieldTags: [] } },
    { name: 'resource_id', label: '例外数据资源（仅单资源策略填写）', relation: { collection: 'eco_data_resources', labelKey: 'resource_name' } },
    { name: 'subject_id', label: '访问主体', required: true, relation: { collection: 'security_access_subjects', labelKey: 'subject_name' } },
    { name: 'api_resource_id', label: '例外 API（仅单资源策略填写）', relation: { collection: 'security_api_resources', labelKey: 'api_name' } },
    { name: 'scenario', label: '使用场景', required: true }, { name: 'source_ips_json', label: '来源 IP 范围', type: 'json', defaultValue: [] }, { name: 'allowed_time_ranges_json', label: '允许时段', type: 'json', defaultValue: [] },
    { name: 'max_requests_per_minute', label: '每分钟请求上限', type: 'number', defaultValue: 60 }, { name: 'max_query_days', label: '最大查询天数', type: 'number', defaultValue: 1 }, { name: 'max_rows', label: '最大返回行数', type: 'number', defaultValue: 1000 },
    { name: 'organization_scope_json', label: '组织范围', type: 'json', defaultValue: [] }, { name: 'region_scope_json', label: '区域范围', type: 'json', defaultValue: [] },
    { name: 'output_mode', label: '输出模式', type: 'select', options: outputOptions, required: true }, { name: 'risk_threshold', label: '风险阈值', type: 'number', defaultValue: 70 }, { name: 'policy_status', label: '策略状态', type: 'select', options: enabledOptions, defaultValue: 'draft' },
    { name: 'abnormal_access_rules_json', label: '异常访问处置规则', type: 'json', required: true, defaultValue: { offHours: { enabled: true, action: 'deny', riskScore: 70 }, highFrequency: { enabled: true, action: 'deny', riskScore: 70 }, queryRangeExceeded: { enabled: true, action: 'deny', riskScore: 60 }, rowLimitExceeded: { enabled: true, action: 'deny', riskScore: 70 }, scopeViolation: { enabled: true, action: 'deny', riskScore: 80 }, behaviorAnomaly: { enabled: true, action: 'risk', riskScore: 20 } } },
  ],
  transformSaveValues: (values) => ({
    ...values,
    ...(values.access_scope === 'label_group' ? { resource_id: null, api_resource_id: null } : {}),
    publish_status: 'unpublished',
    publish_error: null,
  }),
  rowActions: [{
    key: 'publish-policy', title: '发布', icon: UploadCloud,
    execute: async (record) => {
      const result = await publishSecurityPolicy(String(record.id || ''))
      return `策略已发布，版本 V${result.policyVersion}`
    },
  }],
  extraActions: <SecurityRuntimeStatusAction />,
}

const baselinesConfig: SecurityV3CollectionPageConfig = {
  module: 'access', title: '行为基线', collection: 'security_behavior_baselines', appends: ['subject', 'api_resource'],
  columns: [{ key: 'baseline_code', label: '基线编码' }, { key: 'subject', label: '访问主体' }, { key: 'api_resource', label: 'API 资源' }, { key: 'sample_count', label: '样本数' }, { key: 'frequency_avg', label: '平均频率' }, { key: 'query_days_avg', label: '平均查询天数' }, { key: 'rows_avg', label: '平均行数' }, { key: 'baseline_status', label: '状态', tone: 'status' }],
  fields: [
    { name: 'baseline_code', label: '基线编码', required: true }, { name: 'subject_id', label: '访问主体', required: true, relation: { collection: 'security_access_subjects', labelKey: 'subject_name' } }, { name: 'api_resource_id', label: 'API 资源', required: true, relation: { collection: 'security_api_resources', labelKey: 'api_name' } },
    { name: 'sample_from', label: '样本开始时间', type: 'datetime' }, { name: 'sample_to', label: '样本结束时间', type: 'datetime' }, { name: 'sample_count', label: '样本数', type: 'number', min: 0 },
    { name: 'frequency_avg', label: '平均频率', type: 'number', min: 0 }, { name: 'frequency_stddev', label: '频率标准差', type: 'number', min: 0 },
    { name: 'query_days_avg', label: '平均查询天数', type: 'number', min: 0 }, { name: 'query_days_stddev', label: '查询天数标准差', type: 'number', min: 0 },
    { name: 'rows_avg', label: '平均行数', type: 'number', min: 0 }, { name: 'rows_stddev', label: '返回行数标准差', type: 'number', min: 0 },
    { name: 'normal_time_ranges_json', label: '正常时段', type: 'json', defaultValue: [] }, { name: 'failure_avg', label: '平均失败次数', type: 'number', min: 0, defaultValue: 0 },
    { name: 'generated_at', label: '生成时间', type: 'datetime' }, { name: 'baseline_version', label: '基线版本', type: 'number', min: 1, defaultValue: 1 }, { name: 'baseline_status', label: '基线状态', type: 'select', options: enabledOptions, defaultValue: 'draft' },
  ],
}

const auditConfig: SecurityV3CollectionPageConfig = {
  module: 'access', title: '调用与决策日志', collection: 'security_policy_decision_logs', readOnly: true, appends: ['subject', 'api_resource', 'policy'],
  columns: [{ key: 'request_id', label: '请求编号' }, { key: 'requested_at', label: '请求时间' }, { key: 'subject', label: '访问主体' }, { key: 'api_resource', label: 'API 资源' }, { key: 'decision_result', label: '决策', tone: 'status' }, { key: 'risk_level', label: '风险级别', tone: 'status' }, { key: 'returned_rows', label: '返回行数' }, { key: 'duration_ms', label: '耗时(ms)' }],
}

const risksConfig: SecurityV3CollectionPageConfig = {
  module: 'risks', title: '风险事件', collection: 'security_risk_events', appends: ['decision_log', 'owner_user'], canCreate: false,
  columns: [{ key: 'event_code', label: '事件编号' }, { key: 'risk_type', label: '风险类型' }, { key: 'risk_score', label: '风险分' }, { key: 'risk_level', label: '风险级别', tone: 'status' }, { key: 'risk_reason', label: '风险原因' }, { key: 'action_taken', label: '自动处置' }, { key: 'event_status', label: '事件状态', tone: 'status', value: (record) => record.event_status === 'pending' ? '待确认' : record.event_status }],
  fields: [{ name: 'event_code', label: '事件编号', readOnly: true }, { name: 'risk_type', label: '风险类型', readOnly: true }, { name: 'risk_score', label: '风险分', type: 'number', readOnly: true }, { name: 'risk_level', label: '风险级别', readOnly: true }, { name: 'risk_reason', label: '风险原因', type: 'textarea', readOnly: true }, { name: 'action_taken', label: '处置动作', type: 'select', readOnly: true, options: [{ value: 'record', label: '记录' }, { value: 'limit', label: '限制' }, { value: 'deny', label: '拒绝' }, { value: 'deny_alert', label: '拒绝并告警' }] }, { name: 'event_status', label: '事件状态', type: 'select', options: [{ value: 'pending', label: '待确认' }, { value: 'processing', label: '处理中' }, { value: 'closed', label: '已关闭' }] }, { name: 'audit_note', label: '处置备注', type: 'textarea' }],
}

const keysConfig: SecurityV3CollectionPageConfig = {
  module: 'homomorphic', title: '密钥管理', collection: 'security_crypto_keys', appends: ['subject'],
  columns: [{ key: 'key_code', label: '密钥编码' }, { key: 'subject', label: '外部访问方' }, { key: 'algorithm_code', label: '算法类型', value: (record) => homomorphicAlgorithmLabel(record.algorithm_code) }, { key: 'context_version', label: '上下文版本' }, { key: 'key_fingerprint', label: '密钥指纹' }, { key: 'valid_from', label: '生效时间' }, { key: 'valid_to', label: '失效时间' }, { key: 'key_status', label: '状态', tone: 'status' }],
  fields: [
    { name: 'key_code', label: '密钥编码', required: true }, { name: 'subject_id', label: '外部访问方', required: true, relation: { collection: 'security_access_subjects', labelKey: 'subject_name' } },
    { name: 'algorithm_code', label: '算法类型', type: 'select', options: homomorphicAlgorithmOptions, required: true, defaultValue: 'ckks' },
    { name: 'context_version', label: '上下文版本', required: true }, { name: 'context_parameters_json', label: '上下文参数', type: 'json', required: true, defaultValue: {} },
    { name: 'public_key_ref', label: '公钥引用', required: true }, { name: 'evaluation_key_ref', label: '计算密钥引用', required: true }, { name: 'key_fingerprint', label: '密钥指纹', required: true },
    { name: 'valid_from', label: '生效时间', type: 'datetime', required: true }, { name: 'valid_to', label: '失效时间', type: 'datetime' }, { name: 'key_status', label: '密钥状态', type: 'select', options: [{ value: 'pending_validation', label: '待校验' }, { value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }, { value: 'expired', label: '已过期' }], defaultValue: 'pending_validation' },
  ],
}

const homomorphicTasksConfig: SecurityV3CollectionPageConfig = {
  module: 'homomorphic', title: '同态任务', collection: 'security_confidential_tasks', createLabel: '创建验证任务',
  appends: ['subject', 'api_resource', 'crypto_key'],
  rowFilter: (record) => record.task_status !== 'archived',
  canEdit: (record) => record.task_status === 'pending',
  columns: [
    { key: 'task_code', label: '任务编号' }, { key: 'task_name', label: '任务名称' }, { key: 'subject', label: '外部访问方' },
    { key: 'api_resource', label: '量测数据 API' }, { key: 'measure_field_code', label: '量测字段' },
    { key: 'algorithm', label: '算法类型', value: (record) => homomorphicAlgorithmLabel(record.algorithm) },
    { key: 'operation', label: '计算操作', value: (record) => record.operation === 'mean' ? '平均值' : '求和' },
    { key: 'sample_count', label: '样本数' }, { key: 'task_status', label: '状态', tone: 'status' },
    { key: 'progress', label: '进度', value: (record) => `${Number(record.progress || 0)}%` }, { key: 'duration_ms', label: '耗时(ms)' },
  ],
  fields: [
    { name: 'task_name', label: '任务名称', required: true },
    { name: 'subject_id', label: '外部访问方', required: true, relation: { collection: 'security_access_subjects', labelKey: 'subject_name', filter: { subject_type: 'external_party', subject_status: 'enabled' } } },
    { name: 'idempotency_key', label: '幂等键' },
    { name: 'api_resource_id', label: '量测数据 API', required: true, relation: { collection: 'security_api_resources', labelKey: 'api_name', filter: { supports_homomorphic: true, api_status: 'enabled' } } },
    { name: 'measure_field_code', label: '量测字段编码', required: true },
    { name: 'algorithm', label: '算法类型', type: 'select', options: homomorphicAlgorithmOptions, required: true, defaultValue: 'ckks' },
    { name: 'region_scope_json', label: '区域范围', type: 'json', required: true, defaultValue: [] },
    { name: 'organization_scope_json', label: '组织范围', type: 'json', required: true, defaultValue: [] },
    { name: 'data_start_at', label: '数据开始时间', type: 'datetime', required: true },
    { name: 'data_end_at', label: '数据结束时间', type: 'datetime', required: true },
    { name: 'operation', label: '计算操作', type: 'select', required: true, options: [{ value: 'sum', label: '求和' }, { value: 'mean', label: '平均值' }], defaultValue: 'sum' },
    { name: 'crypto_key_id', label: '有效密钥版本', required: true, relation: { collection: 'security_crypto_keys', labelKey: 'key_code', filter: { key_status: 'enabled' } } },
  ],
  transformSaveValues: (values, { mode, record }) => {
    if (mode === 'edit') return values
    const now = new Date()
    const compactTime = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 17)
    const algorithm = String(values.algorithm || 'ckks').toLowerCase() === 'bfv' ? 'bfv' : 'ckks'
    return {
      ...values,
      task_code: `HE-${algorithm === 'bfv' ? 'INT' : 'FLOAT'}-${compactTime}`,
      idempotency_key: values.idempotency_key || `verify-${compactTime}`,
      scenario: '跨域量测数据密态聚合验证',
      algorithm,
      source_domain: '内部受控域',
      target_domain: '外部协作域',
      risk_level: 'normal',
      task_status: 'pending',
      progress: 0,
      sample_count: 0,
      task_tags: ['量测数据', '跨域密态', homomorphicAlgorithmLabel(algorithm)],
      execution_summary_json: {
        events: [{ time: now.toISOString(), stage: 'created', result: 'success', message: '验证任务已创建，等待执行。' }],
      },
      ...(record?.id ? { id: record.id } : {}),
    }
  },
}

const resultsConfig: SecurityV3CollectionPageConfig = {
  module: 'homomorphic', title: '计算结果', collection: 'security_confidential_tasks', readOnly: true,
  rowFilter: (record) => record.task_status === 'success' || record.task_status === 'completed',
  columns: [{ key: 'task_code', label: '任务编号' }, { key: 'task_name', label: '任务名称' }, { key: 'operation', label: '计算操作' }, { key: 'sample_count', label: '样本数' }, { key: 'ciphertext_result_ref', label: '密文结果引用' }, { key: 'result_hash', label: '结果摘要' }, { key: 'duration_ms', label: '耗时(ms)' }, { key: 'task_status', label: '状态', tone: 'status' }],
}

export function SecurityApiResourcesPage() { return <SecurityV3CollectionPage config={apiResourcesConfig} /> }
export function SecurityTagRulesPage() { return <SecurityV3CollectionPage config={tagRulesConfig} /> }
export function SecurityIngestLogsPage() { return <SecurityV3CollectionPage config={{ ...ingestLogsBase, title: '接入日志' }} /> }
export function SecurityTagResultsPage() { return <SecurityV3CollectionPage config={{ ...ingestLogsBase, module: 'tags', title: '标注记录', filter: { execution_type: 'tagging' } }} /> }
export function SecurityAccessSubjectsPage() { return <SecurityV3CollectionPage config={subjectsConfig} /> }
export function SecurityBehaviorBaselinesPage() { return <SecurityV3CollectionPage config={baselinesConfig} /> }
export function SecurityPolicyPublishPage() { return <SecurityV3CollectionPage config={policiesConfig} /> }
export function SecurityDecisionAuditPage() { return <SecurityV3CollectionPage config={auditConfig} /> }
export function SecurityRiskEventsPage() { return <SecurityV3CollectionPage config={risksConfig} /> }
export function SecurityCryptoKeysPage() { return <SecurityV3CollectionPage config={keysConfig} /> }
export function SecurityHomomorphicTasksPage() {
  const { data: config, setData: setConfig } = useOpenFheEngineConfig(true)
  const [runtimeOpen, setRuntimeOpen] = useState(false)
  return (
    <>
      <SecurityV3CollectionPage config={{
        ...homomorphicTasksConfig,
        extraActions: <Button variant="secondary" className="gap-2" onClick={() => setRuntimeOpen(true)}><SlidersHorizontal className="h-4 w-4" />运行配置</Button>,
      }} />
      <SecurityHomomorphicRuntimeDrawer open={runtimeOpen} config={config} onClose={() => setRuntimeOpen(false)} onSaved={setConfig} />
    </>
  )
}
export function SecurityHomomorphicResultsPage() { return <SecurityV3CollectionPage config={resultsConfig} /> }
