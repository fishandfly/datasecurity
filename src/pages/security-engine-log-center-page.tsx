import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Waves,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SecurityModuleTabs } from '../components/security-module-tabs'
import { Button } from '../components/ui'
import {
  loadSecurityEngineLogs,
  type SecurityEngineLog,
  type SecurityEngineLogStatus,
  type SecurityEngineType,
} from '../lib/security-engine-logs'
import { toErrorMessage } from '../lib/nocobase-client'
import { cn } from '../lib/utils'

const engineOptions: Array<{ value: 'all' | SecurityEngineType; label: string }> = [
  { value: 'all', label: '全部引擎' },
  { value: 'ingest', label: '接入校验引擎' },
  { value: 'access', label: '访问策略引擎' },
  { value: 'homomorphic', label: '同态加密引擎' },
  { value: 'streaming', label: '流式处理引擎' },
]

const statusOptions: Array<{ value: 'all' | SecurityEngineLogStatus; label: string }> = [
  { value: 'all', label: '全部结果' },
  { value: 'failed', label: '异常' },
  { value: 'warning', label: '告警' },
  { value: 'running', label: '执行中' },
  { value: 'success', label: '成功' },
]

function formatTime(value: string) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 19).replace('T', ' ')
  return parsed.toLocaleString('zh-CN', { hour12: false })
}

function engineIcon(engine: SecurityEngineType) {
  if (engine === 'ingest') return DatabaseZap
  if (engine === 'access') return ShieldCheck
  if (engine === 'streaming') return Waves
  return Calculator
}

function statusLabel(status: SecurityEngineLogStatus) {
  if (status === 'failed') return '异常'
  if (status === 'warning') return '告警'
  if (status === 'running') return '执行中'
  return '成功'
}

function statusTone(status: SecurityEngineLogStatus) {
  if (status === 'failed') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  if (status === 'warning' || status === 'running') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
}

function MetricCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: ReactNode }) {
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]">{icon}</div>
        <div className="min-w-0">
          <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
          <div className="mt-1 text-[1.4rem] font-semibold text-[var(--text-main)]">{value}</div>
        </div>
      </div>
      <div className="mt-3 text-[0.75rem] leading-5 text-[var(--text-secondary)]">{detail}</div>
    </div>
  )
}

function MobileLogCard({ log }: { log: SecurityEngineLog }) {
  const Icon = engineIcon(log.engine)
  return (
    <article className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-muted)] text-[var(--primary)]"><Icon className="h-4 w-4" /></div>
          <div className="min-w-0"><div className="truncate text-[0.875rem] font-semibold text-[var(--text-main)]">{log.title}</div><div className="mt-1 text-[0.72rem] text-[var(--text-muted)]">{log.engineLabel}</div></div>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[0.72rem]', statusTone(log.status))}>{statusLabel(log.status)}</span>
      </div>
      <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{log.message}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-[8px] bg-[var(--surface-muted)] p-3 text-[0.72rem] text-[var(--text-muted)]">
        <div><span>时间：</span>{formatTime(log.time)}</div>
        <div><span>耗时：</span>{log.durationMs == null ? '-' : `${log.durationMs} ms`}</div>
        <div className="truncate"><span>资源：</span>{log.resource}</div>
        <div className="truncate"><span>请求：</span>{log.requestId || '-'}</div>
      </div>
      {log.detailRows?.length ? (
        <div className="mt-3 overflow-x-auto rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)]">
          <div className="px-3 py-2 text-[0.72rem] font-medium text-[var(--text-muted)]">窗口明细</div>
          <table className="w-full border-collapse text-left text-[0.7rem]">
            <tbody>
              {log.detailRows.map((row, index) => (
                <tr key={index} className="border-t border-[var(--line)]">
                  {Object.entries(row).map(([key, value]) => (
                    <td key={key} className="px-2 py-1.5 text-[var(--text-secondary)]"><span className="text-[var(--text-muted)]">{key} </span>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  )
}

export function SecurityEngineLogCenterPage() {
  const [logs, setLogs] = useState<SecurityEngineLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [engine, setEngine] = useState<'all' | SecurityEngineType>('all')
  const [status, setStatus] = useState<'all' | SecurityEngineLogStatus>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setLogs(await loadSecurityEngineLogs())
    } catch (currentError) {
      setError(toErrorMessage(currentError, '四引擎日志读取失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const filteredLogs = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    return logs.filter((log) => (
      (engine === 'all' || log.engine === engine)
      && (status === 'all' || log.status === status)
      && (!normalized || [log.code, log.title, log.message, log.resource, log.subject, log.requestId]
        .some((value) => value.toLowerCase().includes(normalized)))
    ))
  }, [engine, keyword, logs, status])

  const exceptions = logs.filter((log) => log.status === 'failed').length
  const warnings = logs.filter((log) => log.status === 'warning').length
  const durations = logs.flatMap((log) => log.durationMs == null ? [] : [log.durationMs])
  const averageDuration = durations.length
    ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length)
    : null

  return (
    <div className="space-y-5">
      <SecurityModuleTabs
        module="risks"
        actions={<Button variant="secondary" className="gap-2" onClick={() => void refresh()}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />刷新日志</Button>}
      />

      <section className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(135deg,var(--surface-raised),var(--surface-muted))] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-[1.125rem] font-semibold text-[var(--text-main)]">四引擎日志中心</h1><p className="mt-1 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">统一查看接入校验、访问策略、同态加密和流式处理的真实执行日志；这里只归集日志，不自动创建风险事件。</p></div>
          <div className="rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-[0.75rem] text-[var(--text-secondary)]">数据不落地 · 仅记录执行摘要</div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard title="日志总数" value={logs.length.toLocaleString()} detail="四个引擎的真实执行记录" icon={<Clock3 className="h-5 w-5" />} />
        <MetricCard title="异常日志" value={exceptions.toLocaleString()} detail="执行失败或安全阻断记录" icon={<AlertTriangle className="h-5 w-5" />} />
        <MetricCard title="告警日志" value={warnings.toLocaleString()} detail="允许继续执行但需要关注" icon={<ShieldCheck className="h-5 w-5" />} />
        <MetricCard title="平均耗时" value={averageDuration == null ? '-' : `${averageDuration} ms`} detail="按有耗时记录的日志统计" icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_190px_160px_auto]">
          <label className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3"><Search className="h-4 w-4 text-[var(--text-muted)]" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none" placeholder="搜索编号、资源、主体或执行消息" /></label>
          <select value={engine} onChange={(event) => setEngine(event.target.value as typeof engine)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-main)]">{engineOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-main)]">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <Button variant="secondary" onClick={() => { setKeyword(''); setEngine('all'); setStatus('all') }}>重置筛选</Button>
        </div>
        {error ? <div className="mt-3 rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
      </section>

      <div className="grid gap-3 md:hidden">
        {filteredLogs.map((log) => <MobileLogCard key={log.id} log={log} />)}
      </div>

      <section className="hidden overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-[0.8125rem]">
            <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]"><tr>{['记录时间', '引擎', '执行动作', '结果', '数据资源/API', '数据应用', '执行消息', '请求编号', '耗时'].map((label) => <th key={label} className="border-b border-[var(--line)] px-4 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>{filteredLogs.map((log) => { const Icon = engineIcon(log.engine); const expanded = expandedId === log.id; return (
              <Fragment key={log.id}>
                <tr
                  onClick={log.detailRows?.length ? () => setExpandedId(expanded ? null : log.id) : undefined}
                  className={cn('border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-muted)]', log.detailRows?.length && 'cursor-pointer')}
                >
                  <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{formatTime(log.time)}</td>
                  <td className="px-4 py-3.5"><span className="flex items-center gap-2 whitespace-nowrap text-[var(--text-main)]"><Icon className="h-4 w-4 text-[var(--primary)]" />{log.engineLabel}</span></td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-medium text-[var(--text-main)]">{log.title}</td>
                  <td className="px-4 py-3.5"><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.72rem]', statusTone(log.status))}>{statusLabel(log.status)}</span></td>
                  <td className="max-w-[220px] truncate px-4 py-3.5 text-[var(--text-secondary)]">{log.resource}</td>
                  <td className="max-w-[180px] truncate px-4 py-3.5 text-[var(--text-secondary)]">{log.subject}</td>
                  <td className="max-w-[340px] px-4 py-3.5 leading-5 text-[var(--text-secondary)]">{log.message}</td>
                  <td className="max-w-[220px] truncate px-4 py-3.5 text-[var(--text-muted)]">{log.requestId || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{log.durationMs == null ? '-' : `${log.durationMs} ms`}</td>
                </tr>
                {expanded && log.detailRows?.length ? (
                  <tr className="border-b border-[var(--line)] bg-[var(--surface-muted)]">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="mb-2 text-[0.72rem] font-medium text-[var(--text-muted)]">窗口明细（点击行可收起）</div>
                      <div className="overflow-x-auto rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)]">
                        <table className="w-full min-w-[640px] border-collapse text-left text-[0.72rem]">
                          <thead className="bg-[var(--table-header-bg)] text-[var(--text-muted)]">
                            <tr>{Object.keys(log.detailRows[0]).map((key) => <th key={key} className="border-b border-r border-[var(--line)] px-3 py-2 last:border-r-0">{key}</th>)}</tr>
                          </thead>
                          <tbody>
                            {log.detailRows.map((row, index) => (
                              <tr key={index} className="border-b border-[var(--line)] last:border-b-0">
                                {Object.values(row).map((value, cellIndex) => <td key={cellIndex} className="border-r border-[var(--line)] px-3 py-2 text-[var(--text-secondary)] last:border-r-0">{value}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ) })}</tbody>
          </table>
        </div>
      </section>

      {loading ? <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在汇总四个引擎的日志...</div> : null}
      {!loading && !filteredLogs.length ? <div className="rounded-[8px] border border-dashed border-[var(--line)] bg-[var(--surface-raised)] px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">当前筛选条件下没有真实日志记录</div> : null}
    </div>
  )
}
