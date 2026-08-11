import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui'
import {
  loadSecurityEngineLogs,
  type SecurityEngineLog,
  type SecurityEngineLogStatus,
} from '../lib/security-engine-logs'
import { toErrorMessage } from '../lib/nocobase-client'
import { selectImportantFieldEntries } from '../lib/security-log-display'
import { cn } from '../lib/utils'

const statusOptions: Array<{ value: 'all' | SecurityEngineLogStatus; label: string }> = [
  { value: 'all', label: '全部结果' },
  { value: 'failed', label: '拒绝/异常' },
  { value: 'warning', label: '有风险' },
  { value: 'success', label: '放行' },
]

function formatTime(value: string) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 19).replace('T', ' ')
  return parsed.toLocaleString('zh-CN', { hour12: false })
}

function statusLabel(status: SecurityEngineLogStatus) {
  if (status === 'failed') return '拒绝/异常'
  if (status === 'warning') return '有风险'
  return '放行'
}

function statusTone(status: SecurityEngineLogStatus) {
  if (status === 'failed') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  if (status === 'warning') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
}

function traceLabel(step: { name: string; status: string; outcome: string }) {
  if (step.outcome && step.outcome !== '-') return step.outcome
  const labels: Record<string, string> = {
    completed: '已完成',
    matched: '已命中',
    passed: '通过',
    failed: '不通过',
    blocked: '已阻断',
    audit_recorded: '已记录',
    not_evaluated: '未执行',
    not_matched: '未命中',
  }
  return labels[step.status] || step.status
}

function traceDetail(step: SecurityEngineLog['trace'][number]) {
  if (step.name === '分类分级') {
    const protection = step.protectionLevel ? ({ l1: 'L1（聚合）', l2: 'L2（明细受控）', l3: 'L3（仅密态）' } as Record<string, string>)[step.protectionLevel.toLowerCase()] || step.protectionLevel : ''
    const sensitivity = step.sensitivity ? ({ public: '公开', internal: '内部', sensitive: '敏感', important: '重要', core: '核心' } as Record<string, string>)[step.sensitivity.toLowerCase()] || step.sensitivity : ''
    return [protection ? `防护层：${protection}` : '', sensitivity ? `敏感度：${sensitivity}` : ''].filter(Boolean).join('；')
  }
  if (step.name === '动态策略') {
    return [
      step.policyCode ? `命中策略：${step.policyCode}${step.policyVersion ? `（v${step.policyVersion}）` : ''}` : '未匹配到具体策略',
      step.outputMode ? `输出模式：${step.outputMode}` : '',
    ].filter(Boolean).join('；')
  }
  return ''
}

function LabelHierarchy({ log }: { log: SecurityEngineLog }) {
  if (!log.labelGroups.length) return null
  return (
    <ul className="mt-1 space-y-0.5 pl-3 text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
      {log.labelGroups.map((group) => (
        <li key={group.name}>
          <div className="font-medium text-[var(--text-main)]">{group.name}</div>
          <ul className="ml-2 border-l border-[var(--line)] pl-3">
            {group.labels.map((label) => <li key={label} className="relative pl-2 before:absolute before:left-[-0.8125rem] before:top-1/2 before:h-px before:w-2 before:bg-[var(--line)]">{label}</li>)}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function traceStep(log: SecurityEngineLog, name: string) {
  return log.trace.find((step) => step.name === name)
}

function stageTone(step: SecurityEngineLog['trace'][number] | undefined) {
  if (!step) return 'text-[var(--text-muted)]'
  if (step.status === 'failed' || step.status === 'blocked' || step.outcome === 'DENY') return 'text-[var(--status-danger-text)]'
  if (step.status === 'not_evaluated' || step.status === 'not_matched') return 'text-[var(--text-muted)]'
  return 'text-[var(--status-success-text)]'
}

function StageCell({ log, name }: { log: SecurityEngineLog; name: string }) {
  const step = traceStep(log, name)
  if (!step) return <span className="text-[var(--text-muted)]">-</span>
  const hideStatus = name === '标签补全' || name === '分类分级'
  return (
    <div className="min-w-[150px] max-w-[240px] text-[0.72rem] leading-5">
      {name === '标签补全' ? <LabelHierarchy log={log} /> : <>{hideStatus ? null : <div className={cn('font-medium', stageTone(step))}>{traceLabel(step)}</div>}{traceDetail(step) ? <div className="text-[var(--text-secondary)]">{traceDetail(step)}</div> : null}</>}
      {name === '安全动作执行' && step.outputMode ? <div className="text-[var(--text-secondary)]">输出方式：{step.outputMode}</div> : null}
    </div>
  )
}

function ImportantFieldsCell({ log }: { log: SecurityEngineLog }) {
  const step = traceStep(log, '标签补全')
  if (!step?.fieldTags.length) return <span className="text-[var(--text-muted)]">-</span>
  return <div className="min-w-[150px] max-w-[220px] space-y-0.5 text-[0.72rem] leading-5 text-[var(--text-secondary)]">{selectImportantFieldEntries(step.fieldTags).map((field) => <div key={field}>{field}</div>)}</div>
}

const policyResultLabels: Record<string, string> = {
  passed: '通过',
  not_matched: '未命中',
  failed: '不通过',
  blocked: '阻断',
  unknown: '未知',
}

function PolicyEvaluationCell({ log }: { log: SecurityEngineLog }) {
  if (!log.policyEvaluations.length) return <span className="text-[var(--text-muted)]">-</span>
  return (
    <div className="min-w-[220px] max-w-[320px] space-y-0.5 text-[0.72rem] leading-5">
      {log.policyEvaluations.map((item) => {
        const result = policyResultLabels[item.result] || item.result
        const tone = item.result === 'passed' ? 'text-[var(--status-success-text)]' : item.result === 'not_matched' ? 'text-[var(--text-muted)]' : 'text-[var(--status-danger-text)]'
        return <div key={`${item.policyCode}-${item.result}-${item.reason}`}><span className={cn('font-medium', tone)}>{item.policyCode}：{result}</span>{item.reason ? <span className="text-[var(--text-secondary)]">（{item.reason}）</span> : null}</div>
      })}
    </div>
  )
}

function AccessSummaryCell({ log }: { log: SecurityEngineLog }) {
  return (
    <div className="min-w-[150px] space-y-1.5 text-[0.72rem] leading-5">
      <div className="whitespace-nowrap text-[var(--text-secondary)]">{formatTime(log.time)}</div>
      <div><span className={cn('inline-flex rounded-full border px-2 py-0.5', statusTone(log.status))}>{statusLabel(log.status)}</span></div>
      <div className="text-[var(--text-secondary)]">风险：{log.riskScore}</div>
      <div className="text-[var(--text-muted)]">耗时：{log.durationMs == null ? '-' : `${log.durationMs} ms`}</div>
    </div>
  )
}

function Trace({ log }: { log: SecurityEngineLog }) {
  if (!log.trace.length && !log.policyEvaluations.length) return <span className="text-[var(--text-muted)]">旧日志无完整版轨迹</span>
  return (
    <div className="min-w-[520px] space-y-1.5">
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {log.trace.map((step) => (
          <div key={step.name} className="min-w-[180px] text-[0.72rem]">
            <span className={cn(
              'whitespace-nowrap',
            step.status === 'failed' || step.status === 'blocked' || step.outcome === 'DENY'
              ? 'text-[var(--status-danger-text)]'
              : step.status === 'not_evaluated' || step.status === 'not_matched'
                ? 'text-[var(--text-muted)]'
                : 'text-[var(--status-success-text)]',
            )}>{step.name}：{traceLabel(step)}</span>
            {traceDetail(step) ? <div className="mt-0.5 whitespace-normal leading-5 text-[var(--text-secondary)]">{traceDetail(step)}</div> : null}
            {step.name === '标签补全' ? <LabelHierarchy log={log} /> : null}
          </div>
        ))}
      </div>
      {log.policyEvaluations.length ? <div className="text-[0.6875rem] leading-5 text-[var(--text-secondary)]">策略评估：{log.policyEvaluations.map((item) => `${item.policyCode}=${item.result}${item.reason ? `（${item.reason}）` : ''}`).join('；')}</div> : null}
    </div>
  )
}

function LogCard({ log }: { log: SecurityEngineLog }) {
  return (
    <article className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-muted)] text-[var(--primary)]"><ShieldCheck className="h-4 w-4" /></div>
          <div className="min-w-0"><div className="truncate text-[0.875rem] font-semibold text-[var(--text-main)]">{log.title}</div><div className="mt-1 text-[0.72rem] text-[var(--text-muted)]">{log.requestId}</div></div>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[0.72rem]', statusTone(log.status))}>{statusLabel(log.status)}</span>
      </div>
      <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{log.message}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-[8px] bg-[var(--surface-muted)] p-3 text-[0.72rem] text-[var(--text-muted)]">
        <div>数据源：{log.dataSource}</div><div>数据应用：{log.subject}</div>
        <div>数据资源：{log.dataResource}</div><div>API：{log.api}</div>
        <div>时间：{formatTime(log.time)}</div><div>耗时：{log.durationMs == null ? '-' : `${log.durationMs} ms`}</div>
      </div>
      <div className="mt-3"><div className="mb-1 text-[0.72rem] text-[var(--text-muted)]">访问过程</div><Trace log={log} /></div>
    </article>
  )
}

export function SecurityEngineLogCenterPage() {
  const [logs, setLogs] = useState<SecurityEngineLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [subject, setSubject] = useState('')
  const [resource, setResource] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'all' | SecurityEngineLogStatus>('all')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setLogs(await loadSecurityEngineLogs()) } catch (currentError) { setError(toErrorMessage(currentError, '完整版访问日志读取失败')) } finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const filteredLogs = useMemo(() => {
    const match = (value: string, query: string) => !query.trim() || value.toLowerCase().includes(query.trim().toLowerCase())
    return logs.filter((log) => (
      (status === 'all' || status === log.status)
      && match(log.dataSource, source)
      && match(log.subject, subject)
      && match(log.dataResource, resource)
      && match([log.code, log.message, log.api, log.requestId].join(' '), keyword)
    ))
  }, [keyword, logs, resource, source, status, subject])

  const deniedCount = logs.filter((log) => log.status === 'failed').length
  const riskCount = logs.filter((log) => log.status === 'warning').length
  const durations = logs.flatMap((log) => log.durationMs == null ? [] : [log.durationMs])
  const averageDuration = durations.length ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length) : null

  return (
    <div className="space-y-5">
      <section className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(135deg,var(--surface-raised),var(--surface-muted))] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-[1.125rem] font-semibold text-[var(--text-main)]">完整版访问日志</h1><p className="mt-1 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">每次数据 API 访问只保留一条完整记录，展示数据源、资源、应用和五阶段管控过程。</p></div><div className="flex items-center gap-2"><div className="rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1.5 text-[0.75rem] text-[var(--text-secondary)]">统一访问日志</div><Button variant="secondary" className="gap-2" onClick={() => void refresh()}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />刷新日志</Button></div></div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4"><div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-[var(--primary)]" /><div><div className="text-[0.75rem] text-[var(--text-muted)]">日志总数</div><div className="mt-1 text-[1.4rem] font-semibold text-[var(--text-main)]">{logs.length.toLocaleString()}</div></div></div><div className="mt-3 text-[0.75rem] text-[var(--text-secondary)]">每次 API 访问一条</div></div>
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4"><div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-[var(--status-danger-text)]" /><div><div className="text-[0.75rem] text-[var(--text-muted)]">拒绝/异常</div><div className="mt-1 text-[1.4rem] font-semibold text-[var(--text-main)]">{deniedCount.toLocaleString()}</div></div></div><div className="mt-3 text-[0.75rem] text-[var(--text-secondary)]">未放行访问</div></div>
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[var(--status-warning-text)]" /><div><div className="text-[0.75rem] text-[var(--text-muted)]">有风险</div><div className="mt-1 text-[1.4rem] font-semibold text-[var(--text-main)]">{riskCount.toLocaleString()}</div></div></div><div className="mt-3 text-[0.75rem] text-[var(--text-secondary)]">放行但有风险因子</div></div>
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-[var(--status-success-text)]" /><div><div className="text-[0.75rem] text-[var(--text-muted)]">平均耗时</div><div className="mt-1 text-[1.4rem] font-semibold text-[var(--text-main)]">{averageDuration == null ? '-' : `${averageDuration} ms`}</div></div></div><div className="mt-3 text-[0.75rem] text-[var(--text-secondary)]">按访问记录计算</div></div>
      </div>
      <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4"><div className="grid gap-3 xl:grid-cols-[repeat(3,minmax(180px,1fr))_minmax(240px,1fr)_150px_auto]"><label className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3"><Search className="h-4 w-4 text-[var(--text-muted)]" /><input value={source} onChange={(event) => setSource(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none" placeholder="按数据源查询" /></label><label className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3"><Search className="h-4 w-4 text-[var(--text-muted)]" /><input value={subject} onChange={(event) => setSubject(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none" placeholder="按数据应用查询" /></label><label className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3"><Search className="h-4 w-4 text-[var(--text-muted)]" /><input value={resource} onChange={(event) => setResource(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none" placeholder="按数据资源查询" /></label><label className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3"><Search className="h-4 w-4 text-[var(--text-muted)]" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none" placeholder="搜索请求编号、API或原因" /></label><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-main)]">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><Button variant="secondary" onClick={() => { setSource(''); setSubject(''); setResource(''); setKeyword(''); setStatus('all') }}>重置筛选</Button></div>{error ? <div className="mt-3 rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}</section>
      <div className="grid gap-3 md:hidden">{filteredLogs.map((log) => <LogCard key={log.id} log={log} />)}</div>
      <section className="hidden overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] md:block"><div className="overflow-x-auto"><table className="w-full min-w-[2180px] border-collapse text-left text-[0.8125rem]"><thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]"><tr>{['访问概要', '数据源 / 数据资源', '数据应用 / API', '重要字段', '标签补全', '分类分级', '动态策略', '安全动作', '策略评估', '请求编号'].map((label) => <th key={label} className="border-b border-[var(--line)] px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{filteredLogs.map((log) => <tr key={log.id} className="border-b border-[var(--line)] align-top last:border-b-0 hover:bg-[var(--surface-muted)]"><td className="px-4 py-3.5"><AccessSummaryCell log={log} /></td><td className="max-w-[260px] px-4 py-3.5 text-[var(--text-secondary)]"><div className="font-medium">{log.dataSource}</div><div className="mt-1 text-[var(--text-muted)]">{log.dataResource}</div></td><td className="max-w-[260px] px-4 py-3.5 text-[var(--text-secondary)]"><div className="font-medium">{log.subject}</div><div className="mt-1 text-[var(--text-muted)]">{log.api}</div></td><td className="px-4 py-3.5"><ImportantFieldsCell log={log} /></td><td className="px-4 py-3.5"><StageCell log={log} name="标签补全" /></td><td className="px-4 py-3.5"><StageCell log={log} name="分类分级" /></td><td className="px-4 py-3.5"><StageCell log={log} name="动态策略" /></td><td className="px-4 py-3.5"><StageCell log={log} name="安全动作执行" /></td><td className="px-4 py-3.5"><PolicyEvaluationCell log={log} /></td><td className="max-w-[220px] truncate px-4 py-3.5 text-[var(--text-muted)]">{log.requestId || '-'}</td></tr>)}</tbody></table></div></section>
      {loading ? <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在读取完整版访问日志...</div> : null}
      {!loading && !filteredLogs.length && !error ? <div className="rounded-[8px] border border-dashed border-[var(--line)] bg-[var(--surface-raised)] px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">当前查询条件下没有访问日志</div> : null}
    </div>
  )
}
