import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Gauge,
  LockKeyhole,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../components/ui'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { useSecurityDataSources, type SecurityDataSourceRecord } from '../lib/nocobase-security-runtime'
import { cn } from '../lib/utils'

type GatewayStatus = '运行中' | '告警' | '离线'
type MonitorRisk = '高' | '中' | '低'
type SourceScope = '全部来源' | '用采2.0系统' | '调控云' | '变电站集中监控' | '配电自动化' | '广域测量' | '实时数据库' | '第三方接口'

type AccessMonitorRecord = {
  id: string
  sourceName: string
  sourceScope: Exclude<SourceScope, '全部来源'>
  gatewayName: string
  status: GatewayStatus
  risk: MonitorRisk
  ingestRate: number
  todayRows: number
  checksumPassRate: number | null
  encryptionRate: number | null
  labelRate: number | null
  latencyMs: number | null
  blockedCount: number
  ownerDept: string
  lastHeartbeat: string
  issue: string
  trend: number[]
}

const accessSecondaryNavItems: Array<{ id: string; label: string; path: string; icon: LucideIcon }> = [
  { id: 'source-config', label: '数据源配置', path: '/security-governance/data-access/source-config', icon: DatabaseZap },
  { id: 'access-rules', label: '接入规则配置', path: '/security-governance/data-access/rule-config', icon: ShieldCheck },
  { id: 'access-monitor', label: '接入监控', path: '/security-governance/data-access/monitoring', icon: Network },
]

const sourceScopes: SourceScope[] = ['全部来源', '用采2.0系统', '调控云', '变电站集中监控', '配电自动化', '广域测量', '实时数据库', '第三方接口']
const statusFilters: Array<'全部状态' | GatewayStatus> = ['全部状态', '运行中', '告警', '离线']

function resolveSourceScope(item: SecurityDataSourceRecord): AccessMonitorRecord['sourceScope'] {
  if (item.sourceType === 'yongcai20') return '用采2.0系统'
  if (item.sourceType === 'dispatch_cloud') return '调控云'
  if (item.sourceType === 'substation_monitor') return '变电站集中监控'
  if (item.sourceType === 'distribution_automation') return '配电自动化'
  if (item.sourceType === 'wide_area_measurement') return '广域测量'
  if (item.sourceType === 'third_party_api') return '第三方接口'
  return '实时数据库'
}

function formatHeartbeat(value: string) {
  const normalized = value.trim()
  if (!normalized) return ''
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function buildAccessMonitors(items: SecurityDataSourceRecord[]): AccessMonitorRecord[] {
  return items.map((item) => {
    const status: GatewayStatus = item.status === 'connected' ? '运行中' : item.status === 'exception' ? '告警' : '离线'
    const sourceScope = resolveSourceScope(item)
    const risk: MonitorRisk = status === '告警' || item.monitor.blockedCount > 0
      ? '高'
      : status === '离线'
        ? '中'
        : '低'
    return {
      id: item.id,
      sourceName: item.name,
      sourceScope,
      gatewayName: '受控接入网关',
      status,
      risk,
      ingestRate: item.monitor.ingestRate,
      todayRows: item.monitor.todayRows,
      checksumPassRate: item.monitor.checksumPassRate,
      encryptionRate: item.monitor.encryptionRate,
      labelRate: item.monitor.labelRate,
      latencyMs: item.monitor.latencyMs,
      blockedCount: item.monitor.blockedCount,
      ownerDept: item.ownerDept || '未指定责任部门',
      lastHeartbeat: formatHeartbeat(item.monitor.lastHeartbeat || item.lastCheckedAt),
      issue: item.monitor.issue,
      trend: [item.monitor.ingestRate],
    }
  })
}

function SourceSecondaryTabs({ withEmbed, actions }: { withEmbed: (path: string) => string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <nav aria-label="数据接入管理二级导航" className="inline-flex flex-wrap gap-2 rounded-[18px] border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[color-mix(in_srgb,var(--surface-glass)_92%,transparent)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
        {accessSecondaryNavItems.map((item) => {
          const active = item.id === 'access-monitor'
          return (
            <Link
              key={item.id}
              to={withEmbed(item.path)}
              className={cn(
                'inline-flex min-h-11 items-center gap-3 whitespace-nowrap rounded-[14px] px-4 py-3 text-[0.875rem] font-medium transition',
                active ? 'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] !text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.20)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]',
              )}
            >
              <item.icon className={cn('h-4 w-4', active ? '!text-white' : '')} />
              <span className={active ? '!text-white' : ''}>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      {actions ? <div className="flex flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
    </div>
  )
}

function statusTone(status: GatewayStatus) {
  if (status === '运行中') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (status === '告警') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
}

function riskTone(risk: MonitorRisk) {
  if (risk === '高') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  if (risk === '中') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
}

function MetricCard({ title, value, detail, icon, tone = 'primary' }: { title: string; value: string; detail: string; icon: ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const toneClass = {
    primary: 'bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]',
    success: 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
    warning: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]',
    danger: 'bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]',
  }[tone]

  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-[8px]', toneClass)}>{icon}</div>
        <div>
          <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
          <div className="mt-1 text-[1.45rem] font-semibold text-[var(--text-main)]">{value}</div>
        </div>
      </div>
      <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{detail}</div>
    </div>
  )
}

function MiniTrend({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 140
    const y = 44 - (value / max) * 36
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg viewBox="0 0 140 48" className="h-12 w-full" aria-label="接入趋势">
      <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SecurityAccessMonitoringPage() {
  const location = useLocation()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const { data: sources, isLoading: loading, error, refresh } = useSecurityDataSources(true)
  const [keyword, setKeyword] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceScope>('全部来源')
  const [statusFilter, setStatusFilter] = useState<'全部状态' | GatewayStatus>('全部状态')

  const monitors = useMemo(() => buildAccessMonitors(sources), [sources])
  const filteredMonitors = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return monitors
      .filter((item) => sourceFilter === '全部来源' || item.sourceScope === sourceFilter)
      .filter((item) => statusFilter === '全部状态' || item.status === statusFilter)
      .filter((item) => {
        if (!normalizedKeyword) return true
        return [item.sourceName, item.sourceScope, item.gatewayName, item.ownerDept, item.issue].some((value) => value.toLowerCase().includes(normalizedKeyword))
      })
  }, [keyword, monitors, sourceFilter, statusFilter])
  const totalRate = monitors.reduce((sum, item) => sum + item.ingestRate, 0)
  const totalRows = monitors.reduce((sum, item) => sum + item.todayRows, 0)
  const checksumMetrics = monitors.flatMap((item) => item.checksumPassRate == null ? [] : [item.checksumPassRate])
  const encryptionMetrics = monitors.flatMap((item) => item.encryptionRate == null ? [] : [item.encryptionRate])
  const latencyMetrics = monitors.flatMap((item) => item.latencyMs == null ? [] : [item.latencyMs])
  const labelMetrics = monitors.flatMap((item) => item.labelRate == null ? [] : [item.labelRate])
  const avgChecksum = checksumMetrics.length ? checksumMetrics.reduce((sum, value) => sum + value, 0) / checksumMetrics.length : null
  const avgEncryption = encryptionMetrics.length ? encryptionMetrics.reduce((sum, value) => sum + value, 0) / encryptionMetrics.length : null
  const avgLatency = latencyMetrics.length ? Math.round(latencyMetrics.reduce((sum, value) => sum + value, 0) / latencyMetrics.length) : null
  const avgLabelFailure = labelMetrics.length ? Math.max(0, 100 - (labelMetrics.reduce((sum, value) => sum + value, 0) / labelMetrics.length)) : null
  const alertCount = monitors.filter((item) => item.status !== '运行中').length
  const trendBars = monitors.slice(0, 12)
  const maxTrendRate = Math.max(...trendBars.map((item) => item.ingestRate), 1)

  const resetFilters = () => {
    setKeyword('')
    setSourceFilter('全部来源')
    setStatusFilter('全部状态')
  }

  return (
    <div className="space-y-5">
      <SourceSecondaryTabs
        withEmbed={withEmbed}
        actions={
          <>
            <Button className="gap-2" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />刷新监控</Button>
            <Button variant="secondary" className="gap-2" onClick={() => setStatusFilter('告警')}><AlertTriangle className="h-4 w-4" />查看异常队列</Button>
          </>
          }
        />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard title="实时接入量" value={`${totalRate.toLocaleString()}/s`} detail={`今日累计 ${totalRows.toLocaleString()} 条。`} icon={<Activity className="h-5 w-5" />} />
        <MetricCard title="校验通过率" value={avgChecksum == null ? '-' : `${avgChecksum.toFixed(2)}%`} detail="只统计接入执行记录中的完整性校验结果。" icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
        <MetricCard title="加密传输覆盖" value={avgEncryption == null ? '-' : `${avgEncryption.toFixed(1)}%`} detail="只统计接入网关回写的实际执行数据。" icon={<LockKeyhole className="h-5 w-5" />} tone="warning" />
        <MetricCard title="异常网关" value={alertCount.toLocaleString()} detail="异常源已进入接入处置和日志链路审计队列。" icon={<AlertCircle className="h-5 w-5" />} tone={alertCount > 0 ? 'danger' : 'success'} />
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="mb-3 flex items-center gap-2 text-[1rem] font-semibold text-[var(--text-main)]">
            <Gauge className="h-4 w-4 text-[var(--primary)]" />
            接入吞吐趋势
          </div>
          {trendBars.length > 0 ? (
            <div className="grid h-56 items-end gap-2 border-b border-[var(--line)] px-2" style={{ gridTemplateColumns: `repeat(${trendBars.length}, minmax(0, 1fr))` }}>
              {trendBars.map((record) => {
                const value = Math.max(8, (record.ingestRate / maxTrendRate) * 100)
                return (
                  <div key={record.id} className="flex h-full flex-col justify-end gap-2">
                    <div className="rounded-t-[4px] bg-[linear-gradient(180deg,var(--primary),var(--primary-strong))]" style={{ height: `${value}%` }} title={`${record.ingestRate.toLocaleString()}/s`} />
                    <span className="truncate text-center text-[0.68rem] text-[var(--text-muted)]">{record.sourceName}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-[8px] border border-dashed border-[var(--line)] bg-[var(--surface-muted)] text-[0.8125rem] text-[var(--text-muted)]">
              后台暂无可用于接入吞吐趋势的监控记录。
            </div>
          )}
        </div>
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="mb-3 flex items-center gap-2 text-[1rem] font-semibold text-[var(--text-main)]">
            <Timer className="h-4 w-4 text-[var(--primary)]" />
            监控阈值
          </div>
          {[
            ['校验失败率', avgChecksum == null ? '-' : `${Math.max(0, 100 - avgChecksum).toFixed(2)}%`, '阈值 1%'],
            ['平均网关延迟', avgLatency == null ? '-' : `${avgLatency}ms`, '阈值 500ms'],
            ['标签失败率', avgLabelFailure == null ? '-' : `${avgLabelFailure.toFixed(1)}%`, '阈值 2%'],
            ['心跳超时', `${monitors.filter((item) => item.status === '离线').length} 个`, '阈值 0 个'],
          ].map(([label, value, threshold]) => (
            <div key={label} className="mb-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
              <div className="flex items-center justify-between text-[0.8125rem]">
                <span className="text-[var(--text-secondary)]">{label}</span>
                <span className="font-semibold text-[var(--text-main)]">{value}</span>
              </div>
              <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">{threshold}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_180px_150px_auto]">
          <label className="flex h-10 min-w-0 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3">
            <Search className="h-4 w-4 text-[var(--text-muted)]" />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]" placeholder="搜索数据源、网关、部门或异常说明" />
          </label>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceScope)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none">
            {sourceScopes.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as '全部状态' | GatewayStatus)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none">
            {statusFilters.map((item) => <option key={item}>{item}</option>)}
          </select>
          <Button variant="secondary" className="gap-2" onClick={resetFilters}>
            <RefreshCw className="h-4 w-4" />
            重置筛选
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载接入监控...</div>
      ) : null}
      {error ? (
        <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-4 text-[0.875rem] text-[var(--status-danger-text)]">{error}</div>
      ) : null}

      <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
        <div className="grid grid-cols-[minmax(240px,1.3fr)_150px_150px_100px_110px_120px_120px_110px_130px_170px_180px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]">
          <span>接入源</span>
          <span>来源类型</span>
          <span>接入网关</span>
          <span>状态</span>
          <span>实时量</span>
          <span>校验通过率</span>
          <span>加密覆盖</span>
          <span>延迟</span>
          <span>风险</span>
          <span>最后心跳</span>
          <span>趋势</span>
        </div>
        <div className="overflow-x-auto">
          {filteredMonitors.map((record) => (
            <div key={record.id} className="grid min-w-[1540px] grid-cols-[minmax(240px,1.3fr)_150px_150px_100px_110px_120px_120px_110px_130px_170px_180px] gap-3 border-b border-[var(--line)] px-4 py-4 text-[0.8125rem] last:border-b-0 hover:bg-[var(--surface-muted)]">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-[var(--text-main)]">{record.sourceName}</span>
                <span className="mt-1 block truncate text-[0.75rem] text-[var(--text-muted)]">{record.ownerDept} · {record.issue}</span>
              </span>
              <span className="text-[var(--text-secondary)]">{record.sourceScope}</span>
              <span className="truncate text-[var(--text-secondary)]">{record.gatewayName}</span>
              <span><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(record.status))}>{record.status}</span></span>
              <span className="font-semibold text-[var(--text-main)]">{record.ingestRate.toLocaleString()}/s</span>
              <span className="font-semibold text-[var(--text-main)]">{record.checksumPassRate == null ? '-' : `${record.checksumPassRate.toFixed(2)}%`}</span>
              <span className="font-semibold text-[var(--text-main)]">{record.encryptionRate == null ? '-' : `${record.encryptionRate.toFixed(1)}%`}</span>
              <span className="text-[var(--text-secondary)]">{record.latencyMs == null ? '-' : `${record.latencyMs}ms`}</span>
              <span><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', riskTone(record.risk))}>{record.risk}</span></span>
              <span className="text-[var(--text-secondary)]">{record.lastHeartbeat}</span>
              <span><MiniTrend values={record.trend} /></span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {([
          ['网关健康', '持续检测网关心跳、延迟、吞吐与错误率。', Network],
          ['安全校验', '按规则监控完整性校验、自动标签和加密传输结果。', ShieldCheck],
          ['异常处置', '异常源进入处置队列，并同步写入日志链路审计。', AlertTriangle],
        ] as Array<[string, string, LucideIcon]>).map(([title, detail, Icon]) => (
          <div key={String(title)} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]">
                <Icon className="h-5 w-5" />
              </div>
              <div className="font-semibold text-[var(--text-main)]">{title}</div>
            </div>
            <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{detail}</div>
          </div>
        ))}
      </section>
    </div>
  )
}
