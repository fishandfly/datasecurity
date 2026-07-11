import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileSearch,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { HomomorphicSecondaryTabs } from '../components/security-homomorphic-tabs'
import { Button } from '../components/ui'
import { formatConfidentialTaskCode, formatOpenFheAlgorithm, useConfidentialTasks, type ConfidentialTaskRecord, type SecurityRuntimeLog } from '../lib/nocobase-security-runtime'
import { cn } from '../lib/utils'

type HomomorphicLogRecord = SecurityRuntimeLog & {
  taskId: string
  taskCode: string
  taskName: string
  algorithm: ConfidentialTaskRecord['algorithm']
  sourceDomain: string
  targetDomain: string
  riskLabel: string
}

const stageLabels: Record<SecurityRuntimeLog['stage'], string> = {
  created: '任务创建',
  queued: '参数下发',
  health_check: '引擎健康检查',
  encrypt: '密文准备',
  compute: '密文计算',
  result: '结果密文回传',
  failed: '执行失败',
}

function buildHomomorphicLogs(tasks: ConfidentialTaskRecord[]): HomomorphicLogRecord[] {
  return tasks.flatMap((task) => task.logs.map((log) => ({
    ...log,
    taskId: task.id,
    taskCode: task.code,
    taskName: task.name,
    algorithm: task.algorithm,
    sourceDomain: task.sourceDomain,
    targetDomain: task.targetDomain,
    riskLabel: task.riskLabel,
  }))).sort((left, right) => right.time.localeCompare(left.time))
}

function resultTone(result: SecurityRuntimeLog['result']) {
  if (result === 'success') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (result === 'failed') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
}

function MetricCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: ReactNode }) {
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]">{icon}</div><div><div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div><div className="mt-1 text-[1.45rem] font-semibold text-[var(--text-main)]">{value}</div></div></div>
      <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{detail}</div>
    </div>
  )
}

function stageIcon(stage: SecurityRuntimeLog['stage']) {
  if (stage === 'health_check') return ShieldCheck
  if (stage === 'encrypt') return KeyRound
  if (stage === 'compute') return LockKeyhole
  if (stage === 'result') return CheckCircle2
  if (stage === 'failed') return AlertTriangle
  return FileSearch
}

export function SecurityHomomorphicLogsPage() {
  const { data: tasks, isLoading, error, refresh } = useConfidentialTasks(true)
  const [keyword, setKeyword] = useState('')
  const [algorithmFilter, setAlgorithmFilter] = useState<'全部算法' | 'BFV' | 'CKKS'>('全部算法')
  const [resultFilter, setResultFilter] = useState<'全部结果' | SecurityRuntimeLog['result']>('全部结果')

  const logs = useMemo(() => buildHomomorphicLogs(tasks), [tasks])
  const filteredLogs = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    return logs
      .filter((log) => algorithmFilter === '全部算法' || log.algorithm === algorithmFilter)
      .filter((log) => resultFilter === '全部结果' || log.result === resultFilter)
      .filter((log) => !normalized || [log.id, log.taskCode, log.taskName, log.message, log.requestId, log.engineVersion].some((value) => value.toLowerCase().includes(normalized)))
  }, [algorithmFilter, keyword, logs, resultFilter])

  const successCount = logs.filter((log) => log.result === 'success').length
  const failedCount = logs.filter((log) => log.result === 'failed').length
  const durations = logs.flatMap((log) => log.durationMs == null ? [] : [log.durationMs])
  const avgDuration = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null

  return (
    <div className="space-y-5">
      <HomomorphicSecondaryTabs actions={<Button variant="secondary" className="gap-2" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />同步日志</Button>} />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard title="日志总数" value={logs.length.toLocaleString()} detail="来自后台任务执行摘要。" icon={<FileSearch className="h-5 w-5" />} />
        <MetricCard title="成功记录" value={successCount.toLocaleString()} detail="包含任务创建与同态加密成功执行事件。" icon={<CheckCircle2 className="h-5 w-5" />} />
        <MetricCard title="失败记录" value={failedCount.toLocaleString()} detail="保留引擎返回或网络错误，不伪造成功结果。" icon={<AlertTriangle className="h-5 w-5" />} />
        <MetricCard title="平均耗时" value={avgDuration == null ? '-' : `${avgDuration} ms`} detail="仅基于已写入的真实请求耗时。" icon={<Clock3 className="h-5 w-5" />} />
      </div>

      <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_160px_160px_auto]"><label className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3"><Search className="h-4 w-4 text-[var(--text-muted)]" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none" placeholder="搜索任务、请求编号或执行消息" /></label><select value={algorithmFilter} onChange={(event) => setAlgorithmFilter(event.target.value as typeof algorithmFilter)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem]"><option>全部算法</option><option value="BFV">整数精确型</option><option value="CKKS">浮点近似型</option></select><select value={resultFilter} onChange={(event) => setResultFilter(event.target.value as typeof resultFilter)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem]"><option value="全部结果">全部结果</option><option value="success">成功</option><option value="pending">处理中</option><option value="failed">失败</option></select><Button variant="secondary" onClick={() => { setKeyword(''); setAlgorithmFilter('全部算法'); setResultFilter('全部结果') }}><RefreshCw className="mr-2 h-4 w-4" />重置筛选</Button></div>
        {error ? <div className="mt-3 rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
      </section>

      {isLoading ? <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载真实执行日志...</div> : null}

      <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
        <div className="grid grid-cols-[150px_160px_minmax(220px,1.2fr)_100px_140px_110px_minmax(220px,1fr)_150px_110px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]"><span>日志编号</span><span>记录时间</span><span>任务名称</span><span>算法</span><span>阶段</span><span>结果</span><span>执行消息</span><span>请求编号</span><span>耗时</span></div>
        <div className="overflow-x-auto">{filteredLogs.map((log) => { const Icon = stageIcon(log.stage); return <div key={`${log.taskId}-${log.id}`} className="grid min-w-[1380px] grid-cols-[150px_160px_minmax(220px,1.2fr)_100px_140px_110px_minmax(220px,1fr)_150px_110px] gap-3 border-b border-[var(--line)] px-4 py-4 text-[0.8125rem] last:border-b-0"><span className="truncate font-medium text-[var(--text-main)]">{formatConfidentialTaskCode(log.id)}</span><span className="text-[var(--text-secondary)]">{log.time ? log.time.slice(0, 19).replace('T', ' ') : '-'}</span><span className="min-w-0"><span className="block truncate font-semibold text-[var(--text-main)]">{log.taskName}</span><span className="mt-1 block truncate text-[0.72rem] text-[var(--text-muted)]">{log.sourceDomain} → {log.targetDomain}</span></span><span className="font-semibold text-[var(--text-main)]">{formatOpenFheAlgorithm(log.algorithm)}</span><span className="flex items-center gap-2 text-[var(--text-secondary)]"><Icon className="h-4 w-4 text-[var(--primary)]" />{stageLabels[log.stage]}</span><span><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', resultTone(log.result))}>{log.result === 'success' ? '成功' : log.result === 'failed' ? '失败' : '处理中'}</span></span><span className="line-clamp-2 text-[var(--text-secondary)]">{log.message}</span><span className="truncate text-[var(--text-secondary)]">{log.requestId || '-'}</span><span className="text-[var(--text-secondary)]">{log.durationMs == null ? '-' : `${log.durationMs} ms`}</span></div> })}{!isLoading && filteredLogs.length === 0 ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">暂无真实同态加密执行日志。</div> : null}</div>
      </section>
    </div>
  )
}
