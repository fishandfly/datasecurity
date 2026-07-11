import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Save, X } from 'lucide-react'
import {
  createCategoryLookup,
  createInitialExpandedCategoryIds,
  toggleExpandedCategoryId,
  type CatalogCategoryTreeNode,
} from '../lib/catalog-category-tree'
import type { SelectOption } from '../lib/nocobase-portal-data'
import {
  createEditableResource,
  createEmptyEditableResource,
  saveEditableResource,
  useEditableResource,
  type EditableResourceRecord,
} from '../lib/nocobase-resource-edit'
import { toErrorMessage } from '../lib/nocobase-client'

type ResourceEditDialogProps = {
  open: boolean
  mode?: 'edit' | 'create'
  variant?: 'modal' | 'drawer'
  resourceId?: string
  initialValues?: Partial<EditableResourceRecord>
  categoryTree: CatalogCategoryTreeNode[]
  informationCategoryTree: CatalogCategoryTreeNode[]
  sourceTree: CatalogCategoryTreeNode[]
  regionTree: CatalogCategoryTreeNode[]
  editOptions: {
    updateCycleOptions: SelectOption[]
    sharingAttributeOptions: SelectOption[]
    serviceTypeOptions: SelectOption[]
    supplyMethodOptions: SelectOption[]
  }
  onClose: () => void
  onSaved: () => Promise<void> | void
}

function splitTags(value: string) {
  return value
    .split(/[、,，;；\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const DIALOG_TREE_PANEL_CLASS =
  'space-y-3 rounded-2xl border border-[var(--dialog-panel-border)] bg-[linear-gradient(180deg,var(--dialog-panel-bg-start),var(--dialog-panel-bg-end))] p-4'
const DIALOG_TREE_LIST_CLASS =
  'max-h-60 overflow-y-auto rounded-xl border border-[var(--dialog-table-border)] bg-[var(--dialog-table-surface)] p-2'
const DIALOG_INPUT_CLASS =
  'h-11 w-full rounded-xl border border-[var(--dialog-input-border)] bg-[var(--dialog-input-bg)] px-4 text-[0.875rem] text-[var(--dialog-input-text)] outline-none placeholder:text-[var(--dialog-input-placeholder)]'
const DIALOG_TEXTAREA_CLASS =
  'w-full rounded-xl border border-[var(--dialog-input-border)] bg-[var(--dialog-input-bg)] px-4 py-3 text-[0.875rem] leading-7 text-[var(--dialog-input-text)] outline-none placeholder:text-[var(--dialog-input-placeholder)]'
const DIALOG_SECONDARY_BUTTON_CLASS =
  'inline-flex h-11 items-center justify-center rounded-xl border border-[var(--dialog-input-border)] bg-[var(--dialog-soft-button-bg)] px-5 text-[0.8125rem] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]'
const DIALOG_STATUS_PANEL_CLASS =
  'rounded-xl border border-[var(--dialog-panel-border)] bg-[linear-gradient(180deg,var(--dialog-panel-bg-start),var(--dialog-panel-bg-end))] px-4 py-10 text-center text-[0.875rem] text-[var(--text-secondary)]'
const DIALOG_ERROR_PANEL_CLASS =
  'rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]'

function TreeSelectField({
  label,
  tree,
  value,
  onChange,
}: {
  label: string
  tree: CatalogCategoryTreeNode[]
  value: string
  onChange: (nextValue: string, label: string) => void
}) {
  const lookup = useMemo(() => createCategoryLookup(flattenTree(tree)), [tree])
  const [expandedIds, setExpandedIds] = useState<string[]>(() => createInitialExpandedCategoryIds(tree, value))

  useEffect(() => {
    setExpandedIds(createInitialExpandedCategoryIds(tree, value))
  }, [tree, value])

  const selectedLabel = value ? lookup.byId.get(value)?.pathLabel ?? lookup.byId.get(value)?.name ?? '未找到对应节点' : '未选择'

  const renderNode = (node: CatalogCategoryTreeNode) => {
    const isExpanded = expandedIds.includes(node.id)
    const isSelected = node.id === value
    return (
      <div key={node.id}>
        <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${node.depth * 14}px` }}>
          {node.children.length > 0 ? (
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--dialog-row-hover-bg)]"
              onClick={() => setExpandedIds((current) => toggleExpandedCategoryId(current, node.id))}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="inline-flex h-6 w-6" />
          )}
          <button
            type="button"
            onClick={() => onChange(node.id, node.pathLabel || node.label)}
            className={`flex-1 rounded-lg px-3 py-2 text-left text-[0.8125rem] transition ${
              isSelected
                ? 'bg-[rgba(var(--theme-soft-rgb),0.16)] font-semibold text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(var(--theme-strong-rgb),0.18)]'
                : 'text-[var(--text-main)] hover:bg-[var(--dialog-row-hover-bg)]'
            }`}
          >
            {node.label}
          </button>
        </div>
        {node.children.length > 0 && isExpanded ? <div>{node.children.map(renderNode)}</div> : null}
      </div>
    )
  }

  return (
    <div className={DIALOG_TREE_PANEL_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">{label}</div>
        <div className="text-[0.75rem] text-[var(--text-muted)]">{selectedLabel}</div>
      </div>
      <div className={DIALOG_TREE_LIST_CLASS}>
        {tree.length > 0 ? tree.map(renderNode) : <div className="px-3 py-6 text-center text-[0.75rem] text-[var(--text-muted)]">暂无可选节点</div>}
      </div>
    </div>
  )
}

function flattenTree(tree: CatalogCategoryTreeNode[]) {
  const rows: Array<{ id: string; name: string; parentId: string | null }> = []
  const visit = (node: CatalogCategoryTreeNode, parentId: string | null) => {
    rows.push({ id: node.id, name: node.label, parentId })
    node.children.forEach((child) => visit(child, node.id))
  }
  tree.forEach((node) => visit(node, null))
  return rows
}

export function ResourceEditDialog({
  open,
  mode = 'edit',
  variant = 'modal',
  resourceId,
  initialValues,
  categoryTree,
  informationCategoryTree,
  sourceTree,
  regionTree,
  editOptions,
  onClose,
  onSaved,
}: ResourceEditDialogProps) {
  const { data, isLoading, error } = useEditableResource(resourceId, open && mode === 'edit')
  const [form, setForm] = useState<EditableResourceRecord | null>(null)
  const [tagsText, setTagsText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const nextData = mode === 'create'
      ? { ...createEmptyEditableResource(), ...initialValues }
      : data
    setForm(nextData)
    setTagsText(nextData.tags.join('、'))
    setSaveError(null)
  }, [data, initialValues, mode, open])

  if (!open) return null

  const isDrawer = variant === 'drawer'
  const overlayClass = isDrawer
    ? 'fixed inset-0 z-50 flex justify-end bg-[var(--dialog-overlay)]'
    : 'fixed inset-0 z-50 flex items-center justify-center bg-[var(--dialog-overlay)] px-4 py-6'
  const panelClass = isDrawer
    ? 'flex h-full w-full max-w-[860px] flex-col overflow-hidden border-l border-[var(--dialog-surface-border)] bg-[var(--dialog-surface)] shadow-[0_28px_80px_var(--dialog-shadow)]'
    : 'max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[24px] border border-[var(--dialog-surface-border)] bg-[var(--dialog-surface)] shadow-[0_28px_80px_var(--dialog-shadow)]'
  const bodyClass = isDrawer
    ? 'min-h-0 flex-1 overflow-y-auto px-6 py-5'
    : 'max-h-[calc(92vh-144px)] overflow-y-auto px-6 py-5'

  const updateField = <K extends keyof EditableResourceRecord>(key: K, value: EditableResourceRecord[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }
  const isSubmitDisabled = isLoading || isSaving || !form || (mode === 'create' && (!form.resourceCode.trim() || !form.resourceName.trim()))

  const handleSave = async () => {
    if (!form) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const nextValues: EditableResourceRecord = {
        ...form,
        tags: splitTags(tagsText),
      }
      if (mode === 'create') {
        await createEditableResource(nextValues)
      } else if (resourceId) {
        await saveEditableResource(resourceId, nextValues)
      }
      await onSaved()
      onClose()
    } catch (currentError) {
      setSaveError(toErrorMessage(currentError, mode === 'create' ? '新建资源失败' : '保存资源信息失败'))
    } finally {
      setIsSaving(false)
    }
  }

  const dialog = (
    <div className={overlayClass}>
      <div className={panelClass}>
        <div className="flex items-center justify-between border-b border-[var(--dialog-divider)] px-6 py-5">
          <div>
            <div className="text-[1.25rem] font-semibold text-[var(--text-main)]">{mode === 'create' ? '新建数据资源' : '编辑资源'}</div>
            <div className="mt-1 text-[0.8125rem] text-[var(--text-muted)]">
              {mode === 'create' ? '支持文本框、下拉框和分类树输入，提交后直接创建到后台。' : '支持文本框、下拉框和分类树输入，保存后直接写回后台。'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--dialog-input-border)] bg-[var(--dialog-soft-button-bg)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={bodyClass}>
          {((mode === 'edit' && isLoading) || !form) ? (
            <div className={DIALOG_STATUS_PANEL_CLASS}>
              {mode === 'create' ? '正在初始化新建资源表单...' : '正在读取可编辑资源详情...'}
            </div>
          ) : (
            <div className="space-y-6">
              {error ? (
                <div className={DIALOG_ERROR_PANEL_CLASS}>{error}</div>
              ) : null}
              {saveError ? (
                <div className={DIALOG_ERROR_PANEL_CLASS}>{saveError}</div>
              ) : null}

              <section className="grid gap-4 lg:grid-cols-2">
                {mode === 'create' ? (
                  <label className="space-y-2">
                    <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">资源编码</div>
                    <input
                      value={form.resourceCode}
                      onChange={(event) => updateField('resourceCode', event.target.value)}
                      className={DIALOG_INPUT_CLASS}
                    />
                  </label>
                ) : null}
                <label className="space-y-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">资源名称</div>
                  <input
                    value={form.resourceName}
                    onChange={(event) => updateField('resourceName', event.target.value)}
                    className={DIALOG_INPUT_CLASS}
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">联系方式</div>
                  <input
                    value={form.contactInfo}
                    onChange={(event) => updateField('contactInfo', event.target.value)}
                    className={DIALOG_INPUT_CLASS}
                  />
                </label>
                <label className="space-y-2 lg:col-span-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">摘要</div>
                  <textarea
                    value={form.summary}
                    onChange={(event) => updateField('summary', event.target.value)}
                    rows={4}
                    className={DIALOG_TEXTAREA_CLASS}
                  />
                </label>
                <label className="space-y-2 lg:col-span-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">标签</div>
                  <textarea
                    value={tagsText}
                    onChange={(event) => setTagsText(event.target.value)}
                    rows={2}
                    placeholder="多个标签可用顿号、逗号或换行分隔"
                    className={DIALOG_TEXTAREA_CLASS}
                  />
                </label>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">共享属性</div>
                  <select
                    value={form.sharingAttributeId}
                    onChange={(event) => updateField('sharingAttributeId', event.target.value)}
                    className={DIALOG_INPUT_CLASS}
                  >
                    <option value="">请选择共享属性</option>
                    {editOptions.sharingAttributeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">资源类型</div>
                  <select
                    value={form.dataResourceTypeId}
                    onChange={(event) => updateField('dataResourceTypeId', event.target.value)}
                    className={DIALOG_INPUT_CLASS}
                  >
                    <option value="">请选择资源类型</option>
                    {editOptions.serviceTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">供给方式</div>
                  <select
                    value={form.supplyMethodId}
                    onChange={(event) => updateField('supplyMethodId', event.target.value)}
                    className={DIALOG_INPUT_CLASS}
                  >
                    <option value="">请选择供给方式</option>
                    {editOptions.supplyMethodOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">更新周期</div>
                  <select
                    value={form.updateCycleId}
                    onChange={(event) => updateField('updateCycleId', event.target.value)}
                    className={DIALOG_INPUT_CLASS}
                  >
                    <option value="">请选择更新周期</option>
                    {editOptions.updateCycleOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">时间范围</div>
                  <input
                    value={form.timeRange}
                    onChange={(event) => updateField('timeRange', event.target.value)}
                    className={DIALOG_INPUT_CLASS}
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">区域描述</div>
                  <input
                    value={form.regionCoverage}
                    onChange={(event) => updateField('regionCoverage', event.target.value)}
                    className={DIALOG_INPUT_CLASS}
                  />
                </label>
                <label className="space-y-2 lg:col-span-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">备注</div>
                  <textarea
                    value={form.remarks}
                    onChange={(event) => updateField('remarks', event.target.value)}
                    rows={3}
                    className={DIALOG_TEXTAREA_CLASS}
                  />
                </label>
              </section>

              <section className="grid gap-4 xl:grid-cols-3">
                <TreeSelectField
                  label="数据资源分类"
                  tree={categoryTree}
                  value={form.domainCategoryId}
                  onChange={(nextValue) => updateField('domainCategoryId', nextValue)}
                />
                <TreeSelectField
                  label="信息分类"
                  tree={informationCategoryTree}
                  value={form.informationCategoryId}
                  onChange={(nextValue) => updateField('informationCategoryId', nextValue)}
                />
                <TreeSelectField
                  label="来源单位"
                  tree={sourceTree}
                  value={form.providerNodeId}
                  onChange={(nextValue) => updateField('providerNodeId', nextValue)}
                />
                <TreeSelectField
                  label="区域范围"
                  tree={regionTree}
                  value={form.regionCategoryId}
                  onChange={(nextValue, label) => {
                    updateField('regionCategoryId', nextValue)
                    updateField('regionCoverage', label)
                  }}
                />
              </section>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--dialog-divider)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className={DIALOG_SECONDARY_BUTTON_CLASS}
          >
            取消
          </button>
              <button
                type="button"
                onClick={() => {
                  void handleSave()
                }}
                disabled={isSubmitDisabled}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-5 text-[0.8125rem] font-semibold text-white shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.2)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {isSaving ? (mode === 'create' ? '创建中...' : '保存中...') : mode === 'create' ? '创建' : '保存'}
              </button>
            </div>
          </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
