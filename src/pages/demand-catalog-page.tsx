import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, Clock, Database, Globe, Layers, Search, Workflow } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  createInitialExpandedCategoryIds,
  pruneEmptyCategoryTreeNodes,
  toggleExpandedCategoryId,
  type CatalogCategoryTreeNode,
} from '../lib/catalog-category-tree'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { matchesFullTextSearch } from '../lib/full-text-search'
import { usePortalDemandCatalogData } from '../lib/nocobase-demand-data'
import { cn } from '../lib/utils'
import { getCategoryIcon } from '../lib/category-helper'

function SidebarSection({
  title,
  icon,
  items,
  activeLabel,
  onSelect,
}: {
  title: string
  icon: ReactNode
  items: Array<[string, number]>
  activeLabel: string
  onSelect: (label: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="overflow-hidden rounded-[12px] border border-[rgba(212,225,235,0.96)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,250,253,0.92))] shadow-[0_18px_40px_rgba(36,77,121,0.08)]">
      <button
        type="button"
        className="flex h-12 w-full items-center gap-2 border-b border-[rgba(226,235,241,0.9)] bg-[linear-gradient(180deg,#fafdff,#f3f8fc)] px-4 text-left text-[0.875rem] font-semibold text-[var(--primary)]"
        onClick={() => setCollapsed((value) => !value)}
      >
        {icon}
        {title}
        <span className="ml-auto flex items-center gap-1 text-[0.75rem] font-normal text-[var(--text-muted)]">
          {collapsed ? '展开' : '收起'}
          <ChevronDown className={`h-4 w-4 transition ${collapsed ? '-rotate-90' : ''}`} />
        </span>
      </button>
      {!collapsed && (
        <div className="max-h-[360px] overflow-y-auto px-2 py-2.5">
          {items.map(([label, count]) => (
            <button
              type="button"
              key={label}
              className={`mb-1 flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-[0.8125rem] ${
                activeLabel === label
                  ? 'bg-[linear-gradient(180deg,#edf6ff,#e4f1fd)] text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(117,170,220,0.22)]'
                  : 'text-[#546273] hover:bg-[rgba(243,248,252,0.9)]'
              }`}
              onClick={() => onSelect(label)}
            >
              <span>{label}</span>
              <span className="text-[0.6875rem] opacity-70">{count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarTreeSection({
  title,
  icon,
  tree,
  activeNodeId,
  onSelect,
}: {
  title: string
  icon: ReactNode
  tree: CatalogCategoryTreeNode[]
  activeNodeId: string
  onSelect: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedIds, setExpandedIds] = useState<string[]>(() => createInitialExpandedCategoryIds(tree, activeNodeId))

  useEffect(() => {
    const required = createInitialExpandedCategoryIds(tree, activeNodeId)
    setExpandedIds((current) => Array.from(new Set([...required, ...current])))
  }, [tree, activeNodeId])

  const renderNode = (node: CatalogCategoryTreeNode) => {
    const isActive = activeNodeId === node.id
    const isExpanded = expandedIds.includes(node.id)
    const hasChildren = node.children.length > 0

    return (
      <div key={node.id}>
        <div
          className={`mb-1 flex items-center gap-1 rounded-[8px] text-left text-[0.8125rem] ${
            isActive
              ? 'bg-[linear-gradient(180deg,#edf6ff,#e4f1fd)] text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(117,170,220,0.22)]'
              : 'text-[#546273] hover:bg-[rgba(243,248,252,0.9)]'
          }`}
          style={{ paddingLeft: `${8 + node.depth * 18}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] transition hover:bg-white/70 hover:text-[var(--primary)]"
              onClick={(event) => {
                event.stopPropagation()
                setExpandedIds((current) => toggleExpandedCategoryId(current, node.id))
              }}
            >
              <ChevronDown className={`h-4 w-4 transition ${isExpanded ? '' : '-rotate-90'}`} />
            </button>
          ) : (
            <span className="w-8 shrink-0" />
          )}
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] px-2 py-[10px]"
            onClick={() => onSelect(node.id)}
          >
            <span className="shrink-0 text-[var(--text-muted)] opacity-80">{getCategoryIcon(node.label)}</span>
            <span className="truncate">{node.label}</span>
            <span className="ml-auto shrink-0 text-[0.6875rem] opacity-70">{node.count.toLocaleString()}</span>
          </button>
        </div>
        {hasChildren && isExpanded ? node.children.map((child) => renderNode(child)) : null}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-[rgba(212,225,235,0.96)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,250,253,0.92))] shadow-[0_18px_40px_rgba(36,77,121,0.08)]">
      <button
        type="button"
        className="flex h-12 w-full items-center gap-2 border-b border-[rgba(226,235,241,0.9)] bg-[linear-gradient(180deg,#fafdff,#f3f8fc)] px-4 text-left text-[0.875rem] font-semibold text-[var(--primary)]"
        onClick={() => setCollapsed((value) => !value)}
      >
        {icon}
        {title}
        <span className="ml-auto flex items-center gap-1 text-[0.75rem] font-normal text-[var(--text-muted)]">
          {collapsed ? '展开' : '收起'}
          <ChevronDown className={`h-4 w-4 transition ${collapsed ? '-rotate-90' : ''}`} />
        </span>
      </button>
      {!collapsed && (
        <div className="max-h-[420px] overflow-y-auto px-2 py-2.5">
          <button
            type="button"
            className={`mb-1 flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-[0.8125rem] ${
              !activeNodeId
                ? 'bg-[linear-gradient(180deg,#edf6ff,#e4f1fd)] text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(117,170,220,0.22)]'
                : 'bg-[#fbfdff] text-[#3d4a5d]'
            }`}
            onClick={() => onSelect('')}
          >
            <span>全部</span>
            <span>{tree.reduce((sum, node) => sum + node.count, 0).toLocaleString()}</span>
          </button>
          {tree.map((node) => renderNode(node))}
        </div>
      )}
    </div>
  )
}

function categoryColor(category: string) {
  if (category.includes('水')) return 'bg-blue-50 text-blue-600 border-blue-100'
  if (category.includes('气') || category.includes('大气')) return 'bg-sky-50 text-sky-600 border-sky-100'
  if (category.includes('土')) return 'bg-emerald-50 text-emerald-600 border-emerald-100'
  if (category.includes('生态')) return 'bg-green-50 text-green-600 border-green-100'
  if (category.includes('执法')) return 'bg-orange-50 text-orange-600 border-orange-100'
  return 'bg-slate-50 text-slate-600 border-slate-100'
}

export function DemandCatalogPage() {
  const location = useLocation()
  const { data, isLoading, error } = usePortalDemandCatalogData(true)
  const { demandItems, categoryTree, sourceOptions, cycleOptions, sceneOptions } = data
  const [searchParams, setSearchParams] = useSearchParams()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)

  const activeCategoryNodeId = searchParams.get('categoryNode') ?? ''
  const activeSource = searchParams.get('source') ?? '全部'
  const activeCycle = searchParams.get('cycle') ?? '全部'
  const activeScene = searchParams.get('scene') ?? '全部'
  const searchKeyword = searchParams.get('keyword') ?? ''
  const currentPage = Number(searchParams.get('page') ?? '1')
  const [localKeyword, setLocalKeyword] = useState(searchKeyword)
  const visibleCategoryTree = useMemo(
    () => pruneEmptyCategoryTreeNodes(categoryTree, { keepNodeIds: activeCategoryNodeId ? [activeCategoryNodeId] : [] }),
    [activeCategoryNodeId, categoryTree],
  )

  const pageSize = 15

  useEffect(() => {
    setLocalKeyword(searchKeyword)
  }, [searchKeyword])

  const updateParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === '全部') {
        next.delete(key)
      } else {
        next.set(key, value)
      }
    })
    
    // 如果修改了筛选条件（且不是单纯翻页），重置页码
    if (!updates.page) {
      next.set('page', '1')
    }
    
    setSearchParams(next)
  }

  const filteredItems = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    return demandItems.filter((item) => {
      const keywordMatched = !keyword || matchesFullTextSearch(item.searchText, keyword)
      const categoryMatched = !activeCategoryNodeId || item.categoryAncestorIds.includes(activeCategoryNodeId)
      const sourceMatched = activeSource === '全部' || item.refSource === activeSource
      const cycleMatched = activeCycle === '全部' || item.updateCycle === activeCycle
      const sceneMatched = activeScene === '全部' || item.sceneName === activeScene
      return keywordMatched && categoryMatched && sourceMatched && cycleMatched && sceneMatched
    })
  }, [demandItems, searchKeyword, activeCategoryNodeId, activeSource, activeCycle, activeScene])

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredItems.slice(start, start + pageSize)
  }, [filteredItems, currentPage, pageSize])

  const totalPages = Math.ceil(filteredItems.length / pageSize)

  return (
    <div className="space-y-6 pt-4">

      <div className="grid gap-6 lg:grid-cols-[280px_1fr] xl:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <SidebarTreeSection
            title="数据资源分类"
            icon={<Layers className="h-4 w-4" />}
            tree={visibleCategoryTree}
            activeNodeId={activeCategoryNodeId}
            onSelect={(id) => updateParams({ categoryNode: id })}
          />
          <SidebarSection
            title="清单来源"
            icon={<Globe className="h-4 w-4" />}
            items={sourceOptions}
            activeLabel={activeSource}
            onSelect={(label) => updateParams({ source: label })}
          />
          <SidebarSection
            title="业务场景"
            icon={<Workflow className="h-4 w-4" />}
            items={sceneOptions}
            activeLabel={activeScene}
            onSelect={(label) => updateParams({ scene: label })}
          />
          <SidebarSection
            title="更新周期"
            icon={<Clock className="h-4 w-4" />}
            items={cycleOptions}
            activeLabel={activeCycle}
            onSelect={(label) => updateParams({ cycle: label })}
          />
        </aside>

        <section className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border border-[rgba(212,225,235,0.96)] bg-white p-4 shadow-sm">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={localKeyword}
                  onChange={(e) => setLocalKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && updateParams({ keyword: localKeyword })}
                  className="h-11 w-full rounded-lg border border-[#e2e8f0] bg-[#f8fafc] pl-10 pr-4 text-sm outline-none transition focus:border-[var(--primary)] focus:bg-white"
                  placeholder="搜索场景名称或需求资源名称..."
                />
              </div>
              <button
                onClick={() => updateParams({ keyword: localKeyword })}
                className="inline-flex h-11 items-center rounded-lg bg-[var(--primary)] px-6 text-sm font-medium text-white shadow-md transition hover:opacity-90 active:scale-95"
              >
                搜索
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center text-sm text-[var(--text-muted)]">正在加载需求清单数据...</div>
          ) : error ? (
            <div className="py-20 text-center text-sm text-red-500">{error}</div>
          ) : (
            <>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {paginatedItems.map((item) => (
                  <Link
                    key={item.id}
                    to={withEmbed(`/demand-catalog/${item.id}`)}
                    className="group flex flex-col rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-sm transition hover:border-[var(--primary-soft)] hover:shadow-md"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          'flex items-center gap-1 rounded-md border px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-wider',
                          categoryColor(item.category),
                        )}
                      >
                        <span className="shrink-0 scale-75">{getCategoryIcon(item.category)}</span>
                        {item.category}
                      </span>
                      <div className="flex items-center gap-1.5 text-[0.6875rem] text-[var(--text-muted)]">
                        <Clock className="h-3 w-3" />
                        {item.updateCycle}
                      </div>
                    </div>

                    <h3 className="line-clamp-2 min-h-[3.2rem] text-[1.125rem] font-bold leading-snug text-[#284156] group-hover:text-[var(--primary)]">
                      {item.name}
                    </h3>

                    <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                      <Workflow className="h-3.5 w-3.5 text-indigo-500" />
                      <span className="font-medium">场景：</span>
                      <span className="truncate">{item.sceneName}</span>
                    </div>

                    <p className="mt-4 line-clamp-3 flex-1 text-xs leading-relaxed text-[var(--text-muted)]">
                      {item.description}
                    </p>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-50 pt-4">
                      <div className="flex items-center gap-1.5 text-[0.6875rem] text-slate-500">
                        <Globe className="h-3 w-3" />
                        {item.refSource}
                      </div>
                      <div className="flex items-center gap-1 text-[0.6875rem] font-medium text-[var(--primary)]">
                        <Database className="h-3 w-3" />
                        {item.mappedResources.length > 0 ? `${item.mappedResources.length}个关联资源` : '参考资源'}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => updateParams({ page: String(currentPage - 1) })}
                    className="flex h-9 items-center rounded-lg border border-[#e2e8f0] bg-white px-4 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    上一页
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const p = i + 1
                    const isNear = Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages
                    if (!isNear) {
                      if (p === 2 || p === totalPages - 1) return <span key={p}>...</span>
                      return null
                    }
                    return (
                      <button
                        key={p}
                        onClick={() => updateParams({ page: String(p) })}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium transition ${
                          currentPage === p
                            ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                            : 'border-[#e2e8f0] bg-white hover:bg-slate-50'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  })}
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => updateParams({ page: String(currentPage + 1) })}
                    className="flex h-9 items-center rounded-lg border border-[#e2e8f0] bg-white px-4 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              )}

              {filteredItems.length === 0 && (
                <div className="py-20 text-center text-sm text-[var(--text-muted)]">未找到符合条件的需求清单</div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
