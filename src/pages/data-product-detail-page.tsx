import { useMemo } from 'react'
import { ArrowLeft, Boxes, CalendarRange, CheckCircle2, Code2, ExternalLink, GitBranch, KanbanSquare, LockKeyhole, Network, Search, Table2 } from 'lucide-react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { DataProductCatalogTabs } from '../components/data-product-catalog-tabs'
import { StatCard, TopicPill } from '../components/ui'
import {
  buildDataProductFacetOptions,
  buildDataProductMetricCards,
  DATA_PRODUCT_VIEW_MODE_LABELS,
  filterDataProductRows,
  getDefaultDataProductView,
  runDataProductScript,
  stringifyRecordValue,
  useDataProduct,
  useDataProductRows,
  type DataProductDefinition,
  type DataProductRecord,
  type DataProductViewMode,
} from '../lib/data-products'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'

const modeIcons: Record<DataProductViewMode, typeof Table2> = {
  'tree-table': GitBranch,
  table: Table2,
  calendar: CalendarRange,
  kanban: KanbanSquare,
  graph: Boxes,
  script: Code2,
}

function resolveViewMode(product: DataProductDefinition, value: string | null): DataProductViewMode {
  const normalized = (value ?? '').trim() as DataProductViewMode
  return product.supportedModes.includes(normalized) ? normalized : getDefaultDataProductView(product)
}

function updateParams(searchParams: URLSearchParams, setSearchParams: (next: URLSearchParams) => void, updates: Record<string, string>) {
  const next = new URLSearchParams(searchParams)
  Object.entries(updates).forEach(([key, value]) => {
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
  })
  setSearchParams(next)
}

function DataProductTable({ product, rows }: { product: DataProductDefinition; rows: DataProductRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)]">
      <table className="w-full min-w-[920px] table-auto border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            {product.fields.map((field) => (
              <th key={field.key} className="border-b border-[var(--surface-outline)] bg-[var(--table-header-bg)] px-4 py-3 text-[0.75rem] font-semibold text-[var(--text-secondary)]">
                {field.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={stringifyRecordValue(row.id) + index} className="odd:bg-[var(--table-row-alt)] hover:bg-[var(--table-row-hover)]">
              {product.fields.map((field) => (
                <td key={field.key} className="border-b border-[var(--surface-outline)] px-4 py-3 text-[0.8125rem] text-[var(--text-main)]">
                  {stringifyRecordValue(row[field.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <div className="px-6 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">当前筛选下暂无数据。</div> : null}
    </div>
  )
}

function DataProductTreeTable({ product, rows, groupField }: { product: DataProductDefinition; rows: DataProductRecord[]; groupField: string }) {
  const groups = useMemo(() => {
    const next = new Map<string, DataProductRecord[]>()
    rows.forEach((row) => {
      const key = stringifyRecordValue(row[groupField])
      next.set(key, [...(next.get(key) ?? []), row])
    })
    return Array.from(next.entries())
  }, [groupField, rows])

  return (
    <div className="space-y-3">
      {groups.map(([label, groupRows]) => (
        <section key={label} className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--surface-outline)] bg-[var(--surface-tint)] px-5 py-3">
            <div className="inline-flex items-center gap-2 text-[0.9375rem] font-semibold text-[var(--text-main)]">
              <GitBranch className="h-4 w-4 text-[var(--primary)]" />
              {label}
            </div>
            <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-info-text)]">{groupRows.length} 条</span>
          </div>
          <DataProductTable product={product} rows={groupRows} />
        </section>
      ))}
      {groups.length === 0 ? <div className="rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">当前筛选下暂无树表数据。</div> : null}
    </div>
  )
}

function DataProductKanban({ product, rows }: { product: DataProductDefinition; rows: DataProductRecord[] }) {
  const groups = useMemo(() => {
    const next = new Map<string, DataProductRecord[]>()
    rows.forEach((row) => {
      const key = stringifyRecordValue(row[product.statusField])
      next.set(key, [...(next.get(key) ?? []), row])
    })
    return Array.from(next.entries())
  }, [product.statusField, rows])

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      {groups.map(([label, groupRows]) => (
        <section key={label} className="min-h-[320px] rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between border-b border-[var(--surface-outline)] px-4 py-3">
            <div className="inline-flex items-center gap-2 text-[0.875rem] font-semibold text-[var(--text-main)]">
              <KanbanSquare className="h-4 w-4 text-[var(--primary)]" />
              {label}
            </div>
            <span className="text-[0.75rem] text-[var(--text-muted)]">{groupRows.length} 项</span>
          </div>
          <div className="space-y-2 p-3">
            {groupRows.map((row, index) => (
              <div key={stringifyRecordValue(row.id) + index} className="rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-3 shadow-[0_8px_20px_rgba(39,80,120,0.05)]">
                <div className="line-clamp-2 text-[0.875rem] font-semibold leading-6 text-[var(--text-main)]">{stringifyRecordValue(row[product.primaryField])}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-[0.75rem] text-[var(--text-muted)]">
                  <span>{stringifyRecordValue(row.region)}</span>
                  <span>{stringifyRecordValue(row.owner)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function DataProductCalendar({ product, rows }: { product: DataProductDefinition; rows: DataProductRecord[] }) {
  const days = useMemo(() => {
    const next = new Map<string, DataProductRecord[]>()
    rows.forEach((row) => {
      const key = stringifyRecordValue(row[product.dateField])
      next.set(key, [...(next.get(key) ?? []), row])
    })
    return Array.from(next.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [product.dateField, rows])

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {days.map(([day, dayRows]) => (
        <section key={day} className="rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between border-b border-[var(--surface-outline)] pb-3">
            <div className="inline-flex items-center gap-2 text-[0.875rem] font-semibold text-[var(--text-main)]">
              <CalendarRange className="h-4 w-4 text-[var(--primary)]" />
              {day}
            </div>
            <span className="text-[0.75rem] text-[var(--text-muted)]">{dayRows.length} 条</span>
          </div>
          <div className="mt-3 space-y-2">
            {dayRows.map((row, index) => (
              <div key={stringifyRecordValue(row.id) + index} className="rounded-[9px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-2 text-[0.8125rem] text-[var(--text-main)]">
                <div className="font-medium">{stringifyRecordValue(row[product.primaryField])}</div>
                <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">{stringifyRecordValue(row[product.statusField])} · {stringifyRecordValue(row.owner)}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function DataProductGraph({ product, rows }: { product: DataProductDefinition; rows: DataProductRecord[] }) {
  const visibleRows = rows.slice(0, 8)
  const width = 960
  const height = 420
  const centerX = width / 2
  const centerY = 74
  const radius = 150

  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--lineage-canvas-border)] bg-[linear-gradient(180deg,var(--lineage-canvas-bg-start),var(--lineage-canvas-bg-end))] p-4 shadow-[var(--shadow-soft)]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
        <defs>
          <linearGradient id="data-product-node" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#fdfefe" />
            <stop offset="100%" stopColor="#ddecff" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={height} rx="18" fill="rgba(255,255,255,0.34)" />
        <g>
          <rect x={centerX - 130} y="28" width="260" height="92" rx="18" fill="url(#data-product-node)" stroke="rgba(88,154,235,0.72)" />
          <text x={centerX} y="70" textAnchor="middle" className="fill-[var(--text-main)] text-[18px] font-semibold">{product.name}</text>
          <text x={centerX} y="96" textAnchor="middle" className="fill-[var(--text-secondary)] text-[12px]">{product.domain} · {product.owner}</text>
        </g>
        {visibleRows.map((row, index) => {
          const angle = Math.PI * 0.12 + (Math.PI * 0.76 * index) / Math.max(visibleRows.length - 1, 1)
          const x = centerX - radius * Math.cos(angle) + (index % 2 === 0 ? -120 : 120)
          const y = centerY + 120 + radius * Math.sin(angle)
          return (
            <g key={stringifyRecordValue(row.id) + index}>
              <path d={`M${centerX} 120 C${centerX} ${y - 60}, ${x} ${centerY + 80}, ${x} ${y}`} fill="none" stroke="rgba(62,131,230,0.28)" strokeWidth="2" />
              <rect x={x - 116} y={y - 30} width="232" height="72" rx="14" fill="rgba(255,255,255,0.86)" stroke="rgba(126,180,241,0.58)" />
              <text x={x} y={y - 4} textAnchor="middle" className="fill-[var(--text-main)] text-[13px] font-semibold">{stringifyRecordValue(row[product.primaryField]).slice(0, 16)}</text>
              <text x={x} y={y + 18} textAnchor="middle" className="fill-[var(--text-muted)] text-[11px]">{stringifyRecordValue(row[product.statusField])} · {stringifyRecordValue(row.region)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function DataProductScriptPanel({ product, rows }: { product: DataProductDefinition; rows: DataProductRecord[] }) {
  const cards = runDataProductScript(product, rows)
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-[12px] border px-5 py-5 shadow-[var(--shadow-soft)] ${
            card.tone === 'green'
              ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)]'
              : card.tone === 'amber'
                ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]'
                : 'border-[var(--status-info-border)] bg-[var(--status-info-bg)]'
          }`}>
            <div className="text-[0.75rem] text-[var(--text-secondary)]">{card.label}</div>
            <div className="mt-2 text-[1.5rem] font-semibold text-[var(--text-main)]">{card.value}</div>
            <div className="mt-2 text-[0.75rem] leading-6 text-[var(--text-secondary)]">{card.note}</div>
          </div>
        ))}
      </div>
      <pre className="max-h-[360px] overflow-auto rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-4 text-[0.75rem] leading-6 text-[var(--text-secondary)]">{product.scriptSource}</pre>
    </div>
  )
}

function DataProductPreview({
  product,
  rows,
  viewMode,
  groupField,
}: {
  product: DataProductDefinition
  rows: DataProductRecord[]
  viewMode: DataProductViewMode
  groupField: string
}) {
  if (viewMode === 'tree-table') return <DataProductTreeTable product={product} rows={rows} groupField={groupField} />
  if (viewMode === 'calendar') return <DataProductCalendar product={product} rows={rows} />
  if (viewMode === 'kanban') return <DataProductKanban product={product} rows={rows} />
  if (viewMode === 'graph') return <DataProductGraph product={product} rows={rows} />
  if (viewMode === 'script') return <DataProductScriptPanel product={product} rows={rows} />
  return <DataProductTable product={product} rows={rows} />
}

export function DataProductDetailPage() {
  const { id } = useParams()
  const { product, isLoading: isProductLoading, error: productError } = useDataProduct(id)
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const viewMode = product ? resolveViewMode(product, searchParams.get('view')) : 'table'
  const keyword = searchParams.get('keyword') ?? ''
  const dimensionField = searchParams.get('dimension') ?? product?.dimensions[0]?.field ?? ''
  const dimensionValue = searchParams.get('dimensionValue') ?? ''
  const { rows, isLoading, error } = useDataProductRows(product)
  const filteredRows = useMemo(
    () => product ? filterDataProductRows(rows, keyword, dimensionField, dimensionValue) : [],
    [dimensionField, dimensionValue, keyword, product, rows],
  )
  const metrics = useMemo(() => product ? buildDataProductMetricCards(product, filteredRows) : [], [filteredRows, product])
  const activeDimension = product?.dimensions.find((dimension) => dimension.field === dimensionField) ?? product?.dimensions[0]
  const facetOptions = useMemo(
    () => activeDimension ? buildDataProductFacetOptions(rows, activeDimension.field) : [],
    [activeDimension, rows],
  )
  const embedPath = product ? `/data-products/${product.id}?embed=1&view=${viewMode}` : '/data-products?embed=1'

  if (isProductLoading) {
    return <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在从后台加载数据产品...</div>
  }

  if (productError) {
    return <div className="py-12 text-center text-[0.875rem] text-[var(--status-warning-text)]">{productError}</div>
  }

  if (!product) {
    return <Navigate to={withEmbed('/data-products')} replace />
  }

  return (
    <div className={isEmbedMode ? 'space-y-4' : 'space-y-4'}>
      {!isEmbedMode ? (
        <section className="overflow-hidden rounded-[24px] border border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] px-6 py-6 shadow-[var(--shadow-elevated)]">
          <div className="space-y-5">
            <DataProductCatalogTabs activeId="data-product" />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link to={withEmbed('/data-products')} className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]">
                <ArrowLeft className="h-4 w-4" />
                返回数据产品
              </Link>
              <Link to={withEmbed(embedPath)} className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]">
                <ExternalLink className="h-4 w-4" />
                嵌入预览
              </Link>
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <TopicPill>{product.domain}</TopicPill>
                  <TopicPill>{product.api.method} · {product.api.authMode}</TopicPill>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[0.75rem] font-medium ${
                    product.authorizationStatus === 'authorized'
                      ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                      : 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
                  }`}>
                    {product.authorizationStatus === 'authorized' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                    {product.authorizationStatus === 'authorized' ? '已授权可直接使用' : '需获得授权后使用'}
                  </span>
                </div>
                <h1 className="mt-5 text-[1.75rem] font-semibold text-[var(--text-main)]">{product.name}</h1>
                <p className="mt-3 max-w-[960px] text-[0.9375rem] leading-8 text-[var(--text-secondary)]">{product.summary}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {metrics.map((metric) => (
                  <StatCard key={metric.label} title={metric.label} value={metric.value} icon={<Network className="h-4 w-4" />} />
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr]">
        <aside className="space-y-3">
          <div className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
            <div className="border-b border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 py-3 text-[0.875rem] font-semibold text-white">
              显示模式
            </div>
            <div className="space-y-1 px-2 py-2.5">
              {product.supportedModes.map((mode) => {
                const Icon = modeIcons[mode]
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateParams(searchParams, setSearchParams, { view: mode })}
                    className={`flex w-full items-center gap-2 rounded-[8px] px-3 py-[10px] text-left text-[0.875rem] ${
                      viewMode === mode
                        ? 'bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tint)]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {DATA_PRODUCT_VIEW_MODE_LABELS[mode]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
            <div className="border-b border-[var(--surface-outline)] px-4 py-3 text-[0.875rem] font-semibold text-[var(--text-main)]">
              检索维度
            </div>
            <div className="space-y-2 px-3 py-3">
              <select
                value={activeDimension?.field ?? ''}
                onChange={(event) => updateParams(searchParams, setSearchParams, { dimension: event.target.value, dimensionValue: '' })}
                className="h-10 w-full rounded-[10px] border border-[var(--surface-outline)] bg-[var(--field-bg)] px-3 text-[0.8125rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
              >
                {product.dimensions.map((dimension) => (
                  <option key={dimension.id} value={dimension.field}>{dimension.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => updateParams(searchParams, setSearchParams, { dimensionValue: '' })}
                className={`flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-[0.875rem] ${!dimensionValue ? 'bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tint)]'}`}
              >
                <span>全部</span>
                <span>{rows.length}</span>
              </button>
              {facetOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => updateParams(searchParams, setSearchParams, { dimensionValue: option.label })}
                  className={`flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-[0.875rem] ${
                    dimensionValue === option.label
                      ? 'bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tint)]'
                  }`}
                >
                  <span className="truncate pr-2">{option.label}</span>
                  <span>{option.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4 text-[0.75rem] leading-6 text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
            <div className="text-[0.875rem] font-semibold text-[var(--text-main)]">外部数据 API</div>
            <div className="mt-3 break-all rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-[0.75rem]">{product.api.endpoint}</div>
            <div className="mt-3">刷新频率：{product.api.refreshInterval}</div>
            <div>鉴权方式：{product.api.authMode}</div>
            <div className="mt-3 rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-2">
              嵌入地址：{embedPath}
            </div>
          </div>
        </aside>

        <div className="space-y-3">
          <div className="rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap gap-3">
              <input
                value={keyword}
                onChange={(event) => updateParams(searchParams, setSearchParams, { keyword: event.target.value })}
                className="h-11 flex-1 rounded-[10px] border border-[var(--surface-outline)] bg-[var(--field-bg)] px-4 text-[0.8125rem] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
                placeholder="在当前数据产品中搜索名称、状态、区域、责任单位"
              />
              <button type="button" className="flex h-11 w-12 items-center justify-center rounded-[10px] border border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.18)]" aria-label="搜索">
                <Search className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.75rem] text-[var(--text-muted)]">
              <span>当前视图：{DATA_PRODUCT_VIEW_MODE_LABELS[viewMode]}</span>
              <span>筛选结果：{filteredRows.length} / {rows.length}</span>
              {isLoading ? <span>接口同步中...</span> : null}
              {error ? <span className="text-[var(--status-warning-text)]">接口回退：{error}</span> : null}
            </div>
          </div>

          <DataProductPreview
            product={product}
            rows={filteredRows}
            viewMode={viewMode}
            groupField={activeDimension?.field ?? product.dimensions[0]?.field ?? product.statusField}
          />
        </div>
      </section>
    </div>
  )
}
