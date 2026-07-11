import { useEffect, useMemo, useState } from 'react'
import { RefreshCcw, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { matchesFullTextSearch } from '../lib/full-text-search'
import type { SupplyDemandInfo } from '../lib/nocobase-supply-demand-data'
import { cn } from '../lib/utils'
import { Button } from './ui'

const PAGE_SIZE = 10
const TABLE_ROW_CLASS = 'group transition-all duration-200 hover:bg-[var(--surface-tint)]'
const TABLE_EVEN_ROW_CLASS = 'bg-[var(--surface-raised-strong)]'
const TABLE_ODD_ROW_CLASS = 'bg-[var(--table-row-alt)]'
const TABLE_CELL_CLASS =
  'border-b border-[var(--line-soft)] transition-colors duration-200 group-hover:bg-[var(--table-row-hover)]'
const TABLE_HEAD_ROW_CLASS =
  'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-[0.8125rem] uppercase tracking-[0.05em] text-white'
const TABLE_HEAD_CELL_CLASS = 'border-b border-[rgba(255,255,255,0.16)] px-4 py-3.5 font-semibold'
const NAVY_SOFT_BUTTON_CLASS =
  'border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] text-[var(--primary)] shadow-[0_10px_24px_rgba(10,104,232,0.10)] transition-all duration-200 hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white hover:-translate-y-[1px]'
const DEPARTMENT_BUTTON_BASE_CLASS =
  'w-full rounded-[14px] border px-3 py-3 text-left text-[0.8125rem] transition'

type DemandExternalTabViewProps = {
  items: SupplyDemandInfo[]
  isLoading?: boolean
  buildDetailPath: (id: string) => string
  returnTo: string
}

type ExternalDemandMeta = {
  sequence: string
  sourceName: string
  dataCategory: string
  businessCategory: string
  shareMode: string
  updateFrequency: string
}

type ExternalDemandTableItem = {
  item: SupplyDemandInfo
  meta: ExternalDemandMeta
  sourceName: string
  searchText: string
}

function normalizeDescriptionSegment(value: string) {
  return value.replace(/[。.;；]+$/g, '').trim()
}

function parseExternalDemandMeta(item: SupplyDemandInfo): ExternalDemandMeta {
  const values = new Map<string, string>()
  normalizeDescriptionSegment(item.demandDescription)
    .split(/[；;]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((segment) => {
      const normalized = normalizeDescriptionSegment(segment)
      const separatorIndex = normalized.indexOf('：')
      if (separatorIndex <= 0) return
      const key = normalized.slice(0, separatorIndex).trim()
      const value = normalized.slice(separatorIndex + 1).trim()
      if (key && value) {
        values.set(key, value)
      }
    })

  return {
    sequence: values.get('序号') ?? '',
    sourceName: values.get('数据来源') ?? item.dataSourceUnitName,
    dataCategory: values.get('数据类别') ?? '',
    businessCategory: values.get('业务分类') ?? '',
    shareMode: values.get('共享方式') ?? '',
    updateFrequency: values.get('更新频率') ?? '',
  }
}

function buildDepartmentOptions(values: string[]) {
  const counts = new Map<string, number>()
  values.forEach((value) => {
    const normalized = value.trim()
    if (!normalized) return
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  })

  return Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1]
    return left[0].localeCompare(right[0], 'zh-CN', { numeric: true })
  })
}

function buildSearchText(item: SupplyDemandInfo, meta: ExternalDemandMeta, sourceName: string) {
  return [
    item.requiredDataResourceName,
    item.domainCategoryName,
    sourceName,
    item.demandDescription,
    meta.dataCategory,
    meta.businessCategory,
    meta.shareMode,
    meta.updateFrequency,
  ].join(' ')
}

function matchExternalDemand(
  entry: ExternalDemandTableItem,
  {
    keyword,
    sourceUnit,
    businessCategory,
  }: {
    keyword: string
    sourceUnit: string
    businessCategory: string
  },
) {
  if (sourceUnit && entry.sourceName !== sourceUnit) {
    return false
  }

  if (businessCategory && entry.meta.businessCategory !== businessCategory) {
    return false
  }

  if (!matchesFullTextSearch(entry.searchText, keyword)) {
    return false
  }

  return true
}

export function DemandExternalTabView({
  items,
  isLoading = false,
  buildDetailPath,
  returnTo,
}: DemandExternalTabViewProps) {
  const [keyword, setKeyword] = useState('')
  const [businessCategory, setBusinessCategory] = useState('')
  const [departmentKeyword, setDepartmentKeyword] = useState('')
  const [activeDepartment, setActiveDepartment] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [activeDepartment, businessCategory, keyword])

  const entries = useMemo<ExternalDemandTableItem[]>(
    () =>
      items.map((item) => {
        const meta = parseExternalDemandMeta(item)
        const sourceName = (item.dataSourceUnitName || meta.sourceName || '').trim()
        return {
          item,
          meta,
          sourceName,
          searchText: buildSearchText(item, meta, sourceName),
        }
      }),
    [items],
  )

  const businessOptions = useMemo(
    () => buildDepartmentOptions(entries.map((entry) => entry.meta.businessCategory)),
    [entries],
  )

  const departmentOptions = useMemo(
    () => buildDepartmentOptions(entries.map((entry) => entry.sourceName)),
    [entries],
  )

  const filteredDepartmentOptions = useMemo(
    () =>
      departmentOptions.filter(([label]) =>
        matchesFullTextSearch(label, departmentKeyword),
      ),
    [departmentKeyword, departmentOptions],
  )

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) =>
        matchExternalDemand(entry, {
          keyword,
          sourceUnit: activeDepartment,
          businessCategory,
        }),
      ),
    [activeDepartment, businessCategory, entries, keyword],
  )

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedEntries = filteredEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const activeDepartmentCount = activeDepartment
    ? (departmentOptions.find(([label]) => label === activeDepartment)?.[1] ?? 0)
    : items.length

  return (
    <section className="rounded-[20px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-medium)]">
      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[18px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-raised))] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[1rem] font-semibold text-[var(--text-main)]">部门检索</div>
              <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
                共 {departmentOptions.length} 个来源单位
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDepartmentKeyword('')
                setActiveDepartment('')
              }}
              className="text-[0.75rem] font-medium text-[var(--primary)] transition hover:opacity-80"
            >
              清空
            </button>
          </div>

          <div className="relative mt-4">
            <input
              value={departmentKeyword}
              onChange={(event) => setDepartmentKeyword(event.target.value)}
              className="h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 pr-10 text-[0.8125rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
              placeholder="搜索部门名称"
            />
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => setActiveDepartment('')}
              className={cn(
                DEPARTMENT_BUTTON_BASE_CLASS,
                activeDepartment
                  ? 'border-[var(--surface-outline)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:border-[rgba(32,113,218,0.18)] hover:text-[var(--primary)]'
                  : 'border-[rgba(32,113,218,0.22)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[0_12px_24px_rgba(10,104,232,0.16)]',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">全部部门</span>
                <span className={activeDepartment ? 'text-[var(--text-muted)]' : 'text-white/85'}>{items.length}</span>
              </div>
            </button>

            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {filteredDepartmentOptions.map(([label, count]) => {
                const isActive = label === activeDepartment
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setActiveDepartment(label)}
                    className={cn(
                      DEPARTMENT_BUTTON_BASE_CLASS,
                      isActive
                        ? 'border-[rgba(32,113,218,0.22)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[0_12px_24px_rgba(10,104,232,0.16)]'
                        : 'border-[var(--surface-outline)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:border-[rgba(32,113,218,0.18)] hover:text-[var(--primary)]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="line-clamp-2 font-medium">{label}</span>
                      <span className={isActive ? 'text-white/85' : 'text-[var(--text-muted)]'}>{count}</span>
                    </div>
                  </button>
                )
              })}

              {!isLoading && filteredDepartmentOptions.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-muted)] px-3 py-6 text-center text-[0.75rem] text-[var(--text-muted)]">
                  当前没有匹配的部门
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_auto]">
            <label className="block">
              <span className="mb-2 block text-[0.8125rem] text-[var(--text-main)]">关键词</span>
              <div className="relative">
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  className="h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 pr-10 text-[0.8125rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
                  placeholder="搜索资源名称、业务分类、共享方式"
                />
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-[0.8125rem] text-[var(--text-main)]">业务分类</span>
              <select
                value={businessCategory}
                onChange={(event) => setBusinessCategory(event.target.value)}
                className="h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 text-[0.8125rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
              >
                <option value="">全部业务</option>
                {businessOptions.map(([label, count]) => (
                  <option key={label} value={label}>
                    {label}（{count}）
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end justify-end">
              <Button
                className="rounded-full"
                variant="secondary"
                onClick={() => {
                  setKeyword('')
                  setBusinessCategory('')
                  setDepartmentKeyword('')
                  setActiveDepartment('')
                }}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                重置筛选
              </Button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-[0.75rem] text-[var(--text-muted)]">
            <span>共 {items.length} 条外部对接需求</span>
            <span>当前部门 {activeDepartment || '全部部门'}</span>
            <span>部门记录 {activeDepartmentCount} 条</span>
            <span>筛选后 {filteredEntries.length} 条</span>
          </div>

          {isLoading ? (
            <div className="mt-5 rounded-[18px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 py-12 text-center text-[0.875rem] text-[var(--text-secondary)]">
              正在加载外部对接需求...
            </div>
          ) : items.length === 0 ? (
            <div className="mt-5 rounded-[18px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 py-12 text-center text-[0.875rem] text-[var(--text-secondary)]">
              当前暂无外部对接需求。
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="mt-5 rounded-[18px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 py-12 text-center text-[0.875rem] text-[var(--text-secondary)]">
              当前筛选条件下暂无外部需求，请调整部门或关键词后重试。
            </div>
          ) : (
            <>
              <div className="mt-5 overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] shadow-[var(--shadow-soft)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] table-auto border-separate border-spacing-0 text-left">
                    <thead>
                      <tr className={TABLE_HEAD_ROW_CLASS}>
                        <th className={TABLE_HEAD_CELL_CLASS}>序号</th>
                        <th className={TABLE_HEAD_CELL_CLASS}>所需数据资源</th>
                        <th className={TABLE_HEAD_CELL_CLASS}>来源单位</th>
                        <th className={TABLE_HEAD_CELL_CLASS}>数据资源分类</th>
                        <th className={TABLE_HEAD_CELL_CLASS}>数据类别</th>
                        <th className={TABLE_HEAD_CELL_CLASS}>业务分类</th>
                        <th className={TABLE_HEAD_CELL_CLASS}>共享方式</th>
                        <th className={TABLE_HEAD_CELL_CLASS}>更新频率</th>
                        <th className={TABLE_HEAD_CELL_CLASS}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedEntries.map(({ item, meta, sourceName }, index) => (
                        <tr
                          key={item.id}
                          className={cn(TABLE_ROW_CLASS, index % 2 === 0 ? TABLE_EVEN_ROW_CLASS : TABLE_ODD_ROW_CLASS)}
                        >
                          <td className={cn(TABLE_CELL_CLASS, 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]')}>
                            {meta.sequence || '-'}
                          </td>
                          <td className={cn(TABLE_CELL_CLASS, 'max-w-[280px] px-4 py-4 align-top')}>
                            <div className="font-medium leading-6 text-[var(--text-main)]">{item.requiredDataResourceName}</div>
                          </td>
                          <td className={cn(TABLE_CELL_CLASS, 'max-w-[220px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]')}>
                            {sourceName || '未标注'}
                          </td>
                          <td className={cn(TABLE_CELL_CLASS, 'max-w-[180px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]')}>
                            {item.domainCategoryName || '未标注'}
                          </td>
                          <td className={cn(TABLE_CELL_CLASS, 'max-w-[180px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]')}>
                            {meta.dataCategory || '未标注'}
                          </td>
                          <td className={cn(TABLE_CELL_CLASS, 'max-w-[180px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]')}>
                            {meta.businessCategory || '未标注'}
                          </td>
                          <td className={cn(TABLE_CELL_CLASS, 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]')}>
                            {meta.shareMode || '未标注'}
                          </td>
                          <td className={cn(TABLE_CELL_CLASS, 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]')}>
                            {meta.updateFrequency || '未标注'}
                          </td>
                          <td className={cn(TABLE_CELL_CLASS, 'px-4 py-4 align-top')}>
                            <Link
                              to={buildDetailPath(item.id)}
                              state={{ returnTo }}
                              className="inline-flex items-center gap-1 rounded-full border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] px-3 py-1.5 text-[0.75rem] font-semibold text-[var(--primary)] transition hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white"
                            >
                              查看详情
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {filteredEntries.length > PAGE_SIZE ? (
                <div className="mt-5 flex flex-col gap-3 border-t border-[var(--line-soft)] pt-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="text-[0.75rem] text-[var(--text-muted)]">
                    当前第 <span className="font-semibold text-[var(--primary)]">{safePage}</span> / {totalPages} 页，每页 {PAGE_SIZE} 条，共 {filteredEntries.length} 条
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={safePage === 1}
                      className={cn(
                        'inline-flex h-9 items-center rounded-[10px] px-4 text-[0.8125rem] disabled:cursor-not-allowed disabled:opacity-40',
                        NAVY_SOFT_BUTTON_CLASS,
                      )}
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={safePage === totalPages}
                      className={cn(
                        'inline-flex h-9 items-center rounded-[10px] px-4 text-[0.8125rem] disabled:cursor-not-allowed disabled:opacity-40',
                        NAVY_SOFT_BUTTON_CLASS,
                      )}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
