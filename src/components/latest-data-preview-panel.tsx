import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Database } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatNumber } from '../lib/nocobase-stat-data'
import type { LatestPreviewData, LatestPreviewTableData } from '../lib/resource-preview-data'
import { buildPreviewColumnKeys, getPreviewColumnDisplayName, stringifyPreviewValue } from '../lib/resource-preview-data'

type PreviewSortState = {
  key: string
  direction: 'asc' | 'desc'
}

function arePreviewSortStatesEqual(left: PreviewSortState | null, right: PreviewSortState | null) {
  if (left === right) return true
  if (!left || !right) return false
  return left.key === right.key && left.direction === right.direction
}

type LatestDataPreviewPanelProps = {
  baselineTableName: string
  previewData?: LatestPreviewData | null
  sourceSystems?: string[]
  isLoading?: boolean
  errorMessage?: string | null
  latestPeriodCode?: string
}

function clipPreviewText(text: string, maxLength = 160) {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}

function isNumericText(text: string) {
  return /^-?\d+(?:\.\d+)?$/.test(text.trim())
}

function parsePreviewTimestamp(text: string) {
  if (!/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) return null
  const normalized = text.trim().replace(/\//g, '-').replace(' ', 'T')
  const timestamp = Date.parse(normalized)
  return Number.isNaN(timestamp) ? null : timestamp
}

function comparePreviewCellValues(left: unknown, right: unknown) {
  const leftText = stringifyPreviewValue(left).trim()
  const rightText = stringifyPreviewValue(right).trim()
  const leftEmpty = leftText.length === 0
  const rightEmpty = rightText.length === 0

  if (leftEmpty && rightEmpty) return 0
  if (leftEmpty) return 1
  if (rightEmpty) return -1

  const leftTimestamp = parsePreviewTimestamp(leftText)
  const rightTimestamp = parsePreviewTimestamp(rightText)
  if (leftTimestamp !== null && rightTimestamp !== null) {
    return leftTimestamp - rightTimestamp
  }

  if (isNumericText(leftText) && isNumericText(rightText)) {
    return Number(leftText) - Number(rightText)
  }

  return leftText.localeCompare(rightText, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function areFilterMapsEqual(left: Record<string, string>, right: Record<string, string>) {
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)
  if (leftEntries.length !== rightEntries.length) return false
  return leftEntries.every(([key, value]) => right[key] === value)
}

export function LatestDataPreviewPanel({
  baselineTableName,
  previewData,
  isLoading = false,
  errorMessage,
  latestPeriodCode = '',
}: LatestDataPreviewPanelProps) {
  const normalizedBaselineTableName = baselineTableName.trim()
  const [globalKeyword, setGlobalKeyword] = useState('')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [tableSortStates, setTableSortStates] = useState<Record<string, PreviewSortState | null>>({})
  const [tableVisibleColumnKeys, setTableVisibleColumnKeys] = useState<Record<string, string[]>>({})
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
  const [selectedTableName, setSelectedTableName] = useState('')

  const previewTables = useMemo(() => {
    if (!previewData) return [] as LatestPreviewTableData[]
    return Array.isArray(previewData.previewTables) && previewData.previewTables.length > 0
      ? previewData.previewTables
      : [previewData]
  }, [previewData])

  useEffect(() => {
    setSelectedTableName((current) => {
      if (current && previewTables.some((item) => item.tableName === current)) {
        return current
      }
      return previewTables.find((item) => item.isBaseline)?.tableName ?? previewTables[0]?.tableName ?? ''
    })
  }, [previewTables])

  const activePreview = useMemo(() => {
    if (previewTables.length === 0) return previewData ?? null
    return previewTables.find((item) => item.tableName === selectedTableName) ?? previewTables[0]
  }, [previewData, previewTables, selectedTableName])

  const baselinePreviewTableName = previewData?.tableName.trim() || normalizedBaselineTableName
  const displayTableName = activePreview?.tableName.trim() || normalizedBaselineTableName
  const rows = activePreview?.rows ?? []
  const effectiveError = errorMessage || activePreview?.error || previewData?.error || null
  const multiPreviewEnabled = previewTables.length > 1
  const sortState = displayTableName ? (tableSortStates[displayTableName] ?? null) : null

  const columnKeys = useMemo(
    () => buildPreviewColumnKeys(rows, [activePreview?.sortField ?? ''], activePreview?.columns ?? []),
    [activePreview?.columns, activePreview?.sortField, rows],
  )

  const visibleColumnKeys = displayTableName ? (tableVisibleColumnKeys[displayTableName] ?? columnKeys) : columnKeys

  useEffect(() => {
    if (!displayTableName) {
      return
    }

    setTableVisibleColumnKeys((current) => {
      const currentVisibleKeys = current[displayTableName] ?? []

      if (columnKeys.length === 0) {
        if (currentVisibleKeys.length === 0) {
          return current
        }
        return {
          ...current,
          [displayTableName]: [],
        }
      }

      if (currentVisibleKeys.length === 0) {
        return areStringArraysEqual(currentVisibleKeys, columnKeys)
          ? current
          : {
              ...current,
              [displayTableName]: columnKeys,
            }
      }

      const next = currentVisibleKeys.filter((key) => columnKeys.includes(key))
      const missing = columnKeys.filter((key) => !next.includes(key))
      const merged = [...next, ...missing]
      const nextVisibleKeys = merged.length > 0 ? merged : columnKeys

      if (areStringArraysEqual(currentVisibleKeys, nextVisibleKeys)) {
        return current
      }

      return {
        ...current,
        [displayTableName]: nextVisibleKeys,
      }
    })
  }, [columnKeys, displayTableName])

  const activeColumnKeys = useMemo(
    () => columnKeys.filter((key) => visibleColumnKeys.includes(key)),
    [columnKeys, visibleColumnKeys],
  )

  const getColumnLabel = (key: string) => getPreviewColumnDisplayName(key, activePreview?.columnLabels)

  useEffect(() => {
    setColumnFilters((current) => {
      const nextEntries = Object.entries(current).filter(([key]) => activeColumnKeys.includes(key))
      const nextFilters = Object.fromEntries(nextEntries)
      return areFilterMapsEqual(current, nextFilters) ? current : nextFilters
    })
  }, [activeColumnKeys])

  useEffect(() => {
    if (!displayTableName) {
      return
    }

    setTableSortStates((current) => {
      const currentSortState = current[displayTableName] ?? null
      let nextSortState: PreviewSortState | null = null

      if (activeColumnKeys.length > 0) {
        if (currentSortState && activeColumnKeys.includes(currentSortState.key)) {
          nextSortState = currentSortState
        } else {
          const defaultKey = activeColumnKeys.includes(activePreview?.sortField ?? '') ? activePreview?.sortField ?? '' : activeColumnKeys[0]
          nextSortState = defaultKey ? { key: defaultKey, direction: 'desc' } : null
        }
      }

      if (arePreviewSortStatesEqual(currentSortState, nextSortState)) {
        return current
      }

      return {
        ...current,
        [displayTableName]: nextSortState,
      }
    })
  }, [activeColumnKeys, activePreview?.sortField, displayTableName])

  const filteredRows = useMemo(() => {
    const normalizedGlobalKeyword = globalKeyword.trim().toLowerCase()
    return rows.filter((row) => {
      if (normalizedGlobalKeyword) {
        const globalHaystack = activeColumnKeys.map((key) => stringifyPreviewValue(row[key]).toLowerCase()).join(' ')
        if (!globalHaystack.includes(normalizedGlobalKeyword)) {
          return false
        }
      }

      for (const [key, rawFilter] of Object.entries(columnFilters)) {
        const normalizedFilter = rawFilter.trim().toLowerCase()
        if (!normalizedFilter) continue
        const cellText = stringifyPreviewValue(row[key]).toLowerCase()
        if (!cellText.includes(normalizedFilter)) {
          return false
        }
      }

      return true
    })
  }, [activeColumnKeys, columnFilters, globalKeyword, rows])

  const displayedRows = useMemo(() => {
    if (!sortState) return filteredRows

    return [...filteredRows].sort((left, right) => {
      const compareResult = comparePreviewCellValues(left[sortState.key], right[sortState.key])
      return sortState.direction === 'asc' ? compareResult : -compareResult
    })
  }, [filteredRows, sortState])

  const handleSort = (key: string) => {
    if (!displayTableName) return

    setTableSortStates((current) => {
      const currentSortState = current[displayTableName] ?? null
      const nextSortState =
        !currentSortState || currentSortState.key !== key
          ? { key, direction: 'desc' as const }
          : { key, direction: currentSortState.direction === 'desc' ? 'asc' as const : 'desc' as const }

      if (arePreviewSortStatesEqual(currentSortState, nextSortState)) {
        return current
      }

      return {
        ...current,
        [displayTableName]: nextSortState,
      }
    })
  }

  const clearFilters = () => {
    setGlobalKeyword('')
    setColumnFilters({})
  }

  const toggleVisibleColumn = (key: string) => {
    if (!displayTableName) return

    setTableVisibleColumnKeys((current) => {
      const currentVisibleKeys = current[displayTableName] ?? columnKeys

      if (currentVisibleKeys.includes(key)) {
        const next = currentVisibleKeys.filter((item) => item !== key)
        if (next.length === 0) {
          return current
        }
        return {
          ...current,
          [displayTableName]: next,
        }
      }

      const nextSet = new Set([...currentVisibleKeys, key])
      return {
        ...current,
        [displayTableName]: columnKeys.filter((item) => nextSet.has(item)),
      }
    })
  }

  const showAllColumns = () => {
    if (!displayTableName) return
    setTableVisibleColumnKeys((current) =>
      areStringArraysEqual(current[displayTableName] ?? [], columnKeys)
        ? current
        : {
            ...current,
            [displayTableName]: columnKeys,
          },
    )
  }

  if (!displayTableName) {
    return (
      <div className="mt-[1px] rounded-[10px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 text-[0.875rem] text-[var(--text-secondary)]">
        当前资源尚未识别出基准数据表，暂时无法展示最新数据预览。
      </div>
    )
  }

  return (
    <div className="mt-[1px] rounded-[10px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 text-[0.875rem] text-[var(--text-secondary)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[1.125rem] font-semibold text-[var(--text-main)]">
            <Database className="h-5 w-5 text-[var(--primary)]" />
            <span>最新数据预览</span>
          </div>
          <span className="rounded-full bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-info-text)]">
            基准表：{baselinePreviewTableName || '未识别'}
          </span>
          {displayTableName && displayTableName !== baselinePreviewTableName ? (
            <span className="rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-1 text-[0.75rem] text-[var(--text-secondary)]">
              当前查看：{displayTableName}
            </span>
          ) : null}
          {activePreview?.generatedAt ? (
            <span className="rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-1 text-[0.75rem] text-[var(--text-secondary)]">
              生成时间：{activePreview.generatedAt}
            </span>
          ) : null}
        </div>
      </div>

      {multiPreviewEnabled ? (
        <div className="mt-4 rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-4">
          <div className="text-[0.8125rem] font-medium text-[var(--text-main)]">
            当前资源共生成 {previewTables.length} 张物理表的最新数据预览，可逐表切换查看。
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {previewTables.map((item) => {
              const isActive = item.tableName === displayTableName
              return (
                <button
                  key={item.tableName}
                  type="button"
                  onClick={() => setSelectedTableName(item.tableName)}
                  className={`rounded-full border px-3 py-1.5 text-left text-[0.75rem] transition ${
                    isActive
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                      : 'border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                  }`}
                >
                  <span className="font-semibold">{item.tableName}</span>
                  <span className="ml-2 text-[0.6875rem] opacity-80">
                    {item.isBaseline ? '基准表' : '关联表'}
                    {item.businessTimeFieldName ? ` · ${item.businessTimeFieldName}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {activePreview && (activePreview.businessTimeFieldName || activePreview.layer || activePreview.sourceSystem || activePreview.description) ? (
        <div className="mt-4 flex flex-wrap gap-2 text-[0.75rem] text-[var(--text-secondary)]">
          {activePreview.businessTimeFieldName ? (
            <span className="rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-1">
              业务时间字段：{activePreview.businessTimeFieldName}
              {activePreview.businessTimeFieldDescription ? `（${activePreview.businessTimeFieldDescription}）` : ''}
            </span>
          ) : null}
          {activePreview.layer ? (
            <span className="rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-1">
              分层：{activePreview.layer}
            </span>
          ) : null}
          {activePreview.sourceSystem ? (
            <span className="rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-1">
              来源系统：{activePreview.sourceSystem}
            </span>
          ) : null}
          {activePreview.description ? (
            <span className="rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-1">
              说明：{activePreview.description}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(280px,1fr)_auto_auto]">
        <label className="flex min-h-[46px] items-center rounded-[12px] border border-[var(--surface-outline)] bg-[var(--field-bg)] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <input
            value={globalKeyword}
            onChange={(event) => setGlobalKeyword(event.target.value)}
            placeholder={`按整表关键字查询当前 ${Math.max(activePreview?.limit ?? 0, rows.length)} 条预览数据`}
            className="w-full border-none bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </label>
        {columnKeys.length > 0 ? (
          <div className={`relative ${isColumnSelectorOpen ? 'z-30' : ''}`}>
            <button
              type="button"
              onClick={() => setIsColumnSelectorOpen((current) => !current)}
              className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)] xl:min-w-[172px]"
            >
              <Columns3 className="h-4 w-4" />
              <span>显示列 {activeColumnKeys.length}/{columnKeys.length}</span>
            </button>

            {isColumnSelectorOpen ? (
              <div className="absolute right-0 top-full z-40 mt-2 w-full min-w-[280px] rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-4 shadow-[var(--shadow-medium)] xl:w-[360px]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[0.8125rem] font-semibold text-[var(--text-main)]">选择要显示的列</div>
                  <button
                    type="button"
                    onClick={showAllColumns}
                    className="text-[0.75rem] font-medium text-[var(--primary)] transition hover:opacity-80"
                  >
                    全选
                  </button>
                </div>
                <div className="mt-2 text-[0.75rem] text-[var(--text-muted)]">至少保留 1 列；隐藏列不会参与当前表格筛选和排序展示。</div>
                <div className="mt-3 grid max-h-[260px] gap-2 overflow-auto pr-1">
                  {columnKeys.map((key) => {
                    const checked = activeColumnKeys.includes(key)
                    return (
                      <label
                        key={key}
                        className="flex items-start gap-3 rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-3 py-2 text-[0.75rem] text-[var(--text-main)]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleVisibleColumn(key)}
                          className="mt-0.5 h-4 w-4 rounded border-[var(--surface-outline)] text-[var(--primary)] focus:ring-[var(--primary)]"
                        />
                        <span className="min-w-0">
                          <span className="block break-all font-medium text-[var(--text-main)]">{getColumnLabel(key)}</span>
                          {getColumnLabel(key) !== key ? (
                            <span className="mt-0.5 block break-all font-mono text-[0.6875rem] text-[var(--text-muted)]">{key}</span>
                          ) : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex min-h-[46px] items-center justify-center rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]"
        >
          清空筛选
        </button>
      </div>

      {isLoading ? (
        <div className="mt-4 rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">
          正在读取最新统计批次中的预览数据...
        </div>
      ) : null}

      {!isLoading && effectiveError ? (
        <div className="mt-4 rounded-[10px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-4 text-[0.8125rem] text-[var(--status-danger-text)]">{effectiveError}</div>
      ) : null}

      {!isLoading && !effectiveError && !previewData ? (
        <div className="mt-4 rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">
          {latestPeriodCode
            ? `最新批次（${latestPeriodCode}）尚未生成最新数据预览，请重新执行 v2.0 统计任务。`
            : '暂无可用统计批次，暂时无法展示最新数据预览。'}
        </div>
      ) : null}

      {!isLoading && !effectiveError && activePreview && columnKeys.length === 0 ? (
        <div className="mt-4 rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">
          当前统计批次已生成预览结构，但没有可展示的字段或记录。
        </div>
      ) : null}

      {!isLoading && !effectiveError && activePreview && columnKeys.length > 0 ? (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[0.75rem] text-[var(--text-muted)]">
            <span>筛选后共 {formatNumber(displayedRows.length)} 条</span>
            <div className="flex flex-wrap items-center gap-3">
              <span>当前显示列 {activeColumnKeys.length} / {columnKeys.length}</span>
              {sortState ? <span>当前排序：{getColumnLabel(sortState.key)} {sortState.direction === 'desc' ? '降序' : '升序'}</span> : null}
              <span>表头已冻结</span>
            </div>
          </div>

          {activeColumnKeys.length === 0 ? (
            <div className="mt-3 rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]">
              当前没有可显示的列，请至少勾选 1 列。
            </div>
          ) : (
          <div className="mt-3 max-h-[70vh] overflow-auto rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] shadow-[var(--shadow-soft)]">
            <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 border-b border-[var(--line-soft)] bg-[var(--table-header-bg)] px-3 py-3 text-[0.75rem] font-semibold text-[var(--text-secondary)]">#</th>
                  {activeColumnKeys.map((key) => {
                    const isActive = sortState?.key === key
                    return (
                      <th key={key} className="sticky top-0 z-10 min-w-[220px] border-b border-l border-[var(--line-soft)] bg-[var(--table-header-bg-alt)] px-3 py-3 align-top text-[0.75rem] font-semibold text-[var(--text-secondary)] shadow-[inset_0_-1px_0_rgba(214,228,239,0.08)]">
                        <button
                          type="button"
                          onClick={() => handleSort(key)}
                          className="flex w-full items-center justify-between gap-2 text-left text-[0.8125rem] font-semibold text-[var(--text-main)] transition hover:text-[var(--primary)]"
                        >
                          <span className="min-w-0">
                            <span className="block break-all">{getColumnLabel(key)}</span>
                            {getColumnLabel(key) !== key ? (
                              <span className="mt-0.5 block break-all font-mono text-[0.6875rem] font-normal text-[var(--text-muted)]">{key}</span>
                            ) : null}
                          </span>
                          {isActive ? (
                            sortState.direction === 'desc' ? <ArrowDown className="h-3.5 w-3.5 shrink-0" /> : <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                          )}
                        </button>
                        <input
                          value={columnFilters[key] ?? ''}
                          onChange={(event) => {
                            const nextValue = event.target.value
                            setColumnFilters((current) => ({
                              ...current,
                              [key]: nextValue,
                            }))
                          }}
                          placeholder="筛选"
                          className="mt-2 w-full rounded-[8px] border border-[var(--surface-outline)] bg-[var(--field-bg-strong)] px-2.5 py-1.5 text-[0.75rem] font-normal text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
                        />
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row, rowIndex) => (
                  <tr key={`${stringifyPreviewValue(row.id) || 'preview-row'}-${rowIndex}`} className="align-top odd:bg-[var(--surface-raised-strong)] even:bg-[var(--table-row-alt)]">
                    <td className="border-b border-[var(--line-soft)] bg-[var(--surface-raised)] px-3 py-3 text-[0.75rem] text-[var(--text-muted)]">
                      {rowIndex + 1}
                    </td>
                    {activeColumnKeys.map((key) => {
                      const rawValue = row[key]
                      const cellText = stringifyPreviewValue(rawValue)
                      const clippedText = clipPreviewText(cellText)
                      const isStructuredValue =
                        Array.isArray(rawValue)
                        || (rawValue !== null && typeof rawValue === 'object')

                      return (
                        <td
                          key={`${key}-${rowIndex}`}
                          title={cellText}
                          className={`max-w-[320px] border-b border-l border-[var(--line-soft)] px-3 py-3 text-[0.75rem] leading-6 text-[var(--text-main)] ${
                            isStructuredValue ? 'font-mono text-[0.6875rem]' : ''
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-all">{clippedText || '-'}</div>
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {displayedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={activeColumnKeys.length + 1}
                      className="px-4 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]"
                    >
                      当前筛选条件下没有匹配记录。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          )}
        </>
      ) : null}
    </div>
  )
}
