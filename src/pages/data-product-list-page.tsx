import { useMemo } from 'react'
import { ArrowRight, Boxes, CalendarRange, CheckCircle2, Code2, ExternalLink, GitBranch, KanbanSquare, LayoutList, LockKeyhole, Search, Table2 } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { DataProductCatalogTabs } from '../components/data-product-catalog-tabs'
import { StatCard, TopicPill } from '../components/ui'
import {
  DATA_PRODUCT_VIEW_MODE_LABELS,
  type DataProductAuthorizationStatus,
  type DataProductViewMode,
  useDataProducts,
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

const authOptions: Array<{ id: '' | DataProductAuthorizationStatus; label: string }> = [
  { id: '', label: '全部授权状态' },
  { id: 'authorized', label: '已授权可用' },
  { id: 'restricted', label: '需申请授权' },
]

function updateSearchParams(
  searchParams: URLSearchParams,
  setSearchParams: (next: URLSearchParams) => void,
  updates: Record<string, string>,
) {
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

export function DataProductListPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { products, isLoading, error } = useDataProducts()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const keyword = (searchParams.get('keyword') ?? '').trim()
  const activeDomain = searchParams.get('domain') ?? ''
  const activeMode = searchParams.get('mode') ?? ''
  const activeAuth = searchParams.get('auth') ?? ''
  const domains = useMemo(
    () => Array.from(new Set(products.map((product) => product.domain))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    [products],
  )
  const viewModes = useMemo(
    () => Array.from(new Set(products.flatMap((product) => product.supportedModes))),
    [products],
  )
  const filteredProducts = useMemo(() => {
    const normalizedKeyword = keyword.toLowerCase()
    return products.filter((product) => {
      const keywordMatched = !normalizedKeyword || [
        product.name,
        product.summary,
        product.domain,
        product.owner,
        product.api.endpoint,
      ].some((value) => value.toLowerCase().includes(normalizedKeyword))
      const domainMatched = !activeDomain || product.domain === activeDomain
      const modeMatched = !activeMode || product.supportedModes.includes(activeMode as DataProductViewMode)
      const authMatched = !activeAuth || product.authorizationStatus === activeAuth
      return keywordMatched && domainMatched && modeMatched && authMatched
    })
  }, [activeAuth, activeDomain, activeMode, keyword, products])

  const authorizedCount = products.filter((product) => product.authorizationStatus === 'authorized').length
  const scriptEnabledCount = products.filter((product) => product.supportedModes.includes('script')).length

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[24px] border border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] px-6 py-6 shadow-[var(--shadow-elevated)]">
        <div className="flex flex-col gap-5">
          <DataProductCatalogTabs activeId="data-product" />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <TopicPill>数据资源目录 / 数据产品</TopicPill>
                <TopicPill>外部 API 接入</TopicPill>
                <TopicPill>组件嵌入</TopicPill>
              </div>
              <h1 className="mt-5 text-[1.75rem] font-semibold tracking-0 text-[var(--text-main)]">数据产品</h1>
              <p className="mt-3 max-w-[980px] text-[0.9375rem] leading-8 text-[var(--text-secondary)]">
                每个数据产品对应一套独立检索界面和可视化配置，可按树表、表格、日历、看板、图谱或脚本模式快速检查加工后的数据，并通过嵌入地址复用到其他业务页面。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <StatCard title="数据产品" value={`${products.length}`} icon={<LayoutList className="h-4 w-4" />} />
              <StatCard title="已授权" value={`${authorizedCount}`} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
              <StatCard title="脚本视图" value={`${scriptEnabledCount}`} icon={<Code2 className="h-4 w-4" />} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr]">
        <aside className="space-y-3">
          <section className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
            <div className="border-b border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 py-3 text-[0.875rem] font-semibold text-white">
              业务领域
            </div>
            <div className="space-y-1 px-2 py-2.5">
              {['', ...domains].map((domain) => (
                <button
                  key={domain || '__all__'}
                  type="button"
                  onClick={() => updateSearchParams(searchParams, setSearchParams, { domain })}
                  className={`flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-[0.875rem] ${
                    activeDomain === domain
                      ? 'bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tint)]'
                  }`}
                >
                  <span>{domain || '全部领域'}</span>
                  <span>{domain ? products.filter((product) => product.domain === domain).length : products.length}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
            <div className="border-b border-[var(--surface-outline)] px-4 py-3 text-[0.875rem] font-semibold text-[var(--text-main)]">
              检索模式
            </div>
            <div className="space-y-1 px-2 py-2.5">
              <button
                type="button"
                onClick={() => updateSearchParams(searchParams, setSearchParams, { mode: '' })}
                className={`flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-[0.875rem] ${!activeMode ? 'bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tint)]'}`}
              >
                <span>全部模式</span>
                <span>{products.length}</span>
              </button>
              {viewModes.map((mode) => {
                const Icon = modeIcons[mode]
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateSearchParams(searchParams, setSearchParams, { mode })}
                    className={`flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-[0.875rem] ${
                      activeMode === mode
                        ? 'bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tint)]'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" />{DATA_PRODUCT_VIEW_MODE_LABELS[mode]}</span>
                    <span>{products.filter((product) => product.supportedModes.includes(mode)).length}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
            <div className="border-b border-[var(--surface-outline)] px-4 py-3 text-[0.875rem] font-semibold text-[var(--text-main)]">
              使用授权
            </div>
            <div className="space-y-1 px-2 py-2.5">
              {authOptions.map((option) => (
                <button
                  key={option.id || '__all__'}
                  type="button"
                  onClick={() => updateSearchParams(searchParams, setSearchParams, { auth: option.id })}
                  className={`flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-[0.875rem] ${
                    activeAuth === option.id
                      ? 'bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tint)]'
                  }`}
                >
                  <span>{option.label}</span>
                  <span>{option.id ? products.filter((product) => product.authorizationStatus === option.id).length : products.length}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="space-y-3">
          <div className="rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap gap-3">
              <input
                value={keyword}
                onChange={(event) => updateSearchParams(searchParams, setSearchParams, { keyword: event.target.value })}
                className="h-11 flex-1 rounded-[10px] border border-[var(--surface-outline)] bg-[var(--field-bg)] px-4 text-[0.8125rem] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
                placeholder="搜索产品名称、领域、责任单位、接口地址"
              />
              <button
                type="button"
                className="flex h-11 w-12 items-center justify-center rounded-[10px] border border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.18)]"
                aria-label="搜索数据产品"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {isLoading ? (
              <div className="rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 py-12 text-center text-[0.875rem] text-[var(--text-muted)] xl:col-span-2">
                正在从后台加载数据产品...
              </div>
            ) : null}
            {error ? (
              <div className="rounded-[12px] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-6 py-4 text-[0.875rem] text-[var(--status-warning-text)] xl:col-span-2">
                {error}
              </div>
            ) : null}
            {filteredProducts.map((product) => (
              <article
                key={product.id}
                className="group flex h-full flex-col overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)] transition hover:-translate-y-[2px] hover:border-[rgba(var(--theme-soft-rgb),0.26)] hover:shadow-[var(--shadow-medium)]"
              >
                <div className="border-b border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-tint),var(--surface-muted))] px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <TopicPill>{product.domain}</TopicPill>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[0.75rem] font-medium ${
                          product.authorizationStatus === 'authorized'
                            ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                            : 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
                        }`}>
                          {product.authorizationStatus === 'authorized' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                          {product.authorizationStatus === 'authorized' ? '已授权' : '需授权'}
                        </span>
                      </div>
                      <Link
                        to={withEmbed(`/data-products/${product.id}`)}
                        className="mt-4 block text-[1.25rem] font-semibold leading-8 text-[var(--primary)] transition group-hover:text-[var(--primary-strong)]"
                      >
                        {product.name}
                      </Link>
                    </div>
                    <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-[rgba(var(--theme-soft-rgb),0.22)] bg-[var(--surface-raised)] text-[var(--primary)]">
                      <Boxes className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-1 flex-col px-5 py-5">
                  <p className="line-clamp-3 text-[0.875rem] leading-7 text-[var(--text-secondary)]">{product.summary}</p>
                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-3">
                      <div className="text-[0.6875rem] text-[var(--text-muted)]">外部 API</div>
                      <div className="mt-1 truncate text-[0.8125rem] font-medium text-[var(--text-main)]">{product.api.endpoint}</div>
                    </div>
                    <div className="rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-3">
                      <div className="text-[0.6875rem] text-[var(--text-muted)]">更新周期</div>
                      <div className="mt-1 text-[0.8125rem] font-medium text-[var(--text-main)]">{product.updateCycle}</div>
                    </div>
                    <div className="rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-3">
                      <div className="text-[0.6875rem] text-[var(--text-muted)]">责任单位</div>
                      <div className="mt-1 truncate text-[0.8125rem] font-medium text-[var(--text-main)]">{product.owner}</div>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {product.supportedModes.map((mode) => {
                      const Icon = modeIcons[mode]
                      return (
                        <span key={mode} className="inline-flex items-center gap-1 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-1 text-[0.75rem] text-[var(--text-secondary)]">
                          <Icon className="h-3.5 w-3.5" />
                          {DATA_PRODUCT_VIEW_MODE_LABELS[mode]}
                        </span>
                      )
                    })}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
                    <Link
                      to={withEmbed(`/data-products/${product.id}?view=${product.defaultMode}`)}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 text-[0.8125rem] font-semibold text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.18)] transition hover:-translate-y-[1px]"
                    >
                      预览详情
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      to={withEmbed(`/data-products/${product.id}?embed=1&view=${product.defaultMode}`)}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      嵌入组件
                    </Link>
                  </div>
                </div>
              </article>
            ))}
            {!isLoading && filteredProducts.length === 0 ? (
              <div className="rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 py-12 text-center text-[0.875rem] text-[var(--text-muted)] xl:col-span-2">
                当前筛选条件下没有匹配的数据产品。
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
