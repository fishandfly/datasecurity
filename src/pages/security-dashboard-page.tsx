import {
  Activity,
  AlertCircle,
  Bell,
  CheckCircle2,
  Cpu,
  DatabaseZap,
  Gauge,
  LockKeyhole,
  Radar,
  RadioTower,
  RefreshCw,
  Search,
  ServerCog,
  ShieldAlert,
  SlidersHorizontal,
  Zap,
  Workflow,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { EMPTY_SECURITY_DASHBOARD_V3_DATA, loadSecurityDashboardV3Data, type SecurityDashboardCoreMetric } from '../lib/security-dashboard-v3-data'
import { type SecurityDashboardDistributionItem, type SecurityDashboardMetrics, type SecurityDashboardModuleSummary, type SecurityDashboardRealtimeItem, type SecurityDashboardSourceTrendPoint, type SecurityDashboardSourceTrendSeries } from '../lib/security-dashboard-data'
import { toErrorMessage } from '../lib/nocobase-client'
import { cn } from '../lib/utils'

function formatCount(value: number) {
  return value.toLocaleString('zh-CN')
}

function buildPolyline(values: number[], width = 168, height = 48) {
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 1)
  return values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width
      const y = height - ((value - min) / range) * (height - 6) - 3
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function MiniLine({ values, color = 'var(--primary)' }: { values: number[]; color?: string }) {
  const points = buildPolyline(values)
  const areaPoints = points ? `0,48 ${points} 168,48` : ''
  return (
    <svg viewBox="0 0 168 48" className="h-12 w-full overflow-visible" aria-hidden="true">
      <polygon points={areaPoints} fill={color} opacity="0.12" />
      <polyline
        className="security-dashboard-line-draw"
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SectionPanel({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('security-dashboard-panel relative overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-soft)]', className)}>
      <div className="relative z-[1] mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1rem] font-semibold text-[var(--text-main)]">{title}</h2>
        {action}
      </div>
      <div className="relative z-[1]">{children}</div>
    </section>
  )
}

function MetricCard({
  title,
  value,
  helper,
  icon,
  values,
  tone = 'blue',
}: {
  title: string
  value: string
  helper: string
  icon: React.ReactNode
  values: number[]
  tone?: 'blue' | 'green' | 'amber' | 'red'
}) {
  const toneClass = {
    blue: 'border-[#3b82f6]/25 bg-[#3b82f6]/10 text-[#3b82f6]',
    green: 'border-[#10b981]/25 bg-[#10b981]/10 text-[#10b981]',
    amber: 'border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#d97706]',
    red: 'border-[#ef4444]/30 bg-[#ef4444]/10 text-[#ef4444]',
  }[tone]

  const lineColor = {
    blue: '#3b82f6',
    green: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
  }[tone]

  return (
    <div className="security-dashboard-metric-card relative overflow-hidden rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4">
      <div className="security-dashboard-card-scan" />
      <div className="relative z-[1] flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
          <div className="mt-2 text-[1.6rem] font-semibold leading-none text-[var(--text-main)]">{value}</div>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-[8px] border', toneClass)}>
          {icon}
        </div>
      </div>
      <div className="relative z-[1] mt-3">
        <MiniLine values={values} color={lineColor} />
      </div>
      <div className="relative z-[1] mt-3 text-[0.75rem] text-[var(--text-secondary)]">{helper}</div>
    </div>
  )
}

function toneClasses(tone: 'blue' | 'green' | 'amber' | 'red') {
  return {
    blue: 'border-[#3b82f6]/25 bg-[#3b82f6]/10 text-[#2563eb]',
    green: 'border-[#10b981]/25 bg-[#10b981]/10 text-[#059669]',
    amber: 'border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#d97706]',
    red: 'border-[#ef4444]/30 bg-[#ef4444]/10 text-[#dc2626]',
  }[tone]
}

function sourceStatusToneClass(status: string) {
  if (status.includes('未') || status.includes('异常') || status.includes('失败')) return 'text-[#ef4444]'
  if (status.includes('延迟') || status.includes('待') || status.includes('处理中')) return 'text-[#d97706]'
  return 'text-[#10b981]'
}

function ModuleSummaryCard({ item, withEmbed }: { item: SecurityDashboardModuleSummary; withEmbed: (path: string) => string }) {
  const icon = {
    'data-access': <DatabaseZap className="h-5 w-5" />,
    'resource-control': <Workflow className="h-5 w-5" />,
    'access-control': <ShieldAlert className="h-5 w-5" />,
    'risk-events': <Bell className="h-5 w-5" />,
    'homomorphic-encryption': <LockKeyhole className="h-5 w-5" />,
  }[item.id]

  return (
    <Link
      to={withEmbed(item.path)}
      className="security-dashboard-module-card group relative overflow-hidden rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 transition hover:-translate-y-[1px] hover:border-[rgba(var(--theme-soft-rgb),0.34)] hover:shadow-[var(--shadow-medium)]"
    >
      <div className="security-dashboard-card-scan" />
      <div className="relative z-[1] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.8125rem] font-semibold text-[var(--text-main)]">{item.title}</div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-[1.75rem] font-semibold leading-none text-[var(--text-main)]">{item.value}</span>
            <span className="pb-1 text-[0.75rem] text-[var(--text-muted)]">{item.unit}</span>
          </div>
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border', toneClasses(item.tone))}>{icon}</div>
      </div>
      <div className="relative z-[1] mt-3 flex flex-wrap gap-2">
        <span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem] font-medium', toneClasses(item.tone))}>{item.status}</span>
      </div>
      <div className="relative z-[1] mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{item.helper}</div>
      <div className="relative z-[1] mt-3 grid gap-2 text-[0.75rem] text-[var(--text-muted)] sm:grid-cols-2">
        <span className="rounded-[6px] bg-[var(--surface-raised)] px-2.5 py-2">{item.primaryMetric}</span>
        <span className="rounded-[6px] bg-[var(--surface-raised)] px-2.5 py-2">{item.secondaryMetric}</span>
      </div>
    </Link>
  )
}

function RealtimeStatusCard({ item }: { item: SecurityDashboardRealtimeItem }) {
  return (
    <div className="relative overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
      <span className="security-dashboard-status-beam" />
      <div className="flex items-center justify-between gap-3">
        <div className="text-[0.75rem] text-[var(--text-muted)]">{item.label}</div>
        <span className={cn('security-dashboard-live-dot h-2.5 w-2.5 rounded-full border', toneClasses(item.tone))} />
      </div>
      <div className="mt-2 text-[1.45rem] font-semibold leading-none text-[var(--text-main)]">{item.value}</div>
      <div className="mt-3 text-[0.75rem] leading-5 text-[var(--text-secondary)]">{item.detail}</div>
    </div>
  )
}

function OperationsRadar({ metrics }: { metrics: SecurityDashboardMetrics }) {
  const nodes = [
    { label: '接入', value: `${formatCount(metrics.sourceCount)}`, icon: <DatabaseZap className="h-4 w-4" />, className: 'left-[6%] top-[14%]' },
    { label: '资源', value: `${formatCount(metrics.resourceCount)}`, icon: <ServerCog className="h-4 w-4" />, className: 'right-[5%] top-[18%]' },
    { label: '策略', value: `${formatCount(metrics.activePolicies)}`, icon: <ShieldAlert className="h-4 w-4" />, className: 'bottom-[14%] left-[9%]' },
    { label: '同态', value: `${metrics.homomorphicCompletedCount}/${metrics.homomorphicTaskCount}`, icon: <LockKeyhole className="h-4 w-4" />, className: 'bottom-[10%] right-[8%]' },
  ]

  return (
    <div className="security-dashboard-radar relative min-h-[320px] overflow-hidden rounded-[8px] border border-[rgba(var(--theme-soft-rgb),0.22)] bg-[linear-gradient(140deg,rgba(var(--theme-soft-rgb),0.10),rgba(var(--theme-support-rgb),0.08),var(--surface-raised))]">
      <div className="security-dashboard-radar-grid" />
      <div className="security-dashboard-radar-sweep" />
      <div className="security-dashboard-data-stream security-dashboard-data-stream-a" />
      <div className="security-dashboard-data-stream security-dashboard-data-stream-b" />
      <div className="absolute left-1/2 top-1/2 z-[1] flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-[rgba(var(--theme-soft-rgb),0.34)] bg-[color-mix(in_srgb,var(--surface-raised-strong)_72%,transparent)] shadow-[0_0_44px_rgba(var(--theme-soft-rgb),0.16)]">
        <Radar className="h-6 w-6 text-[var(--primary)]" />
        <div className="mt-2 text-[2.35rem] font-semibold leading-none text-[var(--text-main)]">{metrics.overallScore}</div>
        <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">态势评分</div>
      </div>
      {nodes.map((node, index) => (
        <div
          key={node.label}
          className={cn('security-dashboard-radar-node absolute z-[2] flex min-w-28 items-center gap-2 rounded-[8px] border border-[rgba(var(--theme-soft-rgb),0.24)] bg-[color-mix(in_srgb,var(--surface-raised-strong)_82%,transparent)] px-3 py-2 shadow-[var(--shadow-soft)]', node.className)}
          style={{ animationDelay: `${index * 180}ms` }}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]">{node.icon}</span>
          <span className="min-w-0">
            <span className="block text-[0.72rem] text-[var(--text-muted)]">{node.label}</span>
            <span className="block text-[0.95rem] font-semibold leading-5 text-[var(--text-main)]">{node.value}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function CapabilityStrip({ metrics }: { metrics: SecurityDashboardMetrics }) {
  const strips = [
    { label: '分类分级', value: metrics.classificationCoverage, color: '#3b82f6' },
    { label: '接入完整性', value: metrics.integrityPassRate, color: '#14b8a6' },
    { label: '策略启用', value: metrics.enabledPolicyRatio, color: '#f59e0b' },
    { label: '脱敏覆盖', value: metrics.desensitizationCoverage, color: '#10b981' },
  ]

  return (
    <div className="grid gap-2">
      {strips.map((item) => (
        <div key={item.label} className="rounded-[7px] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-muted)_82%,transparent)] px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-[0.75rem]">
            <span className="text-[var(--text-secondary)]">{item.label}</span>
            <span className="font-semibold text-[var(--text-main)]">{item.value}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--table-track)]">
            <div className="security-dashboard-capability-bar h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, item.value))}%`, backgroundColor: item.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function DonutChart({ items }: { items: SecurityDashboardDistributionItem[] }) {
  let offset = 25
  const radius = 42
  const circumference = 2 * Math.PI * radius

  if (items.length === 0) {
    return (
      <div className="rounded-[8px] border border-dashed border-[var(--line)] bg-[var(--surface-muted)] px-4 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]">
        后台暂无可用于异常分布的安全事件数据。
      </div>
    )
  }

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 112 112" className="h-32 w-32 shrink-0 -rotate-90" aria-label="异常类型分布">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--surface-muted)" strokeWidth="14" />
        {items.map((item) => {
          const dash = (item.value / 100) * circumference
          const segment = (
            <circle
              key={item.label}
              cx="56"
              cy="56"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          )
          offset += dash
          return segment
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-[0.8125rem]">
            <span className="flex items-center gap-2 text-[var(--text-secondary)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
            <span className="font-medium text-[var(--text-main)]">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GaugeMeter({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'green' }) {
  const color = tone === 'blue' ? '#3b82f6' : '#10b981'
  const dash = Math.max(0, Math.min(value, 100)) * 1.26
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
      <div className="flex items-center justify-between text-[0.8125rem]">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-semibold text-[var(--text-main)]">{value}%</span>
      </div>
      <svg viewBox="0 0 140 78" className="mt-2 h-20 w-full" aria-hidden="true">
        <path d="M18 68a52 52 0 0 1 104 0" fill="none" stroke="var(--line)" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M18 68a52 52 0 0 1 104 0"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} 126`}
        />
        <circle cx="70" cy="68" r="4" fill={color} />
      </svg>
    </div>
  )
}

function SourceTrendChart({
  series,
  points,
}: {
  series: SecurityDashboardSourceTrendSeries[]
  points: SecurityDashboardSourceTrendPoint[]
}) {
  const maxValue = Math.max(...points.flatMap((point) => Object.values(point.values)), 1)
  const width = 620
  const startX = 44
  const step = points.length <= 1 ? 0 : (width - 64) / (points.length - 1)
  return (
    <div>
      <svg viewBox="0 0 620 220" className="h-[220px] w-full" role="img" aria-label="数据源接入量趋势">
        <defs>
          <linearGradient id="source-trend-surface" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(24,128,255,0.14)" />
            <stop offset="100%" stopColor="rgba(24,128,255,0)" />
          </linearGradient>
        </defs>
        <rect x="40" y="24" width="560" height="166" rx="8" fill="url(#source-trend-surface)" />
        {[0, 1, 2, 3].map((line) => (
          <line key={line} x1="40" x2="600" y1={32 + line * 44} y2={32 + line * 44} stroke="var(--line)" strokeDasharray="4 6" />
        ))}
        {series.map((item) => (
          <polyline
            key={item.key}
            className="security-dashboard-line-draw"
            points={points
              .map((point, index) => {
                const value = point.values[item.key] ?? 0
                const x = startX + index * step
                const y = 190 - (value / maxValue) * 150
                return `${x},${y}`
              })
              .join(' ')}
            fill="none"
            stroke={item.color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {series.map((item) =>
          points.map((point, index) => {
            const value = point.values[item.key] ?? 0
            const x = points.length <= 1 ? 320 : startX + index * step
            const y = 190 - (value / maxValue) * 150
            return (
              <g key={`${item.key}-${point.label}`}>
                <circle cx={x} cy={y} r="5" fill={item.color} opacity="0.18" />
                <circle className="security-dashboard-live-dot" cx={x} cy={y} r="2.7" fill={item.color} />
              </g>
            )
          }),
        )}
        {points.map((point, index) => (
          <text key={point.label} x={points.length <= 1 ? 320 : startX + index * step} y="212" textAnchor="middle" className="fill-[var(--text-muted)] text-[11px]">
            {point.label}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-3">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function PerformanceBars({ values }: { values: number[] }) {
  const displayValues = values.length > 0 ? values : [0]
  return (
    <div className="flex h-28 items-end gap-2 border-b border-[var(--line)] px-1">
      {displayValues.map((value, index) => (
        <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="security-dashboard-performance-bar w-full rounded-t-[4px] bg-[linear-gradient(180deg,#67ceff,#1880ff)]"
            style={{ height: `${value}%` }}
            title={`${value}%`}
          />
        </div>
      ))}
    </div>
  )
}

function SecurityDataFlow({ metrics, coreMetrics }: { metrics: SecurityDashboardMetrics; coreMetrics: SecurityDashboardCoreMetric[] }) {
  const metricValue = (key: SecurityDashboardCoreMetric['key']) => coreMetrics.find((item) => item.key === key)?.value ?? 0
  const groups = [
    { id: 'source', x: 20, width: 220, title: '中台数据源', value: `${metrics.sourceCount} 个来源`, tone: 'cyan' },
    { id: 'validation', x: 260, width: 260, title: '接入校验', value: `完整性 ${metrics.integrityPassRate}%`, tone: 'blue' },
    { id: 'control', x: 540, width: 260, title: '数据管控', value: `${metrics.resourceCount} 项资源`, tone: 'green' },
    { id: 'access', x: 820, width: 280, title: '访问控制', value: `${metrics.activePolicies} 条启用策略`, tone: 'amber' },
    { id: 'subject', x: 1120, width: 340, title: '访问主体', value: '典型访问对象', tone: 'violet' },
  ] as const
  const subNodes = [
    { x: 40, y: 170, width: 180, height: 64, title: '量测数据', value: '中台统一供给', tone: 'cyan' },
    { x: 295, y: 80, width: 190, height: 64, title: '安全传输', value: '运行正常', tone: 'blue' },
    { x: 295, y: 180, width: 190, height: 64, title: '完整性校验', value: `${metrics.integrityPassRate}%`, tone: 'blue' },
    { x: 295, y: 280, width: 190, height: 64, title: '数据采样', value: '运行正常', tone: 'blue' },
    { x: 575, y: 80, width: 190, height: 64, title: '分类分级', value: `覆盖 ${metrics.classificationCoverage}%`, tone: 'green' },
    { x: 575, y: 180, width: 190, height: 64, title: '数据档案', value: `${metrics.resourceCount} 项资源`, tone: 'green' },
    { x: 575, y: 280, width: 190, height: 64, title: '安全策略', value: `${metrics.activePolicies} 条关联`, tone: 'amber' },
    { x: 865, y: 80, width: 190, height: 64, title: '同态加密', value: `${metrics.homomorphicTaskCount} 个任务`, tone: 'violet' },
    { x: 865, y: 180, width: 190, height: 64, title: '访问策略', value: `${metrics.activePolicies} 条启用`, tone: 'amber' },
    { x: 865, y: 280, width: 190, height: 64, title: '风险事件', value: `${metricValue('risks')} 项事件`, tone: 'red' },
    { x: 1195, y: 70, width: 190, height: 52, title: '跨域访问应用', value: '密态计算场景', tone: 'violet' },
    { x: 1195, y: 150, width: 190, height: 52, title: '网上电网', value: '内部应用', tone: 'violet' },
    { x: 1195, y: 230, width: 190, height: 52, title: '数智吉电', value: '内部应用', tone: 'violet' },
    { x: 1195, y: 310, width: 190, height: 52, title: '其他业务应用', value: '51 套应用场景', tone: 'violet' },
  ] as const
  const paths = [
    { id: 'flow-source-transport', d: 'M220 202 C255 202 260 112 295 112', delay: '0s' },
    { id: 'flow-transport-integrity', d: 'M390 144 V180', delay: '-0.25s' },
    { id: 'flow-integrity-sampling', d: 'M390 244 V280', delay: '-0.5s' },
    { id: 'flow-sampling-classification', d: 'M485 312 C530 312 530 112 575 112', delay: '-0.75s' },
    { id: 'flow-classification-archive', d: 'M670 144 V180', delay: '-1s' },
    { id: 'flow-archive-policy', d: 'M670 244 V280', delay: '-1.25s' },
    { id: 'flow-archive-homomorphic', d: 'M765 212 C815 212 815 112 865 112', delay: '-1.5s' },
    { id: 'flow-policy-access', d: 'M765 312 C815 312 815 212 865 212', delay: '-1.65s' },
    { id: 'flow-homomorphic-access', d: 'M960 144 V180', delay: '-1.75s' },
    { id: 'flow-access-risk', d: 'M960 244 V280', delay: '-2s' },
    { id: 'flow-homomorphic-cross-domain', d: 'M1055 112 C1115 112 1130 96 1195 96', delay: '-2.25s' },
    { id: 'flow-access-online-grid', d: 'M1055 212 C1115 212 1130 176 1195 176', delay: '-2.5s' },
    { id: 'flow-access-digital-jilin', d: 'M1055 212 C1115 212 1130 256 1195 256', delay: '-2.75s' },
    { id: 'flow-access-business-apps', d: 'M1055 212 C1125 212 1120 336 1195 336', delay: '-3s' },
  ]

  return (
    <section className="security-data-flow relative overflow-hidden border-y border-[rgba(var(--theme-soft-rgb),0.24)] bg-[color-mix(in_srgb,var(--surface-raised)_90%,transparent)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-3">
          <span className="security-dashboard-live-dot h-2.5 w-2.5 rounded-full bg-[#22d3ee]" />
          <h2 className="text-[0.875rem] font-semibold text-[var(--text-main)]">数据安全运行链路</h2>
        </div>
        <span className="text-[0.75rem] text-[var(--text-muted)]">实时数据流向</span>
      </div>
      <div className="overflow-x-auto px-3 pb-3 pt-1">
        <svg viewBox="0 0 1480 420" className="mx-auto block h-auto min-w-[1280px] w-full" role="img" aria-label="中台量测数据经过接入校验、数据管控和访问控制后，为网上电网、数智吉电、其他业务应用和跨域访问应用提供安全数据支撑">
          <defs>
            <pattern id="security-flow-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" fill="none" stroke="rgba(98,166,255,0.08)" strokeWidth="1" />
            </pattern>
            <filter id="security-flow-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <marker id="security-flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0 0L8 4L0 8Z" fill="var(--primary)" />
            </marker>
          </defs>
          <rect width="1480" height="420" fill="url(#security-flow-grid)" />

          {groups.map((group) => (
            <g key={group.id} className={`security-flow-group security-flow-group-${group.tone}`}>
              <rect x={group.x} y="25" width={group.width} height="370" rx="8" className="security-flow-group-shell" />
              <text x={group.x + 20} y="55" className="security-flow-group-title">{group.title}</text>
              <text x={group.x + group.width - 20} y="55" textAnchor="end" className="security-flow-group-value">{group.value}</text>
            </g>
          ))}

          {paths.map((path) => (
            <g key={path.id}>
              <path className="security-flow-track" d={path.d} />
              <path id={path.id} className="security-flow-line" d={path.d} markerEnd="url(#security-flow-arrow)" />
              <circle className="security-flow-particle" r="4" filter="url(#security-flow-glow)">
                <animateMotion dur="2.8s" begin={path.delay} repeatCount="indefinite">
                  <mpath href={`#${path.id}`} />
                </animateMotion>
              </circle>
            </g>
          ))}

          {subNodes.map((node, index) => (
            <g key={node.title} className={`security-flow-node security-flow-subnode security-flow-node-${node.tone}`} style={{ animationDelay: `${120 + index * 60}ms` }}>
              <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="6" className="security-flow-subnode-shell" />
              <circle cx={node.x + 18} cy={node.y + 20} r="4" className="security-flow-node-status" />
              <text x={node.x + 30} y={node.y + 25} className="security-flow-subnode-title">{node.title}</text>
              <text x={node.x + 16} y={node.y + 46} className="security-flow-node-value">{node.value}</text>
            </g>
          ))}

        </svg>
      </div>
    </section>
  )
}

export function SecurityDashboardPage() {
  const location = useLocation()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const [dashboardData, setDashboardData] = useState(EMPTY_SECURITY_DASHBOARD_V3_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setDashboardData(await loadSecurityDashboardV3Data())
    } catch (currentError) {
      setError(toErrorMessage(currentError, '安全态势数据读取失败'))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const { metrics, moduleSummaries, realtimeItems, events, abnormalTypes, topActors, sourceTrend, sourceHealth } = dashboardData

  const coreMetricIcons: Record<SecurityDashboardCoreMetric['key'], React.ReactNode> = {
    resources: <Workflow className="h-5 w-5" />, apis: <DatabaseZap className="h-5 w-5" />, policies: <SlidersHorizontal className="h-5 w-5" />,
    requests: <Activity className="h-5 w-5" />, rejects: <ShieldAlert className="h-5 w-5" />, risks: <Bell className="h-5 w-5" />, tasks: <LockKeyhole className="h-5 w-5" />,
  }

  return (
    <div className="space-y-5">
      <SecurityDataFlow metrics={metrics} coreMetrics={dashboardData.coreMetrics} />
      {loading ? (
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">
          正在汇聚安全态势指标...
        </div>
      ) : null}
      {error ? <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-3 text-[0.875rem] text-[var(--status-danger-text)]">{error}</div> : null}

      <section className="security-dashboard-hero relative overflow-hidden rounded-[8px] border border-[rgba(var(--theme-soft-rgb),0.24)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] p-5 shadow-[var(--shadow-elevated)]">
        <div className="security-dashboard-hero-grid" />
        <div className="relative z-[1] grid gap-5 2xl:grid-cols-[minmax(360px,0.92fr)_minmax(0,1.08fr)]">
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(var(--theme-soft-rgb),0.24)] bg-[rgba(var(--theme-soft-rgb),0.08)] px-3 py-1.5 text-[0.75rem] font-medium text-[var(--primary)]">
                  <RadioTower className="h-4 w-4" />
                  实时安全运行中心
                </div>
                <h1 className="mt-3 text-[1.55rem] font-semibold leading-tight text-[var(--text-main)]">安全态势看板</h1>
                <div className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">聚合数据接入、资源管控、访问控制与同态加密的核心运行指标。</div>
              </div>
              <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-raised)_82%,transparent)] px-3 py-2 text-[0.75rem] text-[var(--text-secondary)]">
                <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
                真实数据已汇聚
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </button>
            </div>

            <OperationsRadar metrics={metrics} />
          </div>

          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-[8px] border border-[rgba(var(--theme-soft-rgb),0.20)] bg-[color-mix(in_srgb,var(--surface-raised)_88%,transparent)] p-4">
                <div className="flex items-center gap-2 text-[0.8125rem] font-medium text-[var(--text-secondary)]">
                  <Gauge className="h-4 w-4 text-[var(--primary)]" />
                  整体综合情况
                </div>
                <div className="mt-4 flex items-end gap-3">
                  <span className="text-[3.25rem] font-semibold leading-none text-[var(--text-main)]">{metrics.overallScore}</span>
                  <span className="pb-2 text-[0.875rem] text-[var(--text-muted)]">/ 100</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                  <Zap className="h-4 w-4 text-[#f59e0b]" />
                  告警 {formatCount(metrics.alerts)} 项，队列 {formatCount(metrics.queueSize)} 项
                </div>
              </div>
              <CapabilityStrip metrics={metrics} />
            </div>

            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
              {moduleSummaries.map((item) => (
                <ModuleSummaryCard key={item.id} item={item} withEmbed={withEmbed} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <SectionPanel title="实时运行情况">
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
          {realtimeItems.map((item) => (
            <RealtimeStatusCard key={item.label} item={item} />
          ))}
        </div>
      </SectionPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {dashboardData.coreMetrics.map((item) => (
          <Link key={item.key} to={withEmbed(item.path)}>
            <MetricCard title={item.label} value={formatCount(item.value)} helper={item.helper} values={item.trend} icon={coreMetricIcons[item.key]} tone={item.tone} />
          </Link>
        ))}
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
        <SectionPanel
          className="scroll-mt-6"
          title="实时安全事件流"
          action={
            <div className="flex items-center gap-2">
              <button className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-[var(--line)] px-3 text-[0.8125rem] text-[var(--text-secondary)]">
                <Search className="h-4 w-4" />
                事件类型
              </button>
              <button className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-[var(--line)] px-3 text-[0.8125rem] text-[var(--text-secondary)]">
                <AlertCircle className="h-4 w-4" />
                风险等级
              </button>
            </div>
          }
        >
          <span id="event-stream" className="block -translate-y-6" />
          <div className="space-y-2">
            {events.map((event) => (
              <div key={`${event.time}-${event.description}`} className="security-dashboard-event-row grid gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-3 lg:grid-cols-[88px_128px_minmax(0,1fr)_112px_80px] lg:items-center">
                <div className="text-[0.8125rem] font-medium text-[var(--text-main)]">{event.time}</div>
                <div className="flex items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)]">
                  <Bell className="h-4 w-4 text-[var(--primary)]" />
                  {event.type}
                </div>
                <div className="min-w-0 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{event.description}</div>
                <div className="text-[0.8125rem] text-[var(--text-muted)]">{event.user}</div>
                <span
                  className={cn(
                    'w-fit rounded-full px-2.5 py-1 text-[0.75rem] font-medium',
                    event.risk === '高'
                      ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
                      : event.risk === '中'
                        ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
                        : 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
                  )}
                >
                  {event.risk}风险
                </span>
              </div>
            ))}
            {events.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-[var(--line)] bg-[var(--surface-muted)] px-4 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]">
                后台暂无可用于安全事件流的安全档案或目录资源数据。
              </div>
            ) : null}
          </div>
          <Link to={withEmbed('/security-governance/access/audit')} className="mt-4 inline-flex text-[0.8125rem] font-medium text-[var(--primary)]">
            查看全部日志
          </Link>
        </SectionPanel>

        <SectionPanel title="访问异常分析" className="scroll-mt-6">
          <span id="access-risk" className="block -translate-y-6" />
          <DonutChart items={abnormalTypes} />
          <div className="mt-5 overflow-hidden rounded-[8px] border border-[var(--line)]">
            <div className="hidden grid-cols-[minmax(0,1fr)_88px_82px_78px] bg-[var(--surface-muted)] px-3 py-2 text-[0.75rem] text-[var(--text-muted)] md:grid">
              <span>用户 / 部门</span>
              <span>异常次数</span>
              <span>最后异常</span>
              <span>状态</span>
            </div>
            {topActors.map((item) => (
              <div key={`${item.user}-${item.dept}`} className="grid gap-2 border-t border-[var(--line)] px-3 py-3 text-[0.8125rem] md:grid-cols-[minmax(0,1fr)_88px_82px_78px] md:items-center md:py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[var(--text-main)]">{item.user}</span>
                  <span className="block truncate text-[0.75rem] text-[var(--text-muted)]">{item.dept}</span>
                </span>
                <span className="flex items-center justify-between gap-3 text-[var(--text-secondary)] md:block">
                  <span className="text-[var(--text-muted)] md:hidden">异常次数</span>
                  {item.count}
                </span>
                <span className="flex items-center justify-between gap-3 text-[var(--text-secondary)] md:block">
                  <span className="text-[var(--text-muted)] md:hidden">最后异常</span>
                  {item.lastSeen}
                </span>
                <span className="flex items-center justify-between gap-3 text-[var(--primary)] md:block">
                  <span className="text-[var(--text-muted)] md:hidden">状态</span>
                  {item.status}
                </span>
              </div>
            ))}
            {topActors.length === 0 ? (
              <div className="border-t border-[var(--line)] px-3 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]">
                暂无责任人异常统计。
              </div>
            ) : null}
          </div>
        </SectionPanel>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)]">
        <SectionPanel title="数据源接入状态" className="scroll-mt-6">
          <span id="source-status" className="block -translate-y-6" />
          <SourceTrendChart series={sourceTrend.series} points={sourceTrend.points} />
          <div className="mt-5 overflow-hidden rounded-[8px] border border-[var(--line)]">
            <div className="hidden grid-cols-[minmax(0,1fr)_110px_120px_132px_88px] bg-[var(--surface-muted)] px-3 py-2 text-[0.75rem] text-[var(--text-muted)] lg:grid">
              <span>数据源名称</span>
              <span>当前状态</span>
              <span>接入成功率</span>
              <span>最后接入时间</span>
              <span>操作</span>
            </div>
            {sourceHealth.map((source) => (
              <div key={source.name} className="grid gap-2 border-t border-[var(--line)] px-3 py-3 text-[0.8125rem] lg:grid-cols-[minmax(0,1fr)_110px_120px_132px_88px] lg:items-center">
                <span className="font-medium text-[var(--text-main)]">{source.name}</span>
                <span className={cn('flex items-center justify-between gap-3 lg:block', sourceStatusToneClass(source.status))}>
                  <span className="text-[var(--text-muted)] lg:hidden">当前状态</span>
                  {source.status}
                </span>
                <span className="flex items-center justify-between gap-3 text-[var(--text-secondary)] lg:block">
                  <span className="text-[var(--text-muted)] lg:hidden">接入成功率</span>
                  {source.rate}
                </span>
                <span className="flex items-center justify-between gap-3 text-[var(--text-secondary)] lg:block">
                  <span className="text-[var(--text-muted)] lg:hidden">最后接入</span>
                  {source.time}
                </span>
                <Link to={withEmbed('/security-governance/ingest/sources')} className="text-left text-[var(--primary)]">{source.action}</Link>
              </div>
            ))}
            {sourceHealth.length === 0 ? (
              <div className="border-t border-[var(--line)] px-3 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]">
                暂无可从后台派生的数据源接入状态。
              </div>
            ) : null}
          </div>
        </SectionPanel>

        <SectionPanel title="访问策略运行" className="scroll-mt-6">
          <span id="policy-engine" className="block -translate-y-6" />
          <div className="grid gap-3 sm:grid-cols-2">
            <GaugeMeter label="策略启用率" value={metrics.enabledPolicyRatio} tone="blue" />
            <GaugeMeter label="脱敏覆盖率" value={metrics.desensitizationCoverage} tone="green" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
              <div className="flex items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)]">
                <Cpu className="h-4 w-4 text-[var(--primary)]" />
                规则执行平均耗时
              </div>
              <div className="mt-2 text-[1.5rem] font-semibold text-[var(--text-main)]">{metrics.decisionLatencyMs} ms</div>
            </div>
            <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
              <div className="flex items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)]">
                <Workflow className="h-4 w-4 text-[var(--primary)]" />
                当前队列任务数
              </div>
              <div className="mt-2 text-[1.5rem] font-semibold text-[var(--text-main)]">{metrics.queueSize}</div>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[0.8125rem] text-[var(--text-secondary)]">
              <span>当前来源负载对比</span>
              <span>峰值 {metrics.loadBars.length ? Math.max(...metrics.loadBars) : 0}%</span>
            </div>
            <PerformanceBars values={metrics.loadBars} />
          </div>
        </SectionPanel>
      </div>
    </div>
  )
}
