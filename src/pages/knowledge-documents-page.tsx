import { useMemo } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowRight, CalendarRange, FileSearch, FolderOpen, Plus, Search, Trash2 } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { StatCard, TopicPill } from '../components/ui'
import { buildKnowledgeDocumentClaimCartId, type CatalogClaimCartItem } from '../lib/catalog-claim-cart'
import {
  encodeKnowledgeDocumentId,
  useKnowledgebaseManifest,
  useKnowledgebaseSearch,
  type KnowledgeDocumentManifestItem,
  type KnowledgeDocumentSearchItem,
} from '../lib/knowledgebase-api'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { cn } from '../lib/utils'

const PAGE_SIZE = 24

type FacetOption = {
  id: string
  label: string
  count: number
}

function formatDocumentSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '未知大小'
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${Math.round(size / 1024)} KB`
  return `${size} B`
}

function buildKnowledgeDocumentFileHref(item: KnowledgeDocumentManifestItem | KnowledgeDocumentSearchItem) {
  return item.fileUrl || item.previewUrl || ''
}

function buildKnowledgeDocumentDetailPath(relativePath: string) {
  return `/documents/${encodeKnowledgeDocumentId(relativePath)}`
}

function FacetSection({
  title,
  icon,
  items,
  activeId,
  onSelect,
}: {
  title: string
  icon: ReactNode
  items: FacetOption[]
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
      <div
        title={title}
        className="flex h-12 w-full items-center gap-2 border-b border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 text-left text-[0.875rem] font-semibold text-white shadow-[0_12px_20px_rgba(var(--theme-strong-rgb),0.12)]"
      >
        {icon}
        {title}
      </div>
      <div className="max-h-[360px] overflow-y-auto px-2 py-2.5">
        {items.map((item, index) => (
          <button
            type="button"
            key={item.id || '__all__'}
            className={cn(
              'mb-1 flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-[0.875rem] leading-[1.25rem] last:mb-0',
              activeId === item.id
                ? 'bg-[linear-gradient(180deg,var(--status-info-bg),color-mix(in_srgb,var(--status-info-bg)_70%,var(--surface-raised)))] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
                : index === 0
                  ? 'bg-[var(--surface-muted)] text-[var(--text-main)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tint)]',
            )}
            onClick={() => onSelect(item.id)}
          >
            <span className="truncate pr-3">{item.label}</span>
            <span className="shrink-0">{item.count.toLocaleString()}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function resolveDocumentExcerpt(
  item: KnowledgeDocumentManifestItem | KnowledgeDocumentSearchItem,
  isSearchMode: boolean,
) {
  if (isSearchMode && 'excerpt' in item) {
    return item.excerpt || '正文已命中检索条件，可打开文档查看完整内容。'
  }
  return `${item.categoryPathLabel} · ${item.year || '未标注年份'} · ${formatDocumentSize(item.size)}`
}

type KnowledgeDocumentsPageProps = {
  claimCartItems?: CatalogClaimCartItem[]
  claimCartResourceIdSet?: Set<string>
  isClaimCartCollapsed?: boolean
  onExpandClaimCart?: () => void
  onCollapseClaimCart?: () => void
  onAddClaimCart?: (item: KnowledgeDocumentManifestItem | KnowledgeDocumentSearchItem) => void
  onRemoveClaimCart?: (resourceId: string) => void
  onClearClaimCart?: () => void
  onSubmitClaimCart?: () => void
}

export function KnowledgeDocumentsPage({
  claimCartItems = [],
  claimCartResourceIdSet = new Set(),
  isClaimCartCollapsed = true,
  onExpandClaimCart,
  onCollapseClaimCart,
  onAddClaimCart,
  onRemoveClaimCart,
  onClearClaimCart,
  onSubmitClaimCart,
}: KnowledgeDocumentsPageProps = {}) {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const detailReturnTo = `${location.pathname}${location.search}`
  const supportsClaimCart = Boolean(
    onExpandClaimCart
    && onCollapseClaimCart
    && onAddClaimCart
    && onRemoveClaimCart
    && onClearClaimCart
    && onSubmitClaimCart,
  )
  const { data: manifestData, isLoading: isManifestLoading, error: manifestError } = useKnowledgebaseManifest()
  const activeRootCategory = searchParams.get('category') ?? ''
  const activeYear = searchParams.get('year') ?? ''
  const committedKeyword = (searchParams.get('keyword') ?? '').trim()
  const currentPage = Number(searchParams.get('page') ?? '1') || 1
  const isSearchMode = committedKeyword.length > 0
  const { data: searchData, isLoading: isSearchLoading, error: searchError } = useKnowledgebaseSearch({
    keyword: committedKeyword,
    category: activeRootCategory,
    year: activeYear,
    page: currentPage,
    pageSize: PAGE_SIZE,
  })

  const rootCategoryOptions = useMemo(() => [
    { id: '', label: '全部分类', count: manifestData.totalCount },
    ...manifestData.rootCategoryCounts,
  ], [manifestData.rootCategoryCounts, manifestData.totalCount])

  const yearOptions = useMemo(() => [
    { id: '', label: '全部年份', count: manifestData.totalCount },
    ...manifestData.yearCounts,
  ], [manifestData.totalCount, manifestData.yearCounts])

  const browseItems = useMemo(() => {
    return manifestData.items.filter((item) => {
      if (activeRootCategory && item.rootCategory !== activeRootCategory) return false
      if (activeYear && item.year !== activeYear) return false
      return true
    })
  }, [activeRootCategory, activeYear, manifestData.items])

  const totalBrowsePages = Math.max(1, Math.ceil(browseItems.length / PAGE_SIZE))
  const safeBrowsePage = Math.min(Math.max(currentPage, 1), totalBrowsePages)
  const pagedBrowseItems = useMemo(() => {
    const startIndex = (safeBrowsePage - 1) * PAGE_SIZE
    return browseItems.slice(startIndex, startIndex + PAGE_SIZE)
  }, [browseItems, safeBrowsePage])

  const displayItems = isSearchMode ? searchData.items : pagedBrowseItems
  const totalItems = isSearchMode ? searchData.total : browseItems.length
  const totalPages = isSearchMode
    ? Math.max(1, Math.ceil(searchData.total / Math.max(searchData.pageSize, 1)))
    : totalBrowsePages
  const safePage = isSearchMode ? Math.min(Math.max(currentPage, 1), totalPages) : safeBrowsePage

  const updateParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        next.delete(key)
      } else {
        next.set(key, value)
      }
    })
    setSearchParams(next)
  }

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('category')
    next.delete('year')
    next.delete('keyword')
    next.delete('page')
    setSearchParams(next)
  }

  const submitKeyword = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (!event) return
    const formData = new FormData(event.currentTarget)
    updateParams({ keyword: String(formData.get('keyword') ?? '').trim(), page: '1' })
  }

  const currentRootCategoryLabel = rootCategoryOptions.find((item) => item.id === activeRootCategory)?.label ?? activeRootCategory
  const currentYearLabel = yearOptions.find((item) => item.id === activeYear)?.label ?? activeYear

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[24px] border border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] px-6 py-6 shadow-[var(--shadow-elevated)]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="文档总量" value={`${manifestData.totalCount}`} icon={<FolderOpen className="h-5 w-5" />} />
          <StatCard title="分类数量" value={`${manifestData.rootCategoryCounts.length}`} icon={<FileSearch className="h-5 w-5" />} />
          <StatCard title="年份覆盖" value={`${manifestData.yearCounts.length}`} icon={<CalendarRange className="h-5 w-5" />} />
          <StatCard title={isSearchMode ? '检索结果' : '当前展示'} value={`${totalItems}`} tone="green" icon={<Search className="h-5 w-5" />} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr]">
        <aside className="space-y-3 pb-3">
          <FacetSection
            title="文档分类"
            icon={<FolderOpen className="h-4 w-4" />}
            items={rootCategoryOptions}
            activeId={activeRootCategory}
            onSelect={(id) => updateParams({ category: id, page: '1' })}
          />
          <FacetSection
            title="发布年份"
            icon={<CalendarRange className="h-4 w-4" />}
            items={yearOptions}
            activeId={activeYear}
            onSelect={(id) => updateParams({ year: id, page: '1' })}
          />
        </aside>

        <section className={supportsClaimCart && !isClaimCartCollapsed ? 'grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start' : 'space-y-3'}>
          <div className="space-y-3">
            <div className="rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
              <form className="flex flex-wrap gap-3" onSubmit={submitKeyword}>
                <input
                  key={`knowledgebase-search:${committedKeyword}`}
                  name="keyword"
                  defaultValue={committedKeyword}
                  className="h-11 flex-1 rounded-[10px] border border-[var(--surface-outline)] bg-[var(--field-bg)] px-4 text-[0.8125rem] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
                  placeholder="全文检索知识文档标题、标准编号、正文内容"
                />
                <button
                  type="submit"
                  className="flex h-11 w-12 items-center justify-center rounded-[10px] border border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.18)] transition hover:translate-y-[-1px]"
                >
                  <Search className="h-4 w-4" />
                </button>
                {supportsClaimCart && isClaimCartCollapsed ? (
                  <button
                    type="button"
                    onClick={onExpandClaimCart}
                    className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-main)] shadow-[var(--shadow-soft)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    title="展开数据申领夹"
                    aria-label="展开数据申领夹"
                  >
                    <FolderOpen className="h-4 w-4" />
                    <span>数据申领夹</span>
                    <span className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--status-info-text)]">
                      {claimCartItems.length}
                    </span>
                  </button>
                ) : null}
              </form>
            </div>

            <div className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-5 py-4 shadow-[var(--shadow-medium)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-[0.75rem] text-[var(--text-muted)]">
              <div>
                共计 <span className="font-semibold text-[var(--primary)]">{totalItems}</span> {isSearchMode ? '条检索结果' : '份知识文档'}
              </div>
              <div>{isSearchMode ? '检索结果' : '分类浏览'}</div>
            </div>

            {(activeRootCategory || activeYear || committedKeyword) ? (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-muted),var(--surface-tint))] px-3 py-3 text-[0.75rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <span className="font-medium text-[var(--text-main)]">当前筛选</span>
                {activeRootCategory ? (
                  <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">
                    文档分类：{currentRootCategoryLabel}
                  </span>
                ) : null}
                {activeYear ? (
                  <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">
                    发布年份：{currentYearLabel}
                  </span>
                ) : null}
                {committedKeyword ? (
                  <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">
                    检索：{committedKeyword}
                  </span>
                ) : null}
                <button type="button" className="ml-auto text-[var(--primary)]" onClick={clearFilters}>
                  清空筛选
                </button>
              </div>
            ) : null}

            {manifestError ? (
              <div className="mb-4 rounded-[10px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
                {manifestError}
              </div>
            ) : null}

            {searchError ? (
              <div className="mb-4 rounded-[10px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
                {searchError}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              {displayItems.map((item) => (
                (() => {
                  const claimCartItemId = buildKnowledgeDocumentClaimCartId(item.relativePath)

                  return (
                    <article
                      key={item.id}
                      className="group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-[3px] hover:border-[rgba(var(--theme-soft-rgb),0.26)] hover:shadow-[var(--shadow-medium)]"
                    >
                      <div className="border-b border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-tint),var(--surface-muted))] px-5 py-4">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[rgba(var(--theme-soft-rgb),0.24)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-tint))] text-[var(--primary)]">
                            <FolderOpen className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <Link
                              to={withEmbed(buildKnowledgeDocumentDetailPath(item.relativePath))}
                              className="line-clamp-2 block text-[1.0625rem] font-semibold leading-[1.45] tracking-[0.01em] text-[var(--primary)] transition group-hover:text-[var(--primary-strong)]"
                            >
                              {item.title}
                            </Link>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <TopicPill>{item.rootCategory || '未标注分类'}</TopicPill>
                              <TopicPill>{item.year || '未标注年份'}</TopicPill>
                              <TopicPill>{item.extension.toUpperCase()}</TopicPill>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex h-full flex-col px-5 pb-5 pt-5">
                        <p className="line-clamp-4 min-h-[7rem] text-[0.875rem] leading-7 text-[var(--text-secondary)]">
                          {resolveDocumentExcerpt(item, isSearchMode)}
                        </p>

                        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5 text-[0.8125rem] text-[var(--text-muted)]">
                          <span className="truncate">{item.categoryPathLabel}</span>
                          <div className="flex shrink-0 flex-wrap items-center gap-3">
                            {supportsClaimCart ? (
                              <button
                                type="button"
                                disabled={claimCartResourceIdSet.has(claimCartItemId)}
                                onClick={() => onAddClaimCart?.(item)}
                                className={`inline-flex h-10 items-center gap-1 rounded-full border px-3 text-[0.75rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                  claimCartResourceIdSet.has(claimCartItemId)
                                    ? 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
                                    : 'border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                                }`}
                                title={claimCartResourceIdSet.has(claimCartItemId) ? '当前资源已在数据申领夹中' : '加入数据申领夹'}
                              >
                                <Plus className="h-4 w-4" />
                                {claimCartResourceIdSet.has(claimCartItemId) ? '已在申领夹' : '加入申领夹'}
                              </button>
                            ) : null}
                            <Link
                              to={withEmbed(buildKnowledgeDocumentDetailPath(item.relativePath))}
                              className="font-medium text-[var(--primary)]"
                            >
                              查看详情
                            </Link>
                            {buildKnowledgeDocumentFileHref(item) ? (
                              <a
                                href={buildKnowledgeDocumentFileHref(item)}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-[var(--text-secondary)]"
                              >
                                打开文档
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })()
              ))}
            </div>

            {(isManifestLoading || isSearchLoading) ? (
              <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">
                {isSearchMode ? '正在检索知识文档...' : '正在加载知识文档清单...'}
              </div>
            ) : null}

            {!isManifestLoading && !isSearchLoading && displayItems.length === 0 ? (
              <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">
                {isSearchMode ? '当前关键词下没有匹配的知识文档。' : '当前分类下暂无知识文档。'}
              </div>
            ) : null}

            {displayItems.length > 0 ? (
              <div className="mt-6 flex flex-col gap-3 border-t border-[var(--line-soft)] pt-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-[0.75rem] text-[var(--text-muted)]">
                  当前第 <span className="font-semibold text-[var(--primary)]">{safePage}</span> / {totalPages} 页，每页 {PAGE_SIZE} 条
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateParams({ page: String(Math.max(1, safePage - 1)) })}
                    disabled={safePage === 1}
                    className="inline-flex h-9 items-center rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] text-[var(--text-secondary)] transition hover:border-[rgba(var(--theme-soft-rgb),0.16)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    onClick={() => updateParams({ page: String(Math.min(totalPages, safePage + 1)) })}
                    disabled={safePage === totalPages}
                    className="inline-flex h-9 items-center rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] text-[var(--text-secondary)] transition hover:border-[rgba(var(--theme-soft-rgb),0.16)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            ) : null}
            </div>
          </div>

          {supportsClaimCart && !isClaimCartCollapsed ? (
            <aside className="xl:sticky xl:top-4">
              <div className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-medium)]">
                <div className="border-b border-[var(--surface-outline)] px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[1rem] font-semibold text-[var(--text-main)]">
                        <FolderOpen className="h-4.5 w-4.5 text-[var(--primary)]" />
                        <span>数据申领夹</span>
                      </div>
                      <div className="mt-2 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
                        先把目录资源放进申领夹，再统一提交供需对接申请单。内容只保存在当前浏览器本地缓存。
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="inline-flex min-w-[56px] items-center justify-center rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] font-semibold text-[var(--status-info-text)]">
                        {claimCartItems.length} 项
                      </div>
                      <button
                        type="button"
                        onClick={onCollapseClaimCart}
                        className="inline-flex h-9 items-center rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 text-[0.75rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                        title="收起数据申领夹"
                        aria-label="收起数据申领夹"
                      >
                        收起
                      </button>
                    </div>
                  </div>
                  {claimCartItems.length > 0 ? (
                    <button
                      type="button"
                      onClick={onClearClaimCart}
                      className="mt-3 inline-flex items-center gap-1 text-[0.75rem] font-medium text-[var(--primary)] transition hover:opacity-80"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      清空申领夹
                    </button>
                  ) : null}
                </div>

                {claimCartItems.length > 0 ? (
                  <div className="max-h-[480px] space-y-3 overflow-y-auto px-4 py-4">
                    {claimCartItems.map((item) => (
                      <div
                        key={item.resourceId}
                        className="rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              to={withEmbed(item.detailPath)}
                              state={{ returnTo: detailReturnTo }}
                              className="line-clamp-2 text-[0.875rem] font-semibold leading-6 text-[var(--text-main)] transition hover:text-[var(--primary)]"
                            >
                              {item.resourceName}
                            </Link>
                            <div className="mt-2 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
                              {item.category || '未标注分类'} · {item.department || '未标注部门'}
                            </div>
                            <div className="text-[0.6875rem] leading-5 text-[var(--text-muted)]">
                              更新周期：{item.updateCycle || '未标注'}{item.resourceCode ? ` · 编码：${item.resourceCode}` : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveClaimCart?.(item.resourceId)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                            aria-label={`移出数据申领夹-${item.resourceName}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-10 text-[0.8125rem] leading-7 text-[var(--text-secondary)]">
                    当前申领夹还是空的。先在左侧资源卡片里点击“加入申领夹”，再回来统一提交供需对接申请单。
                  </div>
                )}

                <div className="border-t border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-4">
                  <div className="text-[0.75rem] text-[var(--text-muted)]">
                    已选择 <span className="font-semibold text-[var(--primary)]">{claimCartItems.length}</span> 个数据资源
                  </div>
                  <button
                    type="button"
                    onClick={onSubmitClaimCart}
                    disabled={claimCartItems.length === 0}
                    className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[999px] border border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-5 text-[0.8125rem] font-semibold text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.18)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowRight className="h-4 w-4" />
                    统一提交供需对接申请单
                  </button>
                </div>
              </div>
            </aside>
          ) : null}
        </section>
      </div>
    </div>
  )
}
