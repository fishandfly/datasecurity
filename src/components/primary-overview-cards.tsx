import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { CatalogItem } from '../lib/nocobase-portal-data'
import { getCatalogResourceTypeFilterId } from '../lib/catalog-resource-type'
import { countActiveThemes } from '../lib/home-page-insights'
import type { HomeOverviewSnapshot } from '../lib/home-page-insights'
import { useCurrentOverviewStats, type CurrentOverviewResourceTrend, type CurrentOverviewTrendPoint } from '../lib/nocobase-stat-data'
import { usePortalContext } from '../lib/portal-context'

const OVERVIEW_CHART_WIDTH = 160
const OVERVIEW_CHART_HEIGHT = 64
const RECORD_OVERVIEW_CHART_WIDTH = 118
const HOME_RECORD_HISTORY_TEXT = (
  <span className="inline-block max-w-full whitespace-nowrap text-[0.75rem] font-medium leading-5 tracking-[-0.02em] xl:text-[0.8125rem]">
    2025年5.89亿条,2024年4.28亿条
  </span>
)
const HOME_RECORD_TREND_BASE = [
  { periodCode: '2024', value: 428000000 },
  { periodCode: '2025', value: 589000000 },
]
const HIDDEN_TREND_FOOTER_PLACEHOLDER = <span className="invisible">最近 1 次统计</span>
const THEME_OVERVIEW_METRIC_STYLE = { line: 'var(--primary)', fill: 'rgba(var(--theme-strong-rgb),0.16)' }
const ACTIVE_OVERVIEW_METRIC_STYLE = { line: 'var(--theme-accent-strong)', fill: 'rgba(var(--theme-strong-rgb),0.24)' }
const DEFAULT_OVERVIEW_METRIC_STYLE = THEME_OVERVIEW_METRIC_STYLE
const ACTIVE_OVERVIEW_CARD_CLASSNAME = 'border-[rgba(var(--theme-soft-rgb),0.56)] shadow-[0_0_0_1px_rgba(var(--theme-soft-rgb),0.32),0_26px_56px_rgba(var(--theme-strong-rgb),0.18)]'
const ACTIVE_OVERVIEW_CARD_TINT_CLASSNAME = 'bg-[linear-gradient(145deg,rgba(var(--theme-soft-rgb),0.18),rgba(var(--theme-strong-rgb),0.12)_46%,transparent_100%)]'
const ACTIVE_OVERVIEW_CARD_LABEL_CLASSNAME = 'text-[color-mix(in_srgb,var(--theme-accent-strong)_54%,white)]'
const ACTIVE_OVERVIEW_CARD_CAPTION_CLASSNAME = 'text-[color-mix(in_srgb,var(--text-secondary)_62%,white_38%)]'
const OVERVIEW_METRIC_STYLES: Record<string, { line: string; fill: string }> = {
  theme: THEME_OVERVIEW_METRIC_STYLE,
  source: THEME_OVERVIEW_METRIC_STYLE,
  base: THEME_OVERVIEW_METRIC_STYLE,
  business: THEME_OVERVIEW_METRIC_STYLE,
  manage: THEME_OVERVIEW_METRIC_STYLE,
  map: THEME_OVERVIEW_METRIC_STYLE,
  resource: { line: '#17a26f', fill: 'rgba(23,162,111,0.16)' },
  field: { line: '#0f9fcf', fill: 'rgba(15,159,207,0.16)' },
  record: { line: '#5b6cf5', fill: 'rgba(91,108,245,0.18)' },
  demand: { line: '#0f9fcf', fill: 'rgba(15,159,207,0.16)' },
  service: { line: '#17a26f', fill: 'rgba(23,162,111,0.16)' },
  call: { line: '#5b6cf5', fill: 'rgba(91,108,245,0.18)' },
  connectivity: { line: '#12b886', fill: 'rgba(18,184,134,0.18)' },
  problem: { line: '#ef4444', fill: 'rgba(239,68,68,0.14)' },
}

type OverviewTrendPoint = HomeOverviewSnapshot['trendPoints'][number] & {
  sourceCount: number
}

export type OverviewMetricCardItem = {
  key: string
  label: string
  value: number
  unit: string
  delta: number | null
  trend: Array<{ periodCode: string; value: number }>
  chartWidth?: number
  showTrend?: boolean
  valueText?: string
  valueNode?: ReactNode
  asideNode?: ReactNode
  deltaUnit?: string
  deltaText?: ReactNode
  hideDeltaText?: boolean
  deltaPlacement?: 'inline' | 'below-row'
  trendFooterText?: ReactNode
  valueToneClass?: string
  onClick?: () => void
  isActive?: boolean
}

export type PrimaryOverviewCardsData = {
  snapshot: HomeOverviewSnapshot
  metrics: OverviewMetricCardItem[]
  trendPeriodCodes: string[]
  resourceTrends: CurrentOverviewResourceTrend[]
  isLoading: boolean
}

export function formatOverviewMetricValue(value: number, options?: Intl.NumberFormatOptions) {
  return value.toLocaleString('zh-CN', options)
}

export function formatOverviewRecordMetricValue(value: number) {
  return formatOverviewMetricValue(value / 100000000, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatOverviewFieldMetricValue(value: number) {
  return formatOverviewMetricValue(value / 10000, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatOverviewDelta(delta: number | null, unit: string, isLoading: boolean) {
  if (isLoading) return '统计加载中'
  if (delta === null) return '暂无上期对比'
  if (delta === 0) return '较上期持平'
  const prefix = delta > 0 ? '+' : '-'
  const formattedDeltaValue = unit === '万项'
    ? formatOverviewFieldMetricValue(Math.abs(delta))
    : formatOverviewMetricValue(Math.abs(delta))
  return `较上期 ${prefix}${formattedDeltaValue}${unit}`
}

function formatOverviewDeltaText(item: OverviewMetricCardItem, isLoading: boolean): ReactNode {
  if (item.deltaText) return item.deltaText
  if (isLoading) return '统计加载中'
  return formatOverviewDelta(item.delta, item.deltaUnit ?? item.unit, isLoading)
}

function buildOverviewTrendShape(values: number[], width: number, height: number) {
  const chartWidth = Math.max(width, 1)
  const chartHeight = Math.max(height, 1)
  const paddingX = 6
  const paddingY = 8
  if (values.length === 0) {
    const baselineY = chartHeight - 10
    return {
      linePath: `M 0 ${baselineY} L ${chartWidth} ${baselineY}`,
      areaPath: `M 0 ${baselineY} L ${chartWidth} ${baselineY} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`,
      endPoint: { x: chartWidth, y: baselineY },
    }
  }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const plotWidth = Math.max(chartWidth - paddingX * 2, 1)
  const plotHeight = Math.max(chartHeight - paddingY * 2, 1)

  if (values.length === 1) {
    const ratio = maxValue === minValue ? 0.5 : (values[0] - minValue) / (maxValue - minValue)
    const y = paddingY + plotHeight - ratio * plotHeight
    const startX = paddingX
    const endX = paddingX + plotWidth
    const linePath = `M ${startX.toFixed(2)} ${y.toFixed(2)} L ${endX.toFixed(2)} ${y.toFixed(2)}`
    const areaPath = `${linePath} L ${endX.toFixed(2)} ${chartHeight} L ${startX.toFixed(2)} ${chartHeight} Z`

    return {
      linePath,
      areaPath,
      endPoint: { x: endX, y },
    }
  }

  const step = values.length > 1 ? plotWidth / (values.length - 1) : 0

  const points = values.map((value, index) => {
    const ratio = maxValue === minValue ? 0.5 : (value - minValue) / (maxValue - minValue)
    return {
      x: paddingX + step * index,
      y: paddingY + plotHeight - ratio * plotHeight,
    }
  })

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1]?.x.toFixed(2) ?? chartWidth} ${chartHeight} L ${points[0]?.x.toFixed(2) ?? 0} ${chartHeight} Z`
  const endPoint = points[points.length - 1] ?? { x: chartWidth, y: chartHeight - 10 }

  return { linePath, areaPath, endPoint }
}

function formatSnapshotDateTime(value: Date) {
  return value.toISOString().replace('T', ' ').slice(0, 19)
}

function buildStaticOverviewMetrics(trendPoints: OverviewTrendPoint[]): HomeOverviewSnapshot['metrics'] {
  const latestPoint = trendPoints[trendPoints.length - 1]
  const previousPoint = trendPoints.length > 1 ? trendPoints[trendPoints.length - 2] : null

  return [
    {
      key: 'theme',
      label: '业务主题',
      value: latestPoint?.themeCount ?? 0,
      unit: '类',
      delta: previousPoint ? (latestPoint?.themeCount ?? 0) - previousPoint.themeCount : null,
      trend: trendPoints.map((item) => ({ periodCode: item.periodCode, value: item.themeCount })),
    },
    {
      key: 'source',
      label: '数据源',
      value: latestPoint?.sourceCount ?? 0,
      unit: '个',
      delta: previousPoint ? (latestPoint?.sourceCount ?? 0) - previousPoint.sourceCount : null,
      trend: trendPoints.map((item) => ({ periodCode: item.periodCode, value: item.sourceCount })),
    },
    {
      key: 'resource',
      label: '数据资源',
      value: latestPoint?.resourceCount ?? 0,
      unit: '个',
      delta: previousPoint ? (latestPoint?.resourceCount ?? 0) - previousPoint.resourceCount : null,
      trend: trendPoints.map((item) => ({ periodCode: item.periodCode, value: item.resourceCount })),
    },
    {
      key: 'field',
      label: '数据字段',
      value: latestPoint?.fieldCount ?? 0,
      unit: '项',
      delta: previousPoint ? (latestPoint?.fieldCount ?? 0) - previousPoint.fieldCount : null,
      trend: trendPoints.map((item) => ({ periodCode: item.periodCode, value: item.fieldCount })),
    },
    {
      key: 'record',
      label: '数据条数',
      value: latestPoint?.recordCount ?? 0,
      unit: '条',
      delta: previousPoint ? (latestPoint?.recordCount ?? 0) - previousPoint.recordCount : null,
      trend: trendPoints.map((item) => ({ periodCode: item.periodCode, value: item.recordCount })),
    },
  ]
}

function buildStaticOverviewSnapshot(input: {
  catalogItems: CatalogItem[]
  dataResourceItems: CatalogItem[]
  dataSourceCount: number
  recordTrendPoints: CurrentOverviewTrendPoint[]
}): HomeOverviewSnapshot {
  const themeCount = countActiveThemes(input.dataResourceItems)
  const sourceCount = input.dataSourceCount
  const resourceCount = input.dataResourceItems.length
  const fieldCount = input.dataResourceItems.reduce((sum, item) => sum + item.fieldCount, 0)
  const hasData = input.catalogItems.length > 0
  const currentExecutedAt = hasData ? formatSnapshotDateTime(new Date()) : ''
  const trendBase = input.recordTrendPoints.length > 0
    ? input.recordTrendPoints
    : (
      hasData
        ? [
            {
              periodCode: 'current',
              executedAt: currentExecutedAt,
              recordCount: 0,
            },
          ]
        : []
    )

  const trendPoints: OverviewTrendPoint[] = trendBase.map((item) => ({
    periodCode: item.periodCode,
    executedAt: item.executedAt,
    themeCount,
    sourceCount,
    resourceCount,
    fieldCount,
    recordCount: item.recordCount,
  }))

  return {
    latestPeriodCode: trendPoints[trendPoints.length - 1]?.periodCode ?? '',
    latestExecutedAt: trendPoints[trendPoints.length - 1]?.executedAt ?? '',
    trendPoints,
    metrics: buildStaticOverviewMetrics(trendPoints),
  }
}

export function usePrimaryOverviewCardsData(): PrimaryOverviewCardsData {
  const { data, isBootstrapping, isLoading } = usePortalContext()
  const { data: currentOverviewStats, isLoading: isCurrentOverviewLoading } = useCurrentOverviewStats(!isBootstrapping)
  // 数据源数量直接从目录数据计算（portal data），与概览统计中的 resourceTypeId 口径不同
  const dataSourceCount = useMemo(
    () => data.catalogItems.filter((item) => item.serviceTypeId === '32' || item.serviceType === '数据源').length,
    [data.catalogItems],
  )
  const dataResourceItems = useMemo(
    () => data.catalogItems.filter((item) => {
      const resourceTypeId = getCatalogResourceTypeFilterId(item)
      return resourceTypeId === 'data-resource'
    }),
    [data.catalogItems],
  )
  const snapshot = useMemo(
    () => buildStaticOverviewSnapshot({
      catalogItems: data.catalogItems,
      dataResourceItems,
      dataSourceCount,
      recordTrendPoints: currentOverviewStats.trendPoints,
    }),
    [currentOverviewStats.trendPoints, data.catalogItems, dataResourceItems, dataSourceCount],
  )

  const metrics = useMemo<OverviewMetricCardItem[]>(() => {
    const resourceMetric = snapshot.metrics.find((item) => item.key === 'resource')
    const fieldMetric = snapshot.metrics.find((item) => item.key === 'field')
    const recordMetric = snapshot.metrics.find((item) => item.key === 'record')
    const effectiveResourceCount =
      currentOverviewStats.resourceCount > 0 || !currentOverviewStats.isFallback
        ? currentOverviewStats.resourceCount
        : (resourceMetric?.value ?? 0)
    const effectiveFieldCount =
      currentOverviewStats.fieldCount > 0 || !currentOverviewStats.isFallback
        ? currentOverviewStats.fieldCount
        : (fieldMetric?.value ?? 0)
    const effectiveRecordCount =
      currentOverviewStats.recordCount > 0 || !currentOverviewStats.isFallback
        ? currentOverviewStats.recordCount
        : (recordMetric?.value ?? 0)
    const sourceTrend = snapshot.trendPoints.map((item) => ({
      periodCode: item.periodCode,
      value: dataSourceCount,
    }))
    const resourceTrend = snapshot.trendPoints.map((item) => ({
      periodCode: item.periodCode,
      value: effectiveResourceCount,
    }))
    const fieldTrend = snapshot.trendPoints.map((item) => ({
      periodCode: item.periodCode,
      value: effectiveFieldCount,
    }))
    const recordTrend = [
      ...HOME_RECORD_TREND_BASE,
      { periodCode: '2026', value: effectiveRecordCount },
    ]

    return [
      {
        key: 'source',
        label: '数据源',
        value: dataSourceCount,
        unit: '个',
        delta: snapshot.trendPoints.length > 1 ? 0 : null,
        trend: sourceTrend,
      },
      ...snapshot.metrics
        .filter((item) => item.key !== 'source' && item.key !== 'theme'),
    ].map((item) => (
      item.key === 'resource'
        ? {
            ...item,
            value: currentOverviewStats.resourceCount > 0 || !currentOverviewStats.isFallback
              ? currentOverviewStats.resourceCount
              : effectiveResourceCount,
            trend: resourceTrend,
          }
        : item.key === 'field'
          ? {
              ...item,
              value: currentOverviewStats.fieldCount > 0 || !currentOverviewStats.isFallback
                ? currentOverviewStats.fieldCount
                : effectiveFieldCount,
              unit: '万项',
              valueText: formatOverviewFieldMetricValue(effectiveFieldCount),
              trend: fieldTrend,
            }
          : item.key === 'record'
            ? {
                ...item,
                value: effectiveRecordCount,
                unit: '亿条',
                valueText: formatOverviewRecordMetricValue(effectiveRecordCount),
                delta: null,
                deltaText: HOME_RECORD_HISTORY_TEXT,
                deltaPlacement: 'below-row',
                trend: recordTrend,
                trendFooterText: HIDDEN_TREND_FOOTER_PLACEHOLDER,
              }
            : item
    ))
  }, [
    currentOverviewStats.fieldCount,
    currentOverviewStats.isFallback,
    currentOverviewStats.recordCount,
    currentOverviewStats.resourceCount,
    dataSourceCount,
    snapshot,
  ])

  return {
    snapshot,
    metrics,
    trendPeriodCodes: snapshot.trendPoints.map((item) => item.periodCode),
    resourceTrends: currentOverviewStats.resourceTrends,
    isLoading: isLoading || isCurrentOverviewLoading,
  }
}

export function OverviewMetricCardsGrid(props: {
  items: OverviewMetricCardItem[]
  isLoading: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {props.items.map((item) => {
        const baseMetricStyle = OVERVIEW_METRIC_STYLES[item.key] ?? DEFAULT_OVERVIEW_METRIC_STYLE
        const metricStyle = item.isActive ? ACTIVE_OVERVIEW_METRIC_STYLE : baseMetricStyle
        const trendValues = item.trend.map((point) => point.value)
        const chartWidth = item.chartWidth ?? (item.key === 'record' ? RECORD_OVERVIEW_CHART_WIDTH : OVERVIEW_CHART_WIDTH)
        const { linePath, areaPath, endPoint } = buildOverviewTrendShape(trendValues, chartWidth, OVERVIEW_CHART_HEIGHT)
        const deltaText = formatOverviewDeltaText(item, props.isLoading)
        const valueToneClass = item.valueToneClass ?? (
          item.isActive
            ? 'text-[color-mix(in_srgb,var(--theme-accent-strong)_68%,white)]'
            : 'text-[var(--theme-accent-strong)]'
        )
        const valueText = item.valueText ?? formatOverviewMetricValue(item.value)
        const trendFooterText = item.trendFooterText === undefined
          ? `最近 ${Math.max(item.trend.length, 1)} 次统计`
          : item.trendFooterText
        const trendStrokeWidth = item.isActive ? 3 : 2.5
        const trendDotRadius = item.isActive ? 4 : 3.5
        const trendFooterToneClass = item.isActive ? ACTIVE_OVERVIEW_CARD_CAPTION_CLASSNAME : 'text-[var(--text-muted)]'
        const labelToneClass = item.isActive ? ACTIVE_OVERVIEW_CARD_LABEL_CLASSNAME : 'text-[var(--text-secondary)]'
        const neutralDeltaToneClass = item.isActive ? ACTIVE_OVERVIEW_CARD_CAPTION_CLASSNAME : 'text-[var(--text-secondary)]'
        const deltaPlacement = item.deltaPlacement ?? 'inline'
        const deltaToneClass = item.delta !== null && item.delta > 0
          ? 'text-emerald-600'
          : item.delta !== null && item.delta < 0
            ? 'text-rose-500'
            : neutralDeltaToneClass
        const inlineAsideNode = item.showTrend === false ? null : (item.asideNode ?? (
          <>
            <svg width={chartWidth} height={OVERVIEW_CHART_HEIGHT} viewBox={`0 0 ${chartWidth} ${OVERVIEW_CHART_HEIGHT}`} className="block overflow-visible">
              <path d={areaPath} fill={metricStyle.fill} />
              <path d={linePath} fill="none" stroke={metricStyle.line} strokeWidth={trendStrokeWidth} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={endPoint.x} cy={endPoint.y} r={trendDotRadius} fill={metricStyle.line} />
            </svg>
            {trendFooterText == null ? null : (
              <div className={`mt-1 whitespace-nowrap text-left text-[0.6875rem] ${trendFooterToneClass}`}>{trendFooterText}</div>
            )}
          </>
        ))
        const overlayAsideNode = item.showTrend === false ? item.asideNode ?? null : null
        const valueNode = item.valueNode ?? (
          <>
            <span className={`text-[2.5rem] font-semibold leading-none ${item.key === 'problem' ? 'text-red-500' : valueToneClass}`}>{valueText}</span>
            {item.unit ? <span className="pb-1 text-[0.8125rem] text-[var(--text-secondary)]">{item.unit}</span> : null}
          </>
        )

        return (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            disabled={!item.onClick}
            aria-pressed={item.onClick ? item.isActive : undefined}
            className={`group relative overflow-hidden rounded-[12px] border bg-[linear-gradient(180deg,var(--card-bg-start),var(--card-bg-end))] px-5 py-5 text-left shadow-[var(--shadow-soft)] backdrop-blur-xl transition ${
              item.onClick
                ? 'cursor-pointer hover:-translate-y-[2px] hover:border-[rgba(var(--theme-soft-rgb),0.22)] hover:shadow-[var(--shadow-medium)]'
                : 'cursor-default'
            } ${
              item.isActive
                ? ACTIVE_OVERVIEW_CARD_CLASSNAME
                : 'border-[var(--line)]'
            }`}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.20),transparent)]" />
            {item.isActive ? (
              <>
                <div className={`pointer-events-none absolute inset-0 ${ACTIVE_OVERVIEW_CARD_TINT_CLASSNAME}`} />
                <div className="pointer-events-none absolute inset-x-5 top-0 h-[2px] bg-[linear-gradient(90deg,transparent,rgba(var(--theme-soft-rgb),0.95),transparent)]" />
              </>
            ) : null}
            <div className={`pointer-events-none absolute right-[-24px] top-[-24px] h-24 w-24 rounded-full transition ${
              item.isActive
                ? 'scale-110 bg-[radial-gradient(circle,rgba(var(--theme-soft-rgb),0.28),transparent_70%)]'
                : 'bg-[radial-gradient(circle,rgba(var(--theme-soft-rgb),0.16),transparent_70%)] group-hover:scale-110'
            }`} />
            {overlayAsideNode ? (
              <div className="pointer-events-none absolute -right-7 top-1/2 hidden -translate-y-1/2 opacity-90 md:block">
                {overlayAsideNode}
              </div>
            ) : null}
            <div className={`relative z-[1] text-[0.8125rem] ${labelToneClass}`}>{item.label}</div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div className={`relative z-[1] min-w-0 ${item.hideDeltaText ? '-translate-y-[30px]' : ''}`}>
                <div className={`flex items-end gap-1 text-[1rem] font-medium text-[var(--text-main)] ${item.key === 'record' ? '-translate-y-[5px]' : ''}`}>
                  {valueNode}
                </div>
                {item.hideDeltaText || deltaPlacement === 'below-row' ? null : (
                  <div className={`mt-2 text-[0.75rem] ${deltaToneClass}`}>
                    {deltaText}
                  </div>
                )}
              </div>
              {inlineAsideNode ? <div className="hidden shrink-0 md:block">{inlineAsideNode}</div> : null}
            </div>
            {item.hideDeltaText || deltaPlacement !== 'below-row' ? null : (
              <div className={`relative z-[1] mt-[10px] ${deltaToneClass}`}>
                {deltaText}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function PrimaryOverviewCards({ data }: { data: PrimaryOverviewCardsData }) {
  return (
    <OverviewMetricCardsGrid
      items={data.metrics}
      isLoading={data.isLoading && data.snapshot.latestExecutedAt.length === 0}
    />
  )
}
