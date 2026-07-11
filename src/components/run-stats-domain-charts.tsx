import { formatNumber } from '../lib/nocobase-stat-data'
import type { DomainStatsRow } from '../lib/run-stats-domain'

export function DomainStockBarChart({ rows }: { rows: DomainStatsRow[] }) {
  const maxStock = Math.max(1, ...rows.map((row) => row.stockCount))

  return (
    <div className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-3 text-[0.9375rem] font-bold text-[var(--text-main)]">一级领域数据存量柱形图（条）</div>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.domain} className="grid grid-cols-[180px_1fr_auto] items-center gap-3 text-[0.75rem]">
            <div className="truncate text-[var(--text-secondary)]">{row.domain}</div>
            <div className="h-5 rounded bg-[var(--table-track)]">
              <div
                className="h-5 rounded bg-[linear-gradient(90deg,#2f6fe6,#5b8ef0)]"
                style={{ width: `${Math.max(2, (row.stockCount / maxStock) * 100)}%` }}
              />
            </div>
            <div className="font-semibold text-[var(--text-main)]">{formatNumber(row.stockCount)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DomainChangeBarChart({ rows }: { rows: DomainStatsRow[] }) {
  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(row.changeCount)))

  return (
    <div className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-3 text-[0.9375rem] font-bold text-[var(--text-main)]">一级领域数据变化量柱形图（上一统计批次对比，条）</div>
      <div className="space-y-2.5">
        {rows.map((row) => {
          const width = (Math.abs(row.changeCount) / maxAbs) * 50
          const positive = row.changeCount >= 0

          return (
            <div key={row.domain} className="grid grid-cols-[180px_1fr_auto] items-center gap-3 text-[0.75rem]">
              <div className="truncate text-[var(--text-secondary)]">{row.domain}</div>
              <div className="relative h-5 rounded bg-[var(--table-track)]">
                <div className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 bg-[var(--line)]" />
                <div
                  className={`absolute top-0 h-5 rounded ${positive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={
                    positive
                      ? { left: '50%', width: `${Math.max(1.5, width)}%` }
                      : { right: '50%', width: `${Math.max(1.5, width)}%` }
                  }
                />
              </div>
              <div className={`font-semibold ${positive ? 'text-[var(--status-success-text)]' : 'text-[var(--status-danger-text)]'}`}>
                {row.changeCount > 0 ? '+' : ''}
                {formatNumber(row.changeCount)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DomainChartsSection({
  rows,
  emptyMessage = '当前周期暂无可展示的一级领域统计数据。',
}: {
  rows: DomainStatsRow[]
  emptyMessage?: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--surface-outline)] bg-[var(--surface-muted)] px-4 py-8 text-center text-[0.8125rem] text-[var(--text-muted)]">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <DomainStockBarChart rows={rows} />
      <DomainChangeBarChart rows={rows} />
    </div>
  )
}
