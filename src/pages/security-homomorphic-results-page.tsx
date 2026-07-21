import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import { HomomorphicSecondaryTabs } from '../components/security-homomorphic-tabs'
import { Button } from '../components/ui'
import { formatConfidentialTaskCode, formatOpenFheAlgorithm, useConfidentialTasks } from '../lib/nocobase-security-runtime'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function displayNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('zh-CN', { maximumFractionDigits: 10 }) : '-'
}

export function SecurityHomomorphicResultsPage() {
  const { data: tasks, isLoading, error, refresh } = useConfidentialTasks(true)
  const results = useMemo(() => tasks.filter((task) => (
    task.status === 'completed' && task.executionSummary.trigger === 'resource-api-policy'
  )).map((task) => {
    const payload = record(task.executionSummary.result)
    const summary = record(payload.resultSummary)
    return { task, payload, summary }
  }), [tasks])

  return (
    <div className="space-y-5">
      <HomomorphicSecondaryTabs actions={<Button variant="secondary" className="gap-2" onClick={() => void refresh()}><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />刷新</Button>} />
      {error ? <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
      <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left text-[0.8125rem]">
            <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]"><tr>{['任务编号', '任务名称', '算法', '操作', '聚合结果', '样本数', '结果校验', '近似误差', '请求编号', '耗时'].map((label) => <th key={label} className="border-b border-[var(--line)] px-4 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>{results.map(({ task, payload, summary }) => (
              <tr key={task.id} className="border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-muted)]">
                <td className="whitespace-nowrap px-4 py-3.5 font-medium text-[var(--text-main)]">{formatConfidentialTaskCode(task.code)}</td>
                <td className="max-w-[240px] truncate px-4 py-3.5 text-[var(--text-secondary)]">{task.name}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{formatOpenFheAlgorithm(task.algorithm)}</td>
                <td className="px-4 py-3.5 text-[var(--text-secondary)]">{task.operation === 'mean' ? '平均值' : task.operation === 'sum' ? '求和' : '-'}</td>
                <td className="px-4 py-3.5 text-[1rem] font-semibold text-[var(--primary)]">{displayNumber(summary.value)}</td>
                <td className="px-4 py-3.5 text-[var(--text-secondary)]">{task.sampleCount.toLocaleString()}</td>
                <td className="px-4 py-3.5"><span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-2.5 py-1 text-[0.75rem] text-[var(--status-success-text)]">{summary.verificationPassed === true ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}{summary.verificationPassed === true ? '通过' : '未通过'}</span></td>
                <td className="px-4 py-3.5 text-[var(--text-secondary)]">{displayNumber(summary.absoluteError)}</td>
                <td className="max-w-[180px] truncate px-4 py-3.5 text-[var(--text-secondary)]">{String(payload.requestId || '-')}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{Number.isFinite(Number(payload.durationMs)) ? `${Number(payload.durationMs)} ms` : '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {isLoading ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在读取密态计算结果...</div> : null}
        {!isLoading && !results.length ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">暂无已完成的真实同态计算结果</div> : null}
      </section>
    </div>
  )
}
