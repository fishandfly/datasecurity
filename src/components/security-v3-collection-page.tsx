import { Edit3, Eye, Plus, RefreshCw, Search, Trash2, X, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui'
import { SecurityModuleTabs, type SecurityModuleId } from './security-module-tabs'
import { toErrorMessage } from '../lib/nocobase-client'
import {
  formatSecurityV3Value,
  listSecurityV3Records,
  saveSecurityV3Record,
  type SecurityV3Record,
} from '../lib/nocobase-security-v3'
import { cn } from '../lib/utils'

export type SecurityV3Option = { value: string; label: string }

export type SecurityV3FormField = {
  name: string
  label: string
  type?: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'json' | 'datetime' | 'string-list' | 'relation-list' | 'time-ranges' | 'abnormal-rules'
  required?: boolean
  min?: number
  max?: number
  options?: SecurityV3Option[]
  defaultValue?: unknown
  relation?: { collection: string; valueKey?: string; labelKey: string; filter?: Record<string, unknown>; optionValue?: (record: SecurityV3Record) => string }
  readOnly?: boolean
  hidden?: boolean
}

export type SecurityV3Column = {
  key: string
  label: string
  width?: string
  value?: (record: SecurityV3Record) => unknown
  tone?: 'status' | 'normal'
}

export type SecurityV3RowAction = {
  key: string
  title: string
  icon: LucideIcon
  execute: (record: SecurityV3Record) => Promise<string | void>
  visible?: (record: SecurityV3Record) => boolean
}

export type SecurityV3CollectionPageConfig = {
  module: SecurityModuleId
  title: string
  collection: string
  columns: SecurityV3Column[]
  fields?: SecurityV3FormField[]
  appends?: string[]
  filter?: Record<string, unknown>
  sort?: string[]
  readOnly?: boolean
  canCreate?: boolean
  createLabel?: string
  emptyLabel?: string
  rowFilter?: (record: SecurityV3Record) => boolean
  canEdit?: (record: SecurityV3Record) => boolean
  extraActions?: ReactNode
  rowActions?: SecurityV3RowAction[]
  onRecordsChange?: (records: SecurityV3Record[]) => void
  transformSaveValues?: (
    values: Record<string, unknown>,
    context: { mode: 'edit' | 'create'; record: SecurityV3Record | null },
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
}

const inputClassName = 'h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]'

type PolicyTimeRange = {
  days: number[]
  from: string
  to: string
}

type AbnormalRuleKey = 'offHours' | 'highFrequency' | 'queryRangeExceeded' | 'rowLimitExceeded' | 'scopeViolation'
type AbnormalRuleAction = 'deny' | 'allow'
type AbnormalRule = { enabled: boolean; action: AbnormalRuleAction }
type AbnormalRules = Record<AbnormalRuleKey, AbnormalRule>

const abnormalRuleDefinitions: Array<{ key: AbnormalRuleKey; label: string }> = [
  { key: 'offHours', label: '非允许时段调用' },
  { key: 'highFrequency', label: '高频调用' },
  { key: 'queryRangeExceeded', label: '查询时间范围超限' },
  { key: 'rowLimitExceeded', label: '返回行数超限' },
  { key: 'scopeViolation', label: '数据所属区域越界' },
]

const weekdayOptions = [
  { value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' }, { value: 4, label: '四' },
  { value: 5, label: '五' }, { value: 6, label: '六' }, { value: 7, label: '日' },
]

function parseStructuredValue(value: unknown, fallback: unknown) {
  if (typeof value !== 'string') return value ?? fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeStringList(value: unknown) {
  const source = parseStructuredValue(value, [])
  return Array.isArray(source) ? Array.from(new Set(source.map((item) => String(item ?? '').trim()).filter(Boolean))) : []
}

function editableStringList(value: unknown) {
  const source = parseStructuredValue(value, [])
  return Array.isArray(source) ? source.map((item) => String(item ?? '')) : []
}

function normalizeTimeRanges(value: unknown) {
  const source = parseStructuredValue(value, [])
  if (!Array.isArray(source)) return []
  return source.map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const days = Array.isArray(row.days)
      ? Array.from(new Set(row.days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))).sort()
      : []
    return { days, from: String(row.from ?? '').slice(0, 5), to: String(row.to ?? '').slice(0, 5) }
  }).filter((item) => item.days.length || item.from || item.to)
}

function defaultAbnormalRules(): AbnormalRules {
  return Object.fromEntries(abnormalRuleDefinitions.map(({ key }) => [key, {
    enabled: true,
    action: 'deny' as const,
  }])) as AbnormalRules
}

function normalizeAbnormalRules(value: unknown) {
  const source = parseStructuredValue(value, {})
  const record = source && typeof source === 'object' && !Array.isArray(source) ? source as Record<string, unknown> : {}
  const defaults = defaultAbnormalRules()
  return Object.fromEntries(abnormalRuleDefinitions.map(({ key }) => {
    const raw = record[key]
    const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
    const action = ['deny', 'allow'].includes(String(row.action)) ? String(row.action) as AbnormalRuleAction : defaults[key].action
    return [key, {
      enabled: typeof row.enabled === 'boolean' ? row.enabled : defaults[key].enabled,
      action,
    }]
  })) as AbnormalRules
}

function normalizeFormValue(field: SecurityV3FormField, value: unknown) {
  if (field.type === 'boolean') return Boolean(value ?? field.defaultValue ?? false)
  if (field.type === 'json') return JSON.stringify(value ?? field.defaultValue ?? {}, null, 2)
  if (field.type === 'string-list') return normalizeStringList(value ?? field.defaultValue)
  if (field.type === 'relation-list') return normalizeStringList(value ?? field.defaultValue)
  if (field.type === 'time-ranges') return normalizeTimeRanges(value ?? field.defaultValue)
  if (field.type === 'abnormal-rules') return normalizeAbnormalRules(value ?? field.defaultValue)
  if (field.type === 'datetime' && value) return String(value).slice(0, 16)
  return value ?? field.defaultValue ?? ''
}

function buildInitialForm(fields: SecurityV3FormField[], record: SecurityV3Record | null) {
  return Object.fromEntries(fields.map((field) => [field.name, normalizeFormValue(field, record?.[field.name])]))
}

function toSaveValues(fields: SecurityV3FormField[], form: Record<string, unknown>) {
  return Object.fromEntries(fields.filter((field) => !field.readOnly).map((field) => {
    const value = form[field.name]
    if (field.type === 'number') return [field.name, value === '' ? null : Number(value)]
    if (field.type === 'json') return [field.name, String(value || '').trim() ? JSON.parse(String(value)) : {}]
    if (field.type === 'string-list') return [field.name, normalizeStringList(value)]
    if (field.type === 'relation-list') return [field.name, normalizeStringList(value)]
    if (field.type === 'time-ranges') return [field.name, normalizeTimeRanges(value).filter((item) => item.days.length && item.from && item.to)]
    if (field.type === 'abnormal-rules') return [field.name, normalizeAbnormalRules(value)]
    if (field.type === 'datetime') return [field.name, value ? new Date(String(value)).toISOString() : null]
    return [field.name, value]
  }))
}

function StructuredFieldLabel({ field }: { field: SecurityV3FormField }) {
  return <div className="text-[0.8125rem] text-[var(--text-secondary)]">{field.label}{field.required ? ' *' : ''}</div>
}

function StringListField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: SecurityV3FormField
  value: unknown
  disabled: boolean
  onChange: (value: string[]) => void
}) {
  const values = editableStringList(value)
  return (
    <div className="space-y-2.5">
      <StructuredFieldLabel field={field} />
      <div className="space-y-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
        {values.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input aria-label={`${field.label}${index + 1}`} disabled={disabled} value={item} onChange={(event) => onChange(values.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} className={inputClassName} />
            <button type="button" title={`删除${field.label}`} disabled={disabled} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--status-danger-text)] disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {!values.length ? <div className="py-1 text-[0.8125rem] text-[var(--text-muted)]">未限制，留空表示不按此维度拦截。</div> : null}
        <button type="button" disabled={disabled} onClick={() => onChange([...values, ''])} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-[var(--primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-3.5 w-3.5" />添加一项</button>
      </div>
    </div>
  )
}

function RelationListField({
  field,
  value,
  options,
  disabled,
  onChange,
}: {
  field: SecurityV3FormField
  value: unknown
  options: SecurityV3Option[]
  disabled: boolean
  onChange: (value: string[]) => void
}) {
  const selected = normalizeStringList(value)
  return (
    <div className="space-y-2.5">
      <StructuredFieldLabel field={field} />
      <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
        <select
          aria-label={field.label}
          multiple
          disabled={disabled}
          value={selected}
          onChange={(event) => onChange(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
          className="min-h-28 w-full rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]"
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <div className="mt-2 text-[0.75rem] leading-5 text-[var(--text-muted)]">按住 Command 或 Ctrl 可选择多个区域；未选择表示不限制区域。</div>
      </div>
    </div>
  )
}

function TimeRangesField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: SecurityV3FormField
  value: unknown
  disabled: boolean
  onChange: (value: PolicyTimeRange[]) => void
}) {
  const ranges = normalizeTimeRanges(value)
  const updateRange = (index: number, next: Partial<PolicyTimeRange>) => onChange(ranges.map((range, rangeIndex) => rangeIndex === index ? { ...range, ...next } : range))
  return (
    <div className="space-y-2.5">
      <StructuredFieldLabel field={field} />
      <div className="space-y-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
        {ranges.map((range, index) => (
          <div key={index} className="space-y-3 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[0.75rem] text-[var(--text-muted)]">时段 {index + 1}</span><button type="button" title="删除时段" disabled={disabled} onClick={() => onChange(ranges.filter((_, rangeIndex) => rangeIndex !== index))} className="rounded-[6px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--status-danger-text)] disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button></div>
            <div className="flex flex-wrap gap-1.5">{weekdayOptions.map((day) => <label key={day.value} className={cn('flex h-8 w-8 cursor-pointer items-center justify-center rounded-[6px] border text-[0.75rem] font-medium', range.days.includes(day.value) ? 'border-[var(--primary)] bg-[var(--status-info-bg)] text-[var(--primary)]' : 'border-[var(--line)] text-[var(--text-muted)]', disabled && 'cursor-not-allowed opacity-60')}><input type="checkbox" className="sr-only" disabled={disabled} checked={range.days.includes(day.value)} onChange={(event) => updateRange(index, { days: event.target.checked ? [...range.days, day.value].sort() : range.days.filter((value) => value !== day.value) })} />{day.label}</label>)}</div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><input aria-label={`时段${index + 1}开始`} type="time" disabled={disabled} value={range.from} onChange={(event) => updateRange(index, { from: event.target.value })} className={inputClassName} /><span className="text-center text-[0.75rem] text-[var(--text-muted)]">至</span><input aria-label={`时段${index + 1}结束`} type="time" disabled={disabled} value={range.to} onChange={(event) => updateRange(index, { to: event.target.value })} className={inputClassName} /></div>
          </div>
        ))}
        {!ranges.length ? <div className="py-1 text-[0.8125rem] text-[var(--text-muted)]">未设置允许时段，表示可在任意时间调用。</div> : null}
        <button type="button" disabled={disabled} onClick={() => onChange([...ranges, { days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '23:59' }])} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-[var(--primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-3.5 w-3.5" />添加允许时段</button>
      </div>
    </div>
  )
}

function AbnormalRulesField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: SecurityV3FormField
  value: unknown
  disabled: boolean
  onChange: (value: AbnormalRules) => void
}) {
  const rules = normalizeAbnormalRules(value)
  const updateRule = (key: AbnormalRuleKey, next: Partial<AbnormalRule>) => onChange({ ...rules, [key]: { ...rules[key], ...next } })
  return (
    <div className="space-y-2.5">
      <StructuredFieldLabel field={field} />
      <div className="overflow-hidden rounded-[8px] border border-[var(--line)]">
        <div className="grid grid-cols-[minmax(180px,1fr)_64px_110px] gap-2 bg-[var(--surface-muted)] px-3 py-2 text-[0.75rem] text-[var(--text-muted)]"><span>异常情形</span><span>启用</span><span>决策</span></div>
        {abnormalRuleDefinitions.map(({ key, label }) => {
          const rule = rules[key]
          return <div key={key} className="grid grid-cols-[minmax(180px,1fr)_64px_110px] items-center gap-2 border-t border-[var(--line)] px-3 py-2.5 text-[0.8125rem]"><span className="text-[var(--text-secondary)]">{label}</span><label className="flex items-center"><input aria-label={`${label}启用`} type="checkbox" disabled={disabled} checked={rule.enabled} onChange={(event) => updateRule(key, { enabled: event.target.checked })} /></label><select aria-label={`${label}决策`} disabled={disabled} value={rule.action} onChange={(event) => updateRule(key, { action: event.target.value as AbnormalRuleAction })} className="h-9 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-2 text-[0.8125rem] text-[var(--text-secondary)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]"><option value="deny">拒绝</option><option value="allow">允许</option></select></div>
        })}
      </div>
    </div>
  )
}

function RecordDrawer({
  config,
  record,
  mode,
  onClose,
  onSaved,
}: {
  config: SecurityV3CollectionPageConfig
  record: SecurityV3Record | null
  mode: 'view' | 'edit' | 'create'
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const fields = config.fields || []
  const [form, setForm] = useState<Record<string, unknown>>(() => buildInitialForm(fields, record))
  const [relationOptions, setRelationOptions] = useState<Record<string, SecurityV3Option[]>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const readOnly = mode === 'view'

  useEffect(() => setForm(buildInitialForm(fields, record)), [fields, record])

  useEffect(() => {
    let cancelled = false
    void Promise.all(fields.filter((field) => field.relation).map(async (field) => {
      const relation = field.relation!
      const rows = await listSecurityV3Records(relation.collection, { filter: relation.filter })
      return [field.name, rows.map((item) => ({
        value: relation.optionValue ? relation.optionValue(item) : String(item[relation.valueKey || 'id'] ?? ''),
        label: formatSecurityV3Value(item[relation.labelKey]),
      })).filter((item) => item.value)] as const
    })).then((entries) => {
      if (!cancelled) setRelationOptions(Object.fromEntries(entries))
    }).catch((currentError) => {
      if (!cancelled) setError(toErrorMessage(currentError, '读取关联选项失败'))
    })
    return () => { cancelled = true }
  }, [fields])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      let values = toSaveValues(fields, form)
      for (const field of fields) {
        if (field.required && (values[field.name] === '' || values[field.name] == null)) throw new Error(`请填写${field.label}`)
        if (field.type === 'number' && values[field.name] != null) {
          const numberValue = Number(values[field.name])
          if (field.min != null && numberValue < field.min) throw new Error(`${field.label}不能小于 ${field.min}`)
          if (field.max != null && numberValue > field.max) throw new Error(`${field.label}不能大于 ${field.max}`)
        }
      }
      if (config.transformSaveValues) {
        values = await config.transformSaveValues(values, { mode: mode === 'edit' ? 'edit' : 'create', record })
      }
      await saveSecurityV3Record(config.collection, mode === 'edit' ? String(record?.id || '') : '', values)
      await onSaved()
      onClose()
    } catch (currentError) {
      setError(toErrorMessage(currentError, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[rgba(8,18,32,0.46)]" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <aside className="absolute inset-y-0 right-0 flex h-full max-h-[100dvh] w-full max-w-[680px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[-24px_0_64px_rgba(8,18,32,0.22)]">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <h2 className="text-[1.125rem] font-semibold text-[var(--text-main)]">{mode === 'create' ? `新建${config.title}` : mode === 'edit' ? `编辑${config.title}` : `${config.title}详情`}</h2>
          <button type="button" title="关闭" className="rounded-[6px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={onClose}><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {fields.filter((field) => !field.hidden).map((field) => {
            const value = form[field.name]
            const options = field.relation ? relationOptions[field.name] || [] : field.options || []
            const disabled = readOnly || Boolean(field.readOnly)
            if (field.type === 'string-list') {
              return <StringListField key={field.name} field={field} value={value} disabled={disabled} onChange={(nextValue) => setForm((current) => ({ ...current, [field.name]: nextValue }))} />
            }
            if (field.type === 'relation-list') {
              return <RelationListField key={field.name} field={field} value={value} options={options} disabled={disabled} onChange={(nextValue) => setForm((current) => ({ ...current, [field.name]: nextValue }))} />
            }
            if (field.type === 'time-ranges') {
              return <TimeRangesField key={field.name} field={field} value={value} disabled={disabled} onChange={(nextValue) => setForm((current) => ({ ...current, [field.name]: nextValue }))} />
            }
            if (field.type === 'abnormal-rules') {
              return <AbnormalRulesField key={field.name} field={field} value={value} disabled={disabled} onChange={(nextValue) => setForm((current) => ({ ...current, [field.name]: nextValue }))} />
            }
            return (
              <label key={field.name} className="block space-y-1.5 text-[0.8125rem] text-[var(--text-secondary)]">
                <span>{field.label}{field.required ? ' *' : ''}</span>
                {field.type === 'textarea' || field.type === 'json' ? (
                  <textarea disabled={disabled} className="min-h-28 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-[inherit] text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)] disabled:bg-[var(--surface-muted)]" value={String(value ?? '')} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />
                ) : field.type === 'boolean' ? (
                  <input type="checkbox" disabled={disabled} checked={Boolean(value)} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.checked }))} />
                ) : field.type === 'select' || field.relation ? (
                  <select disabled={disabled} className={inputClassName} value={String(value ?? '')} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}>
                    <option value="">请选择</option>
                    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <input type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'} min={field.min} max={field.max} disabled={disabled} className={inputClassName} value={String(value ?? '')} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />
                )}
              </label>
            )
          })}
          {error ? <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
        </div>
        <footer className="sticky bottom-0 z-10 grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgba(8,18,32,0.08)] sm:flex sm:items-center sm:justify-end">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>{readOnly ? '关闭' : '取消'}</Button>
          {!readOnly ? <Button className="w-full sm:w-auto" disabled={saving} onClick={() => void save()}>{saving ? '保存中...' : '保存'}</Button> : null}
        </footer>
      </aside>
    </div>,
    document.body,
  )
}

export function SecurityV3CollectionPage({ config, embedded = false }: { config: SecurityV3CollectionPageConfig; embedded?: boolean }) {
  const [rows, setRows] = useState<SecurityV3Record[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [drawer, setDrawer] = useState<{ mode: 'view' | 'edit' | 'create'; record: SecurityV3Record | null } | null>(null)
  const [actionState, setActionState] = useState('')
  const [activeAction, setActiveAction] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const records = await listSecurityV3Records(config.collection, {
        filter: config.filter,
        appends: config.appends,
        sort: config.sort ?? ['-updatedAt', '-createdAt'],
      })
      const nextRows = config.rowFilter ? records.filter(config.rowFilter) : records
      setRows(nextRows)
      config.onRecordsChange?.(nextRows)
    } catch (currentError) {
      setError(toErrorMessage(currentError, `读取${config.title}失败`))
    } finally {
      setLoading(false)
    }
  }, [config.appends, config.collection, config.filter, config.onRecordsChange, config.rowFilter, config.sort, config.title])

  useEffect(() => { void refresh() }, [refresh])

  const filteredRows = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return rows
    return rows.filter((record) => config.columns.some((column) => formatSecurityV3Value(column.value ? column.value(record) : record[column.key]).toLowerCase().includes(normalized)))
  }, [config.columns, keyword, rows])

  const executeRowAction = async (action: SecurityV3RowAction, record: SecurityV3Record) => {
    const actionKey = `${action.key}:${String(record.id || '')}`
    setActiveAction(actionKey)
    setActionState('')
    try {
      const message = await action.execute(record)
      setActionState(message || `${action.title}成功`)
      await refresh()
    } catch (currentError) {
      setActionState(toErrorMessage(currentError, `${action.title}失败`))
    } finally {
      setActiveAction('')
    }
  }

  const actions = (
    <>
      <label className="flex h-10 w-full items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 sm:w-[320px]">
        <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
          placeholder={`搜索${config.title}`}
          aria-label={`搜索${config.title}`}
        />
      </label>
      {!config.readOnly && config.canCreate !== false && config.fields?.length ? <Button className="gap-2" onClick={() => setDrawer({ mode: 'create', record: null })}><Plus className="h-4 w-4" />{config.createLabel || `新建${config.title}`}</Button> : null}
      {config.extraActions}
      <Button variant="secondary" className="gap-2" onClick={() => void refresh()}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />刷新</Button>
    </>
  )

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      ) : (
        <SecurityModuleTabs module={config.module} actions={actions} />
      )}
      {actionState ? <div className="rounded-[8px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-info-text)]">{actionState}</div> : null}
      {error ? <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
      <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-[0.8125rem]">
            <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]"><tr>{config.columns.map((column) => <th key={column.key} style={{ width: column.width }} className="border-b border-[var(--line)] px-4 py-3 font-medium">{column.label}</th>)}<th className="w-24 border-b border-[var(--line)] px-4 py-3 font-medium">操作</th></tr></thead>
            <tbody>{filteredRows.map((record) => (
              <tr key={String(record.id)} className="border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-muted)]">
                {config.columns.map((column) => {
                  const value = formatSecurityV3Value(column.value ? column.value(record) : record[column.key])
                  return <td key={column.key} className="max-w-[360px] truncate px-4 py-3.5 text-[var(--text-secondary)]">{column.tone === 'status' ? <span className="inline-flex rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-2.5 py-1 text-[0.75rem] text-[var(--status-info-text)]">{value}</span> : value}</td>
                })}
                <td className="px-4 py-3"><div className="flex items-center gap-1"><button type="button" title="查看" className="rounded-[6px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]" onClick={() => setDrawer({ mode: 'view', record })}><Eye className="h-4 w-4" /></button>{!config.readOnly && config.fields?.length && (!config.canEdit || config.canEdit(record)) ? <button type="button" title="编辑" className="rounded-[6px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]" onClick={() => setDrawer({ mode: 'edit', record })}><Edit3 className="h-4 w-4" /></button> : null}{config.rowActions?.filter((action) => !action.visible || action.visible(record)).map((action) => { const Icon = action.icon; const actionKey = `${action.key}:${String(record.id || '')}`; return <button key={action.key} type="button" disabled={activeAction === actionKey} title={action.title} className="rounded-[6px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)] disabled:opacity-50" onClick={() => void executeRowAction(action, record)}><Icon className={`h-4 w-4 ${activeAction === actionKey ? 'animate-pulse' : ''}`} /></button> })}</div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!loading && !filteredRows.length ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">{config.emptyLabel || `后台暂无${config.title}数据`}</div> : null}
        {loading ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在读取后台数据...</div> : null}
      </section>
      {drawer ? <RecordDrawer config={config} record={drawer.record} mode={drawer.mode} onClose={() => setDrawer(null)} onSaved={refresh} /> : null}
    </div>
  )
}
