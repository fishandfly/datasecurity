import type { SankeyDetailColumn } from '../lib/sankey-layout'

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function SankeyDetailPanel({
  title,
  columns,
  rows,
  selectedLabel,
  emptyLabel = '点击上方桑基图节点，下方展示对应明细',
}: {
  title: string
  columns: SankeyDetailColumn[]
  rows: Array<Record<string, unknown>>
  selectedLabel: string
  emptyLabel?: string
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--surface-outline)] bg-[var(--table-header-bg)] px-4 py-3">
        <div className="text-[0.8125rem] font-semibold text-[var(--text-main)]">
          {title}
          <span className="ml-2 font-normal text-[var(--text-muted)]">{rows.length} 条</span>
        </div>
        <div className="text-[0.75rem] text-[var(--text-muted)]">
          选中：<span className="font-medium text-[var(--text-secondary)]">{selectedLabel || '未选择'}</span>
        </div>
      </div>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-[var(--table-header-bg)]">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className="border-b border-r border-[var(--surface-outline)] px-3 py-2 text-[0.6875rem] font-semibold text-[var(--text-secondary)] last:border-r-0"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((row, rowIndex) => (
                <tr key={rowIndex} className="odd:bg-[var(--surface-raised-strong)] even:bg-[var(--table-row-alt)] hover:bg-[var(--table-row-hover)]">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className="max-w-[280px] border-b border-r border-[var(--surface-outline)] px-3 py-2 text-[0.75rem] leading-5 text-[var(--text-secondary)] last:border-r-0"
                    >
                      <div className="max-h-16 overflow-auto whitespace-pre-wrap break-words">{formatCell(row[column.key])}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 ? (
            <div className="border-t border-[var(--surface-outline)] bg-[var(--surface-muted)] px-4 py-2 text-[0.6875rem] text-[var(--text-muted)]">
              仅展示前 50 条，共 {rows.length} 条
            </div>
          ) : null}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-[0.8125rem] leading-6 text-[var(--text-muted)]">
          {selectedLabel ? '该节点没有匹配的明细记录' : emptyLabel}
        </div>
      )}
    </div>
  )
}
