export type CatalogItem = {
  id: string
  code: string
  name: string
  category: string
  industryCategory: string
  openType: string
  serviceType: string
  department: string
  contact: string
  tags: string[]
  description: string
  summary: string
  updateCycle: string
  format: string[]
  timeScope: string
  publishDate: string
  updateTime: string
  areaScope: string
  count: string
  score: number
  fieldRows: Array<{
    fieldName: string
    englishName: string
    fieldType: string
    length: string
    nullable: string
    shared: string
    primary: string
    description: string
  }>
}

export const categoryOptions: Array<[string, number]> = [
  ['全部', 1286],
  ['大气环境', 312],
  ['水生态环境', 268],
  ['土壤生态', 106],
  ['污染源监管', 327],
  ['固废危废', 144],
  ['生态保护修复', 118],
  ['环境执法监管', 156],
  ['应对气候变化', 87],
  ['核与辐射安全', 64],
  ['生态监测评估', 132],
  ['排污许可管理', 121],
]

export const openOptions: Array<[string, number]> = [
  ['全部', 1286],
  ['无条件开放', 927],
  ['受限开放', 178],
  ['依申请开放', 181],
]

export const departmentOptions: Array<[string, number]> = [
  ['全部', 3921],
  ['省生态环境监测中心', 316],
  ['省生态环境执法局', 279],
  ['省固体废物管理中心', 212],
  ['省发展改革委', 188],
  ['省自然资源厅', 236],
  ['省水利厅', 204],
  ['省林业和草原局', 173],
  ['省农业农村厅', 165],
  ['省应急管理厅', 149],
  ['省气象局', 132],
  ['省统计局', 118],
  ['省政务服务和数字化局', 141],
  ['省公安厅', 96],
  ['长春市生态环境局', 199],
  ['吉林市生态环境局', 170],
  ['四平市生态环境局', 139],
]

export const regionOptions: Array<[string, number]> = [
  ['全部', 18442],
  ['长春市', 3540],
  ['吉林市', 1871],
  ['四平市', 1858],
  ['辽源市', 1350],
  ['通化市', 1488],
  ['白山市', 1672],
  ['松原市', 1912],
]

export const catalogItems: CatalogItem[] = [
  {
    id: 'eco-air-quality',
    code: 'JL0000TDA2026040200001',
    name: '吉林省城市空气质量日报信息',
    category: '大气环境',
    industryCategory: '生态环境',
    openType: '无条件开放',
    serviceType: '全部服务',
    department: '省生态环境监测中心',
    contact: '0431-88567120',
    tags: ['AQI', '空气质量', '日报', '监测'],
    description:
      '汇聚吉林省各地市空气质量日报、AQI、首要污染物、六项污染物浓度、空气质量级别等信息，适用于公众查询、专题分析和治理评估。',
    summary:
      '数据覆盖长春、吉林、四平、辽源、通化、白山、松原、白城、延边等地区，提供空气质量指数、首要污染物、PM2.5、PM10、SO2、NO2、O3、CO等指标。',
    updateCycle: '每日',
    format: ['XLS', 'CSV', 'JSON', 'API'],
    timeScope: '2021年至今',
    publishDate: '2026-04-02',
    updateTime: '2026-04-02 09:20:14',
    areaScope: '省本级',
    count: '3,326',
    score: 5,
    fieldRows: [
      {
        fieldName: '监测日期',
        englishName: 'MONITOR_DATE',
        fieldType: 'DATE',
        length: '10',
        nullable: '否',
        shared: '否',
        primary: '是',
        description: '空气质量日报发布日期',
      },
      {
        fieldName: '地区名称',
        englishName: 'CITY_NAME',
        fieldType: 'VARCHAR',
        length: '50',
        nullable: '否',
        shared: '否',
        primary: '否',
        description: '监测城市名称',
      },
      {
        fieldName: 'AQI指数',
        englishName: 'AQI_INDEX',
        fieldType: 'NUMBER',
        length: '8',
        nullable: '是',
        shared: '否',
        primary: '否',
        description: '空气质量指数',
      },
      {
        fieldName: '首要污染物',
        englishName: 'PRIMARY_POLLUTANT',
        fieldType: 'VARCHAR',
        length: '100',
        nullable: '是',
        shared: '否',
        primary: '否',
        description: '首要污染物名称',
      },
    ],
  },
  {
    id: 'eco-water-section',
    code: 'JL0000TDA2026040200002',
    name: '吉林省地表水断面监测信息',
    category: '水生态环境',
    industryCategory: '生态环境',
    openType: '无条件开放',
    serviceType: '数据接口',
    department: '省生态环境厅水生态环境处',
    contact: '0431-88567218',
    tags: ['地表水', '断面', '流域', '监测'],
    description:
      '提供省内重点流域和国控断面水质类别、主要污染指标、超标情况、断面位置等信息。',
    summary:
      '数据包括断面名称、所属流域、水质类别、监测时间、氨氮、高锰酸盐指数、总磷、溶解氧等核心指标。',
    updateCycle: '每周',
    format: ['XLS', 'CSV', 'API'],
    timeScope: '2020年至今',
    publishDate: '2026-03-28',
    updateTime: '2026-04-01 15:57:15',
    areaScope: '省本级',
    count: '594',
    score: 5,
    fieldRows: [
      {
        fieldName: '断面名称',
        englishName: 'SECTION_NAME',
        fieldType: 'VARCHAR',
        length: '100',
        nullable: '否',
        shared: '否',
        primary: '是',
        description: '地表水监测断面名称',
      },
      {
        fieldName: '所属流域',
        englishName: 'BASIN_NAME',
        fieldType: 'VARCHAR',
        length: '50',
        nullable: '是',
        shared: '否',
        primary: '否',
        description: '断面所属流域',
      },
    ],
  },
  {
    id: 'eco-pollution-source',
    code: 'JL0000TDA2026040200003',
    name: '重点污染源在线监控信息',
    category: '污染源监管',
    industryCategory: '执法监管',
    openType: '受限开放',
    serviceType: '数据接口',
    department: '省生态环境执法局',
    contact: '0431-88567366',
    tags: ['污染源', '在线监控', '企业'],
    description:
      '面向监管部门和授权单位开放重点排污单位在线监测汇总、告警统计、设备运行情况等摘要数据。',
    summary:
      '包括排污单位、排口、监测因子、监测值、告警类型、告警时间、处理状态等核心字段。',
    updateCycle: '实时',
    format: ['API', 'JSON'],
    timeScope: '实时',
    publishDate: '2026-03-25',
    updateTime: '2026-04-02 14:32:23',
    areaScope: '省本级',
    count: '3,424',
    score: 4,
    fieldRows: [
      {
        fieldName: '企业名称',
        englishName: 'ENT_NAME',
        fieldType: 'VARCHAR',
        length: '200',
        nullable: '否',
        shared: '否',
        primary: '是',
        description: '重点污染源企业名称',
      },
      {
        fieldName: '告警时间',
        englishName: 'ALARM_TIME',
        fieldType: 'DATETIME',
        length: '19',
        nullable: '是',
        shared: '否',
        primary: '否',
        description: '在线告警时间',
      },
    ],
  },
]

const mockCategories = [
  '大气环境',
  '水生态环境',
  '土壤生态',
  '污染源监管',
  '固废危废',
  '生态保护修复',
  '环境执法监管',
  '应对气候变化',
  '核与辐射安全',
  '生态监测评估',
  '排污许可管理',
] as const

const mockAreas = ['省本级', '长春市', '吉林市', '四平市', '辽源市', '通化市', '白山市', '松原市', '白城市', '延边州'] as const

const mockCategoryProfiles: Record<
  (typeof mockCategories)[number],
  {
    industryCategory: string
    departments: string[]
    topics: string[]
    metricNames: string[]
    sceneWords: string[]
    fieldRows: CatalogItem['fieldRows']
  }
> = {
  大气环境: {
    industryCategory: '生态环境监测',
    departments: ['省生态环境监测中心', '长春市生态环境局', '吉林市生态环境局', '省气象局'],
    topics: ['城市空气质量日报', '重污染天气应对', '空气站点小时监测', '扬尘源监管台账', '臭氧污染过程分析'],
    metricNames: ['AQI', 'PM2.5', 'PM10', 'NO2'],
    sceneWords: ['日常监测', '预警研判', '专题分析'],
    fieldRows: [
      { fieldName: '监测点位', englishName: 'STATION_NAME', fieldType: 'VARCHAR', length: '120', nullable: '否', shared: '是', primary: '是', description: '空气监测站点名称' },
      { fieldName: '监测时间', englishName: 'MONITOR_TIME', fieldType: 'DATETIME', length: '19', nullable: '否', shared: '是', primary: '否', description: '数据采集时间' },
      { fieldName: 'AQI指数', englishName: 'AQI_VALUE', fieldType: 'NUMBER', length: '8', nullable: '是', shared: '是', primary: '否', description: '空气质量指数值' },
      { fieldName: '首要污染物', englishName: 'PRIMARY_FACTOR', fieldType: 'VARCHAR', length: '40', nullable: '是', shared: '是', primary: '否', description: '首要污染物名称' },
    ],
  },
  水生态环境: {
    industryCategory: '水生态环境',
    departments: ['省生态环境厅水生态环境处', '省水利厅', '松原市生态环境局', '白山市生态环境局'],
    topics: ['国控断面水质监测', '饮用水水源地基础信息', '流域考核断面评价', '入河排污口排查', '黑臭水体整治台账'],
    metricNames: ['总磷', '氨氮', '溶解氧', '高锰酸盐指数'],
    sceneWords: ['断面考核', '流域研判', '整治评估'],
    fieldRows: [
      { fieldName: '断面名称', englishName: 'SECTION_NAME', fieldType: 'VARCHAR', length: '120', nullable: '否', shared: '是', primary: '是', description: '监测断面名称' },
      { fieldName: '所属流域', englishName: 'BASIN_NAME', fieldType: 'VARCHAR', length: '80', nullable: '否', shared: '是', primary: '否', description: '断面所属流域' },
      { fieldName: '监测时间', englishName: 'MONITOR_TIME', fieldType: 'DATETIME', length: '19', nullable: '否', shared: '是', primary: '否', description: '采样监测时间' },
      { fieldName: '水质类别', englishName: 'WATER_LEVEL', fieldType: 'VARCHAR', length: '20', nullable: '是', shared: '是', primary: '否', description: '水质评价类别' },
    ],
  },
  土壤生态: {
    industryCategory: '土壤与农村生态',
    departments: ['省生态环境监测中心', '省自然资源厅', '四平市生态环境局', '通化市生态环境局'],
    topics: ['建设用地土壤风险管控', '农用地土壤环境质量', '重点地块调查评估', '受污染耕地分类清单'],
    metricNames: ['镉', '铅', '砷', '汞'],
    sceneWords: ['风险管控', '调查评估', '分类管理'],
    fieldRows: [
      { fieldName: '地块名称', englishName: 'PLOT_NAME', fieldType: 'VARCHAR', length: '160', nullable: '否', shared: '是', primary: '是', description: '调查地块名称' },
      { fieldName: '地块用途', englishName: 'LAND_USE', fieldType: 'VARCHAR', length: '60', nullable: '是', shared: '是', primary: '否', description: '当前地块用途' },
      { fieldName: '风险等级', englishName: 'RISK_LEVEL', fieldType: 'VARCHAR', length: '20', nullable: '是', shared: '是', primary: '否', description: '土壤风险等级' },
      { fieldName: '所在地区', englishName: 'REGION_NAME', fieldType: 'VARCHAR', length: '60', nullable: '否', shared: '是', primary: '否', description: '行政区划名称' },
    ],
  },
  污染源监管: {
    industryCategory: '污染源在线监管',
    departments: ['省生态环境执法局', '省生态环境监测中心', '长春市生态环境局', '吉林市生态环境局'],
    topics: ['重点排污单位在线监控', '排口监测告警汇总', '自动监测设备运维情况', '企业排放日报'],
    metricNames: ['告警次数', '超标时长', '排放浓度', '设备状态'],
    sceneWords: ['在线监管', '执法核查', '异常预警'],
    fieldRows: [
      { fieldName: '企业名称', englishName: 'ENTERPRISE_NAME', fieldType: 'VARCHAR', length: '200', nullable: '否', shared: '是', primary: '是', description: '排污单位名称' },
      { fieldName: '排口名称', englishName: 'OUTLET_NAME', fieldType: 'VARCHAR', length: '120', nullable: '是', shared: '是', primary: '否', description: '监控排口名称' },
      { fieldName: '监测因子', englishName: 'FACTOR_NAME', fieldType: 'VARCHAR', length: '60', nullable: '是', shared: '是', primary: '否', description: '在线监测因子' },
      { fieldName: '告警状态', englishName: 'ALARM_STATUS', fieldType: 'VARCHAR', length: '20', nullable: '是', shared: '是', primary: '否', description: '告警处置状态' },
    ],
  },
  固废危废: {
    industryCategory: '固体废物管理',
    departments: ['省固体废物管理中心', '省生态环境执法局', '长春市生态环境局', '延边州生态环境局'],
    topics: ['危险废物经营单位名录', '医疗废物收运处置台账', '一般工业固废综合利用情况', '危险废物转移联单统计'],
    metricNames: ['处置量', '贮存量', '转移量', '经营许可'],
    sceneWords: ['全过程监管', '转移联单', '处置调度'],
    fieldRows: [
      { fieldName: '单位名称', englishName: 'ORG_NAME', fieldType: 'VARCHAR', length: '180', nullable: '否', shared: '是', primary: '是', description: '经营或产废单位名称' },
      { fieldName: '废物类别', englishName: 'WASTE_TYPE', fieldType: 'VARCHAR', length: '80', nullable: '否', shared: '是', primary: '否', description: '危险废物类别' },
      { fieldName: '处置方式', englishName: 'DISPOSAL_MODE', fieldType: 'VARCHAR', length: '60', nullable: '是', shared: '是', primary: '否', description: '处置或利用方式' },
      { fieldName: '台账日期', englishName: 'LEDGER_DATE', fieldType: 'DATE', length: '10', nullable: '否', shared: '是', primary: '否', description: '台账日期' },
    ],
  },
  生态保护修复: {
    industryCategory: '生态保护',
    departments: ['省林业和草原局', '省自然资源厅', '白山市生态环境局', '延边州生态环境局'],
    topics: ['自然保护地基础信息', '生态保护红线监管', '矿山修复项目台账', '湿地保护监测成果'],
    metricNames: ['保护地面积', '修复进度', '巡查次数', '项目投资'],
    sceneWords: ['保护监管', '修复治理', '项目调度'],
    fieldRows: [
      { fieldName: '项目名称', englishName: 'PROJECT_NAME', fieldType: 'VARCHAR', length: '180', nullable: '否', shared: '是', primary: '是', description: '修复或保护项目名称' },
      { fieldName: '项目类型', englishName: 'PROJECT_TYPE', fieldType: 'VARCHAR', length: '60', nullable: '是', shared: '是', primary: '否', description: '项目类别' },
      { fieldName: '建设地点', englishName: 'PROJECT_AREA', fieldType: 'VARCHAR', length: '100', nullable: '否', shared: '是', primary: '否', description: '项目所在区域' },
      { fieldName: '进度状态', englishName: 'PROGRESS_STATUS', fieldType: 'VARCHAR', length: '30', nullable: '是', shared: '是', primary: '否', description: '项目进展状态' },
    ],
  },
  环境执法监管: {
    industryCategory: '环境执法',
    departments: ['省生态环境执法局', '省公安厅', '长春市生态环境局', '四平市生态环境局'],
    topics: ['行政处罚案件台账', '双随机执法检查记录', '排污许可后监管问题清单', '重点案件线索移交'],
    metricNames: ['案件数量', '处罚金额', '检查频次', '整改率'],
    sceneWords: ['执法办案', '联合监管', '后督察'],
    fieldRows: [
      { fieldName: '案件编号', englishName: 'CASE_CODE', fieldType: 'VARCHAR', length: '60', nullable: '否', shared: '是', primary: '是', description: '执法案件编号' },
      { fieldName: '企业名称', englishName: 'ENT_NAME', fieldType: 'VARCHAR', length: '180', nullable: '否', shared: '是', primary: '否', description: '被检查企业名称' },
      { fieldName: '检查时间', englishName: 'CHECK_TIME', fieldType: 'DATETIME', length: '19', nullable: '否', shared: '是', primary: '否', description: '现场检查时间' },
      { fieldName: '办理状态', englishName: 'HANDLE_STATUS', fieldType: 'VARCHAR', length: '20', nullable: '是', shared: '是', primary: '否', description: '案件办理状态' },
    ],
  },
  应对气候变化: {
    industryCategory: '双碳管理',
    departments: ['省发展改革委', '省生态环境厅应对气候变化处', '长春市生态环境局', '省统计局'],
    topics: ['重点行业碳排放核算', '温室气体清单编制成果', '低碳试点项目台账', '重点排放单位履约信息'],
    metricNames: ['碳排放量', '履约率', '项目数', '能耗强度'],
    sceneWords: ['双碳评估', '履约管理', '行业分析'],
    fieldRows: [
      { fieldName: '单位名称', englishName: 'ORG_NAME', fieldType: 'VARCHAR', length: '180', nullable: '否', shared: '是', primary: '是', description: '重点排放单位名称' },
      { fieldName: '行业类别', englishName: 'INDUSTRY_TYPE', fieldType: 'VARCHAR', length: '80', nullable: '是', shared: '是', primary: '否', description: '行业分类' },
      { fieldName: '核算年度', englishName: 'ACCOUNT_YEAR', fieldType: 'VARCHAR', length: '4', nullable: '否', shared: '是', primary: '否', description: '碳排放核算年度' },
      { fieldName: '排放总量', englishName: 'EMISSION_TOTAL', fieldType: 'NUMBER', length: '18', nullable: '是', shared: '是', primary: '否', description: '年度排放总量' },
    ],
  },
  核与辐射安全: {
    industryCategory: '辐射环境管理',
    departments: ['省生态环境厅核与辐射安全处', '省生态环境监测中心', '吉林市生态环境局'],
    topics: ['辐射环境质量监测', '放射源安全监管台账', '核技术利用单位基础信息', '辐射事故应急资源清单'],
    metricNames: ['剂量率', '监测频次', '设备数量', '应急物资'],
    sceneWords: ['辐射监测', '安全监管', '应急保障'],
    fieldRows: [
      { fieldName: '监测点名称', englishName: 'POINT_NAME', fieldType: 'VARCHAR', length: '120', nullable: '否', shared: '是', primary: '是', description: '辐射监测点名称' },
      { fieldName: '监测值', englishName: 'MONITOR_VALUE', fieldType: 'NUMBER', length: '12', nullable: '是', shared: '是', primary: '否', description: '辐射监测数值' },
      { fieldName: '监测单位', englishName: 'MONITOR_ORG', fieldType: 'VARCHAR', length: '120', nullable: '是', shared: '是', primary: '否', description: '承担监测单位' },
      { fieldName: '预警等级', englishName: 'WARN_LEVEL', fieldType: 'VARCHAR', length: '20', nullable: '是', shared: '是', primary: '否', description: '预警等级' },
    ],
  },
  生态监测评估: {
    industryCategory: '生态监测',
    departments: ['省生态环境监测中心', '省林业和草原局', '白山市生态环境局', '松原市生态环境局'],
    topics: ['生态质量指数评价成果', '重点生态功能区监测', '生物多样性调查样线信息', '遥感解译监测结果'],
    metricNames: ['指数值', '优良比例', '样线数量', '覆盖率'],
    sceneWords: ['综合评估', '遥感监测', '质量评价'],
    fieldRows: [
      { fieldName: '评价单元', englishName: 'EVAL_AREA', fieldType: 'VARCHAR', length: '120', nullable: '否', shared: '是', primary: '是', description: '生态评价单元' },
      { fieldName: '评价年份', englishName: 'EVAL_YEAR', fieldType: 'VARCHAR', length: '4', nullable: '否', shared: '是', primary: '否', description: '评价年度' },
      { fieldName: '生态指数', englishName: 'ECO_INDEX', fieldType: 'NUMBER', length: '10', nullable: '是', shared: '是', primary: '否', description: '生态质量指数值' },
      { fieldName: '评价等级', englishName: 'EVAL_LEVEL', fieldType: 'VARCHAR', length: '20', nullable: '是', shared: '是', primary: '否', description: '生态质量等级' },
    ],
  },
  排污许可管理: {
    industryCategory: '排污许可',
    departments: ['省生态环境执法局', '省生态环境厅行政审批办公室', '长春市生态环境局', '通化市生态环境局'],
    topics: ['排污许可证基础信息', '许可执行报告汇总', '自行监测要求清单', '许可证变更延续记录'],
    metricNames: ['许可证数量', '执行率', '变更次数', '填报率'],
    sceneWords: ['许可管理', '执行评估', '填报核查'],
    fieldRows: [
      { fieldName: '许可证编号', englishName: 'PERMIT_CODE', fieldType: 'VARCHAR', length: '80', nullable: '否', shared: '是', primary: '是', description: '排污许可证编号' },
      { fieldName: '持证单位', englishName: 'LICENSEE_NAME', fieldType: 'VARCHAR', length: '180', nullable: '否', shared: '是', primary: '否', description: '持证单位名称' },
      { fieldName: '发证时间', englishName: 'ISSUE_DATE', fieldType: 'DATE', length: '10', nullable: '是', shared: '是', primary: '否', description: '许可证发证日期' },
      { fieldName: '证书状态', englishName: 'PERMIT_STATUS', fieldType: 'VARCHAR', length: '20', nullable: '是', shared: '是', primary: '否', description: '许可证当前状态' },
    ],
  },
}

const generatedCatalogItems: CatalogItem[] = Array.from({ length: 117 }, (_, index) => {
  const category = mockCategories[index % mockCategories.length]
  const profile = mockCategoryProfiles[category]
  const department = profile.departments[index % profile.departments.length]
  const topic = profile.topics[index % profile.topics.length]
  const area = mockAreas[index % mockAreas.length]
  const serviceType = index % 4 === 0 ? '数据接口' : index % 4 === 1 ? '数据下载' : index % 4 === 2 ? '全部服务' : '数据接口'
  const openType =
    serviceType === '数据接口' ? (index % 3 === 0 ? '受限开放' : '依申请开放') : index % 5 === 0 ? '依申请开放' : '无条件开放'
  const updateCycle = index % 5 === 0 ? '实时' : index % 5 === 1 ? '每日' : index % 5 === 2 ? '每周' : '每月'
  const format =
    serviceType === '数据接口'
      ? index % 2 === 0
        ? ['API', 'JSON']
        : ['API', 'JSON', 'CSV']
      : serviceType === '数据下载'
        ? index % 2 === 0
          ? ['XLS', 'CSV']
          : ['CSV', 'JSON']
        : ['API', 'JSON', 'XLS', 'CSV']
  const serial = `${index + 4}`.padStart(4, '0')
  const code = `JL0000TDA20260402${serial}`
  const month = `${(index % 3) + 2}`.padStart(2, '0')
  const day = `${(index % 27) + 1}`.padStart(2, '0')
  const hour = `${(index % 13) + 8}`.padStart(2, '0')
  const minute = `${(index * 11) % 60}`.padStart(2, '0')
  const countBase = 420 + (index % 17) * 185 + Math.floor(index / 2) * 37
  const titlePrefix = area === '省本级' ? '吉林省' : `${area}`
  const titleSuffix =
    serviceType === '数据接口' ? '接口资源' : serviceType === '数据下载' ? '共享目录' : '目录服务清单'
  const summaryAction =
    serviceType === '数据接口'
      ? '支撑业务系统调用、专题研判和跨部门协同共享'
      : serviceType === '数据下载'
        ? '适用于目录检索、离线分析和专题汇总'
        : '适用于目录检索、接口调用和资料下载一体化使用'

  return {
    id: `mock-resource-${index + 1}`,
    code,
    name: `${titlePrefix}${topic}${titleSuffix}`,
    category,
    industryCategory: profile.industryCategory,
    openType,
    serviceType,
    department,
    contact: `0431-88${`${560000 + index * 17}`.slice(-6)}`,
    tags: [category, topic.replace(/吉林省|长春市|吉林市|四平市|通化市|白山市|松原市|白城市|延边州/g, ''), profile.sceneWords[index % profile.sceneWords.length], openType],
    description: `${department}汇聚${area}${topic}相关数据，覆盖${profile.metricNames.join('、')}等核心指标，${summaryAction}。`,
    summary: `围绕${topic}形成统一目录条目，包含基础信息、指标项、更新周期、共享属性和服务方式，可用于${profile.sceneWords.join('、')}等业务场景。`,
    updateCycle,
    format,
    timeScope: updateCycle === '实时' ? '实时' : index % 3 === 0 ? '2022年至今' : index % 3 === 1 ? '2023年至今' : '2024年至今',
    publishDate: `2026-${month}-${day}`,
    updateTime: `2026-04-${`${(index % 28) + 1}`.padStart(2, '0')} ${hour}:${minute}:18`,
    areaScope: area,
    count: countBase.toLocaleString('en-US'),
    score: index % 7 === 0 ? 4 : 5,
    fieldRows: profile.fieldRows,
  }
})

catalogItems.push(...generatedCatalogItems)

export const operationStats = [
  { label: '资源目录数', value: '22,457', unit: '个' },
  { label: '共享服务数', value: '22,457', unit: '个' },
  { label: '数据项数', value: '262,062', unit: '项' },
  { label: '数据记录量', value: '590.71', unit: '亿条' },
  { label: '专题目录数', value: '22,457', unit: '个' },
  { label: '编目部门数', value: '2,093', unit: '个' },
  { label: '应用场景数', value: '265', unit: '项' },
]

export const secondaryStats = [
  { label: '累计注册用户', value: '117,808', unit: '人' },
  { label: '接入部门数', value: '2,093', unit: '个' },
  { label: '主题分类数', value: '11', unit: '类' },
  { label: '共享服务数', value: '22,457', unit: '个' },
]

export const departmentBars = [
  ['省生态环境监测中心', 90, 86],
  ['省生态环境执法局', 38, 27],
  ['省固废管理中心', 96, 98],
  ['长春市生态环境局', 84, 76],
  ['吉林市生态环境局', 108, 103],
  ['四平市生态环境局', 29, 18],
  ['白城市生态环境局', 17, 10],
  ['松原市生态环境局', 174, 168],
  ['白山市生态环境局', 141, 136],
  ['延边州生态环境局', 278, 260],
]

export const visitHeat = [
  ['长春市', '64,447,818'],
  ['北京市', '35,574,761'],
  ['上海市', '24,418,604'],
  ['吉林市', '18,840,038'],
  ['哈尔滨市', '5,858,528'],
  ['沈阳市', '5,049,062'],
]

export const demandCases = [
  '生态执法研判模型数据接入',
  '黑土地保护专题数据数据申请',
  '环境质量可视化大屏对接需求',
]
