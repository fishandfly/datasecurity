import { Plus, Save, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  saveEditableResourceLinkInfo,
  useEditableResourceLinkInfo,
  type EditableResourceLinkItem,
  type EditableResourceLinkRecord,
} from '../lib/nocobase-resource-edit'
import { toErrorMessage } from '../lib/nocobase-client'

type ResourceLinkEditDialogProps = {
  open: boolean
  resourceId?: string
  onClose: () => void
  onSaved: () => Promise<void> | void
}

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

function createEmptyLinkItem(): EditableResourceLinkItem {
  return {
    id: `link-row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    url: '',
    description: '',
  }
}

function cloneForm(record: EditableResourceLinkRecord): EditableResourceLinkRecord {
  return {
    primary: record.primary,
    items: record.items.map((item) => ({ ...item })),
  }
}

export function ResourceLinkEditDialog({
  open,
  resourceId,
  onClose,
  onSaved,
}: ResourceLinkEditDialogProps) {
  const { data, isLoading, error } = useEditableResourceLinkInfo(resourceId, open)
  const [form, setForm] = useState<EditableResourceLinkRecord | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(cloneForm(data))
    setSaveError(null)
  }, [data, open])

  if (!open) return null

  const updateItem = <K extends keyof EditableResourceLinkItem>(
    itemId: string,
    key: K,
    value: EditableResourceLinkItem[K],
  ) => {
    setForm((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.map((item) => (item.id === itemId ? { ...item, [key]: value } : item)),
      }
    })
  }

  const handleAddItem = () => {
    setForm((current) => {
      if (!current) return current
      return {
        ...current,
        items: [...current.items, createEmptyLinkItem()],
      }
    })
  }

  const handleRemoveItem = (itemId: string) => {
    setForm((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.filter((item) => item.id !== itemId),
      }
    })
  }

  const handleSave = async () => {
    if (!resourceId || !form) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await saveEditableResourceLinkInfo(resourceId, form)
      await onSaved()
      onClose()
    } catch (currentError) {
      setSaveError(toErrorMessage(currentError, '保存链接信息失败'))
    } finally {
      setIsSaving(false)
    }
  }

  const isSubmitDisabled = !resourceId || isLoading || isSaving || !form

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--dialog-overlay)] px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[24px] border border-[var(--dialog-surface-border)] bg-[var(--dialog-surface)] shadow-[0_28px_80px_var(--dialog-shadow)]">
        <div className="flex items-center justify-between border-b border-[var(--dialog-divider)] px-6 py-5">
          <div>
            <div className="text-[1.25rem] font-semibold text-[var(--text-main)]">编辑链接信息</div>
            <div className="mt-1 text-[0.8125rem] text-[var(--text-muted)]">维护主链接与明细链接，保存后会直接写回后台。</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--dialog-input-border)] bg-[var(--dialog-soft-button-bg)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-144px)] overflow-y-auto px-6 py-5">
          {isLoading || !form ? (
            <div className={DIALOG_STATUS_PANEL_CLASS}>正在读取链接信息...</div>
          ) : (
            <div className="space-y-6">
              {error ? <div className={DIALOG_ERROR_PANEL_CLASS}>{error}</div> : null}
              {saveError ? <div className={DIALOG_ERROR_PANEL_CLASS}>{saveError}</div> : null}

              <section className="rounded-2xl border border-[var(--dialog-panel-border)] bg-[linear-gradient(180deg,var(--dialog-panel-bg-start),var(--dialog-panel-bg-end))] p-4">
                <label className="space-y-2">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">主链接</div>
                  <input
                    value={form.primary}
                    onChange={(event) => setForm((current) => (current ? { ...current, primary: event.target.value } : current))}
                    placeholder="请输入主访问链接"
                    className={DIALOG_INPUT_CLASS}
                  />
                </label>
              </section>

              <section className="space-y-4 rounded-2xl border border-[var(--dialog-panel-border)] bg-[linear-gradient(180deg,var(--dialog-panel-bg-start),var(--dialog-panel-bg-end))] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[0.9375rem] font-semibold text-[var(--text-main)]">明细链接</div>
                    <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">可维护链接名称、URL 和补充说明。</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className={DIALOG_SECONDARY_BUTTON_CLASS}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    新增链接
                  </button>
                </div>

                {form.items.length === 0 ? (
                  <div className={DIALOG_STATUS_PANEL_CLASS}>当前没有维护任何明细链接，可先新增一条。</div>
                ) : (
                  <div className="space-y-4">
                    {form.items.map((item, index) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-[var(--dialog-input-border)] bg-[var(--dialog-input-bg)] p-4 shadow-[0_12px_24px_rgba(39,80,120,0.06)]"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">链接 {String(index + 1).padStart(2, '0')}</div>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--dialog-input-border)] bg-[var(--dialog-soft-button-bg)] px-3 text-[0.75rem] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--status-danger-border)] hover:text-[var(--status-danger-text)]"
                          >
                            <Trash2 className="mr-1.5 h-4 w-4" />
                            删除
                          </button>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                          <label className="space-y-2">
                            <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">链接名称</div>
                            <input
                              value={item.label}
                              onChange={(event) => updateItem(item.id, 'label', event.target.value)}
                              placeholder="例如：服务地址、在线预览"
                              className={DIALOG_INPUT_CLASS}
                            />
                          </label>
                          <label className="space-y-2">
                            <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">链接地址</div>
                            <input
                              value={item.url}
                              onChange={(event) => updateItem(item.id, 'url', event.target.value)}
                              placeholder="请输入 URL"
                              className={DIALOG_INPUT_CLASS}
                            />
                          </label>
                          <label className="space-y-2 lg:col-span-2">
                            <div className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">说明</div>
                            <textarea
                              value={item.description}
                              onChange={(event) => updateItem(item.id, 'description', event.target.value)}
                              rows={3}
                              placeholder="补充说明、鉴权要求或用途描述"
                              className={DIALOG_TEXTAREA_CLASS}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
