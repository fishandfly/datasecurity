import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileSearch,
  KeyRound,
  LockKeyhole,
  Network,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '../components/ui'
import { HomomorphicSecondaryTabs } from '../components/security-homomorphic-tabs'
import {
  createConfidentialTask,
  executeOpenFheTask,
  formatConfidentialTaskCode,
  formatOpenFheAlgorithm,
  saveOpenFheEngineConfig,
  sanitizeVisibleRuntimeText,
  testOpenFheConnection,
  useConfidentialTasks,
  useOpenFheEngineConfig,
  type ConfidentialTaskRecord,
  type EditableConfidentialTask,
  type OpenFheAlgorithm,
  type OpenFheEngineConfig,
  type OpenFheOperation,
  type SecurityRiskLevel,
} from '../lib/nocobase-security-runtime'
import { toErrorMessage } from '../lib/nocobase-client'
import { usePortalContext } from '../lib/portal-context'
import { cn } from '../lib/utils'

const inputClassName = 'h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)]'

function buildTasks(tasks: ConfidentialTaskRecord[]) {
  return tasks.filter((task) => task.algorithm === 'BFV' || task.algorithm === 'CKKS')
}

function statusTone(status: ConfidentialTaskRecord['status']) {
  if (status === 'running') return 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
  if (status === 'approved') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (status === 'pending_approval') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  if (status === 'completed') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (status === 'failed') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  return 'border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-muted)]'
}

function riskTone(risk: SecurityRiskLevel) {
  if (risk === 'high') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  if (risk === 'medium') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
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

function TaskDrawer({ task, onClose, onExecute, executing }: { task: ConfidentialTaskRecord | null; onClose: () => void; onExecute: (task: ConfidentialTaskRecord) => void; executing: boolean }) {
  if (!task) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-dvh max-h-dvh w-full max-w-[680px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-strong)]">
        <div className="flex items-start justify-between border-b border-[var(--line)] px-6 py-4">
          <div><div className="text-[0.75rem] text-[var(--text-muted)]">同态加密任务</div><h2 className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{task.name}</h2><div className="mt-2 flex gap-2"><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(task.status))}>{task.statusLabel}</span><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', riskTone(task.risk))}>{task.riskLabel}风险</span></div></div>
          <button type="button" aria-label="关闭" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="grid gap-3 sm:grid-cols-2">
            {[
              ['业务场景', task.scenario],
              ['算法类型', formatOpenFheAlgorithm(task.algorithm)],
              ['源安全域', task.sourceDomain],
              ['目标安全域', task.targetDomain],
              ['参与资源', `${task.resourceIds.length} 个`],
              ['计算操作', task.computeRequest?.operation === 'mean' ? '均值' : task.computeRequest?.operation === 'sum' ? '求和' : '未配置'],
              ['计算值数量', task.computeRequest ? `${task.computeRequest.values.length} 个` : '未配置'],
              ['责任人', task.ownerName || '未指定'],
            ].map(([label, value]) => <div key={label} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3"><div className="text-[0.75rem] text-[var(--text-muted)]">{label}</div><div className="mt-1 text-[0.875rem] font-medium text-[var(--text-main)]">{value}</div></div>)}
          </section>

          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">算法口径</h3>
            <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
              {task.algorithm === 'BFV'
                ? '整数精确型算法用于整数量测值的精确加法、计数和聚合，不展示明文中间值。'
                : '浮点近似型算法用于浮点量测值的近似统计和分析，结果包含可控数值误差。'}
            </div>
          </section>

          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">执行日志</h3>
            <div className="mt-3 grid gap-2">
              {task.logs.map((log) => <div key={log.id} className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-[0.8125rem]"><div className="flex items-center justify-between gap-3"><span className="font-medium text-[var(--text-main)]">{log.message}</span><span className="shrink-0 text-[0.72rem] text-[var(--text-muted)]">{log.time ? log.time.slice(0, 19).replace('T', ' ') : '-'}</span></div>{log.requestId ? <div className="mt-1 text-[0.72rem] text-[var(--text-muted)]">请求编号：{log.requestId}</div> : null}</div>)}
              {task.logs.length === 0 ? <div className="rounded-[8px] border border-dashed border-[var(--line)] px-3 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]">尚无真实执行日志</div> : null}
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] px-6 py-4"><Button variant="secondary" onClick={onClose}>关闭</Button><Button className="gap-2" disabled={executing || task.status === 'pending_approval' || task.status === 'running' || task.status === 'completed'} onClick={() => onExecute(task)}><PlayCircle className="h-4 w-4" />{executing ? '正在执行...' : task.status === 'pending_approval' ? '等待审批' : '执行任务'}</Button></div>
      </aside>
    </div>
  )
}

function TaskCreateDrawer({ open, resources, onClose, onSaved }: { open: boolean; resources: Array<{ id: string; name: string; department: string }>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<EditableConfidentialTask>({ name: '', scenario: '', algorithm: 'BFV', sourceDomain: '', targetDomain: '', ownerUserId: '', risk: 'medium', resourceIds: [], tags: [], computeRequest: { operation: 'sum', values: [] } })
  const [valuesText, setValuesText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm({ name: '', scenario: '', algorithm: 'BFV', sourceDomain: '', targetDomain: '', ownerUserId: '', risk: 'medium', resourceIds: [], tags: ['同态加密'], computeRequest: { operation: 'sum', values: [] } })
      setValuesText('')
    }
  }, [open])

  if (!open) return null
  const submit = async () => {
    setIsSaving(true)
    setError('')
    try {
      const tokens = valuesText.split(/[\s,，;；]+/).map((item) => item.trim()).filter(Boolean)
      const values = tokens.map((item) => Number(item))
      if (tokens.length === 0) throw new Error('请填写同态计算数值')
      if (values.some((value) => !Number.isFinite(value))) throw new Error('同态计算值格式不正确')
      await createConfidentialTask({ ...form, computeRequest: { ...form.computeRequest, values } })
      await onSaved()
      onClose()
    } catch (caught) {
      setError(toErrorMessage(caught, '同态加密任务创建失败'))
    } finally {
      setIsSaving(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/30" onClick={onClose} /><aside className="absolute right-0 top-0 flex h-dvh max-h-dvh w-full max-w-[620px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-strong)]">
      <div className="flex items-start justify-between border-b border-[var(--line)] px-6 py-4"><div><div className="text-[0.75rem] text-[var(--text-muted)]">新建同态加密任务</div><h2 className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">同态加密任务定义</h2></div><button type="button" aria-label="关闭" className="rounded-[8px] p-2" onClick={onClose}><X className="h-5 w-5" /></button></div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <section className="space-y-3"><h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">基本信息</h3><label className="block space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>任务名称</span><input className={inputClassName} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label className="block space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>业务场景</span><textarea className="min-h-20 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[0.875rem] outline-none" value={form.scenario} onChange={(event) => setForm((current) => ({ ...current, scenario: event.target.value }))} /></label></section>
        <section className="space-y-3"><h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">算法类型</h3><div className="grid gap-3 sm:grid-cols-2">{(['BFV', 'CKKS'] as OpenFheAlgorithm[]).map((algorithm) => <button key={algorithm} type="button" className={cn('rounded-[8px] border p-4 text-left', form.algorithm === algorithm ? 'border-[var(--primary)] bg-[var(--status-info-bg)]' : 'border-[var(--line)] bg-[var(--surface-raised)]')} onClick={() => setForm((current) => ({ ...current, algorithm }))}><div className="font-semibold text-[var(--text-main)]">{formatOpenFheAlgorithm(algorithm)}</div><div className="mt-1 text-[0.75rem] leading-5 text-[var(--text-secondary)]">{algorithm === 'BFV' ? '整数精确计算' : '浮点近似计算'}</div></button>)}</div></section>
        <section className="space-y-3"><h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">计算口径</h3><div className="grid grid-cols-2 overflow-hidden rounded-[8px] border border-[var(--line)]">{([['sum', '求和'], ['mean', '均值']] as Array<[OpenFheOperation, string]>).map(([operation, label]) => <button key={operation} type="button" className={cn('h-10 text-[0.875rem] font-medium', form.computeRequest.operation === operation ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]')} onClick={() => setForm((current) => ({ ...current, computeRequest: { ...current.computeRequest, operation } }))}>{label}</button>)}</div><label className="block space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>计算值</span><textarea className="min-h-24 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[0.875rem] outline-none focus:border-[var(--primary)]" value={valuesText} onChange={(event) => setValuesText(event.target.value)} placeholder={form.algorithm === 'BFV' ? '128, 256, 384' : '31.25, 32.50, 33.75'} /></label></section>
        <section className="space-y-3"><h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">资源与安全域</h3><label className="block space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>量测数据资源</span><select multiple className="min-h-32 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[0.875rem]" value={form.resourceIds} onChange={(event) => setForm((current) => ({ ...current, resourceIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} · {resource.department}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>源安全域</span><input className={inputClassName} value={form.sourceDomain} onChange={(event) => setForm((current) => ({ ...current, sourceDomain: event.target.value }))} /></label><label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>目标安全域</span><input className={inputClassName} value={form.targetDomain} onChange={(event) => setForm((current) => ({ ...current, targetDomain: event.target.value }))} /></label></div></section>
        {error ? <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--line)] px-6 py-4"><Button variant="secondary" onClick={onClose}>取消</Button><Button disabled={isSaving} onClick={() => void submit()}>{isSaving ? '正在创建...' : '创建待审批任务'}</Button></div>
    </aside></div>
  )
}

function EngineConnectionDrawer({ open, config, onClose, onSaved }: { open: boolean; config: OpenFheEngineConfig; onClose: () => void; onSaved: (config: OpenFheEngineConfig) => Promise<void> }) {
  const [form, setForm] = useState(config)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => { setForm(config) }, [config])
  useEffect(() => { if (open) { setNotice(''); setFailed(false) } }, [open])
  if (!open) return null

  const test = async () => {
    setIsTesting(true); setNotice(''); setFailed(false)
    try {
      const health = await testOpenFheConnection(form)
      setNotice(`同态加密引擎连接正常，密态算法能力可用，延迟 ${health.latencyMs}ms。`)
    } catch (caught) {
      setFailed(true); setNotice(toErrorMessage(caught, '同态加密引擎连接失败'))
    } finally { setIsTesting(false) }
  }
  const save = async () => {
    setIsSaving(true); setNotice(''); setFailed(false)
    try { const saved = await saveOpenFheEngineConfig(form); await onSaved(saved); setNotice('配置已写入后台配置中心。') } catch (caught) { setFailed(true); setNotice(toErrorMessage(caught, '配置保存失败')) } finally { setIsSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/30" onClick={onClose} /><aside className="absolute right-0 top-0 flex h-dvh max-h-dvh w-full max-w-[620px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-strong)]">
      <div className="flex items-start justify-between border-b border-[var(--line)] px-6 py-4"><div><div className="text-[0.75rem] text-[var(--text-muted)]">加密引擎配置</div><h2 className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">同态加密引擎连接信息</h2><p className="mt-2 text-[0.8125rem] text-[var(--text-secondary)]">本项目仅启用整数精确型和浮点近似型两类算法。</p></div><button type="button" aria-label="关闭" className="rounded-[8px] p-2" onClick={onClose}><X className="h-5 w-5" /></button></div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <section className="space-y-3"><h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">基础连接</h3><label className="block space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>引擎名称</span><input className={inputClassName} value={form.engineName} onChange={(event) => setForm((current) => ({ ...current, engineName: event.target.value }))} /></label><label className="block space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>服务地址</span><input className={inputClassName} value={form.endpoint} onChange={(event) => setForm((current) => ({ ...current, endpoint: event.target.value }))} placeholder="/homomorphic-engine-api" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>认证方式</span><select className={inputClassName} value={form.authMode} onChange={(event) => setForm((current) => ({ ...current, authMode: event.target.value as OpenFheEngineConfig['authMode'] }))}><option value="mTLS">双向证书</option><option value="token">令牌</option><option value="none">无认证</option></select></label><label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>超时时间（秒）</span><input type="number" min="1" className={inputClassName} value={form.timeoutSeconds} onChange={(event) => setForm((current) => ({ ...current, timeoutSeconds: Number(event.target.value) }))} /></label></div><label className="block space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>凭据引用</span><input className={inputClassName} value={form.secretRef} onChange={(event) => setForm((current) => ({ ...current, secretRef: event.target.value }))} /></label></section>
        <section className="space-y-3"><h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">算法能力</h3><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-[8px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-4"><div className="font-semibold text-[var(--status-success-text)]">整数精确型</div><div className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">整数精确同态计算</div></div><div className="rounded-[8px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] p-4"><div className="font-semibold text-[var(--status-info-text)]">浮点近似型</div><div className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">浮点近似同态计算</div></div></div></section>
        <label className="flex items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-[0.875rem] text-[var(--text-secondary)]"><span>启用该同态加密引擎</span><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} /></label>
        {notice ? <div className={cn('rounded-[8px] border px-4 py-3 text-[0.8125rem]', failed ? 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]' : 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]')}>{notice}</div> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--line)] px-6 py-4"><Button variant="secondary" onClick={onClose}>取消</Button><Button variant="secondary" className="gap-2" disabled={isTesting} onClick={() => void test()}><RefreshCw className="h-4 w-4" />{isTesting ? '检查中...' : '测试连接'}</Button><Button disabled={isSaving} onClick={() => void save()}>{isSaving ? '保存中...' : '保存配置'}</Button></div>
    </aside></div>
  )
}

export function SecurityConfidentialComputingPage() {
  const { data: tasksData, isLoading, error, refresh } = useConfidentialTasks(true)
  const { data: engineConfig, setData: setEngineConfig, error: configError, refresh: refreshConfig } = useOpenFheEngineConfig(true)
  const { data: { catalogItems } } = usePortalContext()
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'全部' | ConfidentialTaskRecord['status']>('全部')
  const [selectedTask, setSelectedTask] = useState<ConfidentialTaskRecord | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [engineDrawerOpen, setEngineDrawerOpen] = useState(false)
  const [executingId, setExecutingId] = useState('')
  const [notice, setNotice] = useState('')

  const tasks = useMemo(() => buildTasks(tasksData), [tasksData])
  const filteredTasks = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    return tasks.filter((task) => statusFilter === '全部' || task.status === statusFilter).filter((task) => !normalized || [task.code, task.name, task.scenario, task.algorithm, task.sourceDomain, task.targetDomain].some((value) => value.toLowerCase().includes(normalized)))
  }, [keyword, statusFilter, tasks])
  const execute = async (task: ConfidentialTaskRecord) => {
    if (task.status === 'pending_approval') {
      setNotice(`${task.name} 尚未审批，不会调用同态加密引擎。`)
      return
    }
    if (task.status === 'running' || task.status === 'completed') return
    setExecutingId(task.id); setNotice('')
    try { await executeOpenFheTask(task, engineConfig); setNotice(`${task.name} 已由同态加密引擎执行完成。`) } catch (caught) { setNotice(sanitizeVisibleRuntimeText(toErrorMessage(caught, '同态加密任务执行失败'))) } finally { setExecutingId(''); await refresh(); setSelectedTask(null) }
  }

  return (
    <>
      <div className="space-y-5">
        <HomomorphicSecondaryTabs actions={<><Button className="gap-2" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />新建同态任务</Button><Button variant="secondary" className="gap-2" onClick={() => setEngineDrawerOpen(true)}><SlidersHorizontal className="h-4 w-4" />加密引擎配置</Button><Button variant="secondary" className="gap-2" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />同步执行状态</Button></>} />

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard title="运行中任务" value={tasks.filter((task) => task.status === 'running').length.toLocaleString()} detail="来自后台任务状态。" icon={<Activity className="h-5 w-5" />} />
          <MetricCard title="待审批任务" value={tasks.filter((task) => task.status === 'pending_approval').length.toLocaleString()} detail="未审批任务不会调用同态加密引擎。" icon={<ShieldCheck className="h-5 w-5" />} />
          <MetricCard title="已完成任务" value={tasks.filter((task) => task.status === 'completed').length.toLocaleString()} detail="仅统计同态加密引擎成功返回的任务。" icon={<CheckCircle2 className="h-5 w-5" />} />
          <MetricCard title="同态加密引擎" value={engineConfig.enabled ? '已启用' : '未启用'} detail="限定两类密态算法，连接状态需通过健康检查确认。" icon={<KeyRound className="h-5 w-5" />} />
        </div>

        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]"><div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_auto]"><label className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3"><Search className="h-4 w-4 text-[var(--text-muted)]" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none" placeholder="搜索任务、算法或安全域" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem]"><option value="全部">全部状态</option><option value="pending_approval">待审批</option><option value="approved">已审批</option><option value="running">运行中</option><option value="completed">已完成</option><option value="failed">失败</option><option value="paused">已暂停</option></select><Button variant="secondary" onClick={() => { setKeyword(''); setStatusFilter('全部') }}><RefreshCw className="mr-2 h-4 w-4" />重置筛选</Button></div>{notice ? <div className="mt-3 rounded-[8px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-info-text)]">{notice}</div> : null}{error || configError ? <div className="mt-3 rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error || configError}</div> : null}</section>

        <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]"><div className="grid grid-cols-[150px_minmax(240px,1.4fr)_100px_110px_150px_150px_120px_120px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]"><span>任务编号</span><span>任务名称</span><span>算法</span><span>状态</span><span>安全域</span><span>资源</span><span>进度</span><span>操作</span></div><div className="overflow-x-auto">{filteredTasks.map((task) => <div key={task.id} className="grid min-w-[1180px] grid-cols-[150px_minmax(240px,1.4fr)_100px_110px_150px_150px_120px_120px] gap-3 border-b border-[var(--line)] px-4 py-4 text-[0.8125rem] last:border-b-0"><span className="font-medium text-[var(--text-main)]">{formatConfidentialTaskCode(task.code)}</span><button type="button" className="min-w-0 text-left" onClick={() => setSelectedTask(task)}><span className="block truncate font-semibold text-[var(--primary)]">{task.name}</span><span className="mt-1 block truncate text-[0.75rem] text-[var(--text-muted)]">{task.scenario}</span></button><span className="font-semibold text-[var(--text-main)]">{formatOpenFheAlgorithm(task.algorithm)}</span><span><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(task.status))}>{task.statusLabel}</span></span><span className="truncate text-[var(--text-secondary)]">{task.sourceDomain} → {task.targetDomain}</span><span className="text-[var(--text-secondary)]">{task.resourceIds.length} 个量测资源</span><span><span className="block h-2 rounded-full bg-[var(--surface-muted)]"><span className="block h-2 rounded-full bg-[var(--primary)]" style={{ width: `${task.progress}%` }} /></span><span className="mt-1 block text-[0.72rem] text-[var(--text-muted)]">{task.progress}%</span></span><span className="flex gap-1"><button type="button" title={task.status === 'pending_approval' ? '等待审批' : '执行'} className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:text-[var(--primary)]" disabled={executingId === task.id || task.status === 'pending_approval' || task.status === 'running' || task.status === 'completed'} onClick={() => void execute(task)}><PlayCircle className="h-4 w-4" /></button><button type="button" title="查看" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:text-[var(--primary)]" onClick={() => setSelectedTask(task)}><FileSearch className="h-4 w-4" /></button></span></div>)}{!isLoading && filteredTasks.length === 0 ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">后台暂无同态加密任务。</div> : null}</div></section>

        <section className="grid gap-4 lg:grid-cols-3">{[
          { title: '任务定义', detail: '选择量测资源、算法类型和源/目标安全域。', icon: Network },
          { title: '密文计算执行', detail: '调用同态加密引擎，中间节点不接触原始明文。', icon: LockKeyhole },
          { title: '结果密文回传', detail: '仅归档引擎返回的结果摘要和真实执行日志。', icon: Clock3 },
        ].map((item) => <div key={item.title} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]"><item.icon className="h-5 w-5" /></div><div className="font-semibold text-[var(--text-main)]">{item.title}</div></div><div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{item.detail}</div></div>)}</section>
      </div>

      <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} onExecute={(task) => void execute(task)} executing={Boolean(selectedTask && executingId === selectedTask.id)} />
      <TaskCreateDrawer open={createOpen} resources={catalogItems.map((item) => ({ id: item.id, name: item.name, department: item.department }))} onClose={() => setCreateOpen(false)} onSaved={async () => { await refresh() }} />
      <EngineConnectionDrawer open={engineDrawerOpen} config={engineConfig} onClose={() => setEngineDrawerOpen(false)} onSaved={async (config) => { setEngineConfig(config); await refreshConfig() }} />
    </>
  )
}
