import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CalendarDays, Download, FileText, Search } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { RunStatsSecondaryNav } from '../components/run-stats-secondary-nav'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import {
  buildFreshnessTopGroups,
  buildResourceRecordChangeTopItems,
  buildStatDimensionSummaries,
  connectStatusMeta,
  DATA_LAYER_SEEDS,
  extractPeriodDateKey,
  FRESHNESS_STOPPED_BAND_LABELS,
  FRESHNESS_STOPPED_BAND_NOTES,
  fetchRunStatsJobOptionsByExecutionDate,
  fetchRunStatsJobOptionsByTask,
  formatMB,
  formatDateInputValue,
  formatNumber,
  isFreshBusinessTime,
  isStaleBusinessTime,
  type PeriodSummary,
  type RunStatsJobOption,
  type RunStatsData,
  type StatDimensionSummary,
  type StatRecord,
  useRunStatsData,
  useRunStatsTasks,
} from '../lib/nocobase-stat-data'
import { toErrorMessage } from '../lib/nocobase-client'
import { buildPaginationItems } from '../lib/pagination'
import {
  buildRunStatsReportSelectionSearch,
  resolveRunStatsReportFilters,
  shouldAutoQueryRunStatsReportList,
  shouldApplyPreferredRunStatsReportFilters,
} from '../lib/run-stats-report-page-state'
import { buildDomainStatsRows, type DomainStatsRow } from '../lib/run-stats-domain'
import { buildRunStatsReportMarkdown } from '../lib/run-stats-report-markdown'
import { resolveRunStatsTrendChartBounds } from '../lib/run-stats-trend'

function formatExecutionTimeLabel(value: string) {
  if (!value) return '执行时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

type CategoryTopSummaryItem = StatDimensionSummary

type ConnectivityTopResourceRow = {
  key: string
  resourceId: string
  resourceCode: string
  resourceName: string
  connectStatus: string
  connectLabel: string
  connectToneClass: string
  color: string
  recordCount: number
  recordShare: number
}

type ConnectivityCategoryRow = {
  key: string
  label: string
  totalRecords: number
  totalResources: number
  normalCount: number
  disconnectCount: number
  slowCount: number
  otherCount: number
  normalRate: number
}

const CONNECT_STATUS_ORDER = ['01', '02', '04', '99'] as const
const CONNECT_STATUS_PALETTE: Record<string, string> = {
  '01': '#12b886',
  '02': '#f03e3e',
  '04': '#f59f00',
  '99': '#64748b',
}

function resolveStatTopCategory(item: Pick<StatRecord, 'domainCategoryId' | 'domainCategoryName'>) {
  const rawLabel = String(item.domainCategoryName ?? '').trim()
  const label = rawLabel
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)[0] ?? '未标注'
  const id = String(item.domainCategoryId ?? '').trim() || label || 'UNCLASSIFIED'

  return {
    id,
    label: label || '未标注',
    order: 999,
  }
}

function toPercent(value: number, fraction = 2) {
  return `${(value * 100).toFixed(fraction)}%`
}

function toGBOrMB(bytes: number) {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(2)} MB`
}

function metricDeltaTag(value: number, unit = '') {
  if (value > 0) return `+${value.toLocaleString('zh-CN')}${unit}`
  if (value < 0) return `${value.toLocaleString('zh-CN')}${unit}`
  return `0${unit}`
}

function formatRatio(ratio: number | null | undefined) {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '+0.00%'
  const sign = ratio > 0 ? '+' : ''
  return `${sign}${(ratio * 100).toFixed(2)}%`
}

function calcPeriodRatioDelta(current: number, previous: number | undefined) {
  if (typeof previous !== 'number' || !Number.isFinite(previous)) return 0
  if (previous <= 0) return current > 0 ? 1 : 0
  return (current - previous) / previous
}

function formatTrendPeriodLabel(periodCode: string) {
  return periodCode.slice(2).replace('_', '-')
}

function formatDelta(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumber(value)}`
}

function getPeriodRecordDelta(periods: PeriodSummary[], periodCode: string) {
  const index = periods.findIndex((item) => item.periodCode === periodCode)
  if (index <= 0) return 0
  return periods[index].totalRecords - periods[index - 1].totalRecords
}

function buildConnectivityTopResourceRows(records: StatRecord[]): ConnectivityTopResourceRow[] {
  const totalRecords = records.reduce((sum, item) => sum + (item.metainfo.record_count ?? 0), 0)
  return [...records]
    .sort((a, b) => (b.metainfo.record_count ?? 0) - (a.metainfo.record_count ?? 0))
    .slice(0, 5)
    .map((item) => {
      const code = item.connectStatus || '99'
      return {
        key: item.resourceId || item.resourceCode || item.id,
        resourceId: item.resourceId || '',
        resourceCode: item.resourceCode || '-',
        resourceName: item.resourceName || '未命名资源',
        connectStatus: code,
        connectLabel: connectStatusMeta(code).label.replace('连通', ''),
        connectToneClass: connectStatusMeta(code).toneClass,
        color: CONNECT_STATUS_PALETTE[code] || CONNECT_STATUS_PALETTE['99'],
        recordCount: item.metainfo.record_count ?? 0,
        recordShare: totalRecords > 0 ? (item.metainfo.record_count ?? 0) / totalRecords : 0,
      }
    })
}

function buildConnectivityCategoryRows(
  records: StatRecord[],
  resolveTopCategory: (item: StatRecord) => { id: string; label: string; order: number },
  limit = 5,
): ConnectivityCategoryRow[] {
  const grouped = new Map<string, ConnectivityCategoryRow>()

  records.forEach((item) => {
    const category = resolveTopCategory(item)
    const current = grouped.get(category.id) || {
      key: category.id,
      label: category.label,
      totalRecords: 0,
      totalResources: 0,
      normalCount: 0,
      disconnectCount: 0,
      slowCount: 0,
      otherCount: 0,
      normalRate: 0,
    }
    const code = item.connectStatus || '99'
    current.totalRecords += item.metainfo.record_count ?? 0
    current.totalResources += 1
    if (code === '01') current.normalCount += 1
    else if (code === '02') current.disconnectCount += 1
    else if (code === '04') current.slowCount += 1
    else current.otherCount += 1
    grouped.set(category.id, current)
  })

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      normalRate: row.totalResources > 0 ? row.normalCount / row.totalResources : 0,
    }))
    .sort((a, b) => b.totalRecords - a.totalRecords)
    .slice(0, limit)
}

function topResourceLine(items: StatRecord[]) {
  if (items.length === 0) return '本周期暂无统计数据。'
  const top = [...items].sort((a, b) => (b.metainfo.record_count ?? 0) - (a.metainfo.record_count ?? 0))[0]
  return `${top.resourceName}（${formatNumber(top.metainfo.record_count ?? 0)} 条）`
}

function inferTrendText(current: PeriodSummary | undefined, previous: PeriodSummary | undefined) {
  if (!current) return '暂无可分析的周期数据。'
  if (!previous) {
    return '当前仅检测到一个统计周期，已输出该周期全量指标。建议后续连续执行统计任务，以形成上一统计批次对比与趋势分析。'
  }
  const recordDelta = current.totalRecords - previous.totalRecords
  const storageDelta = current.totalStorageBytes - previous.totalStorageBytes
  const normalRateCurrent = current.resources > 0 ? current.normalCount / current.resources : 0
  const normalRatePrevious = previous.resources > 0 ? previous.normalCount / previous.resources : 0
  const normalRateDelta = normalRateCurrent - normalRatePrevious

  return [
    `记录总量较上一统计批次${recordDelta >= 0 ? '上升' : '下降'} ${metricDeltaTag(recordDelta, ' 条')}。`,
    `存储总量较上一统计批次${storageDelta >= 0 ? '上升' : '下降'} ${toGBOrMB(Math.abs(storageDelta))}。`,
    `变化总量为 ${metricDeltaTag(recordDelta, ' 条')}。`,
    `联通通畅率变化 ${formatRatio(normalRateDelta)}，当前为 ${toPercent(normalRateCurrent)}。`,
  ].join(' ')
}

function formatSigned(value: number) {
  if (value > 0) return `+${formatNumber(value)}`
  if (value < 0) return `${formatNumber(value)}`
  return '0'
}

function buildStockAnalysisSummary(rows: DomainStatsRow[]) {
  if (rows.length === 0) return '当前周期没有可用于一级领域分析的数据。'

  const topStock = rows.reduce((best, row) => (row.stockCount > best.stockCount ? row : best), rows[0])
  return `数据存量最高领域为「${topStock.domain}」，存量 ${formatNumber(topStock.stockCount)} 条，纳入统计资源数 ${formatNumber(topStock.resources)} 个。`
}

function buildChangeAnalysisSummary(rows: DomainStatsRow[]) {
  if (rows.length === 0) return '当前周期没有可用于变化分析的一级领域数据。'

  const topGrow = rows.filter((row) => row.changeCount > 0).sort((a, b) => b.changeCount - a.changeCount)[0]
  const topDecline = rows.filter((row) => row.changeCount < 0).sort((a, b) => a.changeCount - b.changeCount)[0]

  return [
    topGrow ? `增长最快领域为「${topGrow.domain}」，变化量 ${formatSigned(topGrow.changeCount)} 条。` : '本周期未出现正向增长领域。',
    topDecline ? `下降最明显领域为「${topDecline.domain}」，变化量 ${formatSigned(topDecline.changeCount)} 条。` : '本周期未出现负向变化领域。',
  ].join(' ')
}

function buildLayerStockAnalysisSummary(rows: CategoryTopSummaryItem[], unclassifiedCount: number) {
  const activeRows = rows.filter((row) => row.resourceCount > 0)
  if (activeRows.length === 0) {
    return unclassifiedCount > 0
      ? `当前周期有 ${formatNumber(unclassifiedCount)} 个资源未识别到 ODS / DWD / DWS / ADS / DIM 主分层。`
      : '当前周期没有可用于数据分层分析的资源。'
  }

  const topStock = activeRows.reduce((best, row) => (row.totalRecords > best.totalRecords ? row : best), activeRows[0])
  const suffix = unclassifiedCount > 0 ? `另有 ${formatNumber(unclassifiedCount)} 个资源未识别到五层主分层。` : ''
  return `按资源主分层统计，记录规模最高的是「${topStock.label}」，记录总量 ${formatNumber(topStock.totalRecords)} 条，存储占用 ${formatMB(topStock.totalStorageBytes)}。${suffix}`.trim()
}

function buildLayerChangeAnalysisSummary(rows: CategoryTopSummaryItem[]) {
  const activeRows = rows.filter((row) => row.resourceCount > 0)
  if (activeRows.length === 0) return '当前周期没有可用于数据分层变化分析的资源。'

  const topGrow = activeRows.filter((row) => row.totalDeltaRecords > 0).sort((a, b) => b.totalDeltaRecords - a.totalDeltaRecords)[0]
  const topDecline = activeRows.filter((row) => row.totalDeltaRecords < 0).sort((a, b) => a.totalDeltaRecords - b.totalDeltaRecords)[0]

  return [
    topGrow ? `增长最快分层为「${topGrow.label}」，变化量 ${formatSigned(topGrow.totalDeltaRecords)} 条。` : '本周期未出现正向增长分层。',
    topDecline ? `下降最明显分层为「${topDecline.label}」，变化量 ${formatSigned(topDecline.totalDeltaRecords)} 条。` : '本周期未出现负向变化分层。',
  ].join(' ')
}

function buildTrendChartImage(
  periods: PeriodSummary[],
  metric: 'record' | 'storage' | 'delta',
) {
  const width = 1200
  const height = 520
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const chartPeriods = periods.slice(-10)
  const values = chartPeriods.map((item) =>
    metric === 'record'
      ? item.totalRecords
      : metric === 'storage'
        ? item.totalStorageBytes / (1024 * 1024)
        : getPeriodRecordDelta(periods, item.periodCode),
  )
  const bounds = resolveRunStatsTrendChartBounds(values, {
    scaleMode: metric === 'delta' ? 'zero-baseline' : 'range',
  })
  const title = metric === 'record' ? '记录总量趋势图' : metric === 'storage' ? '存储总量趋势图' : '变化总量趋势图'
  const color = metric === 'record' ? '#2f6fe6' : metric === 'storage' ? '#17a26f' : '#d97706'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 30px PingFang SC, Microsoft YaHei, sans-serif'
  ctx.fillText(title, 46, 52)

  if (chartPeriods.length === 0) return canvas.toDataURL('image/png')

  const chartX = 70
  const chartY = 90
  const chartW = width - 120
  const chartH = 320
  const step = chartPeriods.length > 1 ? chartW / (chartPeriods.length - 1) : 0

  ctx.strokeStyle = '#dbe5ee'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i += 1) {
    const y = chartY + (chartH / 4) * i
    ctx.beginPath()
    ctx.moveTo(chartX, y)
    ctx.lineTo(chartX + chartW, y)
    ctx.stroke()
  }

  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.beginPath()
  values.forEach((value, index) => {
    const x = chartX + index * step
    const ratio = (value - bounds.min) / Math.max(bounds.max - bounds.min, 1)
    const y = chartY + chartH - ratio * chartH
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  values.forEach((value, index) => {
    const x = chartX + index * step
    const ratio = (value - bounds.min) / Math.max(bounds.max - bounds.min, 1)
    const y = chartY + chartH - ratio * chartH
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 5.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#334155'
    ctx.font = '16px PingFang SC, Microsoft YaHei, sans-serif'
    const label = metric === 'record' ? formatNumber(value) : metric === 'storage' ? `${value.toFixed(2)} MB` : `${value > 0 ? '+' : ''}${formatNumber(value)}`
    ctx.fillText(label, x - 28, y - 12)
    ctx.fillText(formatTrendPeriodLabel(chartPeriods[index].periodCode), x - 28, chartY + chartH + 28)
  })

  return canvas.toDataURL('image/png')
}

function buildConnectivityTopResourceChartImage(rows: ConnectivityTopResourceRow[]) {
  const width = 1200
  const height = 420
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 30px PingFang SC, Microsoft YaHei, sans-serif'
  ctx.fillText('按数据量的联通性分布 Top5', 46, 52)

  if (rows.length === 0) return canvas.toDataURL('image/png')

  const topRecordCount = rows[0]?.recordCount || 0
  rows.forEach((row, index) => {
    const y = 112 + index * 56
    const barX = 72
    const barY = y + 12
    const barW = 560
    const barH = 16

    ctx.fillStyle = '#334155'
    ctx.font = '18px PingFang SC, Microsoft YaHei, sans-serif'
    ctx.fillText(`${index + 1}. ${row.resourceName}`, 72, y)
    ctx.font = '15px PingFang SC, Microsoft YaHei, sans-serif'
    ctx.fillStyle = '#64748b'
    ctx.fillText(`${row.resourceCode} · ${row.connectLabel}`, 72, y + 24)

    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(barX, barY, barW, barH)
    ctx.fillStyle = row.color
    ctx.fillRect(barX, barY, topRecordCount > 0 ? (row.recordCount / topRecordCount) * barW : 0, barH)

    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 18px PingFang SC, Microsoft YaHei, sans-serif'
    ctx.fillText(`${formatNumber(row.recordCount)} 条`, 680, y + 8)
    ctx.fillStyle = '#64748b'
    ctx.font = '15px PingFang SC, Microsoft YaHei, sans-serif'
    ctx.fillText(`占比 ${toPercent(row.recordShare, 1)}`, 680, y + 30)
  })

  return canvas.toDataURL('image/png')
}

function buildConnectivityCategoryChartImage(rows: ConnectivityCategoryRow[]) {
  const width = 1200
  const height = 440
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 30px PingFang SC, Microsoft YaHei, sans-serif'
  ctx.fillText('按一级分类的联通性分布 Top5', 46, 52)

  if (rows.length === 0) return canvas.toDataURL('image/png')

  rows.slice(0, 6).forEach((row, index) => {
    const y = 114 + index * 52
    const total = Math.max(row.totalResources, 1)
    let currentX = 360

    ctx.fillStyle = '#334155'
    ctx.font = '17px PingFang SC, Microsoft YaHei, sans-serif'
    ctx.fillText(row.label, 72, y)
    ctx.fillStyle = '#64748b'
    ctx.font = '14px PingFang SC, Microsoft YaHei, sans-serif'
    ctx.fillText(`资源 ${formatNumber(row.totalResources)} · 记录 ${formatNumber(row.totalRecords)} 条`, 72, y + 20)

    CONNECT_STATUS_ORDER.forEach((code) => {
      const count = code === '01'
        ? row.normalCount
        : code === '02'
          ? row.disconnectCount
          : code === '04'
            ? row.slowCount
            : row.otherCount
      const widthValue = (count / total) * 420
      ctx.fillStyle = CONNECT_STATUS_PALETTE[code]
      ctx.fillRect(currentX, y - 8, widthValue, 14)
      currentX += widthValue
    })

    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 16px PingFang SC, Microsoft YaHei, sans-serif'
    ctx.fillText(`通畅率 ${toPercent(row.normalRate, 1)}`, 820, y + 4)
    ctx.fillStyle = '#64748b'
    ctx.font = '13px PingFang SC, Microsoft YaHei, sans-serif'
    ctx.fillText(`通畅 ${row.normalCount} / 断开 ${row.disconnectCount} / 缓慢 ${row.slowCount} / 其他 ${row.otherCount}`, 820, y + 24)
  })

  return canvas.toDataURL('image/png')
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadText(content: string, fileName: string, mimeType: string) {
  downloadBlob(new Blob([content], { type: mimeType }), fileName)
}

async function downloadDocx(markdown: string, period: string) {
  const { buildDocxBlobFromMarkdown } = await import('../lib/report-docx')
  const blob = await buildDocxBlobFromMarkdown(markdown)
  downloadBlob(blob, `数据运行分析报告-${period}.docx`)
}

export function RunStatsReportPage() {
  const location = useLocation()
  const { data, isHydratingHistory, error, ensurePeriodLoaded } = useRunStatsData(false, { lazyByDate: true })
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedTaskCode, setSelectedTaskCode] = useState('')
  const [queriedExecutionDate, setQueriedExecutionDate] = useState('')
  const [queriedTaskCode, setQueriedTaskCode] = useState('')
  const [queriedJobOptions, setQueriedJobOptions] = useState<RunStatsJobOption[]>([])
  const [hasSyncedQueryPeriod, setHasSyncedQueryPeriod] = useState(false)
  const [pendingQueryPeriodDate, setPendingQueryPeriodDate] = useState('')
  const [selectedExecutionDate, setSelectedExecutionDate] = useState('')
  const [submittingQueryExecutionDate, setSubmittingQueryExecutionDate] = useState('')
  const [submittingQueryTaskCode, setSubmittingQueryTaskCode] = useState('')
  const [reportListPage, setReportListPage] = useState(1)
  const [downloadingPeriod, setDownloadingPeriod] = useState('')
  const [downloadingDocxPeriod, setDownloadingDocxPeriod] = useState('')
  const [queryHint, setQueryHint] = useState('')
  const [reportListError, setReportListError] = useState<string | null>(null)
  const queryPeriodRequestIdRef = useRef(0)
  const reportListRequestIdRef = useRef(0)
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const { taskOptions, periodTaskMap, loadingExecutionDate: loadingTaskExecutionDate, ensureExecutionDateLoaded: ensureTaskExecutionDateLoaded } = useRunStatsTasks(true, data.periods)

  const queryPeriod = (searchParams.get('period') || '').trim()
  const queryExecutionDate = (searchParams.get('executionDate') || '').trim()
  const queryTaskCode = (searchParams.get('taskCode') || '').trim()
  const defaultExecutionDate = useMemo(() => {
    const today = formatDateInputValue(new Date())
    return today
  }, [])
  const preferredFilters = useMemo(
    () => resolveRunStatsReportFilters({
      queryExecutionDate,
      queryTaskCode,
      defaultExecutionDate,
    }),
    [defaultExecutionDate, queryExecutionDate, queryTaskCode],
  )
  const hasActiveQuery = Boolean(queriedExecutionDate && queriedTaskCode)
  const filteredPeriodOptions = queriedJobOptions
  const reportListPageSize = 10
  const reportListTotalPages = Math.max(1, Math.ceil(filteredPeriodOptions.length / reportListPageSize))
  const pagedPeriodSummaries = useMemo(() => {
    const start = (reportListPage - 1) * reportListPageSize
    return filteredPeriodOptions.slice(start, start + reportListPageSize)
  }, [filteredPeriodOptions, reportListPage])
  const reportListPaginationItems = useMemo(
    () => buildPaginationItems(reportListPage, reportListTotalPages),
    [reportListPage, reportListTotalPages],
  )
  const syncReportListSearchParams = useCallback((executionDate: string, taskCode: string) => {
    const nextSearch = buildRunStatsReportSelectionSearch({
      selectedExecutionDate: executionDate,
      selectedTaskCode: taskCode,
    })
    if (searchParams.toString() === nextSearch) return
    setSearchParams(nextSearch ? new URLSearchParams(nextSearch) : new URLSearchParams(), { replace: true })
  }, [searchParams, setSearchParams])

  const runReportListQuery = useCallback((executionDate: string, taskCode: string, syncLocation = true) => {
    if (!executionDate || !taskCode) return
    if (syncLocation && !queryPeriod) {
      syncReportListSearchParams(executionDate, taskCode)
    }

    const requestId = reportListRequestIdRef.current + 1
    reportListRequestIdRef.current = requestId
    setSubmittingQueryExecutionDate(executionDate)
    setSubmittingQueryTaskCode(taskCode)
    setSelectedPeriod('')
    setQueryHint('')
    setReportListError(null)

    void fetchRunStatsJobOptionsByExecutionDate(executionDate, taskCode)
      .then((jobOptions) => {
        if (reportListRequestIdRef.current !== requestId) return
        setQueriedExecutionDate(executionDate)
        setQueriedTaskCode(taskCode)
        setQueriedJobOptions(jobOptions)
        setQueryHint(`已查询到 ${jobOptions.length} 个报告周期。`)
      })
      .catch((err) => {
        if (reportListRequestIdRef.current !== requestId) return
        setQueriedExecutionDate('')
        setQueriedTaskCode('')
        setQueriedJobOptions([])
        setReportListError(toErrorMessage(err, '查询报告列表失败'))
      })
      .finally(() => {
        if (reportListRequestIdRef.current === requestId) {
          setSubmittingQueryExecutionDate('')
          setSubmittingQueryTaskCode('')
        }
      })
  }, [queryPeriod, syncReportListSearchParams])

  useEffect(() => {
    queryPeriodRequestIdRef.current += 1
    setHasSyncedQueryPeriod(false)
    setPendingQueryPeriodDate('')
    setQueriedExecutionDate('')
    setQueriedTaskCode('')
    setQueriedJobOptions([])
    setSelectedPeriod('')
    setQueryHint('')
    setReportListError(null)
    if (queryPeriod) return
    if (!shouldApplyPreferredRunStatsReportFilters({
      queryPeriod,
      selectedExecutionDate,
      selectedTaskCode,
    })) {
      return
    }
    setSelectedExecutionDate(preferredFilters.selectedExecutionDate)
    setSelectedTaskCode(preferredFilters.selectedTaskCode)
  }, [
    preferredFilters.selectedExecutionDate,
    preferredFilters.selectedTaskCode,
    queryPeriod,
    selectedExecutionDate,
    selectedTaskCode,
  ])

  useEffect(() => {
    if (!selectedExecutionDate) return
    void ensureTaskExecutionDateLoaded(selectedExecutionDate)
  }, [selectedExecutionDate, ensureTaskExecutionDateLoaded])

  useEffect(() => {
    if (!selectedTaskCode) return
    if (taskOptions.length === 0) return
    const matchedTask = taskOptions.find((option) => option.taskCode === selectedTaskCode)
    if (!matchedTask) {
      setSelectedTaskCode('')
    }
  }, [selectedTaskCode, taskOptions])

  useEffect(() => {
    if (selectedExecutionDate && selectedTaskCode) return
    if (!queriedExecutionDate && !queriedTaskCode && !submittingQueryExecutionDate && !submittingQueryTaskCode && queriedJobOptions.length === 0) return
    setQueriedExecutionDate('')
    setQueriedTaskCode('')
    setQueriedJobOptions([])
    setReportListError(null)
    setSubmittingQueryExecutionDate('')
    setSubmittingQueryTaskCode('')
    setSelectedPeriod('')
  }, [
    queriedJobOptions.length,
    queriedExecutionDate,
    queriedTaskCode,
    selectedExecutionDate,
    selectedTaskCode,
    submittingQueryExecutionDate,
    submittingQueryTaskCode,
  ])

  useEffect(() => {
    setReportListPage(1)
  }, [queriedExecutionDate, queriedTaskCode])

  useEffect(() => {
    if (reportListPage > reportListTotalPages) {
      setReportListPage(reportListTotalPages)
    }
  }, [reportListPage, reportListTotalPages])

  useEffect(() => {
    if (queryPeriod && !hasSyncedQueryPeriod) {
      const queryPeriodDate = extractPeriodDateKey(queryPeriod)
      if (!queryPeriodDate) {
        setSelectedExecutionDate(preferredFilters.selectedExecutionDate)
        setSelectedTaskCode(preferredFilters.selectedTaskCode)
        setHasSyncedQueryPeriod(true)
        setQueryHint(`未找到统计周期 ${queryPeriod}，请重新选择查询条件。`)
        return
      }

      if (pendingQueryPeriodDate === queryPeriodDate) {
        return
      }

      const requestId = queryPeriodRequestIdRef.current
      setPendingQueryPeriodDate(queryPeriodDate)
      setSelectedExecutionDate(queryPeriodDate)
      setSelectedTaskCode('')
      setSelectedPeriod('')
      setQueriedJobOptions([])
      setReportListError(null)
      setQueryHint('')
      void ensureTaskExecutionDateLoaded(queryPeriodDate)
        .then(async (taskPayload) => {
          if (queryPeriodRequestIdRef.current !== requestId) return

          const taskCode = taskPayload.periodTaskMap[queryPeriod]?.taskCode ?? ''
          if (!taskCode) {
            setSelectedExecutionDate(preferredFilters.selectedExecutionDate)
            setSelectedTaskCode(preferredFilters.selectedTaskCode)
            setSelectedPeriod('')
            setHasSyncedQueryPeriod(true)
            setQueryHint(`未找到统计周期 ${queryPeriod}，请重新选择查询条件。`)
            return
          }

          const jobOptions = await fetchRunStatsJobOptionsByExecutionDate(queryPeriodDate, taskCode)
          if (queryPeriodRequestIdRef.current !== requestId) return

          if (!jobOptions.some((item) => item.periodCode === queryPeriod)) {
            setSelectedExecutionDate(preferredFilters.selectedExecutionDate)
            setSelectedTaskCode(preferredFilters.selectedTaskCode)
            setSelectedPeriod('')
            setHasSyncedQueryPeriod(true)
            setQueryHint(`未找到统计周期 ${queryPeriod}，请重新选择查询条件。`)
            return
          }

          setSelectedExecutionDate(queryPeriodDate)
          setSelectedTaskCode(taskCode)
          setSelectedPeriod('')
          setHasSyncedQueryPeriod(true)
          setQueryHint(`已定位到统计周期 ${queryPeriod}，正在加载报告列表。`)
        })
        .catch(() => {
          if (queryPeriodRequestIdRef.current !== requestId) return
          setSelectedExecutionDate(preferredFilters.selectedExecutionDate)
          setSelectedTaskCode(preferredFilters.selectedTaskCode)
          setSelectedPeriod('')
          setHasSyncedQueryPeriod(true)
          setQueryHint(`未找到统计周期 ${queryPeriod}，请重新选择查询条件。`)
        })
        .finally(() => {
          if (queryPeriodRequestIdRef.current === requestId) {
            setPendingQueryPeriodDate('')
          }
        })
      return
    }

    if (!selectedExecutionDate) {
      setSelectedExecutionDate(preferredFilters.selectedExecutionDate)
    }
  }, [
    hasSyncedQueryPeriod,
    pendingQueryPeriodDate,
    preferredFilters.selectedExecutionDate,
    preferredFilters.selectedTaskCode,
    queryPeriod,
    selectedExecutionDate,
    defaultExecutionDate,
    ensureTaskExecutionDateLoaded,
  ])

  useEffect(() => {
    if (!hasActiveQuery || !queriedExecutionDate) {
      setSelectedPeriod('')
      return
    }
    if (filteredPeriodOptions.length === 0) {
      setSelectedPeriod('')
      return
    }
    if (selectedPeriod && filteredPeriodOptions.some((summary) => summary.periodCode === selectedPeriod)) {
      return
    }
    setSelectedPeriod(filteredPeriodOptions[0]?.periodCode ?? '')
  }, [filteredPeriodOptions, hasActiveQuery, queriedExecutionDate, selectedPeriod])

  const isExecutionDatePending = Boolean(pendingQueryPeriodDate) && pendingQueryPeriodDate === selectedExecutionDate
  const isTaskExecutionDateLoading = Boolean(loadingTaskExecutionDate) && loadingTaskExecutionDate === selectedExecutionDate
  const isWaitingForQueryPeriod = Boolean(queryPeriod) && !hasSyncedQueryPeriod && (isTaskExecutionDateLoading || isExecutionDatePending)
  const isExecutionDateLoadingWithTask = isExecutionDatePending || isTaskExecutionDateLoading
  const isSubmittingQuery = Boolean(submittingQueryExecutionDate && submittingQueryTaskCode)
  const hasSelectedTaskOption = Boolean(
    selectedTaskCode && taskOptions.some((option) => option.taskCode === selectedTaskCode),
  )
  const pageError = reportListError ?? error
  const reportListActionButtonClass =
    'inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 !text-[0.75rem] font-semibold !leading-none !text-[var(--text-secondary)] hover:border-[rgba(var(--theme-soft-rgb),0.32)] hover:bg-[var(--surface-raised-strong)] hover:!text-[var(--primary)]'

  useEffect(() => {
    if (!hasSelectedTaskOption) return
    if (!shouldAutoQueryRunStatsReportList({
      selectedExecutionDate,
      selectedTaskCode,
      queriedExecutionDate,
      queriedTaskCode,
      isExecutionDateLoadingWithTask,
      isSubmittingQuery,
      queryPeriod,
      hasSyncedQueryPeriod,
    })) {
      return
    }

    runReportListQuery(selectedExecutionDate, selectedTaskCode)
  }, [
    hasSelectedTaskOption,
    hasSyncedQueryPeriod,
    isExecutionDateLoadingWithTask,
    isSubmittingQuery,
    queryPeriod,
    queriedExecutionDate,
    queriedTaskCode,
    runReportListQuery,
    selectedExecutionDate,
    selectedTaskCode,
  ])

  const resolveTopCategory = (item: StatRecord) => resolveStatTopCategory(item)

  const buildReportPayloadForPeriod = (periodCode: string, sourceData: RunStatsData = data) => {
    const targetSummary = sourceData.periodSummaries.find((item) => item.periodCode === periodCode)
    if (!targetSummary) return null

    const targetIndex = sourceData.periodSummaries.findIndex((item) => item.periodCode === periodCode)
    const targetPreviousSummary = targetIndex >= 0 && targetIndex + 1 < sourceData.periodSummaries.length
      ? sourceData.periodSummaries[targetIndex + 1]
      : undefined
    const targetRecords = sourceData.records.filter((item) => item.periodCode === periodCode)
    const targetPreviousRecords = targetPreviousSummary
      ? sourceData.records.filter((item) => item.periodCode === targetPreviousSummary.periodCode)
      : []
    const trendWindow = sourceData.periodSummaries.slice(0, 12).reverse()

    const targetTotalRecords = targetRecords.reduce((sum, item) => sum + (item.metainfo.record_count ?? 0), 0)
    const targetTotalStorageBytes = targetRecords.reduce((sum, item) => sum + (item.metainfo.storage_bytes ?? 0), 0)
    const targetTotalFieldCount = targetRecords.reduce((sum, item) => sum + (item.metainfo.field_count ?? 0), 0)
    const targetTotalNonNullFields = targetRecords.reduce((sum, item) => sum + (item.metainfo.non_null_field_count ?? 0), 0)
    const targetNormalCount = targetRecords.filter((item) => item.connectStatus === '01').length
    const targetAbnormalCount = targetRecords.filter((item) => item.connectStatus === '02' || item.connectStatus === '99').length
    const targetSlowCount = targetRecords.filter((item) => item.connectStatus === '04').length
    const targetErrorItemsCount = targetRecords.filter((item) => item.errorList.length > 0).length
    const targetFreshCount = targetRecords.filter(isFreshBusinessTime).length
    const targetStaleRows = [...targetRecords]
      .filter(isStaleBusinessTime)
      .sort((a, b) => (b.metainfo.business_time_age_days ?? 0) - (a.metainfo.business_time_age_days ?? 0))
    const targetFreshnessTopGroups = buildFreshnessTopGroups(targetRecords, targetSummary.executedAt || '')
    const targetNormalRate = targetRecords.length > 0 ? targetNormalCount / targetRecords.length : 0
    const targetFreshnessRate = targetRecords.length > 0 ? targetFreshCount / targetRecords.length : 0
    const targetFillRate = targetTotalFieldCount > 0 ? targetTotalNonNullFields / targetTotalFieldCount : 0
    const targetAvgFieldCount = targetRecords.length > 0 ? targetTotalFieldCount / targetRecords.length : 0
    const targetPreviousNormalRate = targetPreviousSummary && targetPreviousSummary.resources > 0
      ? targetPreviousSummary.normalCount / targetPreviousSummary.resources
      : 0
    const targetResourceRatioDelta = calcPeriodRatioDelta(targetRecords.length, targetPreviousSummary?.resources)
    const targetRecordRatioDelta = calcPeriodRatioDelta(targetSummary.totalRecords, targetPreviousSummary?.totalRecords)
    const targetStorageRatioDelta = calcPeriodRatioDelta(targetSummary.totalStorageBytes, targetPreviousSummary?.totalStorageBytes)
    const targetNormalRateRatioDelta = calcPeriodRatioDelta(targetNormalRate, targetPreviousNormalRate)
    const targetFreshnessRateRatioDelta = calcPeriodRatioDelta(targetFreshnessRate, targetPreviousSummary?.freshnessRate)
    const targetConnectivityTopResourceRows = buildConnectivityTopResourceRows(targetRecords)
    const targetConnectivityCategoryRows = buildConnectivityCategoryRows(targetRecords, resolveTopCategory, 5)
    const targetTopByRecord = [...targetRecords].sort((a, b) => (b.metainfo.record_count ?? 0) - (a.metainfo.record_count ?? 0)).slice(0, 5)
    const targetTopByStorage = [...targetRecords].sort((a, b) => (b.metainfo.storage_bytes ?? 0) - (a.metainfo.storage_bytes ?? 0)).slice(0, 5)
    const targetDynamicChanges = buildResourceRecordChangeTopItems(targetRecords, targetPreviousRecords, 20)
    const targetDynamicTopChanges = targetDynamicChanges.slice(0, 5)

    const targetDomainStatsRows = buildDomainStatsRows(targetRecords, (item) => resolveTopCategory(item).label)
    const targetCategoryTopSummaries = buildStatDimensionSummaries(
      targetRecords,
      (item) => {
        const category = resolveTopCategory(item)
        return {
          key: category.id,
          label: category.label,
          order: category.order,
        }
      },
      { limit: 5, sortBy: 'recordsDesc' },
    )
    const targetLayerTopSummaries = buildStatDimensionSummaries(
      targetRecords.filter((item) => item.dataLayerCode !== 'OTHER'),
      (item) => {
        const seed = DATA_LAYER_SEEDS.find((entry) => entry.key === item.dataLayerCode)
        return {
          key: item.dataLayerCode,
          label: item.dataLayerName,
          order: seed?.order ?? 999,
        }
      },
      { sortBy: 'order', seedGroups: DATA_LAYER_SEEDS },
    )
    const targetUnclassifiedLayerCount = targetRecords.filter((item) => item.dataLayerCode === 'OTHER').length
    const targetDetailSnapshotRows = [...targetRecords]
      .sort((a, b) => (b.metainfo.record_count ?? 0) - (a.metainfo.record_count ?? 0) || (b.metainfo.storage_bytes ?? 0) - (a.metainfo.storage_bytes ?? 0))
      .slice(0, 20)
    const targetIssueRows = [...targetRecords]
      .filter((item) => item.connectStatus !== '01' || item.errorList.length > 0 || isStaleBusinessTime(item))
      .sort((a, b) => {
        const staleDiff = (isStaleBusinessTime(b) ? 1 : 0) - (isStaleBusinessTime(a) ? 1 : 0)
        if (staleDiff !== 0) return staleDiff
        const statusDiff = (b.connectStatus !== '01' ? 1 : 0) - (a.connectStatus !== '01' ? 1 : 0)
        if (statusDiff !== 0) return statusDiff
        const errorDiff = b.errorList.length - a.errorList.length
        if (errorDiff !== 0) return errorDiff
        return (b.metainfo.record_count ?? 0) - (a.metainfo.record_count ?? 0)
      })
      .slice(0, 20)
    const targetQualityDetailRows = [...targetRecords]
      .sort((a, b) => {
        const allNullDiff = (b.quality.all_null_field_count ?? 0) - (a.quality.all_null_field_count ?? 0)
        if (allNullDiff !== 0) return allNullDiff
        const emptyTableDiff = (b.quality.empty_table_count ?? 0) - (a.quality.empty_table_count ?? 0)
        if (emptyTableDiff !== 0) return emptyTableDiff
        return (b.quality.error_table_count ?? 0) - (a.quality.error_table_count ?? 0)
      })
      .slice(0, 20)

    const targetStockAnalysisSummary = buildStockAnalysisSummary(targetDomainStatsRows)
    const targetChangeAnalysisSummary = buildChangeAnalysisSummary(targetDomainStatsRows)
    const targetLayerStockAnalysisSummary = buildLayerStockAnalysisSummary(targetLayerTopSummaries, targetUnclassifiedLayerCount)
    const targetLayerChangeAnalysisSummary = buildLayerChangeAnalysisSummary(targetLayerTopSummaries)
    const targetTrendText = inferTrendText(targetSummary, targetPreviousSummary)
    const targetTopLine = topResourceLine(targetRecords)
    const targetAbnormalLine = targetAbnormalCount > 0 ? `${targetAbnormalCount} 个资源存在断开/其他状态` : '未发现断开状态资源'
    const targetFreshnessSummary = `当前业务新鲜率 ${toPercent(targetFreshnessRate)}，新鲜资源 ${formatNumber(targetFreshCount)} 个，${FRESHNESS_STOPPED_BAND_LABELS.threeDayStopped} ${formatNumber(targetFreshnessTopGroups.threeDayStoppedCount)} 个，${FRESHNESS_STOPPED_BAND_LABELS.yearlyStopped} ${formatNumber(targetFreshnessTopGroups.yearlyStoppedCount)} 个，${FRESHNESS_STOPPED_BAND_LABELS.monthlyStopped} ${formatNumber(targetFreshnessTopGroups.monthlyStoppedCount)} 个，${FRESHNESS_STOPPED_BAND_LABELS.weeklyStopped} ${formatNumber(targetFreshnessTopGroups.weeklyStoppedCount)} 个，${FRESHNESS_STOPPED_BAND_LABELS.longTermStopped} ${formatNumber(targetFreshnessTopGroups.longTermStoppedCount)} 个。`
    const mapFreshnessTopRow = (row: StatRecord, status: string) => ({
      resourceCode: row.resourceCode || '-',
      resourceName: row.resourceName || '未命名资源',
      businessTimeField: row.metainfo.business_time_field_name || '-',
      latestBusinessTime: row.metainfo.last_record_update_time || '-',
      ageDays: formatNumber(row.metainfo.business_time_age_days ?? 0),
      status,
    })

    const previewImages = [
      { key: 'record-trend', title: '记录总量趋势图', dataUrl: buildTrendChartImage(trendWindow, 'record') },
      { key: 'storage-trend', title: '存储总量趋势图', dataUrl: buildTrendChartImage(trendWindow, 'storage') },
      { key: 'delta-trend', title: '变化总量趋势图', dataUrl: buildTrendChartImage(trendWindow, 'delta') },
      { key: 'status-top-resource', title: '按数据量的联通性分布 Top5', dataUrl: buildConnectivityTopResourceChartImage(targetConnectivityTopResourceRows) },
      { key: 'status-category', title: '按一级分类的联通性分布 Top5', dataUrl: buildConnectivityCategoryChartImage(targetConnectivityCategoryRows) },
    ].filter((item) => item.dataUrl)
    const markdown = buildRunStatsReportMarkdown({
      effectivePeriod: periodCode,
      generatedAt: new Date().toLocaleString('zh-CN'),
      resourceCount: targetSummary.resources,
      coreMetrics: [
        { label: '数据资源数', value: formatNumber(targetRecords.length), change: formatRatio(targetResourceRatioDelta), note: `平均 ${(targetRecords.length > 0 ? targetTotalRecords / targetRecords.length : 0).toFixed(1)} 条/资源` },
        { label: '记录总量', value: `${formatNumber(targetTotalRecords)} 条`, change: formatRatio(targetRecordRatioDelta), note: `统计周期 ${periodCode}` },
        { label: '存储总量', value: toGBOrMB(targetTotalStorageBytes), change: formatRatio(targetStorageRatioDelta), note: `平均字段数 ${targetAvgFieldCount.toFixed(2)}` },
        { label: '联通通畅率', value: toPercent(targetNormalRate), change: formatRatio(targetNormalRateRatioDelta), note: `断开/其他 ${targetAbnormalCount} · 缓慢 ${targetSlowCount}` },
        { label: '字段有值率', value: toPercent(targetFillRate), change: '-', note: 'non_null_field_count / field_count' },
        { label: '业务时间新鲜率', value: toPercent(targetFreshnessRate), change: formatRatio(targetFreshnessRateRatioDelta), note: `长期未更新 ${targetStaleRows.length}` },
      ],
      trendSummary: `${targetTrendText} 当前趋势窗口纳入最近 ${trendWindow.length} 个统计周期。`,
      trendImages: previewImages
        .filter((item) => item.key === 'record-trend' || item.key === 'storage-trend' || item.key === 'delta-trend')
        .map((item) => ({ alt: item.title, dataUrl: item.dataUrl })),
      trendRows: trendWindow.map((item) => ({
        period: item.periodCode,
        resources: formatNumber(item.resources),
        totalRecords: formatNumber(item.totalRecords),
        totalStorage: toGBOrMB(item.totalStorageBytes),
        totalDelta: `${formatDelta(getPeriodRecordDelta(trendWindow, item.periodCode))} 条`,
        normalRate: toPercent(item.resources > 0 ? item.normalCount / item.resources : 0),
      })),
      statusSummary: targetConnectivityTopResourceRows[0]
        ? `${targetAbnormalLine}；缓慢状态资源数 ${targetSlowCount}。按数据量看，Top1 资源「${targetConnectivityTopResourceRows[0].resourceName}」当前为${targetConnectivityTopResourceRows[0].connectLabel}，记录量 ${formatNumber(targetConnectivityTopResourceRows[0].recordCount)} 条。按一级分类看，通畅率最高的分类为「${[...targetConnectivityCategoryRows].sort((a, b) => b.normalRate - a.normalRate)[0]?.label || '暂无'}」。`
        : `${targetAbnormalLine}；缓慢状态资源数 ${targetSlowCount}。当前暂无联通性分布对象。`,
      statusImages: previewImages
        .filter((item) => item.key === 'status-top-resource' || item.key === 'status-category')
        .map((item) => ({ alt: item.title, dataUrl: item.dataUrl })),
      statusTopResourceRows: targetConnectivityTopResourceRows.map((row) => ({
        resourceName: row.resourceName,
        status: row.connectLabel,
        count: formatNumber(row.recordCount),
        ratio: toPercent(row.recordShare),
      })),
      statusCategoryRows: targetConnectivityCategoryRows.map((row) => ({
        categoryLabel: row.label,
        normalCount: formatNumber(row.normalCount),
        disconnectCount: formatNumber(row.disconnectCount),
        slowCount: formatNumber(row.slowCount),
        otherCount: formatNumber(row.otherCount),
        normalRate: toPercent(row.normalRate),
      })),
      stockSummary: `${targetStockAnalysisSummary} ${targetLayerStockAnalysisSummary}`.trim(),
      changeSummary: targetDynamicTopChanges[0]
        ? `${targetChangeAnalysisSummary} ${targetLayerChangeAnalysisSummary} 变化最明显资源为「${targetDynamicTopChanges[0].resourceName}」，本期 ${formatNumber(targetDynamicTopChanges[0].currentRecords)} 条，上期 ${formatNumber(targetDynamicTopChanges[0].previousRecords)} 条，变化 ${formatDelta(targetDynamicTopChanges[0].deltaRecords)} 条。`
        : `${targetChangeAnalysisSummary} ${targetLayerChangeAnalysisSummary} 当前未发现资源级记录变化。`,
      freshnessSummary: targetFreshnessSummary,
      issueSummary: `当前周期存在 ${targetAbnormalCount} 个断开/其他资源、${targetSlowCount} 个缓慢资源、${targetErrorItemsCount} 个执行异常资源；另有${FRESHNESS_STOPPED_BAND_LABELS.threeDayStopped} ${targetFreshnessTopGroups.threeDayStoppedCount} 个、${FRESHNESS_STOPPED_BAND_LABELS.yearlyStopped} ${targetFreshnessTopGroups.yearlyStoppedCount} 个、${FRESHNESS_STOPPED_BAND_LABELS.monthlyStopped} ${targetFreshnessTopGroups.monthlyStoppedCount} 个、${FRESHNESS_STOPPED_BAND_LABELS.weeklyStopped} ${targetFreshnessTopGroups.weeklyStoppedCount} 个、${FRESHNESS_STOPPED_BAND_LABELS.longTermStopped} ${targetFreshnessTopGroups.longTermStoppedCount} 个。`,
      qualitySummary: `当前字段有值率 ${toPercent(targetFillRate)}，业务时间新鲜率 ${toPercent(targetFreshnessRate)}，平均字段数 ${targetAvgFieldCount.toFixed(2)}。质量明细已按全空字段、空表和错误表综合排序展示，便于定位字段级治理对象。`,
      stockCategoryRows: targetCategoryTopSummaries.map((item) => ({
        categoryLabel: item.label,
        totalRecords: `${formatNumber(item.totalRecords)} 条`,
        totalStorage: formatMB(item.totalStorageBytes),
      })),
      stockLayerRows: targetLayerTopSummaries.map((item) => ({
        categoryLabel: item.label,
        totalRecords: `${formatNumber(item.totalRecords)} 条`,
        totalStorage: formatMB(item.totalStorageBytes),
      })),
      changeCategoryRows: targetCategoryTopSummaries.map((item) => ({
        categoryLabel: item.label,
        totalRecords: `${formatNumber(item.totalRecords)} 条`,
        totalStorage: formatMB(item.totalStorageBytes),
        totalDeltaRecords: `${formatDelta(item.totalDeltaRecords)} 条`,
        totalDeltaRatio: formatRatio(item.totalDeltaRatio),
      })),
      changeLayerRows: targetLayerTopSummaries.map((item) => ({
        categoryLabel: item.label,
        totalRecords: `${formatNumber(item.totalRecords)} 条`,
        totalStorage: formatMB(item.totalStorageBytes),
        totalDeltaRecords: `${formatDelta(item.totalDeltaRecords)} 条`,
        totalDeltaRatio: formatRatio(item.totalDeltaRatio),
      })),
      rankingSections: [
        {
          title: 'TOP5 记录规模',
          headers: ['资源名称', '指标值'],
          rows: targetTopByRecord.map((item) => [item.resourceName || '未命名资源', `${formatNumber(item.metainfo.record_count ?? 0)} 条`]),
        },
        {
          title: 'TOP5 存储占用',
          headers: ['资源名称', '指标值'],
          rows: targetTopByStorage.map((item) => [item.resourceName || '未命名资源', formatMB(item.metainfo.storage_bytes ?? 0)]),
        },
        {
          title: 'TOP5 本期记录变化',
          headers: ['资源名称', '本期记录', '上期记录', '变化量', '变化率'],
          rows: targetDynamicTopChanges.map((item) => [
            item.resourceName || '未命名资源',
            formatNumber(item.currentRecords),
            formatNumber(item.previousRecords),
            `${formatDelta(item.deltaRecords)} 条`,
            formatRatio(item.deltaRatio),
          ]),
        },
      ],
      stockDetailRows: targetDetailSnapshotRows.map((row) => ({
        resourceCode: row.resourceCode || '-',
        resourceName: row.resourceName || '未命名资源',
        connectStatus: connectStatusMeta(row.connectStatus).label,
        recordCount: formatNumber(row.metainfo.record_count ?? 0),
        storage: formatMB(row.metainfo.storage_bytes ?? 0),
        tableCount: formatNumber(row.metainfo.table_count ?? 0),
        fieldCount: formatNumber(row.metainfo.field_count ?? 0),
        nonNullFieldCount: formatNumber(row.metainfo.non_null_field_count ?? 0),
        recordRatio: formatRatio(row.dayOnDay.record_count?.ratio),
        recordDelta: `${formatDelta(row.dayOnDay.record_count?.delta)} 条`,
        errorCount: formatNumber(row.errorList.length),
      })),
      changeDetailRows: targetDynamicChanges.slice(0, 20).map((item) => ({
        resourceCode: item.resourceCode || '-',
        resourceName: item.resourceName || '未命名资源',
        currentValue: formatNumber(item.currentRecords),
        previousValue: formatNumber(item.previousRecords),
        deltaValue: `${formatDelta(item.deltaRecords)} 条`,
        deltaRatio: formatRatio(item.deltaRatio),
      })),
      freshnessMetricRows: [
        { label: '业务时间新鲜资源数', value: formatNumber(targetFreshCount), ratio: toPercent(targetFreshnessRate), note: '存在业务时间且未超过长期未更新阈值' },
        { label: `${FRESHNESS_STOPPED_BAND_LABELS.threeDayStopped}资源数`, value: formatNumber(targetFreshnessTopGroups.threeDayStoppedCount), ratio: toPercent(targetFreshnessTopGroups.threeDayStoppedCount / Math.max(targetRecords.length, 1)), note: FRESHNESS_STOPPED_BAND_NOTES.threeDayStopped },
        { label: '长期未更新资源数', value: formatNumber(targetStaleRows.length), ratio: toPercent(targetStaleRows.length / Math.max(targetRecords.length, 1)), note: '业务时间超过 stat_metainfo.business_time_stale_threshold_days' },
      ],
      latestUpdatedRows: targetFreshnessTopGroups.latestUpdated.map((row) => mapFreshnessTopRow(row, '最新更新')),
      threeDayStoppedRows: targetFreshnessTopGroups.threeDayStopped.map((row) => mapFreshnessTopRow(row, FRESHNESS_STOPPED_BAND_LABELS.threeDayStopped)),
      yearlyStoppedRows: targetFreshnessTopGroups.yearlyStopped.map((row) => mapFreshnessTopRow(row, FRESHNESS_STOPPED_BAND_LABELS.yearlyStopped)),
      monthlyStoppedRows: targetFreshnessTopGroups.monthlyStopped.map((row) => mapFreshnessTopRow(row, FRESHNESS_STOPPED_BAND_LABELS.monthlyStopped)),
      weeklyStoppedRows: targetFreshnessTopGroups.weeklyStopped.map((row) => mapFreshnessTopRow(row, FRESHNESS_STOPPED_BAND_LABELS.weeklyStopped)),
      longTermStoppedRows: targetFreshnessTopGroups.longTermStopped.map((row) => mapFreshnessTopRow(row, FRESHNESS_STOPPED_BAND_LABELS.longTermStopped)),
      issueRows: targetIssueRows.map((row) => {
        const statusLabel = connectStatusMeta(row.connectStatus).label
        const problemTypes = [
          row.connectStatus !== '01' ? `联通${statusLabel}` : '',
          row.errorList.length > 0 ? '执行异常' : '',
          isStaleBusinessTime(row) ? '长期未更新' : '',
        ].filter(Boolean)
        return {
          resourceCode: row.resourceCode || '-',
          resourceName: row.resourceName || '未命名资源',
          connectStatus: statusLabel,
          problemType: problemTypes.join(' / ') || '待排查',
          errorCount: formatNumber(row.errorList.length),
          note: isStaleBusinessTime(row)
            ? `最新业务时间 ${row.metainfo.last_record_update_time || '-'}，距今天数 ${formatNumber(row.metainfo.business_time_age_days ?? 0)}`
            : row.errorList.length > 0 ? `存在 ${formatNumber(row.errorList.length)} 条异常记录` : '当前无异常条目明细',
        }
      }),
      qualityDetailRows: targetQualityDetailRows.map((row) => ({
        resourceCode: row.resourceCode || '-',
        resourceName: row.resourceName || '未命名资源',
        allNullFieldCount: formatNumber(row.quality.all_null_field_count ?? 0),
        emptyTableCount: formatNumber(row.quality.empty_table_count ?? 0),
        errorTableCount: formatNumber(row.quality.error_table_count ?? 0),
        fieldCount: formatNumber(row.metainfo.field_count ?? 0),
        nonNullFieldCount: formatNumber(row.metainfo.non_null_field_count ?? 0),
        fillRate: toPercent(
          (row.metainfo.field_count ?? 0) > 0
            ? (row.metainfo.non_null_field_count ?? 0) / Math.max(row.metainfo.field_count ?? 0, 1)
            : 0,
        ),
      })),
      conclusionLines: [
        `建议优先排查 \`stat_connect=02/99\` 的资源，保障基础连通能力。当前断开/其他资源共 ${targetAbnormalCount} 个。`,
        `将长期未更新资源纳入问题数据治理，优先核对 \`stat_base.fresh_field_name\` 对应业务时间字段。当前长期未更新资源 ${targetStaleRows.length} 个。`,
        '结合质量明细数据持续开展字段级治理，优先关注全空字段、空表和错误表较多的资源。',
        `持续按批次执行统计任务，扩大趋势窗口，提升上一统计批次对比判断准确性。当前记录规模 Top1 为 ${targetTopLine}。`,
        `数据分层统计当前按 \`source_tablelist.baseline_layer\` 作为资源主分层口径，优先覆盖 ODS / DWD / DWS / ADS / DIM 五层。`,
        `关注执行异常资源数 ${targetErrorItemsCount}，并结合资源级明细快照继续定位异常条目较多的对象。`,
      ],
    })

    return {
      createdAt: new Date().toLocaleString('zh-CN'),
      markdown,
      previewImages,
    }
  }

  const ensureReportPeriodReady = async (periodCode: string) => {
    let payload = await ensurePeriodLoaded(periodCode)
    const currentJobOption = queriedJobOptions.find((item) => item.periodCode === periodCode)
    const currentTaskCode = currentJobOption?.taskCode ?? periodTaskMap[periodCode]?.taskCode ?? ''
    if (!currentTaskCode) {
      return payload
    }

    const recentJobOptions = await fetchRunStatsJobOptionsByTask(currentTaskCode, 200)
    const currentJobIndex = recentJobOptions.findIndex((item) => item.periodCode === periodCode)
    const previousPeriodOption = currentJobIndex >= 0 ? recentJobOptions[currentJobIndex + 1] : undefined
    if (previousPeriodOption?.periodCode) {
      payload = await ensurePeriodLoaded(previousPeriodOption.periodCode)
    }
    return payload
  }

  const handleDownloadPeriodMarkdown = async (periodCode: string) => {
    setDownloadingPeriod(periodCode)
    try {
      const runtimeData = await ensureReportPeriodReady(periodCode)
      const payload = buildReportPayloadForPeriod(periodCode, runtimeData)
      if (!payload) return
      downloadText(payload.markdown, `数据运行分析报告-${periodCode}.md`, 'text/markdown;charset=utf-8')
    } finally {
      setDownloadingPeriod('')
    }
  }

  const handleDownloadPeriodDocx = async (periodCode: string) => {
    setDownloadingDocxPeriod(periodCode)
    try {
      const runtimeData = await ensureReportPeriodReady(periodCode)
      const payload = buildReportPayloadForPeriod(periodCode, runtimeData)
      if (!payload) return
      await downloadDocx(payload.markdown, periodCode)
    } finally {
      setDownloadingDocxPeriod('')
    }
  }

  return (
    <div className="space-y-5">
      <RunStatsSecondaryNav withEmbed={withEmbed} />
      <section className="rounded-2xl border border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] p-6 shadow-[var(--shadow-medium)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[1.75rem] font-bold text-[var(--text-main)]">报告生成中心</h2>
          </div>
          <Link
            to={withEmbed('/run-stats')}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-semibold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回统计页
          </Link>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[220px_220px_160px]">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="date"
              value={selectedExecutionDate}
              disabled={isExecutionDateLoadingWithTask}
              onChange={(event) => {
                const nextExecutionDate = event.target.value
                setSelectedExecutionDate(nextExecutionDate)
                setSelectedTaskCode('')
                setSelectedPeriod('')
                setQueryHint('')
                setQueriedExecutionDate('')
                setQueriedTaskCode('')
                setQueriedJobOptions([])
                setReportListError(null)
                syncReportListSearchParams(nextExecutionDate, '')
              }}
              className="h-10 w-full rounded-xl border border-[var(--surface-outline)] bg-[var(--field-bg)] pl-9 pr-3 text-[0.8125rem] text-[var(--text-main)] outline-none"
            />
          </div>
          <select
            data-testid="task-select"
            className="h-10 rounded-xl border border-[var(--surface-outline)] bg-[var(--field-bg)] px-3 text-[0.8125rem] text-[var(--text-main)] outline-none"
            value={selectedTaskCode}
            disabled={taskOptions.length === 0}
            onChange={(event) => {
              const nextTaskCode = event.target.value
              setSelectedTaskCode(nextTaskCode)
              setQueryHint('')
              setQueriedExecutionDate('')
              setQueriedTaskCode('')
              setQueriedJobOptions([])
              setReportListError(null)
              syncReportListSearchParams(selectedExecutionDate, nextTaskCode)
            }}
          >
            <option value="">请选择任务</option>
            {taskOptions.map((option) => (
              <option key={option.taskCode} value={option.taskCode}>
                {`${option.taskName}（${option.taskCode}）`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              runReportListQuery(selectedExecutionDate, selectedTaskCode, true)
            }}
            disabled={isExecutionDateLoadingWithTask || isSubmittingQuery || !selectedExecutionDate || !selectedTaskCode}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.75rem] font-semibold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            查询
          </button>
        </div>
        {queryHint ? <div className="mt-2 text-[0.75rem] text-[var(--text-muted)]">{queryHint}</div> : null}
        {isWaitingForQueryPeriod ? (
          <div className="mt-2 text-[0.75rem] text-[var(--text-muted)]">
            正在读取所选日期下的统计任务，请稍候。
          </div>
        ) : null}
        {!isWaitingForQueryPeriod && isSubmittingQuery ? <div className="mt-2 text-[0.75rem] text-[var(--text-muted)]">正在按所选条件查询报告列表，请稍候...</div> : null}
      </section>

      {pageError ? (
        <div className="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{pageError}</div>
      ) : null}

      {hasActiveQuery && isSubmittingQuery ? (
        <section className="flex h-[360px] items-center justify-center rounded-2xl border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-5 shadow-[var(--shadow-soft)]">
          <div className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-5 py-4 text-[0.875rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
            正在查询 {queriedExecutionDate || selectedExecutionDate || '所选日期'} 的报告列表，请稍候...
          </div>
        </section>
      ) : (
      <section className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[1rem] font-bold text-[var(--text-main)]">报告列表</div>
            <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">按作业列表生成，查看分析和下载时再拉取明细</div>
          </div>
          <div className="text-[0.75rem] text-[var(--text-muted)]">
            {hasActiveQuery ? `当前日期共 ${filteredPeriodOptions.length} 个周期` : '待查询'}
          </div>
        </div>
        <div className="space-y-2.5">
          {!hasActiveQuery ? (
            <div className="rounded-xl border border-dashed border-[var(--surface-outline)] bg-[var(--surface-muted)] px-4 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]">
              请选择统计日期和统计任务，系统会自动查询报告列表。
            </div>
          ) : null}
          {pagedPeriodSummaries.map((summary) => {
            const isCurrentRowBusy = downloadingPeriod === summary.periodCode || downloadingDocxPeriod === summary.periodCode

            return (
              <div
                key={summary.periodCode}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] px-4 py-3 transition hover:border-[rgba(var(--theme-soft-rgb),0.32)] hover:bg-[var(--surface-raised-strong)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[0.875rem] font-semibold text-[var(--text-main)]">{summary.periodCode}</div>
                  <div className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">
                    {summary.executedAt ? `执行时间：${formatExecutionTimeLabel(summary.executedAt)}` : '执行时间未知'}
                  </div>
                  <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
                    {summary.taskName || summary.taskCode}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    to={withEmbed(`/run-stats?period=${encodeURIComponent(summary.periodCode)}`)}
                    className={reportListActionButtonClass}
                  >
                    <FileText className="h-4 w-4" />
                    查看分析
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDownloadPeriodMarkdown(summary.periodCode)}
                    disabled={isHydratingHistory || isCurrentRowBusy}
                    className={`${reportListActionButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <Download className="h-4 w-4" />
                    {downloadingPeriod === summary.periodCode ? '生成中...' : '下载 MD'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDownloadPeriodDocx(summary.periodCode)
                    }}
                    disabled={isHydratingHistory || isCurrentRowBusy}
                    className={`${reportListActionButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <Download className="h-4 w-4" />
                    {downloadingDocxPeriod === summary.periodCode ? '导出中...' : '下载 DOCX'}
                  </button>
                </div>
              </div>
            )
          })}
          {hasActiveQuery && filteredPeriodOptions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--surface-outline)] bg-[var(--surface-muted)] px-4 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]">
              未检索到匹配的执行周期报告。
            </div>
          ) : null}
        </div>
        {hasActiveQuery && filteredPeriodOptions.length > 0 ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--surface-outline)] pt-4">
            <div className="text-[0.75rem] text-[var(--text-muted)]">
              第 {reportListPage} / {reportListTotalPages} 页，每页 10 条
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReportListPage((current) => Math.max(1, current - 1))}
                disabled={reportListPage <= 1}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 text-[0.75rem] font-semibold text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                上一页
              </button>
              {reportListPaginationItems.map((item, index) =>
                item === 'ellipsis' ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-[0.75rem] font-semibold text-[var(--text-muted)]"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setReportListPage(item)}
                    className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-[0.75rem] font-semibold transition ${
                      item === reportListPage
                        ? 'border-[rgba(var(--theme-strong-rgb),0.35)] bg-[rgba(var(--theme-soft-rgb),0.14)] text-[var(--primary)] shadow-[0_8px_20px_rgba(var(--theme-strong-rgb),0.14)]'
                        : 'border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[rgba(var(--theme-soft-rgb),0.32)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]'
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => setReportListPage((current) => Math.min(reportListTotalPages, current + 1))}
                disabled={reportListPage >= reportListTotalPages}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 text-[0.75rem] font-semibold text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </section>
      )}

    </div>
  )
}
