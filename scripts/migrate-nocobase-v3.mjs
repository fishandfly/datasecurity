import { APIClient } from '@nocobase/sdk'
import { sanitizeSecurityValues, isDeprecatedSecurityField } from './security-field-model.mjs'

const baseURL = process.env.NOCOBASE_API_BASE_URL || 'http://localhost:8196/api/'
const account = process.env.NOCOBASE_ADMIN_ACCOUNT || 'nocobase'
const password = process.env.NOCOBASE_ADMIN_PASSWORD || 'admin123'
const authenticator = process.env.NOCOBASE_AUTHENTICATOR || 'basic'
const schemaOnly = ['1', 'true', 'yes'].includes(String(process.env.MIGRATE_SCHEMA_ONLY || '').toLowerCase())
const client = new APIClient({ baseURL, storageType: 'memory' })

function rows(payload) {
  return Array.isArray(payload?.data) ? payload.data : []
}

async function listAll(resource, params = {}, of) {
  const result = []
  let page = 1
  for (;;) {
    const response = await client.resource(resource, of).list({ ...params, page, pageSize: 1000 })
    result.push(...rows(response.data))
    const totalPage = Number(response.data?.meta?.totalPage || 0)
    if (!totalPage || page >= totalPage) return result
    page += 1
  }
}

async function findOne(resource, filter, of) {
  const response = await client.resource(resource, of).list({ filter, page: 1, pageSize: 1 })
  return rows(response.data)[0] || null
}

async function upsert(collection, filter, values) {
  values = sanitizeSecurityValues(collection, values)
  const existing = await findOne(collection, filter)
  if (existing?.id != null) {
    await client.resource(collection).update({ filterByTk: existing.id, values })
    return existing.id
  }
  const response = await client.resource(collection).create({ values })
  return response.data?.data?.id ?? response.data?.id
}

function description(title, purpose = '配置、查询、关联、筛选和审计') {
  return `记录${title}，用于${purpose}。`
}

const field = {
  input(name, title, options = {}) {
    return { name, type: 'string', interface: 'input', description: options.description || description(title), uiSchema: { type: 'string', title, 'x-component': 'Input' }, ...options }
  },
  text(name, title, options = {}) {
    return { name, type: 'text', interface: 'textarea', description: options.description || description(title), uiSchema: { type: 'string', title, 'x-component': 'Input.TextArea' }, ...options }
  },
  integer(name, title, options = {}) {
    return { name, type: 'integer', interface: 'integer', description: options.description || description(title, '数量限制、运行统计和审计'), uiSchema: { type: 'number', title, 'x-component': 'InputNumber' }, ...options }
  },
  bigInt(name, title, options = {}) {
    return { name, type: 'bigInt', interface: 'integer', description: options.description || description(title, '大数量运行统计和审计'), uiSchema: { type: 'number', title, 'x-component': 'InputNumber' }, ...options }
  },
  number(name, title, options = {}) {
    return { name, type: 'double', interface: 'number', description: options.description || description(title, '策略阈值、运行统计和审计'), uiSchema: { type: 'number', title, 'x-component': 'InputNumber' }, ...options }
  },
  bool(name, title, options = {}) {
    return { name, type: 'boolean', interface: 'checkbox', description: options.description || description(title, '功能能力和安全边界控制'), uiSchema: { type: 'boolean', title, 'x-component': 'Checkbox' }, ...options }
  },
  json(name, title, options = {}) {
    return { name, type: 'jsonb', interface: 'json', description: options.description || description(title, '保存不含 Secret 和明文数据的结构化扩展信息'), uiSchema: { type: 'object', title, 'x-component': 'Input.JSON' }, ...options }
  },
  datetime(name, title, options = {}) {
    return { name, type: 'date', interface: 'datetime', description: options.description || description(title, '有效期、运行时间轴和审计'), uiSchema: { type: 'string', title, 'x-component': 'DatePicker', 'x-component-props': { showTime: true } }, ...options }
  },
  select(name, title, choices, options = {}) {
    return {
      name,
      type: 'string',
      interface: 'select',
      description: options.description || description(title, '状态、类型和运行决策的受控值'),
      uiSchema: { type: 'string', title, enum: choices.map(([value, label, color]) => ({ value, label, ...(color ? { color } : {}) })), 'x-component': 'Select' },
      ...options,
    }
  },
  m2o(name, title, target, foreignKey, targetTitleField, options = {}) {
    return {
      name,
      type: 'belongsTo',
      interface: 'm2o',
      description: options.description || description(title, '建立明确的业务实体关联'),
      target,
      foreignKey,
      targetKey: 'id',
      targetTitleField,
      uiSchema: { type: 'object', title, 'x-component': 'AssociationField', 'x-component-props': { fieldNames: { label: targetTitleField, value: 'id' } } },
      ...options,
    }
  },
}

const commonStatus = [['draft', '草稿', 'default'], ['enabled', '启用', 'green'], ['disabled', '停用', 'red']]
const publishStatus = [['unpublished', '未发布', 'default'], ['publishing', '发布中', 'blue'], ['success', '发布成功', 'green'], ['failed', '发布失败', 'red']]
const outputModes = [['detail', '明细', 'blue'], ['masked', '脱敏', 'cyan'], ['aggregate', '聚合', 'orange'], ['encrypted', '密态', 'purple']]
const riskLevels = [['normal', '正常', 'green'], ['notice', '提示', 'blue'], ['medium', '中风险', 'orange'], ['high', '高风险', 'red'], ['critical', '严重', 'magenta']]

const dictionarySpecs = [
  ['resource_type', '资源类型', [['measurement_table', '量测明细'], ['aggregate_resource', '聚合资源'], ['existing_api', '已有 API']]],
  ['update_cycle', '更新周期', [['realtime', '实时'], ['minute', '分钟'], ['hour', '小时']]],
  ['protection_level', '防护层', [['l1', '普通共享层'], ['l2', '内部受控层'], ['l3', '跨域密态层']]],
  ['resource_status', '资源状态', [['draft', '草稿'], ['enabled', '启用'], ['disabled', '停用']]],
  ['security_level', '安全等级', [['normal', '普通'], ['internal', '内部'], ['sensitive', '敏感'], ['important', '重要'], ['core', '核心']]],
  ['desensitization_mode', '脱敏方式', [['none', '无'], ['mask', '掩码'], ['hash', '散列'], ['tokenize', '标记化']]],
  ['api_access_mode', 'API 接入模式', [['direct', '直接纳管'], ['develop', '数据库服务化'], ['orchestrate', '编排增强']]],
  ['api_status', 'API 状态', [['draft', '草稿'], ['published', '已发布'], ['disabled', '停用']]],
  ['publish_status', '发布状态', [['unpublished', '未发布'], ['publishing', '发布中'], ['success', '成功'], ['failed', '失败']]],
  ['source_type', '数据源类型', [['validation_database', '验证数据库'], ['existing_api', '已有 API'], ['file_e', 'E 文件通道'], ['message_queue', '消息服务通道'], ['ems', '调度自动化'], ['tmr', '电能量计量'], ['distribution_cloud', '配电云主站'], ['cable_monitor', '输变电状态监测'], ['weather', '网格化气象'], ['hvcable', '高压电缆在线监测']]],
  ['source_status', '数据源状态', [['unchecked', '未检查'], ['testing', '检查中'], ['connected', '正常'], ['exception', '异常'], ['disabled', '停用']]],
  ['ingest_execution_type', '接入执行类型', [['connection_test', '连接检查'], ['validation', '数据校验'], ['tagging', '标签执行']]],
  ['ingest_result', '接入结果', [['success', '成功'], ['partial', '部分成功'], ['failed', '失败']]],
  ['access_subject_type', '主体类型', [['internal_app', '内部应用'], ['external_party', '外部访问方']]],
  ['access_subject_status', '主体状态', [['draft', '草稿'], ['enabled', '启用'], ['disabled', '停用']]],
  ['policy_kind', '策略类型', [['resource_profile', '资源档案'], ['access_policy', '访问策略']]],
  ['output_mode', '输出模式', [['detail', '明细'], ['masked', '脱敏'], ['aggregate', '聚合'], ['encrypted', '密态']]],
  ['policy_status', '策略状态', [['draft', '草稿'], ['enabled', '启用'], ['disabled', '停用']]],
  ['decision_result', '决策结果', [['allow', '放行'], ['limit', '限制'], ['deny', '拒绝']]],
  ['risk_level', '风险级别', [['normal', '正常'], ['notice', '提示'], ['medium', '中风险'], ['high', '高风险'], ['critical', '严重']]],
  ['crypto_key_status', '密钥状态', [['pending_validation', '待校验'], ['enabled', '启用'], ['disabled', '停用'], ['expired', '已过期']]],
  ['crypto_operation', '同态操作', [['sum', '求和'], ['mean', '平均值']]],
  ['crypto_task_status', '同态任务状态', [['pending', '待执行'], ['running', '执行中'], ['success', '成功'], ['failed', '失败']]],
  ['resource_role', '资源角色', [['primary', '主资源'], ['participant', '参与资源']]],
]

const dictionaryViewNames = [
  'dict_resource_types', 'dict_update_cycles', 'dict_protection_levels', 'dict_resource_statuses',
  'dict_security_levels', 'dict_desensitization_modes', 'dict_api_access_modes',
  'dict_api_statuses', 'dict_publish_statuses', 'dict_source_types', 'dict_source_statuses',
  'dict_ingest_execution_types', 'dict_ingest_results', 'dict_subject_types', 'dict_subject_statuses',
  'dict_policy_kinds', 'dict_output_modes', 'dict_policy_statuses',
  'dict_decision_results', 'dict_risk_levels', 'dict_crypto_key_statuses', 'dict_crypto_operations',
  'dict_crypto_task_statuses', 'dict_resource_roles',
]

const dictionaryViewSpecs = dictionarySpecs.map(([typeCode, typeName, values], index) => ({
  name: dictionaryViewNames[index], typeCode, typeName, values,
}))

const newCollections = [
  {
    name: 'security_api_resources', title: 'API 资源', titleField: 'api_name', description: '管理三种 API 接入模式、数据范围能力、发布路径和运行状态。',
    fields: [
      field.input('api_code', 'API 编码', { allowNull: false, unique: true }),
      field.input('api_name', 'API 名称', { allowNull: false }),
      field.select('access_mode', '接入模式', [['direct', '直接纳管'], ['develop', '数据库服务化'], ['orchestrate', '编排增强']], { allowNull: false }),
      field.select('http_method', '请求方法', [['GET', 'GET'], ['POST', 'POST']], { allowNull: false, defaultValue: 'GET' }),
      field.input('upstream_url', '上游地址'),
      field.input('orchestrator_path', '编排路径'),
      field.input('gateway_path', '发布路径', { allowNull: false, unique: true }),
      field.json('runtime_config_json', '运行查询配置'),
      field.select('protection_level', '防护层', [['l1', '普通共享层'], ['l2', '内部受控层'], ['l3', '跨域密态层']], { allowNull: false, defaultValue: 'l2' }),
      field.bool('supports_row_filter', '支持行过滤', { allowNull: false, defaultValue: false }),
      field.bool('supports_field_filter', '支持字段过滤', { allowNull: false, defaultValue: false }),
      field.bool('supports_aggregate', '支持聚合', { allowNull: false, defaultValue: false }),
      field.bool('supports_homomorphic', '支持密态任务', { allowNull: false, defaultValue: false }),
      field.select('api_status', 'API 状态', commonStatus, { allowNull: false, defaultValue: 'draft' }),
      field.integer('publish_version', '发布版本', { allowNull: false, defaultValue: 0 }),
      field.select('publish_status', '发布状态', publishStatus, { allowNull: false, defaultValue: 'unpublished' }),
      field.datetime('published_at', '发布时间'),
      field.text('publish_error', '发布错误'),
    ],
    relations: [
      field.m2o('resource', '数据资源', 'eco_data_resources', 'resource_id', 'resource_name', { allowNull: false }),
      field.m2o('data_source', '数据源', 'security_data_sources', 'data_source_id', 'source_name'),
    ],
  },
  {
    name: 'security_ingest_logs', title: '接入日志', titleField: 'batch_code', description: '保存数据源连接检查、数据校验和标签执行的真实批次结果。',
    fields: [
      field.input('batch_code', '批次编号', { allowNull: false, unique: true }),
      field.select('execution_type', '执行类型', [['connection_test', '连接检查'], ['validation', '数据校验'], ['tagging', '标签执行']], { allowNull: false }),
      field.integer('rule_version', '规则版本', { allowNull: false, defaultValue: 1 }),
      field.datetime('started_at', '开始时间', { allowNull: false }),
      field.datetime('finished_at', '完成时间'),
      field.bigInt('input_count', '输入数', { allowNull: false, defaultValue: 0 }),
      field.bigInt('passed_count', '通过数', { allowNull: false, defaultValue: 0 }),
      field.bigInt('rejected_count', '拒绝数', { allowNull: false, defaultValue: 0 }),
      field.integer('duration_ms', '执行耗时'),
      field.select('result_status', '执行结果', [['success', '成功'], ['partial', '部分成功'], ['failed', '失败']], { allowNull: false }),
      field.text('error_summary', '错误摘要'),
      field.json('result_detail_json', '结果详情'),
    ],
    relations: [
      field.m2o('data_source', '数据源', 'security_data_sources', 'data_source_id', 'source_name', { allowNull: false }),
      field.m2o('api_resource', 'API 资源', 'security_api_resources', 'api_resource_id', 'api_name'),
    ],
  },
  {
    name: 'security_access_subjects', title: '访问主体', titleField: 'subject_name', description: '管理两个内部应用和一个外部访问方的凭据引用、有效期和 IP 边界。',
    fields: [
      field.input('subject_code', '主体编码', { allowNull: false, unique: true }),
      field.input('subject_name', '主体名称', { allowNull: false }),
      field.select('subject_type', '主体类型', [['internal_app', '内部应用'], ['external_party', '外部访问方']], { allowNull: false }),
      field.input('organization_code', '组织编码'),
      field.input('organization_name', '组织名称'),
      field.input('credential_ref', '凭据引用', { allowNull: false, description: '指向安全存储中 API Key 或签名密钥的引用，不保存明文凭据。' }),
      field.json('allowed_api_codes_json', '授权 API 编码列表', { allowNull: false, defaultValue: [] }),
      field.json('ip_whitelist_json', 'IP 白名单'),
      field.datetime('valid_from', '生效时间'),
      field.datetime('valid_to', '失效时间'),
      field.select('subject_status', '主体状态', commonStatus, { allowNull: false, defaultValue: 'draft' }),
    ],
    relations: [],
  },
  {
    name: 'security_policy_decision_logs', title: '调用与策略决策日志', titleField: 'request_id', description: '保存每次数据 API 调用、策略决策、风险分、限制和响应摘要。',
    fields: [
      field.input('request_id', '请求编号', { allowNull: false, unique: true }),
      field.datetime('requested_at', '请求时间', { allowNull: false }),
      field.input('client_ip', '来源 IP', { allowNull: false }),
      field.number('query_days', '查询跨度', { defaultValue: 0 }),
      field.integer('requested_rows', '请求行数', { defaultValue: 0 }),
      field.integer('returned_rows', '返回行数', { defaultValue: 0 }),
      field.select('requested_output_mode', '请求输出模式', outputModes),
      field.select('effective_output_mode', '实际输出模式', outputModes),
      field.select('decision_result', '决策结果', [['allow', '放行'], ['limit', '限制'], ['deny', '拒绝']], { allowNull: false }),
      field.input('decision_reason_code', '原因编码', { allowNull: false }),
      field.text('decision_reason', '决策原因'),
      field.integer('risk_score', '风险分', { allowNull: false, defaultValue: 0 }),
      field.select('risk_level', '风险级别', riskLevels, { allowNull: false, defaultValue: 'normal' }),
      field.json('applied_limits_json', '生效限制'),
      field.integer('response_status', '响应状态码'),
      field.bigInt('response_bytes', '响应字节数', { defaultValue: 0 }),
      field.integer('duration_ms', '总耗时'),
    ],
    relations: [
      field.m2o('subject', '访问主体', 'security_access_subjects', 'subject_id', 'subject_name'),
      field.m2o('api_resource', 'API 资源', 'security_api_resources', 'api_resource_id', 'api_name'),
      field.m2o('policy', '命中策略', 'eco_resource_security_policies', 'policy_id', 'policy_name'),
    ],
  },
  {
    name: 'security_crypto_keys', title: '同态密钥', titleField: 'key_code', description: '保存外部访问方的公钥、计算密钥和上下文版本引用，绝不保存私钥。',
    fields: [
      field.input('key_code', '密钥编码', { allowNull: false, unique: true }),
      field.input('algorithm_code', '算法编码', { allowNull: false, defaultValue: 'ckks' }),
      field.input('context_version', '上下文版本', { allowNull: false }),
      field.json('context_parameters_json', '上下文参数', { allowNull: false }),
      field.input('public_key_ref', '公钥引用', { allowNull: false }),
      field.input('evaluation_key_ref', '计算密钥引用', { allowNull: false }),
      field.input('key_fingerprint', '密钥指纹', { allowNull: false, unique: true }),
      field.datetime('valid_from', '生效时间', { allowNull: false }),
      field.datetime('valid_to', '失效时间'),
      field.select('key_status', '密钥状态', [['pending_validation', '待校验'], ['enabled', '启用'], ['disabled', '停用'], ['expired', '已过期']], { allowNull: false, defaultValue: 'pending_validation' }),
      field.json('validation_summary_json', '校验摘要'),
    ],
    relations: [field.m2o('subject', '外部访问方', 'security_access_subjects', 'subject_id', 'subject_name', { allowNull: false })],
  },
  {
    name: 'security_streaming_events', title: '流式量测事件', titleField: 'event_code', description: '消息服务通道的连续量测事件源，由流式处理引擎按窗口消费与聚合，支持确定性演示注入。',
    fields: [
      field.input('event_code', '事件编码', { allowNull: false, unique: true }),
      field.datetime('event_time', '事件时间', { allowNull: false }),
      field.input('source_code', '来源数据源', { allowNull: false, defaultValue: 'SRC-DCLOUD-001' }),
      field.input('region_code', '区域编码', { allowNull: false }),
      field.input('organization_code', '组织编码'),
      field.input('psr_id', '测点标识'),
      field.input('measure_type', '量测项', { allowNull: false }),
      field.number('value', '量测值'),
      field.select('quality_code', '质量码', [['normal', '正常'], ['suspect', '可疑'], ['invalid', '无效']], { allowNull: false, defaultValue: 'normal' }),
      field.bool('processed', '已消费', { defaultValue: false }),
      field.datetime('processed_at', '消费时间'),
      field.integer('run_id', '处理批次'),
    ],
    relations: [],
  },
  {
    name: 'security_streaming_windows', title: '流式窗口聚合', titleField: 'window_key', description: '流式处理引擎按时间窗口生成的区域×量测项聚合结果，含事件数、异常数与数值统计。',
    fields: [
      field.input('window_key', '窗口标识', { allowNull: false, unique: true }),
      field.datetime('window_start', '窗口开始', { allowNull: false }),
      field.datetime('window_end', '窗口结束', { allowNull: false }),
      field.input('region_code', '区域编码', { allowNull: false }),
      field.input('measure_type', '量测项', { allowNull: false }),
      field.integer('event_count', '事件数', { allowNull: false, defaultValue: 0 }),
      field.integer('anomaly_count', '异常数', { allowNull: false, defaultValue: 0 }),
      field.number('sum_value', '数值合计'),
      field.number('avg_value', '数值均值'),
      field.integer('run_id', '处理批次'),
    ],
    relations: [],
  },
  {
    name: 'security_streaming_runs', title: '流式引擎批次日志', titleField: 'run_code', description: '流式处理引擎每次轮询的消费批次：事件数、窗口数、异常数与耗时。',
    fields: [
      field.input('run_code', '批次编码', { allowNull: false, unique: true }),
      field.datetime('started_at', '开始时间', { allowNull: false }),
      field.datetime('finished_at', '结束时间'),
      field.integer('processed_events', '消费事件数', { allowNull: false, defaultValue: 0 }),
      field.integer('window_count', '生成窗口数', { allowNull: false, defaultValue: 0 }),
      field.integer('anomaly_count', '异常事件数', { allowNull: false, defaultValue: 0 }),
      field.select('status', '状态', [['running', '执行中'], ['success', '成功'], ['warning', '部分异常'], ['failed', '失败']], { allowNull: false, defaultValue: 'running' }),
      field.integer('duration_ms', '耗时'),
      field.text('error_summary', '错误摘要'),
      field.json('result_detail_json', '结果摘要'),
    ],
    relations: [],
  },
]

const existingCollections = {
  eco_data_resources: '管理可被 API、策略和同态任务引用的量测数据资源。',
  eco_resource_security_fields: '管理资源字段、敏感属性、标签和输出控制要求。',
  eco_resource_security_policies: '兼容 2.0 资源安全档案并保存 3.0 可发布的主体访问策略。',
  security_data_sources: '管理数据库或已有 API 的连接引用、校验规则和标签规则。',
  security_confidential_tasks: '保存授权取数范围、计算操作、任务状态和密文结果引用。',
  security_confidential_task_resources: '关联同态任务、数据资源和字段安全定义，并保存每个资源的字段范围。',
}

const extensions = {
  eco_data_resources: [
    field.select('protection_level', '防护层', [['l1', '普通共享层'], ['l2', '内部受控层'], ['l3', '跨域密态层']], { defaultValue: 'l2' }),
    field.select('resource_status', '资源状态', commonStatus, { defaultValue: 'draft' }),
    field.select('link_status', '关联状态', [['linked', '已关联设备档案'], ['unlinked', '未关联设备档案']], { defaultValue: 'linked' }),
    field.m2o('data_source', '数据源', 'security_data_sources', 'data_source_id', 'source_name'),
  ],
  eco_resource_security_fields: [
    field.bool('output_allowed', '允许输出', { allowNull: false, defaultValue: true }),
  ],
  security_data_sources: [
    field.json('validation_rules_json', '校验规则'),
    field.json('tag_rules_json', '标签规则'),
    field.json('connection_options_json', '连接扩展参数'),
    field.json('last_check_summary_json', '检查摘要'),
  ],
  eco_resource_security_policies: [
    field.select('policy_kind', '策略类型', [['resource_profile', '资源档案'], ['access_policy', '访问策略']], { allowNull: false, defaultValue: 'resource_profile' }),
    field.input('scenario', '使用场景'),
    field.json('source_ips_json', '来源 IP 范围'),
    field.json('allowed_time_ranges_json', '允许时段'),
    field.integer('max_requests_per_minute', '每分钟上限', { allowNull: false, defaultValue: 60 }),
    field.integer('max_query_days', '最大查询天数', { allowNull: false, defaultValue: 1 }),
    field.integer('max_rows', '最大返回行数', { allowNull: false, defaultValue: 1000 }),
    field.json('organization_scope_json', '组织范围'),
    field.json('region_scope_json', '区域范围'),
    field.json('abnormal_access_rules_json', '异常访问处置规则'),
    field.select('output_mode', '输出模式', outputModes),
    field.integer('risk_threshold', '风险阈值', { allowNull: false, defaultValue: 70 }),
    field.integer('policy_version', '策略版本', { allowNull: false, defaultValue: 1 }),
    field.select('publish_status', '发布状态', publishStatus, { allowNull: false, defaultValue: 'unpublished' }),
    field.datetime('published_at', '发布时间'),
    field.input('gateway_config_version', '运行配置版本'),
    field.text('publish_error', '发布错误'),
    field.m2o('subject', '访问主体', 'security_access_subjects', 'subject_id', 'subject_name'),
    field.m2o('api_resource', 'API 资源', 'security_api_resources', 'api_resource_id', 'api_name'),
  ],
  security_confidential_tasks: [
    field.select('operation', '计算操作', [['sum', '求和'], ['mean', '平均值']]),
    field.json('region_scope_json', '区域范围'),
    field.json('organization_scope_json', '组织范围'),
    field.input('measure_field_code', '量测字段编码'),
    field.datetime('data_start_at', '数据开始时间'),
    field.datetime('data_end_at', '数据结束时间'),
    field.integer('sample_count', '样本数', { defaultValue: 0 }),
    field.input('idempotency_key', '幂等键', { unique: true }),
    field.input('ciphertext_result_ref', '密文结果引用'),
    field.input('result_hash', '结果摘要'),
    field.datetime('started_at', '开始时间'),
    field.datetime('completed_at', '完成时间'),
    field.integer('duration_ms', '执行耗时'),
    field.text('error_summary', '错误摘要'),
    field.m2o('subject', '外部访问方', 'security_access_subjects', 'subject_id', 'subject_name'),
    field.m2o('api_resource', 'API 资源', 'security_api_resources', 'api_resource_id', 'api_name'),
    field.m2o('crypto_key', '密钥版本', 'security_crypto_keys', 'crypto_key_id', 'key_code'),
  ],
}

async function ensureCollection(spec) {
  const existing = await findOne('collections', { name: spec.name })
  const auditOptions = { createdAt: true, createdBy: true, updatedAt: true, updatedBy: true }
  if (!existing) {
    await client.resource('collections').create({ values: { name: spec.name, title: spec.title, description: spec.description, template: 'general', autoGenId: true, titleField: spec.titleField, ...auditOptions } })
  } else {
    await client.resource('collections').update({ filterByTk: spec.name, values: { title: spec.title, description: spec.description, titleField: spec.titleField, ...auditOptions } })
  }
}

async function ensureField(collectionName, definition) {
  if (isDeprecatedSecurityField(collectionName, definition.name)) return
  const existing = await findOne('collections.fields', { name: definition.name }, collectionName)
  if (!existing) {
    await client.resource('collections.fields', collectionName).create({ values: definition })
    return
  }
  await client.resource('collections.fields', collectionName).update({
    filterByTk: definition.name,
    values: { description: definition.description, uiSchema: { ...existing.uiSchema, title: definition.uiSchema?.title || existing.uiSchema?.title || definition.name } },
  })
}

async function auditCollection(collectionName) {
  const collection = await findOne('collections', { name: collectionName })
  if (!collection?.description) throw new Error(`${collectionName} 缺少 Collection 描述`)
  for (const item of await listAll('collections.fields', {}, collectionName)) {
    if (item.description) continue
    const title = item.uiSchema?.title || item.name
    await client.resource('collections.fields', collectionName).update({ filterByTk: item.name, values: { description: description(title) } })
  }
}

async function ensureSchema() {
  for (const [name, value] of Object.entries(existingCollections)) {
    const existing = await findOne('collections', { name })
    if (!existing) throw new Error(`缺少 2.0 基础 Collection: ${name}`)
    await client.resource('collections').update({ filterByTk: name, values: { description: value } })
  }
  for (const spec of newCollections) await ensureCollection(spec)
  for (const spec of newCollections) for (const definition of spec.fields) await ensureField(spec.name, definition)
  for (const [name, definitions] of Object.entries(extensions)) for (const definition of definitions) await ensureField(name, definition)
  for (const spec of newCollections) for (const definition of spec.relations) await ensureField(spec.name, definition)
  for (const name of [...Object.keys(existingCollections), ...newCollections.map((item) => item.name)]) await auditCollection(name)
}

async function ensureDictionaries() {
  for (const [typeCode, typeName, values] of dictionarySpecs) {
    await upsert('jcDictionaryTypes', { typeCode }, { typeCode, typeName, typeDescription: `${typeName}，用于数据安全管控 3.0 受控字段。` })
    for (let index = 0; index < values.length; index += 1) {
      const [dictValue, dictValueName] = values[index]
      await upsert('jcDictionaryItems', { typeCode, dictValue }, {
        typeCode,
        typeName,
        dictValue,
        dictValueName,
        dictColor: ['red', 'orange', 'green', 'blue', 'purple'][index % 5],
        dictValueDescription: `${typeName}：${dictValueName}`,
        dictSort: (index + 1) * 10,
      })
    }
  }
}

async function ensureDictionaryViews() {
  const fieldTitles = {
    id: 'ID', typeCode: '字典类型编码', typeName: '字典类型名称', dictValue: '字典值',
    dictValueName: '显示名称', dictColor: '显示颜色', dictValueDescription: '值说明',
    dictValueAttr: '扩展属性', dictSort: '排序',
  }
  for (const spec of dictionaryViewSpecs) {
    const existing = await findOne('collections', { name: spec.name })
    if (existing) continue
    let inferred
    try {
      const response = await client.resource('dbViews').get({ filterByTk: spec.name, schema: 'public' })
      inferred = response.data?.data?.fields || response.data?.fields || []
    } catch (error) {
      throw new Error(`缺少字典数据库视图 ${spec.name}，请先执行 docker/v3.0/initdb/04-init-dictionary-views.sql：${error.message}`)
    }
    if (!inferred.length) throw new Error(`字典数据库视图 ${spec.name} 未推断出字段`)
    const fields = inferred.map(({ rawType, source, field: sourceField, ...item }) => ({
      ...item,
      description: `记录${spec.typeName}${fieldTitles[item.name] || item.name}，用于只读字典选择和显示。`,
      uiSchema: {
        type: ['integer', 'bigInt', 'double'].includes(item.type) ? 'number' : 'string',
        title: fieldTitles[item.name] || item.name,
        'x-component': item.interface === 'textarea' ? 'Input.TextArea' : item.interface === 'integer' ? 'InputNumber' : 'Input',
      },
    }))
    await client.resource('collections').create({ values: {
      name: spec.name,
      title: `${spec.typeName}字典`,
      description: `${spec.typeName}专用只读字典视图。`,
      template: 'view',
      viewName: spec.name,
      schema: 'public',
      titleField: 'dictValueName',
      fields,
    } })
  }
}

async function ensureClassificationsAndTagPolicies() {
  const categoryTypes = [
    ['eco_domain_category', '数据分类树', '电网业务域分类。'],
    ['eco_provider_units', '提供单位树', '数据责任组织分类。'],
    ['eco_region_categories', '区域分类树', '量测数据区域范围分类。'],
    ['information_category', '信息分类树', '量测字段信息分类。'],
  ]
  for (const [typeCode, typeName, typeDescription] of categoryTypes) {
    await upsert('jcCategoryTreeTypes', { typeCode }, { typeCode, typeName, typeDescription })
  }

  async function ensureNode(typeCode, nodeCode, nodeName, nodeSort, parentNodeCode, nodeDescription) {
    const type = categoryTypes.find(([code]) => code === typeCode)
    const parent = parentNodeCode ? await findOne('jcCategoryTreeNodes', { typeCode, nodeCode: parentNodeCode }) : null
    return upsert('jcCategoryTreeNodes', { typeCode, nodeCode }, {
      typeCode,
      typeName: type?.[1] || typeCode,
      nodeCode,
      nodeName,
      nodeSort,
      parentNodeId: parent?.id || null,
      nodeDescription,
    })
  }

  await ensureNode('eco_region_categories', 'province-company', '省公司', 10, null, '演示区域根节点。')
  await ensureNode('eco_region_categories', 'region-a', '演示区域 A', 20, 'province-company', '内部明细量测验收区域。')
  await ensureNode('eco_region_categories', 'region-b', '演示区域 B', 30, 'province-company', '聚合与跨域量测验收区域。')
  await ensureNode('eco_provider_units', 'org-a', '省级调控中心', 50, null, '演示内部数据责任组织 A。')
  await ensureNode('eco_provider_units', 'org-b', '区域数据管理中心', 60, null, '演示内部数据责任组织 B。')
  await ensureNode('information_category', 'root', '信息分类树', 0, null, '信息分类根节点。')
  await ensureNode('information_category', 'measurement-identity', '量测标识信息', 80, 'root', '量测点、设备和用户标识。')
  await ensureNode('information_category', 'measurement-time', '量测时间信息', 90, 'root', '采集、发生和同步时间。')
  await ensureNode('information_category', 'measurement-value', '量测值信息', 100, 'root', '电压、电流、功率、电量等量测值。')
  await ensureNode('information_category', 'measurement-quality', '量测质量信息', 110, 'root', '质量码和完整性状态。')

  const tagPolicies = [
    ['3.0-来源-验证数据库', 'security_data_sources', 'source_tags', 'source_type', 'validation_database', ['验证数据库'], 10],
    ['3.0-来源-已有API', 'security_data_sources', 'source_tags', 'source_type', 'existing_api', ['已有量测 API'], 20],
    ['3.0-敏感等级-重要', 'eco_resource_security_fields', 'field_tags', 'security_level', 'important', ['重要'], 40],
    ['3.0-敏感等级-核心', 'eco_resource_security_fields', 'field_tags', 'security_level', 'core', ['核心'], 50],
    ['3.0-共享方式-明细受控', 'eco_data_resources', 'resource_tags', 'protection_level', 'l2', ['明细受控'], 60],
    ['3.0-共享方式-仅聚合', 'eco_data_resources', 'resource_tags', 'protection_level', 'l1', ['仅聚合'], 70],
    ['3.0-共享方式-仅密态', 'eco_data_resources', 'resource_tags', 'protection_level', 'l3', ['仅密态'], 80],
  ]
  for (const [title, collectionName, fieldName, ruleField, value, tags, sort] of tagPolicies) {
    await upsert('jcTagGenerationPolicies', { title }, {
      title, enabled: true, dataSourceKey: 'main', collectionName, fieldName, logic: 'and',
      rules: [{ fieldName: ruleField, operator: 'eq', value }], tags, sort,
      remark: '3.0 最小实施基线受控标签策略。', scene: 'default',
    })
  }
}

async function seedData() {
  const sources = await listAll('security_data_sources')
  const sourceByCode = new Map(sources.map((item) => [item.source_code, item]))
  const databaseSource = sourceByCode.get('SRC-YC20-001') || sources[0]
  const apiSource = sourceByCode.get('SRC-DISPATCH-001') || sources[1] || databaseSource
  if (!databaseSource || !apiSource) throw new Error('需要至少一条可复用的数据源')

  await client.resource('security_data_sources').update({ filterByTk: databaseSource.id, values: {
    source_type: 'validation_database',
    host: 'measurement-db', port: 5432, database_name: 'measurement_data', username: 'measurement_reader',
    secret_ref: 'secret://security/source/src-yc20-001',
    source_tags: ['验证数据库', '电力量测', '内部', '明细受控'],
    validation_rules_json: { required: ['DATA_TIME', 'POINT_CODE', 'ACTIVE_POWER'], numericRanges: { ACTIVE_POWER: [-1000, 1000] }, duplicateKeys: ['POINT_CODE', 'DATA_TIME'] },
    tag_rules_json: { source: '验证数据库', dataType: '电力量测', region: '演示区域 A', sensitivity: '内部', sharingMode: '明细受控' },
    security_config_json: { encryptionEnabled: false, encryptionAlgorithm: '', integrityEnabled: true, checksumAlgorithm: 'SM3', samplingEnabled: true, samplingRate: 10, failureThreshold: 3, timeoutSeconds: 30 },
    connection_options_json: { ssl: false, timeoutSeconds: 15, readOnly: true },
    connection_status: 'connected', last_check_summary_json: { status: 'success', checkedAt: '2026-07-11T16:00:00+08:00', latencyMs: 780 },
  } })
  if (apiSource.id !== databaseSource.id) await client.resource('security_data_sources').update({ filterByTk: apiSource.id, values: {
    source_type: 'existing_api',
    host: 'http://data-provider:8090/existing-api/region-load', port: null, database_name: '区域负荷服务', username: null,
    source_tags: ['已有量测 API', '区域负荷', '普通', '仅聚合'],
    validation_rules_json: { required: ['timestamp', 'regionCode', 'activePower'], responseShape: 'records' },
    tag_rules_json: { source: '已有量测 API', dataType: '区域负荷', region: '演示区域 B', sensitivity: '普通', sharingMode: '聚合共享' },
    connection_options_json: { timeoutSeconds: 10, readOnly: true },
    connection_status: 'connected', last_check_summary_json: { status: 'success', checkedAt: '2026-07-11T16:00:00+08:00', latencyMs: 86 },
  } })
  const v31SourceCodes = new Set([
    'SRC-YC20-001', 'SRC-DISPATCH-001', 'SRC-EMS-001', 'SRC-STATION-001', 'SRC-TMR-001',
    'SRC-DISTRIBUTION-001', 'SRC-DCLOUD-001', 'SRC-CABLE-001', 'SRC-WEATHER-001', 'SRC-HVCABLE-001',
  ])
  for (const source of sources.filter((item) => !v31SourceCodes.has(String(item.source_code || '')))) {
    await client.resource('security_data_sources').update({ filterByTk: source.id, values: {
      connection_status: 'disabled', source_tags: ['历史归档'], last_check_summary_json: {},
    } })
  }

  const resources = await listAll('eco_data_resources')
  const meterResource = resources.find((item) => item.resource_code === 'GRID-METER-SEC-001') || resources[0]
  const aggregateResource = resources.find((item) => item.resource_code === 'GRID-DISPATCH-SEC-002') || resources[1] || meterResource
  if (!meterResource || !aggregateResource) throw new Error('需要至少一条可复用的数据资源')
  const regionA = await findOne('jcCategoryTreeNodes', { typeCode: 'eco_region_categories', nodeCode: 'region-a' })
  const regionB = await findOne('jcCategoryTreeNodes', { typeCode: 'eco_region_categories', nodeCode: 'region-b' })
  const orgA = await findOne('jcCategoryTreeNodes', { typeCode: 'eco_provider_units', nodeCode: 'org-a' })
  const orgB = await findOne('jcCategoryTreeNodes', { typeCode: 'eco_provider_units', nodeCode: 'org-b' })
  const measurementType = await findOne('jcDictionaryItems', { typeCode: 'resource_type', dictValue: 'measurement_table' })
  const existingApiType = await findOne('jcDictionaryItems', { typeCode: 'resource_type', dictValue: 'existing_api' })
  await client.resource('eco_data_resources').update({ filterByTk: meterResource.id, values: {
    data_source_id: databaseSource.id, protection_level: 'l2', resource_status: 'enabled',
    region_category_id: regionA?.id, provider_org_id: orgA?.id, data_resource_type_id: measurementType?.id,
    resource_tags: ['验证数据库', '量测明细', '演示区域 A', '敏感', '明细受控'],
  } })
  await client.resource('eco_data_resources').update({ filterByTk: aggregateResource.id, values: {
    data_source_id: apiSource.id, protection_level: 'l1', resource_status: 'enabled',
    region_category_id: regionB?.id, provider_org_id: orgB?.id, data_resource_type_id: existingApiType?.id,
    resource_tags: ['已有量测 API', '区域聚合', '演示区域 B', '重要', '仅聚合'],
  } })
  const v31ResourceCodes = new Set([
    'GRID-METER-SEC-001', 'GRID-DISPATCH-SEC-002',
    'GRID-LVF-VOLT-001', 'GRID-LVF-CURR-002', 'CUST-DAILY-ENERGY-003', 'GRID-LVF-POWER-004',
    'CUST-POWER-CURVE-005', 'GRID-LVF-PF-006', 'CUST-OUTAGE-EVENT-007', 'GRID-SWITCH-EVENT-008',
    'GRID-NO-RELAD-009', 'GRID-TMR-ENERGY-010',
    'GRID-LVF-PHASE-011', 'CUST-HV-DAILY-INFO-012', 'CUST-LV-DAILY-INFO-013', 'CUST-HV-DAILY-LOAD-014',
  ])
  for (const resource of resources) {
    if (resource.resource_code === 'GRID-METER-SEC-001' || resource.resource_code === 'GRID-DISPATCH-SEC-002') continue
    if (!v31ResourceCodes.has(String(resource.resource_code || ''))) {
      await client.resource('eco_data_resources').update({ filterByTk: resource.id, values: {
        resource_status: 'disabled', resource_tags: ['历史归档'],
      } })
      continue
    }
    await client.resource('eco_data_resources').update({ filterByTk: resource.id, values: {
      resource_status: 'enabled',
      link_status: resource.resource_code === 'GRID-NO-RELAD-009' ? 'unlinked' : 'linked',
    } })
  }

  const informationNodes = {
    identity: await findOne('jcCategoryTreeNodes', { typeCode: 'information_category', nodeCode: 'measurement-identity' }),
    time: await findOne('jcCategoryTreeNodes', { typeCode: 'information_category', nodeCode: 'measurement-time' }),
    value: await findOne('jcCategoryTreeNodes', { typeCode: 'information_category', nodeCode: 'measurement-value' }),
    quality: await findOne('jcCategoryTreeNodes', { typeCode: 'information_category', nodeCode: 'measurement-quality' }),
  }
  for (const item of (await listAll('eco_resource_security_fields')).filter((fieldItem) => [meterResource.id, aggregateResource.id].includes(fieldItem.resource_id))) {
    const code = String(item.field_code || '').toUpperCase()
    const categoryKey = code.includes('TIME') ? 'time' : code.includes('QUALITY') ? 'quality' : 'value'
    const legacyLevel = Number.parseInt(String(item.security_level || ''), 10)
    const securityLevel = legacyLevel >= 5 ? 'core' : legacyLevel >= 4 ? 'important' : legacyLevel >= 3 ? 'sensitive' : 'internal'
    await client.resource('eco_resource_security_fields').update({ filterByTk: item.id, values: {
      information_category: informationNodes[categoryKey]?.nodeName || null,
      security_level: securityLevel,
      field_tags: [informationNodes[categoryKey]?.nodeName, securityLevel === 'core' ? '核心' : securityLevel === 'important' ? '重要' : securityLevel === 'sensitive' ? '敏感' : '内部', item.required_desensitization ? '需脱敏' : '可受控输出'].filter(Boolean),
    } })
  }

  const subjectData = [
    { subject_code: 'APP-INTERNAL-A', subject_name: '调度运行应用', subject_type: 'internal_app', organization_code: 'ORG-A', organization_name: '调控中心', credential_ref: 'secret://subjects/internal-a', allowed_api_codes_json: ['API-DIRECT-REGION-LOAD', 'API-DEVELOP-ACTIVE-POWER'], ip_whitelist_json: ['10.20.10.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-INTERNAL-B', subject_name: '区域统计应用', subject_type: 'internal_app', organization_code: 'ORG-B', organization_name: '数据管理中心', credential_ref: 'secret://subjects/internal-b', allowed_api_codes_json: ['API-ORCH-REGION-HOURLY'], ip_whitelist_json: ['10.20.20.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-EXTERNAL-C', subject_name: '跨域分析方', subject_type: 'external_party', organization_code: 'EXT-C', organization_name: '外部协作单位', credential_ref: 'secret://subjects/external-c', allowed_api_codes_json: ['API-ORCH-REGION-HOURLY'], ip_whitelist_json: ['172.18.10.10/32'], subject_status: 'enabled' },
  ]
  const subjectIds = {}
  for (const item of subjectData) subjectIds[item.subject_code] = await upsert('security_access_subjects', { subject_code: item.subject_code }, item)

  const apiData = [
    { api_code: 'API-DIRECT-REGION-LOAD', api_name: '区域负荷查询', resource_id: aggregateResource.id, data_source_id: apiSource.id, access_mode: 'orchestrate', http_method: 'GET', upstream_url: '', orchestrator_path: '/internal/region-hourly', gateway_path: '/data-api/direct/region-load', protection_level: 'l1', supports_row_filter: true, supports_field_filter: false, supports_aggregate: true, supports_homomorphic: false, api_status: 'enabled', publish_version: 1, publish_status: 'success', published_at: '2026-07-11T16:00:00+08:00' },
    { api_code: 'API-DEVELOP-ACTIVE-POWER', api_name: '有功功率明细查询', resource_id: meterResource.id, data_source_id: databaseSource.id, access_mode: 'develop', http_method: 'GET', upstream_url: '', orchestrator_path: '/internal/active-power', gateway_path: '/data-api/internal/active-power', protection_level: 'l2', supports_row_filter: true, supports_field_filter: true, supports_aggregate: false, supports_homomorphic: false, api_status: 'enabled', publish_version: 1, publish_status: 'success', published_at: '2026-07-11T16:00:00+08:00' },
    { api_code: 'API-ORCH-REGION-HOURLY', api_name: '区域小时聚合查询', resource_id: meterResource.id, data_source_id: databaseSource.id, access_mode: 'orchestrate', http_method: 'GET', upstream_url: '', orchestrator_path: '/internal/region-hourly', gateway_path: '/data-api/internal/region-hourly', protection_level: 'l3', supports_row_filter: true, supports_field_filter: true, supports_aggregate: true, supports_homomorphic: true, api_status: 'enabled', publish_version: 1, publish_status: 'success', published_at: '2026-07-11T16:00:00+08:00' },
  ]
  const apiIds = {}
  for (const item of apiData) apiIds[item.api_code] = await upsert('security_api_resources', { api_code: item.api_code }, item)

  const abnormalAccessRules = {
    offHours: { enabled: true, action: 'deny', riskScore: 70 },
    highFrequency: { enabled: true, action: 'deny', riskScore: 70 },
    queryRangeExceeded: { enabled: true, action: 'deny', riskScore: 60 },
    rowLimitExceeded: { enabled: true, action: 'deny', riskScore: 70 },
    scopeViolation: { enabled: true, action: 'deny', riskScore: 80 },
  }
  const policyData = [
    { policy_code: 'V3-POL-DIRECT-A', policy_name: '区域负荷直连访问策略', policy_kind: 'access_policy', resource_id: aggregateResource.id, subject_id: subjectIds['APP-INTERNAL-A'], api_resource_id: apiIds['API-DIRECT-REGION-LOAD'], scenario: 'region-load-query', source_ips_json: ['10.20.10.0/24'], allowed_time_ranges_json: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '23:59' }], max_requests_per_minute: 60, max_query_days: 1, max_rows: 24, organization_scope_json: ['ORG-A'], region_scope_json: ['REGION-A'], output_mode: 'aggregate', risk_threshold: 70, policy_status: 'enabled', policy_version: 1, publish_status: 'success', published_at: '2026-07-11T16:00:00+08:00', gateway_config_version: 'route-v1' },
    { policy_code: 'V3-POL-INTERNAL-A', policy_name: '调度应用明细访问策略', policy_kind: 'access_policy', resource_id: meterResource.id, subject_id: subjectIds['APP-INTERNAL-A'], api_resource_id: apiIds['API-DEVELOP-ACTIVE-POWER'], scenario: 'dispatch-operation-analysis', source_ips_json: ['10.20.10.0/24'], allowed_time_ranges_json: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '23:59' }], max_requests_per_minute: 60, max_query_days: 1, max_rows: 2000, organization_scope_json: ['ORG-A'], region_scope_json: ['REGION-A'], output_mode: 'detail', risk_threshold: 70, policy_status: 'enabled', policy_version: 1, publish_status: 'success', published_at: '2026-07-11T16:00:00+08:00', gateway_config_version: 'policy-v1' },
    { policy_code: 'V3-POL-INTERNAL-B', policy_name: '区域统计聚合访问策略', policy_kind: 'access_policy', resource_id: meterResource.id, subject_id: subjectIds['APP-INTERNAL-B'], api_resource_id: apiIds['API-ORCH-REGION-HOURLY'], scenario: 'regional-load-statistics', source_ips_json: ['10.20.20.0/24'], allowed_time_ranges_json: [{ days: [1, 2, 3, 4, 5], from: '06:00', to: '22:00' }], max_requests_per_minute: 30, max_query_days: 7, max_rows: 168, organization_scope_json: ['ORG-A', 'ORG-B'], region_scope_json: ['REGION-A', 'REGION-B'], output_mode: 'aggregate', risk_threshold: 70, policy_status: 'enabled', policy_version: 1, publish_status: 'success', published_at: '2026-07-11T16:00:00+08:00', gateway_config_version: 'policy-v1' },
    { policy_code: 'V3-POL-EXTERNAL-C', policy_name: '跨域分析密态访问策略', policy_kind: 'access_policy', resource_id: meterResource.id, subject_id: subjectIds['APP-EXTERNAL-C'], api_resource_id: apiIds['API-ORCH-REGION-HOURLY'], scenario: 'cross-domain-load-statistics', source_ips_json: ['172.18.10.10/32'], allowed_time_ranges_json: [{ days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00' }], max_requests_per_minute: 5, max_query_days: 7, max_rows: 4096, organization_scope_json: [], region_scope_json: ['REGION-A', 'REGION-B'], output_mode: 'encrypted', risk_threshold: 50, policy_status: 'enabled', policy_version: 1, publish_status: 'success', published_at: '2026-07-11T16:00:00+08:00', gateway_config_version: 'v3-demo-1' },
  ]
  for (const item of policyData) await upsert('eco_resource_security_policies', { policy_code: item.policy_code }, { ...item, abnormal_access_rules_json: abnormalAccessRules })
  for (const item of await listAll('eco_resource_security_policies')) if (!item.policy_kind) await client.resource('eco_resource_security_policies').update({ filterByTk: item.id, values: { policy_kind: 'resource_profile' } })

  const legacyKey = await findOne('security_crypto_keys', { key_code: 'HE-KEY-EXTERNAL-C-V1' })
  if (legacyKey && !await findOne('security_crypto_keys', { key_code: 'KEY-EXT-C-002' })) {
    await client.resource('security_crypto_keys').update({ filterByTk: legacyKey.id, values: {
      key_code: 'KEY-EXT-C-002', key_fingerprint: 'sha256:external-c-v2-public-material',
    } })
  }
  const currentKeyBeforeSeed = await findOne('security_crypto_keys', { key_code: 'KEY-EXT-C-002' })
  if (currentKeyBeforeSeed && currentKeyBeforeSeed.key_fingerprint !== 'sha256:external-c-v2-public-material') {
    await client.resource('security_crypto_keys').update({ filterByTk: currentKeyBeforeSeed.id, values: {
      key_fingerprint: 'sha256:external-c-v2-public-material',
    } })
  }
  await upsert('security_crypto_keys', { key_code: 'KEY-EXT-C-001' }, {
    key_code: 'KEY-EXT-C-001', subject_id: subjectIds['APP-EXTERNAL-C'], algorithm_code: 'ckks', context_version: 'context-v1',
    context_parameters_json: { multiplicativeDepth: 1, scalingModSize: 50, batchSize: 4096 }, public_key_ref: 'secret://crypto/external-c/v1/public-key',
    evaluation_key_ref: 'secret://crypto/external-c/v1/evaluation-key', key_fingerprint: 'sha256:external-c-v1-public-material',
    valid_from: '2025-01-01T00:00:00+08:00', valid_to: '2025-12-31T23:59:59+08:00', key_status: 'disabled', validation_summary_json: { status: 'historical' },
  })
  const ckksKeyId = await upsert('security_crypto_keys', { key_code: 'KEY-EXT-C-002' }, {
    key_code: 'KEY-EXT-C-002', subject_id: subjectIds['APP-EXTERNAL-C'], algorithm_code: 'ckks', context_version: 'context-v2',
    context_parameters_json: { multiplicativeDepth: 1, scalingModSize: 50, batchSize: 4096 }, public_key_ref: 'secret://crypto/external-c/v2/public-key',
    evaluation_key_ref: 'secret://crypto/external-c/v2/evaluation-key', key_fingerprint: 'sha256:external-c-v2-public-material',
    valid_from: '2026-01-01T00:00:00+08:00', valid_to: '2027-12-31T23:59:59+08:00', key_status: 'enabled', validation_summary_json: { status: 'validated', validated_at: '2026-07-11T16:00:00+08:00' },
  })
  const bfvKeyId = await upsert('security_crypto_keys', { key_code: 'KEY-EXT-C-003' }, {
    key_code: 'KEY-EXT-C-003', subject_id: subjectIds['APP-EXTERNAL-C'], algorithm_code: 'bfv', context_version: 'integer-context-v1',
    context_parameters_json: { plaintextModulus: 65537, multiplicativeDepth: 2, batchSize: 4096 }, public_key_ref: 'secret://crypto/external-c/integer-v1/public-key',
    evaluation_key_ref: 'secret://crypto/external-c/integer-v1/evaluation-key', key_fingerprint: 'sha256:external-c-integer-v1-public-material',
    valid_from: '2026-01-01T00:00:00+08:00', valid_to: '2027-12-31T23:59:59+08:00', key_status: 'enabled', validation_summary_json: { status: 'validated', validated_at: '2026-07-11T16:00:00+08:00' },
  })
  // 3.1 客户应用密态场景：为 encrypted 输出策略对应的客户主体分配演示 BFV/CKKS 密钥
  const encryptedSubjectCodes = [
    'APP-MARKETING-2', 'APP-SALES-FORECAST', 'APP-CREDIT-ELECTRIC', 'APP-EXTERNAL-ENV',
    'APP-DIGITAL-SUBSTATION', 'APP-CHARGING', 'APP-INTELLIGENT-DISPATCH',
  ]
  for (const subjectCode of encryptedSubjectCodes) {
    const subject = await findOne('security_access_subjects', { subject_code: subjectCode })
    if (!subject) continue
    const subjectId = subject.id
    await upsert('security_crypto_keys', { key_code: `KEY-${subjectCode}-CKKS-001` }, {
      key_code: `KEY-${subjectCode}-CKKS-001`, subject_id: subjectId, algorithm_code: 'ckks', context_version: 'context-v2',
      context_parameters_json: { multiplicativeDepth: 1, scalingModSize: 50, batchSize: 4096 },
      public_key_ref: `secret://crypto/${subjectCode.toLowerCase()}/v2/public-key`,
      evaluation_key_ref: `secret://crypto/${subjectCode.toLowerCase()}/v2/evaluation-key`,
      key_fingerprint: `sha256:${subjectCode.toLowerCase()}-v2-public-material`,
      valid_from: '2026-01-01T00:00:00+08:00', valid_to: '2027-12-31T23:59:59+08:00', key_status: 'enabled',
      validation_summary_json: { status: 'validated', validated_at: '2026-07-11T16:00:00+08:00' },
    })
    await upsert('security_crypto_keys', { key_code: `KEY-${subjectCode}-BFV-001` }, {
      key_code: `KEY-${subjectCode}-BFV-001`, subject_id: subjectId, algorithm_code: 'bfv', context_version: 'integer-context-v1',
      context_parameters_json: { plaintextModulus: 65537, multiplicativeDepth: 2, batchSize: 4096 },
      public_key_ref: `secret://crypto/${subjectCode.toLowerCase()}/integer-v1/public-key`,
      evaluation_key_ref: `secret://crypto/${subjectCode.toLowerCase()}/integer-v1/evaluation-key`,
      key_fingerprint: `sha256:${subjectCode.toLowerCase()}-integer-v1-public-material`,
      valid_from: '2026-01-01T00:00:00+08:00', valid_to: '2027-12-31T23:59:59+08:00', key_status: 'enabled',
      validation_summary_json: { status: 'validated', validated_at: '2026-07-11T16:00:00+08:00' },
    })
  }

  await upsert('jcConfigCenterItems', { moduleKey: 'security-governance', groupKey: 'homomorphic-encryption', key: 'homomorphic_engine_config' }, {
    moduleKey: 'security-governance', groupKey: 'homomorphic-encryption', key: 'homomorphic_engine_config',
    title: '密态计算运行配置', description: '启用整数精确与浮点近似的求和、平均值能力，敏感认证材料使用凭据引用。',
    valueType: 'json', required: true, enabled: true, sort: 10,
    value: { engineName: '量测数据密态计算服务', endpoint: '/homomorphic-engine-api', authMode: 'mTLS', secretRef: 'secret://security/homomorphic-engine-client', timeoutSeconds: 60, enabled: false, supportedAlgorithms: ['整数精确型', '浮点近似型'] },
    schema: { algorithms: ['整数精确型', '浮点近似型'] },
  })

  const frozenResource = resources.find((item) => item.resource_code === 'CUST-DAILY-ENERGY-003') || meterResource
  const frozenApi = (await findOne('security_api_resources', { api_code: 'API-CUST-DAILY-ENERGY-003' })) || apiIds['API-ORCH-REGION-HOURLY']
  const taskData = [
    {
      task_code: 'V3-HE-INT-001', task_name: '用户日冻结电能整数密态汇总', algorithm: 'bfv', operation: 'sum', crypto_key_id: bfvKeyId,
      idempotency_key: 'v3-demo-integer-sum-001', measure_field_code: 'PAP_R', task_tags: ['量测数据', '用户电量', '整数精确型'],
      resource: frozenResource, api: frozenApi, scenario: '用户日冻结电能跨域密态汇总验证',
      regions: ['REGION-A'], orgs: ['ORG-A'], start: '2026-06-24T00:00:00+08:00', end: '2026-06-25T00:00:00+08:00',
    },
    {
      task_code: 'V3-HE-FLOAT-001', task_name: '区域有功功率浮点密态均值', algorithm: 'ckks', operation: 'mean', crypto_key_id: ckksKeyId,
      idempotency_key: 'v3-demo-float-mean-001', measure_field_code: 'P_ACTIVE', task_tags: ['量测数据', '跨域密态', '浮点近似型'],
      resource: meterResource, api: apiIds['API-ORCH-REGION-HOURLY'], scenario: '跨域量测数据密态聚合验证',
      regions: ['REGION-A'], orgs: ['ORG-A'], start: '2026-07-01T00:00:00+08:00', end: '2026-07-01T01:00:00+08:00',
    },
  ]
  for (const task of taskData) {
    const { resource: taskResource, api: taskApi, regions, orgs, start, end, scenario, ...taskValues } = task
    const taskId = await upsert('security_confidential_tasks', { task_code: task.task_code }, {
      ...taskValues,
      subject_id: subjectIds['APP-EXTERNAL-C'], api_resource_id: taskApi.id,
      scenario, source_domain: '内部受控域', target_domain: '外部协作域',
      region_scope_json: regions, organization_scope_json: orgs,
      data_start_at: start, data_end_at: end,
      risk_level: 'normal', task_status: 'pending', progress: 0, sample_count: 0,
      execution_summary_json: { events: [{ time: generatedAt, stage: 'created', result: 'success', message: '验证任务已创建，等待服务端授权取数。' }] },
      error_summary: null,
    })
    await upsert('security_confidential_task_resources', { task_id: taskId, resource_id: taskResource.id }, {
      task_id: taskId, resource_id: taskResource.id, resource_role: 'primary',
      field_scope_json: { fields: [task.measure_field_code] }, relation_tags: [task.operation === 'sum' ? '求和' : '平均值', '服务端取数'],
    })
  }

  for (const task of await listAll('security_confidential_tasks')) {
    if (task.subject_id && String(task.algorithm || '').toLowerCase() === 'float_approx') {
      await client.resource('security_confidential_tasks').update({ filterByTk: task.id, values: { algorithm: 'ckks' } })
      continue
    }
    if (task.subject_id || task.idempotency_key) continue
    await client.resource('security_confidential_tasks').update({ filterByTk: task.id, values: {
      task_status: 'archived', algorithm: 'archived', operation: null, sample_count: 0,
      execution_summary_json: { archived: true, reason: '2.0 历史任务，已退出 3.0 验收范围。' },
      task_tags: ['历史归档'], error_summary: null,
    } })
  }
}

async function verify() {
  const names = [...Object.keys(existingCollections), ...newCollections.map((item) => item.name)]
  const requiredFields = Object.fromEntries(newCollections.map((item) => [item.name, item.fields.map((definition) => definition.name)]))
  const counts = {}
  const missingMetadata = []
  const missingRequiredFields = []
  for (const name of names) {
    counts[name] = (await listAll(name)).length
    const collection = await findOne('collections', { name })
    if (!collection) {
      missingMetadata.push(`${name}::<collection>`)
      continue
    }
    if (!collection.title || !collection.description) missingMetadata.push(`${name}::<collection>`)
    const fields = await listAll('collections.fields', {}, name)
    const fieldNames = new Set(fields.map((item) => item.name))
    for (const fieldName of requiredFields[name] || []) {
      if (!fieldNames.has(fieldName)) missingRequiredFields.push(`${name}.${fieldName}`)
    }
    for (const item of fields) {
      if (!item.uiSchema?.title || !item.description) missingMetadata.push(`${name}.${item.name}`)
    }
  }
  const keyFields = await listAll('collections.fields', {}, 'security_crypto_keys')
  const forbiddenFields = keyFields.filter((item) => /private|secret_key|private_key/i.test(item.name)).map((item) => item.name)
  const dictionaryTypes = await listAll('jcDictionaryTypes')
  const dictionaryItems = await listAll('jcDictionaryItems')
  const expectedDictionaryTypes = dictionarySpecs.map(([typeCode]) => typeCode)
  const missingDictionaryTypes = expectedDictionaryTypes.filter((typeCode) => !dictionaryTypes.some((item) => item.typeCode === typeCode))
  const missingDictionaryItems = dictionarySpecs.flatMap(([typeCode, , values]) => values
    .filter(([dictValue]) => !dictionaryItems.some((item) => item.typeCode === typeCode && item.dictValue === dictValue))
    .map(([dictValue]) => `${typeCode}.${dictValue}`))
  const legacyCryptoAlgorithms = dictionaryItems
    .filter((item) => ['crypto_algorithm', 'confidential_algorithm'].includes(item.typeCode) && !['bfv', 'ckks'].includes(item.dictValue))
    .map((item) => `${item.typeCode}.${item.dictValue}`)
  const missingDictionaryViews = []
  const dictionaryViewItemMismatches = []
  for (const spec of dictionaryViewSpecs) {
    const collection = await findOne('collections', { name: spec.name })
    if (!collection || collection.template !== 'view' || collection.viewName !== spec.name) {
      missingDictionaryViews.push(spec.name)
      continue
    }
    const viewItems = await listAll(spec.name)
    if (viewItems.length !== spec.values.length || viewItems.some((item) => item.typeCode !== spec.typeCode)) dictionaryViewItemMismatches.push(spec.name)
  }
  const categoryNodes = await listAll('jcCategoryTreeNodes')
  const expectedCategoryNodes = [
    ['eco_region_categories', 'region-a'], ['eco_region_categories', 'region-b'],
    ['eco_provider_units', 'org-a'], ['eco_provider_units', 'org-b'],
    ['information_category', 'measurement-identity'], ['information_category', 'measurement-time'],
    ['information_category', 'measurement-value'], ['information_category', 'measurement-quality'],
  ]
  const missingCategoryNodes = expectedCategoryNodes
    .filter(([typeCode, nodeCode]) => !categoryNodes.some((item) => item.typeCode === typeCode && item.nodeCode === nodeCode))
    .map(([typeCode, nodeCode]) => `${typeCode}.${nodeCode}`)
  const v3TagPolicies = (await listAll('jcTagGenerationPolicies')).filter((item) => String(item.title || '').startsWith('3.0-'))
  const invalidTagPolicies = v3TagPolicies.filter((item) => !item.enabled || !Array.isArray(item.rules) || !item.rules.length || !Array.isArray(item.tags) || !item.tags.length).map((item) => item.title)
  const coreResources = (await listAll('eco_data_resources')).filter((item) => ['GRID-METER-SEC-001', 'GRID-DISPATCH-SEC-002'].includes(item.resource_code))
  const unclassifiedCoreResources = coreResources.filter((item) => !item.domain_category_id || !item.provider_org_id || !item.region_category_id || !Array.isArray(item.resource_tags) || item.resource_tags.length !== 5).map((item) => item.resource_code)
  const coreResourceIds = coreResources.map((item) => item.id)
  const unclassifiedCoreFields = (await listAll('eco_resource_security_fields'))
    .filter((item) => coreResourceIds.includes(item.resource_id))
    .filter((item) => !item.information_category || !item.classification_level || !item.security_level || !Array.isArray(item.field_tags) || item.field_tags.length < 3)
    .map((item) => `${item.resource_id}.${item.field_code}`)
  const activeDataSources = (await listAll('security_data_sources')).filter((item) => item.connection_status !== 'disabled')
  const activeResources = (await listAll('eco_data_resources')).filter((item) => item.resource_status !== 'disabled')
  const cryptoKeys = await listAll('security_crypto_keys')
  const legacyTasks = (await listAll('security_confidential_tasks')).filter((item) => !item.subject_id && !item.idempotency_key)
  const unarchivedLegacyTasks = legacyTasks.filter((item) => item.task_status !== 'archived' || item.algorithm !== 'archived' || item.execution_summary_json?.archived !== true).map((item) => item.task_code)
  const forbiddenTaskPayloads = (await listAll('security_confidential_tasks'))
    .filter((item) => /"(?:values|plaintext|privateKey|secretKey)"\s*:/i.test(JSON.stringify(item.execution_summary_json || {})))
    .map((item) => item.task_code)
  console.log(JSON.stringify({
    baseURL,
    counts,
    dictionaryTypeCount: expectedDictionaryTypes.length,
    missingDictionaryTypes,
    missingDictionaryItems,
    legacyCryptoAlgorithms,
    dictionaryViewCount: dictionaryViewSpecs.length,
    missingDictionaryViews,
    dictionaryViewItemMismatches,
    categoryNodeCount: expectedCategoryNodes.length,
    missingCategoryNodes,
    v3TagPolicyCount: v3TagPolicies.length,
    invalidTagPolicies,
    unclassifiedCoreResources,
    unclassifiedCoreFields,
    activeDataSourceCount: activeDataSources.length,
    activeResourceCount: activeResources.length,
    cryptoKeyCount: cryptoKeys.length,
    unarchivedLegacyTasks,
    forbiddenTaskPayloads,
    missingMetadata,
    missingRequiredFields,
    forbiddenFields,
    verifiedAt: new Date().toISOString(),
  }, null, 2))
  if (missingMetadata.length) throw new Error(`元数据审计未通过：${missingMetadata.join(', ')}`)
  if (missingRequiredFields.length) throw new Error(`schema 字段缺失：${missingRequiredFields.join(', ')}`)
  if (forbiddenFields.length) throw new Error(`存在禁止的私钥字段：${forbiddenFields.join(', ')}`)
  if (missingDictionaryTypes.length || missingDictionaryItems.length) throw new Error('3.0 字典读回验证未通过')
  if (legacyCryptoAlgorithms.length) throw new Error(`存在超出 3.0 边界的密态算法字典：${legacyCryptoAlgorithms.join(', ')}`)
  if (missingDictionaryViews.length || dictionaryViewItemMismatches.length) throw new Error('3.0 专用字典视图验证未通过')
  if (!schemaOnly) {
    if (missingCategoryNodes.length || v3TagPolicies.length !== 8 || invalidTagPolicies.length) throw new Error('3.0 分类树或标签策略验证未通过')
    if (coreResources.length !== 2 || unclassifiedCoreResources.length || unclassifiedCoreFields.length) throw new Error('3.0 核心资源分类标签关联验证未通过')
    if (activeDataSources.length !== 10) throw new Error(`3.1 演示数据源数量应为 10，当前 ${activeDataSources.length}`)
    if (activeResources.length !== 16) throw new Error(`3.1 演示数据资源数量应为 16，当前 ${activeResources.length}`)
    if (cryptoKeys.length < 3) throw new Error('3.0 最小同态密钥数量验证未通过')
    if (unarchivedLegacyTasks.length || forbiddenTaskPayloads.length) throw new Error('2.0 历史任务归档或明文清理验证未通过')
    if (counts.security_api_resources < 19) throw new Error(`3.1 API 档案数量应不少于 19（全新库：基线 3 + v31 档案 14 + 占位 2；存量环境含历史手工 API 时为 20），当前 ${counts.security_api_resources}`)
    if (counts.security_access_subjects < 8) throw new Error(`3.1 访问主体数量应不少于 8，当前 ${counts.security_access_subjects}`)
  }
}

async function main() {
  await client.auth.signIn({ account, password }, authenticator)
  console.log('[1/7] 创建或扩展 3.0 Collection')
  await ensureSchema()
  console.log('[2/7] 初始化 3.0 统一字典')
  await ensureDictionaries()
  console.log('[3/7] 注册 3.0 专用只读字典视图')
  await ensureDictionaryViews()
  console.log('[4/7] 初始化分类树与受控标签策略')
  await ensureClassificationsAndTagPolicies()
  if (schemaOnly) {
    console.log('[5/7] schema-only 模式：跳过演示数据写入')
  } else {
    console.log('[5/7] 初始化 API、主体、动态策略和密钥元数据')
    await seedData()
  }
  console.log('[6/7] 重新执行字段元数据审计')
  await ensureSchema()
  console.log('[7/7] 后台读回验证')
  await verify()
}

main().catch((error) => {
  console.error(error?.message || error)
  console.error(JSON.stringify(error?.response?.data || {}, null, 2))
  process.exit(1)
})
