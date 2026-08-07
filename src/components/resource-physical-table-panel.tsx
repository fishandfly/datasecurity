import { CheckCircle2, Database, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import type { ResourceLatestRows } from '../lib/security-runtime-client'

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

type ResourceIngestSamplesPanelProps = {
  data: ResourceLatestRows | null
  isLoading: boolean
  error: string
  onRefresh: () => void
}

export function ResourceIngestSamplesPanel({ data, isLoading, error, onRefresh }: ResourceIngestSamplesPanelProps) {
  const validationRuleCount = data
    ? data.validationRule.requiredFields.length
      + Object.keys(data.validationRule.numericRanges).length
      + (data.validationRule.duplicateKeys.length > 0 ? 1 : 0)
    : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--surface-raised)] text-[var(--primary)] shadow-[var(--shadow-soft)]">
            <Database className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[0.875rem] font-semibold text-[var(--text-main)]">
              {data?.tableName ? `规则抽样 · ${data.tableName}` : '规则抽样'}
            </div>
            <div className="mt-1 text-[0.75rem] leading-5 text-[var(--status-info-text)]">
              以最新 {data?.limit ?? 10} 条记录为校验窗口，按接入规则抽样并逐条校验
              {data?.orderField ? `，按 ${data.orderField} 倒序` : '；未识别业务时间字段时使用物理表默认顺序'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 text-[0.75rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          刷新抽样
        </button>
      </div>

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-3">
            <div className="text-[0.75rem] text-[var(--text-muted)]">抽样规则</div>
            <div className="mt-1 text-[1rem] font-semibold text-[var(--text-main)]">
              {data.samplingEnabled ? `${data.samplingRate}%` : '未启用'}
            </div>
            <div className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">候选 {data.candidateCount} 条，抽中 {data.sampleCount} 条</div>
          </div>
          <div className="rounded-[12px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3">
            <div className="text-[0.75rem] text-[var(--status-success-text)]">校验通过</div>
            <div className="mt-1 text-[1rem] font-semibold text-[var(--status-success-text)]">{data.passedCount} 条</div>
            <div className="mt-1 text-[0.75rem] text-[var(--status-success-text)]">仅统计本次抽中记录</div>
          </div>
          <div className="rounded-[12px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3">
            <div className="text-[0.75rem] text-[var(--status-danger-text)]">校验拒绝</div>
            <div className="mt-1 text-[1rem] font-semibold text-[var(--status-danger-text)]">{data.rejectedCount} 条</div>
            <div className="mt-1 text-[0.75rem] text-[var(--status-danger-text)]">表格中可查看拒绝原因</div>
          </div>
          <div className="rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-3">
            <div className="text-[0.75rem] text-[var(--text-muted)]">接入校验配置</div>
            <div className="mt-1 flex items-center gap-2 text-[1rem] font-semibold text-[var(--text-main)]">
              <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
              {validationRuleCount} 项字段规则
            </div>
            <div className="mt-1 text-[0.75rem] leading-5 text-[var(--text-secondary)]">
              {data.integrityExecutable
                ? `${data.checksumAlgorithm} 已校验 ${data.integrityCheckedCount} 条，失败 ${data.integrityFailedCount} 条`
                : data.integrityEnabled
                  ? `${data.checksumAlgorithm || '摘要'} 已配置，尚未配置可执行的摘要字段`
                  : '未启用完整性校验'}
            </div>
            <div className="mt-1 text-[0.6875rem] text-[var(--text-muted)]">{data.configSource === 'resource' ? '资源级规则已生效' : '使用数据源默认规则'}</div>
          </div>
        </div>
      ) : null}

      {data && validationRuleCount > 0 ? (
        <div className="flex flex-wrap gap-2 rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] text-[var(--text-secondary)]">
          {data.validationRule.requiredFields.length > 0 ? <span className="rounded-full bg-[var(--surface-raised)] px-3 py-1.5">必填：{data.validationRule.requiredFields.join('、')}</span> : null}
          {Object.keys(data.validationRule.numericRanges).length > 0 ? <span className="rounded-full bg-[var(--surface-raised)] px-3 py-1.5">数值范围：{Object.keys(data.validationRule.numericRanges).join('、')}</span> : null}
          {data.validationRule.duplicateKeys.length > 0 ? <span className="rounded-full bg-[var(--surface-raised)] px-3 py-1.5">重复键：{data.validationRule.duplicateKeys.join(' + ')}</span> : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">
          正在读取接入抽样数据...
        </div>
      ) : error ? (
        <div className="rounded-[14px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-5 text-[0.875rem] leading-7 text-[var(--status-danger-text)]">
          {error}
        </div>
      ) : data && data.rows.length > 0 ? (
        <div className="overflow-hidden rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead className="bg-[var(--table-header-bg)]">
                <tr>
                  <th className="sticky left-0 z-10 w-16 border-b border-r border-[var(--surface-outline)] bg-[var(--table-header-bg)] px-4 py-3 text-[0.75rem] font-semibold text-[var(--text-secondary)]">序号</th>
                  <th className="min-w-[210px] border-b border-r border-[var(--surface-outline)] px-4 py-3 text-[0.75rem] font-semibold text-[var(--text-main)]">校验结果</th>
                  {data.columns.map((column) => (
                    <th key={column.code} className="min-w-[160px] border-b border-[var(--surface-outline)] px-4 py-3 align-bottom">
                      <div className="text-[0.75rem] font-semibold text-[var(--text-main)]">{column.name}</div>
                      <div className="mt-1 font-mono text-[0.6875rem] font-normal text-[var(--text-muted)]">{column.code} · {column.dataType || '未标注类型'}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="odd:bg-[var(--surface-raised-strong)] even:bg-[var(--table-row-alt)] hover:bg-[var(--table-row-hover)]">
                    <td className="sticky left-0 border-b border-r border-[var(--surface-outline)] bg-inherit px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]">{rowIndex + 1}</td>
                    <td className="border-b border-r border-[var(--surface-outline)] px-4 py-3 align-top">
                      {data.validationResults[rowIndex]?.passed ? (
                        <div className="space-y-1.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-2.5 py-1 text-[0.75rem] font-medium text-[var(--status-success-text)]">
                            <CheckCircle2 className="h-3.5 w-3.5" />通过
                          </span>
                          {data.validationResults[rowIndex]?.warnings?.length ? <div className="text-[0.75rem] leading-5 text-[var(--status-warning-text)]">{data.validationResults[rowIndex]?.warnings?.join('；')}</div> : null}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-2.5 py-1 text-[0.75rem] font-medium text-[var(--status-danger-text)]">
                            <XCircle className="h-3.5 w-3.5" />拒绝
                          </span>
                          <div className="text-[0.75rem] leading-5 text-[var(--status-danger-text)]">
                            {data.validationResults[rowIndex]?.issues.join('；') || '未返回具体原因'}
                          </div>
                        </div>
                      )}
                    </td>
                    {data.columns.map((column) => (
                      <td key={column.code} className="max-w-[360px] border-b border-[var(--surface-outline)] px-4 py-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
                        <div className="max-h-24 overflow-auto whitespace-pre-wrap break-words">{formatCell(row[column.code])}</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[var(--surface-outline)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] text-[var(--text-muted)]">
            本次校验窗口 {data.candidateCount} 条，按 {data.samplingRate}% 抽中 {data.sampleCount} 条；通过 {data.passedCount} 条，拒绝 {data.rejectedCount} 条。
          </div>
        </div>
      ) : (
        <div className="rounded-[14px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">
          {data && !data.samplingEnabled
            ? '当前生效的接入规则未启用数据抽样，可在本页“配置资源校验”中覆盖数据源默认设置。'
            : '当前校验窗口没有可展示的接入抽样数据。'}
        </div>
      )}
    </div>
  )
}
