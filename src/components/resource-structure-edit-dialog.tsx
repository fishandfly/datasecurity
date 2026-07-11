import { Plus, Save, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  applyLineageNodeReference,
  buildLineageNodeReferences,
  findExactLineageNodeReference,
  mergeLineageRecordWithCatalogGraph,
  searchLineageNodeReferences,
  type LineageNodeReference,
} from '../lib/lineage-edit-helpers'
import { toErrorMessage } from '../lib/nocobase-client'
import { saveResourceStatBaseConfig } from '../lib/nocobase-resource-edit'
import type { CatalogItem, CatalogLineageNodeType } from '../lib/nocobase-portal-data'
import {
  saveResourceDataItems,
  saveResourceLineage,
  saveResourcePhysicalTables,
  useEditableResourceStructure,
  type EditableDataItemRow,
  type EditableLineageEdgeRow,
  type EditableLineageNodeRow,
  type EditableLineageRecord,
  type EditablePhysicalTableRow,
  type EditablePhysicalTablesRecord,
} from '../lib/nocobase-resource-structure-edit'

type StructureEditDialogProps = {
  open: boolean
  resourceId: string
  onClose: () => void
  onSaved: () => Promise<void> | void
}

type LineageEditDialogProps = StructureEditDialogProps & {
  catalogItems: CatalogItem[]
}

const PHYSICAL_TABLE_LAYER_OPTIONS = ['ods', 'dwd', 'dws', 'ads', 'dim']

const LINEAGE_NODE_TYPE_OPTIONS: Array<{ value: CatalogLineageNodeType; label: string }> = [
  { value: 'data_source', label: '数据源' },
  { value: 'warehouse_resource', label: '数据资源' },
  { value: 'warehouse_layer', label: '仓库分层' },
  { value: 'data_api', label: '数据 API' },
  { value: 'unknown', label: '未标注' },
]

const DIALOG_SECONDARY_BUTTON_CLASS =
  'inline-flex h-11 items-center justify-center rounded-xl border border-[var(--dialog-input-border)] bg-[var(--dialog-soft-button-bg)] px-5 text-[0.8125rem] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]'
const DIALOG_SECTION_PANEL_CLASS =
  'rounded-[16px] border border-[var(--dialog-panel-border)] bg-[linear-gradient(180deg,var(--dialog-panel-bg-start),var(--dialog-panel-bg-end))]'
const DIALOG_SECTION_HEADING_CLASS = 'text-[1.0625rem] font-semibold text-[var(--dialog-heading)]'
const DIALOG_ACTION_BUTTON_CLASS =
  'inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--dialog-soft-button-border)] bg-[var(--dialog-soft-button-bg)] px-4 text-[0.8125rem] font-semibold text-[var(--dialog-soft-button-text)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]'
const DIALOG_TABLE_WRAP_CLASS =
  'overflow-auto rounded-[12px] border border-[var(--dialog-table-border)] bg-[var(--dialog-table-surface)] shadow-[0_14px_28px_var(--dialog-table-shadow)]'
const DIALOG_TABLE_HEAD_INDEX_CLASS =
  'sticky top-0 z-10 w-[72px] border-b border-[var(--line-soft)] bg-[var(--dialog-table-header-index-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--dialog-table-header-text)]'
const DIALOG_TABLE_HEAD_CLASS =
  'sticky top-0 z-10 border-b border-l border-[var(--line-soft)] bg-[var(--dialog-table-header-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--dialog-table-header-text)]'
const DIALOG_TABLE_ROW_CLASS =
  'align-top odd:bg-[var(--dialog-table-surface)] even:bg-[var(--dialog-table-row-alt)]'
const DIALOG_TABLE_INDEX_CELL_CLASS =
  'border-b border-[var(--line-soft)] bg-[var(--dialog-table-index-bg)] px-3 py-3 text-[0.75rem] text-[var(--text-muted)]'
const DIALOG_TABLE_CELL_CLASS = 'border-b border-l border-[var(--line-soft)] px-3 py-3'
const DIALOG_FIELD_CLASS =
  'h-10 w-full rounded-[10px] border border-[var(--dialog-input-border)] bg-[var(--dialog-input-bg)] px-3 text-[0.8125rem] text-[var(--dialog-input-text)] outline-none placeholder:text-[var(--dialog-input-placeholder)] focus:border-[var(--primary)]'
const DIALOG_FIELD_TALL_CLASS =
  'w-full rounded-[10px] border border-[var(--dialog-input-border)] bg-[var(--dialog-input-bg)] px-3 py-2 text-[0.8125rem] leading-6 text-[var(--dialog-input-text)] outline-none placeholder:text-[var(--dialog-input-placeholder)] focus:border-[var(--primary)]'
const DIALOG_TAG_CLASS =
  'inline-flex rounded-full border border-[var(--dialog-chip-border)] bg-[var(--dialog-chip-bg)] px-2.5 py-1 text-[0.6875rem] font-medium text-[var(--dialog-chip-text)]'
const DIALOG_SEARCH_PANEL_CLASS =
  'mt-2 max-h-40 overflow-auto rounded-[10px] border border-[var(--dialog-panel-border)] bg-[var(--dialog-panel-bg-end)] p-2'
const DIALOG_SEARCH_RESULT_CLASS =
  'flex w-full items-start justify-between gap-3 rounded-[10px] border border-[var(--dialog-table-border)] bg-[var(--dialog-table-surface)] px-3 py-2 text-left transition hover:border-[var(--primary)] hover:bg-[var(--dialog-row-hover-bg)]'
const DIALOG_SEARCH_EMPTY_CLASS =
  'rounded-[10px] border border-dashed border-[var(--dialog-panel-border)] px-3 py-3 text-[0.6875rem] text-[var(--text-muted)]'
const DIALOG_DANGER_BUTTON_CLASS =
  'inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--dialog-danger-border)] bg-[var(--dialog-danger-bg)] text-[0.75rem] font-medium text-[var(--dialog-danger-text)] transition hover:border-[var(--dialog-danger-hover-border)] hover:bg-[var(--dialog-danger-hover-bg)]'

function createDraftId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeText(value: string) {
  return value.trim()
}

function parseStringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean)))
}

function buildLineageEdgeKey(fromId: string, toId: string) {
  const normalizedFromId = normalizeText(fromId)
  const normalizedToId = normalizeText(toId)
  if (!normalizedFromId || !normalizedToId) return ''
  return `${normalizedFromId}->${normalizedToId}`
}

function readExcludedNodeIds(rootExtra: Record<string, unknown>) {
  return parseStringList(rootExtra.excluded_node_ids ?? rootExtra.excludedNodeIds)
}

function readExcludedEdgeKeys(rootExtra: Record<string, unknown>) {
  return parseStringList(rootExtra.excluded_edge_keys ?? rootExtra.excludedEdgeKeys)
}

function writeLineageExclusions(
  rootExtra: Record<string, unknown>,
  excludedNodeIds: string[],
  excludedEdgeKeys: string[],
) {
  const {
    excluded_node_ids: _excludedNodeIdsSnake,
    excludedNodeIds: _excludedNodeIdsCamel,
    excluded_edge_keys: _excludedEdgeKeysSnake,
    excludedEdgeKeys: _excludedEdgeKeysCamel,
    ...restRootExtra
  } = rootExtra

  return {
    ...restRootExtra,
    ...(excludedNodeIds.length > 0 ? { excluded_node_ids: excludedNodeIds } : {}),
    ...(excludedEdgeKeys.length > 0 ? { excluded_edge_keys: excludedEdgeKeys } : {}),
  }
}

function cloneDataItems(rows: EditableDataItemRow[]) {
  return rows.map((row) => ({
    ...row,
    extra: { ...row.extra },
  }))
}

function clonePhysicalTables(record: EditablePhysicalTablesRecord): EditablePhysicalTablesRecord {
  return {
    ...record,
    rootExtra: { ...record.rootExtra },
    rows: record.rows.map((row) => ({
      ...row,
      extra: { ...row.extra },
    })),
  }
}

function cloneLineage(record: EditableLineageRecord): EditableLineageRecord {
  return {
    ...record,
    rootExtra: { ...record.rootExtra },
    nodes: record.nodes.map((node) => ({
      ...node,
      extra: { ...node.extra },
    })),
    edges: record.edges.map((edge) => ({
      ...edge,
      extra: { ...edge.extra },
    })),
  }
}

function DialogFrame({
  open,
  title,
  description,
  maxWidthClass = 'max-w-7xl',
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  description: string
  maxWidthClass?: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--dialog-overlay)] px-4 py-6">
      <div className={`max-h-[92vh] w-full ${maxWidthClass} overflow-hidden rounded-[24px] border border-[var(--dialog-surface-border)] bg-[var(--dialog-surface)] shadow-[0_28px_80px_var(--dialog-shadow)]`}>
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

        <div className="max-h-[calc(92vh-144px)] overflow-y-auto px-6 py-5">{children}</div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--dialog-divider)] px-6 py-4">
          {footer}
        </div>
      </div>
    </div>
  )
}

function LoadingPanel({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-[var(--dialog-panel-border)] bg-[linear-gradient(180deg,var(--dialog-panel-bg-start),var(--dialog-panel-bg-end))] px-4 py-10 text-center text-[0.875rem] text-[var(--text-secondary)]">
      {text}
    </div>
  )
}

function ErrorPanel({ tone = 'rose', text }: { tone?: 'rose' | 'amber'; text: string }) {
  const className =
    tone === 'amber'
      ? 'rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-warning-text)]'
      : 'rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]'
  return <div className={className}>{text}</div>
}

function EmptyTableState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-[var(--dialog-table-border)] bg-[var(--dialog-table-surface)] px-4 py-10 text-center text-[0.8125rem] text-[var(--text-muted)]">
      <div>{text}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function DataItemsEditDialog({ open, resourceId, onClose, onSaved }: StructureEditDialogProps) {
  const { data, isLoading, error } = useEditableResourceStructure(resourceId, open)
  const [rows, setRows] = useState<EditableDataItemRow[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setRows(null)
    setSaveError(null)
  }, [open, resourceId])

  useEffect(() => {
    if (!open) return
    if (data.resourceId !== resourceId) return
    setRows(cloneDataItems(data.dataItems))
    setSaveError(null)
  }, [data, open, resourceId])

  const handleAddRow = () => {
    setRows((current) => [
      ...(current ?? []),
      {
        id: createDraftId('data-item'),
        code: '',
        name: '',
        dataType: '',
        description: '',
        extra: {},
      },
    ])
  }

  const updateRow = <K extends keyof EditableDataItemRow>(rowId: string, key: K, value: EditableDataItemRow[K]) => {
    setRows((current) =>
      current?.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)) ?? current,
    )
  }

  const removeRow = (rowId: string) => {
    setRows((current) => current?.filter((row) => row.id !== rowId) ?? current)
  }

  const handleSave = async () => {
    if (!rows) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await saveResourceDataItems(resourceId, rows)
      await onSaved()
      onClose()
    } catch (currentError) {
      setSaveError(toErrorMessage(currentError, '保存数据项失败'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DialogFrame
      open={open}
      title="编辑数据项"
      description="直接维护字段编码、字段名称、数据类型、字段说明、字段分类分级和字段安全策略，保存后写回 data_items。"
      onClose={onClose}
      footer={
        <>
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
            disabled={isLoading || isSaving || rows === null}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-5 text-[0.8125rem] font-semibold text-white shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.2)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? '保存中...' : '保存'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <ErrorPanel text={error} /> : null}
        {saveError ? <ErrorPanel text={saveError} /> : null}

        {isLoading || rows === null ? (
          <LoadingPanel text="正在读取可编辑数据项..." />
        ) : (
          <>
            <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-4 ${DIALOG_SECTION_PANEL_CLASS}`}>
              <div>
                <div className={DIALOG_SECTION_HEADING_CLASS}>字段明细</div>
                <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">共 {rows.length} 行，删除空行后保存会自动更新字段数。</div>
              </div>
              <button
                type="button"
                onClick={handleAddRow}
                className={DIALOG_ACTION_BUTTON_CLASS}
              >
                <Plus className="h-4 w-4" />
                新增字段
              </button>
            </div>

            {rows.length === 0 ? (
              <EmptyTableState
                text="当前还没有字段记录。"
                action={
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className={DIALOG_ACTION_BUTTON_CLASS}
                  >
                    <Plus className="h-4 w-4" />
                    新增第一行
                  </button>
                }
              />
            ) : (
              <div className={DIALOG_TABLE_WRAP_CLASS}>
                <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-left">
                  <thead>
                    <tr>
                      <th className={DIALOG_TABLE_HEAD_INDEX_CLASS}>#</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[220px]`}>字段编码</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[240px]`}>字段名称</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[180px]`}>数据类型</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[220px]`}>字段分类分级</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[220px]`}>字段安全策略</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[360px]`}>字段说明</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} w-[110px]`}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.id} className={DIALOG_TABLE_ROW_CLASS}>
                        <td className={DIALOG_TABLE_INDEX_CELL_CLASS}>{index + 1}</td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <input
                            value={row.code}
                            onChange={(event) => updateRow(row.id, 'code', event.target.value)}
                            placeholder="如 pm25_value"
                            className={DIALOG_FIELD_CLASS}
                          />
                        </td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <input
                            value={row.name}
                            onChange={(event) => updateRow(row.id, 'name', event.target.value)}
                            placeholder="如 PM2.5 浓度"
                            className={DIALOG_FIELD_CLASS}
                          />
                        </td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <input
                            value={row.dataType}
                            onChange={(event) => updateRow(row.id, 'dataType', event.target.value)}
                            placeholder="如 varchar / decimal"
                            className={DIALOG_FIELD_CLASS}
                          />
                        </td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <input
                            value={String(row.extra.information_category ?? row.extra.informationCategory ?? row.extra.classification_level ?? row.extra.classificationLevel ?? '')}
                            onChange={(event) =>
                              setRows((current) =>
                                current?.map((currentRow) => (
                                  currentRow.id === row.id
                                    ? {
                                        ...currentRow,
                                        extra: {
                                          ...currentRow.extra,
                                          information_category: event.target.value,
                                        },
                                      }
                                    : currentRow
                                )) ?? current,
                              )
                            }
                            placeholder="如 二级敏感/企业基础信息"
                            className={DIALOG_FIELD_CLASS}
                          />
                        </td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <input
                            value={String(row.extra.security_policy ?? row.extra.securityPolicy ?? row.extra.open_type ?? row.extra.openType ?? row.extra.shared ?? '')}
                            onChange={(event) =>
                              setRows((current) =>
                                current?.map((currentRow) => (
                                  currentRow.id === row.id
                                    ? {
                                        ...currentRow,
                                        extra: {
                                          ...currentRow.extra,
                                          security_policy: event.target.value,
                                        },
                                      }
                                    : currentRow
                                )) ?? current,
                              )
                            }
                            placeholder="如 依申请开放"
                            className={DIALOG_FIELD_CLASS}
                          />
                        </td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <textarea
                            value={row.description}
                            onChange={(event) => updateRow(row.id, 'description', event.target.value)}
                            rows={2}
                            placeholder="字段含义、口径说明"
                            className={DIALOG_FIELD_TALL_CLASS}
                          />
                        </td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className={DIALOG_DANGER_BUTTON_CLASS}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </DialogFrame>
  )
}

export function PhysicalTablesEditDialog({ open, resourceId, onClose, onSaved }: StructureEditDialogProps) {
  const { data, isLoading, error } = useEditableResourceStructure(resourceId, open)
  const [form, setForm] = useState<EditablePhysicalTablesRecord | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(null)
    setSaveError(null)
  }, [open, resourceId])

  useEffect(() => {
    if (!open) return
    if (data.resourceId !== resourceId) return
    setForm(clonePhysicalTables(data.physicalTables))
    setSaveError(null)
  }, [data, open, resourceId])

  const updateRow = <K extends keyof EditablePhysicalTableRow>(rowId: string, key: K, value: EditablePhysicalTableRow[K]) => {
    setForm((current) => {
      if (!current) return current

      const currentRow = current.rows.find((row) => row.id === rowId)
      let nextRows = current.rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
      if (!currentRow) {
        return {
          ...current,
          rows: nextRows,
        }
      }

      if (key === 'isBaseline') {
        const nextIsBaseline = Boolean(value)
        nextRows = current.rows.map((row) => (
          row.id === rowId
            ? { ...row, isBaseline: nextIsBaseline }
            : nextIsBaseline
              ? { ...row, isBaseline: false }
              : row
        ))
      }

      const baselineRow = nextRows.find((row) => row.isBaseline)
      const isBaselineRow = currentRow.isBaseline
        || (normalizeText(current.baselineTable) && normalizeText(current.baselineTable) === normalizeText(currentRow.tableName))
      let nextBaselineTable = current.baselineTable
      let nextBaselineLayer = current.baselineLayer
      let nextFreshFieldName = current.freshFieldName

      if (baselineRow) {
        nextBaselineTable = baselineRow.tableName
        nextBaselineLayer = baselineRow.layer || current.baselineLayer
        nextFreshFieldName = baselineRow.freshFieldName
      } else if (isBaselineRow && key === 'tableName') {
        nextBaselineTable = String(value)
        nextBaselineLayer = current.baselineLayer
        nextFreshFieldName = current.freshFieldName
      } else if (isBaselineRow && key === 'layer') {
        nextBaselineLayer = String(value)
      } else if (isBaselineRow && key === 'freshFieldName') {
        nextFreshFieldName = String(value)
      } else if (!baselineRow && key === 'isBaseline' && !Boolean(value)) {
        nextBaselineTable = ''
        nextBaselineLayer = ''
        nextFreshFieldName = ''
      }

      return {
        ...current,
        baselineTable: nextBaselineTable,
        baselineLayer: nextBaselineLayer,
        freshFieldName: nextFreshFieldName,
        rows: nextRows,
      }
    })
  }

  const addRow = () => {
    setForm((current) =>
      current
        ? {
            ...current,
            rows: [
              ...current.rows,
              {
                id: createDraftId('physical-table'),
                tableName: '',
                layer: '',
                description: '',
                sourceSystem: current.currentSourceSystem,
                isBaseline: false,
                freshFieldName: '',
                extra: {},
              },
            ],
          }
        : current,
    )
  }

  const removeRow = (rowId: string) => {
    setForm((current) => {
      if (!current) return current
      const removedRow = current.rows.find((row) => row.id === rowId)
      const nextRows = current.rows.filter((row) => row.id !== rowId)
      const removedWasBaseline = Boolean(removedRow?.isBaseline)
      return {
        ...current,
        baselineTable: removedWasBaseline ? '' : current.baselineTable,
        baselineLayer: removedWasBaseline ? '' : current.baselineLayer,
        freshFieldName: removedWasBaseline ? '' : current.freshFieldName,
        rows: nextRows,
      }
    })
  }

  const handleSave = async () => {
    if (!form) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const baselineRow = form.rows.find((row) => row.isBaseline) ?? null
      await saveResourcePhysicalTables(resourceId, form)
      await saveResourceStatBaseConfig(resourceId, {
        baselineTable: baselineRow?.tableName ?? form.baselineTable,
        freshFieldName: baselineRow?.freshFieldName ?? form.freshFieldName,
      })
      await onSaved()
      onClose()
    } catch (currentError) {
      setSaveError(toErrorMessage(currentError, '保存物理表清单失败'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DialogFrame
      open={open}
      title="编辑物理表"
      description="维护物理表、基准标记、业务时间字段和分层，保存后写回 source_tablelist、source_table 与 stat_base。"
      onClose={onClose}
      footer={
        <>
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
            disabled={isLoading || isSaving || !form}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-5 text-[0.8125rem] font-semibold text-white shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.2)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? '保存中...' : '保存'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <ErrorPanel text={error} /> : null}
        {saveError ? <ErrorPanel text={saveError} /> : null}

        {isLoading || !form ? (
          <LoadingPanel text="正在读取可编辑物理表清单..." />
        ) : (
          <>
            <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-4 ${DIALOG_SECTION_PANEL_CLASS}`}>
              <div>
                <div className={DIALOG_SECTION_HEADING_CLASS}>物理表清单</div>
                <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">共 {form.rows.length} 行，基准表与业务时间字段请直接在表清单中维护。</div>
              </div>
              <button
                type="button"
                onClick={addRow}
                className={DIALOG_ACTION_BUTTON_CLASS}
              >
                <Plus className="h-4 w-4" />
                新增物理表
              </button>
            </div>

            {form.rows.length === 0 ? (
              <EmptyTableState
                text="当前还没有物理表记录。"
                action={
                  <button
                    type="button"
                    onClick={addRow}
                    className={DIALOG_ACTION_BUTTON_CLASS}
                  >
                    <Plus className="h-4 w-4" />
                    新增第一张表
                  </button>
                }
              />
            ) : (
              <div className={DIALOG_TABLE_WRAP_CLASS}>
                <table className="min-w-[1360px] w-full border-separate border-spacing-0 text-left">
                  <thead>
                    <tr>
                      <th className={DIALOG_TABLE_HEAD_INDEX_CLASS}>#</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[300px]`}>物理表名</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[140px]`}>基准表</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[220px]`}>业务时间字段</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[180px]`}>分层</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[360px]`}>描述</th>
                      <th className={`${DIALOG_TABLE_HEAD_CLASS} w-[110px]`}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.rows.map((row, index) => (
                      <tr key={row.id} className={DIALOG_TABLE_ROW_CLASS}>
                        <td className={DIALOG_TABLE_INDEX_CELL_CLASS}>{index + 1}</td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <input
                            value={row.tableName}
                            onChange={(event) => updateRow(row.id, 'tableName', event.target.value)}
                            placeholder="如 eco_resource_fact"
                            className={DIALOG_FIELD_CLASS}
                          />
                        </td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <select
                            value={row.isBaseline ? 'yes' : 'no'}
                            onChange={(event) => updateRow(row.id, 'isBaseline', event.target.value === 'yes')}
                            className={DIALOG_FIELD_CLASS}
                          >
                            <option value="no">否</option>
                            <option value="yes">是</option>
                          </select>
                        </td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <input
                            value={row.freshFieldName}
                            onChange={(event) => updateRow(row.id, 'freshFieldName', event.target.value)}
                            placeholder="如 data_time"
                            className={DIALOG_FIELD_CLASS}
                          />
                        </td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <select
                            value={row.layer}
                            onChange={(event) => updateRow(row.id, 'layer', event.target.value)}
                            className={DIALOG_FIELD_CLASS}
                          >
                            <option value="">请选择分层</option>
                            {PHYSICAL_TABLE_LAYER_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <textarea
                            value={row.description}
                            onChange={(event) => updateRow(row.id, 'description', event.target.value)}
                            rows={2}
                            placeholder="表用途、业务说明"
                            className={DIALOG_FIELD_TALL_CLASS}
                          />
                        </td>
                        <td className={DIALOG_TABLE_CELL_CLASS}>
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className={DIALOG_DANGER_BUTTON_CLASS}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </DialogFrame>
  )
}

export function LineageEditDialog({ open, resourceId, onClose, onSaved, catalogItems }: LineageEditDialogProps) {
  const { data, isLoading, error } = useEditableResourceStructure(resourceId, open)
  const [record, setRecord] = useState<EditableLineageRecord | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [activeNodeSearchRowId, setActiveNodeSearchRowId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setRecord(null)
    setSaveError(null)
    setActiveNodeSearchRowId(null)
  }, [open, resourceId])

  useEffect(() => {
    if (!open) return
    if (data.resourceId !== resourceId) return
    setRecord(
      mergeLineageRecordWithCatalogGraph(
        cloneLineage(data.lineage),
        data.resourceId || resourceId,
        catalogItems,
      ),
    )
    setSaveError(null)
    setActiveNodeSearchRowId(null)
  }, [catalogItems, data, open, resourceId])

  const effectiveResourceId = data.resourceId || resourceId
  const effectiveResourceName = data.resourceName || '当前资源'
  const effectiveResourceCode = data.resourceCode || ''
  const lineageNodeReferences = useMemo(() => {
    const catalogReferences = buildLineageNodeReferences(catalogItems)
    const draftReferences: LineageNodeReference[] = (record?.nodes ?? []).map((node) => ({
      nodeId: normalizeText(node.nodeId),
      name: normalizeText(node.name),
      nodeType: node.nodeType,
      resourceCode: normalizeText(node.resourceCode),
      layer: normalizeText(node.layer),
    }))
    return [...catalogReferences, ...draftReferences]
  }, [catalogItems, record?.nodes])

  const nodeOptions = useMemo(() => {
    if (!record) return []
    const map = new Map<string, { value: string; label: string }>()
    record.nodes.forEach((node) => {
      const nodeId = normalizeText(node.nodeId) || `manual:${node.id}`
      if (!nodeId) return
      map.set(nodeId, {
        value: nodeId,
        label: `${node.name || nodeId}${nodeId === effectiveResourceId ? '（当前资源）' : ''}`,
      })
    })
    return Array.from(map.values())
  }, [effectiveResourceId, record])

  const getEffectiveNodeId = (node: EditableLineageNodeRow) => {
    const normalizedNodeId = normalizeText(node.nodeId)
    if (normalizedNodeId) return normalizedNodeId
    return `manual:${node.id}`
  }

  const rewriteEdgesForNodeId = (
    edges: EditableLineageEdgeRow[],
    previousNodeId: string,
    nextNodeId: string,
  ) => {
    if (!previousNodeId || previousNodeId === nextNodeId) return edges
    return edges.map((edge) => ({
      ...edge,
      fromId: normalizeText(edge.fromId) === previousNodeId ? nextNodeId : edge.fromId,
      toId: normalizeText(edge.toId) === previousNodeId ? nextNodeId : edge.toId,
    }))
  }

  const applyNodeMutation = (
    nodeRowId: string,
    mutator: (node: EditableLineageNodeRow) => EditableLineageNodeRow,
  ) => {
    setRecord((current) => {
      if (!current) return current
      const targetNode = current.nodes.find((node) => node.id === nodeRowId)
      if (!targetNode) return current

      const previousNodeId = getEffectiveNodeId(targetNode)
      const mutatedNode = mutator(targetNode)
      const isCurrentResourceNode = previousNodeId === effectiveResourceId
      const normalizedMutatedNodeId = normalizeText(mutatedNode.nodeId)
      const nextNodeId = normalizedMutatedNodeId || (isCurrentResourceNode ? effectiveResourceId : `manual:${targetNode.id}`)
      const nextNode = {
        ...mutatedNode,
        nodeId: nextNodeId,
      }

      return {
        ...current,
        nodes: current.nodes.map((node) => (node.id === nodeRowId ? nextNode : node)),
        edges: rewriteEdgesForNodeId(current.edges, previousNodeId, nextNodeId),
      }
    })
  }

  const applyReferenceToNode = (nodeRowId: string, reference: LineageNodeReference) => {
    applyNodeMutation(nodeRowId, (node) => applyLineageNodeReference(node, reference))
    setActiveNodeSearchRowId(null)
  }

  const updateNodeName = (nodeRowId: string, nextName: string) => {
    setActiveNodeSearchRowId(nodeRowId)
    applyNodeMutation(nodeRowId, (node) => {
      const nextNode = {
        ...node,
        name: nextName,
      }
      const exactReference =
        findExactLineageNodeReference(lineageNodeReferences, nextName, node.nodeType)
        ?? findExactLineageNodeReference(lineageNodeReferences, nextName)

      if (exactReference) {
        return applyLineageNodeReference(nextNode, exactReference)
      }

      return {
        ...nextNode,
        nodeId: normalizeText(node.nodeId) === effectiveResourceId ? effectiveResourceId : '',
        resourceCode: '',
      }
    })
  }

  const addNode = () => {
    setRecord((current) =>
      current
        ? {
            ...current,
            nodes: [
              ...current.nodes,
              {
                id: createDraftId('lineage-node'),
                nodeId: '',
                name: '',
                nodeType: 'unknown',
                resourceCode: '',
                layer: '',
                extra: {},
              },
            ],
          }
        : current,
    )
  }

  const removeNode = (nodeRowId: string) => {
    setRecord((current) => {
      if (!current) return current
      const removedNode = current.nodes.find((node) => node.id === nodeRowId)
      if (!removedNode) return current
      const removedNodeId = getEffectiveNodeId(removedNode)
      if (removedNodeId === normalizeText(effectiveResourceId)) {
        return current
      }

      const nextExcludedNodeIds = new Set(readExcludedNodeIds(current.rootExtra))
      nextExcludedNodeIds.add(removedNodeId)
      const nextExcludedEdgeKeys = new Set(readExcludedEdgeKeys(current.rootExtra))
      current.edges.forEach((edge) => {
        if (normalizeText(edge.fromId) !== removedNodeId && normalizeText(edge.toId) !== removedNodeId) return
        const edgeKey = buildLineageEdgeKey(edge.fromId, edge.toId)
        if (edgeKey) {
          nextExcludedEdgeKeys.add(edgeKey)
        }
      })

      return {
        ...current,
        nodes: current.nodes.filter((node) => node.id !== nodeRowId),
        edges: current.edges.filter(
          (edge) =>
            normalizeText(edge.fromId) !== removedNodeId
            && normalizeText(edge.toId) !== removedNodeId,
        ),
        rootExtra: writeLineageExclusions(
          current.rootExtra,
          Array.from(nextExcludedNodeIds).filter((nodeId) => nodeId !== normalizeText(effectiveResourceId)),
          Array.from(nextExcludedEdgeKeys),
        ),
      }
    })
  }

  const updateEdge = <K extends keyof EditableLineageEdgeRow>(edgeId: string, key: K, value: EditableLineageEdgeRow[K]) => {
    setRecord((current) =>
      current
        ? {
            ...current,
            edges: current.edges.map((edge) => (edge.id === edgeId ? { ...edge, [key]: value } : edge)),
          }
        : current,
    )
  }

  const addEdge = () => {
    setRecord((current) => {
      if (!current) return current
      const firstNodeId = current.nodes[0] ? getEffectiveNodeId(current.nodes[0]) : effectiveResourceId
      const firstOtherNode = current.nodes.find((node) => getEffectiveNodeId(node) !== normalizeText(firstNodeId))
      const firstOtherNodeId = firstOtherNode ? getEffectiveNodeId(firstOtherNode) : ''
      return {
        ...current,
        edges: [
          ...current.edges,
          {
            id: createDraftId('lineage-edge'),
            fromId: firstNodeId,
            toId: firstOtherNodeId,
            extra: {},
          },
        ],
      }
    })
  }

  const removeEdge = (edgeId: string) => {
    setRecord((current) => {
      if (!current) return current
      const removedEdge = current.edges.find((edge) => edge.id === edgeId)
      if (!removedEdge) return current

      const nextExcludedEdgeKeys = new Set(readExcludedEdgeKeys(current.rootExtra))
      const edgeKey = buildLineageEdgeKey(removedEdge.fromId, removedEdge.toId)
      if (edgeKey) {
        nextExcludedEdgeKeys.add(edgeKey)
      }

      return {
        ...current,
        edges: current.edges.filter((edge) => edge.id !== edgeId),
        rootExtra: writeLineageExclusions(
          current.rootExtra,
          readExcludedNodeIds(current.rootExtra).filter((nodeId) => nodeId !== normalizeText(effectiveResourceId)),
          Array.from(nextExcludedEdgeKeys),
        ),
      }
    })
  }

  const handleSave = async () => {
    if (!record) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await saveResourceLineage(effectiveResourceId, record, {
        resourceId: effectiveResourceId,
        resourceName: effectiveResourceName,
        resourceCode: effectiveResourceCode,
      })
      await onSaved()
      onClose()
    } catch (currentError) {
      setSaveError(toErrorMessage(currentError, '保存血缘关系失败'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DialogFrame
      open={open}
      title="编辑血缘关系"
      description="维护节点和连线；当前资源节点会被保留，删除节点时会自动清理关联连线。"
      onClose={onClose}
      footer={
        <>
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
            disabled={isLoading || isSaving || !record}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-5 text-[0.8125rem] font-semibold text-white shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.2)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? '保存中...' : '保存'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <ErrorPanel text={error} /> : null}
        {saveError ? <ErrorPanel text={saveError} /> : null}

        {isLoading || !record ? (
          <LoadingPanel text="正在读取可编辑血缘关系..." />
        ) : (
          <>
            <section className={`space-y-4 p-4 ${DIALOG_SECTION_PANEL_CLASS}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className={DIALOG_SECTION_HEADING_CLASS}>节点清单</div>
                  <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">共 {record.nodes.length} 个节点，当前资源节点不可删除。</div>
                </div>
                <button
                  type="button"
                  onClick={addNode}
                  className={DIALOG_ACTION_BUTTON_CLASS}
                >
                  <Plus className="h-4 w-4" />
                  新增节点
                </button>
              </div>

              {record.nodes.length === 0 ? (
                <EmptyTableState
                  text="当前还没有节点记录。"
                  action={
                    <button
                      type="button"
                      onClick={addNode}
                      className={DIALOG_ACTION_BUTTON_CLASS}
                    >
                      <Plus className="h-4 w-4" />
                      新增第一个节点
                    </button>
                  }
                />
              ) : (
                <div className={DIALOG_TABLE_WRAP_CLASS}>
                  <table className="min-w-[760px] w-full border-separate border-spacing-0 text-left">
                    <thead>
                      <tr>
                        <th className={DIALOG_TABLE_HEAD_INDEX_CLASS}>#</th>
                        <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[320px]`}>节点名称</th>
                        <th className={`${DIALOG_TABLE_HEAD_CLASS} w-[110px]`}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.nodes.map((node, index) => {
                        const isCurrentNode = getEffectiveNodeId(node) === normalizeText(effectiveResourceId)
                        const nodeSearchResults = searchLineageNodeReferences(lineageNodeReferences, node.name).slice(0, 8)

                        return (
                          <tr key={node.id} className={DIALOG_TABLE_ROW_CLASS}>
                            <td className={DIALOG_TABLE_INDEX_CELL_CLASS}>{index + 1}</td>
                            <td className={DIALOG_TABLE_CELL_CLASS}>
                              <input
                                value={node.name}
                                onFocus={() => setActiveNodeSearchRowId(node.id)}
                                onChange={(event) => updateNodeName(node.id, event.target.value)}
                                placeholder="输入节点名称检索并自动回填"
                                className={DIALOG_FIELD_CLASS}
                              />
                              {isCurrentNode ? (
                                <div className={`mt-2 ${DIALOG_TAG_CLASS}`}>
                                  当前资源节点
                                </div>
                              ) : null}
                              {activeNodeSearchRowId === node.id && normalizeText(node.name) ? (
                                <div className={DIALOG_SEARCH_PANEL_CLASS}>
                                  <div className="mb-2 text-[0.6875rem] text-[var(--text-muted)]">
                                    按节点名称实时检索，点击候选项后自动回填节点类型、资源编码和分层。
                                  </div>
                                  <div className="space-y-2">
                                    {nodeSearchResults.map((reference) => (
                                      <button
                                        key={`${reference.nodeId}-${reference.nodeType}-${reference.resourceCode}-${reference.layer}`}
                                        type="button"
                                        onMouseDown={(event) => {
                                          event.preventDefault()
                                          applyReferenceToNode(node.id, reference)
                                        }}
                                        className={DIALOG_SEARCH_RESULT_CLASS}
                                      >
                                        <div className="min-w-0">
                                          <div className="break-all text-[0.75rem] font-semibold text-[var(--dialog-input-text)]">{reference.name}</div>
                                          <div className="mt-1 break-all text-[0.6875rem] text-[var(--text-muted)]">
                                            编码：{reference.resourceCode || '-'} · 分层：{reference.layer || '-'}
                                          </div>
                                        </div>
                                        <span className={`shrink-0 ${DIALOG_TAG_CLASS}`}>
                                          {LINEAGE_NODE_TYPE_OPTIONS.find((option) => option.value === reference.nodeType)?.label ?? reference.nodeType}
                                        </span>
                                      </button>
                                    ))}
                                    {nodeSearchResults.length === 0 ? (
                                      <div className={DIALOG_SEARCH_EMPTY_CLASS}>
                                        没有找到匹配节点，可继续手工录入。
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </td>
                            <td className={DIALOG_TABLE_CELL_CLASS}>
                              <button
                                type="button"
                                disabled={isCurrentNode}
                                onClick={() => removeNode(node.id)}
                                className={`${DIALOG_DANGER_BUTTON_CLASS} disabled:cursor-not-allowed disabled:border-[var(--dialog-danger-disabled-border)] disabled:text-[var(--dialog-danger-disabled-text)] disabled:hover:bg-[var(--dialog-danger-bg)]`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                删除
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={`space-y-4 p-4 ${DIALOG_SECTION_PANEL_CLASS}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className={DIALOG_SECTION_HEADING_CLASS}>连线清单</div>
                  <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">共 {record.edges.length} 条连线，起点和终点直接从节点列表中选择。</div>
                </div>
                <button
                  type="button"
                  onClick={addEdge}
                  className={DIALOG_ACTION_BUTTON_CLASS}
                >
                  <Plus className="h-4 w-4" />
                  新增连线
                </button>
              </div>

              {record.edges.length === 0 ? (
                <EmptyTableState
                  text="当前还没有连线记录。"
                  action={
                    <button
                      type="button"
                      onClick={addEdge}
                      className={DIALOG_ACTION_BUTTON_CLASS}
                    >
                      <Plus className="h-4 w-4" />
                      新增第一条连线
                    </button>
                  }
                />
              ) : (
                <div className={DIALOG_TABLE_WRAP_CLASS}>
                  <table className="min-w-[920px] w-full border-separate border-spacing-0 text-left">
                    <thead>
                      <tr>
                        <th className={DIALOG_TABLE_HEAD_INDEX_CLASS}>#</th>
                        <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[320px]`}>起点节点</th>
                        <th className={`${DIALOG_TABLE_HEAD_CLASS} min-w-[320px]`}>终点节点</th>
                        <th className={`${DIALOG_TABLE_HEAD_CLASS} w-[110px]`}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.edges.map((edge, index) => (
                        <tr key={edge.id} className={DIALOG_TABLE_ROW_CLASS}>
                          <td className={DIALOG_TABLE_INDEX_CELL_CLASS}>{index + 1}</td>
                          <td className={DIALOG_TABLE_CELL_CLASS}>
                            <select
                              value={edge.fromId}
                              onChange={(event) => updateEdge(edge.id, 'fromId', event.target.value)}
                              className={DIALOG_FIELD_CLASS}
                            >
                              <option value="">请选择起点节点</option>
                              {nodeOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className={DIALOG_TABLE_CELL_CLASS}>
                            <select
                              value={edge.toId}
                              onChange={(event) => updateEdge(edge.id, 'toId', event.target.value)}
                              className={DIALOG_FIELD_CLASS}
                            >
                              <option value="">请选择终点节点</option>
                              {nodeOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className={DIALOG_TABLE_CELL_CLASS}>
                            <button
                              type="button"
                              onClick={() => removeEdge(edge.id)}
                              className={DIALOG_DANGER_BUTTON_CLASS}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </DialogFrame>
  )
}
