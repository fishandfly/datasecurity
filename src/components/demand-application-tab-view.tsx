import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ImageOff, Layers, Search } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  toggleExpandedCategoryId,
  type CatalogCategoryTreeNode,
} from '../lib/catalog-category-tree'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import type { AppCatalogNode } from '../lib/nocobase-app-data'
import type { SelectOption } from '../lib/nocobase-portal-data'
import { cn } from '../lib/utils'
import { Button, TopicPill } from './ui'

type DemandApplicationTabViewProps = {
  tree: CatalogCategoryTreeNode[]
  items: AppCatalogNode[]
  activeNodeId: string
  activeNodePathLabel: string
  keyword: string
  domainId: string
  domainOptions: SelectOption[]
  isLoading: boolean
  error: string | null
  onSelectNode: (id: string) => void
  onSelectDomain: (domainId: string) => void
  onSubmitKeyword: (keyword: string) => void
  onResetFilters: () => void
}

const sidebarItemClass = 'text-[0.875rem] leading-[1.25rem]'

function buildCardDescription(item: AppCatalogNode) {
  if (item.description) {
    return item.description
  }

  return ''
}

function resolveCardTags(item: AppCatalogNode) {
  if (item.tags.length > 0) {
    return item.tags
  }

  if (item.depth <= 0) {
    return ['一级分类']
  }

  if (item.hasChildren) {
    return ['场景分组']
  }

  return ['应用节点']
}

function createApplicationExpandedIds(tree: CatalogCategoryTreeNode[], activeNodeId = '') {
  const expanded = new Set<string>()

  const visit = (node: CatalogCategoryTreeNode): boolean => {
    let containsActive = node.id === activeNodeId

    node.children.forEach((child) => {
      if (visit(child)) {
        containsActive = true
      }
    })

    if (node.children.length > 0) {
      expanded.add(node.id)
    }

    if (node.children.length > 0 && containsActive && node.id !== activeNodeId) {
      expanded.add(node.id)
    }

    return containsActive
  }

  tree.forEach((node) => {
    visit(node)
  })

  return Array.from(expanded)
}

function createApplicationVisibleTree(tree: CatalogCategoryTreeNode[]): CatalogCategoryTreeNode[] {
  return tree.flatMap((node) => {
    if (node.children.length === 0 && node.depth > 0) {
      return []
    }

    return [{
      ...node,
      children: createApplicationVisibleTree(node.children),
    }]
  })
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
  const visibleTree = useMemo(() => createApplicationVisibleTree(tree), [tree])
  const [expandedIds, setExpandedIds] = useState<string[]>(() => createApplicationExpandedIds(visibleTree, activeNodeId))

  useEffect(() => {
    const required = createApplicationExpandedIds(visibleTree, activeNodeId)
    setExpandedIds((current) => {
      if (!activeNodeId) {
        return required
      }

      return Array.from(new Set([...required, ...current]))
    })
  }, [visibleTree, activeNodeId])

  const renderNode = (node: CatalogCategoryTreeNode) => {
    const isActive = activeNodeId === node.id
    const isExpanded = expandedIds.includes(node.id)
    const hasChildren = node.children.length > 0

    return (
      <div key={node.id}>
        <div
          className={cn(
            'mb-1 flex items-center gap-1 rounded-[10px] text-left',
            isActive
              ? 'bg-[linear-gradient(180deg,var(--status-info-bg),color-mix(in_srgb,var(--status-info-bg)_70%,var(--surface-raised)))] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tint)]',
          )}
          style={{ paddingLeft: `${8 + node.depth * 18}px` }}
          title={node.pathLabel}
        >
          {hasChildren ? (
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]"
              onClick={(event) => {
                event.stopPropagation()
                setExpandedIds((current) => toggleExpandedCategoryId(current, node.id))
              }}
            >
              <ChevronDown className={cn('h-4 w-4 transition', isExpanded ? '' : '-rotate-90')} />
            </button>
          ) : (
            <span className="w-8 shrink-0" />
          )}
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-between rounded-[8px] px-2 py-[10px]"
            onClick={() => onSelect(node.id)}
          >
            <span className="flex min-w-0 items-center gap-2">
              {node.depth > 0 ? <span className="h-px w-3 shrink-0 bg-[rgba(148,166,184,0.55)]" /> : null}
              <span className="truncate">{node.label}</span>
            </span>
            <span className="shrink-0 text-[0.75rem]">{node.count.toLocaleString()}</span>
          </button>
        </div>
        {hasChildren && isExpanded ? node.children.map((child) => renderNode(child)) : null}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
      <button
        type="button"
        className="flex h-12 w-full items-center gap-2 border-b border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 text-left text-[0.875rem] font-semibold text-white shadow-[0_12px_20px_rgba(var(--theme-strong-rgb),0.12)]"
        onClick={() => setCollapsed((value) => !value)}
      >
        {icon}
        {title}
        <span className="ml-auto flex items-center gap-1 text-[0.75rem] font-normal text-white/85">
          {collapsed ? '展开' : '收起'}
          <ChevronDown className={cn('h-4 w-4 transition', collapsed ? '-rotate-90' : '')} />
        </span>
      </button>
      {!collapsed ? (
        <div className="max-h-[640px] overflow-y-auto px-2 py-2.5">
          <button
            type="button"
            className={cn(
              `mb-1 flex w-full items-center justify-between rounded-[10px] px-3 py-[10px] ${sidebarItemClass}`,
              !activeNodeId
                ? 'bg-[linear-gradient(180deg,var(--status-info-bg),color-mix(in_srgb,var(--status-info-bg)_70%,var(--surface-raised)))] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
                : 'bg-[var(--surface-muted)] text-[var(--text-main)]',
            )}
            onClick={() => onSelect('')}
          >
            <span>全部一级分类</span>
            <span>{tree.length.toLocaleString()}</span>
          </button>
          {visibleTree.map((node) => renderNode(node))}
        </div>
      ) : null}
    </div>
  )
}

export function DemandApplicationTabView({
  tree,
  items,
  activeNodeId,
  activeNodePathLabel,
  keyword,
  domainId,
  domainOptions,
  isLoading,
  error,
  onSelectNode,
  onSelectDomain,
  onSubmitKeyword,
  onResetFilters,
}: DemandApplicationTabViewProps) {
  const [localKeyword, setLocalKeyword] = useState(keyword)
  const location = useLocation()
  const navigate = useNavigate()
  const isEmbedMode = readEmbedMode(location.search)

  useEffect(() => {
    setLocalKeyword(keyword)
  }, [keyword])

  const buildDetailPath = (id: string) => appendEmbedToPath(`/demand/applications/${id}`, isEmbedMode)

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <SidebarTreeSection
            title="场景应用分类树"
            icon={<Layers className="h-4 w-4" />}
            tree={tree}
            activeNodeId={activeNodeId}
            onSelect={onSelectNode}
          />
        </aside>

        <section className="space-y-4">
          <div className="overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-3 xl:flex-row">
              <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    value={localKeyword}
                    onChange={(event) => setLocalKeyword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        onSubmitKeyword(localKeyword)
                      }
                    }}
                    className="h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] pl-10 pr-4 text-[0.8125rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
                    placeholder="搜索场景应用名称、标签、描述"
                  />
                </div>
                <div className="relative">
                  <select
                    value={domainId}
                    onChange={(event) => onSelectDomain(event.target.value)}
                    className="h-11 w-full appearance-none rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 pr-10 text-[0.8125rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
                    aria-label="按领域筛选场景应用"
                  >
                    <option value="">全部领域</option>
                    {domainOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="rounded-full px-5" onClick={() => onSubmitKeyword(localKeyword)}>
                  搜索
                </Button>
                <Button variant="secondary" className="rounded-full px-5" onClick={onResetFilters}>
                  重置
                </Button>
              </div>
            </div>
          </div>

          {activeNodeId ? (
            <div className="rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] px-4 py-3 text-[0.8125rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
              <span className="font-medium text-[var(--text-main)]">当前路径：</span>
              {activeNodePathLabel}
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)] shadow-[var(--shadow-soft)]">
              正在加载场景应用数据...
            </div>
          ) : error ? (
            <div className="rounded-[18px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-6 text-[0.8125rem] leading-6 text-[var(--status-danger-text)]">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)] shadow-[var(--shadow-soft)]">
              当前筛选条件下暂无场景应用，请切换分类树节点或清空关键词后重试。
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {items.map((item) => (
                <article
                  key={item.id}
                  onClick={() => {
                    if (item.hasChildren) {
                      onSelectNode(item.id)
                      return
                    }

                    navigate(buildDetailPath(item.id))
                  }}
                  className={cn(
                    'group relative overflow-hidden rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)] transition',
                    'cursor-pointer hover:-translate-y-[2px] hover:border-[rgba(var(--theme-soft-rgb),0.26)] hover:shadow-[var(--shadow-medium)]',
                  )}
                >
                  <h3 className="text-[1.0625rem] font-semibold leading-[1.45] text-[var(--text-main)]">
                    {item.name}
                  </h3>
                  <div className="mt-4 overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
                    <div className="relative h-[132px] overflow-hidden bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-tint))] sm:h-[148px]">
                      {item.screenshotUrl ? (
                        <img
                          src={item.screenshotUrl}
                          alt={item.name}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(var(--theme-soft-rgb),0.24),transparent_58%),linear-gradient(180deg,var(--surface-raised-strong),var(--surface-tint))] text-[var(--primary)]">
                          <ImageOff className="h-14 w-14 opacity-80" />
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mt-4 h-14 line-clamp-2 overflow-hidden text-[0.875rem] leading-7 text-[var(--text-secondary)]">
                    {buildCardDescription(item)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {resolveCardTags(item).map((tag) => (
                      <TopicPill key={`${item.id}-${tag}`}>{tag}</TopicPill>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--surface-outline)] pt-4">
                    <div className="text-[0.75rem] text-[var(--text-secondary)]">
                      {item.hasChildren ? `下级应用 ${item.childCount} 个` : `所属路径：${item.pathLabel}`}
                    </div>
                    <Link
                      to={buildDetailPath(item.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center rounded-full border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] px-3 py-1.5 text-[0.75rem] font-semibold text-[var(--primary)] transition hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white"
                    >
                      查看详情
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
