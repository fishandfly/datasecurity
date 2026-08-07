import { useEffect, useRef, useState } from 'react'
import { Activity, Pause, Play, Radar, RefreshCw } from 'lucide-react'
import { SecuritySankeyCard } from '../components/security-sankey-card'
import {
  fetchRealtimeMonitorData,
  type RealtimeMonitorData,
} from '../lib/security-realtime-monitor'
import { cn } from '../lib/utils'

const WINDOW_OPTIONS: Array<{ label: string; hours: number }> = [
  { label: '近 1 小时', hours: 1 },
  { label: '近 6 小时', hours: 6 },
  { label: '今天', hours: 24 },
  { label: '全部', hours: 0 },
]

const REFRESH_INTERVAL_MS = 8000

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: 'normal' | 'warning' | 'danger' }) {
  const toneClass = tone === 'danger'
    ? 'text-[var(--status-danger-text)]'
    : tone === 'warning'
      ? 'text-[var(--status-warning-text)]'
      : 'text-[var(--text-main)]'
  return (
    <div className="rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-3">
      <div className="text-[0.6875rem] leading-5 text-[var(--text-muted)]">{label}</div>
      <div className={cn('mt-1 text-[1.25rem] font-semibold leading-7', toneClass)}>{value}</div>
    </div>
  )
}

export function SecurityRealtimeMonitorPage() {
  const [data, setData] = useState<RealtimeMonitorData | null>(null)
  const [windowHours, setWindowHours] = useState(1)
  const [activeGraphId, setActiveGraphId] = useState('flow')
  const [isAutoRefresh, setIsAutoRefresh] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = async () => {
    setIsLoading(true)
    setError('')
    try {
      setData(await fetchRealtimeMonitorData(windowHours))
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : String(currentError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [windowHours])

  useEffect(() => {
    if (!isAutoRefresh) return
    timerRef.current = setInterval(() => {
      void refresh()
    }, REFRESH_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [isAutoRefresh, windowHours])

  return (
    <div className="space-y-6">
      <header className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[var(--shadow-medium)]">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-[1.0625rem] font-semibold text-[var(--text-main)]">实时监控</h1>
              <p className="mt-0.5 text-[0.75rem] leading-5 text-[var(--text-muted)]">
                安全接入、分层策略、同态加密与执行跟踪的真实流转，数据来自后台运行记录
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] p-1">
              {WINDOW_OPTIONS.map((option) => (
                <button
                  key={option.hours}
                  type="button"
                  onClick={() => setWindowHours(option.hours)}
                  className={cn(
                    'h-8 rounded-full px-3 text-[0.75rem] font-medium transition',
                    windowHours === option.hours
                      ? 'bg-[linear-gradient(135deg,var(--theme-nav-start),var(--theme-nav-end))] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIsAutoRefresh((current) => !current)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[0.75rem] font-medium transition',
                isAutoRefresh
                  ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                  : 'border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-secondary)]',
              )}
            >
              {isAutoRefresh ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isAutoRefresh ? '自动刷新中' : '已暂停'}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 text-[0.75rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
              刷新
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.75rem] text-[var(--text-muted)]">
          <span className="inline-flex h-2 w-2 rounded-full bg-[var(--status-success-text)]" />
          <span>最后更新 {data ? formatUpdatedAt(data.fetchedAt) : '—'}</span>
          {isAutoRefresh ? <span>· 每 {REFRESH_INTERVAL_MS / 1000} 秒自动刷新</span> : null}
          {error ? <span className="text-[var(--status-danger-text)]">· {error}</span> : null}
        </div>
      </header>

      {data ? (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-[22px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-soft)]">
            {data.graphs.map((graph) => (
              <button
                key={graph.id}
                type="button"
                onClick={() => setActiveGraphId(graph.id)}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-[14px] px-4 text-[0.8125rem] font-medium transition',
                  activeGraphId === graph.id
                    ? 'bg-[linear-gradient(135deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[var(--shadow-soft)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]',
                )}
              >
                <Radar className="h-4 w-4" />
                {graph.title}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-9">
            {data.kpis.map((kpi) => (
              <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} tone={kpi.tone} />
            ))}
          </div>
          {(() => {
            const graph = data.graphs.find((item) => item.id === activeGraphId) ?? data.graphs[0]
            const index = data.graphs.findIndex((item) => item.id === graph.id)
            return <SecuritySankeyCard key={graph.id} graph={graph} index={index} collections={data.collections} />
          })()}
        </>
      ) : (
        <div className="rounded-[14px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-16 text-center text-[0.875rem] text-[var(--text-muted)]">
          {isLoading ? '正在加载实时监控数据...' : error || '暂无监控数据'}
        </div>
      )}
    </div>
  )
}
