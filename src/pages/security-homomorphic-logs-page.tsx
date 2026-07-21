import { AlertTriangle, CheckCircle2, Clock3, FileSearch, KeyRound, LockKeyhole, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { HomomorphicSecondaryTabs } from '../components/security-homomorphic-tabs'
import { Button } from '../components/ui'
import { listSecurityV3Records, sanitizeSecurityVisibleText, type SecurityV3Record } from '../lib/nocobase-security-v3'
import { toErrorMessage } from '../lib/nocobase-client'
import { cn } from '../lib/utils'

type EventResult = 'success' | 'pending' | 'failed'

type HomomorphicEvent = {
  id: string
  taskId: string
  taskCode: string
  taskName: string
  subjectName: string
  time: string
  stage: string
  result: EventResult
  message: string
  requestId: string
  durationMs: number | null
}

const stageLabels: Record<string, string> = {
  created: '任务创建', queued: '任务排队', validation: '范围校验', resource_read: '资源取数', health_check: '服务检查',
  encrypt: '密文准备', compute: '密文计算', result: '结果回传', failed: '执行失败',
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function buildEvents(tasks: SecurityV3Record[]): HomomorphicEvent[] {
  return tasks.flatMap((task) => {
    const summary = asRecord(task.execution_summary_json)
    const rawEvents = Array.isArray(summary.events) ? summary.events : Array.isArray(summary.logs) ? summary.logs : []
    const subject = asRecord(task.subject)
    return rawEvents.map((rawEvent, index) => {
      const event = asRecord(rawEvent)
      const result = String(event.result || 'pending')
      const normalizedResult: EventResult = result === 'success' || result === 'failed' ? result : 'pending'
      return {
        id: String(event.id || `${task.id || 'task'}-${index + 1}`),
        taskId: String(task.id || ''),
        taskCode: sanitizeSecurityVisibleText(task.task_code),
        taskName: sanitizeSecurityVisibleText(task.task_name),
        subjectName: sanitizeSecurityVisibleText(subject.subject_name || '未关联'),
        time: String(event.time || event.created_at || ''),
        stage: String(event.stage || 'queued'),
        result: normalizedResult,
        message: sanitizeSecurityVisibleText(event.message || '任务状态已更新'),
        requestId: sanitizeSecurityVisibleText(event.request_id || event.requestId || ''),
        durationMs: Number.isFinite(Number(event.duration_ms ?? event.durationMs)) ? Number(event.duration_ms ?? event.durationMs) : null,
      }
    })
  }).sort((left, right) => right.time.localeCompare(left.time))
}

function resultTone(result: EventResult) {
  if (result === 'success') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (result === 'failed') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
}

function stageIcon(stage: string) {
  if (stage === 'health_check' || stage === 'validation') return ShieldCheck
  if (stage === 'encrypt') return KeyRound
  if (stage === 'compute') return LockKeyhole
  if (stage === 'result') return CheckCircle2
  if (stage === 'failed') return AlertTriangle
  return FileSearch
}

function MetricCard({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]">{icon}</div>
        <div><div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div><div className="mt-1 text-[1.45rem] font-semibold text-[var(--text-main)]">{value}</div></div>
      </div>
    </div>
  )
}

export function SecurityHomomorphicLogsPage() {
  const [tasks, setTasks] = useState<SecurityV3Record[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [resultFilter, setResultFilter] = useState<'all' | EventResult>('all')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const records = await listSecurityV3Records('security_confidential_tasks', { appends: ['subject'], sort: ['-updatedAt', '-createdAt'] })
      setTasks(records.filter((record) => (
        record.task_status !== 'archived'
        && ['bfv', 'ckks'].includes(String(record.algorithm || '').toLowerCase())
        && asRecord(record.execution_summary_json).trigger === 'resource-api-policy'
      )))
    } catch (currentError) {
      setError(toErrorMessage(currentError, '同态日志读取失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const events = useMemo(() => buildEvents(tasks), [tasks])
  const filteredEvents = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    return events
      .filter((event) => resultFilter === 'all' || event.result === resultFilter)
      .filter((event) => !normalized || [event.id, event.taskCode, event.taskName, event.subjectName, event.message, event.requestId].some((value) => value.toLowerCase().includes(normalized)))
  }, [events, keyword, resultFilter])

  const durations = events.flatMap((event) => event.durationMs == null ? [] : [event.durationMs])
  const averageDuration = durations.length ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length) : null

  return (
    <div className="space-y-5">
      <HomomorphicSecondaryTabs actions={<Button variant="secondary" className="gap-2" onClick={() => void refresh()}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />刷新</Button>} />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard title="阶段事件" value={events.length.toLocaleString()} icon={<FileSearch className="h-5 w-5" />} />
        <MetricCard title="成功事件" value={events.filter((event) => event.result === 'success').length.toLocaleString()} icon={<CheckCircle2 className="h-5 w-5" />} />
        <MetricCard title="失败事件" value={events.filter((event) => event.result === 'failed').length.toLocaleString()} icon={<AlertTriangle className="h-5 w-5" />} />
        <MetricCard title="平均耗时" value={averageDuration == null ? '-' : `${averageDuration} ms`} icon={<Clock3 className="h-5 w-5" />} />
      </div>

      <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_160px_auto]">
          <label className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3"><Search className="h-4 w-4 text-[var(--text-muted)]" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none" placeholder="搜索任务、请求编号或执行消息" /></label>
          <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value as typeof resultFilter)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem]"><option value="all">全部结果</option><option value="success">成功</option><option value="pending">处理中</option><option value="failed">失败</option></select>
          <Button variant="secondary" onClick={() => { setKeyword(''); setResultFilter('all') }}><RefreshCw className="mr-2 h-4 w-4" />重置筛选</Button>
        </div>
        {error ? <div className="mt-3 rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
      </section>

      <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-[0.8125rem]">
            <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]"><tr>{['记录时间', '任务', '外部访问方', '阶段', '结果', '执行消息', '请求编号', '耗时'].map((label) => <th key={label} className="border-b border-[var(--line)] px-4 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>{filteredEvents.map((event) => { const Icon = stageIcon(event.stage); return (
              <tr key={`${event.taskId}-${event.id}`} className="border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-muted)]">
                <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{event.time ? event.time.slice(0, 19).replace('T', ' ') : '-'}</td>
                <td className="max-w-[240px] px-4 py-3.5"><div className="truncate font-medium text-[var(--text-main)]">{event.taskName}</div><div className="mt-1 truncate text-[0.72rem] text-[var(--text-muted)]">{event.taskCode}</div></td>
                <td className="px-4 py-3.5 text-[var(--text-secondary)]">{event.subjectName}</td>
                <td className="px-4 py-3.5"><span className="flex items-center gap-2 text-[var(--text-secondary)]"><Icon className="h-4 w-4 text-[var(--primary)]" />{stageLabels[event.stage] || '状态更新'}</span></td>
                <td className="px-4 py-3.5"><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.75rem]', resultTone(event.result))}>{event.result === 'success' ? '成功' : event.result === 'failed' ? '失败' : '处理中'}</span></td>
                <td className="max-w-[320px] px-4 py-3.5 text-[var(--text-secondary)]">{event.message}</td>
                <td className="px-4 py-3.5 text-[var(--text-secondary)]">{event.requestId || '-'}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{event.durationMs == null ? '-' : `${event.durationMs} ms`}</td>
              </tr>
            ) })}</tbody>
          </table>
        </div>
        {loading ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在读取后台事件...</div> : null}
        {!loading && !filteredEvents.length ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">暂无真实同态任务事件</div> : null}
      </section>
    </div>
  )
}
