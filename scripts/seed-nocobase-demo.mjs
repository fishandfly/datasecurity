import { APIClient } from '@nocobase/sdk'
import { sanitizeSecurityValues, isDeprecatedSecurityField } from './security-field-model.mjs'

const baseURL = process.env.NOCOBASE_API_BASE_URL || 'http://localhost:8196/api/'
const account = process.env.NOCOBASE_ADMIN_ACCOUNT || 'admin@nocobase.com'
const password = process.env.NOCOBASE_ADMIN_PASSWORD || 'admin123'
const authenticator = process.env.NOCOBASE_AUTHENTICATOR || 'basic'

const client = new APIClient({ baseURL })

const now = '2026-07-10T10:00:00+08:00'

function asArray(payload) {
  return Array.isArray(payload?.data) ? payload.data : []
}

async function listAll(resource, params = {}, pageSize = 1000) {
  const rows = []
  let page = 1
  for (;;) {
    const response = await client.resource(resource).list({ ...params, page, pageSize })
    const payload = response.data
    rows.push(...asArray(payload))
    const totalPage = Number(payload?.meta?.totalPage ?? 0)
    if (!totalPage || page >= totalPage) break
    page += 1
  }
  return rows
}

async function findOne(collection, filter) {
  const response = await client.resource(collection).list({ filter, page: 1, pageSize: 1 })
  return asArray(response.data)[0] ?? null
}

async function upsert(collection, filter, values) {
  values = sanitizeSecurityValues(collection, values)
  try {
    const existing = await findOne(collection, filter)
    if (existing?.id != null) {
      await client.resource(collection).update({ filterByTk: existing.id, values })
      return existing.id
    }
    const response = await client.resource(collection).create({ values })
    return response.data?.data?.id ?? response.data?.id
  } catch (error) {
    error.message = `写入失败 ${collection} ${JSON.stringify(filter)}: ${error.message}`
    throw error
  }
}

async function createIfMissing(collection, filter, values) {
  const existing = await findOne(collection, filter)
  if (existing?.id != null) return existing.id
  const response = await client.resource(collection).create({ values })
  return response.data?.data?.id ?? response.data?.id
}

async function ensureCollection(name, title, description, titleField = 'name') {
  const existing = await findOne('collections', { name })
  const auditOptions = { createdAt: true, createdBy: true, updatedAt: true, updatedBy: true }
  if (existing) {
    await client.resource('collections').update({
      filterByTk: name,
      values: { title, description, titleField, ...auditOptions },
    })
    return
  }
  await client.resource('collections').create({
    values: {
      name,
      title,
      description,
      template: 'general',
      autoGenId: true,
      titleField,
      ...auditOptions,
    },
  })
}

async function fieldNames(collection) {
  const rows = []
  let page = 1
  for (;;) {
    const response = await client.resource('collections.fields', collection).list({ page, pageSize: 1000 })
    const payload = response.data
    rows.push(...asArray(payload))
    const totalPage = Number(payload?.meta?.totalPage ?? 0)
    if (!totalPage || page >= totalPage) break
    page += 1
  }
  return new Set(rows.map((field) => field.name))
}

async function ensureField(collection, field) {
  if (isDeprecatedSecurityField(collection, field.name)) return
  const names = await fieldNames(collection)
  if (names.has(field.name)) return
  try {
    await client.resource('collections.fields', collection).create({ values: field })
  } catch (error) {
    error.message = `创建字段失败 ${collection}.${field.name}: ${error.message}`
    throw error
  }
}

function input(name, title, description) {
  return {
    name,
    title,
    description,
    type: 'string',
    interface: 'input',
    uiSchema: { type: 'string', title, 'x-component': 'Input' },
  }
}

function text(name, title, description) {
  return {
    name,
    title,
    description,
    type: 'text',
    interface: 'textarea',
    uiSchema: { type: 'string', title, 'x-component': 'Input.TextArea' },
  }
}

function integer(name, title, description) {
  return {
    name,
    title,
    description,
    type: 'integer',
    interface: 'integer',
    uiSchema: { type: 'number', title, 'x-component': 'InputNumber' },
  }
}

function number(name, title, description) {
  return {
    name,
    title,
    description,
    type: 'double',
    interface: 'number',
    uiSchema: { type: 'number', title, 'x-component': 'InputNumber' },
  }
}

function datetime(name, title, description) {
  return {
    name,
    title,
    description,
    type: 'date',
    interface: 'datetime',
    uiSchema: { type: 'string', title, 'x-component': 'DatePicker', 'x-component-props': { showTime: true } },
  }
}

function bool(name, title, description) {
  return {
    name,
    title,
    description,
    type: 'boolean',
    interface: 'checkbox',
    uiSchema: { type: 'boolean', title, 'x-component': 'Checkbox' },
  }
}

function json(name, title, description) {
  return {
    name,
    title,
    description,
    type: 'json',
    interface: 'json',
    uiSchema: { type: 'object', title, 'x-component': 'Input.JSON' },
  }
}

function m2o(name, title, description, target, foreignKey, targetTitleField) {
  return {
    name,
    title,
    description,
    type: 'belongsTo',
    interface: 'm2o',
    target,
    foreignKey,
    targetKey: 'id',
    targetTitleField,
    uiSchema: {
      type: 'object',
      title,
      'x-component': 'AssociationField',
      'x-component-props': {
        fieldNames: { label: targetTitleField, value: 'id' },
      },
    },
  }
}

function m2m(name, title, description, target, through, foreignKey, otherKey, targetTitleField) {
  return {
    name,
    title,
    description,
    type: 'belongsToMany',
    interface: 'm2m',
    target,
    through,
    foreignKey,
    otherKey,
    sourceKey: 'id',
    targetKey: 'id',
    targetTitleField,
    uiSchema: {
      type: 'array',
      title,
      'x-component': 'AssociationField',
      'x-component-props': {
        mode: 'tags',
        fieldNames: { label: targetTitleField, value: 'id' },
      },
    },
  }
}

async function ensureType(collection, filter, values) {
  await upsert(collection, filter, values)
}

async function ensureCategoryType(typeCode, typeName, typeDescription) {
  await ensureType('jcCategoryTreeTypes', { typeCode }, { typeCode, typeName, typeDescription })
}

async function ensureCategoryNode(typeCode, typeName, nodeCode, nodeName, parentNodeId = null, nodeSort = 10) {
  return upsert(
    'jcCategoryTreeNodes',
    { typeCode, nodeCode },
    { typeCode, typeName, nodeCode, nodeName, nodeDescription: `${typeName}：${nodeName}`, parentNodeId, nodeSort },
  )
}

async function ensureDictionaryType(typeCode, typeName) {
  await ensureType('jcDictionaryTypes', { typeCode }, { typeCode, typeName })
}

async function ensureDictionaryItem(typeCode, typeName, dictValue, dictValueName, dictSort = 10, dictColor = 'blue') {
  return upsert(
    'jcDictionaryItems',
    { typeCode, dictValue },
    { typeCode, typeName, dictValue, dictValueName, dictColor, dictValueDescription: `${typeName}：${dictValueName}`, dictSort },
  )
}

async function pruneDictionaryItems(typeCode, allowedValues) {
  const allowed = new Set(allowedValues)
  const rows = await listAll('jcDictionaryItems', { filter: { typeCode } })
  for (const row of rows) {
    if (allowed.has(row.dictValue) || row.id == null) continue
    await client.resource('jcDictionaryItems').destroy({ filterByTk: row.id })
  }
}

async function ensureTagGenerationPolicy(title, values) {
  return upsert('jcTagGenerationPolicies', { title }, { title, ...values })
}

const defaultFields = [
  { key: 'id', label: '编号', type: 'text' },
  { key: 'name', label: '名称', type: 'text' },
  { key: 'region', label: '行政区划', type: 'tag' },
  { key: 'status', label: '状态', type: 'status' },
  { key: 'owner', label: '责任单位', type: 'text' },
  { key: 'updatedAt', label: '更新时间', type: 'date' },
  { key: 'score', label: '评分', type: 'number' },
]

const dataProducts = [
  {
    product_code: 'enterprise-risk-monitor',
    name: '重点排污单位监管画像',
    summary: '汇聚排污许可、在线监测、执法检查和风险分级结果，面向监管人员提供企业风险快速核查入口。',
    domain: '监管执法',
    owner: '综合执法局',
    update_cycle: '每日',
    api_endpoint: 'data-service://products/enterprise-risk-monitor/sample-rows',
    api_method: 'GET',
    api_auth_mode: '平台授权 token',
    api_refresh_interval: '15 分钟',
    fields_json: [...defaultFields, { key: 'industry', label: '业务领域', type: 'tag' }, { key: 'riskLevel', label: '风险等级', type: 'status' }],
    dimensions_json: [
      { id: 'region', label: '行政区划', field: 'region' },
      { id: 'industry', label: '业务领域', field: 'industry' },
      { id: 'riskLevel', label: '风险等级', field: 'riskLevel' },
      { id: 'owner', label: '责任单位', field: 'owner' },
    ],
    supported_modes: ['tree-table', 'table', 'calendar', 'kanban', 'graph', 'script'],
    default_mode: 'tree-table',
    status_field: 'status',
    date_field: 'updatedAt',
    primary_field: 'name',
    authorization_status: 'authorized',
    sample_rows_json: [
      { id: 'ER-001', name: '长春净月污水处理厂', region: '长春市', industry: '水环境', riskLevel: '高', status: '待复核', owner: '水生态环境处', updatedAt: '2026-05-26', score: 91, dischargeType: '废水' },
      { id: 'ER-002', name: '吉林石化北区监测点', region: '吉林市', industry: '大气环境', riskLevel: '中', status: '已确认', owner: '大气环境处', updatedAt: '2026-05-25', score: 76, dischargeType: '废气' },
      { id: 'ER-003', name: '松原危废转运中心', region: '松原市', industry: '固废危化', riskLevel: '高', status: '整改中', owner: '固体废物处', updatedAt: '2026-05-24', score: 88, dischargeType: '危废' },
      { id: 'ER-004', name: '辽源经开区热源厂', region: '辽源市', industry: '大气环境', riskLevel: '低', status: '已确认', owner: '大气环境处', updatedAt: '2026-05-21', score: 64, dischargeType: '废气' },
      { id: 'ER-005', name: '白山矿区排水口', region: '白山市', industry: '水环境', riskLevel: '中', status: '待复核', owner: '水生态环境处', updatedAt: '2026-05-20', score: 72, dischargeType: '废水' },
      { id: 'ER-006', name: '延边医废集中处置点', region: '延边州', industry: '固废危化', riskLevel: '高', status: '整改中', owner: '固体废物处', updatedAt: '2026-05-19', score: 86, dischargeType: '医废' },
    ],
    script_source: "const highRisk = rows.filter((row) => row.riskLevel === '高').length\nconst avgScore = rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / Math.max(rows.length, 1)\nreturn [\n  { label: '高风险对象', value: `${highRisk} 个`, note: '脚本按 riskLevel 动态计算', tone: 'amber' },\n  { label: '平均风险评分', value: avgScore.toFixed(1), note: '来自当前筛选结果', tone: 'blue' },\n  { label: '待处理事项', value: `${rows.filter((row) => row.status !== '已确认').length} 项`, note: '可嵌入监管工作台', tone: 'green' },\n]",
    sort_order: 10,
  },
  {
    product_code: 'monitor-quality-check',
    name: '生态监测时序质控产品',
    summary: '面向空气、水质和流域自动站数据，提供按因子、站点、异常数量和时间窗口的多模式质控核查。',
    domain: '监测质控',
    owner: '省生态环境监测中心',
    update_cycle: '30 分钟',
    api_endpoint: 'data-service://products/monitor-quality-check/sample-rows',
    api_method: 'GET',
    api_auth_mode: '只读服务密钥',
    api_refresh_interval: '5 分钟',
    fields_json: [...defaultFields, { key: 'factor', label: '监测因子', type: 'tag' }, { key: 'quality', label: '质控结论', type: 'status' }, { key: 'anomalyCount', label: '异常数', type: 'number' }],
    dimensions_json: [
      { id: 'region', label: '行政区划', field: 'region' },
      { id: 'factor', label: '监测因子', field: 'factor' },
      { id: 'quality', label: '质控结论', field: 'quality' },
      { id: 'owner', label: '责任单位', field: 'owner' },
    ],
    supported_modes: ['table', 'calendar', 'kanban', 'graph', 'script'],
    default_mode: 'table',
    status_field: 'status',
    date_field: 'updatedAt',
    primary_field: 'name',
    authorization_status: 'authorized',
    sample_rows_json: [
      { id: 'MQ-001', name: '长春南关国控站', region: '长春市', factor: 'PM2.5', quality: '正常', status: '已归档', owner: '监测中心', updatedAt: '2026-05-26', score: 98, anomalyCount: 0 },
      { id: 'MQ-002', name: '吉林丰满水质站', region: '吉林市', factor: 'COD', quality: '波动', status: '待复核', owner: '监测中心', updatedAt: '2026-05-26', score: 82, anomalyCount: 4 },
      { id: 'MQ-003', name: '松花江干流自动站', region: '松原市', factor: '氨氮', quality: '异常', status: '整改中', owner: '监测中心', updatedAt: '2026-05-25', score: 67, anomalyCount: 9 },
      { id: 'MQ-004', name: '白城城区空气站', region: '白城市', factor: 'O3', quality: '正常', status: '已归档', owner: '监测中心', updatedAt: '2026-05-24', score: 94, anomalyCount: 1 },
      { id: 'MQ-005', name: '通化重点流域站', region: '通化市', factor: '总磷', quality: '波动', status: '待复核', owner: '监测中心', updatedAt: '2026-05-22', score: 79, anomalyCount: 3 },
    ],
    script_source: "const anomalyTotal = rows.reduce((sum, row) => sum + Number(row.anomalyCount || 0), 0)\nreturn [\n  { label: '异常数据点', value: `${anomalyTotal} 个`, note: '脚本汇总 anomalyCount', tone: anomalyTotal > 10 ? 'amber' : 'green' },\n  { label: '质控通过率', value: `${Math.round((rows.filter((row) => row.quality === '正常').length / Math.max(rows.length, 1)) * 100)}%`, note: '按当前筛选动态计算', tone: 'blue' },\n]",
    sort_order: 20,
  },
  {
    product_code: 'approval-collaboration-ledger',
    name: '建设项目审批协同台账',
    summary: '将项目审批、排污许可、生态修复和会商节点加工为可嵌入的业务台账，支撑法院、政数和审批场景复用。',
    domain: '审批协同',
    owner: '行政审批办公室',
    update_cycle: '每日',
    api_endpoint: 'data-service://products/approval-collaboration-ledger/sample-rows',
    api_method: 'GET',
    api_auth_mode: '按角色授权',
    api_refresh_interval: '30 分钟',
    fields_json: [...defaultFields, { key: 'projectType', label: '项目类型', type: 'tag' }, { key: 'stage', label: '办理环节', type: 'tag' }],
    dimensions_json: [
      { id: 'region', label: '行政区划', field: 'region' },
      { id: 'projectType', label: '项目类型', field: 'projectType' },
      { id: 'stage', label: '办理环节', field: 'stage' },
      { id: 'owner', label: '责任单位', field: 'owner' },
    ],
    supported_modes: ['tree-table', 'table', 'calendar', 'kanban', 'script'],
    default_mode: 'kanban',
    status_field: 'status',
    date_field: 'updatedAt',
    primary_field: 'name',
    authorization_status: 'restricted',
    sample_rows_json: [
      { id: 'AL-001', name: '医药产业园扩建项目', region: '长春市', projectType: '环评审批', status: '待会商', owner: '环评处', updatedAt: '2026-05-27', score: 84, stage: '技术评估' },
      { id: 'AL-002', name: '农产品冷链仓储项目', region: '四平市', projectType: '排污许可', status: '已办结', owner: '审批办', updatedAt: '2026-05-25', score: 96, stage: '许可核发' },
      { id: 'AL-003', name: '新能源汽车部件基地', region: '吉林市', projectType: '环评审批', status: '补正中', owner: '环评处', updatedAt: '2026-05-24', score: 71, stage: '材料补正' },
      { id: 'AL-004', name: '湿地修复配套工程', region: '白山市', projectType: '生态修复', status: '待会商', owner: '自然生态处', updatedAt: '2026-05-23', score: 89, stage: '联合审查' },
      { id: 'AL-005', name: '危险废物暂存库改造', region: '延边州', projectType: '固废危化', status: '补正中', owner: '固体废物处', updatedAt: '2026-05-22', score: 69, stage: '现场核查' },
    ],
    script_source: "const pending = rows.filter((row) => row.status !== '已办结').length\nreturn [\n  { label: '待办项目', value: `${pending} 个`, note: '脚本识别未办结事项', tone: pending > 3 ? 'amber' : 'blue' },\n  { label: '平均推进指数', value: (rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / Math.max(rows.length, 1)).toFixed(1), note: '用于嵌入审批驾驶舱', tone: 'green' },\n]",
    sort_order: 30,
  },
]

async function ensureSchema() {
  await ensureCollection('eco_data_products', '数据产品', '前台数据产品页面的数据产品定义与演示样例行，替代前端静态 mock 数据。', 'name')
  await ensureCollection('eco_app', '场景应用', '前台场景应用目录与供需对接关联应用。', 'name')
  await ensureCollection('eco_supply_demand_infos', '供需对接信息', '前台供需对接页面使用的数据需求与资源映射信息。', 'required_data_resource_name')
  await ensureCollection('eco_knowledge_base', '知识库文档', '前台知识库页面使用的政策、标准和方案文档索引。', 'title')
  await ensureCollection('eco_data_demands', '数据需求清单', '需求目录页面使用的数据需求条目，缺省可由供需对接集合兜底。', 'demand_name')
  await ensureCollection('eco_demand_tickets', '数据申请工单', '前台数据申请与需求提交产生的工单记录。', 'title')
  await ensureCollection('eco_data_stat', '资源统计明细', '数据资源统计任务历史批次明细。', 'stat_period_code')
  await ensureCollection('eco_data_stat_current', '资源当前统计', '数据资源最新统计快照。', 'stat_period_code')
  await ensureCollection('eco_stat_task', '统计任务', '数据统计任务目录。', 'task_name')
  await ensureCollection('eco_stat_job', '统计作业', '数据统计作业执行批次。', 'job_code')

  const productFields = [
    { ...input('product_code', '产品编码', '前端路由和产品唯一编码'), unique: true },
    input('name', '产品名称', '数据产品中文名称'),
    text('summary', '摘要', '数据产品说明'),
    input('domain', '业务领域', '数据产品所属业务领域'),
    input('owner', '责任单位', '数据产品责任单位'),
    input('update_cycle', '更新周期', '数据产品更新周期'),
    input('api_endpoint', 'API 地址', '数据产品接口或后端样例行来源'),
    input('api_method', 'API 方法', '数据产品接口方法'),
    input('api_auth_mode', '鉴权方式', '数据产品接口鉴权说明'),
    input('api_refresh_interval', '刷新频率', '数据产品接口刷新频率'),
    json('fields_json', '字段配置', '数据产品字段配置 JSON'),
    json('dimensions_json', '维度配置', '数据产品检索维度 JSON'),
    json('supported_modes', '支持视图', '数据产品支持的视图模式'),
    input('default_mode', '默认视图', '数据产品默认视图模式'),
    input('status_field', '状态字段', '看板和图谱使用的状态字段'),
    input('date_field', '日期字段', '日历视图使用的日期字段'),
    input('primary_field', '主显示字段', '列表卡片和图谱节点使用的主字段'),
    input('authorization_status', '授权状态', 'authorized 或 restricted'),
    json('sample_rows_json', '样例数据行', '从前端 mock 迁移到后端的数据产品样例行'),
    text('script_source', '脚本源码', '脚本视图运行的受限 JavaScript 源码'),
    integer('sort_order', '排序号', '列表排序号'),
  ]
  for (const field of productFields) await ensureField('eco_data_products', field)

  const appFields = [
    input('parentId', '父级应用 ID', '应用树父级 ID'),
    input('seqId', '排序编码', '应用目录排序编码'),
    input('name', '应用名称', '场景应用名称'),
    json('tags', '标签', '场景应用标签数组'),
    input('contact', '联系人', '场景应用联系人'),
    text('description', '应用说明', '场景应用说明'),
    m2o('domain_catagory', '业务领域', '场景应用所属业务领域', 'jcCategoryTreeNodes', 'domain_catagory_id', 'nodeName'),
    json('snapscreen', '应用截图', '场景应用截图附件或 URL'),
  ]
  for (const field of appFields) await ensureField('eco_app', field)

  const demandFields = [
    input('scene_name', '场景名称', '供需对接场景名称'),
    input('required_data_resource_name', '需求资源名称', '需求方需要的数据资源名称'),
    text('main_data_items', '主要数据项', '需求涉及的主要数据项'),
    text('demand_description', '需求描述', '供需对接需求描述'),
    bool('is_required', '是否必需', '该数据是否为场景必需数据'),
    input('data_status_description', '数据状态说明', '当前数据满足状态说明'),
    input('data_source_system', '来源系统', '数据来源系统'),
    input('data_contact_person', '数据联系人', '数据联系人'),
    text('data_connection_description', '对接说明', '数据对接方式和约束说明'),
    input('distribution_date', '分发日期', '数据分发或提出日期'),
    m2o('domain_category', '业务分类', '供需信息所属业务分类', 'jcCategoryTreeNodes', 'domain_category_id', 'nodeName'),
    m2o('data_category', '数据类别', '供需信息数据类别', 'jcDictionaryItems', 'data_category_id', 'dictValueName'),
    m2o('data_frequency_demand', '需求频率', '需求侧期望的数据频率', 'jcDictionaryItems', 'data_frequency_demand_id', 'dictValueName'),
    m2o('data_source_unit', '数据提供单位', '数据提供单位', 'jcCategoryTreeNodes', 'data_source_unit_id', 'nodeName'),
    m2o('data_supply_method', '供给方式', '数据供给方式', 'jcDictionaryItems', 'data_supply_method_id', 'dictValueName'),
    m2o('list_source', '清单来源', '需求清单来源', 'jcDictionaryItems', 'list_source_id', 'dictValueName'),
    m2o('satisfaction_status', '满足状态', '供需满足状态', 'jcDictionaryItems', 'satisfaction_status_id', 'dictValueName'),
    m2o('data_sync_frequency', '同步频率', '数据同步频率', 'jcDictionaryItems', 'data_sync_frequency_id', 'dictValueName'),
    m2o('external_data_category', '外部数据类别', '外部数据供需类别', 'jcCategoryTreeNodes', 'external_data_category_id', 'nodeName'),
    m2m('business_domain_categories', '业务领域分类', '供需涉及的多个业务领域', 'jcCategoryTreeNodes', 'eco_supply_demand_domain_links', 'supply_demand_id', 'domain_category_id', 'nodeName'),
    m2m('linked_data_resources', '已关联数据资源', '供需信息关联的数据资源', 'eco_data_resources', 'eco_supply_demand_resource_links', 'supply_demand_id', 'resource_id', 'resource_name'),
    m2m('related_apps', '关联场景应用', '供需信息关联的场景应用', 'eco_app', 'eco_supply_demand_app_links', 'supply_demand_id', 'app_id', 'name'),
  ]
  for (const field of demandFields) await ensureField('eco_supply_demand_infos', field)

  const dataDemandFields = [
    input('demand_name', '需求名称', '数据需求名称'),
    input('scene_name', '场景名称', '需求所属场景'),
    text('demand_desc', '需求描述', '数据需求描述'),
    m2o('domain_category', '业务分类', '需求所属业务分类', 'jcCategoryTreeNodes', 'domain_category_id', 'nodeName'),
    m2o('ref_source', '需求来源', '需求来源字典', 'jcDictionaryItems', 'ref_source_id', 'dictValueName'),
    m2o('update_cycle', '更新周期', '需求期望更新周期', 'jcDictionaryItems', 'update_cycle_id', 'dictValueName'),
    m2m('mapped_resources', '映射资源', '需求映射的数据资源', 'eco_data_resources', 'eco_data_demand_resource_links', 'demand_id', 'resource_id', 'resource_name'),
  ]
  for (const field of dataDemandFields) await ensureField('eco_data_demands', field)

  const ticketFields = [
    input('title', '工单标题', '数据申请工单标题'),
    text('description', '工单描述', '数据申请工单描述'),
    input('status', '工单状态', '数据申请工单状态'),
    input('createdAt', '创建时间', '创建时间'),
    input('updatedAt', '更新时间', '更新时间'),
  ]
  for (const field of ticketFields) await ensureField('eco_demand_tickets', field)

  const knowledgeFields = [
    input('title', '标题', '知识库文档标题'),
    input('filename', '文件名', '知识库文件名'),
    input('extname', '扩展名', '知识库文件扩展名'),
    integer('size', '文件大小', '文件大小字节数'),
    input('path', '路径', '知识库文件路径'),
    input('url', '文件 URL', '知识库文件 URL'),
    input('preview', '预览 URL', '知识库预览 URL'),
    json('base_info', '基础信息', '知识库文档基础元数据'),
    json('source_info', '来源信息', '知识库文档来源元数据'),
    text('content', '正文', '知识库文档正文内容'),
    input('createdAt', '创建时间', '创建时间'),
    input('updatedAt', '更新时间', '更新时间'),
    m2o('knowledge_type', '知识分类', '知识库文档分类', 'jcCategoryTreeNodes', 'knowledge_type_id', 'nodeName'),
  ]
  for (const field of knowledgeFields) await ensureField('eco_knowledge_base', field)

  const statFields = [
    input('stat_period_code', '统计周期编码', '统计周期编码'),
    input('data_resource_id', '数据资源 ID', '被统计的数据资源 ID'),
    json('stat_metainfo', '统计元信息', '记录数、字段数、存储量等统计指标'),
    json('stat_dayonday', '环比信息', '环比和趋势窗口信息'),
    json('stat_quality', '质量信息', '连接状态、空表、异常等质量信息'),
    input('stat_connect', '连接状态', '连接状态编码'),
    json('stat_error', '错误列表', '统计错误列表'),
    json('new_data', '最新数据预览', '最新数据预览样例'),
    input('created_at', '创建时间', '创建时间'),
    input('updated_at', '更新时间', '更新时间'),
  ]
  for (const collection of ['eco_data_stat', 'eco_data_stat_current']) {
    for (const field of statFields) await ensureField(collection, field)
  }
  for (const field of [input('task_code', '任务编码', '统计任务编码'), input('task_name', '任务名称', '统计任务名称')]) {
    await ensureField('eco_stat_task', field)
  }
  for (const field of [
    input('job_code', '作业编码', '统计作业编码'),
    input('stat_period_code', '统计周期编码', '统计周期编码'),
    input('execute_time', '执行时间', '统计作业执行时间'),
    input('task_code', '任务编码', '统计任务编码'),
    input('task_name', '任务名称', '统计任务名称'),
    input('created_at', '创建时间', '创建时间'),
    input('updated_at', '更新时间', '更新时间'),
  ]) await ensureField('eco_stat_job', field)

  await ensureCollection('security_api_resources', 'API 资源', '数据资源默认查询 API 与消息推送、模型服务档案（3.1 演示数据）。', 'api_name')
  await ensureCollection('security_access_subjects', '访问主体', '演示环境访问主体（内部应用与外部访问方）。', 'subject_name')

  const apiResourceFields = [
    input('api_code', 'API 编码', 'API 唯一编码'),
    input('api_name', 'API 名称', 'API 名称'),
    input('access_mode', '接入模式', 'direct、develop 或 orchestrate'),
    input('http_method', '请求方法', 'GET 或 POST'),
    input('upstream_url', '上游地址', '直接纳管模式的上游地址'),
    input('orchestrator_path', '编排路径', '运行时处理路径'),
    input('gateway_path', '发布路径', '统一网关发布路径'),
    json('runtime_config_json', '运行查询配置', '量测档案与查询配置'),
    input('protection_level', '防护层', 'l1 仅聚合、l2 明细受控、l3 仅密态'),
    bool('supports_row_filter', '支持行过滤', '是否支持时间与区域过滤'),
    bool('supports_field_filter', '支持字段过滤', '是否支持字段过滤'),
    bool('supports_aggregate', '支持聚合', '是否支持聚合输出'),
    bool('supports_homomorphic', '支持密态任务', '是否支持同态计算'),
    input('api_status', 'API 状态', 'draft、enabled 或 disabled'),
    integer('publish_version', '发布版本', '发布版本号'),
    input('publish_status', '发布状态', 'unpublished、success 或 failed'),
    text('publish_error', '发布错误', '发布失败原因'),
    m2o('resource', '数据资源', '数据资源', 'eco_data_resources', 'resource_id', 'resource_name'),
    m2o('data_source', '数据源', '数据源', 'security_data_sources', 'data_source_id', 'source_name'),
  ]
  for (const field of apiResourceFields) await ensureField('security_api_resources', field)

  const subjectFields = [
    input('subject_code', '主体编码', '访问主体唯一编码'),
    input('subject_name', '主体名称', '访问主体名称'),
    input('subject_type', '主体类型', 'internal_app 或 external_party'),
    input('organization_code', '组织编码', '所属组织编码'),
    input('organization_name', '组织名称', '所属组织名称'),
    input('credential_ref', '凭据引用', 'API Key 安全引用'),
    json('allowed_api_codes_json', '授权 API 编码列表', '授权 API 编码数组'),
    json('ip_whitelist_json', 'IP 白名单', '来源 IP 白名单'),
    input('subject_status', '主体状态', 'draft、enabled 或 disabled'),
  ]
  for (const field of subjectFields) await ensureField('security_access_subjects', field)

  await ensureCollection('security_streaming_events', '流式量测事件', '消息服务通道的连续量测事件源，由流式处理引擎按窗口消费与聚合。', 'event_code')
  await ensureCollection('security_streaming_windows', '流式窗口聚合', '流式处理引擎按时间窗口生成的区域×量测项聚合结果。', 'window_key')
  await ensureCollection('security_streaming_runs', '流式引擎批次日志', '流式处理引擎每次轮询的消费批次：事件数、窗口数、异常数与耗时。', 'run_code')

  const streamingEventFields = [
    input('event_code', '事件编码', '事件唯一编码'),
    datetime('event_time', '事件时间', '事件发生时间'),
    input('source_code', '来源数据源', '来源数据源编码'),
    input('region_code', '区域编码', '量测所属区域编码'),
    input('organization_code', '组织编码', '数据责任组织编码'),
    input('psr_id', '测点标识', '测点或设备标识'),
    input('measure_type', '量测项', '电压、电流、有功功率等'),
    number('value', '量测值', '量测数值'),
    input('quality_code', '质量码', 'normal、suspect 或 invalid'),
    bool('processed', '已消费', '是否已被流式引擎消费'),
    datetime('processed_at', '消费时间', '流式引擎消费时间'),
    integer('run_id', '处理批次', '流式引擎处理批次号'),
  ]
  for (const field of streamingEventFields) await ensureField('security_streaming_events', field)

  const streamingWindowFields = [
    input('window_key', '窗口标识', '窗口唯一标识'),
    datetime('window_start', '窗口开始', '窗口开始时间'),
    datetime('window_end', '窗口结束', '窗口结束时间'),
    input('region_code', '区域编码', '量测所属区域编码'),
    input('measure_type', '量测项', '电压、电流、有功功率等'),
    integer('event_count', '事件数', '窗口内事件数'),
    integer('anomaly_count', '异常数', '窗口内异常事件数'),
    number('sum_value', '数值合计', '窗口内数值合计'),
    number('avg_value', '数值均值', '窗口内数值均值'),
    integer('run_id', '处理批次', '流式引擎处理批次号'),
  ]
  for (const field of streamingWindowFields) await ensureField('security_streaming_windows', field)

  const streamingRunFields = [
    input('run_code', '批次编码', '批次唯一编码'),
    datetime('started_at', '开始时间', '批次开始时间'),
    datetime('finished_at', '结束时间', '批次结束时间'),
    integer('processed_events', '消费事件数', '本批次消费事件数'),
    integer('window_count', '生成窗口数', '本批次生成窗口数'),
    integer('anomaly_count', '异常事件数', '本批次异常事件数'),
    input('status', '状态', 'running、success、warning 或 failed'),
    integer('duration_ms', '耗时', '批次耗时毫秒'),
    text('error_summary', '错误摘要', '失败原因'),
    json('result_detail_json', '结果摘要', '批次结果明细'),
  ]
  for (const field of streamingRunFields) await ensureField('security_streaming_runs', field)

  // 3.1 演示数据写入依赖的 3.0 扩展字段（migrate 已建则跳过）
  const resourceExtensionFields = [
    input('protection_level', '防护层', 'l1 仅聚合、l2 明细受控、l3 仅密态'),
    input('resource_status', '资源状态', 'draft、enabled 或 disabled'),
    input('link_status', '关联状态', 'linked 已关联设备档案、unlinked 未关联设备档案'),
    m2o('data_source', '数据源', '数据源', 'security_data_sources', 'data_source_id', 'source_name'),
  ]
  for (const field of resourceExtensionFields) await ensureField('eco_data_resources', field)
  await ensureField('security_data_sources', json('connection_options_json', '连接扩展参数', '数据库或通道连接扩展参数'))
}

async function ensureBaseDictionariesAndTrees() {
  await ensureCategoryType('security_category', '安全分类树', '量测数据安全分类与分层防护标准')
  await ensureCategoryType('business_attribute_categorization', '业务属性分类树', '数据资源业务属性分类')
  await ensureCategoryType('HJ417-2025', '信息资源分类树', '信息资源分类')
  await ensureCategoryType('eco_provider_units', '提供单位树', '资源提供单位')
  await ensureCategoryType('eco_region_categories', '区域分类树', '资源覆盖区域')
  await ensureCategoryType('eco_domain_category', '数据分类树', '数据资源目录的数据分类树')
  await ensureCategoryType('knowledge_type', '知识库分类树', '知识库文档分类')

  const productionRoot = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-production', '生产运行数据', null, 10)
  const meteringNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-metering', '量测采集数据', productionRoot, 20)
  const dispatchNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-dispatch', '主网调度量测', meteringNode, 30)
  const substationNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-substation', '变电设备量测', meteringNode, 40)
  const distributionNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-distribution', '配电自动化量测', meteringNode, 50)
  const phasorNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-phasor', '同步相量数据', meteringNode, 60)
  const customerMeteringNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-customer-measure', '用户侧量测', meteringNode, 45)
  const energyNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-energy', '电量数据', meteringNode, 55)
  const eventNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-event', '事件类数据', meteringNode, 65)
  const unlinkedNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-unlinked', '未关联归档', meteringNode, 70)
  const collectCategoryNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-collect-cat', '采集类', meteringNode, 25)
  const loadCategoryNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-load-cat', '负荷类', meteringNode, 35)
  const energyCategoryNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-energy-cat', '电量类', meteringNode, 45)
  const eventCategoryNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-event-cat', '事件类', meteringNode, 55)
  const archiveCategoryNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-archive-cat', '档案类', meteringNode, 65)
  const lineLossCategoryNode = await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-line-loss-cat', '线损类', meteringNode, 75)
  await ensureCategoryNode('eco_domain_category', '数据分类树', 'grid-marketing', '营销服务数据', null, 30)
  const businessAttr = await ensureCategoryNode('business_attribute_categorization', '业务属性分类树', 'production-operation', '生产运行', null, 10)
  const operationInfo = await ensureCategoryNode('HJ417-2025', '信息资源分类树', 'info-operation', '电网运行量测', null, 10)
  const customerInfo = await ensureCategoryNode('HJ417-2025', '信息资源分类树', 'info-customer', '用户侧明细', null, 20)
  const dispatchDept = await ensureCategoryNode('eco_provider_units', '提供单位树', 'dept-dispatch', '调控中心', null, 10)
  const meteringDept = await ensureCategoryNode('eco_provider_units', '提供单位树', 'dept-metering', '计量中心', null, 20)
  const equipmentDept = await ensureCategoryNode('eco_provider_units', '提供单位树', 'dept-equipment', '设备管理部', null, 30)
  const distributionDept = await ensureCategoryNode('eco_provider_units', '提供单位树', 'dept-distribution', '配电自动化中心', null, 40)
  const province = await ensureCategoryNode('eco_region_categories', '区域分类树', 'province-company', '省公司', null, 10)
  const knowledge = await ensureCategoryNode('knowledge_type', '知识库分类树', 'power-data-security', '电力数据安全', null, 10)
  const securityRoot = await ensureCategoryNode('security_category', '安全分类树', 'root', '安全分类树', null, 10)
  const sensitiveSecurityCategory = await ensureCategoryNode('security_category', '安全分类树', 'sensitive-data', '敏感数据', securityRoot, 40)
  const coreSecurityCategory = await ensureCategoryNode('security_category', '安全分类树', 'core-data', '核心数据', securityRoot, 60)
  const operationSecurityCategory = await ensureCategoryNode('security_category', '安全分类树', 'operation-control-data', '运行控制数据', securityRoot, 80)

  const dictTypes = [
    ['security_level', '安全等级', [['level_1', '1级（公开）'], ['level_2', '2级（内部）'], ['level_3', '3级（敏感）'], ['level_4', '4级（重要）'], ['level_5', '5级（核心）']]],
    ['data_subject_type', '数据主体类型', [['customer', '客户'], ['device', '设备'], ['operation', '运行']]],
    ['source_type', '数据源类型', [['yongcai20', '用采2.0'], ['dispatch_cloud', '调控云'], ['substation_monitor', '变电站集中监控'], ['distribution_automation', '配电自动化'], ['wide_area_measurement', '广域测量'], ['file_e', 'E 文件通道'], ['message_queue', '消息服务通道'], ['ems', '调度自动化'], ['tmr', '电能量计量'], ['distribution_cloud', '配电云主站'], ['cable_monitor', '输变电状态监测'], ['weather', '网格化气象'], ['hvcable', '高压电缆在线监测'], ['realtime_db', '实时库'], ['history_db', '历史库'], ['third_party_api', '第三方接口']]],
    ['connection_status', '连接状态', [['connected', '已连接'], ['unconnected', '未连接'], ['exception', '连接异常'], ['testing', '测试中'], ['disabled', '已停用']]],
    ['compute_status', '密态任务状态', [['pending_approval', '待审批'], ['approved', '已审批'], ['running', '运行中'], ['completed', '已完成'], ['paused', '已暂停'], ['failed', '失败']]],
    ['compute_algorithm', '密态算法', [['bfv', '整数精确型'], ['ckks', '浮点近似型']]],
    ['risk_level', '风险等级', [['high', '高'], ['medium', '中'], ['low', '低'], ['normal', '正常']]],
    ['resource_role', '密态资源角色', [['primary', '主资源'], ['participant', '参与资源'], ['result', '结果资源']]],
    ['update_cycle', '更新周期', [['realtime', '实时'], ['1m', '1分钟'], ['15m', '15分钟'], ['30m', '30 分钟'], ['daily', '每日']]],
    ['sharing_attribute', '共享属性', [['conditional', '条件共享'], ['controlled', '受控共享'], ['internal', '内部共享']]],
    ['data_resource_type', '数据资源类型', [['table', '数据表'], ['api', 'API 服务'], ['dataset', '数据集']]],
    ['data_supply_method', '数据供给方式', [['api', '接口'], ['table', '库表'], ['file', '文件']]],
    ['data_category', '数据类别', [['operation', '生产运行'], ['marketing', '营销服务'], ['external', '外部数据']]],
    ['list_source', '清单来源', [['research', '需求调研'], ['business', '业务填报']]],
    ['satisfaction_status', '满足状态', [['matched', '已满足'], ['pending', '待对接'], ['partial', '部分满足']]],
    ['data_frequency_demand', '需求频率', [['realtime', '实时'], ['daily', '每日'], ['monthly', '每月']]],
    ['data_sync_frequency', '同步频率', [['15m', '15分钟'], ['daily', '每日'], ['ondemand', '按需']]],
  ]
  const dictIds = {}
  for (const [typeCode, typeName, items] of dictTypes) {
    await ensureDictionaryType(typeCode, typeName)
    for (let i = 0; i < items.length; i += 1) {
      const [dictValue, dictValueName] = items[i]
      dictIds[`${typeCode}:${dictValue}`] = await ensureDictionaryItem(typeCode, typeName, dictValue, dictValueName, (i + 1) * 10)
    }
  }
  await pruneDictionaryItems('compute_algorithm', ['bfv', 'ckks'])

  const tagPolicies = [
    {
      title: '安全档案-重要数据标签',
      collectionName: 'eco_resource_security_policies',
      fieldName: 'security_tags',
      sort: 10,
      rules: [{ fieldName: 'important_data_flag', operator: 'eq', value: 'true' }],
      tags: ['重要数据'],
    },
    {
      title: '安全档案-核心管控标签',
      collectionName: 'eco_resource_security_policies',
      fieldName: 'security_tags',
      sort: 20,
      rules: [{ fieldName: 'core_control_flag', operator: 'eq', value: 'true' }],
      tags: ['核心管控'],
    },
    {
      title: '安全档案-需脱敏标签',
      collectionName: 'eco_resource_security_policies',
      fieldName: 'security_tags',
      sort: 30,
      rules: [{ fieldName: 'desensitization_required', operator: 'eq', value: 'true' }],
      tags: ['需脱敏'],
    },
    {
      title: '安全档案-需审批标签',
      collectionName: 'eco_resource_security_policies',
      fieldName: 'security_tags',
      sort: 40,
      rules: [{ fieldName: 'approval_required', operator: 'eq', value: 'true' }],
      tags: ['需审批'],
    },
    { title: '字段安全-重要字段标签', collectionName: 'eco_resource_security_fields', fieldName: 'field_tags', sort: 60, rules: [{ fieldName: 'important_field_flag', operator: 'eq', value: 'true' }], tags: ['重要字段'] },
    { title: '字段安全-脱敏字段标签', collectionName: 'eco_resource_security_fields', fieldName: 'field_tags', sort: 70, rules: [{ fieldName: 'required_desensitization', operator: 'eq', value: 'true' }], tags: ['需脱敏字段'] },
    { title: '字段安全-核心等级标签', collectionName: 'eco_resource_security_fields', fieldName: 'field_tags', sort: 80, rules: [{ fieldName: 'security_level', operator: 'eq', value: 'core' }], tags: ['核心字段'] },
    { title: '数据源-连接异常标签', collectionName: 'security_data_sources', fieldName: 'source_tags', sort: 90, rules: [{ fieldName: 'connection_status', operator: 'eq', value: 'exception' }], tags: ['连接异常'] },
    { title: '数据源-量测数据库标签', collectionName: 'security_data_sources', fieldName: 'source_tags', sort: 100, rules: [{ fieldName: 'source_type', operator: 'eq', value: 'validation_database' }], tags: ['量测数据库'] },
    { title: '密态任务-高风险标签', collectionName: 'security_confidential_tasks', fieldName: 'task_tags', sort: 110, rules: [{ fieldName: 'risk_level', operator: 'eq', value: 'high' }], tags: ['高风险任务'] },
    { title: '密态任务-执行失败标签', collectionName: 'security_confidential_tasks', fieldName: 'task_tags', sort: 120, rules: [{ fieldName: 'task_status', operator: 'eq', value: 'failed' }], tags: ['执行失败'] },
  ]
  for (const policy of tagPolicies) {
    await ensureTagGenerationPolicy(policy.title, {
      enabled: true,
      dataSourceKey: 'main',
      collectionName: policy.collectionName,
      fieldName: policy.fieldName,
      logic: 'and',
      rules: policy.rules,
      tags: policy.tags,
      sort: policy.sort,
      remark: '电网安全门户演示标签策略',
    })
  }

  await upsert('jcConfigCenterModules', { key: 'security-governance' }, {
    key: 'security-governance',
    title: '数据安全管控',
    description: '数据接入、访问控制和同态加密运行参数',
    sort: 30,
    enabled: true,
  })
  await upsert('jcConfigCenterGroups', { moduleKey: 'security-governance', key: 'homomorphic-encryption' }, {
    moduleKey: 'security-governance',
    key: 'homomorphic-encryption',
    title: '同态加密',
    description: '同态加密引擎连接配置',
    sort: 10,
    enabled: true,
  })
  const openFheConfigIdentity = { moduleKey: 'security-governance', groupKey: 'homomorphic-encryption', key: 'homomorphic_engine_config' }
  await upsert('jcConfigCenterItems', openFheConfigIdentity, {
    ...openFheConfigIdentity,
    title: '密态计算运行配置',
    description: '启用整数精确与浮点近似的求和、平均值能力，敏感认证材料使用凭据引用。',
    valueType: 'json',
    required: true,
    enabled: true,
    sort: 10,
    value: {
      engineName: '量测数据密态计算服务',
      endpoint: '/homomorphic-engine-api',
      authMode: 'mTLS',
      secretRef: 'secret://security/homomorphic-engine-client',
      timeoutSeconds: 60,
      enabled: false,
      supportedAlgorithms: ['整数精确型', '浮点近似型'],
    },
    schema: { algorithms: ['整数精确型', '浮点近似型'] },
  })

  const streamingConfigIdentity = { moduleKey: 'security-governance', groupKey: 'streaming-engine', key: 'streaming_engine_config' }
  await upsert('jcConfigCenterItems', streamingConfigIdentity, {
    ...streamingConfigIdentity,
    title: '流式处理引擎运行配置',
    description: '以轻量 Python 服务消费消息通道连续量测事件，按时间窗口聚合与异常检测；不依赖 Kafka/Flink。',
    valueType: 'json',
    required: true,
    enabled: true,
    sort: 20,
    value: {
      engineName: '量测数据流式处理引擎',
      enabled: true,
      windowSeconds: 60,
      pollIntervalSeconds: 10,
      demoInjectEnabled: true,
      demoEventsPerTick: 20,
      anomalyThreshold: 0.05,
      sourceCode: 'SRC-DCLOUD-001',
    },
    schema: {
      windowSeconds: 60,
      pollIntervalSeconds: 10,
      anomalyThreshold: 0.05,
    },
  })

  return {
    productionRoot,
    meteringNode,
    dispatchNode,
    substationNode,
    distributionNode,
    phasorNode,
    customerMeteringNode,
    energyNode,
    eventNode,
    unlinkedNode,
    collectCategoryNode,
    loadCategoryNode,
    energyCategoryNode,
    eventCategoryNode,
    archiveCategoryNode,
    lineLossCategoryNode,
    businessAttr,
    operationInfo,
    customerInfo,
    dispatchDept,
    meteringDept,
    equipmentDept,
    distributionDept,
    province,
    knowledge,
    sensitiveSecurityCategory,
    coreSecurityCategory,
    operationSecurityCategory,
    dictIds,
  }
}

const measurementDemoSpecs = {
  'GRID-METER-SEC-001': {
    fields: [
      { fieldName: '采集时间', englishName: 'DATA_TIME', fieldType: 'DATETIME', length: '19', nullable: '否', shared: '否', primary: '是', description: '用户侧量测曲线采集时间', securityLevel: '2级', sensitivityType: '运行时间', tags: ['重要字段', '量测时间'] },
      { fieldName: '户号', englishName: 'CONS_NO', fieldType: 'VARCHAR', length: '32', nullable: '否', shared: '否', primary: '否', description: '脱敏后的用户侧业务标识', securityLevel: '3级', sensitivityType: '客户标识', tags: ['直接标识符', '准标识符', '重要字段'], identifierFlag: true, quasiIdentifierFlag: true, desensitizationMode: 'tokenize' },
      { fieldName: '电能表标识', englishName: 'METER_ID', fieldType: 'VARCHAR', length: '32', nullable: '否', shared: '否', primary: '否', description: '用户侧电能表设备标识', securityLevel: '3级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' },
      { fieldName: '有功功率', englishName: 'P_ACTIVE', fieldType: 'DECIMAL', length: '18,4', nullable: '是', shared: '是', primary: '否', unit: 'kW', description: '十五分钟有功功率量测值', securityLevel: '3级', sensitivityType: '运行敏感', tags: ['重要字段', '负荷曲线'], desensitizationMode: 'aggregate-only' },
      { fieldName: '无功功率', englishName: 'P_REACTIVE', fieldType: 'DECIMAL', length: '18,4', nullable: '是', shared: '是', primary: '否', unit: 'kvar', description: '十五分钟无功功率量测值', securityLevel: '3级', sensitivityType: '运行敏感', tags: ['重要字段', '负荷曲线'], desensitizationMode: 'aggregate-only' },
      { fieldName: '正向有功电量', englishName: 'ENERGY_IMPORT', fieldType: 'DECIMAL', length: '20,4', nullable: '是', shared: '是', primary: '否', unit: 'kWh', description: '正向有功累计电量', securityLevel: '3级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' },
    ],
    preview: {
      columns: ['DATA_TIME', 'CONS_NO', 'METER_ID', 'P_ACTIVE(kW)', 'P_REACTIVE(kvar)', 'ENERGY_IMPORT(kWh)'],
      rows: [
        ['2026-07-10 09:15:00', '2201****0176', 'MTR-CC-8F21', 428.36, 92.18, 184562.75],
        ['2026-07-10 09:30:00', '2201****0176', 'MTR-CC-8F21', 441.12, 95.44, 184671.93],
        ['2026-07-10 09:45:00', '2201****0176', 'MTR-CC-8F21', 436.75, 93.87, 184780.61],
        ['2026-07-10 10:00:00', '2201****0176', 'MTR-CC-8F21', 452.08, 98.32, 184892.44],
      ],
    },
    recordCount: 1280000,
    storageBytes: 268435456,
  },
  'GRID-DISPATCH-SEC-002': {
    fields: [
      { fieldName: '量测时间', englishName: 'DATA_TIME', fieldType: 'DATETIME', length: '23', nullable: '否', shared: '否', primary: '是', description: '调度量测采集时间，精确到毫秒', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '实时运行'] },
      { fieldName: '量测点标识', englishName: 'POINT_ID', fieldType: 'VARCHAR', length: '64', nullable: '否', shared: '否', primary: '是', description: '调度量测点唯一标识', securityLevel: '5级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段', '设备标识'], identifierFlag: true, desensitizationMode: 'tokenize' },
      { fieldName: '厂站名称', englishName: 'SUBSTATION_NAME', fieldType: 'VARCHAR', length: '128', nullable: '否', shared: '否', primary: '否', description: '量测点所属厂站名称', securityLevel: '4级', sensitivityType: '拓扑敏感', tags: ['重要字段', '电网拓扑'], desensitizationMode: 'mask' },
      { fieldName: '电压等级', englishName: 'VOLTAGE_LEVEL', fieldType: 'VARCHAR', length: '16', nullable: '否', shared: '是', primary: '否', unit: 'kV', description: '厂站或设备额定电压等级', securityLevel: '3级', sensitivityType: '设备属性', tags: ['重要字段'] },
      { fieldName: '量测类型', englishName: 'MEASURE_TYPE', fieldType: 'VARCHAR', length: '32', nullable: '否', shared: '是', primary: '否', description: '电压、电流、有功、无功或频率', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '实时运行'] },
      { fieldName: '量测值', englishName: 'MEASURE_VALUE', fieldType: 'DECIMAL', length: '20,6', nullable: '否', shared: '否', primary: '否', description: '调度实时运行量测值', securityLevel: '5级', sensitivityType: '运行敏感', tags: ['重要字段', '实时运行'], desensitizationMode: 'aggregate-only' },
      { fieldName: '质量码', englishName: 'QUALITY_CODE', fieldType: 'VARCHAR', length: '16', nullable: '否', shared: '是', primary: '否', description: '量测可信、可疑、无效等质量状态', securityLevel: '3级', sensitivityType: '质量状态', tags: ['重要字段', '完整性校验'] },
    ],
    preview: {
      columns: ['DATA_TIME', 'POINT_ID', 'SUBSTATION_NAME', 'VOLTAGE_LEVEL', 'MEASURE_TYPE', 'MEASURE_VALUE', 'QUALITY_CODE'],
      rows: [
        ['2026-07-10 09:59:58.000', 'PNT-220-CC-01-IA', '长春东郊220千伏变电站', '220kV', 'A相电流', 612.48, 'GOOD'],
        ['2026-07-10 09:59:58.000', 'PNT-220-CC-01-UA', '长春东郊220千伏变电站', '220kV', 'A相电压', 225.73, 'GOOD'],
        ['2026-07-10 09:59:59.000', 'PNT-500-JL-01-P', '吉林南500千伏变电站', '500kV', '有功功率', 786.24, 'GOOD'],
        ['2026-07-10 10:00:00.000', 'PNT-SYS-FREQ-01', '省级主网', '500kV', '系统频率', 50.018, 'GOOD'],
      ],
    },
    recordCount: 8600000,
    storageBytes: 1887436800,
  },
  'GRID-SUBSTATION-SEC-003': {
    fields: [
      { fieldName: '量测时间', englishName: 'DATA_TIME', fieldType: 'DATETIME', length: '23', nullable: '否', shared: '否', primary: '是', description: '主变设备量测时间', securityLevel: '3级', sensitivityType: '运行时间', tags: ['重要字段', '设备运行'] },
      { fieldName: '厂站标识', englishName: 'STATION_ID', fieldType: 'VARCHAR', length: '32', nullable: '否', shared: '否', primary: '是', description: '变电站唯一标识', securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段', '电网拓扑'], identifierFlag: true, desensitizationMode: 'tokenize' },
      { fieldName: '主变标识', englishName: 'TRANSFORMER_ID', fieldType: 'VARCHAR', length: '32', nullable: '否', shared: '否', primary: '是', description: '主变压器唯一标识', securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' },
      { fieldName: '高压侧电压', englishName: 'HIGH_VOLTAGE', fieldType: 'DECIMAL', length: '12,4', nullable: '否', shared: '否', primary: '否', unit: 'kV', description: '主变高压侧母线电压', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '设备运行'], desensitizationMode: 'aggregate-only' },
      { fieldName: '低压侧电压', englishName: 'LOW_VOLTAGE', fieldType: 'DECIMAL', length: '12,4', nullable: '否', shared: '否', primary: '否', unit: 'kV', description: '主变低压侧母线电压', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '设备运行'], desensitizationMode: 'aggregate-only' },
      { fieldName: '负载率', englishName: 'LOAD_RATE', fieldType: 'DECIMAL', length: '8,4', nullable: '否', shared: '否', primary: '否', unit: '%', description: '主变实时负载率', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '设备负载'], desensitizationMode: 'aggregate-only' },
      { fieldName: '顶层油温', englishName: 'OIL_TEMP', fieldType: 'DECIMAL', length: '8,3', nullable: '是', shared: '否', primary: '否', unit: '℃', description: '主变顶层油温量测值', securityLevel: '3级', sensitivityType: '设备状态', tags: ['重要字段', '设备状态'] },
    ],
    preview: {
      columns: ['DATA_TIME', 'STATION_ID', 'TRANSFORMER_ID', 'HIGH_VOLTAGE(kV)', 'LOW_VOLTAGE(kV)', 'LOAD_RATE(%)', 'OIL_TEMP(℃)'],
      rows: [
        ['2026-07-10 09:58:00.000', 'SS-CC-EAST-220', 'TR-01', 224.82, 66.31, 63.4, 48.7],
        ['2026-07-10 09:59:00.000', 'SS-CC-EAST-220', 'TR-01', 225.16, 66.27, 64.1, 48.9],
        ['2026-07-10 10:00:00.000', 'SS-CC-EAST-220', 'TR-01', 225.43, 66.35, 64.8, 49.1],
      ],
    },
    recordCount: 3260000,
    storageBytes: 724566016,
  },
  'GRID-DISTRIBUTION-SEC-004': {
    fields: [
      { fieldName: '量测时间', englishName: 'DATA_TIME', fieldType: 'DATETIME', length: '23', nullable: '否', shared: '否', primary: '是', description: '配电线路量测时间', securityLevel: '3级', sensitivityType: '运行时间', tags: ['重要字段', '配网运行'] },
      { fieldName: '馈线标识', englishName: 'FEEDER_ID', fieldType: 'VARCHAR', length: '32', nullable: '否', shared: '否', primary: '是', description: '10千伏馈线唯一标识', securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段', '电网拓扑'], identifierFlag: true, desensitizationMode: 'tokenize' },
      { fieldName: '终端标识', englishName: 'TERMINAL_ID', fieldType: 'VARCHAR', length: '32', nullable: '否', shared: '否', primary: '否', description: '配电自动化终端标识', securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' },
      { fieldName: '线电压', englishName: 'LINE_VOLTAGE', fieldType: 'DECIMAL', length: '10,4', nullable: '否', shared: '否', primary: '否', unit: 'kV', description: '馈线三相线电压均值', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '配网运行'], desensitizationMode: 'aggregate-only' },
      { fieldName: '线电流', englishName: 'LINE_CURRENT', fieldType: 'DECIMAL', length: '12,4', nullable: '否', shared: '否', primary: '否', unit: 'A', description: '馈线三相电流均值', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '配网运行'], desensitizationMode: 'aggregate-only' },
      { fieldName: '有功功率', englishName: 'ACTIVE_POWER', fieldType: 'DECIMAL', length: '16,4', nullable: '否', shared: '否', primary: '否', unit: 'MW', description: '馈线实时有功功率', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '馈线负荷'], desensitizationMode: 'aggregate-only' },
      { fieldName: '负载率', englishName: 'LOAD_RATE', fieldType: 'DECIMAL', length: '8,4', nullable: '否', shared: '否', primary: '否', unit: '%', description: '馈线实时负载率', securityLevel: '3级', sensitivityType: '运行敏感', tags: ['重要字段', '馈线负荷'], desensitizationMode: 'aggregate-only' },
    ],
    preview: {
      columns: ['DATA_TIME', 'FEEDER_ID', 'TERMINAL_ID', 'LINE_VOLTAGE(kV)', 'LINE_CURRENT(A)', 'ACTIVE_POWER(MW)', 'LOAD_RATE(%)'],
      rows: [
        ['2026-07-10 09:58:00.000', 'FD-CC-NG-101', 'FTU-NG-101-01', 10.42, 286.4, 5.18, 57.6],
        ['2026-07-10 09:59:00.000', 'FD-CC-NG-101', 'FTU-NG-101-01', 10.39, 291.8, 5.26, 58.4],
        ['2026-07-10 10:00:00.000', 'FD-CC-NG-101', 'FTU-NG-101-01', 10.41, 295.3, 5.33, 59.2],
      ],
    },
    recordCount: 5420000,
    storageBytes: 1124073472,
  },
  'GRID-PHASOR-SEC-005': {
    fields: [
      { fieldName: '同步量测时间', englishName: 'DATA_TIME', fieldType: 'DATETIME', length: '26', nullable: '否', shared: '否', primary: '是', description: '统一时标下的同步相量时间', securityLevel: '5级', sensitivityType: '运行敏感', tags: ['重要字段', '同步相量'] },
      { fieldName: '相量测量装置标识', englishName: 'PMU_ID', fieldType: 'VARCHAR', length: '32', nullable: '否', shared: '否', primary: '是', description: '同步相量测量装置标识', securityLevel: '5级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段', '电网拓扑'], identifierFlag: true, desensitizationMode: 'tokenize' },
      { fieldName: '相量通道标识', englishName: 'PHASOR_ID', fieldType: 'VARCHAR', length: '64', nullable: '否', shared: '否', primary: '是', description: '电压或电流相量通道标识', securityLevel: '5级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' },
      { fieldName: '电压幅值', englishName: 'VOLTAGE_MAG', fieldType: 'DECIMAL', length: '16,6', nullable: '否', shared: '否', primary: '否', unit: 'kV', description: '同步相量电压幅值', securityLevel: '5级', sensitivityType: '运行敏感', tags: ['重要字段', '同步相量'], desensitizationMode: 'aggregate-only' },
      { fieldName: '电压相角', englishName: 'VOLTAGE_ANGLE', fieldType: 'DECIMAL', length: '16,8', nullable: '否', shared: '否', primary: '否', unit: '°', description: '同步相量电压相角', securityLevel: '5级', sensitivityType: '运行敏感', tags: ['重要字段', '同步相量'], desensitizationMode: 'aggregate-only' },
      { fieldName: '系统频率', englishName: 'FREQUENCY', fieldType: 'DECIMAL', length: '12,6', nullable: '否', shared: '否', primary: '否', unit: 'Hz', description: '同步量测系统频率', securityLevel: '5级', sensitivityType: '运行敏感', tags: ['重要字段', '系统频率'], desensitizationMode: 'aggregate-only' },
      { fieldName: '频率变化率', englishName: 'ROCOF', fieldType: 'DECIMAL', length: '12,8', nullable: '否', shared: '否', primary: '否', unit: 'Hz/s', description: '系统频率变化率', securityLevel: '5级', sensitivityType: '运行敏感', tags: ['重要字段', '稳定分析'], desensitizationMode: 'aggregate-only' },
      { fieldName: '质量码', englishName: 'QUALITY_CODE', fieldType: 'VARCHAR', length: '16', nullable: '否', shared: '是', primary: '否', description: '同步相量数据质量状态', securityLevel: '4级', sensitivityType: '质量状态', tags: ['重要字段', '完整性校验'] },
    ],
    preview: {
      columns: ['DATA_TIME', 'PMU_ID', 'PHASOR_ID', 'VOLTAGE_MAG(kV)', 'VOLTAGE_ANGLE(°)', 'FREQUENCY(Hz)', 'ROCOF(Hz/s)', 'QUALITY_CODE'],
      rows: [
        ['2026-07-10 09:59:59.960000', 'PMU-JL-SOUTH-01', 'BUS-500-UA', 512.438, 12.485712, 50.017842, -0.003125, 'GOOD'],
        ['2026-07-10 09:59:59.980000', 'PMU-JL-SOUTH-01', 'BUS-500-UA', 512.421, 12.486093, 50.017806, -0.001800, 'GOOD'],
        ['2026-07-10 10:00:00.000000', 'PMU-JL-SOUTH-01', 'BUS-500-UA', 512.409, 12.486454, 50.017781, -0.001250, 'GOOD'],
      ],
    },
    recordCount: 18600000,
    storageBytes: 4294967296,
  },
}

function measurementField(englishName, fieldName, fieldType, length, description, options = {}) {
  return {
    fieldName,
    englishName,
    fieldType,
    length,
    nullable: options.nullable ?? '否',
    shared: options.shared ?? '是',
    primary: options.primary ?? '否',
    unit: options.unit ?? '',
    description,
    ...(options.securityLevel ? { securityLevel: options.securityLevel } : {}),
    ...(options.sensitivityType ? { sensitivityType: options.sensitivityType } : {}),
    ...(options.tags ? { tags: options.tags } : {}),
    ...(options.identifierFlag ? { identifierFlag: true } : {}),
    ...(options.quasiIdentifierFlag ? { quasiIdentifierFlag: true } : {}),
    ...(options.desensitizationMode ? { desensitizationMode: options.desensitizationMode } : {}),
  }
}

const gridCurveBaseFields = [
  measurementField('DATA_TIME', '采集时间', 'DATETIME', '23', '量测曲线采集时间', { securityLevel: '3级', sensitivityType: '运行时间', tags: ['重要字段', '量测时间'] }),
  measurementField('REGION_CODE', '区域编码', 'VARCHAR', '50', '量测所属区域编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['区域范围'] }),
  measurementField('ORGANIZATION_CODE', '组织编码', 'VARCHAR', '50', '数据责任组织编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['责任组织'] }),
  measurementField('PSR_ID', '设备档案标识', 'VARCHAR', '64', '设备档案关联标识', { securityLevel: '3级', sensitivityType: '设备标识', tags: ['直接标识符', '准标识符', '重要字段'], identifierFlag: true, quasiIdentifierFlag: true, desensitizationMode: 'tokenize' }),
  measurementField('EQUIP_SRC_ID', '源端设备标识', 'VARCHAR', '64', '源端系统设备标识', { securityLevel: '3级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
  measurementField('EQUIP_TYPE', '设备类型', 'VARCHAR', '50', '主变、母线、线路等设备类型', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['设备类型'] }),
  measurementField('POS_CODE', '位置编码', 'VARCHAR', '10', '101 高压侧、102 中压侧、103 低压侧、107 起点、108 终点', { securityLevel: '3级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
  measurementField('MEASURE_TYPE', '量测项', 'VARCHAR', '30', 'A/B/C 相电压、线电压等量测项', { securityLevel: '3级', sensitivityType: '运行敏感', tags: ['重要字段', '量测类型'] }),
  measurementField('TIME_AREA_TYPE', '采集密度', 'VARCHAR', '10', '0-一天 288 个采集值、1-一天 1440 个采集值', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['采集密度'] }),
]

const customerCurveBaseFields = [
  measurementField('DATA_TIME', '采集时间', 'DATETIME', '23', '用户量测采集时间', { securityLevel: '3级', sensitivityType: '运行时间', tags: ['重要字段', '量测时间'] }),
  measurementField('REGION_CODE', '区域编码', 'VARCHAR', '50', '用户所属区域编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['区域范围'] }),
  measurementField('ORGANIZATION_CODE', '组织编码', 'VARCHAR', '50', '数据责任组织编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['责任组织'] }),
  measurementField('CONS_NO', '用户标识', 'VARCHAR', '32', '用户侧业务标识，按敏感字段管控', { securityLevel: '5级', sensitivityType: '客户标识', tags: ['直接标识符', '准标识符', '重要字段'], identifierFlag: true, quasiIdentifierFlag: true, desensitizationMode: 'tokenize' }),
  measurementField('METER_DEV_ID', '电能表标识', 'VARCHAR', '32', '用户侧电能表设备标识', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
]

const v31MeasurementSpecs = {
  'GRID-LVF-VOLT-001': {
    fields: [
      ...gridCurveBaseFields,
      measurementField('VOLTAGE', '电压', 'DECIMAL', '12,4', '电压量测值（kV）', { unit: 'kV', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '主网量测'], desensitizationMode: 'aggregate-only' }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['重要字段', '完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_TIME', 'PSR_ID', 'EQUIP_TYPE', 'POS_CODE', 'MEASURE_TYPE', 'VOLTAGE(kV)', 'QUALITY_CODE'],
      rows: [
        ['2026-07-01 00:05:00', 'PSR-220-TRA-01', '主变', '101', 'A相电压', 220.6700, 'normal'],
        ['2026-07-01 00:05:00', 'PSR-220-BUS-01', '母线', '107', 'B相电压', 220.7762, 'normal'],
        ['2026-07-01 00:10:00', 'PSR-110-TRA-02', '主变', '103', 'C相电压', 110.6240, 'suspect'],
      ],
    },
    recordCount: 1152,
    storageBytes: 458752,
  },
  'GRID-LVF-CURR-002': {
    fields: [
      ...gridCurveBaseFields,
      measurementField('CURRENT', '电流', 'DECIMAL', '12,4', '电流量测值（A）', { unit: 'A', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '主网量测'], desensitizationMode: 'aggregate-only' }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['重要字段', '完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_TIME', 'PSR_ID', 'EQUIP_TYPE', 'MEASURE_TYPE', 'CURRENT(A)', 'QUALITY_CODE'],
      rows: [
        ['2026-07-01 00:05:00', 'PSR-220-TRA-01', '主变', 'A相电流', 384.6210, 'normal'],
        ['2026-07-01 00:05:00', 'PSR-220-LIN-01', '线路', 'B相电流', 486.0930, 'normal'],
        ['2026-07-01 00:10:00', 'PSR-110-TRA-02', '主变', 'C相电流', 618.8420, 'invalid'],
      ],
    },
    recordCount: 1152,
    storageBytes: 458752,
  },
  'GRID-LVF-POWER-004': {
    fields: [
      ...gridCurveBaseFields,
      measurementField('P_ACTIVE', '有功功率', 'DECIMAL', '16,4', '有功功率量测值（MW）', { unit: 'MW', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '主网量测'], desensitizationMode: 'aggregate-only' }),
      measurementField('P_REACTIVE', '无功功率', 'DECIMAL', '16,4', '无功功率量测值（Mvar）', { unit: 'Mvar', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '主网量测'], desensitizationMode: 'aggregate-only' }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['重要字段', '完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_TIME', 'PSR_ID', 'EQUIP_TYPE', 'P_ACTIVE(MW)', 'P_REACTIVE(Mvar)', 'QUALITY_CODE'],
      rows: [
        ['2026-07-01 00:05:00', 'PSR-220-TRA-01', '主变', 86.9240, 21.3180, 'normal'],
        ['2026-07-01 00:05:00', 'PSR-220-BUS-01', '母线', 52.6100, 13.0240, 'normal'],
        ['2026-07-01 00:10:00', 'PSR-220-LIN-01', '线路', 96.1830, 24.3110, 'suspect'],
      ],
    },
    recordCount: 1152,
    storageBytes: 524288,
  },
  'GRID-LVF-PF-006': {
    fields: [
      ...gridCurveBaseFields,
      measurementField('POWER_FACTOR', '功率因数', 'DECIMAL', '8,4', '功率因数量测值（0~1）', { securityLevel: '3级', sensitivityType: '运行敏感', tags: ['重要字段', '电能质量'] }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '2级', sensitivityType: '质量状态', tags: ['完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_TIME', 'PSR_ID', 'MEASURE_TYPE', 'POWER_FACTOR', 'QUALITY_CODE'],
      rows: [
        ['2026-07-01 00:05:00', 'PSR-220-LIN-01', '功率因数', 0.9340, 'normal'],
        ['2026-07-01 00:10:00', 'PSR-220-LIN-01', '功率因数', 0.9412, 'normal'],
        ['2026-07-01 00:15:00', 'PSR-110-LIN-02', '功率因数', 0.8861, 'suspect'],
      ],
    },
    recordCount: 576,
    storageBytes: 262144,
  },
  'CUST-DAILY-ENERGY-003': {
    fields: [
      measurementField('DATA_DATE', '数据日期', 'DATE', '10', '日冻结数据日期', { securityLevel: '3级', sensitivityType: '运行时间', tags: ['重要字段', '量测时间'] }),
      measurementField('REGION_CODE', '区域编码', 'VARCHAR', '50', '用户所属区域编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['区域范围'] }),
      measurementField('ORGANIZATION_CODE', '组织编码', 'VARCHAR', '50', '数据责任组织编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['责任组织'] }),
      measurementField('CONS_NO', '用户标识', 'VARCHAR', '32', '用户侧业务标识，按敏感字段管控', { securityLevel: '5级', sensitivityType: '客户标识', tags: ['直接标识符', '准标识符', '重要字段'], identifierFlag: true, quasiIdentifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('METER_DEV_ID', '电能表标识', 'VARCHAR', '32', '用户侧电能表设备标识', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('MGT_ORG_CODE', '管理单位编码', 'VARCHAR', '50', '电能表管理单位编码', { securityLevel: '3级', sensitivityType: '普通字段', tags: ['责任组织'] }),
      measurementField('EQUIP_TYPE', '设备类型', 'VARCHAR', '50', '低压用户、中压用户、分布式光伏、充电桩', { securityLevel: '3级', sensitivityType: '普通字段', tags: ['用户类型'] }),
      measurementField('POS_CODE', '位置编码', 'VARCHAR', '10', '102 中压侧、103 低压侧', { securityLevel: '4级', sensitivityType: '客户标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('PAP_R', '正向有功总电能示值', 'BIGINT', '20', '正向有功总电能示值（kWh）', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R1', '正向有功费率1电能示值', 'BIGINT', '20', '费率 1 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R2', '正向有功费率2电能示值', 'BIGINT', '20', '费率 2 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R3', '正向有功费率3电能示值', 'BIGINT', '20', '费率 3 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R4', '正向有功费率4电能示值', 'BIGINT', '20', '费率 4 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PRP_R', '正向无功总电能示值', 'BIGINT', '20', '正向无功总电能示值（kvarh）', { unit: 'kvarh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_DATE', 'CONS_NO', 'EQUIP_TYPE', 'PAP_R(kWh)', 'PRP_R(kvarh)', 'QUALITY_CODE'],
      rows: [
        ['2026-06-24', 'C00000001', '低压用户', 209, 38, 'normal'],
        ['2026-06-24', 'C00000002', '分布式光伏', 218, 39, 'normal'],
        ['2026-06-25', 'C00000003', '充电桩', 243, 44, 'suspect'],
      ],
    },
    recordCount: 512,
    storageBytes: 393216,
  },
  'CUST-POWER-CURVE-005': {
    fields: [
      ...customerCurveBaseFields,
      measurementField('EQUIP_TYPE', '设备类型', 'VARCHAR', '50', '低压用户、分布式光伏', { securityLevel: '3级', sensitivityType: '普通字段', tags: ['用户类型'] }),
      measurementField('POS_CODE', '位置编码', 'VARCHAR', '10', '102 中压侧、103 低压侧', { securityLevel: '4级', sensitivityType: '客户标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('MEASURE_TYPE', '量测项', 'VARCHAR', '30', 'A/B/C 相电压电流、有功、无功、功率因数', { securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '量测类型'] }),
      measurementField('TIME_AREA_TYPE', '采集密度', 'VARCHAR', '10', '0-一天 288 个采集值、1-一天 1440 个采集值', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['采集密度'] }),
      measurementField('VALUE', '量测值', 'DECIMAL', '18,6', '按量测项区分的量测值（电压 kV、电流 A、功率 kW）', { securityLevel: '5级', sensitivityType: '运行敏感', tags: ['重要字段', '用户负荷'], desensitizationMode: 'aggregate-only' }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_TIME', 'CONS_NO', 'MEASURE_TYPE', 'VALUE', 'QUALITY_CODE'],
      rows: [
        ['2026-07-01 00:05:00', 'C00000001', 'A相电压', 0.221400, 'normal'],
        ['2026-07-01 00:05:00', 'C00000001', 'A相电流', 15.382000, 'normal'],
        ['2026-07-01 00:10:00', 'C00000002', '有功功率', 12.146000, 'suspect'],
      ],
    },
    recordCount: 576,
    storageBytes: 393216,
  },
  'CUST-OUTAGE-EVENT-007': {
    fields: [
      measurementField('EVENT_ID', '事件标识', 'VARCHAR', '64', '停复电事件唯一标识', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('EVENT_TIME', '事件时间', 'DATETIME', '23', '停电或复电发生时间', { securityLevel: '3级', sensitivityType: '运行时间', tags: ['重要字段', '量测时间'] }),
      measurementField('CONS_NO', '用户标识', 'VARCHAR', '32', '用户侧业务标识，按敏感字段管控', { securityLevel: '5级', sensitivityType: '客户标识', tags: ['直接标识符', '准标识符', '重要字段'], identifierFlag: true, quasiIdentifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('METER_DEV_ID', '电能表标识', 'VARCHAR', '32', '用户侧电能表设备标识', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('EQUIP_TYPE', '设备类型', 'VARCHAR', '50', '低压用户、中压用户、分布式光伏、充电桩', { securityLevel: '3级', sensitivityType: '普通字段', tags: ['用户类型'] }),
      measurementField('POS_CODE', '位置编码', 'VARCHAR', '10', '102 中压侧、103 低压侧', { securityLevel: '4级', sensitivityType: '客户标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('EVENT_TYPE', '事件类型', 'VARCHAR', '20', '停电或复电', { securityLevel: '3级', sensitivityType: '运行敏感', tags: ['重要字段', '停复电'] }),
      measurementField('EVENT_SOURCE', '事件来源', 'VARCHAR', '50', '用采2.0 或配电自动化', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['来源通道'] }),
      measurementField('OUTAGE_DURATION_MIN', '停电时长', 'DECIMAL', '12,2', '停电持续分钟数', { unit: 'min', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '停电分析'] }),
      measurementField('REGION_CODE', '区域编码', 'VARCHAR', '50', '用户所属区域编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['区域范围'] }),
      measurementField('ORGANIZATION_CODE', '组织编码', 'VARCHAR', '50', '数据责任组织编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['责任组织'] }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['完整性校验'] }),
    ],
    preview: {
      columns: ['EVENT_TIME', 'CONS_NO', 'EVENT_TYPE', 'EVENT_SOURCE', 'OUTAGE_DURATION_MIN(min)', 'QUALITY_CODE'],
      rows: [
        ['2026-07-01 00:45:00', 'C00000001', '停电', '用采2.0', 62, 'normal'],
        ['2026-07-01 02:15:00', 'C00000002', '复电', '用采2.0', null, 'normal'],
        ['2026-07-01 05:00:00', 'C00000003', '停电', '配电自动化', 178, 'suspect'],
      ],
    },
    recordCount: 384,
    storageBytes: 327680,
  },
  'GRID-SWITCH-EVENT-008': {
    fields: [
      measurementField('EVENT_ID', '事件标识', 'VARCHAR', '64', '开关事件唯一标识', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('EVENT_TIME', '事件时间', 'DATETIME', '23', '开关变位发生时间', { securityLevel: '3级', sensitivityType: '运行时间', tags: ['重要字段', '量测时间'] }),
      measurementField('PSR_ID', '设备档案标识', 'VARCHAR', '64', '设备档案关联标识', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('EQUIP_SRC_ID', '源端设备标识', 'VARCHAR', '64', '源端系统设备标识', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('EQUIP_TYPE', '设备类型', 'VARCHAR', '50', '断路器、负荷开关、柱上开关', { securityLevel: '3级', sensitivityType: '普通字段', tags: ['设备类型'] }),
      measurementField('POS_CODE', '位置编码', 'VARCHAR', '10', '107 起点、108 终点', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('EVENT_TYPE', '事件类型', 'VARCHAR', '30', '开关变位、故障跳闸、事故总', { securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '开关事件'] }),
      measurementField('SWITCH_STATE', '开关状态', 'SMALLINT', '2', '0 分、1 合', { securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '开关事件'] }),
      measurementField('REGION_CODE', '区域编码', 'VARCHAR', '50', '开关所属区域编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['区域范围'] }),
      measurementField('ORGANIZATION_CODE', '组织编码', 'VARCHAR', '50', '数据责任组织编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['责任组织'] }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['完整性校验'] }),
    ],
    preview: {
      columns: ['EVENT_TIME', 'PSR_ID', 'EQUIP_TYPE', 'EVENT_TYPE', 'SWITCH_STATE', 'QUALITY_CODE'],
      rows: [
        ['2026-07-01 00:50:00', 'PSR-SW-001', '断路器', '开关变位', 0, 'normal'],
        ['2026-07-01 01:40:00', 'PSR-SW-002', '负荷开关', '故障跳闸', 0, 'normal'],
        ['2026-07-01 03:20:00', 'PSR-SW-003', '柱上开关', '事故总', 1, 'suspect'],
      ],
    },
    recordCount: 384,
    storageBytes: 327680,
  },
  'GRID-NO-RELAD-009': {
    fields: [
      measurementField('DATA_TIME', '采集时间', 'DATETIME', '23', '未关联量测采集时间', { securityLevel: '2级', sensitivityType: '运行时间', tags: ['量测时间'] }),
      measurementField('SOURCE_TAG', '来源通道', 'VARCHAR', '50', '主网遥测、配网遥测、用户量测', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['来源通道'] }),
      measurementField('MEASURE_TYPE', '量测项', 'VARCHAR', '30', '电压、电流、有功、无功', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['量测类型'] }),
      measurementField('TIME_AREA_TYPE', '采集密度', 'VARCHAR', '10', '0-一天 288 个采集值、1-一天 1440 个采集值', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['采集密度'] }),
      measurementField('VALUE', '量测值', 'DECIMAL', '18,6', '未关联量测值', { securityLevel: '3级', sensitivityType: '运行敏感', tags: ['未关联归档'], desensitizationMode: 'aggregate-only' }),
      measurementField('REGION_CODE', '区域编码', 'VARCHAR', '50', '量测所属区域编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['区域范围'] }),
      measurementField('ORGANIZATION_CODE', '组织编码', 'VARCHAR', '50', '数据责任组织编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['责任组织'] }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '2级', sensitivityType: '质量状态', tags: ['完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_TIME', 'SOURCE_TAG', 'MEASURE_TYPE', 'VALUE', 'QUALITY_CODE'],
      rows: [
        ['2026-07-01 00:15:00', '主网遥测', '电压', 220.518000, 'normal'],
        ['2026-07-01 00:30:00', '配网遥测', '电流', 312.940000, 'normal'],
        ['2026-07-01 00:45:00', '用户量测', '有功', 4.281000, 'suspect'],
      ],
    },
    recordCount: 256,
    storageBytes: 196608,
  },
  'GRID-TMR-ENERGY-010': {
    fields: [
      measurementField('DATA_TIME', '采集时间', 'DATETIME', '23', '电能示值采集时间', { securityLevel: '3级', sensitivityType: '运行时间', tags: ['重要字段', '量测时间'] }),
      measurementField('PSR_ID', '设备档案标识', 'VARCHAR', '64', '设备档案关联标识', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('EQUIP_TYPE', '设备类型', 'VARCHAR', '50', '主变、断路器、机组、线路', { securityLevel: '3级', sensitivityType: '普通字段', tags: ['设备类型'] }),
      measurementField('POS_CODE', '位置编码', 'VARCHAR', '10', '101 高压侧、102 中压侧', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('ENERGY_TYPE', '电能类型', 'VARCHAR', '30', '正向有功、反向有功、正向无功、反向无功', { securityLevel: '4级', sensitivityType: '经营敏感', tags: ['重要字段', '电能示值'] }),
      measurementField('READ_VALUE', '电能示值', 'DECIMAL', '20,4', '电能示值（kWh）', { unit: 'kWh', securityLevel: '4级', sensitivityType: '经营敏感', tags: ['重要字段', '电能示值'], desensitizationMode: 'aggregate-only' }),
      measurementField('REGION_CODE', '区域编码', 'VARCHAR', '50', '设备所属区域编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['区域范围'] }),
      measurementField('ORGANIZATION_CODE', '组织编码', 'VARCHAR', '50', '数据责任组织编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['责任组织'] }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_TIME', 'PSR_ID', 'EQUIP_TYPE', 'ENERGY_TYPE', 'READ_VALUE(kWh)', 'QUALITY_CODE'],
      rows: [
        ['2026-06-16 00:00:00', 'PSR-TMR-001', '主变', '正向有功', 51806.3200, 'normal'],
        ['2026-06-16 00:00:00', 'PSR-TMR-002', '断路器', '反向有功', 3201.1400, 'normal'],
        ['2026-06-17 00:00:00', 'PSR-TMR-003', '机组', '正向无功', 21490.8500, 'suspect'],
      ],
    },
    recordCount: 512,
    storageBytes: 327680,
  },
  'GRID-LVF-PHASE-011': {
    fields: [
      ...gridCurveBaseFields,
      measurementField('PHASE_ANGLE', '电压相位角', 'DECIMAL', '10,4', '电压相位角量测值（度）', { unit: '°', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '主网量测', '电能质量'], desensitizationMode: 'aggregate-only' }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['重要字段', '完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_DATE', 'PSR_ID', 'EQUIP_TYPE', 'MEASURE_TYPE', 'PHASE_ANGLE(°)', 'QUALITY_CODE'],
      rows: [
        ['2026-06-30', 'PSR-220-TRA-01', '主变', 'A相相位角', -12.3640, 'normal'],
        ['2026-06-30', 'PSR-220-BUS-01', '母线', 'B相相位角', 8.2170, 'normal'],
        ['2026-07-01', 'PSR-110-TRA-02', '主变', 'C相相位角', 15.4890, 'suspect'],
      ],
    },
    recordCount: 288,
    storageBytes: 196608,
  },
  'CUST-HV-DAILY-INFO-012': {
    fields: [
      measurementField('DATA_DATE', '数据日期', 'DATE', '10', '高压用户日用能数据日期', { securityLevel: '3级', sensitivityType: '运行时间', tags: ['重要字段', '量测时间'] }),
      measurementField('REGION_CODE', '区域编码', 'VARCHAR', '50', '用户所属区域编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['区域范围'] }),
      measurementField('ORGANIZATION_CODE', '组织编码', 'VARCHAR', '50', '数据责任组织编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['责任组织'] }),
      measurementField('CONS_NO', '用户标识', 'VARCHAR', '32', '高压用户业务标识，按敏感字段管控', { securityLevel: '5级', sensitivityType: '客户标识', tags: ['直接标识符', '准标识符', '重要字段'], identifierFlag: true, quasiIdentifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('METER_DEV_ID', '电能表标识', 'VARCHAR', '32', '高压用户电能表设备标识', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('MGT_ORG_CODE', '管理单位编码', 'VARCHAR', '50', '电能表管理单位编码', { securityLevel: '3级', sensitivityType: '普通字段', tags: ['责任组织'] }),
      measurementField('EQUIP_TYPE', '设备类型', 'VARCHAR', '50', '高压用户、专变用户', { securityLevel: '3级', sensitivityType: '普通字段', tags: ['用户类型'] }),
      measurementField('POS_CODE', '位置编码', 'VARCHAR', '10', '101 高压侧', { securityLevel: '4级', sensitivityType: '客户标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('PAP_R', '正向有功总电能示值', 'BIGINT', '20', '高压用户正向有功总电能示值（kWh）', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R1', '正向有功费率1电能示值', 'BIGINT', '20', '费率 1 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R2', '正向有功费率2电能示值', 'BIGINT', '20', '费率 2 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R3', '正向有功费率3电能示值', 'BIGINT', '20', '费率 3 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R4', '正向有功费率4电能示值', 'BIGINT', '20', '费率 4 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PRP_R', '正向无功总电能示值', 'BIGINT', '20', '正向无功总电能示值（kvarh）', { unit: 'kvarh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_DATE', 'CONS_NO', 'EQUIP_TYPE', 'PAP_R(kWh)', 'PRP_R(kvarh)', 'QUALITY_CODE'],
      rows: [
        ['2026-06-30', 'HV0000001', '高压用户', 21806, 4021, 'normal'],
        ['2026-06-30', 'HV0000002', '专变用户', 15943, 2805, 'normal'],
        ['2026-07-01', 'HV0000003', '高压用户', 24310, 4412, 'suspect'],
      ],
    },
    recordCount: 256,
    storageBytes: 196608,
  },
  'CUST-LV-DAILY-INFO-013': {
    fields: [
      measurementField('DATA_DATE', '数据日期', 'DATE', '10', '低压用户日用能数据日期', { securityLevel: '3级', sensitivityType: '运行时间', tags: ['重要字段', '量测时间'] }),
      measurementField('REGION_CODE', '区域编码', 'VARCHAR', '50', '用户所属区域编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['区域范围'] }),
      measurementField('ORGANIZATION_CODE', '组织编码', 'VARCHAR', '50', '数据责任组织编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['责任组织'] }),
      measurementField('CONS_NO', '用户标识', 'VARCHAR', '32', '低压用户业务标识，按敏感字段管控', { securityLevel: '5级', sensitivityType: '客户标识', tags: ['直接标识符', '准标识符', '重要字段'], identifierFlag: true, quasiIdentifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('METER_DEV_ID', '电能表标识', 'VARCHAR', '32', '低压用户电能表设备标识', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('MGT_ORG_CODE', '管理单位编码', 'VARCHAR', '50', '电能表管理单位编码', { securityLevel: '3级', sensitivityType: '普通字段', tags: ['责任组织'] }),
      measurementField('EQUIP_TYPE', '设备类型', 'VARCHAR', '50', '低压用户、分布式光伏、充电桩', { securityLevel: '3级', sensitivityType: '普通字段', tags: ['用户类型'] }),
      measurementField('POS_CODE', '位置编码', 'VARCHAR', '10', '103 低压侧', { securityLevel: '4级', sensitivityType: '客户标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('PAP_R', '正向有功总电能示值', 'BIGINT', '20', '低压用户正向有功总电能示值（kWh）', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R1', '正向有功费率1电能示值', 'BIGINT', '20', '费率 1 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R2', '正向有功费率2电能示值', 'BIGINT', '20', '费率 2 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R3', '正向有功费率3电能示值', 'BIGINT', '20', '费率 3 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PAP_R4', '正向有功费率4电能示值', 'BIGINT', '20', '费率 4 正向有功电能示值', { unit: 'kWh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('PRP_R', '正向无功总电能示值', 'BIGINT', '20', '正向无功总电能示值（kvarh）', { unit: 'kvarh', securityLevel: '5级', sensitivityType: '经营敏感', tags: ['重要字段', '用电量'], desensitizationMode: 'aggregate-only' }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_DATE', 'CONS_NO', 'EQUIP_TYPE', 'PAP_R(kWh)', 'QUALITY_CODE'],
      rows: [
        ['2026-06-30', 'C00000011', '低压用户', 209, 'normal'],
        ['2026-06-30', 'C00000012', '分布式光伏', 218, 'normal'],
        ['2026-07-01', 'C00000013', '充电桩', 243, 'suspect'],
      ],
    },
    recordCount: 512,
    storageBytes: 327680,
  },
  'CUST-HV-DAILY-LOAD-014': {
    fields: [
      measurementField('DATA_DATE', '数据日期', 'DATE', '10', '高压用户日负荷数据日期', { securityLevel: '3级', sensitivityType: '运行时间', tags: ['重要字段', '量测时间'] }),
      measurementField('REGION_CODE', '区域编码', 'VARCHAR', '50', '用户所属区域编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['区域范围'] }),
      measurementField('ORGANIZATION_CODE', '组织编码', 'VARCHAR', '50', '数据责任组织编码', { securityLevel: '2级', sensitivityType: '普通字段', tags: ['责任组织'] }),
      measurementField('CONS_NO', '用户标识', 'VARCHAR', '32', '高压用户业务标识，按敏感字段管控', { securityLevel: '5级', sensitivityType: '客户标识', tags: ['直接标识符', '准标识符', '重要字段'], identifierFlag: true, quasiIdentifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('METER_DEV_ID', '电能表标识', 'VARCHAR', '32', '高压用户电能表设备标识', { securityLevel: '4级', sensitivityType: '设备标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('EQUIP_TYPE', '设备类型', 'VARCHAR', '50', '高压用户、专变用户', { securityLevel: '3级', sensitivityType: '普通字段', tags: ['用户类型'] }),
      measurementField('POS_CODE', '位置编码', 'VARCHAR', '10', '101 高压侧', { securityLevel: '4级', sensitivityType: '客户标识', tags: ['直接标识符', '重要字段'], identifierFlag: true, desensitizationMode: 'tokenize' }),
      measurementField('MAX_LOAD', '日最大负荷', 'DECIMAL', '12,4', '高压用户日最大负荷（kW）', { unit: 'kW', securityLevel: '5级', sensitivityType: '运行敏感', tags: ['重要字段', '用户负荷'], desensitizationMode: 'aggregate-only' }),
      measurementField('MIN_LOAD', '日最小负荷', 'DECIMAL', '12,4', '高压用户日最小负荷（kW）', { unit: 'kW', securityLevel: '5级', sensitivityType: '运行敏感', tags: ['重要字段', '用户负荷'], desensitizationMode: 'aggregate-only' }),
      measurementField('AVG_LOAD', '日平均负荷', 'DECIMAL', '12,4', '高压用户日平均负荷（kW）', { unit: 'kW', securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '用户负荷'], desensitizationMode: 'aggregate-only' }),
      measurementField('LOAD_FACTOR', '日负荷率', 'DECIMAL', '8,4', '高压用户日负荷率（0~1）', { securityLevel: '4级', sensitivityType: '运行敏感', tags: ['重要字段', '用户负荷'] }),
      measurementField('QUALITY_CODE', '质量码', 'VARCHAR', '20', '量测质量状态', { securityLevel: '3级', sensitivityType: '质量状态', tags: ['完整性校验'] }),
    ],
    preview: {
      columns: ['DATA_DATE', 'CONS_NO', 'MAX_LOAD(kW)', 'MIN_LOAD(kW)', 'AVG_LOAD(kW)', 'LOAD_FACTOR', 'QUALITY_CODE'],
      rows: [
        ['2026-06-30', 'HV0000001', 384.6200, 96.4100, 208.9400, 0.5431, 'normal'],
        ['2026-06-30', 'HV0000002', 486.0900, 121.0300, 267.4100, 0.5500, 'normal'],
        ['2026-07-01', 'HV0000003', 618.8400, 154.7100, 348.2200, 0.5627, 'suspect'],
      ],
    },
    recordCount: 256,
    storageBytes: 196608,
  },
}

Object.assign(measurementDemoSpecs, v31MeasurementSpecs)

const v31Archives = {
  'GRID-LVF-VOLT-001': {
    table: 'measurement_demo.grid_low_freq_voltage',
    fieldMap: {
      DATA_TIME: 'data_time', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code',
      PSR_ID: 'psr_id', EQUIP_SRC_ID: 'equip_src_id', EQUIP_TYPE: 'equip_type', POS_CODE: 'pos_code',
      MEASURE_TYPE: 'measure_type', TIME_AREA_TYPE: 'time_area_type', VOLTAGE: 'voltage', QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_TIME', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'PSR_ID', valueFieldCode: 'VOLTAGE',
    defaultFields: ['DATA_TIME', 'PSR_ID', 'EQUIP_TYPE', 'MEASURE_TYPE', 'VOLTAGE'],
    maskFields: ['PSR_ID', 'EQUIP_SRC_ID', 'POS_CODE'],
    scales: { VOLTAGE: 0.001 },
  },
  'GRID-LVF-CURR-002': {
    table: 'measurement_demo.grid_low_freq_current',
    fieldMap: {
      DATA_TIME: 'data_time', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code',
      PSR_ID: 'psr_id', EQUIP_SRC_ID: 'equip_src_id', EQUIP_TYPE: 'equip_type', POS_CODE: 'pos_code',
      MEASURE_TYPE: 'measure_type', TIME_AREA_TYPE: 'time_area_type', CURRENT: 'current', QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_TIME', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'PSR_ID', valueFieldCode: 'CURRENT',
    defaultFields: ['DATA_TIME', 'PSR_ID', 'EQUIP_TYPE', 'MEASURE_TYPE', 'CURRENT'],
    maskFields: ['PSR_ID', 'EQUIP_SRC_ID', 'POS_CODE'],
    scales: { CURRENT: 0.001 },
  },
  'CUST-DAILY-ENERGY-003': {
    table: 'measurement_demo.cust_daily_frozen_energy',
    fieldMap: {
      DATA_DATE: 'data_date', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code',
      CONS_NO: 'cons_no', METER_DEV_ID: 'meter_dev_id', MGT_ORG_CODE: 'mgt_org_code', EQUIP_TYPE: 'equip_type',
      POS_CODE: 'pos_code', PAP_R: 'pap_r', PAP_R1: 'pap_r1', PAP_R2: 'pap_r2', PAP_R3: 'pap_r3', PAP_R4: 'pap_r4',
      PRP_R: 'prp_r', QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_DATE', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'CONS_NO', valueFieldCode: 'PAP_R',
    defaultFields: ['DATA_DATE', 'CONS_NO', 'EQUIP_TYPE', 'PAP_R'],
    maskFields: ['CONS_NO', 'METER_DEV_ID', 'POS_CODE'],
    scales: {},
  },
  'GRID-LVF-POWER-004': {
    table: 'measurement_demo.grid_low_freq_power',
    fieldMap: {
      DATA_TIME: 'data_time', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code',
      PSR_ID: 'psr_id', EQUIP_SRC_ID: 'equip_src_id', EQUIP_TYPE: 'equip_type', POS_CODE: 'pos_code',
      MEASURE_TYPE: 'measure_type', TIME_AREA_TYPE: 'time_area_type', P_ACTIVE: 'p_active', P_REACTIVE: 'p_reactive',
      QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_TIME', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'PSR_ID', valueFieldCode: 'P_ACTIVE',
    defaultFields: ['DATA_TIME', 'PSR_ID', 'EQUIP_TYPE', 'P_ACTIVE'],
    maskFields: ['PSR_ID', 'EQUIP_SRC_ID', 'POS_CODE'],
    scales: {},
  },
  'CUST-POWER-CURVE-005': {
    table: 'measurement_demo.cust_measurement_curve',
    fieldMap: {
      DATA_TIME: 'data_time', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code',
      CONS_NO: 'cons_no', METER_DEV_ID: 'meter_dev_id', EQUIP_TYPE: 'equip_type', POS_CODE: 'pos_code',
      MEASURE_TYPE: 'measure_type', TIME_AREA_TYPE: 'time_area_type', VALUE: 'value', QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_TIME', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'CONS_NO', valueFieldCode: 'VALUE',
    defaultFields: ['DATA_TIME', 'CONS_NO', 'MEASURE_TYPE', 'VALUE'],
    maskFields: ['CONS_NO', 'METER_DEV_ID', 'POS_CODE'],
    scales: {},
  },
  'GRID-LVF-PF-006': {
    table: 'measurement_demo.grid_low_freq_power_factor',
    fieldMap: {
      DATA_TIME: 'data_time', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code',
      PSR_ID: 'psr_id', EQUIP_SRC_ID: 'equip_src_id', EQUIP_TYPE: 'equip_type', POS_CODE: 'pos_code',
      MEASURE_TYPE: 'measure_type', TIME_AREA_TYPE: 'time_area_type', POWER_FACTOR: 'power_factor', QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_TIME', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'PSR_ID', valueFieldCode: 'POWER_FACTOR',
    defaultFields: ['DATA_TIME', 'PSR_ID', 'MEASURE_TYPE', 'POWER_FACTOR'],
    maskFields: ['PSR_ID', 'EQUIP_SRC_ID', 'POS_CODE'],
    scales: {},
  },
  'CUST-OUTAGE-EVENT-007': {
    table: 'measurement_demo.cust_outage_events',
    fieldMap: {
      EVENT_ID: 'event_id', EVENT_TIME: 'event_time', CONS_NO: 'cons_no', METER_DEV_ID: 'meter_dev_id',
      EQUIP_TYPE: 'equip_type', POS_CODE: 'pos_code', EVENT_TYPE: 'event_type', EVENT_SOURCE: 'event_source',
      OUTAGE_DURATION_MIN: 'outage_duration_min', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code',
      QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'EVENT_TIME', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'EVENT_ID', valueFieldCode: 'OUTAGE_DURATION_MIN',
    defaultFields: ['EVENT_TIME', 'CONS_NO', 'EVENT_TYPE', 'EVENT_SOURCE'],
    maskFields: ['EVENT_ID', 'CONS_NO', 'METER_DEV_ID', 'POS_CODE'],
    scales: {},
  },
  'GRID-SWITCH-EVENT-008': {
    table: 'measurement_demo.grid_switch_events',
    fieldMap: {
      EVENT_ID: 'event_id', EVENT_TIME: 'event_time', PSR_ID: 'psr_id', EQUIP_SRC_ID: 'equip_src_id',
      EQUIP_TYPE: 'equip_type', POS_CODE: 'pos_code', EVENT_TYPE: 'event_type', SWITCH_STATE: 'switch_state',
      REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code', QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'EVENT_TIME', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'EVENT_ID', valueFieldCode: 'SWITCH_STATE',
    defaultFields: ['EVENT_TIME', 'PSR_ID', 'EQUIP_TYPE', 'EVENT_TYPE'],
    maskFields: ['EVENT_ID', 'PSR_ID', 'EQUIP_SRC_ID', 'POS_CODE'],
    scales: {},
  },
  'GRID-NO-RELAD-009': {
    table: 'measurement_demo.measurement_no_relad',
    fieldMap: {
      DATA_TIME: 'data_time', SOURCE_TAG: 'source_tag', MEASURE_TYPE: 'measure_type', TIME_AREA_TYPE: 'time_area_type',
      VALUE: 'value', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code', QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_TIME', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'SOURCE_TAG', valueFieldCode: 'VALUE',
    defaultFields: ['DATA_TIME', 'SOURCE_TAG', 'MEASURE_TYPE', 'VALUE'],
    maskFields: [],
    scales: {},
  },
  'GRID-TMR-ENERGY-010': {
    table: 'measurement_demo.grid_tmr_energy',
    fieldMap: {
      DATA_TIME: 'data_time', PSR_ID: 'psr_id', EQUIP_TYPE: 'equip_type', POS_CODE: 'pos_code',
      ENERGY_TYPE: 'energy_type', READ_VALUE: 'read_value', REGION_CODE: 'region_code',
      ORGANIZATION_CODE: 'organization_code', QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_TIME', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'PSR_ID', valueFieldCode: 'READ_VALUE',
    defaultFields: ['DATA_TIME', 'PSR_ID', 'EQUIP_TYPE', 'ENERGY_TYPE', 'READ_VALUE'],
    maskFields: ['PSR_ID', 'POS_CODE'],
    scales: {},
  },
  'GRID-LVF-PHASE-011': {
    table: 'measurement_demo.grid_low_freq_phase_angle',
    fieldMap: {
      DATA_TIME: 'data_time', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code',
      PSR_ID: 'psr_id', EQUIP_SRC_ID: 'equip_src_id', EQUIP_TYPE: 'equip_type', POS_CODE: 'pos_code',
      MEASURE_TYPE: 'measure_type', TIME_AREA_TYPE: 'time_area_type', PHASE_ANGLE: 'phase_angle', QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_TIME', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'PSR_ID', valueFieldCode: 'PHASE_ANGLE',
    defaultFields: ['DATA_TIME', 'PSR_ID', 'MEASURE_TYPE', 'PHASE_ANGLE'],
    maskFields: ['PSR_ID', 'EQUIP_SRC_ID', 'POS_CODE'],
    scales: { PHASE_ANGLE: 0.001 },
  },
  'CUST-HV-DAILY-INFO-012': {
    table: 'measurement_demo.cust_hv_daily_info',
    fieldMap: {
      DATA_DATE: 'data_date', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code',
      CONS_NO: 'cons_no', METER_DEV_ID: 'meter_dev_id', MGT_ORG_CODE: 'mgt_org_code', EQUIP_TYPE: 'equip_type',
      POS_CODE: 'pos_code', PAP_R: 'pap_r', PAP_R1: 'pap_r1', PAP_R2: 'pap_r2', PAP_R3: 'pap_r3', PAP_R4: 'pap_r4',
      PRP_R: 'prp_r', QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_DATE', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'CONS_NO', valueFieldCode: 'PAP_R',
    defaultFields: ['DATA_DATE', 'CONS_NO', 'EQUIP_TYPE', 'PAP_R'],
    maskFields: ['CONS_NO', 'METER_DEV_ID', 'POS_CODE'],
    scales: {},
  },
  'CUST-LV-DAILY-INFO-013': {
    table: 'measurement_demo.cust_lv_daily_info',
    fieldMap: {
      DATA_DATE: 'data_date', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code',
      CONS_NO: 'cons_no', METER_DEV_ID: 'meter_dev_id', MGT_ORG_CODE: 'mgt_org_code', EQUIP_TYPE: 'equip_type',
      POS_CODE: 'pos_code', PAP_R: 'pap_r', PAP_R1: 'pap_r1', PAP_R2: 'pap_r2', PAP_R3: 'pap_r3', PAP_R4: 'pap_r4',
      PRP_R: 'prp_r', QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_DATE', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'CONS_NO', valueFieldCode: 'PAP_R',
    defaultFields: ['DATA_DATE', 'CONS_NO', 'EQUIP_TYPE', 'PAP_R'],
    maskFields: ['CONS_NO', 'METER_DEV_ID', 'POS_CODE'],
    scales: {},
  },
  'CUST-HV-DAILY-LOAD-014': {
    table: 'measurement_demo.cust_hv_daily_load',
    fieldMap: {
      DATA_DATE: 'data_date', REGION_CODE: 'region_code', ORGANIZATION_CODE: 'organization_code',
      CONS_NO: 'cons_no', METER_DEV_ID: 'meter_dev_id', EQUIP_TYPE: 'equip_type', POS_CODE: 'pos_code',
      MAX_LOAD: 'max_load', MIN_LOAD: 'min_load', AVG_LOAD: 'avg_load', LOAD_FACTOR: 'load_factor',
      QUALITY_CODE: 'quality_code',
    },
    timeFieldCode: 'DATA_DATE', regionFieldCode: 'REGION_CODE', organizationFieldCode: 'ORGANIZATION_CODE',
    pointFieldCode: 'CONS_NO', valueFieldCode: 'MAX_LOAD',
    defaultFields: ['DATA_DATE', 'CONS_NO', 'MAX_LOAD', 'MIN_LOAD', 'AVG_LOAD'],
    maskFields: ['CONS_NO', 'METER_DEV_ID', 'POS_CODE'],
    scales: {},
  },
}

function dataItems(resourceCode) {
  return measurementDemoSpecs[resourceCode].fields.map((field) => {
    const {
      securityLevel,
      sensitivityType,
      tags,
      identifierFlag,
      quasiIdentifierFlag,
      desensitizationMode,
      ...dataItem
    } = field
    return dataItem
  })
}

function securityFieldRows(policyCode, resourceCode) {
  return measurementDemoSpecs[resourceCode].fields.map((field, index) => ({
    policy_code: policyCode,
    resource_code: resourceCode,
    seq: index + 1,
    field_code: field.englishName,
    field_name: field.fieldName,
    data_type: field.fieldType,
    description: field.description,
    information_category: resourceCode === 'GRID-METER-SEC-001' ? '用户侧量测' : '电网运行量测',
    classification_level: field.securityLevel === '5级' ? '核心运行' : field.securityLevel === '4级' ? '重要运行' : '运行明细',
    security_level: field.securityLevel,
    important_field_flag: true,
    field_tags: field.tags,
    required_desensitization: Boolean(field.desensitizationMode),
    output_allowed: true,
  }))
}

function lineage(resourceCode, resourceName, sourceSystem, sourceTable, ownerName) {
  return {
    nodes: [
      { id: `source-${resourceCode}`, name: sourceSystem, nodeType: 'data_source', layer: '采集源', ownerName, tableCount: 1, tables: [{ tableName: sourceTable, description: '源端采集表', rawLayer: 'source' }] },
      { id: resourceCode, name: resourceName, nodeType: 'warehouse_resource', resourceCode, layer: 'DWD', ownerName, tableCount: 1, tables: [{ tableName: sourceTable, description: '安全管控基准表', rawLayer: 'DWD' }] },
      { id: 'api-secure-share', name: '受控共享 API', nodeType: 'data_api', resourceCode: 'API-SECURE-SHARE', layer: '服务层', ownerName: '调控中心', tableCount: 0, tables: [] },
    ],
    edges: [
      { fromId: `source-${resourceCode}`, fromName: sourceSystem, toId: resourceCode, toName: resourceName },
      { fromId: resourceCode, fromName: resourceName, toId: 'api-secure-share', toName: '受控共享 API' },
    ],
    upstream: [],
    downstream: [],
  }
}

function sourceTableProfile(sourceTable, sourceSystem) {
  return {
    baseline_table: sourceTable,
    tables: [
      {
        table_name: sourceTable,
        source_system: sourceSystem,
        fresh_field_name: 'DATA_TIME',
        is_baseline: true,
        layer: 'DWD',
      },
    ],
  }
}

function statBaseProfile(sourceTable) {
  return {
    base_table_name: sourceTable,
    fresh_field_name: 'DATA_TIME',
    business_time_stale_threshold_days: 1,
  }
}

function statBaseArchiveProfile(sourceTable, archive) {
  return {
    base_table_name: sourceTable,
    fresh_field_name: 'DATA_TIME',
    business_time_field: 'DATA_TIME',
    business_time_stale_threshold_days: 1,
    field_map: archive.fieldMap,
  }
}

function ingestValidationProfile({ required = [], numericRanges = {}, duplicateKeys = [], samplingRate = 100 } = {}) {
  return {
    inheritSourceRules: false,
    samplingOverride: true,
    samplingEnabled: true,
    samplingRate,
    requiredFields: required,
    numericRanges,
    duplicateKeys,
    integrityMode: 'disabled',
  }
}

const v31IngestValidation = {
  'GRID-LVF-VOLT-001': { required: ['DATA_TIME', 'REGION_CODE', 'PSR_ID', 'MEASURE_TYPE', 'VOLTAGE', 'QUALITY_CODE'], numericRanges: { VOLTAGE: [0, 1000] }, duplicateKeys: ['DATA_TIME', 'PSR_ID', 'MEASURE_TYPE'] },
  'GRID-LVF-CURR-002': { required: ['DATA_TIME', 'REGION_CODE', 'PSR_ID', 'MEASURE_TYPE', 'CURRENT', 'QUALITY_CODE'], numericRanges: { CURRENT: [0, 5000] }, duplicateKeys: ['DATA_TIME', 'PSR_ID', 'MEASURE_TYPE'] },
  'CUST-DAILY-ENERGY-003': { required: ['DATA_DATE', 'CONS_NO', 'PAP_R', 'QUALITY_CODE'], numericRanges: { PAP_R: [0, 1000000000] }, duplicateKeys: ['DATA_DATE', 'CONS_NO'] },
  'GRID-LVF-POWER-004': { required: ['DATA_TIME', 'REGION_CODE', 'PSR_ID', 'P_ACTIVE', 'QUALITY_CODE'], numericRanges: { P_ACTIVE: [-10000, 10000] }, duplicateKeys: ['DATA_TIME', 'PSR_ID'] },
  'CUST-POWER-CURVE-005': { required: ['DATA_TIME', 'CONS_NO', 'MEASURE_TYPE', 'VALUE', 'QUALITY_CODE'], numericRanges: { VALUE: [0, 100000] }, duplicateKeys: ['DATA_TIME', 'CONS_NO', 'MEASURE_TYPE'] },
  'GRID-LVF-PF-006': { required: ['DATA_TIME', 'REGION_CODE', 'PSR_ID', 'POWER_FACTOR', 'QUALITY_CODE'], numericRanges: { POWER_FACTOR: [0, 1] }, duplicateKeys: ['DATA_TIME', 'PSR_ID'] },
  'CUST-OUTAGE-EVENT-007': { required: ['EVENT_TIME', 'CONS_NO', 'EVENT_TYPE', 'QUALITY_CODE'], numericRanges: { OUTAGE_DURATION_MIN: [0, 100000] }, duplicateKeys: ['EVENT_TIME', 'CONS_NO'] },
  'GRID-SWITCH-EVENT-008': { required: ['EVENT_TIME', 'PSR_ID', 'EVENT_TYPE', 'QUALITY_CODE'], numericRanges: {}, duplicateKeys: ['EVENT_TIME', 'PSR_ID'] },
  'GRID-NO-RELAD-009': { required: ['DATA_TIME', 'MEASURE_TYPE', 'VALUE', 'QUALITY_CODE'], numericRanges: { VALUE: [0, 100000] }, duplicateKeys: [] },
  'GRID-TMR-ENERGY-010': { required: ['DATA_TIME', 'PSR_ID', 'ENERGY_TYPE', 'READ_VALUE', 'QUALITY_CODE'], numericRanges: { READ_VALUE: [0, 1000000000] }, duplicateKeys: ['DATA_TIME', 'PSR_ID'] },
  'GRID-LVF-PHASE-011': { required: ['DATA_TIME', 'REGION_CODE', 'PSR_ID', 'MEASURE_TYPE', 'PHASE_ANGLE', 'QUALITY_CODE'], numericRanges: { PHASE_ANGLE: [-180, 180] }, duplicateKeys: ['DATA_TIME', 'PSR_ID', 'MEASURE_TYPE'] },
  'CUST-HV-DAILY-INFO-012': { required: ['DATA_DATE', 'CONS_NO', 'PAP_R', 'QUALITY_CODE'], numericRanges: { PAP_R: [0, 1000000000] }, duplicateKeys: ['DATA_DATE', 'CONS_NO'] },
  'CUST-LV-DAILY-INFO-013': { required: ['DATA_DATE', 'CONS_NO', 'PAP_R', 'QUALITY_CODE'], numericRanges: { PAP_R: [0, 1000000000] }, duplicateKeys: ['DATA_DATE', 'CONS_NO'] },
  'CUST-HV-DAILY-LOAD-014': { required: ['DATA_DATE', 'CONS_NO', 'MAX_LOAD', 'QUALITY_CODE'], numericRanges: { MAX_LOAD: [0, 1000000], MIN_LOAD: [0, 1000000], AVG_LOAD: [0, 1000000], LOAD_FACTOR: [0, 1] }, duplicateKeys: ['DATA_DATE', 'CONS_NO'] },
}

function v31StatBase(sourceTable, resourceCode) {
  return {
    ...statBaseArchiveProfile(sourceTable, v31Archives[resourceCode]),
    ingest_validation: ingestValidationProfile(v31IngestValidation[resourceCode] || {}),
  }
}

function latestPreviewProfile(resourceCode, sourceTable, sourceSystem) {
  const spec = measurementDemoSpecs[resourceCode]
  const columns = spec.fields.map((field) => field.englishName)
  const columnLabels = Object.fromEntries(
    spec.fields.map((field) => [field.englishName, field.unit ? `${field.fieldName}（${field.unit}）` : field.fieldName]),
  )
  const rows = spec.preview.rows.map((values) => Object.fromEntries(
    columns.map((column, index) => [column, values[index]]),
  ))
  return {
    table_name: sourceTable,
    sort_field: 'DATA_TIME',
    limit: rows.length,
    columns,
    column_labels: columnLabels,
    rows,
    generated_at: now,
    error: null,
    is_baseline: true,
    business_time_field_name: 'DATA_TIME',
    business_time_field_description: '量测数据采集时间',
    description: '需求文档对应的电力量测演示数据，仅用于安全管控原型验证。',
    layer: 'DWD',
    source_system: sourceSystem,
    related_table_previews: [],
    related_table_preview_count: 0,
    all_preview_table_names: [sourceTable],
  }
}

function accessEventProfiles(blueprint, index) {
  const hour = 9 - index
  const hourText = String(Math.max(hour, 5)).padStart(2, '0')
  const ownerUser = blueprint.ownerDept === '计量中心'
    ? '计量分析员'
    : blueprint.ownerDept === '设备管理部'
      ? '设备运检员'
      : blueprint.ownerDept === '配电自动化中心'
        ? '配网值班员'
        : '调控值班员'
  const common = {
    userRole: '业务分析岗',
    department: blueprint.ownerDept,
    email: '',
    phone: '',
    objectName: blueprint.resourceName,
    objectType: '量测数据资源',
    objectId: blueprint.resourceCode,
    policyName: blueprint.policyName,
    policyId: blueprint.policyCode,
    device: '安全工作站',
    os: '国产桌面系统',
    client: '安全数据门户',
    beforeSnapshot: { accessScope: blueprint.accessScope, shareScope: blueprint.shareScope, approvalMode: blueprint.approvalMode },
    relatedResourceEvents: ['安全档案关联', '字段级策略校验', '访问范围判断'],
  }
  return [
    {
      ...common,
      id: `AUD-${blueprint.policyCode}-INGEST`,
      time: `2026-07-10 ${hourText}:05:12`,
      userName: '统一接入服务',
      userId: 'SVC-INGEST-001',
      userRole: '系统服务',
      operationType: '数据接入',
      description: `${blueprint.resourceName}完成传输加密、完整性校验和安全标签标注。`,
      result: '成功',
      risk: '正常',
      ip: `10.20.${index + 1}.12`,
      location: '生产安全域',
      ipSource: '内网',
      sessionId: `SID-INGEST-${index + 1}`,
      requestId: `REQ-INGEST-${blueprint.resourceCode}`,
      durationMs: 38 + index * 7,
      decision: '通过',
      decisionReason: '接入来源、传输加密和完整性校验均符合规则。',
      params: { action: 'ingest', resourceCode: blueprint.resourceCode, encryptedTransport: true, integrityVerified: true },
      afterSnapshot: { decision: '通过', tagsApplied: true, integrityVerified: true },
      relatedUserEvents: ['系统服务身份校验', '接入凭据校验'],
      auditNote: '',
    },
    {
      ...common,
      id: `AUD-${blueprint.policyCode}-ACCESS`,
      time: `2026-07-10 ${hourText}:24:36`,
      userName: ownerUser,
      userId: `U-${String(index + 1).padStart(3, '0')}`,
      operationType: '数据访问',
      description: `${ownerUser}申请按授权范围查询${blueprint.resourceName}的聚合指标。`,
      result: blueprint.securityLevel === 'level_5' ? '需审批' : '成功',
      risk: blueprint.securityLevel === 'level_5' ? '中风险' : '低风险',
      ip: `10.30.${index + 1}.28`,
      location: `${blueprint.ownerDept}办公区`,
      ipSource: '内网',
      sessionId: `SID-USER-${index + 1}`,
      requestId: `REQ-ACCESS-${blueprint.resourceCode}`,
      durationMs: 64 + index * 9,
      decision: blueprint.securityLevel === 'level_5' ? '需审批' : '通过',
      decisionReason: blueprint.securityLevel === 'level_5' ? '访问核心运行数据，需完成双人审批。' : '用户角色、所属部门和聚合场景均在授权范围内。',
      params: { action: 'aggregate-query', resourceCode: blueprint.resourceCode, fields: measurementDemoSpecs[blueprint.resourceCode].fields.filter((field) => !field.identifierFlag).slice(0, 3).map((field) => field.englishName), plaintextExport: false },
      afterSnapshot: { decision: blueprint.securityLevel === 'level_5' ? '需审批' : '通过', maskedIdentifiers: true, plaintextExport: false },
      relatedUserEvents: ['用户角色校验', '所属部门校验', '业务场景校验'],
      auditNote: blueprint.securityLevel === 'level_5' ? '等待数据责任部门审批。' : '',
    },
    {
      ...common,
      id: `AUD-${blueprint.policyCode}-DENY`,
      time: `2026-07-10 02:${String(12 + index * 3).padStart(2, '0')}:08`,
      userName: '外部协作账号',
      userId: `EXT-${String(index + 1).padStart(3, '0')}`,
      userRole: '外部协作岗',
      department: '外部协作单位',
      operationType: '异常操作',
      description: `外部账号尝试跨域导出${blueprint.resourceName}明细，已被动态访问策略拒绝。`,
      result: '被拒绝',
      risk: '高风险',
      ip: `198.51.100.${40 + index}`,
      location: '外部网络',
      ipSource: '外网',
      device: '未知设备',
      os: '未识别',
      client: '接口调用',
      sessionId: `SID-EXT-${index + 1}`,
      requestId: `REQ-DENY-${blueprint.resourceCode}`,
      durationMs: 21 + index * 4,
      decision: '拒绝',
      decisionReason: '命中非工作时段、外部网络、跨域明细导出和角色越权组合规则。',
      params: { action: 'detail-export', resourceCode: blueprint.resourceCode, requestedScope: 'cross-domain-detail', sourceNetwork: 'external' },
      afterSnapshot: { decision: '拒绝', blocked: true, alertRaised: true },
      relatedUserEvents: ['异常时段访问', '外部网络访问', '角色越权识别'],
      relatedResourceEvents: ['禁止导出规则', '跨域访问规则', '高敏字段保护'],
      auditNote: '已阻断并进入日志链路审计队列。',
    },
  ]
}

async function seedBusinessData(ref) {
  const common = {
    business_attribute_categorization_id: ref.businessAttr,
    region_category_id: ref.province,
    sharing_attribute_id: ref.dictIds['sharing_attribute:conditional'],
    supply_method_id: ref.dictIds['data_supply_method:api'],
    data_resource_type_id: ref.dictIds['data_resource_type:table'],
    published_at: '2026-06-01',
    data_updated_at: '2026-07-10 10:00:00',
    time_range: '2026年至今',
    region_coverage: '省公司',
    contact_info: 'security-ops@example.com',
    resource_tags: ['量测数据', '安全管控', '分类分级'],
    usage_count: 42,
  }
  function demoMonitor(resourceCode, ingestRate, todayRows, latencyMs, blockedCount = 0) {
    return {
      demo: true,
      resourceCount: 1,
      fieldCount: measurementDemoSpecs[resourceCode].fields.length,
      sensitiveFieldCount: measurementDemoSpecs[resourceCode].fields.filter((field) => ['4级', '5级'].includes(field.securityLevel)).length,
      ingestRate,
      todayRows,
      checksumPassRate: blockedCount > 0 ? 99.98 : 100,
      encryptionRate: 100,
      labelRate: 100,
      latencyMs,
      blockedCount,
      lastHeartbeat: '2026-07-10T10:00:00+08:00',
      issue: blockedCount > 0 ? `完整性校验已拦截 ${blockedCount} 条异常记录` : '运行正常',
    }
  }
  const sourceBlueprints = [
    {
      sourceCode: 'SRC-YC20-001', sourceName: '用采2.0量测数据源', sourceType: 'yongcai20',
      ownerDept: '计量中心', policyCode: 'POL-METER-001', resourceCode: 'GRID-METER-SEC-001',
      description: '用采 2.0 用户侧量测、日冻结与停复电事件的统一安全接入演示配置。',
      host: 'measurement-db', port: '5432', databaseName: 'measurement_data',
      connectionOptions: { dialect: 'postgresql', readOnly: true },
      tags: ['用采2.0', '用户量测', '敏感数据'], sampleRate: 10, timeoutSeconds: 30, failureThreshold: 3,
      monitor: demoMonitor('GRID-METER-SEC-001', 4800, 14820000, 780, 2),
    },
    {
      sourceCode: 'SRC-DISPATCH-001', sourceName: '调控云量测数据源', sourceType: 'dispatch_cloud',
      ownerDept: '调控中心', policyCode: 'POL-DISPATCH-002', resourceCode: 'GRID-DISPATCH-SEC-002',
      description: '调控云实时运行量测的统一安全接入演示配置。',
      host: 'dispatch-demo.internal', port: '1521', databaseName: 'dispatch_realtime',
      connectionOptions: { channel: 'message_queue' },
      tags: ['调控云', '实时运行', '高敏数据源'], sampleRate: 100, timeoutSeconds: 20, failureThreshold: 1,
      monitor: demoMonitor('GRID-DISPATCH-SEC-002', 18500, 58600000, 86),
    },
    {
      sourceCode: 'SRC-EMS-001', sourceName: '调度自动化量测数据源', sourceType: 'ems',
      ownerDept: '调控中心', policyCode: '', resourceCode: 'GRID-LVF-VOLT-001',
      description: '低频电压、电流、功率与功率因数曲线的统一安全接入演示配置（E 文件通道）。',
      host: 'measurement-db', port: '5432', databaseName: 'measurement_data',
      connectionOptions: { dialect: 'postgresql', readOnly: true, channel: 'file_e' },
      tags: ['调度自动化', '主网量测', 'E 文件通道'], sampleRate: 100, timeoutSeconds: 30, failureThreshold: 2,
      monitor: demoMonitor('GRID-LVF-VOLT-001', 9216, 29859840, 132),
    },
    {
      sourceCode: 'SRC-STATION-001', sourceName: '新一代集控站量测数据源', sourceType: 'file_e',
      ownerDept: '调控中心', policyCode: '', resourceCode: '',
      description: '新一代集控站主网遥测的 E 文件接入档案（演示占位，不绑定物理演示表）。',
      host: 'station-demo.internal', port: null, databaseName: 'station_measurement',
      connectionOptions: { channel: 'file_e', file_pattern: 'station_telemetry_*.e' },
      tags: ['集控站', 'E 文件通道'], sampleRate: 100, timeoutSeconds: 30, failureThreshold: 2,
      monitor: null,
    },
    {
      sourceCode: 'SRC-TMR-001', sourceName: '电能量计量量测数据源', sourceType: 'tmr',
      ownerDept: '计量中心', policyCode: '', resourceCode: 'GRID-TMR-ENERGY-010',
      description: '主网电能示值的统一安全接入演示配置（E 文件通道）。',
      host: 'measurement-db', port: '5432', databaseName: 'measurement_data',
      connectionOptions: { dialect: 'postgresql', readOnly: true, channel: 'file_e' },
      tags: ['电能量计量', '电能示值', 'E 文件通道'], sampleRate: 100, timeoutSeconds: 30, failureThreshold: 2,
      monitor: demoMonitor('GRID-TMR-ENERGY-010', 512, 1671168, 96),
    },
    {
      sourceCode: 'SRC-DISTRIBUTION-001', sourceName: '配电自动化量测数据源', sourceType: 'distribution_automation',
      ownerDept: '配电自动化中心', policyCode: '', resourceCode: 'GRID-SWITCH-EVENT-008',
      description: '配网遥测与开关事件的统一安全接入演示配置（消息服务通道）。',
      host: 'measurement-db', port: '5432', databaseName: 'measurement_data',
      connectionOptions: { dialect: 'postgresql', readOnly: true, channel: 'message_queue' },
      tags: ['配电自动化', '开关事件', '消息服务通道'], sampleRate: 50, timeoutSeconds: 20, failureThreshold: 2,
      monitor: demoMonitor('GRID-SWITCH-EVENT-008', 384, 1258291, 118, 1),
    },
    {
      sourceCode: 'SRC-DCLOUD-001', sourceName: '配电云主站量测数据源', sourceType: 'message_queue',
      ownerDept: '配电自动化中心', policyCode: '', resourceCode: '',
      description: '配电云主站台区遥测与停复电信号的消息服务接入档案（演示占位）。',
      host: 'dcloud-demo.internal', port: null, databaseName: 'distribution_cloud',
      connectionOptions: { channel: 'message_queue', topic: 'psr-distribution-cloud-measurement' },
      tags: ['配电云主站', '消息服务通道'], sampleRate: 100, timeoutSeconds: 20, failureThreshold: 2,
      monitor: null,
    },
    {
      sourceCode: 'SRC-CABLE-001', sourceName: '输变电状态监测量测数据源', sourceType: 'cable_monitor',
      ownerDept: '设备管理部', policyCode: '', resourceCode: '',
      description: '油色谱与局放告警等状态监测量测的接入档案（演示占位）。',
      host: 'measurement-db', port: '5432', databaseName: 'measurement_data',
      connectionOptions: { dialect: 'postgresql', readOnly: true },
      tags: ['输变电状态监测', '设备状态'], sampleRate: 50, timeoutSeconds: 20, failureThreshold: 2,
      monitor: null,
    },
    {
      sourceCode: 'SRC-WEATHER-001', sourceName: '网格化气象预测量测数据源', sourceType: 'weather',
      ownerDept: '设备管理部', policyCode: '', resourceCode: '',
      description: '风速、气温、降雨与导线舞动等气象量测的接入档案（演示占位）。',
      host: 'measurement-db', port: '5432', databaseName: 'measurement_data',
      connectionOptions: { dialect: 'postgresql', readOnly: true },
      tags: ['网格化气象', '气象量测'], sampleRate: 50, timeoutSeconds: 20, failureThreshold: 2,
      monitor: null,
    },
    {
      sourceCode: 'SRC-HVCABLE-001', sourceName: '高压电缆在线监测量测数据源', sourceType: 'hvcable',
      ownerDept: '设备管理部', policyCode: '', resourceCode: '',
      description: '护层接地电流、气体与通道温湿度等电缆监测量测的接入档案（演示占位）。',
      host: 'measurement-db', port: '5432', databaseName: 'measurement_data',
      connectionOptions: { dialect: 'postgresql', readOnly: true },
      tags: ['高压电缆在线监测', '电缆状态'], sampleRate: 50, timeoutSeconds: 20, failureThreshold: 2,
      monitor: null,
    },
  ]
  const sourceIds = {}
  for (const source of sourceBlueprints) {
    sourceIds[source.sourceCode] = await upsert('security_data_sources', { source_code: source.sourceCode }, {
      source_code: source.sourceCode,
      source_name: source.sourceName,
      source_type: source.sourceType,
      connection_status: 'connected',
      owner_user_id: 1,
      owner_dept: source.ownerDept,
      description: source.description,
      host: source.host,
      port: source.port || null,
      database_name: source.databaseName,
      username: 'measurement_reader',
      secret_ref: `secret://security/source/${source.sourceCode.toLowerCase()}`,
      source_tags: source.tags,
      connection_options_json: source.connectionOptions,
      security_config_json: {
        encryptionEnabled: false,
        encryptionAlgorithm: '',
        integrityEnabled: true,
        checksumAlgorithm: 'SM3',
        samplingEnabled: source.sampleRate < 100,
        samplingRate: source.sampleRate,
        timeoutSeconds: source.timeoutSeconds,
        failureThreshold: source.failureThreshold,
      },
      last_monitor_json: source.monitor,
    })
  }

  const resources = [
    {
      ...common,
      display_seq: 10,
      resource_code: 'GRID-METER-SEC-001',
      resource_name: '用户侧十五分钟负荷曲线',
      summary: '来自用电信息采集系统的十五分钟负荷曲线，覆盖脱敏客户标识、功率和累计电量。',
      domain_category_id: ref.collectCategoryNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.meteringDept,
      update_cycle_id: ref.dictIds['update_cycle:15m'],
      source_system: '用电信息采集 2.0',
      source_table: 'DWD_METER_CURVE_15M',
      source_tablelist: sourceTableProfile('DWD_METER_CURVE_15M', '用电信息采集 2.0'),
      stat_base: statBaseProfile('DWD_METER_CURVE_15M'),
      data_volume: measurementDemoSpecs['GRID-METER-SEC-001'].recordCount,
      field_count: measurementDemoSpecs['GRID-METER-SEC-001'].fields.length,
      data_items: dataItems('GRID-METER-SEC-001'),
      data_lineage: lineage('GRID-METER-SEC-001', '用户侧十五分钟负荷曲线', '用电信息采集 2.0', 'DWD_METER_CURVE_15M', '计量中心'),
      data_source_id: sourceIds['SRC-YC20-001'],
      protection_level: 'l2',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '客户标识', '明细受控'],
    },
    {
      ...common,
      display_seq: 20,
      resource_code: 'GRID-DISPATCH-SEC-002',
      resource_name: '调度实时运行量测',
      summary: '主网厂站、电压、电流、功率和频率等秒级运行量测，按核心运行数据管控。',
      domain_category_id: ref.collectCategoryNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.dispatchDept,
      update_cycle_id: ref.dictIds['update_cycle:realtime'],
      source_system: '调控云',
      source_table: 'DWD_DISPATCH_REALTIME_MEASURE',
      source_tablelist: sourceTableProfile('DWD_DISPATCH_REALTIME_MEASURE', '调控云'),
      stat_base: statBaseProfile('DWD_DISPATCH_REALTIME_MEASURE'),
      data_volume: measurementDemoSpecs['GRID-DISPATCH-SEC-002'].recordCount,
      field_count: measurementDemoSpecs['GRID-DISPATCH-SEC-002'].fields.length,
      data_items: dataItems('GRID-DISPATCH-SEC-002'),
      data_lineage: lineage('GRID-DISPATCH-SEC-002', '调度实时运行量测', '调控云', 'DWD_DISPATCH_REALTIME_MEASURE', '调控中心'),
      data_source_id: sourceIds['SRC-DISPATCH-001'],
      protection_level: 'l1',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '主网运行', '仅聚合'],
    },
    {
      ...common,
      display_seq: 30,
      resource_code: 'GRID-LVF-VOLT-001',
      resource_name: '低频电压曲线',
      summary: '主网测点 5 分钟低频电压曲线，按设备档案与位置编码组织，明细受控。',
      domain_category_id: ref.loadCategoryNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.dispatchDept,
      update_cycle_id: ref.dictIds['update_cycle:15m'],
      source_system: '调度自动化',
      source_table: 'measurement_demo.grid_low_freq_voltage',
      source_tablelist: sourceTableProfile('measurement_demo.grid_low_freq_voltage', '调度自动化'),
      stat_base: v31StatBase('measurement_demo.grid_low_freq_voltage', 'GRID-LVF-VOLT-001'),
      data_volume: measurementDemoSpecs['GRID-LVF-VOLT-001'].recordCount,
      field_count: measurementDemoSpecs['GRID-LVF-VOLT-001'].fields.length,
      data_items: dataItems('GRID-LVF-VOLT-001'),
      data_lineage: lineage('GRID-LVF-VOLT-001', '低频电压曲线', '调度自动化', 'measurement_demo.grid_low_freq_voltage', '调控中心'),
      data_source_id: sourceIds['SRC-EMS-001'],
      protection_level: 'l2',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '主网量测', '明细受控'],
    },
    {
      ...common,
      display_seq: 40,
      resource_code: 'GRID-LVF-CURR-002',
      resource_name: '低频电流曲线',
      summary: '主网测点 5 分钟低频电流曲线，按设备档案与位置编码组织，明细受控。',
      domain_category_id: ref.loadCategoryNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.dispatchDept,
      update_cycle_id: ref.dictIds['update_cycle:15m'],
      source_system: '调度自动化',
      source_table: 'measurement_demo.grid_low_freq_current',
      source_tablelist: sourceTableProfile('measurement_demo.grid_low_freq_current', '调度自动化'),
      stat_base: v31StatBase('measurement_demo.grid_low_freq_current', 'GRID-LVF-CURR-002'),
      data_volume: measurementDemoSpecs['GRID-LVF-CURR-002'].recordCount,
      field_count: measurementDemoSpecs['GRID-LVF-CURR-002'].fields.length,
      data_items: dataItems('GRID-LVF-CURR-002'),
      data_lineage: lineage('GRID-LVF-CURR-002', '低频电流曲线', '调度自动化', 'measurement_demo.grid_low_freq_current', '调控中心'),
      data_source_id: sourceIds['SRC-EMS-001'],
      protection_level: 'l2',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '主网量测', '明细受控'],
    },
    {
      ...common,
      display_seq: 50,
      resource_code: 'CUST-DAILY-ENERGY-003',
      resource_name: '日冻结电能示值',
      summary: '用户每日冻结电能示值（费率分时），按敏感经营数据管控，默认仅密态输出。',
      domain_category_id: ref.energyCategoryNode,
      hj417_category_id: ref.customerInfo,
      provider_org_id: ref.meteringDept,
      update_cycle_id: ref.dictIds['update_cycle:daily'],
      source_system: '用电信息采集 2.0',
      source_table: 'measurement_demo.cust_daily_frozen_energy',
      source_tablelist: sourceTableProfile('measurement_demo.cust_daily_frozen_energy', '用电信息采集 2.0'),
      stat_base: v31StatBase('measurement_demo.cust_daily_frozen_energy', 'CUST-DAILY-ENERGY-003'),
      data_volume: measurementDemoSpecs['CUST-DAILY-ENERGY-003'].recordCount,
      field_count: measurementDemoSpecs['CUST-DAILY-ENERGY-003'].fields.length,
      data_items: dataItems('CUST-DAILY-ENERGY-003'),
      data_lineage: lineage('CUST-DAILY-ENERGY-003', '日冻结电能示值', '用电信息采集 2.0', 'measurement_demo.cust_daily_frozen_energy', '计量中心'),
      data_source_id: sourceIds['SRC-YC20-001'],
      protection_level: 'l3',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '用户电量', '仅密态'],
    },
    {
      ...common,
      display_seq: 60,
      resource_code: 'GRID-LVF-POWER-004',
      resource_name: '低频功率曲线',
      summary: '主网测点 5 分钟低频有功与无功功率曲线，明细受控。',
      domain_category_id: ref.loadCategoryNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.dispatchDept,
      update_cycle_id: ref.dictIds['update_cycle:15m'],
      source_system: '调度自动化',
      source_table: 'measurement_demo.grid_low_freq_power',
      source_tablelist: sourceTableProfile('measurement_demo.grid_low_freq_power', '调度自动化'),
      stat_base: v31StatBase('measurement_demo.grid_low_freq_power', 'GRID-LVF-POWER-004'),
      data_volume: measurementDemoSpecs['GRID-LVF-POWER-004'].recordCount,
      field_count: measurementDemoSpecs['GRID-LVF-POWER-004'].fields.length,
      data_items: dataItems('GRID-LVF-POWER-004'),
      data_lineage: lineage('GRID-LVF-POWER-004', '低频功率曲线', '调度自动化', 'measurement_demo.grid_low_freq_power', '调控中心'),
      data_source_id: sourceIds['SRC-EMS-001'],
      protection_level: 'l2',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '主网量测', '明细受控'],
    },
    {
      ...common,
      display_seq: 70,
      resource_code: 'CUST-POWER-CURVE-005',
      resource_name: '电能示值曲线',
      summary: '用户 A/B/C 相电压电流与功率量测曲线，按敏感数据管控，默认仅密态输出。',
      domain_category_id: ref.loadCategoryNode,
      hj417_category_id: ref.customerInfo,
      provider_org_id: ref.meteringDept,
      update_cycle_id: ref.dictIds['update_cycle:15m'],
      source_system: '用电信息采集 2.0',
      source_table: 'measurement_demo.cust_measurement_curve',
      source_tablelist: sourceTableProfile('measurement_demo.cust_measurement_curve', '用电信息采集 2.0'),
      stat_base: v31StatBase('measurement_demo.cust_measurement_curve', 'CUST-POWER-CURVE-005'),
      data_volume: measurementDemoSpecs['CUST-POWER-CURVE-005'].recordCount,
      field_count: measurementDemoSpecs['CUST-POWER-CURVE-005'].fields.length,
      data_items: dataItems('CUST-POWER-CURVE-005'),
      data_lineage: lineage('CUST-POWER-CURVE-005', '电能示值曲线', '用电信息采集 2.0', 'measurement_demo.cust_measurement_curve', '计量中心'),
      data_source_id: sourceIds['SRC-YC20-001'],
      protection_level: 'l3',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '用户负荷', '仅密态'],
    },
    {
      ...common,
      display_seq: 80,
      resource_code: 'GRID-LVF-PF-006',
      resource_name: '低频功率因数曲线',
      summary: '线路测点 5 分钟低频功率因数曲线，仅提供聚合共享。',
      domain_category_id: ref.collectCategoryNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.dispatchDept,
      update_cycle_id: ref.dictIds['update_cycle:15m'],
      source_system: '调度自动化',
      source_table: 'measurement_demo.grid_low_freq_power_factor',
      source_tablelist: sourceTableProfile('measurement_demo.grid_low_freq_power_factor', '调度自动化'),
      stat_base: v31StatBase('measurement_demo.grid_low_freq_power_factor', 'GRID-LVF-PF-006'),
      data_volume: measurementDemoSpecs['GRID-LVF-PF-006'].recordCount,
      field_count: measurementDemoSpecs['GRID-LVF-PF-006'].fields.length,
      data_items: dataItems('GRID-LVF-PF-006'),
      data_lineage: lineage('GRID-LVF-PF-006', '低频功率因数曲线', '调度自动化', 'measurement_demo.grid_low_freq_power_factor', '调控中心'),
      data_source_id: sourceIds['SRC-EMS-001'],
      protection_level: 'l1',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '电能质量', '仅聚合'],
    },
    {
      ...common,
      display_seq: 90,
      resource_code: 'CUST-OUTAGE-EVENT-007',
      resource_name: '用户停复电事件',
      summary: '用户停电与复电事件明细，按敏感数据管控，默认仅密态或聚合输出。',
      domain_category_id: ref.eventCategoryNode,
      hj417_category_id: ref.customerInfo,
      provider_org_id: ref.meteringDept,
      update_cycle_id: ref.dictIds['update_cycle:realtime'],
      source_system: '用电信息采集 2.0',
      source_table: 'measurement_demo.cust_outage_events',
      source_tablelist: sourceTableProfile('measurement_demo.cust_outage_events', '用电信息采集 2.0'),
      stat_base: v31StatBase('measurement_demo.cust_outage_events', 'CUST-OUTAGE-EVENT-007'),
      data_volume: measurementDemoSpecs['CUST-OUTAGE-EVENT-007'].recordCount,
      field_count: measurementDemoSpecs['CUST-OUTAGE-EVENT-007'].fields.length,
      data_items: dataItems('CUST-OUTAGE-EVENT-007'),
      data_lineage: lineage('CUST-OUTAGE-EVENT-007', '用户停复电事件', '用电信息采集 2.0', 'measurement_demo.cust_outage_events', '计量中心'),
      data_source_id: sourceIds['SRC-YC20-001'],
      protection_level: 'l3',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '停复电', '仅密态'],
    },
    {
      ...common,
      display_seq: 100,
      resource_code: 'GRID-SWITCH-EVENT-008',
      resource_name: '开关变位事件',
      summary: '配网开关变位、故障跳闸与事故总事件，按重要运行数据管控。',
      domain_category_id: ref.eventCategoryNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.distributionDept,
      update_cycle_id: ref.dictIds['update_cycle:realtime'],
      source_system: '配电自动化',
      source_table: 'measurement_demo.grid_switch_events',
      source_tablelist: sourceTableProfile('measurement_demo.grid_switch_events', '配电自动化'),
      stat_base: v31StatBase('measurement_demo.grid_switch_events', 'GRID-SWITCH-EVENT-008'),
      data_volume: measurementDemoSpecs['GRID-SWITCH-EVENT-008'].recordCount,
      field_count: measurementDemoSpecs['GRID-SWITCH-EVENT-008'].fields.length,
      data_items: dataItems('GRID-SWITCH-EVENT-008'),
      data_lineage: lineage('GRID-SWITCH-EVENT-008', '开关变位事件', '配电自动化', 'measurement_demo.grid_switch_events', '配电自动化中心'),
      data_source_id: sourceIds['SRC-DISTRIBUTION-001'],
      protection_level: 'l2',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '开关事件', '明细受控'],
    },
    {
      ...common,
      display_seq: 110,
      resource_code: 'GRID-NO-RELAD-009',
      resource_name: '未关联量测归档',
      summary: '未与设备档案关联的量测归档，仅允许聚合或密态输出，禁止明细直取。',
      domain_category_id: ref.collectCategoryNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.meteringDept,
      update_cycle_id: ref.dictIds['update_cycle:15m'],
      source_system: '历史量测中心',
      source_table: 'measurement_demo.measurement_no_relad',
      source_tablelist: sourceTableProfile('measurement_demo.measurement_no_relad', '历史量测中心'),
      stat_base: v31StatBase('measurement_demo.measurement_no_relad', 'GRID-NO-RELAD-009'),
      data_volume: measurementDemoSpecs['GRID-NO-RELAD-009'].recordCount,
      field_count: measurementDemoSpecs['GRID-NO-RELAD-009'].fields.length,
      data_items: dataItems('GRID-NO-RELAD-009'),
      data_lineage: lineage('GRID-NO-RELAD-009', '未关联量测归档', '历史量测中心', 'measurement_demo.measurement_no_relad', '计量中心'),
      data_source_id: sourceIds['SRC-YC20-001'],
      protection_level: 'l1',
      link_status: 'unlinked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '未关联', '仅聚合'],
    },
    {
      ...common,
      display_seq: 120,
      resource_code: 'GRID-TMR-ENERGY-010',
      resource_name: '主网电能示值',
      summary: '主变、断路器、机组与线路的电能示值，按重要经营数据管控。',
      domain_category_id: ref.energyCategoryNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.meteringDept,
      update_cycle_id: ref.dictIds['update_cycle:daily'],
      source_system: '电能量计量',
      source_table: 'measurement_demo.grid_tmr_energy',
      source_tablelist: sourceTableProfile('measurement_demo.grid_tmr_energy', '电能量计量'),
      stat_base: v31StatBase('measurement_demo.grid_tmr_energy', 'GRID-TMR-ENERGY-010'),
      data_volume: measurementDemoSpecs['GRID-TMR-ENERGY-010'].recordCount,
      field_count: measurementDemoSpecs['GRID-TMR-ENERGY-010'].fields.length,
      data_items: dataItems('GRID-TMR-ENERGY-010'),
      data_lineage: lineage('GRID-TMR-ENERGY-010', '主网电能示值', '电能量计量', 'measurement_demo.grid_tmr_energy', '计量中心'),
      data_source_id: sourceIds['SRC-TMR-001'],
      protection_level: 'l2',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '电能示值', '明细受控'],
    },
    {
      ...common,
      display_seq: 130,
      resource_code: 'GRID-LVF-PHASE-011',
      resource_name: '低频日电压相位角曲线',
      summary: '主网测点低频日电压相位角曲线，按电能质量重要运行数据管控，仅提供受控聚合。',
      domain_category_id: ref.collectCategoryNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.dispatchDept,
      update_cycle_id: ref.dictIds['update_cycle:daily'],
      source_system: '调控云',
      source_table: 'measurement_demo.grid_low_freq_phase_angle',
      source_tablelist: sourceTableProfile('measurement_demo.grid_low_freq_phase_angle', '调控云'),
      stat_base: v31StatBase('measurement_demo.grid_low_freq_phase_angle', 'GRID-LVF-PHASE-011'),
      data_volume: measurementDemoSpecs['GRID-LVF-PHASE-011'].recordCount,
      field_count: measurementDemoSpecs['GRID-LVF-PHASE-011'].fields.length,
      data_items: dataItems('GRID-LVF-PHASE-011'),
      data_lineage: lineage('GRID-LVF-PHASE-011', '低频日电压相位角曲线', '调控云', 'measurement_demo.grid_low_freq_phase_angle', '调控中心'),
      data_source_id: sourceIds['SRC-EMS-001'],
      protection_level: 'l2',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '电能质量', '明细受控'],
    },
    {
      ...common,
      display_seq: 140,
      resource_code: 'CUST-HV-DAILY-INFO-012',
      resource_name: '高压日用能信息',
      summary: '高压与专变用户按日冻结的正向分时电能示值，按高敏感经营数据管控。',
      domain_category_id: ref.energyCategoryNode,
      hj417_category_id: ref.customerInfo,
      provider_org_id: ref.meteringDept,
      update_cycle_id: ref.dictIds['update_cycle:daily'],
      source_system: '用电信息采集 2.0',
      source_table: 'measurement_demo.cust_hv_daily_info',
      source_tablelist: sourceTableProfile('measurement_demo.cust_hv_daily_info', '用电信息采集 2.0'),
      stat_base: v31StatBase('measurement_demo.cust_hv_daily_info', 'CUST-HV-DAILY-INFO-012'),
      data_volume: measurementDemoSpecs['CUST-HV-DAILY-INFO-012'].recordCount,
      field_count: measurementDemoSpecs['CUST-HV-DAILY-INFO-012'].fields.length,
      data_items: dataItems('CUST-HV-DAILY-INFO-012'),
      data_lineage: lineage('CUST-HV-DAILY-INFO-012', '高压日用能信息', '用电信息采集 2.0', 'measurement_demo.cust_hv_daily_info', '计量中心'),
      data_source_id: sourceIds['SRC-YC20-001'],
      protection_level: 'l3',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '用户电量', '仅密态'],
    },
    {
      ...common,
      display_seq: 150,
      resource_code: 'CUST-LV-DAILY-INFO-013',
      resource_name: '低压日用能信息',
      summary: '低压用户、分布式光伏与充电桩按日冻结的电能示值，按高敏感经营数据管控。',
      domain_category_id: ref.energyCategoryNode,
      hj417_category_id: ref.customerInfo,
      provider_org_id: ref.meteringDept,
      update_cycle_id: ref.dictIds['update_cycle:daily'],
      source_system: '用电信息采集 2.0',
      source_table: 'measurement_demo.cust_lv_daily_info',
      source_tablelist: sourceTableProfile('measurement_demo.cust_lv_daily_info', '用电信息采集 2.0'),
      stat_base: v31StatBase('measurement_demo.cust_lv_daily_info', 'CUST-LV-DAILY-INFO-013'),
      data_volume: measurementDemoSpecs['CUST-LV-DAILY-INFO-013'].recordCount,
      field_count: measurementDemoSpecs['CUST-LV-DAILY-INFO-013'].fields.length,
      data_items: dataItems('CUST-LV-DAILY-INFO-013'),
      data_lineage: lineage('CUST-LV-DAILY-INFO-013', '低压日用能信息', '用电信息采集 2.0', 'measurement_demo.cust_lv_daily_info', '计量中心'),
      data_source_id: sourceIds['SRC-YC20-001'],
      protection_level: 'l3',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '用户电量', '仅密态'],
    },
    {
      ...common,
      display_seq: 160,
      resource_code: 'CUST-HV-DAILY-LOAD-014',
      resource_name: '高压日负荷',
      summary: '高压用户日最大、最小与平均负荷及日负荷率，按高敏感运行数据管控。',
      domain_category_id: ref.loadCategoryNode,
      hj417_category_id: ref.customerInfo,
      provider_org_id: ref.meteringDept,
      update_cycle_id: ref.dictIds['update_cycle:daily'],
      source_system: '用电信息采集 2.0',
      source_table: 'measurement_demo.cust_hv_daily_load',
      source_tablelist: sourceTableProfile('measurement_demo.cust_hv_daily_load', '用电信息采集 2.0'),
      stat_base: v31StatBase('measurement_demo.cust_hv_daily_load', 'CUST-HV-DAILY-LOAD-014'),
      data_volume: measurementDemoSpecs['CUST-HV-DAILY-LOAD-014'].recordCount,
      field_count: measurementDemoSpecs['CUST-HV-DAILY-LOAD-014'].fields.length,
      data_items: dataItems('CUST-HV-DAILY-LOAD-014'),
      data_lineage: lineage('CUST-HV-DAILY-LOAD-014', '高压日负荷', '用电信息采集 2.0', 'measurement_demo.cust_hv_daily_load', '计量中心'),
      data_source_id: sourceIds['SRC-YC20-001'],
      protection_level: 'l3',
      link_status: 'linked',
      resource_tags: ['量测数据', '安全管控', '分类分级', '用户负荷', '仅密态'],
    },
  ]

  // 数据申请热度对齐客户口径（申请次数）
  const customerHeatMap = {
    'GRID-LVF-VOLT-001': 22,
    'GRID-LVF-CURR-002': 20,
    'CUST-DAILY-ENERGY-003': 18,
    'GRID-LVF-POWER-004': 18,
    'CUST-POWER-CURVE-005': 14,
    'GRID-LVF-PF-006': 12,
    'GRID-LVF-PHASE-011': 9,
    'CUST-HV-DAILY-INFO-012': 9,
    'CUST-LV-DAILY-INFO-013': 8,
    'CUST-HV-DAILY-LOAD-014': 7,
    'GRID-TMR-ENERGY-010': 7,
    'CUST-OUTAGE-EVENT-007': 6,
    'GRID-DISPATCH-SEC-002': 5,
    'GRID-SWITCH-EVENT-008': 5,
    'GRID-METER-SEC-001': 4,
    'GRID-NO-RELAD-009': 2,
  }
  for (const resource of resources) {
    if (customerHeatMap[resource.resource_code]) resource.usage_count = customerHeatMap[resource.resource_code]
  }

  const resourceIds = {}
  for (const resource of resources) {
    resourceIds[resource.resource_code] = await upsert('eco_data_resources', { resource_code: resource.resource_code }, resource)
  }

  const policyBlueprints = [
    {
      resourceCode: 'GRID-METER-SEC-001', policyCode: 'POL-METER-001', policyName: '用户侧量测曲线受控共享策略',
      resourceName: '用户侧十五分钟负荷曲线', securityCategoryId: ref.sensitiveSecurityCategory, securityLevel: 'level_3', subjectType: 'customer',
      ownerDept: '计量中心', accessScope: 'internal-controlled', approvalMode: 'workflow', desensitizationMode: 'tokenize', shareScope: 'conditional',
      assessmentBasis: '含脱敏客户标识、设备标识和用电曲线，按敏感量测数据管控。', riskNotes: '导出和跨域共享前必须审批，客户与设备标识只返回脱敏值。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '客户标识', '负荷曲线'],
    },
    {
      resourceCode: 'GRID-DISPATCH-SEC-002', policyCode: 'POL-DISPATCH-002', policyName: '调度实时量测最小授权策略',
      resourceName: '调度实时运行量测', securityCategoryId: ref.operationSecurityCategory, securityLevel: 'level_5', subjectType: 'operation',
      ownerDept: '调控中心', accessScope: 'production-zone', approvalMode: 'dual-approval', desensitizationMode: 'aggregate-only', shareScope: 'deny-external',
      assessmentBasis: '涉及主网实时运行状态和厂站拓扑，按核心运行数据管控。', riskNotes: '不提供跨域明细，仅允许授权场景使用受控聚合结果。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '主网运行', '实时量测'],
    },
    {
      resourceCode: 'GRID-LVF-VOLT-001', policyCode: 'POL-LVF-VOLT-001', policyName: '低频电压曲线受控策略',
      resourceName: '低频电压曲线', securityCategoryId: ref.operationSecurityCategory, securityLevel: 'level_4', subjectType: 'operation',
      ownerDept: '调控中心', accessScope: 'internal-controlled', approvalMode: 'workflow', desensitizationMode: 'aggregate-only', shareScope: 'conditional',
      assessmentBasis: '含设备档案、位置编码与低频电压明细，按重要运行数据管控（l2 明细受控）。', riskNotes: '设备标识默认脱敏，跨域场景仅提供受控聚合。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '主网量测', '低频曲线'],
    },
    {
      resourceCode: 'GRID-LVF-CURR-002', policyCode: 'POL-LVF-CURR-002', policyName: '低频电流曲线受控策略',
      resourceName: '低频电流曲线', securityCategoryId: ref.operationSecurityCategory, securityLevel: 'level_4', subjectType: 'operation',
      ownerDept: '调控中心', accessScope: 'internal-controlled', approvalMode: 'workflow', desensitizationMode: 'aggregate-only', shareScope: 'conditional',
      assessmentBasis: '含设备档案、位置编码与低频电流明细，按重要运行数据管控（l2 明细受控）。', riskNotes: '设备标识默认脱敏，跨域场景仅提供受控聚合。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '主网量测', '低频曲线'],
    },
    {
      resourceCode: 'CUST-DAILY-ENERGY-003', policyCode: 'POL-CUST-DAILY-003', policyName: '日冻结电能示值密态策略',
      resourceName: '日冻结电能示值', securityCategoryId: ref.sensitiveSecurityCategory, securityLevel: 'level_5', subjectType: 'customer',
      ownerDept: '计量中心', accessScope: 'cross-domain-controlled', approvalMode: 'dual-approval', desensitizationMode: 'aggregate-only', shareScope: 'deny-external',
      assessmentBasis: '含用户标识与分时电能示值，按高敏感经营数据管控（l3 仅密态）。', riskNotes: '默认仅返回密态或聚合结果，禁止导出用户级明细。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '用户电量', '仅密态'],
    },
    {
      resourceCode: 'GRID-LVF-POWER-004', policyCode: 'POL-LVF-POWER-004', policyName: '低频功率曲线受控策略',
      resourceName: '低频功率曲线', securityCategoryId: ref.operationSecurityCategory, securityLevel: 'level_4', subjectType: 'operation',
      ownerDept: '调控中心', accessScope: 'internal-controlled', approvalMode: 'workflow', desensitizationMode: 'aggregate-only', shareScope: 'conditional',
      assessmentBasis: '含设备档案与低频功率明细，按重要运行数据管控（l2 明细受控）。', riskNotes: '设备标识默认脱敏，跨域场景仅提供受控聚合。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '主网量测', '低频曲线'],
    },
    {
      resourceCode: 'CUST-POWER-CURVE-005', policyCode: 'POL-CUST-CURVE-005', policyName: '电能示值曲线密态策略',
      resourceName: '电能示值曲线', securityCategoryId: ref.sensitiveSecurityCategory, securityLevel: 'level_5', subjectType: 'customer',
      ownerDept: '计量中心', accessScope: 'cross-domain-controlled', approvalMode: 'dual-approval', desensitizationMode: 'aggregate-only', shareScope: 'deny-external',
      assessmentBasis: '含用户标识与三相电压电流明细，按高敏感运行数据管控（l3 仅密态）。', riskNotes: '默认仅返回密态或聚合结果，禁止导出用户级明细。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '用户负荷', '仅密态'],
    },
    {
      resourceCode: 'GRID-LVF-PF-006', policyCode: 'POL-LVF-PF-006', policyName: '低频功率因数曲线共享策略',
      resourceName: '低频功率因数曲线', securityCategoryId: ref.operationSecurityCategory, securityLevel: 'level_3', subjectType: 'operation',
      ownerDept: '调控中心', accessScope: 'internal-share', approvalMode: 'workflow', desensitizationMode: 'none', shareScope: 'conditional',
      assessmentBasis: '功率因数属电能质量统计类指标，按普通共享管控（l1 仅聚合）。', riskNotes: '默认仅提供聚合结果，不开放测点级明细。',
      tags: ['重要数据', '需脱敏', '需审批', '禁止导出', '电能质量', '仅聚合'],
    },
    {
      resourceCode: 'CUST-OUTAGE-EVENT-007', policyCode: 'POL-CUST-OUTAGE-007', policyName: '用户停复电事件密态策略',
      resourceName: '用户停复电事件', securityCategoryId: ref.sensitiveSecurityCategory, securityLevel: 'level_4', subjectType: 'customer',
      ownerDept: '计量中心', accessScope: 'cross-domain-controlled', approvalMode: 'dual-approval', desensitizationMode: 'aggregate-only', shareScope: 'deny-external',
      assessmentBasis: '含用户标识与停复电明细，按敏感运行数据管控（l3 仅密态）。', riskNotes: '用户标识默认脱敏，跨域场景仅提供聚合统计。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '停复电', '仅密态'],
    },
    {
      resourceCode: 'GRID-SWITCH-EVENT-008', policyCode: 'POL-GRID-SWITCH-008', policyName: '开关变位事件受控策略',
      resourceName: '开关变位事件', securityCategoryId: ref.operationSecurityCategory, securityLevel: 'level_4', subjectType: 'operation',
      ownerDept: '配电自动化中心', accessScope: 'internal-controlled', approvalMode: 'workflow', desensitizationMode: 'mask', shareScope: 'conditional',
      assessmentBasis: '含设备档案与开关事件明细，按重要运行数据管控（l2 明细受控）。', riskNotes: '设备标识默认脱敏，消息推送按主题授权。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '开关事件', '消息服务'],
    },
    {
      resourceCode: 'GRID-NO-RELAD-009', policyCode: 'POL-GRID-NORELAD-009', policyName: '未关联量测归档聚合策略',
      resourceName: '未关联量测归档', securityCategoryId: ref.operationSecurityCategory, securityLevel: 'level_2', subjectType: 'operation',
      ownerDept: '计量中心', accessScope: 'internal-share', approvalMode: 'workflow', desensitizationMode: 'aggregate-only', shareScope: 'internal',
      assessmentBasis: '未与设备档案关联，仅允许聚合或密态输出（l1 仅聚合，禁止明细直取）。', riskNotes: '未关联资源不得返回明细，防止绕过设备档案授权。',
      tags: ['重要数据', '需脱敏', '需审批', '禁止导出', '未关联', '仅聚合'],
    },
    {
      resourceCode: 'GRID-TMR-ENERGY-010', policyCode: 'POL-GRID-TMR-010', policyName: '主网电能示值受控策略',
      resourceName: '主网电能示值', securityCategoryId: ref.operationSecurityCategory, securityLevel: 'level_4', subjectType: 'device',
      ownerDept: '计量中心', accessScope: 'internal-controlled', approvalMode: 'workflow', desensitizationMode: 'aggregate-only', shareScope: 'conditional',
      assessmentBasis: '含设备档案与结算类电能示值，按重要经营数据管控（l2 明细受控）。', riskNotes: '设备标识默认脱敏，跨域场景仅提供受控聚合。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '电能示值', '结算数据'],
    },
    {
      resourceCode: 'GRID-LVF-PHASE-011', policyCode: 'POL-LVF-PHASE-011', policyName: '低频相位角曲线受控策略',
      resourceName: '低频日电压相位角曲线', securityCategoryId: ref.operationSecurityCategory, securityLevel: 'level_3', subjectType: 'operation',
      ownerDept: '调控中心', accessScope: 'internal-share', approvalMode: 'workflow', desensitizationMode: 'aggregate-only', shareScope: 'conditional',
      assessmentBasis: '含设备档案与低频相位角明细，按电能质量重要运行数据管控（l2 明细受控）。', riskNotes: '设备标识默认脱敏，跨域场景仅提供受控聚合。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '主网量测', '电能质量'],
    },
    {
      resourceCode: 'CUST-HV-DAILY-INFO-012', policyCode: 'POL-CUST-HV-DAILY-012', policyName: '高压日用能信息密态策略',
      resourceName: '高压日用能信息', securityCategoryId: ref.sensitiveSecurityCategory, securityLevel: 'level_5', subjectType: 'customer',
      ownerDept: '计量中心', accessScope: 'cross-domain-controlled', approvalMode: 'dual-approval', desensitizationMode: 'aggregate-only', shareScope: 'deny-external',
      assessmentBasis: '含高压用户标识与分时电能示值，按高敏感经营数据管控（l3 仅密态）。', riskNotes: '默认仅返回密态或聚合结果，禁止导出用户级明细。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '用户电量', '仅密态'],
    },
    {
      resourceCode: 'CUST-LV-DAILY-INFO-013', policyCode: 'POL-CUST-LV-DAILY-013', policyName: '低压日用能信息密态策略',
      resourceName: '低压日用能信息', securityCategoryId: ref.sensitiveSecurityCategory, securityLevel: 'level_5', subjectType: 'customer',
      ownerDept: '计量中心', accessScope: 'cross-domain-controlled', approvalMode: 'dual-approval', desensitizationMode: 'aggregate-only', shareScope: 'deny-external',
      assessmentBasis: '含低压用户标识与分时电能示值，按高敏感经营数据管控（l3 仅密态）。', riskNotes: '默认仅返回密态或聚合结果，禁止导出用户级明细。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '用户电量', '仅密态'],
    },
    {
      resourceCode: 'CUST-HV-DAILY-LOAD-014', policyCode: 'POL-CUST-HV-LOAD-014', policyName: '高压日负荷密态策略',
      resourceName: '高压日负荷', securityCategoryId: ref.sensitiveSecurityCategory, securityLevel: 'level_5', subjectType: 'customer',
      ownerDept: '计量中心', accessScope: 'cross-domain-controlled', approvalMode: 'dual-approval', desensitizationMode: 'aggregate-only', shareScope: 'deny-external',
      assessmentBasis: '含高压用户标识与日负荷明细，按高敏感运行数据管控（l3 仅密态）。', riskNotes: '默认仅返回密态或聚合结果，禁止导出用户级明细。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '用户负荷', '仅密态'],
    },
  ]
  const policies = policyBlueprints.map((blueprint, index) => {
    const fieldRows = securityFieldRows(blueprint.policyCode, blueprint.resourceCode)
    return {
      resource_id: resourceIds[blueprint.resourceCode],
      security_category_id: blueprint.securityCategoryId,
      security_level_id: ref.dictIds[`security_level:${blueprint.securityLevel}`],
      data_subject_type_id: ref.dictIds[`data_subject_type:${blueprint.subjectType}`],
      security_owner_user_id: 1,
      policy_code: blueprint.policyCode,
      policy_name: blueprint.policyName,
      policy_source: '量测数据安全管控组件设计',
      policy_status: 'effective',
      security_profile_status: 'effective',
      security_review_status: 'reviewed',
      important_data_flag: true,
      core_control_flag: true,
      share_scope: blueprint.shareScope,
      external_share_allowed: false,
      open_allowed: false,
      desensitization_required: true,
      approval_required: true,
      security_owner_dept: blueprint.ownerDept,
      assessment_basis: blueprint.assessmentBasis,
      risk_notes: blueprint.riskNotes,
      last_reviewed_at: '2026-07-01T10:00:00+08:00',
      next_review_at: '2026-10-01',
      security_tags: blueprint.tags,
      effective_from: '2026-07-01',
      effective_to: '2026-12-31',
      security_profile_json: { resourceId: String(resourceIds[blueprint.resourceCode]), resourceName: blueprint.resourceName },
      field_profiles_json: fieldRows.map(({ policy_code, resource_code, field_tags, ...field }) => ({ ...field, sensitivity_tags: field_tags })),
      field_policies_json: fieldRows.map(({ policy_code, resource_code, ...field }) => field),
      policy_detail_json: {
        demoScenario: true,
        sourceSystem: resources.find((item) => item.resource_code === blueprint.resourceCode)?.source_system,
        accessEvents: accessEventProfiles(blueprint, index),
      },
      security_review_json: { conclusion: '通过', reviewedAt: '2026-07-01T10:00:00+08:00', reviewerDept: '数据安全运营组' },
      remarks: '需求文档对应的电力量测演示安全档案',
    }
  })
  const policyIds = {}
  for (const policy of policies) {
    policyIds[policy.policy_code] = await upsert('eco_resource_security_policies', { policy_code: policy.policy_code }, policy)
  }

  const securityFields = policyBlueprints.flatMap((blueprint) => (
    securityFieldRows(blueprint.policyCode, blueprint.resourceCode)
  ))
  const fieldPolicyIds = {}
  for (const field of securityFields) {
    const { policy_code, resource_code, ...values } = field
    const fieldId = await upsert('eco_resource_security_fields', { resource_id: resourceIds[resource_code], field_code: values.field_code }, {
      ...values,
      resource_id: resourceIds[resource_code],
    })
    fieldPolicyIds[`${policy_code}:${values.field_code}`] = fieldId
  }

  const subjectData = [
    { subject_code: 'APP-INTERNAL-A', subject_name: '调度运行应用', subject_type: 'internal_app', organization_code: 'ORG-A', organization_name: '调控中心', credential_ref: 'secret://subjects/internal-a', allowed_api_codes_json: ['API-DIRECT-REGION-LOAD', 'API-DEVELOP-ACTIVE-POWER'], ip_whitelist_json: ['10.20.10.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-INTERNAL-B', subject_name: '区域统计应用', subject_type: 'internal_app', organization_code: 'ORG-B', organization_name: '数据管理中心', credential_ref: 'secret://subjects/internal-b', allowed_api_codes_json: ['API-ORCH-REGION-HOURLY'], ip_whitelist_json: ['10.20.20.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-EXTERNAL-C', subject_name: '跨域分析方', subject_type: 'external_party', organization_code: 'EXT-C', organization_name: '外部协作单位', credential_ref: 'secret://subjects/external-c', allowed_api_codes_json: ['API-ORCH-REGION-HOURLY'], ip_whitelist_json: ['172.18.10.10/32'], subject_status: 'enabled' },
    { subject_code: 'APP-ONLINE-GRID', subject_name: '网上电网应用', subject_type: 'internal_app', organization_code: 'DEV-PLAN', organization_name: '发展部', credential_ref: 'secret://subjects/online-grid', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.30.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-MARKETING-2', subject_name: '能源互联网营销应用', subject_type: 'internal_app', organization_code: 'SAFETY', organization_name: '安监部', credential_ref: 'secret://subjects/marketing-2', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.31.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-LINE-LOSS', subject_name: '一体化电量线损应用', subject_type: 'internal_app', organization_code: 'DEV-PLAN', organization_name: '发展部', credential_ref: 'secret://subjects/line-loss', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.32.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-LINE-RELATION', subject_name: '线变关系辨识应用', subject_type: 'internal_app', organization_code: 'DIGITAL', organization_name: '数字化部', credential_ref: 'secret://subjects/line-relation', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.33.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-SALES-FORECAST', subject_name: '售电量预测应用', subject_type: 'internal_app', organization_code: 'MARKETING', organization_name: '营销部', credential_ref: 'secret://subjects/sales-forecast', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.34.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-CREDIT-ELECTRIC', subject_name: '电力看信用应用', subject_type: 'internal_app', organization_code: 'DIGITAL', organization_name: '数字化部', credential_ref: 'secret://subjects/credit-electric', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.35.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-DATA-GOVERN', subject_name: '数据质量核查应用', subject_type: 'internal_app', organization_code: 'DIGITAL', organization_name: '数字化部', credential_ref: 'secret://subjects/data-govern', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.36.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-EXTERNAL-ENV', subject_name: '电力看环保对接方', subject_type: 'external_party', organization_code: 'EXT-ENV', organization_name: '省生态环境厅', credential_ref: 'secret://subjects/external-env', allowed_api_codes_json: [], ip_whitelist_json: ['198.51.100.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-DATA-TRANSFER', subject_name: '数据传输组件应用', subject_type: 'internal_app', organization_code: 'DIGITAL', organization_name: '数字化部', credential_ref: 'secret://subjects/data-transfer', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.40.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-FULL-LINK-MONITOR', subject_name: '全链路监控应用', subject_type: 'internal_app', organization_code: 'DIGITAL', organization_name: '数字化部', credential_ref: 'secret://subjects/full-link-monitor', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.41.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-SMART-CITY', subject_name: '智慧城市大脑应用', subject_type: 'internal_app', organization_code: 'DIGITAL', organization_name: '数字化部', credential_ref: 'secret://subjects/smart-city', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.42.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-MULTI-SOURCE', subject_name: '多源数据平台应用', subject_type: 'internal_app', organization_code: 'EQUIPMENT', organization_name: '设备管理部', credential_ref: 'secret://subjects/multi-source', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.43.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-DIGITAL-SUBSTATION', subject_name: '营销数字化平台应用', subject_type: 'internal_app', organization_code: 'MARKETING', organization_name: '营销部', credential_ref: 'secret://subjects/digital-substation', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.44.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-CHARGING', subject_name: '充换电运营服务应用', subject_type: 'internal_app', organization_code: 'DIGITAL', organization_name: '数字化部', credential_ref: 'secret://subjects/charging', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.45.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-NEW-ENERGY', subject_name: '新能源选址及配网承载力应用', subject_type: 'internal_app', organization_code: 'DEV-PLAN', organization_name: '发展部', credential_ref: 'secret://subjects/new-energy', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.46.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-AUDIT', subject_name: '数字化审计工具应用', subject_type: 'internal_app', organization_code: 'AUDIT', organization_name: '审计监管部', credential_ref: 'secret://subjects/audit', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.47.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-DISCIPLINE', subject_name: '纪检工作智慧平台应用', subject_type: 'internal_app', organization_code: 'DISCIPLINE', organization_name: '纪委办公室', credential_ref: 'secret://subjects/discipline', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.48.0/24'], subject_status: 'enabled' },
    { subject_code: 'APP-INTELLIGENT-DISPATCH', subject_name: '智能化供电服务指挥系统应用', subject_type: 'internal_app', organization_code: 'EQUIPMENT', organization_name: '设备管理部', credential_ref: 'secret://subjects/intelligent-dispatch', allowed_api_codes_json: [], ip_whitelist_json: ['10.20.49.0/24'], subject_status: 'enabled' },
  ]
  for (const item of subjectData) {
    await upsert('security_access_subjects', { subject_code: item.subject_code }, item)
  }

  // 流式处理引擎：确定性事件源（配电云主站消息通道，最近 30 分钟，每分钟 20 条）
  const streamingBaseTime = Date.parse('2026-07-10T10:00:00+08:00')
  const streamingMeasureSpecs = {
    '电压': { base: 220, range: 20, unit: 'kV', pointPrefix: 'PSR-DC-V' },
    '电流': { base: 300, range: 120, unit: 'A', pointPrefix: 'PSR-DC-C' },
    '有功功率': { base: 50, range: 30, unit: 'MW', pointPrefix: 'PSR-DC-P' },
  }
  let streamingSeq = 0
  for (let minute = 0; minute < 30; minute += 1) {
    for (let index = 0; index < 20; index += 1) {
      const eventTime = new Date(streamingBaseTime + minute * 60_000 + index * 3000)
      const measureTypes = Object.keys(streamingMeasureSpecs)
      const measureType = measureTypes[(minute + index) % measureTypes.length]
      const spec = streamingMeasureSpecs[measureType]
      const regionCode = index % 2 === 0 ? 'REGION-A' : 'REGION-B'
      const organizationCode = index % 2 === 0 ? 'ORG-A' : 'ORG-B'
      const psrId = `${spec.pointPrefix}${String((index % 10) + 1).padStart(2, '0')}`
      const qualityIndex = (minute * 20 + index) % 20
      const qualityCode = qualityIndex === 15 ? 'invalid' : qualityIndex === 17 ? 'suspect' : 'normal'
      const value = Number((spec.base + ((minute * 20 + index) * 7 % spec.range) + (qualityIndex === 15 ? 999 : 0)).toFixed(3))
      streamingSeq += 1
      await upsert('security_streaming_events', { event_code: `EVT-DCLOUD-${String(streamingSeq).padStart(5, '0')}` }, {
        event_code: `EVT-DCLOUD-${String(streamingSeq).padStart(5, '0')}`,
        event_time: eventTime.toISOString(),
        source_code: 'SRC-DCLOUD-001',
        region_code: regionCode,
        organization_code: organizationCode,
        psr_id: psrId,
        measure_type: measureType,
        value,
        quality_code: qualityCode,
        processed: false,
      })
    }
  }

  const defaultApiData = []
  for (const [resourceCode, archive] of Object.entries(v31Archives)) {
    const resource = resources.find((item) => item.resource_code === resourceCode)
    if (!resource) continue
    const protectionLevel = String(resource.protection_level || 'l2').toLowerCase()
    defaultApiData.push({
      api_code: `API-${resourceCode}`,
      api_name: `${resource.resource_name}查询 API`,
      access_mode: 'develop',
      http_method: 'GET',
      upstream_url: '',
      orchestrator_path: '/internal/resource-query',
      gateway_path: `/data-api/resources/${resourceCode.toLowerCase()}`,
      runtime_config_json: archive,
      protection_level: protectionLevel,
      supports_row_filter: true,
      supports_field_filter: true,
      supports_aggregate: false,
      supports_homomorphic: true,
      api_status: 'draft',
      publish_version: 0,
      publish_status: 'unpublished',
      publish_error: '',
      resource_id: resourceIds[resourceCode],
      data_source_id: resource.data_source_id,
    })
  }
  defaultApiData.push(
    {
      api_code: 'API-PUSH-SWITCH-EVENT',
      api_name: '开关变位消息推送服务',
      access_mode: 'orchestrate',
      http_method: 'POST',
      upstream_url: '',
      orchestrator_path: '/internal/push/switch-event',
      gateway_path: '/data-api/internal/push/switch-event',
      runtime_config_json: { topic: 'switch-event', resourceCode: 'GRID-SWITCH-EVENT-008', placeholder: true },
      protection_level: 'l2',
      supports_row_filter: false,
      supports_field_filter: false,
      supports_aggregate: false,
      supports_homomorphic: false,
      api_status: 'draft',
      publish_version: 0,
      publish_status: 'unpublished',
      publish_error: '路径占位：消息推送能力在后续版本实施',
      resource_id: resourceIds['GRID-SWITCH-EVENT-008'],
      data_source_id: sourceIds['SRC-DISTRIBUTION-001'],
    },
    {
      api_code: 'API-MODEL-LINE-RELATION',
      api_name: '配网线变关系辨识模型服务',
      access_mode: 'orchestrate',
      http_method: 'POST',
      upstream_url: '',
      orchestrator_path: '/internal/model/line-relation',
      gateway_path: '/data-api/internal/model/line-relation',
      runtime_config_json: { model: 'line-relation', resourceCode: 'GRID-NO-RELAD-009', placeholder: true },
      protection_level: 'l2',
      supports_row_filter: false,
      supports_field_filter: false,
      supports_aggregate: false,
      supports_homomorphic: false,
      api_status: 'draft',
      publish_version: 0,
      publish_status: 'unpublished',
      publish_error: '路径占位：模型衍生服务在后续版本实施',
      resource_id: resourceIds['GRID-NO-RELAD-009'],
      data_source_id: sourceIds['SRC-YC20-001'],
    },
  )
  for (const item of defaultApiData) {
    await upsert('security_api_resources', { api_code: item.api_code }, item)
  }

  // 数据应用（访问主体）统一：为 8 个客户业务主体建立访问策略，形成"数据应用消费数据"链路
  const customerPolicyData = [
    { subjectCode: 'APP-ONLINE-GRID', apis: [
      { apiCode: 'API-GRID-LVF-VOLT-001', policyCode: 'V3-POL-ONLINE-GRID-VOLT', policyName: '网上电网低频电压查询策略', scenario: 'online-grid-lvf-voltage', outputMode: 'masked', ip: '10.20.30.0/24' },
      { apiCode: 'API-GRID-LVF-CURR-002', policyCode: 'V3-POL-ONLINE-GRID-CURR', policyName: '网上电网低频电流查询策略', scenario: 'online-grid-lvf-current', outputMode: 'masked', ip: '10.20.30.0/24' },
      { apiCode: 'API-GRID-LVF-POWER-004', policyCode: 'V3-POL-ONLINE-GRID-PWR', policyName: '网上电网低频功率查询策略', scenario: 'online-grid-lvf-power', outputMode: 'masked', ip: '10.20.30.0/24' },
      { apiCode: 'API-GRID-LVF-PHASE-011', policyCode: 'V3-POL-ONLINE-GRID-PHASE', policyName: '网上电网低频相位角查询策略', scenario: 'online-grid-lvf-phase', outputMode: 'masked', ip: '10.20.30.0/24' },
    ] },
    { subjectCode: 'APP-MARKETING-2', apis: [
      { apiCode: 'API-CUST-DAILY-ENERGY-003', policyCode: 'V3-POL-MARKETING-2-DFRZN', policyName: '营销 2.0 日冻结电量密态策略', scenario: 'marketing-2-daily-energy', outputMode: 'encrypted', ip: '10.20.31.0/24' },
      { apiCode: 'API-CUST-POWER-CURVE-005', policyCode: 'V3-POL-MARKETING-2-CURVE', policyName: '营销 2.0 电能示值曲线密态策略', scenario: 'marketing-2-energy-curve', outputMode: 'encrypted', ip: '10.20.31.0/24' },
      { apiCode: 'API-CUST-HV-DAILY-INFO-012', policyCode: 'V3-POL-MARKETING-2-HV-DAILY', policyName: '营销 2.0 高压日用能密态策略', scenario: 'marketing-2-hv-daily-info', outputMode: 'encrypted', ip: '10.20.31.0/24' },
      { apiCode: 'API-CUST-LV-DAILY-INFO-013', policyCode: 'V3-POL-MARKETING-2-LV-DAILY', policyName: '营销 2.0 低压日用能密态策略', scenario: 'marketing-2-lv-daily-info', outputMode: 'encrypted', ip: '10.20.31.0/24' },
    ] },
    { subjectCode: 'APP-LINE-LOSS', apis: [
      { apiCode: 'API-GRID-TMR-ENERGY-010', policyCode: 'V3-POL-LINE-LOSS-TMR', policyName: '线损统计主网电量聚合策略', scenario: 'line-loss-energy-statistics', outputMode: 'aggregate', ip: '10.20.32.0/24' },
      { apiCode: 'API-CUST-DAILY-ENERGY-003', policyCode: 'V3-POL-LINE-LOSS-DFRZN', policyName: '线损统计日冻结电量聚合策略', scenario: 'line-loss-daily-energy', outputMode: 'aggregate', ip: '10.20.32.0/24' },
      { apiCode: 'API-CUST-HV-DAILY-INFO-012', policyCode: 'V3-POL-LINE-LOSS-HV-DAILY', policyName: '线损统计高压日用能聚合策略', scenario: 'line-loss-hv-daily-info', outputMode: 'aggregate', ip: '10.20.32.0/24' },
      { apiCode: 'API-CUST-LV-DAILY-INFO-013', policyCode: 'V3-POL-LINE-LOSS-LV-DAILY', policyName: '线损统计低压日用能聚合策略', scenario: 'line-loss-lv-daily-info', outputMode: 'aggregate', ip: '10.20.32.0/24' },
    ] },
    { subjectCode: 'APP-LINE-RELATION', apis: [
      { apiCode: 'API-GRID-NO-RELAD-009', policyCode: 'V3-POL-LINE-RELATION-NORELAD', policyName: '线变关系辨识未关联归档策略', scenario: 'line-relation-model', outputMode: 'aggregate', ip: '10.20.33.0/24' },
      { apiCode: 'API-GRID-SWITCH-EVENT-008', policyCode: 'V3-POL-LINE-RELATION-SWITCH', policyName: '线变关系辨识开关事件策略', scenario: 'line-relation-switch', outputMode: 'aggregate', ip: '10.20.33.0/24' },
    ] },
    { subjectCode: 'APP-SALES-FORECAST', apis: [
      { apiCode: 'API-CUST-POWER-CURVE-005', policyCode: 'V3-POL-SALES-FORECAST-CURVE', policyName: '售电量预测电能示值曲线密态策略', scenario: 'sales-forecast-energy-curve', outputMode: 'encrypted', ip: '10.20.34.0/24' },
      { apiCode: 'API-CUST-OUTAGE-EVENT-007', policyCode: 'V3-POL-SALES-FORECAST-OUTAGE', policyName: '售电量预测停复电事件密态策略', scenario: 'sales-forecast-outage', outputMode: 'encrypted', ip: '10.20.34.0/24' },
      { apiCode: 'API-CUST-HV-DAILY-LOAD-014', policyCode: 'V3-POL-SALES-FORECAST-HV-LOAD', policyName: '售电量预测高压日负荷密态策略', scenario: 'sales-forecast-hv-daily-load', outputMode: 'encrypted', ip: '10.20.34.0/24' },
    ] },
    { subjectCode: 'APP-CREDIT-ELECTRIC', apis: [
      { apiCode: 'API-CUST-DAILY-ENERGY-003', policyCode: 'V3-POL-CREDIT-ELECTRIC-DFRZN', policyName: '电力看信用日冻结密态策略', scenario: 'credit-electric-daily-energy', outputMode: 'encrypted', ip: '10.20.35.0/24' },
      { apiCode: 'API-CUST-POWER-CURVE-005', policyCode: 'V3-POL-CREDIT-ELECTRIC-CURVE', policyName: '电力看信用电能示值曲线密态策略', scenario: 'credit-electric-energy-curve', outputMode: 'encrypted', ip: '10.20.35.0/24' },
    ] },
    { subjectCode: 'APP-DATA-GOVERN', apis: [
      { apiCode: 'API-GRID-LVF-VOLT-001', policyCode: 'V3-POL-DATA-GOVERN-VOLT', policyName: '数据质量核查低频电压策略', scenario: 'data-quality-volt', outputMode: 'masked', ip: '10.20.36.0/24' },
      { apiCode: 'API-CUST-OUTAGE-EVENT-007', policyCode: 'V3-POL-DATA-GOVERN-OUTAGE', policyName: '数据质量核查停复电事件策略', scenario: 'data-quality-outage', outputMode: 'masked', ip: '10.20.36.0/24' },
    ] },
    { subjectCode: 'APP-EXTERNAL-ENV', apis: [
      { apiCode: 'API-CUST-POWER-CURVE-005', policyCode: 'V3-POL-EXTERNAL-ENV-CURVE', policyName: '电力看环保电能示值曲线密态策略', scenario: 'external-env-energy-curve', outputMode: 'encrypted', ip: '198.51.100.0/24' },
    ] },
    { subjectCode: 'APP-DATA-TRANSFER', apis: [
      { apiCode: 'API-GRID-LVF-VOLT-001', policyCode: 'V3-POL-DATA-TRANSFER-VOLT', policyName: '数据传输低频电压策略', scenario: 'data-transfer-volt', outputMode: 'masked', ip: '10.20.40.0/24' },
      { apiCode: 'API-GRID-LVF-CURR-002', policyCode: 'V3-POL-DATA-TRANSFER-CURR', policyName: '数据传输低频电流策略', scenario: 'data-transfer-current', outputMode: 'masked', ip: '10.20.40.0/24' },
      { apiCode: 'API-CUST-DAILY-ENERGY-003', policyCode: 'V3-POL-DATA-TRANSFER-DFRZN', policyName: '数据传输日冻结聚合策略', scenario: 'data-transfer-daily-energy', outputMode: 'aggregate', ip: '10.20.40.0/24' },
    ] },
    { subjectCode: 'APP-FULL-LINK-MONITOR', apis: [
      { apiCode: 'API-GRID-LVF-POWER-004', policyCode: 'V3-POL-FULL-LINK-PWR', policyName: '全链路监控低频功率策略', scenario: 'full-link-power', outputMode: 'masked', ip: '10.20.41.0/24' },
      { apiCode: 'API-GRID-SWITCH-EVENT-008', policyCode: 'V3-POL-FULL-LINK-SWITCH', policyName: '全链路监控开关事件策略', scenario: 'full-link-switch', outputMode: 'masked', ip: '10.20.41.0/24' },
    ] },
    { subjectCode: 'APP-SMART-CITY', apis: [
      { apiCode: 'API-GRID-LVF-VOLT-001', policyCode: 'V3-POL-SMART-CITY-VOLT', policyName: '智慧城市大脑低频电压聚合策略', scenario: 'smart-city-volt', outputMode: 'aggregate', ip: '10.20.42.0/24' },
      { apiCode: 'API-GRID-LVF-POWER-004', policyCode: 'V3-POL-SMART-CITY-PWR', policyName: '智慧城市大脑低频功率聚合策略', scenario: 'smart-city-power', outputMode: 'aggregate', ip: '10.20.42.0/24' },
      { apiCode: 'API-GRID-TMR-ENERGY-010', policyCode: 'V3-POL-SMART-CITY-TMR', policyName: '智慧城市大脑主网电量聚合策略', scenario: 'smart-city-tmr', outputMode: 'aggregate', ip: '10.20.42.0/24' },
      { apiCode: 'API-GRID-LVF-PHASE-011', policyCode: 'V3-POL-SMART-CITY-PHASE', policyName: '智慧城市大脑低频相位角聚合策略', scenario: 'smart-city-phase', outputMode: 'aggregate', ip: '10.20.42.0/24' },
    ] },
    { subjectCode: 'APP-MULTI-SOURCE', apis: [
      { apiCode: 'API-GRID-LVF-VOLT-001', policyCode: 'V3-POL-MULTI-SOURCE-VOLT', policyName: '多源数据平台低频电压策略', scenario: 'multi-source-volt', outputMode: 'masked', ip: '10.20.43.0/24' },
      { apiCode: 'API-GRID-SWITCH-EVENT-008', policyCode: 'V3-POL-MULTI-SOURCE-SWITCH', policyName: '多源数据平台开关事件策略', scenario: 'multi-source-switch', outputMode: 'masked', ip: '10.20.43.0/24' },
    ] },
    { subjectCode: 'APP-DIGITAL-SUBSTATION', apis: [
      { apiCode: 'API-CUST-DAILY-ENERGY-003', policyCode: 'V3-POL-DIGITAL-SUB-DFRZN', policyName: '数字化供电所日冻结密态策略', scenario: 'digital-substation-daily-energy', outputMode: 'encrypted', ip: '10.20.44.0/24' },
      { apiCode: 'API-CUST-POWER-CURVE-005', policyCode: 'V3-POL-DIGITAL-SUB-CURVE', policyName: '数字化供电所电能示值曲线密态策略', scenario: 'digital-substation-energy-curve', outputMode: 'encrypted', ip: '10.20.44.0/24' },
      { apiCode: 'API-CUST-LV-DAILY-INFO-013', policyCode: 'V3-POL-DIGITAL-SUB-LV-DAILY', policyName: '数字化供电所低压日用能密态策略', scenario: 'digital-substation-lv-daily-info', outputMode: 'encrypted', ip: '10.20.44.0/24' },
    ] },
    { subjectCode: 'APP-CHARGING', apis: [
      { apiCode: 'API-CUST-POWER-CURVE-005', policyCode: 'V3-POL-CHARGING-CURVE', policyName: '充换电服务电能示值曲线密态策略', scenario: 'charging-energy-curve', outputMode: 'encrypted', ip: '10.20.45.0/24' },
      { apiCode: 'API-CUST-DAILY-ENERGY-003', policyCode: 'V3-POL-CHARGING-DFRZN', policyName: '充换电服务日冻结密态策略', scenario: 'charging-daily-energy', outputMode: 'encrypted', ip: '10.20.45.0/24' },
    ] },
    { subjectCode: 'APP-NEW-ENERGY', apis: [
      { apiCode: 'API-GRID-LVF-POWER-004', policyCode: 'V3-POL-NEW-ENERGY-PWR', policyName: '新能源选址低频功率聚合策略', scenario: 'new-energy-power', outputMode: 'aggregate', ip: '10.20.46.0/24' },
      { apiCode: 'API-GRID-LVF-PF-006', policyCode: 'V3-POL-NEW-ENERGY-PF', policyName: '新能源选址功率因数聚合策略', scenario: 'new-energy-power-factor', outputMode: 'aggregate', ip: '10.20.46.0/24' },
    ] },
    { subjectCode: 'APP-AUDIT', apis: [
      { apiCode: 'API-GRID-LVF-CURR-002', policyCode: 'V3-POL-AUDIT-CURR', policyName: '数字化审计低频电流策略', scenario: 'audit-current', outputMode: 'masked', ip: '10.20.47.0/24' },
      { apiCode: 'API-CUST-OUTAGE-EVENT-007', policyCode: 'V3-POL-AUDIT-OUTAGE', policyName: '数字化审计停复电事件策略', scenario: 'audit-outage', outputMode: 'masked', ip: '10.20.47.0/24' },
    ] },
    { subjectCode: 'APP-DISCIPLINE', apis: [
      { apiCode: 'API-GRID-TMR-ENERGY-010', policyCode: 'V3-POL-DISCIPLINE-TMR', policyName: '纪检平台主网电量聚合策略', scenario: 'discipline-tmr', outputMode: 'aggregate', ip: '10.20.48.0/24' },
    ] },
    { subjectCode: 'APP-INTELLIGENT-DISPATCH', apis: [
      { apiCode: 'API-GRID-LVF-VOLT-001', policyCode: 'V3-POL-INTELLIGENT-DISPATCH-VOLT', policyName: '智能供服低频电压策略', scenario: 'intelligent-dispatch-volt', outputMode: 'masked', ip: '10.20.49.0/24' },
      { apiCode: 'API-GRID-SWITCH-EVENT-008', policyCode: 'V3-POL-INTELLIGENT-DISPATCH-SWITCH', policyName: '智能供服开关事件策略', scenario: 'intelligent-dispatch-switch', outputMode: 'masked', ip: '10.20.49.0/24' },
      { apiCode: 'API-CUST-OUTAGE-EVENT-007', policyCode: 'V3-POL-INTELLIGENT-DISPATCH-OUTAGE', policyName: '智能供服停复电事件密态策略', scenario: 'intelligent-dispatch-outage', outputMode: 'encrypted', ip: '10.20.49.0/24' },
      { apiCode: 'API-CUST-HV-DAILY-LOAD-014', policyCode: 'V3-POL-INTELLIGENT-DISPATCH-HV-LOAD', policyName: '智能供服高压日负荷密态策略', scenario: 'intelligent-dispatch-hv-daily-load', outputMode: 'encrypted', ip: '10.20.49.0/24' },
    ] },
  ]
  for (const item of customerPolicyData) {
    const subject = await findOne('security_access_subjects', { subject_code: item.subjectCode })
    if (!subject) continue
    const allowed = [...(subject.allowed_api_codes_json || [])]
    for (const apiItem of item.apis) {
      const api = await findOne('security_api_resources', { api_code: apiItem.apiCode })
      if (!api) continue
      if (!allowed.includes(apiItem.apiCode)) allowed.push(apiItem.apiCode)
      await upsert('eco_resource_security_policies', { policy_code: apiItem.policyCode }, {
        policy_code: apiItem.policyCode,
        policy_name: apiItem.policyName,
        policy_kind: 'access_policy',
        resource_id: api.resource_id,
        subject_id: subject.id,
        api_resource_id: api.id,
        scenario: apiItem.scenario,
        source_ips_json: [apiItem.ip],
        allowed_time_ranges_json: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '23:59' }],
        max_requests_per_minute: 30,
        max_query_days: 7,
        max_rows: 1000,
        organization_scope_json: [],
        region_scope_json: ['REGION-A', 'REGION-B'],
        output_mode: apiItem.outputMode,
        risk_threshold: 70,
        policy_status: 'enabled',
        policy_version: 1,
        publish_status: 'success',
        published_at: now,
        abnormal_access_rules_json: {
          offHours: { enabled: true, action: 'deny', riskScore: 70 },
          highFrequency: { enabled: true, action: 'deny', riskScore: 70 },
          queryRangeExceeded: { enabled: true, action: 'deny', riskScore: 60 },
          rowLimitExceeded: { enabled: true, action: 'deny', riskScore: 70 },
          scopeViolation: { enabled: true, action: 'deny', riskScore: 80 },
        },
      })
    }
    await upsert('security_access_subjects', { subject_code: item.subjectCode }, { allowed_api_codes_json: allowed })
  }

  const confidentialTasks = []
  for (const task of confidentialTasks) {
    const { resource_codes, field_codes, compute_request, ...taskValues } = task
    const algorithm = taskValues.algorithm.toUpperCase()
    const resourceIdsForTask = resource_codes.map((code) => String(resourceIds[code]))
    const taskId = await upsert('security_confidential_tasks', { task_code: taskValues.task_code }, {
      ...taskValues,
      execution_summary_json: {
        engine: 'homomorphic-engine',
        algorithm,
        resourceIds: resourceIdsForTask,
        computeRequest: compute_request,
        logs: [createdLog(taskValues.task_code, algorithm, taskValues.task_status)],
      },
    })
    const expectedResourceIds = new Set(resource_codes.map((code) => String(resourceIds[code])))
    const existingRelations = await listAll('security_confidential_task_resources', { filter: { task_id: taskId } })
    for (const relation of existingRelations) {
      if (relation.id == null || expectedResourceIds.has(String(relation.resource_id))) continue
      await client.resource('security_confidential_task_resources').destroy({ filterByTk: relation.id })
    }
    for (let index = 0; index < resource_codes.length; index += 1) {
      const resourceCode = resource_codes[index]
      const policyCode = policyBlueprints.find((item) => item.resourceCode === resourceCode)?.policyCode
      const fieldCode = field_codes[index] || field_codes[0]
      const role = index === 0 ? 'primary' : 'participant'
      if (!policyCode) throw new Error(`未找到资源 ${resourceCode} 对应的安全档案`)
      await upsert('security_confidential_task_resources', { task_id: taskId, resource_id: resourceIds[resourceCode] }, {
        task_id: taskId,
        resource_id: resourceIds[resourceCode],
        field_policy_id: fieldPolicyIds[`${policyCode}:${fieldCode}`],
        resource_role: role,
        resource_role_id: ref.dictIds[`resource_role:${role}`],
        relation_tags: [algorithm, role === 'primary' ? '主资源' : '参与资源'],
        field_scope_json: { mode: 'selected-secured-fields', fields: [fieldCode] },
      })
    }
  }

  for (const product of dataProducts) {
    await upsert('eco_data_products', { product_code: product.product_code }, product)
  }

  const appId = await upsert('eco_app', { name: '量测数据安全管控工作台' }, {
    seqId: 'APP-001',
    name: '量测数据安全管控工作台',
    tags: ['数据安全', '分类分级', '策略管控'],
    contact: '安全运营组',
    description: '面向调控、计量和安全管理员的数据安全管控场景应用。',
    domain_catagory_id: ref.productionRoot,
    snapscreen: [{ url: '/data-catalog/' }],
  })

  const supplyDemandId = await upsert('eco_supply_demand_infos', { scene_name: '调度运行安全分析', required_data_resource_name: '用户侧十五分钟负荷曲线' }, {
    scene_name: '调度运行安全分析',
    required_data_resource_name: '用户侧十五分钟负荷曲线',
    main_data_items: '采集时间、户号、有功功率、调度量测点',
    demand_description: '用于调度运行分析场景，在授权范围内关联用户侧负荷曲线和调度实时量测。',
    is_required: true,
    data_status_description: '已完成资源映射，策略管控后可用',
    data_source_system: '用电信息采集 2.0 / 调控云',
    data_contact_person: '安全运营组',
    data_connection_description: '通过受控共享 API 调用，敏感字段默认脱敏返回。',
    distribution_date: '2026-06-22',
    domain_category_id: ref.productionRoot,
    data_category_id: ref.dictIds['data_category:operation'],
    data_source_unit_id: ref.dispatchDept,
    data_supply_method_id: ref.dictIds['data_supply_method:api'],
    list_source_id: ref.dictIds['list_source:research'],
    satisfaction_status_id: ref.dictIds['satisfaction_status:matched'],
    data_frequency_demand_id: ref.dictIds['data_frequency_demand:realtime'],
    data_sync_frequency_id: ref.dictIds['data_sync_frequency:15m'],
  })
  await client.resource('eco_supply_demand_infos.linked_data_resources', supplyDemandId).set({ values: Object.values(resourceIds).map(Number) })
  await client.resource('eco_supply_demand_infos.related_apps', supplyDemandId).set({ values: [Number(appId)] })

  await upsert('eco_knowledge_base', { title: '电力行业数据安全分类分级指南要点' }, {
    title: '电力行业数据安全分类分级指南要点',
    filename: 'power-data-security-guide.md',
    extname: '.md',
    size: 4096,
    path: '/knowledge/power-data-security',
    url: '',
    preview: '',
    knowledge_type_id: ref.knowledge,
    base_info: { title: '电力行业数据安全分类分级指南要点', gbrq: '2026-06-01', source_category_name: '标准规范', content_only: true, source_format: 'html' },
    source_info: { source_name: '项目设计资料', source_url: '' },
    content: '# 电力行业数据安全分类分级指南要点\n\n围绕量测数据、调度运行数据、用户侧明细数据建立分类分级、字段策略、访问审批、脱敏和审计闭环。',
    createdAt: now,
    updatedAt: now,
  })

  await upsert('eco_data_demands', { demand_name: '调度运行安全分析数据需求' }, {
    demand_name: '调度运行安全分析数据需求',
    scene_name: '调度运行安全分析',
    domain_category_id: ref.productionRoot,
    demand_desc: '需要关联用户侧十五分钟负荷曲线与调度实时运行量测，按最小授权和脱敏策略使用。',
  })

  const period = '20260710_100000_dw30'
  await upsert('eco_stat_task', { task_code: 'dw30' }, { task_code: 'dw30', task_name: '近 30 日资源统计' })
  await upsert('eco_stat_job', { job_code: period }, { job_code: period, stat_period_code: period, execute_time: now, task_code: 'dw30', task_name: '近 30 日资源统计', created_at: now, updated_at: now })
  for (const [resourceCode, id] of Object.entries(resourceIds)) {
    const spec = measurementDemoSpecs[resourceCode]
    if (!spec) continue
    const resource = resources.find((item) => item.resource_code === resourceCode)
    if (!resource) continue
    const dailyDelta = Math.max(12000, Math.round(spec.recordCount * 0.012))
    const metainfo = { table_count: 1, field_count: spec.fields.length, record_count: spec.recordCount, storage_bytes: spec.storageBytes, non_null_field_count: spec.fields.length, business_time_field_name: 'DATA_TIME', business_time_field_description: '量测数据采集时间', business_time_field_type: 'DATETIME', business_time_raw_value: '2026-07-10 10:00:00', business_time_status: 'fresh', business_time_age_days: 0, business_time_stale_threshold_days: 1, last_record_update_time: '2026-07-10 10:00:00', compare_task_code: 'dw30', compare_task_name: '近 30 日资源统计', compare_execute_time: now }
    const dayonday = { compare_period_code: '20260709_100000_dw30', compare_task_code: 'dw30', compare_task_name: '近 30 日资源统计', compare_execute_time: now, record_count: { current: metainfo.record_count, previous: metainfo.record_count - dailyDelta, delta: dailyDelta, ratio: Number((dailyDelta / Math.max(metainfo.record_count - dailyDelta, 1)).toFixed(4)) }, trend_30d: { window_days: 30, task_code: 'dw30', task_name: '近 30 日资源统计', points: [{ date: '2026-07-10', stat_period_code: period, record_count: metainfo.record_count, storage_bytes: metainfo.storage_bytes, field_count: spec.fields.length }] } }
    const quality = { connect_status: '01', empty_table_count: 0, error_table_count: 0, all_null_field_count: 0, stale_business_time_count: 0, missing_business_time_count: 0, business_time_status: 'fresh', business_time_age_days: 0 }
    const values = { stat_period_code: period, data_resource_id: String(id), stat_metainfo: metainfo, stat_dayonday: dayonday, stat_quality: quality, stat_connect: '01', stat_error: [], new_data: latestPreviewProfile(resourceCode, resource.source_table, resource.source_system), created_at: now, updated_at: now }
    await upsert('eco_data_stat_current', { stat_period_code: period, data_resource_id: String(id) }, values)
    await upsert('eco_data_stat', { stat_period_code: period, data_resource_id: String(id) }, values)
  }
}

async function main() {
  await client.auth.signIn({ account, password }, authenticator)
  console.log('[1/3] ensure schema')
  await ensureSchema()
  console.log('[2/3] ensure dictionaries and trees')
  const refs = await ensureBaseDictionariesAndTrees()
  console.log('[3/3] seed business data')
  await seedBusinessData(refs)

  const products = await listAll('eco_data_products', {}, 100)
  const resources = await listAll('eco_data_resources', {}, 100)
  const policies = await listAll('eco_resource_security_policies', {}, 100)
  const securityFields = await listAll('eco_resource_security_fields', {}, 100)
  const securitySources = await listAll('security_data_sources', {}, 100)
  const confidentialTasks = await listAll('security_confidential_tasks', {}, 100)
  const confidentialTaskResources = await listAll('security_confidential_task_resources', {}, 100)
  console.log(JSON.stringify({
    baseURL,
    resources: resources.length,
    securityPolicies: policies.length,
    securityFields: securityFields.length,
    securitySources: securitySources.length,
    confidentialTasks: confidentialTasks.length,
    confidentialTaskResources: confidentialTaskResources.length,
    dataProducts: products.length,
    seededAt: new Date().toISOString(),
  }, null, 2))
}

main().catch((error) => {
  const payload = error?.response?.data ?? error
  if (error?.message) {
    console.error(error.message)
  }
  console.error(JSON.stringify(payload, null, 2))
  process.exit(1)
})
