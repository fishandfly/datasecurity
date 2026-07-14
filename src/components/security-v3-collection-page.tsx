import { Edit3, Eye, Plus, RefreshCw, Search, X, type LucideIcon } from 'lucide-react'
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
  type?: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'json' | 'datetime'
  required?: boolean
  options?: SecurityV3Option[]
  defaultValue?: unknown
  relation?: { collection: string; valueKey?: string; labelKey: string; filter?: Record<string, unknown> }
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
  transformSaveValues?: (
    values: Record<string, unknown>,
    context: { mode: 'edit' | 'create'; record: SecurityV3Record | null },
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
}

const inputClassName = 'h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]'

function normalizeFormValue(field: SecurityV3FormField, value: unknown) {
  if (field.type === 'boolean') return Boolean(value ?? field.defaultValue ?? false)
  if (field.type === 'json') return JSON.stringify(value ?? field.defaultValue ?? {}, null, 2)
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
    if (field.type === 'datetime') return [field.name, value ? new Date(String(value)).toISOString() : null]
    return [field.name, value]
  }))
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
        value: String(item[relation.valueKey || 'id'] ?? ''),
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
            return (
              <label key={field.name} className="block space-y-1.5 text-[0.8125rem] text-[var(--text-secondary)]">
                <span>{field.label}{field.required ? ' *' : ''}</span>
                {field.type === 'textarea' || field.type === 'json' ? (
                  <textarea disabled={readOnly || field.readOnly} className="min-h-28 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-[inherit] text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)] disabled:bg-[var(--surface-muted)]" value={String(value ?? '')} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />
                ) : field.type === 'boolean' ? (
                  <input type="checkbox" disabled={readOnly || field.readOnly} checked={Boolean(value)} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.checked }))} />
                ) : field.type === 'select' || field.relation ? (
                  <select disabled={readOnly || field.readOnly} className={inputClassName} value={String(value ?? '')} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}>
                    <option value="">请选择</option>
                    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <input type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'} disabled={readOnly || field.readOnly} className={inputClassName} value={String(value ?? '')} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />
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
      setRows(config.rowFilter ? records.filter(config.rowFilter) : records)
    } catch (currentError) {
      setError(toErrorMessage(currentError, `读取${config.title}失败`))
    } finally {
      setLoading(false)
    }
  }, [config.appends, config.collection, config.filter, config.rowFilter, config.sort, config.title])

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
