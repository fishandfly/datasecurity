import { APIClient } from '@nocobase/sdk'

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
  if (existing) return
  await client.resource('collections').create({
    values: {
      name,
      title,
      description,
      template: 'general',
      autoGenId: true,
      titleField,
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
    ['source_type', '数据源类型', [['yongcai20', '用采2.0'], ['dispatch_cloud', '调控云'], ['substation_monitor', '变电站集中监控'], ['distribution_automation', '配电自动化'], ['wide_area_measurement', '广域测量'], ['realtime_db', '实时库'], ['history_db', '历史库'], ['third_party_api', '第三方接口']]],
    ['connection_status', '连接状态', [['connected', '已连接'], ['unconnected', '未连接'], ['exception', '连接异常'], ['testing', '测试中'], ['disabled', '已停用']]],
    ['sensitivity_level', '敏感度', [['public', '公开'], ['internal', '内部'], ['sensitive', '敏感'], ['highly_sensitive', '高敏感']]],
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
    {
      title: '安全档案-禁止导出标签',
      collectionName: 'eco_resource_security_policies',
      fieldName: 'security_tags',
      sort: 50,
      rules: [{ fieldName: 'export_allowed', operator: 'eq', value: 'false' }],
      tags: ['禁止导出'],
    },
    { title: '字段安全-直接标识符标签', collectionName: 'eco_resource_security_fields', fieldName: 'field_tags', sort: 60, rules: [{ fieldName: 'identifier_flag', operator: 'eq', value: 'true' }], tags: ['直接标识符'] },
    { title: '字段安全-准标识符标签', collectionName: 'eco_resource_security_fields', fieldName: 'field_tags', sort: 70, rules: [{ fieldName: 'quasi_identifier_flag', operator: 'eq', value: 'true' }], tags: ['准标识符'] },
    { title: '字段安全-重要字段标签', collectionName: 'eco_resource_security_fields', fieldName: 'field_tags', sort: 80, rules: [{ fieldName: 'important_field_flag', operator: 'eq', value: 'true' }], tags: ['重要字段'] },
    { title: '数据源-连接异常标签', collectionName: 'security_data_sources', fieldName: 'source_tags', sort: 90, rules: [{ fieldName: 'connection_status', operator: 'eq', value: 'exception' }], tags: ['连接异常'] },
    { title: '数据源-高敏标签', collectionName: 'security_data_sources', fieldName: 'source_tags', sort: 100, rules: [{ fieldName: 'sensitivity_level', operator: 'eq', value: 'highly_sensitive' }], tags: ['高敏数据源'] },
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

  return {
    productionRoot,
    meteringNode,
    dispatchNode,
    substationNode,
    distributionNode,
    phasorNode,
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

function securityFieldRows(policyCode, resourceCode, accessScope) {
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
    sensitivity_type: field.sensitivityType,
    identifier_flag: Boolean(field.identifierFlag),
    quasi_identifier_flag: Boolean(field.quasiIdentifierFlag),
    important_field_flag: true,
    field_tags: field.tags,
    level_basis: field.description,
    risk_notes: field.desensitizationMode === 'aggregate-only' ? '跨域使用仅提供受控聚合结果' : field.identifierFlag ? '设备或客户标识默认脱敏' : '按授权范围使用',
    required_access_scope: accessScope,
    required_desensitization: Boolean(field.desensitizationMode),
    required_desensitization_mode: field.desensitizationMode ?? '',
    required_export_allowed: false,
    required_export_scope: 'disabled',
    required_api_access_allowed: field.securityLevel !== '5级',
    required_approval_required: true,
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
  const resources = [
    {
      ...common,
      display_seq: 10,
      resource_code: 'GRID-METER-SEC-001',
      resource_name: '用户侧十五分钟负荷曲线',
      summary: '来自用电信息采集系统的十五分钟负荷曲线，覆盖脱敏客户标识、功率和累计电量。',
      domain_category_id: ref.meteringNode,
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
    },
    {
      ...common,
      display_seq: 20,
      resource_code: 'GRID-DISPATCH-SEC-002',
      resource_name: '调度实时运行量测',
      summary: '主网厂站、电压、电流、功率和频率等秒级运行量测，按核心运行数据管控。',
      domain_category_id: ref.dispatchNode,
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
    },
    {
      ...common,
      display_seq: 30,
      resource_code: 'GRID-SUBSTATION-SEC-003',
      resource_name: '变电站主变运行量测',
      summary: '220千伏变电站主变高低压侧电压、负载率和油温等设备运行量测。',
      domain_category_id: ref.substationNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.equipmentDept,
      update_cycle_id: ref.dictIds['update_cycle:1m'],
      source_system: '变电站集中监控系统',
      source_table: 'DWD_SUBSTATION_TRANSFORMER_MEASURE',
      source_tablelist: sourceTableProfile('DWD_SUBSTATION_TRANSFORMER_MEASURE', '变电站集中监控系统'),
      stat_base: statBaseProfile('DWD_SUBSTATION_TRANSFORMER_MEASURE'),
      data_volume: measurementDemoSpecs['GRID-SUBSTATION-SEC-003'].recordCount,
      field_count: measurementDemoSpecs['GRID-SUBSTATION-SEC-003'].fields.length,
      data_items: dataItems('GRID-SUBSTATION-SEC-003'),
      data_lineage: lineage('GRID-SUBSTATION-SEC-003', '变电站主变运行量测', '变电站集中监控系统', 'DWD_SUBSTATION_TRANSFORMER_MEASURE', '设备管理部'),
    },
    {
      ...common,
      display_seq: 40,
      resource_code: 'GRID-DISTRIBUTION-SEC-004',
      resource_name: '配电馈线实时负荷量测',
      summary: '10千伏馈线电压、电流、有功功率和负载率等配电自动化量测。',
      domain_category_id: ref.distributionNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.distributionDept,
      update_cycle_id: ref.dictIds['update_cycle:1m'],
      source_system: '配电自动化系统',
      source_table: 'DWD_DISTRIBUTION_FEEDER_MEASURE',
      source_tablelist: sourceTableProfile('DWD_DISTRIBUTION_FEEDER_MEASURE', '配电自动化系统'),
      stat_base: statBaseProfile('DWD_DISTRIBUTION_FEEDER_MEASURE'),
      data_volume: measurementDemoSpecs['GRID-DISTRIBUTION-SEC-004'].recordCount,
      field_count: measurementDemoSpecs['GRID-DISTRIBUTION-SEC-004'].fields.length,
      data_items: dataItems('GRID-DISTRIBUTION-SEC-004'),
      data_lineage: lineage('GRID-DISTRIBUTION-SEC-004', '配电馈线实时负荷量测', '配电自动化系统', 'DWD_DISTRIBUTION_FEEDER_MEASURE', '配电自动化中心'),
    },
    {
      ...common,
      display_seq: 50,
      resource_code: 'GRID-PHASOR-SEC-005',
      resource_name: '主网同步相量量测',
      summary: '统一时标下的电压幅值、相角、频率和频率变化率，用于跨域稳定分析。',
      domain_category_id: ref.phasorNode,
      hj417_category_id: ref.operationInfo,
      provider_org_id: ref.dispatchDept,
      update_cycle_id: ref.dictIds['update_cycle:realtime'],
      source_system: '广域测量系统',
      source_table: 'DWD_WAMS_SYNCHROPHASOR',
      source_tablelist: sourceTableProfile('DWD_WAMS_SYNCHROPHASOR', '广域测量系统'),
      stat_base: statBaseProfile('DWD_WAMS_SYNCHROPHASOR'),
      data_volume: measurementDemoSpecs['GRID-PHASOR-SEC-005'].recordCount,
      field_count: measurementDemoSpecs['GRID-PHASOR-SEC-005'].fields.length,
      data_items: dataItems('GRID-PHASOR-SEC-005'),
      data_lineage: lineage('GRID-PHASOR-SEC-005', '主网同步相量量测', '广域测量系统', 'DWD_WAMS_SYNCHROPHASOR', '调控中心'),
    },
  ]

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
      resourceCode: 'GRID-SUBSTATION-SEC-003', policyCode: 'POL-SUBSTATION-003', policyName: '变电设备运行量测受控策略',
      resourceName: '变电站主变运行量测', securityCategoryId: ref.operationSecurityCategory, securityLevel: 'level_4', subjectType: 'device',
      ownerDept: '设备管理部', accessScope: 'production-controlled', approvalMode: 'workflow', desensitizationMode: 'aggregate-only', shareScope: 'conditional',
      assessmentBasis: '包含厂站拓扑、主变标识、负载和状态量测，按重要运行数据管控。', riskNotes: '设备标识默认脱敏，跨域场景只允许设备群组统计。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '变电设备', '设备状态'],
    },
    {
      resourceCode: 'GRID-DISTRIBUTION-SEC-004', policyCode: 'POL-DISTRIBUTION-004', policyName: '配电馈线负荷分层访问策略',
      resourceName: '配电馈线实时负荷量测', securityCategoryId: ref.operationSecurityCategory, securityLevel: 'level_4', subjectType: 'operation',
      ownerDept: '配电自动化中心', accessScope: 'production-controlled', approvalMode: 'workflow', desensitizationMode: 'aggregate-only', shareScope: 'conditional',
      assessmentBasis: '包含馈线拓扑和实时负荷，按重要生产运行数据管控。', riskNotes: '跨专业共享时隐藏馈线和终端标识，仅提供区域聚合指标。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '配网运行', '馈线负荷'],
    },
    {
      resourceCode: 'GRID-PHASOR-SEC-005', policyCode: 'POL-PHASOR-005', policyName: '同步相量核心数据最小授权策略',
      resourceName: '主网同步相量量测', securityCategoryId: ref.coreSecurityCategory, securityLevel: 'level_5', subjectType: 'operation',
      ownerDept: '调控中心', accessScope: 'production-zone', approvalMode: 'dual-approval', desensitizationMode: 'aggregate-only', shareScope: 'deny-external',
      assessmentBasis: '同步相量可反映主网动态稳定状态，按核心运行数据管控。', riskNotes: '仅授权稳定分析场景可使用，不允许跨域获取原始相量序列。',
      tags: ['重要数据', '核心管控', '需脱敏', '需审批', '禁止导出', '同步相量', '稳定分析'],
    },
  ]
  const policies = policyBlueprints.map((blueprint, index) => {
    const fieldRows = securityFieldRows(blueprint.policyCode, blueprint.resourceCode, blueprint.accessScope)
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
      access_scope: blueprint.accessScope,
      approval_mode: blueprint.approvalMode,
      desensitization_mode: blueprint.desensitizationMode,
      export_allowed: false,
      export_scope: 'disabled',
      api_access_allowed: true,
      api_auth_mode: blueprint.securityLevel === 'level_5' ? 'mfa-and-role' : 'jwt-and-role',
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
    securityFieldRows(blueprint.policyCode, blueprint.resourceCode, blueprint.accessScope)
  ))
  const fieldPolicyIds = {}
  for (const field of securityFields) {
    const { policy_code, resource_code, ...values } = field
    const policyId = policyIds[policy_code]
    const fieldId = await upsert('eco_resource_security_fields', { policy_id: policyId, field_code: values.field_code }, {
      ...values,
      policy_id: policyId,
      resource_id: resourceIds[resource_code],
    })
    fieldPolicyIds[`${policy_code}:${values.field_code}`] = fieldId
  }

  const demoMonitor = (resourceCode, ingestRate, todayRows, latencyMs, blockedCount = 0) => ({
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
  })
  const sourceBlueprints = [
    {
      sourceCode: 'SRC-YC20-001', sourceName: '用采2.0量测数据源', sourceType: 'yongcai20', sensitivityLevel: 'sensitive',
      ownerDept: '计量中心', policyCode: 'POL-METER-001', resourceCode: 'GRID-METER-SEC-001',
      description: '用户侧十五分钟负荷曲线的统一安全接入演示配置。', host: 'metering-demo.internal', port: '5432', databaseName: 'metering',
      tags: ['用采2.0', '量测数据', '敏感数据'], sampleRate: 10, timeoutSeconds: 30, failureThreshold: 3,
      monitor: demoMonitor('GRID-METER-SEC-001', 4800, 14820000, 780, 2),
    },
    {
      sourceCode: 'SRC-DISPATCH-001', sourceName: '调控云实时量测数据源', sourceType: 'dispatch_cloud', sensitivityLevel: 'highly_sensitive',
      ownerDept: '调控中心', policyCode: 'POL-DISPATCH-002', resourceCode: 'GRID-DISPATCH-SEC-002',
      description: '主网调度实时量测的统一安全接入演示配置。', host: 'dispatch-demo.internal', port: '1521', databaseName: 'dispatch_realtime',
      tags: ['调控云', '实时运行', '高敏数据源'], sampleRate: 100, timeoutSeconds: 20, failureThreshold: 1,
      monitor: demoMonitor('GRID-DISPATCH-SEC-002', 18500, 58600000, 86),
    },
    {
      sourceCode: 'SRC-SUBSTATION-001', sourceName: '变电站集中监控量测数据源', sourceType: 'substation_monitor', sensitivityLevel: 'highly_sensitive',
      ownerDept: '设备管理部', policyCode: 'POL-SUBSTATION-003', resourceCode: 'GRID-SUBSTATION-SEC-003',
      description: '主变电压、负载率和油温等设备量测的安全接入演示配置。', host: 'substation-demo.internal', port: '5432', databaseName: 'substation_monitor',
      tags: ['变电设备', '主变量测', '重要数据'], sampleRate: 50, timeoutSeconds: 20, failureThreshold: 2,
      monitor: demoMonitor('GRID-SUBSTATION-SEC-003', 7200, 21460000, 142),
    },
    {
      sourceCode: 'SRC-DISTRIBUTION-001', sourceName: '配电自动化量测数据源', sourceType: 'distribution_automation', sensitivityLevel: 'highly_sensitive',
      ownerDept: '配电自动化中心', policyCode: 'POL-DISTRIBUTION-004', resourceCode: 'GRID-DISTRIBUTION-SEC-004',
      description: '配电馈线电压、电流、功率和负载率的安全接入演示配置。', host: 'distribution-demo.internal', port: '5432', databaseName: 'distribution_realtime',
      tags: ['配电自动化', '馈线负荷', '重要数据'], sampleRate: 50, timeoutSeconds: 20, failureThreshold: 2,
      monitor: demoMonitor('GRID-DISTRIBUTION-SEC-004', 9600, 30780000, 118, 1),
    },
    {
      sourceCode: 'SRC-PHASOR-001', sourceName: '广域同步相量数据源', sourceType: 'wide_area_measurement', sensitivityLevel: 'highly_sensitive',
      ownerDept: '调控中心', policyCode: 'POL-PHASOR-005', resourceCode: 'GRID-PHASOR-SEC-005',
      description: '同步相量、频率和频率变化率的安全接入演示配置。', host: 'phasor-demo.internal', port: '5432', databaseName: 'wide_area_measurement',
      tags: ['同步相量', '稳定分析', '高敏数据源'], sampleRate: 100, timeoutSeconds: 10, failureThreshold: 1,
      monitor: demoMonitor('GRID-PHASOR-SEC-005', 25000, 79200000, 42),
    },
  ]
  const sourceIds = {}
  for (const source of sourceBlueprints) {
    sourceIds[source.sourceCode] = await upsert('security_data_sources', { source_code: source.sourceCode }, {
      source_code: source.sourceCode,
      source_name: source.sourceName,
      source_type: source.sourceType,
      connection_status: 'connected',
      sensitivity_level: source.sensitivityLevel,
      owner_user_id: 1,
      owner_dept: source.ownerDept,
      policy_id: policyIds[source.policyCode],
      description: source.description,
      host: source.host,
      port: source.port,
      database_name: source.databaseName,
      username: 'security_reader',
      secret_ref: `secret://security/source/${source.sourceCode.toLowerCase()}`,
      workflow_key: '统一安全接入校验',
      source_tags: source.tags,
      security_config_json: {
        encryptionEnabled: true,
        encryptionAlgorithm: 'SM4',
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
