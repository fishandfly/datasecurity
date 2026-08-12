import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  FileSearch,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { HomomorphicSecondaryTabs } from '../components/security-homomorphic-tabs'
import { Button } from '../components/ui'
import {
  formatConfidentialTaskCode,
  formatOpenFheAlgorithm,
  useConfidentialTasks,
  type ConfidentialTaskRecord,
  type SecurityRiskLevel,
} from '../lib/nocobase-security-runtime'
import { cn } from '../lib/utils'

function statusTone(status: ConfidentialTaskRecord['status']) {
  if (status === 'running') return 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
  if (status === 'completed') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (status === 'failed') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
}

function riskTone(risk: SecurityRiskLevel) {
  if (risk === 'high') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  if (risk === 'medium') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
}

function operationLabel(operation: ConfidentialTaskRecord['operation']) {
  if (operation === 'mean') return '平均值'
  if (operation === 'sum') return '求和'
  return '未记录'
}

function MetricCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: ReactNode }) {
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]">{icon}</div>
        <div><div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div><div className="mt-1 text-[1.45rem] font-semibold text-[var(--text-main)]">{value}</div></div>
      </div>
      <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{detail}</div>
    </div>
  )
}

function TaskDrawer({ task, onClose }: { task: ConfidentialTaskRecord | null; onClose: () => void }) {
  if (!task) return null
  const summaryResource = task.executionSummary.resource && typeof task.executionSummary.resource === 'object'
    ? task.executionSummary.resource as Record<string, unknown>
    : {}
  const scope = task.executionSummary.scope && typeof task.executionSummary.scope === 'object'
    ? task.executionSummary.scope as Record<string, unknown>
    : {}
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex h-full max-h-[100dvh] w-full max-w-[680px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-strong)]">
        <div className="flex shrink-0 items-start justify-between border-b border-[var(--line)] px-6 py-4">
          <div><div className="text-[0.75rem] text-[var(--text-muted)]">资源 API 自动密态任务</div><h2 className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{task.name}</h2><div className="mt-2 flex gap-2"><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(task.status))}>{task.statusLabel}</span><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', riskTone(task.risk))}>{task.riskLabel}风险</span></div></div>
          <button type="button" aria-label="关闭" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="grid gap-3 sm:grid-cols-2">
            {[
              ['数据资源', String(summaryResource.name || '未记录')],
              ['量测字段', task.fieldCode || '未记录'],
              ['计算操作', operationLabel(task.operation)],
              ['数值样本', `${task.sampleCount} 条`],
              ['算法类型', formatOpenFheAlgorithm(task.algorithm)],
              ['触发方式', task.executionSummary.trigger === 'resource-api-policy' ? '资源 API 策略触发' : '历史任务'],
              ['数据所属区域', String(scope.regionCode || task.regionScope.join('、') || '未限定')],
              ['组织范围', String(scope.organizationCode || task.organizationScope.join('、') || '未限定')],
              ['数据开始时间', String(scope.startAt || '未记录')],
              ['数据结束时间', String(scope.endAt || '未记录')],
            ].map(([label, value]) => <div key={label} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3"><div className="text-[0.75rem] text-[var(--text-muted)]">{label}</div><div className="mt-1 break-words text-[0.875rem] font-medium text-[var(--text-main)]">{value}</div></div>)}
          </section>
          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">执行日志</h3>
            <div className="mt-3 grid gap-2">
              {task.logs.map((log) => <div key={log.id} className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-[0.8125rem]"><div className="flex items-start justify-between gap-3"><span className="font-medium leading-5 text-[var(--text-main)]">{log.message}</span><span className="shrink-0 text-[0.72rem] text-[var(--text-muted)]">{log.time ? log.time.slice(0, 19).replace('T', ' ') : '-'}</span></div>{log.requestId ? <div className="mt-1 break-all text-[0.72rem] text-[var(--text-muted)]">请求编号：{log.requestId}</div> : null}</div>)}
              {task.logs.length === 0 ? <div className="rounded-[8px] border border-dashed border-[var(--line)] px-3 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]">尚无真实执行日志</div> : null}
            </div>
          </section>
        </div>
        <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-right"><Button variant="secondary" onClick={onClose}>关闭</Button></div>
      </aside>
    </div>,
    document.body,
  )
}

export function SecurityConfidentialComputingPage() {
  const { data: tasksData, isLoading, error, refresh } = useConfidentialTasks(true)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'全部' | ConfidentialTaskRecord['status']>('全部')
  const [selectedTask, setSelectedTask] = useState<ConfidentialTaskRecord | null>(null)
  const tasks = useMemo(() => tasksData.filter((task) => (
    (task.algorithm === 'BFV' || task.algorithm === 'CKKS')
    && task.executionSummary.trigger === 'resource-api-policy'
  )), [tasksData])
  const filteredTasks = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    return tasks
      .filter((task) => statusFilter === '全部' || task.status === statusFilter)
      .filter((task) => !normalized || [task.code, task.name, task.scenario, task.algorithm, task.fieldCode].some((value) => value.toLowerCase().includes(normalized)))
  }, [keyword, statusFilter, tasks])

  return (
    <>
      <div className="space-y-5">
        <HomomorphicSecondaryTabs actions={<Button variant="secondary" className="gap-2" onClick={() => void refresh()}><RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />同步执行状态</Button>} />
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard title="自动触发任务" value={tasks.length.toLocaleString()} detail="由资源 API 请求命中密态输出策略后生成。" icon={<DatabaseZap className="h-5 w-5" />} />
          <MetricCard title="运行中任务" value={tasks.filter((task) => task.status === 'running').length.toLocaleString()} detail="正在服务端取数或进行密文计算。" icon={<Activity className="h-5 w-5" />} />
          <MetricCard title="已完成任务" value={tasks.filter((task) => task.status === 'completed').length.toLocaleString()} detail="仅统计计算服务真实返回并通过校验的任务。" icon={<CheckCircle2 className="h-5 w-5" />} />
          <MetricCard title="失败任务" value={tasks.filter((task) => task.status === 'failed').length.toLocaleString()} detail="取数、样本校验或密态计算失败均会留痕。" icon={<AlertTriangle className="h-5 w-5" />} />
        </div>

        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_auto]"><label className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3"><Search className="h-4 w-4 text-[var(--text-muted)]" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none" placeholder="搜索任务、资源字段或算法" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem]"><option value="全部">全部状态</option><option value="running">运行中</option><option value="completed">已完成</option><option value="failed">失败</option></select><Button variant="secondary" onClick={() => { setKeyword(''); setStatusFilter('全部') }}><RefreshCw className="mr-2 h-4 w-4" />重置筛选</Button></div>
          {error ? <div className="mt-3 rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
        </section>

        <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-left text-[0.8125rem]">
              <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]"><tr>{['任务编号', '任务名称', '量测字段', '算法', '操作', '样本数', '状态', '进度', '查看'].map((label) => <th key={label} className="border-b border-[var(--line)] px-4 py-3 font-medium">{label}</th>)}</tr></thead>
              <tbody>{filteredTasks.map((task) => <tr key={task.id} className="border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-muted)]"><td className="whitespace-nowrap px-4 py-3.5 font-medium text-[var(--text-main)]">{formatConfidentialTaskCode(task.code)}</td><td className="max-w-[280px] px-4 py-3.5"><button type="button" className="block max-w-full truncate text-left font-semibold text-[var(--primary)]" onClick={() => setSelectedTask(task)}>{task.name}</button><div className="mt-1 truncate text-[0.72rem] text-[var(--text-muted)]">{task.scenario}</div></td><td className="px-4 py-3.5 text-[var(--text-secondary)]">{task.fieldCode || '-'}</td><td className="px-4 py-3.5 font-semibold text-[var(--text-main)]">{formatOpenFheAlgorithm(task.algorithm)}</td><td className="px-4 py-3.5 text-[var(--text-secondary)]">{operationLabel(task.operation)}</td><td className="px-4 py-3.5 text-[var(--text-secondary)]">{task.sampleCount.toLocaleString()}</td><td className="px-4 py-3.5"><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(task.status))}>{task.statusLabel}</span></td><td className="min-w-28 px-4 py-3.5"><span className="block h-2 rounded-full bg-[var(--surface-muted)]"><span className="block h-2 rounded-full bg-[var(--primary)]" style={{ width: `${task.progress}%` }} /></span><span className="mt-1 block text-[0.72rem] text-[var(--text-muted)]">{task.progress}%</span></td><td className="px-4 py-3.5"><button type="button" title="查看任务" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:text-[var(--primary)]" onClick={() => setSelectedTask(task)}><FileSearch className="h-4 w-4" /></button></td></tr>)}</tbody>
            </table>
          </div>
          {isLoading ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在读取自动密态任务...</div> : null}
          {!isLoading && filteredTasks.length === 0 ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">暂无资源 API 触发的同态计算任务</div> : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">{[
          { title: '策略命中', detail: '调用数据资源 API 时完成主体、范围和密态输出策略校验。', icon: ShieldCheck },
          { title: '服务端取数', detail: '按字段、时间、区域和组织范围读取资源真实数据。', icon: DatabaseZap },
          { title: '密文计算', detail: '原始数值只存在于服务端内存，任务仅归档范围、样本数和结果摘要。', icon: LockKeyhole },
        ].map((item) => <div key={item.title} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]"><item.icon className="h-5 w-5" /></div><div className="font-semibold text-[var(--text-main)]">{item.title}</div></div><div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{item.detail}</div></div>)}</section>
      </div>
      <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />
    </>
  )
}
