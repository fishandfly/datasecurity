import { Activity, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toErrorMessage } from '../lib/nocobase-client'
import type { SecurityV3Record } from '../lib/nocobase-security-v3'
import { saveResourceBehaviorBaseline, type BehaviorBaselineInput } from '../lib/security-runtime-client'
import { Button } from './ui'

type ResourceBehaviorBaselineDialogProps = {
  open: boolean
  api: SecurityV3Record
  subject: SecurityV3Record | null
  baseline: SecurityV3Record | null
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}

type BaselineForm = Omit<BehaviorBaselineInput, 'sample_from' | 'sample_to'> & {
  sample_from: string
  sample_to: string
}

const numberFields: Array<{ name: keyof BaselineForm; label: string; step?: string }> = [
  { name: 'sample_count', label: '样本数' },
  { name: 'frequency_avg', label: '平均调用频率', step: '0.01' },
  { name: 'frequency_stddev', label: '调用频率标准差', step: '0.01' },
  { name: 'query_days_avg', label: '平均查询跨度（天）', step: '0.01' },
  { name: 'query_days_stddev', label: '查询跨度标准差', step: '0.01' },
  { name: 'rows_avg', label: '平均返回行数', step: '0.01' },
  { name: 'rows_stddev', label: '返回行数标准差', step: '0.01' },
  { name: 'failure_avg', label: '平均失败次数', step: '0.01' },
]

const inputClassName = 'h-10 w-full rounded-[9px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] px-3 text-[0.8125rem] text-[var(--text-main)] outline-none transition focus:border-[var(--primary)]'

function toDateTimeInput(value: unknown, fallback: Date) {
  const date = value ? new Date(String(value)) : fallback
  const resolved = Number.isNaN(date.getTime()) ? fallback : date
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${resolved.getFullYear()}-${pad(resolved.getMonth() + 1)}-${pad(resolved.getDate())}T${pad(resolved.getHours())}:${pad(resolved.getMinutes())}`
}

function cleanNumber(value: unknown) {
  const resolved = Number(value || 0)
  return Number.isFinite(resolved) ? Math.round(resolved * 1_000_000) / 1_000_000 : 0
}

function initialForm(baseline: SecurityV3Record | null): BaselineForm {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return {
    sample_from: toDateTimeInput(baseline?.sample_from, sevenDaysAgo),
    sample_to: toDateTimeInput(baseline?.sample_to, now),
    sample_count: cleanNumber(baseline?.sample_count),
    frequency_avg: cleanNumber(baseline?.frequency_avg),
    frequency_stddev: cleanNumber(baseline?.frequency_stddev),
    query_days_avg: cleanNumber(baseline?.query_days_avg),
    query_days_stddev: cleanNumber(baseline?.query_days_stddev),
    rows_avg: cleanNumber(baseline?.rows_avg),
    rows_stddev: cleanNumber(baseline?.rows_stddev),
    failure_avg: cleanNumber(baseline?.failure_avg),
    baseline_status: ['enabled', 'disabled'].includes(String(baseline?.baseline_status))
      ? baseline?.baseline_status as 'enabled' | 'disabled'
      : 'draft',
  }
}

export function ResourceBehaviorBaselineDialog({ open, api, subject, baseline, onClose, onSaved }: ResourceBehaviorBaselineDialogProps) {
  const [form, setForm] = useState<BaselineForm>(() => initialForm(baseline))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm(initialForm(baseline))
      setError('')
    }
  }, [baseline, open])

  if (!open || !subject) return null

  const save = async () => {
    const sampleFrom = new Date(form.sample_from)
    const sampleTo = new Date(form.sample_to)
    if (Number.isNaN(sampleFrom.getTime()) || Number.isNaN(sampleTo.getTime()) || sampleTo <= sampleFrom) {
      setError('样本结束时间必须晚于开始时间')
      return
    }
    if (numberFields.some((field) => !Number.isFinite(Number(form[field.name])) || Number(form[field.name]) < 0)) {
      setError('基线统计值必须是大于等于 0 的数值')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await saveResourceBehaviorBaseline(String(api.id || ''), String(subject.id || ''), {
        ...form,
        sample_from: sampleFrom.toISOString(),
        sample_to: sampleTo.toISOString(),
        sample_count: Math.floor(Number(form.sample_count)),
        frequency_avg: Number(form.frequency_avg),
        frequency_stddev: Number(form.frequency_stddev),
        query_days_avg: Number(form.query_days_avg),
        query_days_stddev: Number(form.query_days_stddev),
        rows_avg: Number(form.rows_avg),
        rows_stddev: Number(form.rows_stddev),
        failure_avg: Number(form.failure_avg),
      })
      await onSaved(`行为基线已保存，当前版本 V${result.baseline_version}。`)
      onClose()
    } catch (currentError) {
      setError(toErrorMessage(currentError, '行为基线保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[rgba(8,18,32,0.54)] backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose() }}>
      <aside className="absolute inset-y-0 right-0 flex h-full max-h-[100dvh] w-full max-w-[720px] flex-col overflow-hidden border-l border-[var(--surface-outline)] bg-[var(--surface-raised)] shadow-[-28px_0_72px_rgba(8,18,32,0.28)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--surface-outline)] bg-[var(--table-header-bg)] px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--primary-soft)] text-[var(--primary)]"><Activity className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h2 className="text-[1.0625rem] font-semibold text-[var(--text-main)]">{baseline ? '编辑行为基线' : '配置行为基线'}</h2>
              <p className="mt-1 truncate text-[0.75rem] text-[var(--text-muted)]">{String(subject.subject_name || subject.subject_code)} · {String(api.api_name || api.api_code)}</p>
            </div>
          </div>
          <button type="button" disabled={saving} title="关闭" className="rounded-[7px] p-2 text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)] disabled:opacity-50" onClick={onClose}><X className="h-5 w-5" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="rounded-[10px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-info-text)]">
            每个“访问主体 + API”只保留一条行为基线，再次保存会更新原记录并递增版本。访问时段边界仍由访问策略统一管理。
          </div>

          <section className="grid gap-4 rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-muted)] p-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-[0.75rem] text-[var(--text-secondary)]"><span className="font-medium">样本开始时间</span><input type="datetime-local" className={inputClassName} value={form.sample_from} onChange={(event) => setForm((current) => ({ ...current, sample_from: event.target.value }))} /></label>
            <label className="space-y-1.5 text-[0.75rem] text-[var(--text-secondary)]"><span className="font-medium">样本结束时间</span><input type="datetime-local" className={inputClassName} value={form.sample_to} onChange={(event) => setForm((current) => ({ ...current, sample_to: event.target.value }))} /></label>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            {numberFields.map((field) => (
              <label key={field.name} className="space-y-1.5 text-[0.75rem] text-[var(--text-secondary)]">
                <span className="font-medium">{field.label}</span>
                <input type="number" min="0" step={field.step || '1'} className={inputClassName} value={String(cleanNumber(form[field.name]))} onChange={(event) => setForm((current) => ({ ...current, [field.name]: cleanNumber(event.target.value) }))} />
              </label>
            ))}
            <label className="space-y-1.5 text-[0.75rem] text-[var(--text-secondary)]">
              <span className="font-medium">基线状态</span>
              <select className={inputClassName} value={form.baseline_status} onChange={(event) => setForm((current) => ({ ...current, baseline_status: event.target.value as BehaviorBaselineInput['baseline_status'] }))}>
                <option value="draft">草稿</option><option value="enabled">启用</option><option value="disabled">停用</option>
              </select>
            </label>
          </section>
          {error ? <div className="rounded-[9px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgba(8,18,32,0.08)] sm:flex sm:justify-end">
          <Button variant="secondary" disabled={saving} onClick={onClose}>取消</Button>
          <Button disabled={saving} onClick={() => void save()}>{saving ? '保存中...' : '保存基线'}</Button>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}
