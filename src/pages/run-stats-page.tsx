import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Database,
  FileText,
  Gauge,
  Search,
  Timer,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { DomainChartsSection } from '../components/run-stats-domain-charts'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { buildPaginationItems } from '../lib/pagination'
import {
  buildDimensionChangeTopItems,
  buildFreshnessTopGroups,
  buildResourceRecordChangeTopItems,
  buildStatDimensionSummaries,
  connectStatusMeta,
  DATA_LAYER_SEEDS,
  extractPeriodDateKey,
  FRESHNESS_STOPPED_BAND_LABELS,
  fetchRunStatsJobOptionsByExecutionDate,
  filterRunStatsDataByPeriods,
  formatMB,
  formatDateInputValue,
  formatNumber,
  isFreshBusinessTime,
  isStaleBusinessTime,
  type StatDimensionChangeItem,
  type ResourceRecordChangeItem,
  type PeriodSummary,
  type StatRecord,
  type StatDimensionSummary,
  type RunStatsJobOption,
  useCurrentRunStats,
  useRunStatsData,
  useRunStatsTasks,
} from '../lib/nocobase-stat-data'
import {
  buildRunStatsReportCenterPath,
  hasRunStatsPendingQueryChanges,
  paginateRunStatsDetailRows,
  resolvePreferredRunStatsJobSelection,
  resolveRunStatsQueryControlState,
  shouldLoadRunStatsJobOptions,
  shouldResetRunStatsTaskSelection,
} from '../lib/run-stats-page-state'
import { buildDomainStatsRows } from '../lib/run-stats-domain'
import {
  buildRunStatsTrendChartPoints,
  buildRunStatsTrendWindowFromJobOptions,
  buildRunStatsTrendSummariesFromRecords,
  buildRunStatsTrendWindow,
  type RunStatsTrendChartScaleMode,
  resolveRunStatsTrendPeriodCodes,
} from '../lib/run-stats-trend'
import { RunStatsSecondaryNav } from '../components/run-stats-secondary-nav'

type CategoryTopSummaryItem = StatDimensionSummary
type CategoryChangeRankingItem = StatDimensionChangeItem
type DistributionSummaryTableRow = {
  key: string
  title: string
  subtitle: string
  resourceCount: string
  totalRecords: string
  totalStorage: string
  deltaRecords: string
  deltaToneClass: string
  deltaRatio: string
  ratioToneClass: string
}

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

type TableSortKey =
  | 'recordCount'
  | 'storageBytes'
  | 'tableCount'
  | 'fieldCount'
  | 'nonNullFieldCount'
  | 'recordRatio'
  | 'recordDelta'
  | 'errorCount'

type TableSortDirection = 'asc' | 'desc'

export const RUN_STATS_DATA_ENABLED = true
const DETAIL_TABLE_PAGE_SIZE = 20

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

function toPercent(value: number, fraction = 1) {
  return `${(value * 100).toFixed(fraction)}%`
}

function normalizeRatio(ratio: number | null | undefined) {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return 0
  return ratio
}

function formatRatio(ratio: number | null | undefined) {
  const n = normalizeRatio(ratio)
  const sign = n > 0 ? '+' : ''
  return `${sign}${toPercent(n, 2)}`
}

function formatDelta(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumber(value)}`
}

function formatRunStatsRecordMetricValue(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0
  return `${(safeValue / 100000000).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}亿条`
}

function changeToneClass(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return 'text-[var(--text-muted)]'
  return value > 0 ? 'text-[var(--status-success-text)]' : 'text-[var(--status-danger-text)]'
}

function toGBOrMB(bytes: number) {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(2)} MB`
}

function clipText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

function calcPeriodRatioDelta(current: number, previous: number | undefined) {
  if (typeof previous !== 'number' || !Number.isFinite(previous)) return 0
  if (previous <= 0) return current > 0 ? 1 : 0
  return (current - previous) / previous
}

const RESOURCE_LINK_CLASSNAME =
  'inline-flex cursor-pointer items-center rounded-[6px] px-1 py-0.5 align-middle text-[var(--primary)] underline decoration-[rgba(var(--theme-strong-rgb),0.36)] decoration-1 underline-offset-[3px] transition hover:bg-[rgba(var(--theme-soft-rgb),0.12)] hover:text-[color-mix(in_srgb,var(--primary)_82%,#16324f)] hover:decoration-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--theme-soft-rgb),0.28)]'

const CONNECT_STATUS_ORDER = ['01', '02', '04', '99'] as const
const CONNECT_STATUS_PALETTE: Record<string, string> = {
  '01': '#12b886',
  '02': '#f03e3e',
  '04': '#f59f00',
  '99': '#64748b',
}

function getTableSortValue(row: StatRecord, key: TableSortKey) {
  switch (key) {
    case 'recordCount':
      return row.metainfo.record_count ?? 0
    case 'storageBytes':
      return row.metainfo.storage_bytes ?? 0
    case 'tableCount':
      return row.metainfo.table_count ?? 0
    case 'fieldCount':
      return row.metainfo.field_count ?? 0
    case 'nonNullFieldCount':
      return row.metainfo.non_null_field_count ?? 0
    case 'recordRatio':
      return row.dayOnDay.record_count?.ratio ?? 0
    case 'recordDelta':
      return row.dayOnDay.record_count?.delta ?? 0
    case 'errorCount':
      return row.errorList.length
    default:
      return 0
  }
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

function renderTrendPath(points: Array<{ x: number, y: number }>) {
  if (points.length === 0) return ''
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ')
}

function getTrendChartLayout() {
  const width = 420
  const height = 200
  const paddingX = 28
  const plotWidth = width - paddingX * 2

  return {
    width,
    height,
    paddingX,
    plotWidth,
  }
}

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

function formatPeriodOptionLabel(summary: Pick<PeriodSummary, 'periodCode' | 'executedAt'>) {
  return summary.executedAt
    ? `${summary.periodCode} ｜ 执行时间：${formatExecutionTimeLabel(summary.executedAt)}`
    : summary.periodCode
}

function MetricCard({
  title,
  value,
  sub,
  icon,
  trend,
}: {
  title: string
  value: string
  sub: string
  icon: React.ReactNode
  trend?: { label: string; positive?: boolean }
}) {
  return (
    <div className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.75rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{title}</div>
          <div className="mt-2 text-[1.875rem] font-bold leading-none text-[var(--text-main)]">{value}</div>
          <div className="mt-2 text-[0.75rem] text-[var(--text-secondary)]">{sub}</div>
        </div>
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(var(--theme-soft-rgb),0.14)] text-[var(--primary)]">
          {icon}
        </div>
      </div>
      {trend ? (
        <div
          className={`mt-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${
            trend.positive ? 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]' : 'bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
          }`}
        >
          {trend.positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {trend.label}
        </div>
      ) : null}
    </div>
  )
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
}: {
  label: string
  sortKey: TableSortKey
  currentSort: { key: TableSortKey; direction: TableSortDirection }
  onSort: (key: TableSortKey) => void
}) {
  const isActive = currentSort.key === sortKey
  const indicator = isActive ? (currentSort.direction === 'asc' ? '↑' : '↓') : '↕'

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex w-full items-center justify-end gap-1 font-semibold ${
        isActive ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--primary)]'
      }`}
    >
      <span>{label}</span>
      <span className="text-[0.625rem] leading-none">{indicator}</span>
    </button>
  )
}

function ResourceNameLink({
  to,
  name,
  clipLength,
  maxWidthClass,
}: {
  to?: string
  name: string
  clipLength?: number
  maxWidthClass?: string
}) {
  const label = typeof clipLength === 'number' ? clipText(name, clipLength) : name
  const widthClass = maxWidthClass ?? 'max-w-full'

  if (!to) {
    return (
      <span title={name} className={`inline-block ${widthClass} truncate align-middle text-[var(--text-main)]`}>
        {label}
      </span>
    )
  }

  return (
    <Link to={to} title={name} className={`${RESOURCE_LINK_CLASSNAME} ${widthClass} truncate`}>
      {label}
    </Link>
  )
}

function TrendChart({
  periods,
}: {
  periods: PeriodSummary[]
}) {
  const chartPeriods = periods.slice(-10)
  const { width, height, paddingX, plotWidth } = getTrendChartLayout()
  const charts = [
    {
      key: 'record',
      title: '记录总量趋势',
      color: '#2f6fe6',
      scaleMode: 'range' as RunStatsTrendChartScaleMode,
      currentValue: chartPeriods.length > 0 ? formatNumber(chartPeriods[chartPeriods.length - 1].totalRecords) : '0',
      valueSuffix: '条',
      values: chartPeriods.map((item) => item.totalRecords),
    },
    {
      key: 'storage',
      title: '存储总量趋势',
      color: '#17a26f',
      scaleMode: 'range' as RunStatsTrendChartScaleMode,
      currentValue: chartPeriods.length > 0 ? formatMB(chartPeriods[chartPeriods.length - 1].totalStorageBytes) : '0 MB',
      valueSuffix: '',
      values: chartPeriods.map((item) => item.totalStorageBytes / (1024 * 1024)),
    },
    {
      key: 'delta',
      title: '变化总量趋势',
      color: '#d97706',
      scaleMode: 'zero-baseline' as RunStatsTrendChartScaleMode,
      currentValue: chartPeriods.length > 0 ? formatDelta(getPeriodRecordDelta(periods, chartPeriods[chartPeriods.length - 1].periodCode)) : '0',
      valueSuffix: '条',
      values: chartPeriods.map((item) => getPeriodRecordDelta(periods, item.periodCode)),
    },
  ]

  return (
    <div className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[1rem] font-bold text-[var(--text-main)]">
          <BarChart3 className="h-5 w-5 text-[var(--primary)]" />
          统计周期趋势
        </div>
        <div className="text-[0.75rem] text-[var(--text-muted)]">最近 {chartPeriods.length} 个统计周期</div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {charts.map((chart) => {
          const points = buildRunStatsTrendChartPoints(chart.values, plotWidth, height, { scaleMode: chart.scaleMode })
          const path = renderTrendPath(points)
          const guideLines = Array.from({ length: 5 }, (_, index) => Number(((height / 4) * index).toFixed(1)))
          return (
            <div
              key={chart.key}
              className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 text-[0.875rem] font-bold text-[var(--text-main)]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: chart.color }} />
                    {chart.title}
                  </div>
                  <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
                    {chart.key === 'delta' ? '按统计周期展示相对上期的净变化量' : '按统计周期展示变化趋势'}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[0.6875rem] text-[var(--text-muted)]">当前值</div>
                  <div className="text-[0.875rem] font-semibold" style={{ color: chart.color }}>
                    {chart.currentValue}
                    {chart.valueSuffix}
                  </div>
                </div>
              </div>
              <div>
                <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full">
                  <rect x={0} y={0} width={width} height={height} fill="var(--surface-muted)" rx={14} />
                  <g transform={`translate(${paddingX} 0)`}>
                    {guideLines.map((y) => (
                      <line
                        key={`${chart.key}:guide:${y}`}
                        x1={0}
                        y1={y}
                        x2={plotWidth}
                        y2={y}
                        stroke="rgba(148, 163, 184, 0.18)"
                        strokeWidth="1"
                      />
                    ))}
                    <path d={path} stroke={chart.color} strokeWidth="3.5" fill="none" />
                    {points.map((point, index) => (
                      <circle
                        key={`${chart.key}:point:${chartPeriods[index]?.periodCode ?? index}`}
                        cx={point.x}
                        cy={point.y}
                        r={chartPeriods.length === 1 ? 5 : 4}
                        fill={chart.color}
                        stroke="var(--surface-raised-strong)"
                        strokeWidth="2"
                      />
                    ))}
                  </g>
                </svg>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ConnectivitySection({
  topResourceRows,
  categoryRows,
  resourceDetailPath,
}: {
  topResourceRows: ConnectivityTopResourceRow[]
  categoryRows: ConnectivityCategoryRow[]
  resourceDetailPath: (resourceId: string | undefined) => string | undefined
}) {
  const maxTopResourceCount = topResourceRows[0]?.recordCount ?? 0

  return (
    <section className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[1rem] font-bold text-[var(--text-main)]">
            <Gauge className="h-5 w-5 text-[var(--primary)]" />
            联通性分布分组
          </div>
          <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
            结合资源记录量和一级分类，查看当前统计周期的联通状态分布。
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_1fr]">
        <div className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] p-4">
          <div className="mb-3 flex items-center gap-2 text-[0.9375rem] font-bold text-[var(--text-main)]">
            <Database className="h-4 w-4 text-[var(--primary)]" />
            按数据量的联通性分布 Top5
          </div>
          <div className="space-y-3">
            {topResourceRows.length === 0 ? (
              <div className="rounded-xl bg-[var(--surface-raised)] px-3 py-8 text-center text-[0.75rem] text-[var(--text-muted)]">当前周期暂无可分析资源</div>
            ) : null}
            {topResourceRows.map((row, index) => (
              <div key={row.key} className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-[0.75rem] font-semibold text-[var(--text-main)]">
                      <span className="shrink-0">#{index + 1}</span>
                      <ResourceNameLink
                        to={resourceDetailPath(row.resourceId)}
                        name={row.resourceName}
                        clipLength={20}
                        maxWidthClass="max-w-[260px]"
                      />
                    </div>
                    <div className="mt-1 truncate text-[0.6875rem] text-[var(--text-muted)]">{row.resourceCode}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6875rem] ${row.connectToneClass}`}>{row.connectLabel}</div>
                    <div className="mt-1 text-[0.75rem] font-bold text-[var(--primary)]">{formatNumber(row.recordCount)} 条</div>
                    <div className="mt-0.5 text-[0.6875rem] text-[var(--text-muted)]">占比 {toPercent(row.recordShare, 1)}</div>
                  </div>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--table-track)]">
                  <div
                    className="h-full rounded-full"
                    style={
                      {
                        width: `${maxTopResourceCount > 0 ? (row.recordCount / maxTopResourceCount) * 100 : 0}%`,
                        background: row.color,
                      } as CSSProperties
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] p-4">
          <div className="mb-3 flex items-center gap-2 text-[0.9375rem] font-bold text-[var(--text-main)]">
            <BarChart3 className="h-4 w-4 text-[var(--primary)]" />
            按一级分类的联通性分布 Top5
          </div>
          <div className="space-y-3">
            {categoryRows.length === 0 ? (
              <div className="rounded-xl bg-[var(--surface-raised)] px-3 py-8 text-center text-[0.75rem] text-[var(--text-muted)]">当前周期暂无一级分类联通性数据</div>
            ) : null}
            {categoryRows.map((row) => {
              const total = Math.max(row.totalResources, 1)
              const segments = CONNECT_STATUS_ORDER.map((code) => ({
                key: code,
                count: code === '01'
                  ? row.normalCount
                  : code === '02'
                    ? row.disconnectCount
                    : code === '04'
                      ? row.slowCount
                      : row.otherCount,
                color: CONNECT_STATUS_PALETTE[code],
              }))

              return (
                <div key={row.key} className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[0.75rem] font-semibold text-[var(--text-main)]">{row.label}</div>
                      <div className="mt-0.5 text-[0.6875rem] text-[var(--text-muted)]">
                        资源数 {formatNumber(row.totalResources)} · 记录量 {formatNumber(row.totalRecords)} 条
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[0.75rem] font-bold text-[var(--status-success-text)]">{toPercent(row.normalRate, 1)}</div>
                      <div className="text-[0.6875rem] text-[var(--text-muted)]">通畅率</div>
                    </div>
                  </div>
                  <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[var(--table-track)]">
                    {segments.map((segment) => (
                      <div
                        key={`${row.key}-${segment.key}`}
                        style={
                          {
                            width: `${(segment.count / total) * 100}%`,
                            background: segment.color,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-[0.6875rem] text-[var(--text-secondary)]">
                    <div>通畅 {formatNumber(row.normalCount)}</div>
                    <div>断开 {formatNumber(row.disconnectCount)}</div>
                    <div>缓慢 {formatNumber(row.slowCount)}</div>
                    <div>其他 {formatNumber(row.otherCount)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-muted)] p-3 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
        字段解释：`01通畅`（可访问且可读取统计）、`02断开`（读取失败/不可访问）、`04缓慢`（读取成功但响应慢）、`99其他`。
      </div>
    </section>
  )
}

function TopRankingCard({
  title,
  items,
  metric,
  icon,
  toPath,
}: {
  title: string
  items: StatRecord[]
  metric: (item: StatRecord) => string
  icon: React.ReactNode
  toPath: (item: StatRecord) => string | undefined
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex min-h-[28px] items-center gap-2 border-b border-[rgba(226,234,241,0.9)] pb-3 text-[0.9375rem] font-bold text-[var(--text-main)]">
        {icon}
        {title}
      </div>
      <div className="flex-1 space-y-2.5">
        {items.length === 0 ? (
          <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-4 text-center text-[0.75rem] text-[var(--text-muted)]">暂无数据</div>
        ) : null}
        {items.map((item, index) => (
          <div key={`${item.id}:${index}`} className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[0.75rem] font-semibold text-[var(--text-main)]">
                  <span className="shrink-0">#{index + 1}</span>
                  <ResourceNameLink
                    to={toPath(item)}
                    name={item.resourceName || '未命名资源'}
                    clipLength={18}
                    maxWidthClass="max-w-[240px]"
                  />
                </div>
                <div className="mt-0.5 truncate text-[0.6875rem] text-[var(--text-muted)]">{item.resourceCode}</div>
              </div>
              <div className="shrink-0 text-[0.75rem] font-bold text-[var(--primary)]">{metric(item)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DynamicTopRankingCard({
  title,
  items,
  icon,
  toPath,
}: {
  title: string
  items: ResourceRecordChangeItem[]
  icon: React.ReactNode
  toPath: (item: ResourceRecordChangeItem) => string | undefined
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex min-h-[28px] items-center gap-2 border-b border-[rgba(226,234,241,0.9)] pb-3 text-[0.9375rem] font-bold text-[var(--text-main)]">
        {icon}
        {title}
      </div>
      <div className="flex-1 space-y-2.5">
        {items.length === 0 ? (
          <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-4 text-center text-[0.75rem] text-[var(--text-muted)]">本期暂无记录变化资源</div>
        ) : null}
        {items.map((item, index) => (
          <div key={item.key} className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[0.75rem] font-semibold text-[var(--text-main)]">
                  <span className="shrink-0">#{index + 1}</span>
                  <ResourceNameLink
                    to={toPath(item)}
                    name={item.resourceName || '未命名资源'}
                    clipLength={18}
                    maxWidthClass="max-w-[240px]"
                  />
                </div>
                <div className="mt-0.5 truncate text-[0.6875rem] text-[var(--text-muted)]">{item.resourceCode}</div>
                <div className="mt-0.5 text-[0.6875rem] text-[var(--text-muted)]">
                  本期 {formatNumber(item.currentRecords)} · 上期 {formatNumber(item.previousRecords)}
                </div>
              </div>
              <div className={`shrink-0 text-right ${changeToneClass(item.deltaRecords)}`}>
                <div className="text-[0.75rem] font-bold">
                  {item.deltaRecords > 0 ? '+' : ''}
                  {formatNumber(item.deltaRecords)} 条
                </div>
                <div className="mt-0.5 text-[0.6875rem] font-semibold">{formatRatio(item.deltaRatio)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CategoryChangeRankingCard({
  title,
  items,
  icon,
}: {
  title: string
  items: CategoryChangeRankingItem[]
  icon: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex min-h-[28px] items-center gap-2 border-b border-[rgba(226,234,241,0.9)] pb-3 text-[0.9375rem] font-bold text-[var(--text-main)]">
        {icon}
        {title}
      </div>
      <div className="flex-1 space-y-2.5">
        {items.length === 0 ? (
          <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-4 text-center text-[0.75rem] text-[var(--text-muted)]">本期暂无一级分类变化</div>
        ) : null}
        {items.map((item, index) => (
          <div key={`${item.key}:${index}`} className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[0.75rem] font-semibold text-[var(--text-main)]">
                  <span className="shrink-0">#{index + 1}</span>
                  <span className="truncate">{item.label}</span>
                </div>
                <div className="mt-0.5 truncate text-[0.6875rem] text-[var(--text-muted)]">
                  覆盖 {formatNumber(item.resourceCount)} 个资源 · 上期 {formatNumber(item.previousRecords)} 条
                </div>
              </div>
              <div className={`shrink-0 text-right ${changeToneClass(item.deltaRecords)}`}>
                <div className="text-[0.75rem] font-bold">
                  {item.deltaRecords > 0 ? '+' : ''}
                  {formatNumber(item.deltaRecords)} 条
                </div>
                <div className="mt-0.5 text-[0.6875rem] font-semibold">{formatRatio(item.deltaRatio)}</div>
                <div className="mt-0.5 text-[0.6875rem] text-[var(--text-muted)]">本期 {formatNumber(item.currentRecords)} 条</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CategoryTopSummaryCard({
  items,
}: {
  items: CategoryTopSummaryItem[]
}) {
  const rows: DistributionSummaryTableRow[] = items.map((item, index) => ({
    key: item.key,
    title: `#${index + 1} ${item.label}`,
    subtitle: '一级分类汇总',
    resourceCount: formatNumber(item.resourceCount),
    totalRecords: formatRunStatsRecordMetricValue(item.totalRecords),
    totalStorage: formatMB(item.totalStorageBytes),
    deltaRecords: `${formatDelta(item.totalDeltaRecords)} 条`,
    deltaToneClass: changeToneClass(item.totalDeltaRecords),
    deltaRatio: formatRatio(item.totalDeltaRatio),
    ratioToneClass: changeToneClass(item.totalDeltaRatio),
  }))

  return (
    <DistributionSummaryTableCard
      title="TOP5 一级分类统计（按记录规模）"
      icon={<Database className="h-4 w-4 text-[var(--primary)]" />}
      emptyText="暂无分类统计数据"
      rows={rows}
    />
  )
}

function LayerSummaryCard({
  items,
}: {
  items: CategoryTopSummaryItem[]
}) {
  const rows: DistributionSummaryTableRow[] = items.map((item) => ({
    key: item.key,
    title: item.label,
    subtitle: 'baseline_layer 主分层',
    resourceCount: formatNumber(item.resourceCount),
    totalRecords: formatRunStatsRecordMetricValue(item.totalRecords),
    totalStorage: formatMB(item.totalStorageBytes),
    deltaRecords: `${formatDelta(item.totalDeltaRecords)} 条`,
    deltaToneClass: changeToneClass(item.totalDeltaRecords),
    deltaRatio: formatRatio(item.totalDeltaRatio),
    ratioToneClass: changeToneClass(item.totalDeltaRatio),
  }))

  return (
    <DistributionSummaryTableCard
      title="数据分层统计（主分层）"
      icon={<BarChart3 className="h-4 w-4 text-[var(--primary)]" />}
      emptyText="暂无数据分层统计数据"
      rows={rows}
    />
  )
}

function DistributionSummaryTableCard({
  title,
  icon,
  emptyText,
  rows,
}: {
  title: string
  icon: React.ReactNode
  emptyText: string
  rows: DistributionSummaryTableRow[]
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-4 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex min-h-[28px] items-center gap-2 border-b border-[rgba(226,234,241,0.9)] pb-3 text-[0.9375rem] font-bold text-[var(--text-main)]">
        {icon}
        {title}
      </div>
      <div className="flex-1 overflow-hidden rounded-xl border border-[var(--surface-outline)]">
        {rows.length === 0 ? (
          <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-4 text-center text-[0.75rem] text-[var(--text-muted)]">{emptyText}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-[var(--table-header-bg)] text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                <tr>
                  <th className="w-[28%] px-4 py-3">维度</th>
                  <th className="px-4 py-3 text-right">资源数</th>
                  <th className="px-4 py-3 text-right">记录规模</th>
                  <th className="px-4 py-3 text-right">存储占用</th>
                  <th className="px-4 py-3 text-right">记录变化</th>
                  <th className="px-4 py-3 text-right">变化率</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.key}
                    className={`border-t border-[var(--surface-outline)] ${index % 2 === 0 ? 'bg-[var(--surface-muted)]' : 'bg-[var(--surface-raised-strong)]'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="text-[0.75rem] font-semibold text-[var(--text-main)]">{row.title}</div>
                      <div className="mt-0.5 text-[0.6875rem] text-[var(--text-muted)]">{row.subtitle}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-[0.75rem] font-bold text-[var(--primary)]">{row.resourceCount}</td>
                    <td className="px-4 py-3 text-right text-[0.75rem] font-bold text-[var(--primary)]">{row.totalRecords}</td>
                    <td className="px-4 py-3 text-right text-[0.75rem] font-bold text-[var(--primary)]">{row.totalStorage}</td>
                    <td className={`px-4 py-3 text-right text-[0.75rem] font-bold ${row.deltaToneClass}`}>{row.deltaRecords}</td>
                    <td className={`px-4 py-3 text-right text-[0.75rem] font-bold ${row.ratioToneClass}`}>{row.deltaRatio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function FreshnessSection({
  freshCount,
  staleRows,
  total,
  topGroups,
  resourceDetailPath,
}: {
  freshCount: number
  staleRows: StatRecord[]
  total: number
  topGroups: ReturnType<typeof buildFreshnessTopGroups>
  resourceDetailPath: (resourceId: string | undefined) => string | undefined
}) {
  const staleCount = staleRows.length
  const threeDayStoppedCount = topGroups.threeDayStoppedCount
  const freshRate = total > 0 ? freshCount / total : 0

  return (
    <section className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[1rem] font-bold text-[var(--text-main)]">
            <Timer className="h-5 w-5 text-[var(--primary)]" />
            数据资源新鲜度
          </div>
          <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
            口径：按 `stat_base.base_table_name` 的 `stat_base.fresh_field_name` 统计最新业务时间。
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right text-[0.75rem] md:grid-cols-3">
          <div className="rounded-xl bg-[var(--status-success-bg)] px-3 py-2 text-[var(--status-success-text)]">
            <div className="font-bold">{formatNumber(freshCount)}</div>
            <div>新鲜</div>
          </div>
          <div className="rounded-xl bg-[var(--status-warning-bg)] px-3 py-2 text-[var(--status-warning-text)]">
            <div className="font-bold">{formatNumber(threeDayStoppedCount)}</div>
            <div>{FRESHNESS_STOPPED_BAND_LABELS.threeDayStopped}</div>
          </div>
          <div className="rounded-xl bg-[var(--status-danger-bg)] px-3 py-2 text-[var(--status-danger-text)]">
            <div className="font-bold">{formatNumber(staleCount)}</div>
            <div>长期未更新</div>
          </div>
        </div>
      </div>

      <div className="mb-4 h-3 w-full overflow-hidden rounded-full bg-[var(--table-track)]">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#2fbf8e,#56d6b1)]" style={{ width: `${(freshRate * 100).toFixed(2)}%` }} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FreshnessTopTable title="最新更新 Top5" rows={topGroups.latestUpdated} emptyText="当前周期暂无最新更新资源" resourceDetailPath={resourceDetailPath} />
        <FreshnessTopTable title={`${FRESHNESS_STOPPED_BAND_LABELS.threeDayStopped} Top5`} rows={topGroups.threeDayStopped} emptyText={`当前周期暂无${FRESHNESS_STOPPED_BAND_LABELS.threeDayStopped}资源`} resourceDetailPath={resourceDetailPath} showBusinessTimeField={false} titleToneClass="bg-[color-mix(in_srgb,var(--status-warning-bg)_82%,white)] text-[var(--status-warning-text)]" />
        <FreshnessTopTable title={`${FRESHNESS_STOPPED_BAND_LABELS.weeklyStopped} Top5`} rows={topGroups.weeklyStopped} emptyText={`当前周期暂无${FRESHNESS_STOPPED_BAND_LABELS.weeklyStopped}资源`} resourceDetailPath={resourceDetailPath} showBusinessTimeField={false} titleToneClass="bg-[rgba(59,130,246,0.12)] text-[color-mix(in_srgb,#2563eb_72%,#1f2937)]" />
        <FreshnessTopTable title={`${FRESHNESS_STOPPED_BAND_LABELS.monthlyStopped} Top5`} rows={topGroups.monthlyStopped} emptyText={`当前周期暂无${FRESHNESS_STOPPED_BAND_LABELS.monthlyStopped}资源`} resourceDetailPath={resourceDetailPath} showBusinessTimeField={false} titleToneClass="bg-[rgba(245,158,11,0.14)] text-[color-mix(in_srgb,#c2410c_72%,#1f2937)]" />
        <FreshnessTopTable title={`${FRESHNESS_STOPPED_BAND_LABELS.yearlyStopped} Top5`} rows={topGroups.yearlyStopped} emptyText={`当前周期暂无${FRESHNESS_STOPPED_BAND_LABELS.yearlyStopped}资源`} resourceDetailPath={resourceDetailPath} showBusinessTimeField={false} titleToneClass="bg-[rgba(249,115,22,0.16)] text-[color-mix(in_srgb,#c2410c_82%,#111827)]" />
        <FreshnessTopTable title={`${FRESHNESS_STOPPED_BAND_LABELS.longTermStopped} Top5`} rows={topGroups.longTermStopped} emptyText={`当前周期暂无${FRESHNESS_STOPPED_BAND_LABELS.longTermStopped}资源`} resourceDetailPath={resourceDetailPath} showBusinessTimeField={false} titleToneClass="bg-[color-mix(in_srgb,var(--status-danger-bg)_88%,white)] text-[var(--status-danger-text)]" />
      </div>
    </section>
  )
}

function FreshnessTopTable({
  title,
  rows,
  emptyText,
  resourceDetailPath,
  showBusinessTimeField = true,
  titleToneClass,
}: {
  title: string
  rows: StatRecord[]
  emptyText: string
  resourceDetailPath: (resourceId: string | undefined) => string | undefined
  showBusinessTimeField?: boolean
  titleToneClass?: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--surface-outline)]">
      <div className={`border-b border-[var(--surface-outline)] px-4 py-3 text-[0.8125rem] font-semibold ${titleToneClass ?? 'bg-[var(--table-header-bg)] text-[var(--text-main)]'}`}>{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[0.75rem]">
          <thead className="text-[0.6875rem] uppercase tracking-wide text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">资源名称</th>
              {showBusinessTimeField ? <th className="px-3 py-2">业务时间字段</th> : null}
              <th className="px-3 py-2">最新业务时间</th>
              <th className="px-3 py-2 text-right">距今天数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.id}`} className="border-t border-[var(--surface-outline)]">
                <td className="px-3 py-2 font-semibold text-[var(--text-main)]">
                  <ResourceNameLink to={resourceDetailPath(row.resourceId)} name={row.resourceName || '未命名资源'} clipLength={20} maxWidthClass="max-w-[220px]" />
                </td>
                {showBusinessTimeField ? <td className="px-3 py-2 text-[var(--text-secondary)]">{row.metainfo.business_time_field_name || '-'}</td> : null}
                <td className="px-3 py-2 text-[var(--text-secondary)]">{row.metainfo.last_record_update_time || '-'}</td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--text-main)]">{formatNumber(row.metainfo.business_time_age_days ?? 0)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-[var(--text-muted)]" colSpan={showBusinessTimeField ? 4 : 3}>
                  {emptyText}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function RunStatsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data, isLoading, isHydratingHistory, loadingExecutionDate, error, ensurePeriodLoaded } = useRunStatsData(RUN_STATS_DATA_ENABLED, { lazyByDate: true })
  const currentRunStats = useCurrentRunStats(RUN_STATS_DATA_ENABLED)
  const [searchParams] = useSearchParams()
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedTaskCode, setSelectedTaskCode] = useState('')
  const [queriedExecutionDate, setQueriedExecutionDate] = useState('')
  const [queriedTaskCode, setQueriedTaskCode] = useState('')
  const [queriedPeriod, setQueriedPeriod] = useState('')
  const [queriedJobOptions, setQueriedJobOptions] = useState<RunStatsJobOption[]>([])
  const [selectedExecutionDate, setSelectedExecutionDate] = useState('')
  const [resourceKeyword, setResourceKeyword] = useState('')
  const [queryHint, setQueryHint] = useState('')
  const [hasSyncedQueryPeriod, setHasSyncedQueryPeriod] = useState(false)
  const [pendingQueryPeriodDate, setPendingQueryPeriodDate] = useState('')
  const [isSubmittingQuery, setIsSubmittingQuery] = useState(false)
  const [loadingJobOptions, setLoadingJobOptions] = useState(false)
  const [detailTablePage, setDetailTablePage] = useState(1)
  const queryPeriodRequestIdRef = useRef(0)
  const jobOptionsRequestIdRef = useRef(0)
  const hasAppliedCurrentDefaultQueryRef = useRef(false)
  const [tableSort, setTableSort] = useState<{ key: TableSortKey; direction: TableSortDirection }>({
    key: 'recordCount',
    direction: 'desc',
  })
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const resourceDetailPath = (resourceId: string | undefined) => (resourceId ? withEmbed(`/catalog/${resourceId}`) : undefined)
  const {
    taskOptions,
    isLoading: isTaskOptionsLoading,
    loadingExecutionDate: loadingTaskExecutionDate,
    ensureExecutionDateLoaded: ensureTaskExecutionDateLoaded,
  } = useRunStatsTasks(true, data.periods)
  const queryPeriod = (searchParams.get('period') || '').trim()
  const defaultExecutionDate = useMemo(() => formatDateInputValue(new Date()), [])
  const currentDefaultQuery = currentRunStats.defaultQuery
  const hasActiveQuery = Boolean(queriedExecutionDate && queriedTaskCode && queriedPeriod)
  const hasQueriedFilters = Boolean(queriedExecutionDate && queriedTaskCode)
  const filteredTaskOptions = taskOptions
  const filteredPeriodOptions = queriedJobOptions

  useEffect(() => {
    queryPeriodRequestIdRef.current += 1
    setHasSyncedQueryPeriod(false)
    setPendingQueryPeriodDate('')
    setQueryHint('')
    if (!queryPeriod) return
    setSelectedPeriod('')
    setQueriedExecutionDate('')
    setQueriedTaskCode('')
    setQueriedPeriod('')
    setQueriedJobOptions([])
  }, [queryPeriod])

  useEffect(() => {
    if (queryPeriod || selectedExecutionDate) return
    setSelectedExecutionDate(defaultExecutionDate)
  }, [defaultExecutionDate, queryPeriod, selectedExecutionDate])

  useEffect(() => {
    if (queryPeriod || hasAppliedCurrentDefaultQueryRef.current) return
    if (!currentDefaultQuery.executionDate || !currentDefaultQuery.taskCode || !currentDefaultQuery.periodCode) return
    if (selectedTaskCode || selectedPeriod || queriedExecutionDate || queriedTaskCode || queriedPeriod) return
    if (selectedExecutionDate && selectedExecutionDate !== defaultExecutionDate && selectedExecutionDate !== currentDefaultQuery.executionDate) return

    hasAppliedCurrentDefaultQueryRef.current = true
    setSelectedExecutionDate(currentDefaultQuery.executionDate)
    setSelectedTaskCode(currentDefaultQuery.taskCode)
    setSelectedPeriod(currentDefaultQuery.periodCode)
    setQueriedExecutionDate(currentDefaultQuery.executionDate)
    setQueriedTaskCode(currentDefaultQuery.taskCode)
    setQueriedPeriod(currentDefaultQuery.periodCode)
    setQueryHint(`已默认定位到最新统计作业 ${currentDefaultQuery.periodCode}`)
  }, [
    currentDefaultQuery.executionDate,
    currentDefaultQuery.periodCode,
    currentDefaultQuery.taskCode,
    defaultExecutionDate,
    queryPeriod,
    queriedExecutionDate,
    queriedPeriod,
    queriedTaskCode,
    selectedExecutionDate,
    selectedPeriod,
    selectedTaskCode,
  ])

  useEffect(() => {
    if (!queryPeriod || hasSyncedQueryPeriod) return

    const queryPeriodDate = extractPeriodDateKey(queryPeriod)
    if (!queryPeriodDate) {
      setSelectedExecutionDate(defaultExecutionDate)
      setHasSyncedQueryPeriod(true)
      setQueryHint(`未找到统计作业 ${queryPeriod}，请重新选择查询条件。`)
      return
    }
    if (pendingQueryPeriodDate === queryPeriodDate) return

    const requestId = queryPeriodRequestIdRef.current
    setPendingQueryPeriodDate(queryPeriodDate)
    setSelectedExecutionDate(queryPeriodDate)
    setSelectedTaskCode('')
    setSelectedPeriod('')
    setQueryHint('')
    void ensureTaskExecutionDateLoaded(queryPeriodDate)
      .then(async (taskPayload) => {
        if (queryPeriodRequestIdRef.current !== requestId) return

        const matchedTaskBinding = taskPayload.periodTaskMap[queryPeriod]
        const taskCode = matchedTaskBinding?.taskCode ?? ''
        if (!taskCode) {
          setSelectedExecutionDate(queryPeriodDate)
          setSelectedTaskCode('')
          setSelectedPeriod('')
          setQueriedExecutionDate('')
          setQueriedTaskCode('')
          setQueriedPeriod('')
          setQueriedJobOptions([])
          setHasSyncedQueryPeriod(true)
          setQueryHint(`未找到统计作业 ${queryPeriod}，请重新选择查询条件。`)
          return
        }

        const jobOptions = await fetchRunStatsJobOptionsByExecutionDate(queryPeriodDate, taskCode)
        if (queryPeriodRequestIdRef.current !== requestId) return
        if (!jobOptions.some((item) => item.periodCode === queryPeriod)) {
          setSelectedExecutionDate(queryPeriodDate)
          setSelectedTaskCode('')
          setSelectedPeriod('')
          setQueriedExecutionDate('')
          setQueriedTaskCode('')
          setQueriedPeriod('')
          setQueriedJobOptions([])
          setHasSyncedQueryPeriod(true)
          setQueryHint(`未找到统计作业 ${queryPeriod}，请重新选择查询条件。`)
          return
        }

        await ensurePeriodLoaded(queryPeriod)
        if (queryPeriodRequestIdRef.current !== requestId) return

        // Load data for trend window periods
        const trendPeriodCodes = resolveRunStatsTrendPeriodCodes(jobOptions, queryPeriod, 10)
        await Promise.all(trendPeriodCodes.map((code) => ensurePeriodLoaded(code).catch(() => undefined)))
        if (queryPeriodRequestIdRef.current !== requestId) return

        setSelectedExecutionDate(queryPeriodDate)
        setSelectedTaskCode(taskCode)
        setSelectedPeriod(queryPeriod)
        setQueriedExecutionDate(queryPeriodDate)
        setQueriedTaskCode(taskCode)
        setQueriedPeriod(queryPeriod)
        setQueriedJobOptions(jobOptions)
        setHasSyncedQueryPeriod(true)
        setQueryHint(`已定位到统计作业 ${queryPeriod}`)
      })
      .catch(() => {
        if (queryPeriodRequestIdRef.current !== requestId) return
        setSelectedExecutionDate(queryPeriodDate)
        setSelectedTaskCode('')
        setSelectedPeriod('')
        setQueriedExecutionDate('')
        setQueriedTaskCode('')
        setQueriedPeriod('')
        setQueriedJobOptions([])
        setHasSyncedQueryPeriod(true)
        setQueryHint(`未找到统计作业 ${queryPeriod}，请重新选择查询条件。`)
      })
      .finally(() => {
        if (queryPeriodRequestIdRef.current === requestId) {
          setPendingQueryPeriodDate('')
        }
      })
  }, [
    defaultExecutionDate,
    ensurePeriodLoaded,
    ensureTaskExecutionDateLoaded,
    hasSyncedQueryPeriod,
    pendingQueryPeriodDate,
    queryPeriod,
  ])

  useEffect(() => {
    if (!shouldResetRunStatsTaskSelection({
      selectedTaskCode,
      taskOptions: filteredTaskOptions,
      isTaskCatalogLoading: isTaskOptionsLoading,
    })) return
    setSelectedTaskCode('')
    setSelectedPeriod('')
    setQueriedJobOptions([])
  }, [filteredTaskOptions, isTaskOptionsLoading, selectedTaskCode])

  useEffect(() => {
    if (!shouldLoadRunStatsJobOptions({ selectedExecutionDate, selectedTaskCode })) {
      setLoadingJobOptions(false)
      setQueriedJobOptions([])
      if (!selectedTaskCode) {
        setSelectedPeriod('')
      }
      return
    }

    const requestId = jobOptionsRequestIdRef.current + 1
    jobOptionsRequestIdRef.current = requestId
    setLoadingJobOptions(true)
    setQueryHint('')

    void fetchRunStatsJobOptionsByExecutionDate(selectedExecutionDate, selectedTaskCode)
      .then((jobOptions) => {
        if (jobOptionsRequestIdRef.current !== requestId) return
        setQueriedJobOptions(jobOptions)
        setSelectedPeriod(
          resolvePreferredRunStatsJobSelection({
            selectedExecutionDate,
            selectedTaskCode,
            queriedExecutionDate,
            queriedTaskCode,
            queriedPeriod,
            jobOptions,
          }),
        )
      })
      .catch(() => {
        if (jobOptionsRequestIdRef.current !== requestId) return
        setQueriedJobOptions([])
        setSelectedPeriod('')
        setQueryHint('统计作业列表读取失败，请稍后重试。')
      })
      .finally(() => {
        if (jobOptionsRequestIdRef.current === requestId) {
          setLoadingJobOptions(false)
        }
      })
  }, [
    queriedExecutionDate,
    queriedPeriod,
    queriedTaskCode,
    selectedExecutionDate,
    selectedTaskCode,
  ])

  const isExecutionDatePending = Boolean(pendingQueryPeriodDate) && pendingQueryPeriodDate === selectedExecutionDate
  const isWaitingForQueryPeriod = Boolean(queryPeriod) && !hasSyncedQueryPeriod && (isHydratingHistory || isExecutionDatePending)
  const isExecutionDateLoading = isExecutionDatePending || (Boolean(loadingExecutionDate) && loadingExecutionDate === selectedExecutionDate)
  const isTaskExecutionDateLoading = Boolean(loadingTaskExecutionDate) && loadingTaskExecutionDate === selectedExecutionDate
  const isExecutionDateLoadingWithTask = isExecutionDateLoading || isTaskExecutionDateLoading
  const isTaskSelectionLoading = isTaskOptionsLoading || isExecutionDateLoadingWithTask

  const hasPendingQueryChanges = hasRunStatsPendingQueryChanges({
    selectedExecutionDate,
    selectedTaskCode,
    selectedPeriod,
    queriedExecutionDate,
    queriedTaskCode,
    queriedPeriod,
  })
  const isRefreshing = isLoading && data.periods.length > 0
  const shouldRenderDashboardData =
    hasActiveQuery && !hasPendingQueryChanges && !isWaitingForQueryPeriod && !isSubmittingQuery
  const effectivePeriod = shouldRenderDashboardData ? queriedPeriod : ''
  const reportCenterPath = buildRunStatsReportCenterPath({
    withEmbed,
    selectedExecutionDate,
    selectedTaskCode,
    selectedPeriod,
    queriedExecutionDate,
    queriedTaskCode,
    queriedPeriod,
  })
  const queriedData = useMemo(
    () => filterRunStatsDataByPeriods(data, effectivePeriod ? [effectivePeriod] : []),
    [data, effectivePeriod],
  )
  const queryControlState = resolveRunStatsQueryControlState({
    selectedExecutionDate,
    selectedTaskCode,
    selectedPeriod,
    taskOptionCount: filteredTaskOptions.length,
    jobOptionCount: filteredPeriodOptions.length,
    isTaskLoading: isTaskSelectionLoading,
    isJobLoading: loadingJobOptions,
    isSubmittingQuery,
  })
  const isSelectingDateFilters = false
  const isCurrentQueryEmpty = hasQueriedFilters && !hasPendingQueryChanges && !loadingJobOptions && filteredPeriodOptions.length === 0

  const selectedRecords = useMemo(
    () => queriedData.records.filter((item) => item.periodCode === effectivePeriod),
    [effectivePeriod, queriedData.records],
  )

  const selectedSummary = useMemo(
    () => data.periodSummaries.find((item) => item.periodCode === effectivePeriod),
    [data.periodSummaries, effectivePeriod],
  )
  const trendCandidateSummaries = useMemo(
    () => buildRunStatsTrendSummariesFromRecords(selectedRecords, selectedSummary),
    [selectedRecords, selectedSummary],
  )

  const trendWindow = useMemo(() => {
    const summariesFromJobOptions = buildRunStatsTrendWindowFromJobOptions(
      data.periodSummaries,
      filteredPeriodOptions,
      effectivePeriod,
      10,
    )
    const summariesFromRecords = buildRunStatsTrendWindow(selectedSummary, trendCandidateSummaries, 10)

    if (summariesFromRecords.length > 1 && summariesFromRecords.length >= summariesFromJobOptions.length) {
      return summariesFromRecords
    }
    if (summariesFromJobOptions.length > 0) {
      return summariesFromJobOptions
    }
    return summariesFromRecords
  }, [data.periodSummaries, effectivePeriod, filteredPeriodOptions, selectedSummary, trendCandidateSummaries])

  const previousSummary = useMemo(() => {
    if (!selectedSummary) return undefined
    const idx = trendWindow.findIndex((item) => item.periodCode === selectedSummary.periodCode)
    if (idx <= 0) return undefined
    return trendWindow[idx - 1]
  }, [selectedSummary, trendWindow])

  useEffect(() => {
    if (!queriedPeriod || filteredPeriodOptions.length === 0) return
    const trendPeriodCodes = resolveRunStatsTrendPeriodCodes(filteredPeriodOptions, queriedPeriod, 10)
    trendPeriodCodes.forEach((code) => {
      if (code !== queriedPeriod) {
        void ensurePeriodLoaded(code).catch(() => undefined)
      }
    })
  }, [queriedPeriod, filteredPeriodOptions, ensurePeriodLoaded])

  const previousPeriodRecords: StatRecord[] = []
  const resolveTopCategory = (item: StatRecord) => resolveStatTopCategory(item)

  const tableRows = useMemo(() => {
    const keyword = resourceKeyword.trim().toLowerCase()
    const filteredRows = !keyword
      ? selectedRecords
      : selectedRecords.filter((item) => {
      const haystack = `${item.resourceCode} ${item.resourceName}`.toLowerCase()
      return haystack.includes(keyword)
    })

    return [...filteredRows].sort((a, b) => {
      const left = getTableSortValue(a, tableSort.key)
      const right = getTableSortValue(b, tableSort.key)
      if (left !== right) {
        return tableSort.direction === 'asc' ? left - right : right - left
      }
      return (a.resourceCode || a.resourceName || '').localeCompare(b.resourceCode || b.resourceName || '', 'zh-CN')
    })
  }, [resourceKeyword, selectedRecords, tableSort])
  const detailTablePagination = useMemo(
    () => paginateRunStatsDetailRows(tableRows, detailTablePage, DETAIL_TABLE_PAGE_SIZE),
    [detailTablePage, tableRows],
  )
  const detailTablePaginationItems = useMemo(
    () => buildPaginationItems(detailTablePagination.safePage, detailTablePagination.totalPages),
    [detailTablePagination.safePage, detailTablePagination.totalPages],
  )

  useEffect(() => {
    setDetailTablePage(1)
  }, [effectivePeriod, resourceKeyword, tableSort.direction, tableSort.key])

  useEffect(() => {
    if (detailTablePage === detailTablePagination.safePage) return
    setDetailTablePage(detailTablePagination.safePage)
  }, [detailTablePage, detailTablePagination.safePage])

  const totalRecords = selectedRecords.reduce((sum, item) => sum + (item.metainfo.record_count ?? 0), 0)
  const totalStorageBytes = selectedRecords.reduce((sum, item) => sum + (item.metainfo.storage_bytes ?? 0), 0)
  const totalFieldCount = selectedRecords.reduce((sum, item) => sum + (item.metainfo.field_count ?? 0), 0)
  const normalCount = selectedRecords.filter((item) => item.connectStatus === '01').length
  const abnormalCount = selectedRecords.filter((item) => item.connectStatus === '02' || item.connectStatus === '99').length
  const slowCount = selectedRecords.filter((item) => item.connectStatus === '04').length
  const freshCount = selectedRecords.filter(isFreshBusinessTime).length
  const staleBusinessTimeRows = [...selectedRecords]
    .filter(isStaleBusinessTime)
    .sort((a, b) => (b.metainfo.business_time_age_days ?? 0) - (a.metainfo.business_time_age_days ?? 0))
  const freshnessTopGroups = useMemo(
    () => buildFreshnessTopGroups(selectedRecords, selectedSummary?.executedAt || ''),
    [selectedRecords, selectedSummary],
  )
  const normalRate = selectedRecords.length > 0 ? normalCount / selectedRecords.length : 0
  const freshnessRate = selectedRecords.length > 0 ? freshCount / selectedRecords.length : 0
  const recordRatio = selectedRecords.length > 0 ? totalRecords / selectedRecords.length : 0
  const avgFieldCount = selectedRecords.length > 0 ? totalFieldCount / selectedRecords.length : 0
  const resourceRatioDelta = 0
  const recordRatioDelta = calcPeriodRatioDelta(selectedSummary?.totalRecords ?? 0, previousSummary?.totalRecords)
  const storageRatioDelta = calcPeriodRatioDelta(selectedSummary?.totalStorageBytes ?? 0, previousSummary?.totalStorageBytes)
  const normalRateRatioDelta = 0
  const freshnessRateRatioDelta = 0

  const topByRecord = useMemo(
    () => [...selectedRecords].sort((a, b) => (b.metainfo.record_count ?? 0) - (a.metainfo.record_count ?? 0)).slice(0, 5),
    [selectedRecords],
  )
  const topByStorage = useMemo(
    () => [...selectedRecords].sort((a, b) => (b.metainfo.storage_bytes ?? 0) - (a.metainfo.storage_bytes ?? 0)).slice(0, 5),
    [selectedRecords],
  )

  const dynamicTopChanges = useMemo(
    () => buildResourceRecordChangeTopItems(selectedRecords, previousPeriodRecords, 5),
    [previousPeriodRecords, selectedRecords],
  )

  const categoryTopSummaries = useMemo(() => {
    return buildStatDimensionSummaries(
      selectedRecords,
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
  }, [selectedRecords])

  const categoryChangeItems = useMemo(() => {
    return buildDimensionChangeTopItems(
      selectedRecords,
      (item) => {
        const category = resolveTopCategory(item)
        return {
          key: category.id,
          label: category.label,
        }
      },
      5,
    )
  }, [selectedRecords])

  const domainStatsRows = useMemo(
    () => buildDomainStatsRows(selectedRecords, (item) => resolveTopCategory(item).label),
    [selectedRecords],
  )

  const layerTopSummaries = useMemo(
    () =>
      buildStatDimensionSummaries(
        selectedRecords.filter((item) => item.dataLayerCode !== 'OTHER'),
        (item) => {
          const seed = DATA_LAYER_SEEDS.find((entry) => entry.key === item.dataLayerCode)
          return {
            key: item.dataLayerCode,
            label: item.dataLayerName,
            order: seed?.order ?? 999,
          }
        },
        { sortBy: 'order', seedGroups: DATA_LAYER_SEEDS },
      ),
    [selectedRecords],
  )
  const connectivityTopResourceRows = useMemo(() => buildConnectivityTopResourceRows(selectedRecords), [selectedRecords])
  const connectivityCategoryRows = useMemo(
    () => buildConnectivityCategoryRows(selectedRecords, resolveTopCategory, 5),
    [selectedRecords],
  )

  const handleTableSort = (key: TableSortKey) => {
    setTableSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === 'desc' ? 'asc' : 'desc',
        }
      }
      return {
        key,
        direction: 'desc',
      }
    })
  }

  if (isLoading && data.periods.length === 0) {
    return (
      <div className="flex h-[440px] items-center justify-center">
        <div className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-3 text-[0.875rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
          正在读取数据资源统计信息...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <RunStatsSecondaryNav withEmbed={withEmbed} />
      <section className="rounded-2xl border border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] p-6 shadow-[var(--shadow-medium)]">
        <div className="grid gap-5 xl:grid-cols-[1fr_auto]">
          <div className="flex flex-col items-start gap-2 text-[0.75rem] text-[var(--text-muted)]">
            {isRefreshing ? <span>统计数据刷新中...</span> : null}
            {isWaitingForQueryPeriod ? <span>正在定位统计作业 {queryPeriod} 的查询条件，请稍候。</span> : null}
            {!isWaitingForQueryPeriod && isSubmittingQuery ? <span>正在更新当前统计看板，请稍候...</span> : null}
            {!isWaitingForQueryPeriod && !isSubmittingQuery && isTaskOptionsLoading ? <span>正在读取统计任务列表，请稍候...</span> : null}
            {!isWaitingForQueryPeriod && !isSubmittingQuery && isExecutionDateLoadingWithTask ? <span>正在读取所选日期下的统计结果，请稍候...</span> : null}
            {!isWaitingForQueryPeriod && !isSubmittingQuery && !isExecutionDateLoadingWithTask && loadingJobOptions ? <span>正在读取所选任务下的统计作业，请稍候...</span> : null}
            {!isWaitingForQueryPeriod && !isSubmittingQuery && !isExecutionDateLoadingWithTask && hasPendingQueryChanges ? <span>已修改查询条件，点击“查询”后更新当前统计看板。</span> : null}
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[220px_220px_360px_1fr_auto_auto]">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="date"
              value={selectedExecutionDate}
              disabled={isLoading || isExecutionDateLoadingWithTask || isSubmittingQuery}
              onChange={(event) => {
                setSelectedExecutionDate(event.target.value)
                setSelectedTaskCode('')
                setSelectedPeriod('')
                setQueriedJobOptions([])
                setQueryHint('')
              }}
              className="h-10 w-full rounded-xl border border-[var(--surface-outline)] bg-[var(--field-bg)] pl-9 pr-3 text-[0.8125rem] text-[var(--text-main)] outline-none"
            />
          </div>
          <select
            data-testid="task-select"
            className="h-10 rounded-xl border border-[var(--surface-outline)] bg-[var(--field-bg)] px-3 text-[0.8125rem] text-[var(--text-main)] outline-none"
            value={selectedTaskCode}
            disabled={!queryControlState.taskEnabled}
            onChange={(event) => {
              const nextTaskCode = event.target.value
              setSelectedTaskCode(nextTaskCode)
              setSelectedPeriod('')
              setQueriedJobOptions([])
              setQueryHint('')
            }}
          >
            <option value="">请选择任务</option>
            {filteredTaskOptions.map((option) => (
              <option key={option.taskCode} value={option.taskCode}>
                {`${option.taskName}（${option.taskCode}）`}
              </option>
            ))}
          </select>
          <select
            data-testid="period-select"
            className="h-10 rounded-xl border border-[var(--surface-outline)] bg-[var(--field-bg)] px-3 text-[0.8125rem] text-[var(--text-main)] outline-none"
            value={selectedPeriod}
            disabled={!queryControlState.jobEnabled}
            onChange={(event) => {
              setSelectedPeriod(event.target.value)
              setQueryHint('')
            }}
          >
            {filteredPeriodOptions.length > 0 ? (
              filteredPeriodOptions.map((summary) => (
                <option key={summary.periodCode} value={summary.periodCode}>
                  {formatPeriodOptionLabel(summary)}
                </option>
              ))
            ) : (
              <option value="">
                {selectedTaskCode ? '当前条件下无作业' : '请先选择统计任务'}
              </option>
            )}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={resourceKeyword}
              onChange={(event) => setResourceKeyword(event.target.value)}
              placeholder="按资源编码/名称过滤表格"
              className="h-10 w-full rounded-xl border border-[var(--surface-outline)] bg-[var(--field-bg)] pl-9 pr-3 text-[0.8125rem] text-[var(--text-main)] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!selectedExecutionDate || !selectedTaskCode || !selectedPeriod || isSubmittingQuery) return
              setIsSubmittingQuery(true)
              setQueryHint('')
              // Load the selected period plus preceding periods for the trend chart
              const trendPeriodCodes = resolveRunStatsTrendPeriodCodes(filteredPeriodOptions, selectedPeriod, 10)
              const loadPromises = trendPeriodCodes.map(
                (code) => ensurePeriodLoaded(code).catch(() => undefined) as Promise<unknown>,
              )
              void Promise.all(loadPromises)
                .then(() => {
                  setQueriedExecutionDate(selectedExecutionDate)
                  setQueriedTaskCode(selectedTaskCode)
                  setQueriedPeriod(selectedPeriod)
                  setQueryHint(`已切换到统计作业 ${selectedPeriod}`)
                })
                .catch(() => {
                  setQueryHint(`统计作业 ${selectedPeriod} 读取失败，请稍后重试。`)
                })
                .finally(() => {
                  setIsSubmittingQuery(false)
                })
            }}
            disabled={!queryControlState.queryEnabled}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 text-[0.75rem] font-semibold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            查询
          </button>
          <button
            type="button"
            onClick={() => {
              navigate(reportCenterPath)
            }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.75rem] font-semibold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileText className="h-4 w-4" />
            报告中心
          </button>
        </div>
        {queryHint ? <div className="mt-2 text-[0.75rem] text-[var(--text-muted)]">{queryHint}</div> : null}
        {!isWaitingForQueryPeriod && !isSubmittingQuery && !hasQueriedFilters ? (
          <div className="mt-2 text-[0.75rem] text-[var(--text-muted)]">
            请先选择统计日期和统计任务后点击查询。
          </div>
        ) : null}
        {!isWaitingForQueryPeriod && !isSubmittingQuery && isCurrentQueryEmpty ? (
          <div className="mt-2 text-[0.75rem] text-[var(--text-muted)]">
            所选日期与统计任务下暂无可用作业，请重新选择条件。
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div>
      ) : null}

      {isWaitingForQueryPeriod || isSelectingDateFilters ? (
        <section className="flex h-[420px] items-center justify-center rounded-2xl border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-5 shadow-[var(--shadow-soft)]">
          <div className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-5 py-4 text-[0.875rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
            正在读取所选日期下的统计任务与作业，请稍候...
          </div>
        </section>
      ) : isSubmittingQuery ? (
        <section className="flex h-[420px] items-center justify-center rounded-2xl border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-5 shadow-[var(--shadow-soft)]">
          <div className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-5 py-4 text-[0.875rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
            正在更新当前统计看板，请稍候...
          </div>
        </section>
      ) : isCurrentQueryEmpty ? (
        <section className="flex h-[420px] items-center justify-center rounded-2xl border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-5 shadow-[var(--shadow-soft)]">
          <div className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-5 py-4 text-[0.875rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
            所选日期与统计任务下暂无可用作业，请重新选择条件。
          </div>
        </section>
      ) : hasPendingQueryChanges ? (
        <section className="flex h-[420px] items-center justify-center rounded-2xl border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-5 shadow-[var(--shadow-soft)]">
          <div className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-5 py-4 text-[0.875rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
            当前查询条件已变化，请点击“查询”更新统计看板。
          </div>
        </section>
      ) : isLoading && !hasActiveQuery ? (
        <section className="flex h-[420px] items-center justify-center rounded-2xl border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-5 shadow-[var(--shadow-soft)]">
          <div className="rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-5 py-4 text-[0.875rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
            正在读取数据资源统计信息，请稍候...
          </div>
        </section>
      ) : (
        <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="资源数"
          value={formatNumber(selectedRecords.length)}
          sub={`平均 ${recordRatio.toFixed(1)} 条/资源`}
          icon={<Database className="h-5 w-5" />}
          trend={{ label: `相对上一统计批次 ${formatRatio(resourceRatioDelta)}`, positive: resourceRatioDelta >= 0 }}
        />
        <MetricCard
          title="记录总量"
          value={formatRunStatsRecordMetricValue(totalRecords)}
          sub={`统计周期 ${effectivePeriod}`}
          icon={<BarChart3 className="h-5 w-5" />}
          trend={{ label: `相对上一统计批次 ${formatRatio(recordRatioDelta)}`, positive: recordRatioDelta >= 0 }}
        />
        <MetricCard
          title="存储总量"
          value={toGBOrMB(totalStorageBytes)}
          sub={`平均字段数 ${avgFieldCount.toFixed(2)}`}
          icon={<Activity className="h-5 w-5" />}
          trend={{ label: `相对上一统计批次 ${formatRatio(storageRatioDelta)}`, positive: storageRatioDelta >= 0 }}
        />
        <MetricCard
          title="联通通畅率"
          value={toPercent(normalRate, 2)}
          sub={`断开/其他 ${abnormalCount} · 缓慢 ${slowCount}`}
          icon={<Gauge className="h-5 w-5" />}
          trend={{ label: `相对上一统计批次 ${formatRatio(normalRateRatioDelta)}`, positive: normalRateRatioDelta >= 0 }}
        />
        <MetricCard
          title="业务新鲜率"
          value={toPercent(freshnessRate, 2)}
          sub={`长期未更新 ${staleBusinessTimeRows.length}`}
          icon={<Timer className="h-5 w-5" />}
          trend={{ label: `相对上一统计批次 ${formatRatio(freshnessRateRatioDelta)}`, positive: freshnessRateRatioDelta >= 0 }}
        />
      </section>

      <section>
        <TrendChart periods={trendWindow} />
      </section>

      <section>
        <DomainChartsSection rows={domainStatsRows} />
      </section>

      <section className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[1rem] font-bold text-[var(--text-main)]">
              <BarChart3 className="h-5 w-5 text-[var(--primary)]" />
              数据分布情况
            </div>
            <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
              按一级分类、主分层和资源规模查看当前统计周期的数据分布。
            </div>
          </div>
        </div>
        <div className="grid items-stretch gap-4 xl:grid-cols-2">
          <CategoryTopSummaryCard items={categoryTopSummaries} />
          <LayerSummaryCard items={layerTopSummaries} />
          <TopRankingCard
            title="TOP5 记录规模"
            items={topByRecord}
            icon={<Database className="h-4 w-4 text-[var(--primary)]" />}
            metric={(item) => `${formatNumber(item.metainfo.record_count ?? 0)} 条`}
            toPath={(item) => resourceDetailPath(item.resourceId)}
          />
          <TopRankingCard
            title="TOP5 存储占用"
            items={topByStorage}
            icon={<BarChart3 className="h-4 w-4 text-[var(--primary)]" />}
            metric={(item) => formatMB(item.metainfo.storage_bytes ?? 0)}
            toPath={(item) => resourceDetailPath(item.resourceId)}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[1rem] font-bold text-[var(--text-main)]">
              <ArrowUpRight className="h-5 w-5 text-emerald-600" />
              数据变化情况
            </div>
            <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
              查看当前统计周期相对上一统计批次的一级分类变化和资源记录变化。
            </div>
          </div>
        </div>
        <div className="grid items-stretch gap-4 xl:grid-cols-2">
          <CategoryChangeRankingCard
            title="TOP5 本期一级分类变化"
            items={categoryChangeItems}
            icon={<Database className="h-4 w-4 text-emerald-600" />}
          />
          <DynamicTopRankingCard
            title="TOP5 本期记录变化"
            items={dynamicTopChanges}
            icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />}
            toPath={(item) => resourceDetailPath(item.resourceId)}
          />
        </div>
      </section>

      <FreshnessSection
        freshCount={freshCount}
        staleRows={staleBusinessTimeRows}
        total={selectedRecords.length}
        topGroups={freshnessTopGroups}
        resourceDetailPath={resourceDetailPath}
      />

      <ConnectivitySection
        topResourceRows={connectivityTopResourceRows}
        categoryRows={connectivityCategoryRows}
        resourceDetailPath={resourceDetailPath}
      />

      <section className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[1rem] font-bold text-[var(--text-main)]">资源级明细表（当前周期）</div>
          <div className="text-[0.75rem] text-[var(--text-muted)]">共 {tableRows.length} 条</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1260px] w-full text-left">
            <thead>
              <tr className="border-b border-[var(--surface-outline)] bg-[var(--table-header-bg)] text-[0.6875rem] uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-3 py-3">资源编码</th>
                <th className="w-[240px] px-3 py-3">资源名称</th>
                <th className="px-3 py-3">联通状态</th>
                <th className="px-3 py-3 text-right">
                  <SortableHeader label="记录量" sortKey="recordCount" currentSort={tableSort} onSort={handleTableSort} />
                </th>
                <th className="px-3 py-3 text-right">
                  <SortableHeader label="存储量" sortKey="storageBytes" currentSort={tableSort} onSort={handleTableSort} />
                </th>
                <th className="px-3 py-3 text-right">
                  <SortableHeader label="物理表数量" sortKey="tableCount" currentSort={tableSort} onSort={handleTableSort} />
                </th>
                <th className="px-3 py-3 text-right">
                  <SortableHeader label="字段数" sortKey="fieldCount" currentSort={tableSort} onSort={handleTableSort} />
                </th>
                <th className="px-3 py-3 text-right">
                  <SortableHeader label="有值字段数" sortKey="nonNullFieldCount" currentSort={tableSort} onSort={handleTableSort} />
                </th>
                <th className="px-3 py-3 text-right">
                  <SortableHeader label="记录相对上期" sortKey="recordRatio" currentSort={tableSort} onSort={handleTableSort} />
                </th>
                <th className="px-3 py-3 text-right">
                  <SortableHeader label="记录变化" sortKey="recordDelta" currentSort={tableSort} onSort={handleTableSort} />
                </th>
                <th className="px-3 py-3 text-right">
                  <SortableHeader label="异常条目" sortKey="errorCount" currentSort={tableSort} onSort={handleTableSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {detailTablePagination.items.map((row) => {
                const status = connectStatusMeta(row.connectStatus)
                const recordRatioValue = row.dayOnDay.record_count?.ratio
                const recordDeltaValue = row.dayOnDay.record_count?.delta
                const recordChangeToneClass = changeToneClass(recordDeltaValue)
                const recordRatioToneClass = changeToneClass(recordRatioValue)
                const resourceName = row.resourceName || '未命名资源'
                const detailPath = resourceDetailPath(row.resourceId)
                return (
                  <tr key={row.id} className="border-b border-[var(--surface-outline)] text-[0.75rem] hover:bg-[var(--surface-tint)]">
                    <td className="px-3 py-2.5 font-semibold text-[var(--text-secondary)]">{row.resourceCode || '-'}</td>
                    <td className="w-[240px] px-3 py-2.5 font-semibold text-[var(--text-main)]">
                      <ResourceNameLink to={detailPath} name={resourceName} clipLength={15} maxWidthClass="max-w-[240px]" />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6875rem] ${status.toneClass}`}>{status.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(row.metainfo.record_count ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right">{formatMB(row.metainfo.storage_bytes ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(row.metainfo.table_count ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(row.metainfo.field_count ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(row.metainfo.non_null_field_count ?? 0)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${recordRatioToneClass}`}>{formatRatio(recordRatioValue)}</td>
                    <td className={`px-3 py-2.5 text-right ${recordChangeToneClass}`}>
                      <div className="font-semibold">{formatDelta(recordDeltaValue)}</div>
                      <div className="mt-0.5 text-[0.6875rem]">{formatRatio(recordRatioValue)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(row.errorList.length)}</td>
                  </tr>
                )
              })}
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]">
                    当前筛选条件下没有可显示的统计记录。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {tableRows.length > 0 ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[rgba(226,234,241,0.9)] pt-4">
            <div className="text-[0.75rem] text-[var(--text-muted)]">
              第 {detailTablePagination.safePage} / {detailTablePagination.totalPages} 页，每页 {detailTablePagination.pageSize} 条
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDetailTablePage((current) => Math.max(1, current - 1))}
                disabled={detailTablePagination.safePage <= 1}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 text-[0.75rem] font-semibold text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                上一页
              </button>
              {detailTablePaginationItems.map((item, index) =>
                item === 'ellipsis' ? (
                  <span
                    key={`detail-table-ellipsis-${index}`}
                    className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-[0.75rem] font-semibold text-[var(--text-muted)]"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDetailTablePage(item)}
                    className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-[0.75rem] font-semibold transition ${
                      item === detailTablePagination.safePage
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
                onClick={() => setDetailTablePage((current) => Math.min(detailTablePagination.totalPages, current + 1))}
                disabled={detailTablePagination.safePage >= detailTablePagination.totalPages}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 text-[0.75rem] font-semibold text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </section>
        </>
      )}
    </div>
  )
}
