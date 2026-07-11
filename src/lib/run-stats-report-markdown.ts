import { FRESHNESS_STOPPED_BAND_LABELS } from './nocobase-stat-data'

export type ReportImage = {
  alt: string
  dataUrl: string
}

export type ReportCoreMetricRow = {
  label: string
  value: string
  change?: string
  note?: string
}

export type ReportTrendRow = {
  period: string
  resources: string
  totalRecords: string
  totalStorage: string
  totalDelta: string
  normalRate: string
}

export type ReportStatusTopResourceRow = {
  resourceName: string
  status: string
  count: string
  ratio: string
}

export type ReportStatusCategoryRow = {
  categoryLabel: string
  normalCount: string
  disconnectCount: string
  slowCount: string
  otherCount: string
  normalRate: string
}

export type ReportStockCategoryRow = {
  categoryLabel: string
  totalRecords: string
  totalStorage: string
}

export type ReportChangeCategoryRow = {
  categoryLabel: string
  totalRecords: string
  totalStorage: string
  totalDeltaRecords: string
  totalDeltaRatio: string
}

export type ReportRankingSection = {
  title: string
  headers: string[]
  rows: string[][]
}

export type ReportStockDetailRow = {
  resourceCode: string
  resourceName: string
  connectStatus: string
  recordCount: string
  storage: string
  tableCount: string
  fieldCount: string
  nonNullFieldCount: string
  recordRatio: string
  recordDelta: string
  errorCount: string
}

export type ReportChangeDetailRow = {
  resourceCode: string
  resourceName: string
  currentValue: string
  previousValue: string
  deltaValue: string
  deltaRatio: string
}

export type ReportFreshnessMetricRow = {
  label: string
  value: string
  ratio: string
  note: string
}

export type ReportFreshnessTopRow = {
  resourceCode: string
  resourceName: string
  businessTimeField: string
  latestBusinessTime: string
  ageDays: string
  status: string
}

export type ReportIssueRow = {
  resourceCode: string
  resourceName: string
  connectStatus: string
  problemType: string
  errorCount: string
  note: string
}

export type ReportQualityDetailRow = {
  resourceCode: string
  resourceName: string
  allNullFieldCount: string
  emptyTableCount: string
  errorTableCount: string
  fieldCount: string
  nonNullFieldCount: string
  fillRate: string
}

export type BuildRunStatsReportMarkdownInput = {
  title?: string
  effectivePeriod: string
  generatedAt: string
  resourceCount: number | string
  coreMetrics: ReportCoreMetricRow[]
  trendSummary: string
  trendImages?: ReportImage[]
  trendRows: ReportTrendRow[]
  statusSummary: string
  statusImages?: ReportImage[]
  statusTopResourceRows: ReportStatusTopResourceRow[]
  statusCategoryRows: ReportStatusCategoryRow[]
  stockSummary: string
  changeSummary: string
  freshnessSummary: string
  issueSummary: string
  qualitySummary: string
  stockCategoryRows: ReportStockCategoryRow[]
  stockLayerRows: ReportStockCategoryRow[]
  changeCategoryRows: ReportChangeCategoryRow[]
  changeLayerRows: ReportChangeCategoryRow[]
  rankingSections: ReportRankingSection[]
  stockDetailRows: ReportStockDetailRow[]
  changeDetailRows: ReportChangeDetailRow[]
  freshnessMetricRows: ReportFreshnessMetricRow[]
  latestUpdatedRows: ReportFreshnessTopRow[]
  threeDayStoppedRows: ReportFreshnessTopRow[]
  yearlyStoppedRows: ReportFreshnessTopRow[]
  monthlyStoppedRows: ReportFreshnessTopRow[]
  weeklyStoppedRows: ReportFreshnessTopRow[]
  longTermStoppedRows: ReportFreshnessTopRow[]
  issueRows: ReportIssueRow[]
  qualityDetailRows: ReportQualityDetailRow[]
  conclusionLines: string[]
}

function tableSeparator(columnCount: number) {
  return Array.from({ length: Math.max(columnCount, 1) }, () => '---').join(' | ')
}

function markdownTable(headers: string[], rows: string[][], emptyRow?: string[]) {
  const normalizedRows = rows.length > 0 ? rows : emptyRow ? [emptyRow] : []
  return [
    `| ${headers.join(' | ')} |`,
    `| ${tableSeparator(headers.length)} |`,
    ...normalizedRows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function pushImages(lines: string[], images: ReportImage[] | undefined) {
  if (!images) return
  images
    .filter((image) => image?.dataUrl)
    .forEach((image) => {
      lines.push(`![${image.alt}](${image.dataUrl})`)
      lines.push('')
    })
}

function pushFreshnessTopSection(lines: string[], title: string, rows: ReportFreshnessTopRow[], emptyLabel: string) {
  lines.push(
    title,
    '',
    markdownTable(
      ['资源名称', '业务时间字段', '最新业务时间', '距今天数', '状态'],
      rows.map((row) => [row.resourceName, row.businessTimeField, row.latestBusinessTime, row.ageDays, row.status]),
      [emptyLabel, '-', '-', '-', '-'],
    ),
    '',
  )
}

export function buildRunStatsReportMarkdown(input: BuildRunStatsReportMarkdownInput) {
  const title = input.title || '数据运行分析报告'
  const stockRankingSections = input.rankingSections.filter((section) => !section.title.includes('变化') && !section.title.includes('全空'))
  const changeRankingSections = input.rankingSections.filter((section) => section.title.includes('变化'))

  const lines: string[] = [
    `# ${title}`,
    '',
    '## 一、报告总体说明',
    '',
    '### 1.1 本次报告执行基本信息',
    '',
    markdownTable(
      ['项目', '内容'],
      [
        ['统计周期', input.effectivePeriod],
        ['生成时间', input.generatedAt],
        ['数据资源数', String(input.resourceCount)],
        ['报告范围', '覆盖核心指标、趋势、联通性分布、数据存量、数据变化、数据资源新鲜度、问题数据和数据质量分析'],
      ],
      ['项目', '-'],
    ),
    '',
    '### 1.2 总体概览',
    '',
    `本次报告围绕统计周期 ${input.effectivePeriod} 形成运行分析快照，纳入数据资源 ${String(input.resourceCount)} 个。`,
    `${input.trendSummary || '暂无趋势分析说明。'} ${input.statusSummary || '暂无联通性分析说明。'} ${input.stockSummary || '暂无数据存量分析说明。'} ${input.changeSummary || '暂无数据变化分析说明。'} ${input.freshnessSummary || '暂无数据资源新鲜度分析说明。'} ${input.issueSummary || '暂无问题数据分析说明。'} ${input.qualitySummary || '暂无数据质量分析说明。'}`,
    '后续章节将分别从核心指标、趋势、联通性分布、数据存量、数据变化、数据资源新鲜度、问题数据与数据质量等维度展开详细说明。',
    '',
    '## 二、核心指标',
    '',
    markdownTable(
      ['指标', '当前值', '相对上期', '说明'],
      input.coreMetrics.map((row) => [row.label, row.value, row.change || '-', row.note || '-']),
      ['暂无指标', '-', '-', '-'],
    ),
    '',
    '## 三、统计周期趋势',
    '',
    input.trendSummary || '暂无趋势分析说明。',
    '',
  ]

  pushImages(lines, input.trendImages)

  lines.push(
    markdownTable(
      ['周期', '资源数', '记录总量', '存储总量', '变化总量', '联通通畅率'],
      input.trendRows.map((row) => [row.period, row.resources, row.totalRecords, row.totalStorage, row.totalDelta, row.normalRate]),
      ['暂无周期', '0', '0', '0', '0', '0.00%'],
    ),
    '',
    '## 四、联通性分布分析',
    '',
    input.statusSummary || '暂无联通性分析说明。',
    '',
  )

  pushImages(lines, input.statusImages)

  lines.push(
    '### 4.1 按数据量的联通性分布 Top5',
    '',
    markdownTable(
      ['资源名称', '联通状态', '记录量', '占比'],
      input.statusTopResourceRows.map((row) => [row.resourceName, row.status, row.count, row.ratio]),
      ['暂无资源', '-', '0', '0.00%'],
    ),
    '',
    '### 4.2 按一级分类的联通性分布 Top5',
    '',
    markdownTable(
      ['一级分类', '通畅资源数', '断开资源数', '缓慢资源数', '其他资源数', '通畅率'],
      input.statusCategoryRows.map((row) => [row.categoryLabel, row.normalCount, row.disconnectCount, row.slowCount, row.otherCount, row.normalRate]),
      ['暂无分类', '0', '0', '0', '0', '0.00%'],
    ),
    '',
    '字段解释：`01通畅`（可访问且可读取统计）、`02断开`（读取失败/不可访问）、`04缓慢`（读取成功但响应慢）、`99其他`。',
    '',
    '## 五、数据存量分析',
    '',
    input.stockSummary || '暂无数据存量分析说明。',
    '',
  )

  lines.push(
    '### 5.1 按一级分类统计',
    '',
    markdownTable(
      ['一级分类', '记录规模', '存储占用'],
      input.stockCategoryRows.map((row) => [row.categoryLabel, row.totalRecords, row.totalStorage]),
      ['暂无分类', '0', '0'],
    ),
    '',
    '### 5.2 按数据分层统计',
    '',
    markdownTable(
      ['数据分层', '记录规模', '存储占用'],
      input.stockLayerRows.map((row) => [row.categoryLabel, row.totalRecords, row.totalStorage]),
      ['暂无分层', '0', '0'],
    ),
    '',
    '### 5.3 按 Top5 排名',
    '',
  )

  stockRankingSections.forEach((section, index) => {
    lines.push(`#### 5.3.${index + 1} ${section.title}`)
    lines.push('')
    lines.push(
      markdownTable(
        section.headers,
        section.rows,
        Array.from({ length: section.headers.length }, (_, columnIndex) => (columnIndex === 0 ? '暂无数据' : '-')),
      ),
    )
    lines.push('')
  })

  lines.push(
    '### 5.4 明细数据列表',
    '',
    markdownTable(
      ['资源名称', '联通状态', '记录量', '存储量', '物理表数量', '字段数', '有值字段数'],
      input.stockDetailRows.map((row) => [
        row.resourceName,
        row.connectStatus,
        row.recordCount,
        row.storage,
        row.tableCount,
        row.fieldCount,
        row.nonNullFieldCount,
      ]),
      ['暂无资源', '-', '0', '0', '0', '0', '0'],
    ),
    '',
    '## 六、数据变化分析',
    '',
    input.changeSummary || '暂无数据变化分析说明。',
    '',
  )

  lines.push(
    '### 6.1 按一级分类统计',
    '',
    markdownTable(
      ['一级分类', '记录规模', '存储占用', '记录变化', '变化率'],
      input.changeCategoryRows.map((row) => [row.categoryLabel, row.totalRecords, row.totalStorage, row.totalDeltaRecords, row.totalDeltaRatio]),
      ['暂无分类', '0', '0', '0', '0.00%'],
    ),
    '',
    '### 6.2 按数据分层统计',
    '',
    markdownTable(
      ['数据分层', '记录规模', '存储占用', '记录变化', '变化率'],
      input.changeLayerRows.map((row) => [row.categoryLabel, row.totalRecords, row.totalStorage, row.totalDeltaRecords, row.totalDeltaRatio]),
      ['暂无分层', '0', '0', '0', '0.00%'],
    ),
    '',
    '### 6.3 按 Top5 排名',
    '',
  )

  changeRankingSections.forEach((section, index) => {
    lines.push(`#### 6.3.${index + 1} ${section.title}`)
    lines.push('')
    lines.push(
      markdownTable(
        section.headers,
        section.rows,
        Array.from({ length: section.headers.length }, (_, columnIndex) => (columnIndex === 0 ? '暂无数据' : '-')),
      ),
    )
    lines.push('')
  })

  lines.push(
    '### 6.4 明细数据列表',
    '',
    markdownTable(
      ['资源名称', '本期记录', '上期记录', '变化量', '变化率'],
      input.changeDetailRows.map((row) => [row.resourceName, row.currentValue, row.previousValue, row.deltaValue, row.deltaRatio]),
      ['暂无资源', '0', '0', '0', '0.00%'],
    ),
    '',
    '## 七、数据资源新鲜度分析',
    '',
    input.freshnessSummary || '暂无数据资源新鲜度分析说明。',
    '',
    '### 7.1 新鲜度指标',
    '',
    markdownTable(
      ['指标', '数值', '占比', '说明'],
      input.freshnessMetricRows.map((row) => [row.label, row.value, row.ratio, row.note]),
      ['暂无指标', '0', '0.00%', '-'],
    ),
    '',
  )

  pushFreshnessTopSection(lines, '### 7.2 最新更新资源 Top5', input.latestUpdatedRows, '暂无最新更新资源')
  pushFreshnessTopSection(lines, `### 7.3 ${FRESHNESS_STOPPED_BAND_LABELS.threeDayStopped}资源 Top5`, input.threeDayStoppedRows, `暂无${FRESHNESS_STOPPED_BAND_LABELS.threeDayStopped}资源`)
  pushFreshnessTopSection(lines, `### 7.4 ${FRESHNESS_STOPPED_BAND_LABELS.yearlyStopped}资源 Top5`, input.yearlyStoppedRows, `暂无${FRESHNESS_STOPPED_BAND_LABELS.yearlyStopped}资源`)
  pushFreshnessTopSection(lines, `### 7.5 ${FRESHNESS_STOPPED_BAND_LABELS.monthlyStopped}资源 Top5`, input.monthlyStoppedRows, `暂无${FRESHNESS_STOPPED_BAND_LABELS.monthlyStopped}资源`)
  pushFreshnessTopSection(lines, `### 7.6 ${FRESHNESS_STOPPED_BAND_LABELS.weeklyStopped}资源 Top5`, input.weeklyStoppedRows, `暂无${FRESHNESS_STOPPED_BAND_LABELS.weeklyStopped}资源`)
  pushFreshnessTopSection(lines, `### 7.7 ${FRESHNESS_STOPPED_BAND_LABELS.longTermStopped}资源 Top5`, input.longTermStoppedRows, `暂无${FRESHNESS_STOPPED_BAND_LABELS.longTermStopped}资源`)

  lines.push(
    '## 八、问题数据分析',
    '',
    input.issueSummary || '暂无问题数据分析说明。',
    '',
    '### 8.1 明细数据列表',
    '',
    markdownTable(
      ['资源名称', '联通状态', '问题类型', '异常条目', '说明'],
      input.issueRows.map((row) => [row.resourceName, row.connectStatus, row.problemType, row.errorCount, row.note]),
      ['暂无问题资源', '-', '-', '0', '-'],
    ),
    '',
    '## 九、数据质量分析',
    '',
    input.qualitySummary || '暂无数据质量分析说明。',
    '',
    '### 9.1 明细数据列表',
    '',
    markdownTable(
      ['资源名称', '全空字段数', '空表数', '错误表数', '字段数', '有值字段数', '有值率'],
      input.qualityDetailRows.map((row) => [
        row.resourceName,
        row.allNullFieldCount,
        row.emptyTableCount,
        row.errorTableCount,
        row.fieldCount,
        row.nonNullFieldCount,
        row.fillRate,
      ]),
      ['暂无资源', '0', '0', '0', '0', '0', '0.00%'],
    ),
    '',
    '## 十、结论建议',
    '',
  )

  const normalizedConclusions = input.conclusionLines.length > 0 ? input.conclusionLines : ['当前周期暂无额外建议。']
  normalizedConclusions.forEach((line) => {
    lines.push(`- ${line}`)
  })

  return lines.join('\n')
}
