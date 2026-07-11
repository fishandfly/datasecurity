import { Save, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toErrorMessage } from '../lib/nocobase-client'
import type { SecurityGovernancePolicyRecord } from '../lib/nocobase-security-governance'
import {
  fetchSecurityGovernanceEditSupportOptions,
  saveEditableSecurityGovernanceFieldRows,
  saveEditableSecurityGovernanceRecord,
  useEditableSecurityGovernanceFieldRows,
  useEditableSecurityGovernanceRecord,
  type EditableSecurityGovernanceFieldRow,
  type EditableSecurityGovernanceRecord,
  type SecurityGovernanceEditSupportOptions,
} from '../lib/nocobase-security-governance-edit'
import {
  resolveSecurityBooleanLabel,
  resolveSecurityScopeLabel,
  resolveSecurityStatusLabel,
} from '../lib/security-governance'

type SecurityGovernanceEditDialogProps = {
  open: boolean
  record: SecurityGovernancePolicyRecord | null
  onClose: () => void
  onSaved: () => Promise<void> | void
}

type SecurityGovernanceFieldEditDialogProps = SecurityGovernanceEditDialogProps

const DIALOG_INPUT_CLASS =
  'h-11 w-full rounded-xl border border-[var(--dialog-input-border)] bg-[var(--dialog-input-bg)] px-4 text-[0.875rem] text-[var(--dialog-input-text)] outline-none placeholder:text-[var(--dialog-input-placeholder)]'
const DIALOG_TEXTAREA_CLASS =
  'w-full rounded-xl border border-[var(--dialog-input-border)] bg-[var(--dialog-input-bg)] px-4 py-3 text-[0.875rem] leading-7 text-[var(--dialog-input-text)] outline-none placeholder:text-[var(--dialog-input-placeholder)]'
const DIALOG_SECONDARY_BUTTON_CLASS =
  'inline-flex h-11 items-center justify-center rounded-xl border border-[var(--dialog-input-border)] bg-[var(--dialog-soft-button-bg)] px-5 text-[0.8125rem] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]'
const DIALOG_ERROR_PANEL_CLASS =
  'rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]'

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  renderLabel,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  placeholder: string
  renderLabel?: (value: string) => string
}) {
  return (
    <label className="space-y-2">
      <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">{label}</div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={DIALOG_INPUT_CLASS}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {renderLabel ? renderLabel(option.value) : option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-[var(--dialog-input-border)] bg-[var(--dialog-input-bg)] px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border border-[var(--dialog-input-border)]"
      />
      <span className="text-[0.875rem] text-[var(--dialog-input-text)]">{label}</span>
    </label>
  )
}

function DialogFrame({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  maxWidthClass = 'max-w-6xl',
}: {
  open: boolean
  title: string
  description: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  maxWidthClass?: string
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--dialog-overlay)] px-4 py-6">
      <div className={`mx-auto mt-2 mb-6 w-full ${maxWidthClass} overflow-hidden rounded-[24px] border border-[var(--dialog-surface-border)] bg-[var(--dialog-surface)] shadow-[0_28px_80px_var(--dialog-shadow)]`}>
        <div className="flex items-center justify-between border-b border-[var(--dialog-divider)] px-6 py-5">
          <div>
            <div className="text-[1.25rem] font-semibold text-[var(--text-main)]">{title}</div>
            <div className="mt-1 text-[0.8125rem] text-[var(--text-muted)]">{description}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--dialog-input-border)] bg-[var(--dialog-soft-button-bg)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(100vh-196px)] overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex items-center justify-end gap-3 border-t border-[var(--dialog-divider)] px-6 py-4">{footer}</div>
      </div>
    </div>
  )
}

function resolveOptionLabel(options: Array<{ value: string; label: string }>, value: string, fallback: string) {
  if (!value) return fallback
  return options.find((option) => option.value === value)?.label ?? fallback
}

function SecurityStatusPreview({
  form,
  options,
}: {
  form: EditableSecurityGovernanceRecord
  options: SecurityGovernanceEditSupportOptions
}) {
  const securityCategoryLabel = resolveOptionLabel(options.securityCategoryOptions, form.securityCategoryId, form.securityCategoryId || '未标注')
  const securityLevelLabel = resolveOptionLabel(options.securityLevelOptions, form.securityLevelId, form.securityLevelId || '未标注')

  return (
    <div className="grid gap-3 rounded-2xl border border-[var(--dialog-panel-border)] bg-[linear-gradient(180deg,var(--dialog-panel-bg-start),var(--dialog-panel-bg-end))] p-4 md:grid-cols-2 xl:grid-cols-4">
      <div>
        <div className="text-[0.75rem] text-[var(--text-muted)]">安全分类</div>
        <div className="mt-1 text-[0.9375rem] font-semibold text-[var(--text-main)]">{securityCategoryLabel}</div>
      </div>
      <div>
        <div className="text-[0.75rem] text-[var(--text-muted)]">安全等级</div>
        <div className="mt-1 text-[0.9375rem] font-semibold text-[var(--text-main)]">{securityLevelLabel}</div>
      </div>
      <div>
        <div className="text-[0.75rem] text-[var(--text-muted)]">复核状态</div>
        <div className="mt-1 text-[0.9375rem] font-semibold text-[var(--text-main)]">{resolveSecurityStatusLabel(form.securityReviewStatus)}</div>
      </div>
      <div>
        <div className="text-[0.75rem] text-[var(--text-muted)]">访问范围</div>
        <div className="mt-1 text-[0.9375rem] font-semibold text-[var(--text-main)]">{resolveSecurityScopeLabel(form.accessScope)}</div>
      </div>
    </div>
  )
}

export function SecurityGovernanceProfileEditDialog({
  open,
  record,
  onClose,
  onSaved,
}: SecurityGovernanceEditDialogProps) {
  const { data, isLoading, error } = useEditableSecurityGovernanceRecord(record, open)
  const [form, setForm] = useState<EditableSecurityGovernanceRecord | null>(null)
  const [options, setOptions] = useState<SecurityGovernanceEditSupportOptions | null>(null)
  const [isOptionsLoading, setIsOptionsLoading] = useState(false)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(record ? data : null)
    setSaveError(null)
  }, [data, open, record])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setIsOptionsLoading(true)
    setOptionsError(null)
    void fetchSecurityGovernanceEditSupportOptions()
      .then((payload) => {
        if (cancelled) return
        setOptions(payload)
      })
      .catch((currentError) => {
        if (cancelled) return
        setOptionsError(toErrorMessage(currentError, '读取安全档案编辑选项失败'))
      })
      .finally(() => {
        if (!cancelled) setIsOptionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const updateField = <K extends keyof EditableSecurityGovernanceRecord>(key: K, value: EditableSecurityGovernanceRecord[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  const handleSave = async () => {
    if (!record || !form) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await saveEditableSecurityGovernanceRecord(record, form, options ?? undefined)
      await onSaved()
      onClose()
    } catch (currentError) {
      setSaveError(toErrorMessage(currentError, '保存安全档案失败'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DialogFrame
      open={open}
      title="编辑安全档案"
      description="直接写回 eco_resource_security_policies 的资源级分类分级、策略要求和监督摘要。"
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className={DIALOG_SECONDARY_BUTTON_CLASS}>取消</button>
          <button
            type="button"
            onClick={() => { void handleSave() }}
            disabled={!form || isLoading || isOptionsLoading || isSaving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-5 text-[0.8125rem] font-semibold text-white shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.2)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? '保存中...' : '保存'}
          </button>
        </>
      )}
    >
      <div className="space-y-6">
        {error ? <div className={DIALOG_ERROR_PANEL_CLASS}>{error}</div> : null}
        {optionsError ? <div className={DIALOG_ERROR_PANEL_CLASS}>{optionsError}</div> : null}
        {saveError ? <div className={DIALOG_ERROR_PANEL_CLASS}>{saveError}</div> : null}

        {!form || isLoading || !options ? (
          <div className="rounded-xl border border-[var(--dialog-panel-border)] bg-[linear-gradient(180deg,var(--dialog-panel-bg-start),var(--dialog-panel-bg-end))] px-4 py-10 text-center text-[0.875rem] text-[var(--text-secondary)]">
            正在读取安全档案编辑信息...
          </div>
        ) : (
          <>
            <SecurityStatusPreview form={form} options={options} />

            <section className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">资源名称</div>
                <input value={form.resourceName} disabled className={DIALOG_INPUT_CLASS} />
              </label>
              <label className="space-y-2">
                <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">安全责任部门</div>
                <input value={form.securityOwnerDept} onChange={(event) => updateField('securityOwnerDept', event.target.value)} className={DIALOG_INPUT_CLASS} />
              </label>
              <SelectField label="安全分类" value={form.securityCategoryId} options={options.securityCategoryOptions} onChange={(value) => updateField('securityCategoryId', value)} placeholder="请选择安全分类" />
              <SelectField label="安全等级" value={form.securityLevelId} options={options.securityLevelOptions} onChange={(value) => updateField('securityLevelId', value)} placeholder="请选择安全等级" />
              <SelectField label="数据主体类型" value={form.dataSubjectTypeId} options={options.dataSubjectTypeOptions} onChange={(value) => updateField('dataSubjectTypeId', value)} placeholder="请选择数据主体类型" />
              <SelectField label="安全责任人" value={form.securityOwnerUserId} options={options.securityOwnerUserOptions} onChange={(value) => updateField('securityOwnerUserId', value)} placeholder="请选择安全责任人" />
              <SelectField label="档案状态" value={form.securityProfileStatus} options={options.securityProfileStatusOptions} onChange={(value) => updateField('securityProfileStatus', value)} placeholder="请选择档案状态" renderLabel={resolveSecurityStatusLabel} />
              <SelectField label="复核状态" value={form.securityReviewStatus} options={options.securityReviewStatusOptions} onChange={(value) => updateField('securityReviewStatus', value)} placeholder="请选择复核状态" renderLabel={resolveSecurityStatusLabel} />
              <SelectField label="共享范围" value={form.shareScope} options={options.shareScopeOptions} onChange={(value) => updateField('shareScope', value)} placeholder="请选择共享范围" renderLabel={resolveSecurityScopeLabel} />
              <SelectField label="访问范围" value={form.accessScope} options={options.accessScopeOptions} onChange={(value) => updateField('accessScope', value)} placeholder="请选择访问范围" renderLabel={resolveSecurityScopeLabel} />
              <SelectField label="审批模式" value={form.approvalMode} options={options.approvalModeOptions} onChange={(value) => updateField('approvalMode', value)} placeholder="请选择审批模式" renderLabel={resolveSecurityScopeLabel} />
              <SelectField label="脱敏方式" value={form.desensitizationMode} options={options.desensitizationModeOptions} onChange={(value) => updateField('desensitizationMode', value)} placeholder="请选择脱敏方式" renderLabel={resolveSecurityScopeLabel} />
              <SelectField label="导出范围" value={form.exportScope} options={options.exportScopeOptions} onChange={(value) => updateField('exportScope', value)} placeholder="请选择导出范围" renderLabel={resolveSecurityScopeLabel} />
              <SelectField label="API 鉴权方式" value={form.apiAuthMode} options={options.apiAuthModeOptions} onChange={(value) => updateField('apiAuthMode', value)} placeholder="请选择 API 鉴权方式" renderLabel={resolveSecurityScopeLabel} />
              <SelectField label="策略状态" value={form.policyStatus} options={options.policyStatusOptions} onChange={(value) => updateField('policyStatus', value)} placeholder="请选择策略状态" renderLabel={resolveSecurityStatusLabel} />
              <label className="space-y-2">
                <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">最近复核时间</div>
                <input type="datetime-local" value={form.lastReviewedAt} onChange={(event) => updateField('lastReviewedAt', event.target.value)} className={DIALOG_INPUT_CLASS} />
              </label>
              <label className="space-y-2">
                <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">下次复核时间</div>
                <input type="date" value={form.nextReviewAt} onChange={(event) => updateField('nextReviewAt', event.target.value)} className={DIALOG_INPUT_CLASS} />
              </label>
              <label className="space-y-2">
                <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">生效日期</div>
                <input type="date" value={form.effectiveFrom} onChange={(event) => updateField('effectiveFrom', event.target.value)} className={DIALOG_INPUT_CLASS} />
              </label>
              <label className="space-y-2">
                <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">失效日期</div>
                <input type="date" value={form.effectiveTo} onChange={(event) => updateField('effectiveTo', event.target.value)} className={DIALOG_INPUT_CLASS} />
              </label>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CheckboxField label={`重要数据标识：${resolveSecurityBooleanLabel(form.importantDataFlag)}`} checked={form.importantDataFlag} onChange={(checked) => updateField('importantDataFlag', checked)} />
              <CheckboxField label={`核心管控对象：${resolveSecurityBooleanLabel(form.coreControlFlag)}`} checked={form.coreControlFlag} onChange={(checked) => updateField('coreControlFlag', checked)} />
              <CheckboxField label={`要求外部共享：${resolveSecurityBooleanLabel(form.externalShareAllowed)}`} checked={form.externalShareAllowed} onChange={(checked) => updateField('externalShareAllowed', checked)} />
              <CheckboxField label={`要求开放控制：${resolveSecurityBooleanLabel(form.openAllowed)}`} checked={form.openAllowed} onChange={(checked) => updateField('openAllowed', checked)} />
              <CheckboxField label={`要求脱敏：${resolveSecurityBooleanLabel(form.desensitizationRequired)}`} checked={form.desensitizationRequired} onChange={(checked) => updateField('desensitizationRequired', checked)} />
              <CheckboxField label={`要求审批：${resolveSecurityBooleanLabel(form.approvalRequired)}`} checked={form.approvalRequired} onChange={(checked) => updateField('approvalRequired', checked)} />
              <CheckboxField label={`要求导出控制：${resolveSecurityBooleanLabel(form.exportAllowed)}`} checked={form.exportAllowed} onChange={(checked) => updateField('exportAllowed', checked)} />
              <CheckboxField label={`要求 API 鉴权：${resolveSecurityBooleanLabel(form.apiAccessAllowed)}`} checked={form.apiAccessAllowed} onChange={(checked) => updateField('apiAccessAllowed', checked)} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2 lg:col-span-2">
                <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">定级依据</div>
                <textarea value={form.assessmentBasis} onChange={(event) => updateField('assessmentBasis', event.target.value)} rows={4} className={DIALOG_TEXTAREA_CLASS} />
              </label>
              <label className="space-y-2 lg:col-span-2">
                <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">风险说明</div>
                <textarea value={form.riskNotes} onChange={(event) => updateField('riskNotes', event.target.value)} rows={4} className={DIALOG_TEXTAREA_CLASS} />
              </label>
              <label className="space-y-2">
                <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">策略编号</div>
                <input value={form.policyCode} onChange={(event) => updateField('policyCode', event.target.value)} className={DIALOG_INPUT_CLASS} />
              </label>
              <label className="space-y-2">
                <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">策略名称</div>
                <input value={form.policyName} onChange={(event) => updateField('policyName', event.target.value)} className={DIALOG_INPUT_CLASS} />
              </label>
              <label className="space-y-2 lg:col-span-2">
                <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">备注</div>
                <textarea value={form.remarks} onChange={(event) => updateField('remarks', event.target.value)} rows={3} className={DIALOG_TEXTAREA_CLASS} />
              </label>
            </section>
          </>
        )}
      </div>
    </DialogFrame>
  )
}

export function SecurityGovernanceFieldEditDialog({
  open,
  record,
  onClose,
  onSaved,
}: SecurityGovernanceFieldEditDialogProps) {
  const { data, isLoading, error } = useEditableSecurityGovernanceFieldRows(record, open)
  const [rows, setRows] = useState<EditableSecurityGovernanceFieldRow[] | null>(null)
  const [options, setOptions] = useState<SecurityGovernanceEditSupportOptions | null>(null)
  const [isOptionsLoading, setIsOptionsLoading] = useState(false)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setRows(data)
    setSaveError(null)
  }, [data, open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setIsOptionsLoading(true)
    setOptionsError(null)
    void fetchSecurityGovernanceEditSupportOptions()
      .then((payload) => {
        if (cancelled) return
        setOptions(payload)
      })
      .catch((currentError) => {
        if (cancelled) return
        setOptionsError(toErrorMessage(currentError, '读取字段安全编辑选项失败'))
      })
      .finally(() => {
        if (!cancelled) setIsOptionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const updateRow = <K extends keyof EditableSecurityGovernanceFieldRow>(rowId: string, key: K, value: EditableSecurityGovernanceFieldRow[K]) => {
    setRows((current) => current?.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)) ?? current)
  }

  const handleSave = async () => {
    if (!record || !rows) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await saveEditableSecurityGovernanceFieldRows(record, rows)
      await onSaved()
      onClose()
    } catch (currentError) {
      setSaveError(toErrorMessage(currentError, '保存字段安全信息失败'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DialogFrame
      open={open}
      title="编辑字段安全"
      description="直接写回 eco_resource_security_policies 中的字段级分类分级与策略要求 JSON。"
      onClose={onClose}
      maxWidthClass="max-w-7xl"
      footer={(
        <>
          <button type="button" onClick={onClose} className={DIALOG_SECONDARY_BUTTON_CLASS}>取消</button>
          <button
            type="button"
            onClick={() => { void handleSave() }}
            disabled={!rows || isLoading || isOptionsLoading || isSaving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-5 text-[0.8125rem] font-semibold text-white shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.2)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? '保存中...' : '保存'}
          </button>
        </>
      )}
    >
      <div className="space-y-5">
        {error ? <div className={DIALOG_ERROR_PANEL_CLASS}>{error}</div> : null}
        {optionsError ? <div className={DIALOG_ERROR_PANEL_CLASS}>{optionsError}</div> : null}
        {saveError ? <div className={DIALOG_ERROR_PANEL_CLASS}>{saveError}</div> : null}

        <div className="rounded-2xl border border-[var(--dialog-panel-border)] bg-[linear-gradient(180deg,var(--dialog-panel-bg-start),var(--dialog-panel-bg-end))] px-4 py-4">
          <div>
            <div className="text-[1.0625rem] font-semibold text-[var(--dialog-heading)]">字段安全清单</div>
            <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">字段基础信息已预置，这里只允许维护安全相关信息。</div>
          </div>
        </div>

        {!rows || isLoading || !options ? (
          <div className="rounded-xl border border-[var(--dialog-panel-border)] bg-[linear-gradient(180deg,var(--dialog-panel-bg-start),var(--dialog-panel-bg-end))] px-4 py-10 text-center text-[0.875rem] text-[var(--text-secondary)]">
            正在读取字段安全信息...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-[12px] border border-[var(--dialog-table-border)] bg-[var(--dialog-table-surface)] px-4 py-10 text-center text-[0.8125rem] text-[var(--text-muted)]">
            当前还没有字段安全记录。
          </div>
        ) : (
          <div className="overflow-auto rounded-[12px] border border-[var(--dialog-table-border)] bg-[var(--dialog-table-surface)] shadow-[0_14px_28px_var(--dialog-table-shadow)]">
            <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 w-[72px] border-b border-[var(--line-soft)] bg-[var(--dialog-table-header-index-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--dialog-table-header-text)]">#</th>
                  <th className="sticky top-0 z-10 border-b border-l border-[var(--line-soft)] bg-[var(--dialog-table-header-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--dialog-table-header-text)]">字段编码</th>
                  <th className="sticky top-0 z-10 border-b border-l border-[var(--line-soft)] bg-[var(--dialog-table-header-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--dialog-table-header-text)]">字段名称</th>
                  <th className="sticky top-0 z-10 border-b border-l border-[var(--line-soft)] bg-[var(--dialog-table-header-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--dialog-table-header-text)]">分类分级</th>
                  <th className="sticky top-0 z-10 border-b border-l border-[var(--line-soft)] bg-[var(--dialog-table-header-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--dialog-table-header-text)]">敏感类型</th>
                  <th className="sticky top-0 z-10 border-b border-l border-[var(--line-soft)] bg-[var(--dialog-table-header-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--dialog-table-header-text)]">访问范围</th>
                  <th className="sticky top-0 z-10 border-b border-l border-[var(--line-soft)] bg-[var(--dialog-table-header-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--dialog-table-header-text)]">脱敏方式</th>
                  <th className="sticky top-0 z-10 border-b border-l border-[var(--line-soft)] bg-[var(--dialog-table-header-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--dialog-table-header-text)]">导出范围</th>
                  <th className="sticky top-0 z-10 border-b border-l border-[var(--line-soft)] bg-[var(--dialog-table-header-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--dialog-table-header-text)]">API 访问</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="align-top odd:bg-[var(--dialog-table-surface)] even:bg-[var(--dialog-table-row-alt)]">
                    <td className="border-b border-[var(--line-soft)] bg-[var(--dialog-table-index-bg)] px-3 py-3 text-[0.75rem] text-[var(--text-muted)]">{index + 1}</td>
                    <td className="border-b border-l border-[var(--line-soft)] px-3 py-3 text-[0.8125rem] font-medium text-[var(--text-main)]">{row.fieldCode || '未标注'}</td>
                    <td className="border-b border-l border-[var(--line-soft)] px-3 py-3 text-[0.8125rem] text-[var(--text-secondary)]">{row.fieldName || '未标注'}</td>
                    <td className="border-b border-l border-[var(--line-soft)] px-3 py-3">
                      <div className="grid gap-2">
                        <input value={row.informationCategory} onChange={(event) => updateRow(row.id, 'informationCategory', event.target.value)} placeholder="信息分类" className={DIALOG_INPUT_CLASS} />
                        <input value={row.classificationLevel} onChange={(event) => updateRow(row.id, 'classificationLevel', event.target.value)} placeholder="分类分级" className={DIALOG_INPUT_CLASS} />
                        <input value={row.securityLevel} onChange={(event) => updateRow(row.id, 'securityLevel', event.target.value)} placeholder="安全等级" className={DIALOG_INPUT_CLASS} />
                      </div>
                    </td>
                    <td className="border-b border-l border-[var(--line-soft)] px-3 py-3">
                      <div className="grid gap-2">
                        <input value={row.sensitivityType} onChange={(event) => updateRow(row.id, 'sensitivityType', event.target.value)} placeholder="敏感类型" className={DIALOG_INPUT_CLASS} />
                        <label className="flex items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                          <input type="checkbox" checked={row.importantFieldFlag} onChange={(event) => updateRow(row.id, 'importantFieldFlag', event.target.checked)} />
                          重要字段
                        </label>
                        <label className="flex items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                          <input type="checkbox" checked={row.identifierFlag} onChange={(event) => updateRow(row.id, 'identifierFlag', event.target.checked)} />
                          标识字段
                        </label>
                        <label className="flex items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                          <input type="checkbox" checked={row.quasiIdentifierFlag} onChange={(event) => updateRow(row.id, 'quasiIdentifierFlag', event.target.checked)} />
                          准标识字段
                        </label>
                      </div>
                    </td>
                    <td className="border-b border-l border-[var(--line-soft)] px-3 py-3">
                      <select value={row.requiredAccessScope} onChange={(event) => updateRow(row.id, 'requiredAccessScope', event.target.value)} className={DIALOG_INPUT_CLASS}>
                        <option value="">请选择</option>
                        {options.accessScopeOptions.map((option) => <option key={option.value} value={option.value}>{resolveSecurityScopeLabel(option.value)}</option>)}
                      </select>
                    </td>
                    <td className="border-b border-l border-[var(--line-soft)] px-3 py-3">
                      <div className="grid gap-2">
                        <label className="flex items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                          <input type="checkbox" checked={row.requiredDesensitization} onChange={(event) => updateRow(row.id, 'requiredDesensitization', event.target.checked)} />
                          要求脱敏
                        </label>
                        <select value={row.requiredDesensitizationMode} onChange={(event) => updateRow(row.id, 'requiredDesensitizationMode', event.target.value)} className={DIALOG_INPUT_CLASS}>
                          <option value="">请选择</option>
                          {options.desensitizationModeOptions.map((option) => <option key={option.value} value={option.value}>{resolveSecurityScopeLabel(option.value)}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="border-b border-l border-[var(--line-soft)] px-3 py-3">
                      <div className="grid gap-2">
                        <label className="flex items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                          <input type="checkbox" checked={row.requiredExportAllowed} onChange={(event) => updateRow(row.id, 'requiredExportAllowed', event.target.checked)} />
                          要求导出
                        </label>
                        <select value={row.requiredExportScope} onChange={(event) => updateRow(row.id, 'requiredExportScope', event.target.value)} className={DIALOG_INPUT_CLASS}>
                          <option value="">请选择</option>
                          {options.exportScopeOptions.map((option) => <option key={option.value} value={option.value}>{resolveSecurityScopeLabel(option.value)}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="border-b border-l border-[var(--line-soft)] px-3 py-3">
                      <div className="grid gap-2">
                        <label className="flex items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                          <input type="checkbox" checked={row.requiredApiAccessAllowed} onChange={(event) => updateRow(row.id, 'requiredApiAccessAllowed', event.target.checked)} />
                          要求 API 访问
                        </label>
                        <label className="flex items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                          <input type="checkbox" checked={row.requiredApprovalRequired} onChange={(event) => updateRow(row.id, 'requiredApprovalRequired', event.target.checked)} />
                          要求审批
                        </label>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DialogFrame>
  )
}
