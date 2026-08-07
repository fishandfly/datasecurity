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
import { SecuritySankeyCard } from '../components/security-sankey-card'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { fetchRealtimeMonitorData, type RealtimeMonitorData } from '../lib/security-realtime-monitor'
import { EMPTY_SECURITY_DASHBOARD_V3_DATA, loadSecurityDashboardV3Data, type SecurityDashboardCoreMetric } from '../lib/security-dashboard-v3-data'
import { type SecurityDashboardDistributionItem, type SecurityDashboardMetrics, type SecurityDashboardRealtimeItem, type SecurityDashboardSourceTrendPoint, type SecurityDashboardSourceTrendSeries } from '../lib/security-dashboard-data'
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




function SecurityDataFlow({ metrics, coreMetrics }: { metrics: SecurityDashboardMetrics; coreMetrics: SecurityDashboardCoreMetric[] }) {
  const metricValue = (key: SecurityDashboardCoreMetric['key']) => coreMetrics.find((item) => item.key === key)?.value ?? 0
  const groups = [
    { id: 'source', x: 20, width: 220, title: '中台数据源', value: `${metrics.sourceCount} 个来源`, tone: 'cyan' },
    { id: 'validation', x: 260, width: 260, title: '接入校验', value: `完整性 ${metrics.integrityPassRate}%`, tone: 'blue' },
    { id: 'control', x: 540, width: 260, title: '数据管控', value: `${metrics.resourceCount} 项资源`, tone: 'green' },
    { id: 'access', x: 820, width: 280, title: '访问控制', value: `${metrics.activePolicies} 条启用策略`, tone: 'amber' },
    { id: 'subject', x: 1120, width: 340, title: '数据应用', value: '典型数据应用', tone: 'violet' },
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
  const [realtimeTab, setRealtimeTab] = useState<'overview' | 'flow' | 'homomorphic'>('overview')
  const [sankeyData, setSankeyData] = useState<RealtimeMonitorData | null>(null)
  const [sankeyLoading, setSankeyLoading] = useState(false)
  const [sankeyError, setSankeyError] = useState('')
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
  const refreshSankey = useCallback(async () => {
    setSankeyLoading(true)
    setSankeyError('')
    try {
      setSankeyData(await fetchRealtimeMonitorData(0))
    } catch (currentError) {
      setSankeyError(toErrorMessage(currentError, '流转数据读取失败'))
    } finally {
      setSankeyLoading(false)
    }
  }, [])
  useEffect(() => { void refreshSankey() }, [refreshSankey])

  const { metrics, realtimeItems, events, abnormalTypes, topActors } = dashboardData

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

      <SectionPanel
        title="实时运行监控"
        action={
          <div className="flex items-center rounded-[6px] border border-[var(--line)] bg-[var(--surface-muted)] p-0.5">
            {([
              ['overview', '实时运行情况'],
              ['flow', '分层策略流转'],
              ['homomorphic', '同态加密流转'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRealtimeTab(key)}
                className={cn(
                  'h-8 rounded-[4px] px-3 text-[0.75rem] font-medium transition',
                  realtimeTab === key
                    ? 'bg-[var(--surface-raised)] text-[var(--text-main)] shadow-[var(--shadow-soft)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {realtimeTab === 'overview' ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              {realtimeItems.map((item) => (
                <RealtimeStatusCard key={item.label} item={item} />
              ))}
            </div>

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

          </div>
        ) : sankeyLoading && !sankeyData ? (
          <div className="py-10 text-center text-[0.8125rem] text-[var(--text-muted)]">正在加载流转数据...</div>
        ) : sankeyError && !sankeyData ? (
          <div className="py-10 text-center text-[0.8125rem] text-[var(--status-danger-text)]">{sankeyError}</div>
        ) : sankeyData ? (
          (() => {
            const graphId = realtimeTab === 'flow' ? 'flow' : 'homomorphic'
            const graph = sankeyData.graphs.find((item) => item.id === graphId) ?? sankeyData.graphs[0]
            const index = sankeyData.graphs.findIndex((item) => item.id === graph.id)
            return <SecuritySankeyCard graph={graph} index={index} collections={sankeyData.collections} />
          })()
        ) : null}
      </SectionPanel>

    </div>
  )
}
