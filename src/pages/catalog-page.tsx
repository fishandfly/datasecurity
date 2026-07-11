import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, Building2, ChevronDown, Database, FolderOpen, MapPinned, Plus, Search, Settings2, Star, Trash2, Workflow } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CatalogOverviewPanel } from '../components/catalog-overview-panel'
import { CatalogServiceOverviewPanel } from '../components/catalog-service-overview-panel'
import { CatalogSpatialOverviewPanel } from '../components/catalog-spatial-overview-panel'
import { CatalogSourceOverviewPanel } from '../components/catalog-source-overview-panel'
import { ResourceEditDialog } from '../components/resource-edit-dialog'
import { canManageCatalogResources } from '../lib/admin-role'
import {
  filterCatalogItemsByResourceType,
} from '../lib/catalog-resource-type'
import {
  createInitialExpandedCategoryIds,
  pruneEmptyCategoryTreeNodes,
  toggleExpandedCategoryId,
  type CatalogCategoryTreeNode,
} from '../lib/catalog-category-tree'
import { getCategoryIcon } from '../lib/category-helper'
import {
  addCatalogClaimCartItem,
  buildCatalogClaimCartItem,
  buildDemandPagePrefillRowsFromClaimCart,
  buildKnowledgeDocumentClaimCartItem,
  clearCatalogClaimCart,
  readCatalogClaimCart,
  removeCatalogClaimCartItem,
  type CatalogClaimCartItem,
} from '../lib/catalog-claim-cart'
import {
  getSpatialAuthModeLabel,
  getSpatialCacheModeLabel,
  getSpatialLayerKindLabel,
  getSpatialReferenceLabel,
} from '../lib/catalog-spatial-resource'
import { buildDetailMetricSnapshot } from '../lib/detail-metric-snapshot'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { matchesFullTextSearch } from '../lib/full-text-search'
import { buildFavoriteResourceIdSet, buildResourceFavoriteIdentity, fetchFavoriteListMine, toggleFavorite } from '../lib/nocobase-favorites'
import { useLatestResourceStatMap } from '../lib/nocobase-stat-data'
import { getDefaultCatalogTabs, usePortalNavigations } from '../lib/nocobase-portal-navigation'
import { ALL_PRODUCT_MODULE_IDS } from '../lib/product-modules'
import { usePortalContext } from '../lib/portal-context'
import { KnowledgeDocumentsPage } from './knowledge-documents-page'

type FacetOption = {
  id: string
  label: string
  count: number
}

type FacetOptionInput = FacetOption | [string, number]

const sidebarFacetItemTextClass = 'text-[0.875rem] leading-[1.25rem]'
const FAVORITE_LIST_DELAY_MS = 320

type CatalogViewId = 'data-resource' | 'data-source' | 'document' | 'spatial-resource' | 'service'

const DEFAULT_CATALOG_VIEW_TABS: Array<{
  id: CatalogViewId
  label: string
  title: string
  categoryTitle: string
  searchPlaceholder: string
  resultLabel: string
  emptyStateLabel: string
  href: string
  icon: typeof Database
  visibleInTabs: boolean
}> = [
  {
    id: 'data-resource',
    label: '数据资源',
    title: '数据资源目录',
    categoryTitle: '数据资源分类',
    searchPlaceholder: '请输入数据名称/名称简拼/数据项搜索',
    resultLabel: '条目录资源',
    emptyStateLabel: '未检索到符合条件的目录资源',
    href: '/catalog',
    icon: Database,
    visibleInTabs: true,
  },
  {
    id: 'document',
    label: '文档资源',
    title: '文档资源',
    categoryTitle: '文档分类',
    searchPlaceholder: '全文检索知识文档标题、标准编号、正文内容',
    resultLabel: '份知识文档',
    emptyStateLabel: '当前筛选下暂无知识文档',
    href: '/documents',
    icon: FolderOpen,
    visibleInTabs: true,
  },
  {
    id: 'spatial-resource',
    label: '空间资源',
    title: '空间资源',
    categoryTitle: '空间资源分类',
    searchPlaceholder: '请输入空间资源名称、服务地址、坐标系或图层类型检索',
    resultLabel: '条空间资源',
    emptyStateLabel: '当前筛选下暂无空间资源',
    href: '/catalog?view=spatial-resource',
    icon: MapPinned,
    visibleInTabs: true,
  },
  {
    id: 'data-source',
    label: '数据源',
    title: '数据源',
    categoryTitle: '数据源分类',
    searchPlaceholder: '请输入数据源名称/名称简拼/数据项搜索',
    resultLabel: '条数据源',
    emptyStateLabel: '未检索到符合条件的数据源',
    href: '/data-source-catalog',
    icon: Building2,
    visibleInTabs: true,
  },
  {
    id: 'service',
    label: '数据API服务',
    title: '数据API服务',
    categoryTitle: '数据API服务分类',
    searchPlaceholder: '请输入API服务名称/名称简拼/服务项搜索',
    resultLabel: '条数据API服务',
    emptyStateLabel: '未检索到符合条件的数据API服务',
    href: '/service-catalog',
    icon: Search,
    visibleInTabs: false,
  },
]

function resolveCatalogView(legacyView: string): CatalogViewId {
  const normalized = legacyView.trim()

  if (normalized === 'data-source' || normalized === 'document' || normalized === 'spatial-resource' || normalized === 'service') {
    return normalized
  }

  return 'data-resource'
}

function normalizeFacetOption(option: FacetOptionInput): FacetOption {
  if (Array.isArray(option)) {
    const [label, count] = option
    return {
      id: label === '全部' ? '' : label,
      label,
      count: Number.isFinite(count) ? count : 0,
    }
  }

  return option
}

function resolveSecondaryCategoryLabel(pathLabel: string, fallbackLabel: string) {
  const segments = pathLabel
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length >= 2) {
    return segments[1]
  }

  if (segments.length === 1 && segments[0] !== '未标注') {
    return segments[0]
  }

  return fallbackLabel
}

function buildSpatialFacetId(value: string) {
  const normalized = value.trim()
  return normalized || '__missing__'
}

function SidebarSection({
  title,
  icon,
  items,
  activeId,
  onSelect,
}: {
  title: string
  icon: ReactNode
  items: FacetOptionInput[]
  activeId: string
  onSelect: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
      <button
        type="button"
        className="flex h-12 w-full items-center gap-2 border-b border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 text-left text-[0.875rem] font-semibold text-white shadow-[0_12px_20px_rgba(var(--theme-strong-rgb),0.12)]"
        onClick={() => setCollapsed((value) => !value)}
      >
        {icon}
        {title}
        <span className="ml-auto flex items-center gap-1 text-[0.75rem] font-normal text-white/85">
          {collapsed ? '展开' : '收起'}
          <ChevronDown className={`h-4 w-4 transition ${collapsed ? '-rotate-90' : ''}`} />
        </span>
      </button>
      {!collapsed && (
        <div className="max-h-[360px] overflow-y-auto px-2 py-2.5">
          {items.map((item, index) => {
            const { id, label, count } = normalizeFacetOption(item)

            return (
              <button
                type="button"
                key={id || '__all__'}
                className={`mb-1 flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] ${sidebarFacetItemTextClass} last:mb-2 ${
                  activeId === id
                    ? 'bg-[linear-gradient(180deg,var(--status-info-bg),color-mix(in_srgb,var(--status-info-bg)_70%,var(--surface-raised)))] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
                    : index === 0
                      ? 'bg-[var(--surface-muted)] text-[var(--text-main)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tint)]'
                }`}
                onClick={() => onSelect(id)}
              >
                <span>{label}</span>
                <span>{count.toLocaleString()}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SidebarTreeSection({
  title,
  icon,
  tree,
  totalCount,
  activeNodeId,
  renderNodeIcon,
  onSelect,
}: {
  title: string
  icon: ReactNode
  tree: CatalogCategoryTreeNode[]
  totalCount?: number
  activeNodeId: string
  renderNodeIcon?: (label: string) => ReactNode
  onSelect: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedIds, setExpandedIds] = useState<string[]>(() => createInitialExpandedCategoryIds(tree, activeNodeId))

  useEffect(() => {
    const required = createInitialExpandedCategoryIds(tree, activeNodeId)
    setExpandedIds((current) => {
      if (!activeNodeId) {
        return required
      }

      return Array.from(new Set([...required, ...current]))
    })
  }, [tree, activeNodeId])

  const renderNode = (node: CatalogCategoryTreeNode) => {
    const isActive = activeNodeId === node.id
    const isExpanded = expandedIds.includes(node.id)
    const hasChildren = node.children.length > 0

    return (
      <div key={node.id}>
        <div
          className={`mb-1 flex items-center gap-1 rounded-[8px] text-left ${sidebarFacetItemTextClass} ${
            isActive
              ? 'bg-[linear-gradient(180deg,var(--status-info-bg),color-mix(in_srgb,var(--status-info-bg)_70%,var(--surface-raised)))] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tint)]'
          }`}
          style={{ paddingLeft: `${8 + node.depth * 18}px` }}
          title={node.pathLabel}
        >
          {hasChildren ? (
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]"
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
            className="flex min-w-0 flex-1 items-center justify-between rounded-[8px] px-2 py-[10px]"
            onClick={() => onSelect(node.id)}
          >
            <span className="flex min-w-0 items-center gap-2">
              {node.depth > 0 ? <span className="h-px w-3 shrink-0 bg-[rgba(148,166,184,0.55)]" /> : null}
              {renderNodeIcon ? <span className="shrink-0 text-[var(--text-muted)] opacity-80">{renderNodeIcon(node.label)}</span> : null}
              <span className="truncate">{node.label}</span>
            </span>
            <span className="shrink-0">{node.count.toLocaleString()}</span>
          </button>
        </div>
        {hasChildren && isExpanded ? node.children.map((child) => renderNode(child)) : null}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
      <button
        type="button"
        className="flex h-12 w-full items-center gap-2 border-b border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 text-left text-[0.875rem] font-semibold text-white shadow-[0_12px_20px_rgba(var(--theme-strong-rgb),0.12)]"
        onClick={() => setCollapsed((value) => !value)}
      >
        {icon}
        {title}
        <span className="ml-auto flex items-center gap-1 text-[0.75rem] font-normal text-white/85">
          {collapsed ? '展开' : '收起'}
          <ChevronDown className={`h-4 w-4 transition ${collapsed ? '-rotate-90' : ''}`} />
        </span>
      </button>
      {!collapsed && (
        <div className="max-h-[630px] overflow-y-auto px-2 py-2.5">
          <button
            type="button"
            className={`mb-1 flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] ${sidebarFacetItemTextClass} ${
              !activeNodeId
                ? 'bg-[linear-gradient(180deg,var(--status-info-bg),color-mix(in_srgb,var(--status-info-bg)_70%,var(--surface-raised)))] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
                : 'bg-[var(--surface-muted)] text-[var(--text-main)]'
            }`}
            onClick={() => onSelect('')}
          >
            <span>全部</span>
            <span>{(totalCount ?? tree.reduce((sum, node) => sum + node.count, 0)).toLocaleString()}</span>
          </button>
          {tree.map((node) => renderNode(node))}
        </div>
      )}
    </div>
  )
}

function buildDictionaryFilterOptions<T>(
  items: T[],
  getId: (item: T) => string,
  getLabel: (item: T) => string,
) {
  const counts = new Map<string, { label: string; count: number }>()
  items.forEach((item) => {
    const id = normalizeDictionaryFacetId(getId(item))
    const label = getLabel(item).trim() || '未标注'
    const current = counts.get(id)
    if (current) {
      current.count += 1
      return
    }
    counts.set(id, { label, count: 1 })
  })

  const sorted = Array.from(counts.entries())
    .map(([id, info]) => ({ id, label: info.label, count: info.count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      return left.label.localeCompare(right.label, 'zh-CN')
    })

  return [{ id: '', label: '全部', count: items.length }, ...sorted] satisfies FacetOption[]
}

function buildDictionaryLookup<T>(
  items: T[],
  getId: (item: T) => string,
  getLabel: (item: T) => string,
) {
  const idSet = new Set<string>()
  const idToLabel = new Map<string, string>()
  const labelToId = new Map<string, string>()

  items.forEach((item) => {
    const id = normalizeDictionaryFacetId(getId(item))
    const label = getLabel(item).trim() || '未标注'
    idSet.add(id)
    if (!idToLabel.has(id)) {
      idToLabel.set(id, label)
    }
    if (!labelToId.has(label)) {
      labelToId.set(label, id)
    }
  })

  return { idSet, idToLabel, labelToId }
}

function resolveDictionaryQueryId(rawValue: string, idSet: Set<string>, labelToId: Map<string, string>) {
  const normalized = rawValue.trim()
  if (!normalized || normalized === '全部') return ''
  if (idSet.has(normalized)) return normalized
  return labelToId.get(normalized) ?? ''
}

function normalizeDictionaryFacetId(value: string) {
  const normalized = value.trim()
  return normalized || '__missing__'
}

function mapTreeCounts(tree: CatalogCategoryTreeNode[], counts: Map<string, number>): CatalogCategoryTreeNode[] {
  return tree.map((node) => ({
    ...node,
    count: counts.get(node.id) ?? 0,
    children: mapTreeCounts(node.children, counts),
  }))
}

export function CatalogPage({ forceView = '' }: { forceView?: '' | CatalogViewId } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data, authRequired, isAuthenticated, isBootstrapping, isLoading, error, refresh, session } = usePortalContext()
  const { navigations, catalogTabs } = usePortalNavigations(!isBootstrapping, ALL_PRODUCT_MODULE_IDS)
  const {
    catalogItems: rawCatalogItems,
    categoryTree: baseCategoryTree,
    businessAttributeTree: baseBusinessAttributeTree,
    sourceTree: baseSourceTree,
    regionTree,
    editOptions,
  } = data
  const [searchParams, setSearchParams] = useSearchParams()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isClaimCartCollapsed, setIsClaimCartCollapsed] = useState(true)
  const [claimCartItems, setClaimCartItems] = useState<CatalogClaimCartItem[]>(() => readCatalogClaimCart())
  const [favoriteResourceIds, setFavoriteResourceIds] = useState<Set<string>>(new Set())
  const [favoriteError, setFavoriteError] = useState<string | null>(null)
  const [favoritePendingResourceId, setFavoritePendingResourceId] = useState('')
  const canManageResources = canManageCatalogResources(session?.user.roles)
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const detailReturnTo = `${location.pathname}${location.search}`
  const statEnabled = !authRequired || isAuthenticated
  const { data: latestResourceStatMap } = useLatestResourceStatMap(statEnabled)
  const [searchKeyword, setSearchKeyword] = useState(searchParams.get('keyword') ?? '')
  const committedKeyword = searchParams.get('keyword') ?? ''
  const legacyView = searchParams.get('view') ?? ''
  const activeCatalogView: CatalogViewId = forceView || resolveCatalogView(legacyView)
  const shouldPersistLegacyCatalogView = !forceView && activeCatalogView !== 'data-resource'
  const hasCatalogNavigation = navigations.some((item) => item.target === '/catalog')
  const resolvedCatalogTabs = catalogTabs.length > 0 || hasCatalogNavigation ? catalogTabs : getDefaultCatalogTabs()
  const activeViewMeta = resolvedCatalogTabs.find((tab) => tab.id === activeCatalogView) ?? resolvedCatalogTabs[0] ?? DEFAULT_CATALOG_VIEW_TABS[0]
  const tabbedCatalogViews = resolvedCatalogTabs.filter((tab) => tab.visibleInTabs)
  const activeCategoryNodeId = searchParams.get('categoryNode') ?? ''
  const activeBusinessAttributeNodeId = searchParams.get('businessAttributeNode') ?? ''
  const activeDepartmentNodeId = searchParams.get('departmentNode') ?? ''
  const rawCycle = searchParams.get('cycle') ?? ''
  const activeSpatialLayerKind = searchParams.get('spatialLayerKind') ?? ''
  const activeSpatialAuthMode = searchParams.get('spatialAuthMode') ?? ''
  const activeSpatialReference = searchParams.get('spatialReference') ?? ''
  const activeSpatialCacheMode = searchParams.get('spatialCacheMode') ?? ''
  const currentPage = Number(searchParams.get('page') ?? '1')
  const pageSize = 15
  const resourceCatalogView = activeCatalogView === 'document' ? 'data-resource' : activeCatalogView
  const supportsClaimCart = activeCatalogView !== 'document'
  const isSpatialCatalogView = activeCatalogView === 'spatial-resource'
  const displayableCatalogItems = useMemo(
    () => filterCatalogItemsByResourceType(rawCatalogItems, resourceCatalogView),
    [rawCatalogItems, resourceCatalogView],
  )
  const claimCartResourceIdSet = useMemo(
    () => new Set(claimCartItems.map((item) => item.resourceId)),
    [claimCartItems],
  )

  useEffect(() => {
    setSearchKeyword(committedKeyword)
  }, [committedKeyword])

  useEffect(() => {
    let cancelled = false

    if (!isAuthenticated) {
      setFavoriteResourceIds(new Set())
      setFavoriteError(null)
      setFavoritePendingResourceId('')
      return () => {
        cancelled = true
      }
    }

    if (isLoading || isBootstrapping) {
      return () => {
        cancelled = true
      }
    }

    const timerId = window.setTimeout(() => {
      fetchFavoriteListMine()
        .then((items) => {
          if (cancelled) return
          setFavoriteResourceIds(buildFavoriteResourceIdSet(items))
          setFavoriteError(null)
        })
        .catch((fetchError) => {
          if (cancelled) return
          setFavoriteResourceIds(new Set())
          setFavoriteError(fetchError instanceof Error ? fetchError.message : '我的收藏加载失败')
        })
    }, FAVORITE_LIST_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [isBootstrapping, isAuthenticated, isLoading])

  const keyword = committedKeyword.trim().toLowerCase()

  const handleToggleFavorite = async (resourceId: string) => {
    if (!isAuthenticated) return

    setFavoritePendingResourceId(resourceId)
    setFavoriteError(null)

    try {
      const result = await toggleFavorite(buildResourceFavoriteIdentity(resourceId, withEmbed(`/catalog/${resourceId}`)))
      setFavoriteResourceIds((current) => {
        const next = new Set(current)
        if (result.isFavorited) {
          next.add(resourceId)
        } else {
          next.delete(resourceId)
        }
        return next
      })
    } catch (toggleError) {
      setFavoriteError(toggleError instanceof Error ? toggleError.message : '收藏操作失败')
    } finally {
      setFavoritePendingResourceId('')
    }
  }

  const handleAddClaimCart = (item: (typeof displayableCatalogItems)[number]) => {
    setClaimCartItems(addCatalogClaimCartItem(buildCatalogClaimCartItem(item)))
  }

  const handleRemoveClaimCart = (resourceId: string) => {
    setClaimCartItems(removeCatalogClaimCartItem(resourceId))
  }

  const handleClearClaimCart = () => {
    clearCatalogClaimCart()
    setClaimCartItems([])
  }

  const handleSubmitClaimCart = () => {
    if (claimCartItems.length === 0) return

    navigate(withEmbed('/demand'), {
      state: {
        prefillRows: buildDemandPagePrefillRowsFromClaimCart(claimCartItems),
        openCreateDialog: true,
        clearClaimCartOnSuccess: true,
      },
    })
  }

  const cycleLookup = useMemo(
    () => buildDictionaryLookup(displayableCatalogItems, (item) => item.updateCycleId, (item) => item.updateCycle),
    [displayableCatalogItems],
  )

  const activeCycleId = resolveDictionaryQueryId(rawCycle, cycleLookup.idSet, cycleLookup.labelToId)
  const activeCycleLabel = activeCycleId
    ? (cycleLookup.idToLabel.get(activeCycleId) ?? '未标注')
    : '全部'

  const spatialLayerKindLookup = useMemo(
    () => buildDictionaryLookup(
      displayableCatalogItems.filter((item) => item.mapPreview),
      (item) => item.mapPreview?.layerKind ?? '',
      (item) => item.mapPreview ? getSpatialLayerKindLabel(item.mapPreview.layerKind) : '未标注',
    ),
    [displayableCatalogItems],
  )
  const spatialAuthModeLookup = useMemo(
    () => buildDictionaryLookup(
      displayableCatalogItems.filter((item) => item.mapPreview),
      (item) => item.mapPreview ? getSpatialAuthModeLabel(item.mapPreview.authMode) : '',
      (item) => item.mapPreview ? getSpatialAuthModeLabel(item.mapPreview.authMode) : '未标注',
    ),
    [displayableCatalogItems],
  )
  const spatialReferenceLookup = useMemo(
    () => buildDictionaryLookup(
      displayableCatalogItems.filter((item) => item.mapPreview),
      (item) => item.mapPreview ? getSpatialReferenceLabel(item.mapPreview.spatialReference) : '',
      (item) => item.mapPreview ? getSpatialReferenceLabel(item.mapPreview.spatialReference) : '未标注',
    ),
    [displayableCatalogItems],
  )
  const spatialCacheModeLookup = useMemo(
    () => buildDictionaryLookup(
      displayableCatalogItems.filter((item) => item.mapPreview),
      (item) => item.mapPreview ? getSpatialCacheModeLabel(item.mapPreview.isCached) : '',
      (item) => item.mapPreview ? getSpatialCacheModeLabel(item.mapPreview.isCached) : '未标注',
    ),
    [displayableCatalogItems],
  )

  const activeSpatialLayerKindId = resolveDictionaryQueryId(activeSpatialLayerKind, spatialLayerKindLookup.idSet, spatialLayerKindLookup.labelToId)
  const activeSpatialAuthModeId = resolveDictionaryQueryId(activeSpatialAuthMode, spatialAuthModeLookup.idSet, spatialAuthModeLookup.labelToId)
  const activeSpatialReferenceId = resolveDictionaryQueryId(activeSpatialReference, spatialReferenceLookup.idSet, spatialReferenceLookup.labelToId)
  const activeSpatialCacheModeId = resolveDictionaryQueryId(activeSpatialCacheMode, spatialCacheModeLookup.idSet, spatialCacheModeLookup.labelToId)

  const activeSpatialLayerKindLabel = activeSpatialLayerKindId
    ? (spatialLayerKindLookup.idToLabel.get(activeSpatialLayerKindId) ?? '未标注')
    : '全部'
  const activeSpatialAuthModeLabel = activeSpatialAuthModeId
    ? (spatialAuthModeLookup.idToLabel.get(activeSpatialAuthModeId) ?? '未标注')
    : '全部'
  const activeSpatialReferenceLabel = activeSpatialReferenceId
    ? (spatialReferenceLookup.idToLabel.get(activeSpatialReferenceId) ?? '未标注')
    : '全部'
  const activeSpatialCacheModeLabel = activeSpatialCacheModeId
    ? (spatialCacheModeLookup.idToLabel.get(activeSpatialCacheModeId) ?? '未标注')
    : '全部'

  useEffect(() => {
    if (displayableCatalogItems.length === 0) return

    const next = new URLSearchParams(searchParams)
    let changed = false

    const normalizeDictionaryParam = (key: 'cycle' | 'spatialLayerKind' | 'spatialAuthMode' | 'spatialReference' | 'spatialCacheMode', rawValue: string, resolvedId: string) => {
      const normalizedRaw = rawValue.trim()
      if (!normalizedRaw || normalizedRaw === '全部') {
        if (next.has(key)) {
          next.delete(key)
          changed = true
        }
        return
      }

      if (!resolvedId) {
        next.delete(key)
        changed = true
        return
      }

      if (normalizedRaw !== resolvedId) {
        next.set(key, resolvedId)
        changed = true
      }
    }

    if (next.has('resourceType')) {
      next.delete('resourceType')
      changed = true
    }

    if (next.has('sortBy')) {
      next.delete('sortBy')
      changed = true
    }

    if (forceView) {
      if (next.has('view')) {
        next.delete('view')
        changed = true
      }
    } else if (shouldPersistLegacyCatalogView) {
      if (legacyView.trim() !== activeCatalogView) {
        next.set('view', activeCatalogView)
        changed = true
      }
    } else if (next.has('view')) {
      next.delete('view')
      changed = true
    }

    const staleParamKeys = activeCatalogView === 'document'
      ? ['sidebarKeyword', 'sidebarTab', 'department', 'region', 'openType', 'format', 'serviceType', 'regionNode', 'informationCategoryNode'] as const
      : ['sidebarKeyword', 'sidebarTab', 'category', 'department', 'region', 'openType', 'format', 'serviceType', 'regionNode', 'informationCategoryNode'] as const

    const hiddenFilterParamKeys = activeCatalogView === 'spatial-resource'
      ? ['businessAttributeNode', 'cycle'] as const
      : ['spatialLayerKind', 'spatialAuthMode', 'spatialReference', 'spatialCacheMode'] as const

    for (const key of staleParamKeys) {
      if (next.has(key)) {
        next.delete(key)
        changed = true
      }
    }

    for (const key of hiddenFilterParamKeys) {
      if (next.has(key)) {
        next.delete(key)
        changed = true
      }
    }

    normalizeDictionaryParam('cycle', rawCycle, activeCycleId)
    if (activeCatalogView === 'spatial-resource') {
      normalizeDictionaryParam('spatialLayerKind', activeSpatialLayerKind, activeSpatialLayerKindId)
      normalizeDictionaryParam('spatialAuthMode', activeSpatialAuthMode, activeSpatialAuthModeId)
      normalizeDictionaryParam('spatialReference', activeSpatialReference, activeSpatialReferenceId)
      normalizeDictionaryParam('spatialCacheMode', activeSpatialCacheMode, activeSpatialCacheModeId)
    }

    if (changed) {
      setSearchParams(next, { replace: true })
    }
  }, [
    displayableCatalogItems.length,
    searchParams,
    forceView,
    activeCatalogView,
    legacyView,
    shouldPersistLegacyCatalogView,
    rawCycle,
    activeCycleId,
    activeSpatialLayerKind,
    activeSpatialLayerKindId,
    activeSpatialAuthMode,
    activeSpatialAuthModeId,
    activeSpatialReference,
    activeSpatialReferenceId,
    activeSpatialCacheMode,
    activeSpatialCacheModeId,
    setSearchParams,
  ])

  const matchesFilters = (
    item: (typeof displayableCatalogItems)[number],
    ignored?: Partial<Record<'categoryTree' | 'businessAttributeTree' | 'departmentTree' | 'cycle' | 'spatialLayerKind' | 'spatialAuthMode' | 'spatialReference' | 'spatialCacheMode', boolean>>,
  ) => {
    const categoryTreeMatched = ignored?.categoryTree || !activeCategoryNodeId || item.categoryAncestorIds.includes(activeCategoryNodeId)
    const businessAttributeTreeMatched =
      ignored?.businessAttributeTree
      || isSpatialCatalogView
      || !activeBusinessAttributeNodeId
      || item.businessAttributeAncestorIds.includes(activeBusinessAttributeNodeId)
    const departmentTreeMatched = ignored?.departmentTree || !activeDepartmentNodeId || item.departmentAncestorIds.includes(activeDepartmentNodeId)
    const cycleMatched = ignored?.cycle || isSpatialCatalogView || !activeCycleId || normalizeDictionaryFacetId(item.updateCycleId) === activeCycleId
    const spatialLayerKindMatched =
      ignored?.spatialLayerKind
      || !isSpatialCatalogView
      || !activeSpatialLayerKindId
      || buildSpatialFacetId(item.mapPreview?.layerKind ?? '') === activeSpatialLayerKindId
    const spatialAuthModeMatched =
      ignored?.spatialAuthMode
      || !isSpatialCatalogView
      || !activeSpatialAuthModeId
      || buildSpatialFacetId(item.mapPreview ? getSpatialAuthModeLabel(item.mapPreview.authMode) : '') === activeSpatialAuthModeId
    const spatialReferenceMatched =
      ignored?.spatialReference
      || !isSpatialCatalogView
      || !activeSpatialReferenceId
      || buildSpatialFacetId(item.mapPreview ? getSpatialReferenceLabel(item.mapPreview.spatialReference) : '') === activeSpatialReferenceId
    const spatialCacheModeMatched =
      ignored?.spatialCacheMode
      || !isSpatialCatalogView
      || !activeSpatialCacheModeId
      || buildSpatialFacetId(item.mapPreview ? getSpatialCacheModeLabel(item.mapPreview.isCached) : '') === activeSpatialCacheModeId
    const keywordMatched = keyword.length === 0 || matchesFullTextSearch(item.searchText, keyword)

    return categoryTreeMatched
      && businessAttributeTreeMatched
      && departmentTreeMatched
      && cycleMatched
      && spatialLayerKindMatched
      && spatialAuthModeMatched
      && spatialReferenceMatched
      && spatialCacheModeMatched
      && keywordMatched
  }

  const filteredItems = useMemo(() => {
    return displayableCatalogItems.filter((item) => matchesFilters(item))
  }, [
    displayableCatalogItems,
    activeCategoryNodeId,
    activeBusinessAttributeNodeId,
    activeDepartmentNodeId,
    activeCycleId,
    activeSpatialLayerKindId,
    activeSpatialAuthModeId,
    activeSpatialReferenceId,
    activeSpatialCacheModeId,
    isSpatialCatalogView,
    keyword,
  ])

  const categoryFacetItems = useMemo(
    () => displayableCatalogItems.filter((item) => matchesFilters(item, { categoryTree: true })),
    [displayableCatalogItems, activeBusinessAttributeNodeId, activeDepartmentNodeId, activeCycleId, activeSpatialLayerKindId, activeSpatialAuthModeId, activeSpatialReferenceId, activeSpatialCacheModeId, isSpatialCatalogView, keyword],
  )
  const businessAttributeFacetItems = useMemo(
    () => displayableCatalogItems.filter((item) => matchesFilters(item, { businessAttributeTree: true })),
    [displayableCatalogItems, activeCategoryNodeId, activeDepartmentNodeId, activeCycleId, activeSpatialLayerKindId, activeSpatialAuthModeId, activeSpatialReferenceId, activeSpatialCacheModeId, isSpatialCatalogView, keyword],
  )
  const sourceFacetItems = useMemo(
    () => displayableCatalogItems.filter((item) => matchesFilters(item, { departmentTree: true })),
    [displayableCatalogItems, activeCategoryNodeId, activeBusinessAttributeNodeId, activeCycleId, activeSpatialLayerKindId, activeSpatialAuthModeId, activeSpatialReferenceId, activeSpatialCacheModeId, isSpatialCatalogView, keyword],
  )
  const cycleFacetItems = useMemo(
    () => displayableCatalogItems.filter((item) => matchesFilters(item, { cycle: true })),
    [displayableCatalogItems, activeCategoryNodeId, activeBusinessAttributeNodeId, activeDepartmentNodeId, activeSpatialLayerKindId, activeSpatialAuthModeId, activeSpatialReferenceId, activeSpatialCacheModeId, isSpatialCatalogView, keyword],
  )
  const spatialLayerKindFacetItems = useMemo(
    () => displayableCatalogItems.filter((item) => matchesFilters(item, { spatialLayerKind: true })),
    [displayableCatalogItems, activeCategoryNodeId, activeBusinessAttributeNodeId, activeDepartmentNodeId, activeCycleId, activeSpatialAuthModeId, activeSpatialReferenceId, activeSpatialCacheModeId, isSpatialCatalogView, keyword],
  )
  const spatialAuthModeFacetItems = useMemo(
    () => displayableCatalogItems.filter((item) => matchesFilters(item, { spatialAuthMode: true })),
    [displayableCatalogItems, activeCategoryNodeId, activeBusinessAttributeNodeId, activeDepartmentNodeId, activeCycleId, activeSpatialLayerKindId, activeSpatialReferenceId, activeSpatialCacheModeId, isSpatialCatalogView, keyword],
  )
  const spatialReferenceFacetItems = useMemo(
    () => displayableCatalogItems.filter((item) => matchesFilters(item, { spatialReference: true })),
    [displayableCatalogItems, activeCategoryNodeId, activeBusinessAttributeNodeId, activeDepartmentNodeId, activeCycleId, activeSpatialLayerKindId, activeSpatialAuthModeId, activeSpatialCacheModeId, isSpatialCatalogView, keyword],
  )
  const spatialCacheModeFacetItems = useMemo(
    () => displayableCatalogItems.filter((item) => matchesFilters(item, { spatialCacheMode: true })),
    [displayableCatalogItems, activeCategoryNodeId, activeBusinessAttributeNodeId, activeDepartmentNodeId, activeCycleId, activeSpatialLayerKindId, activeSpatialAuthModeId, activeSpatialReferenceId, isSpatialCatalogView, keyword],
  )

  const cycleOptions = useMemo(
    () => buildDictionaryFilterOptions(cycleFacetItems, (item) => item.updateCycleId, (item) => item.updateCycle),
    [cycleFacetItems],
  )
  const spatialLayerKindOptions = useMemo(
    () => buildDictionaryFilterOptions(
      spatialLayerKindFacetItems.filter((item) => item.mapPreview),
      (item) => item.mapPreview?.layerKind ?? '',
      (item) => item.mapPreview ? getSpatialLayerKindLabel(item.mapPreview.layerKind) : '未标注',
    ),
    [spatialLayerKindFacetItems],
  )
  const spatialAuthModeOptions = useMemo(
    () => buildDictionaryFilterOptions(
      spatialAuthModeFacetItems.filter((item) => item.mapPreview),
      (item) => item.mapPreview ? getSpatialAuthModeLabel(item.mapPreview.authMode) : '',
      (item) => item.mapPreview ? getSpatialAuthModeLabel(item.mapPreview.authMode) : '未标注',
    ),
    [spatialAuthModeFacetItems],
  )
  const spatialReferenceOptions = useMemo(
    () => buildDictionaryFilterOptions(
      spatialReferenceFacetItems.filter((item) => item.mapPreview),
      (item) => item.mapPreview ? getSpatialReferenceLabel(item.mapPreview.spatialReference) : '',
      (item) => item.mapPreview ? getSpatialReferenceLabel(item.mapPreview.spatialReference) : '未标注',
    ),
    [spatialReferenceFacetItems],
  )
  const spatialCacheModeOptions = useMemo(
    () => buildDictionaryFilterOptions(
      spatialCacheModeFacetItems.filter((item) => item.mapPreview),
      (item) => item.mapPreview ? getSpatialCacheModeLabel(item.mapPreview.isCached) : '',
      (item) => item.mapPreview ? getSpatialCacheModeLabel(item.mapPreview.isCached) : '未标注',
    ),
    [spatialCacheModeFacetItems],
  )

  const categoryCountsById = useMemo(() => {
    const counts = new Map<string, number>()
    categoryFacetItems.forEach((item) => {
      item.categoryAncestorIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
    })
    return counts
  }, [categoryFacetItems])
  const businessAttributeCountsById = useMemo(() => {
    const counts = new Map<string, number>()
    businessAttributeFacetItems.forEach((item) => {
      item.businessAttributeAncestorIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
    })
    return counts
  }, [businessAttributeFacetItems])
  const sourceCountsById = useMemo(() => {
    const counts = new Map<string, number>()
    sourceFacetItems.forEach((item) => {
      item.departmentAncestorIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
    })
    return counts
  }, [sourceFacetItems])

  const categoryTree = useMemo(
    () => pruneEmptyCategoryTreeNodes(
      mapTreeCounts(baseCategoryTree, categoryCountsById),
      { keepNodeIds: activeCategoryNodeId ? [activeCategoryNodeId] : [] },
    ),
    [activeCategoryNodeId, baseCategoryTree, categoryCountsById],
  )
  const businessAttributeTree = useMemo(
    () => pruneEmptyCategoryTreeNodes(
      mapTreeCounts(baseBusinessAttributeTree, businessAttributeCountsById),
      { keepNodeIds: activeBusinessAttributeNodeId ? [activeBusinessAttributeNodeId] : [] },
    ),
    [activeBusinessAttributeNodeId, baseBusinessAttributeTree, businessAttributeCountsById],
  )
  const sourceTree = useMemo(
    () => pruneEmptyCategoryTreeNodes(
      mapTreeCounts(baseSourceTree, sourceCountsById),
      { keepNodeIds: activeDepartmentNodeId ? [activeDepartmentNodeId] : [] },
    ),
    [activeDepartmentNodeId, baseSourceTree, sourceCountsById],
  )

  const categoryTreeFlat = useMemo(() => {
    const entries = new Map<string, CatalogCategoryTreeNode>()
    const walk = (nodes: CatalogCategoryTreeNode[]) => {
      nodes.forEach((node) => {
        entries.set(node.id, node)
        walk(node.children)
      })
    }
    walk(categoryTree)
    return entries
  }, [categoryTree])
  const businessAttributeTreeFlat = useMemo(() => {
    const entries = new Map<string, CatalogCategoryTreeNode>()
    const walk = (nodes: CatalogCategoryTreeNode[]) => {
      nodes.forEach((node) => {
        entries.set(node.id, node)
        walk(node.children)
      })
    }
    walk(businessAttributeTree)
    return entries
  }, [businessAttributeTree])

  const sourceTreeFlat = useMemo(() => {
    const entries = new Map<string, CatalogCategoryTreeNode>()
    const walk = (nodes: CatalogCategoryTreeNode[]) => {
      nodes.forEach((node) => {
        entries.set(node.id, node)
        walk(node.children)
      })
    }
    walk(sourceTree)
    return entries
  }, [sourceTree])

  const updateParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === '全部') {
        next.delete(key)
      } else {
        next.set(key, value)
      }
    })
    setSearchParams(next)
  }

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const safePage = Math.min(Math.max(currentPage, 1), totalPages)
  const pagedItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize)
  const pageNumbers = Array.from({ length: Math.min(totalPages, 7) }, (_, index) => {
    if (totalPages <= 7) return index + 1
    if (safePage <= 4) return index + 1
    if (safePage >= totalPages - 3) return totalPages - 6 + index
    return safePage - 3 + index
  })

  const renderCatalogTabs = () => (
    <div className="inline-flex flex-wrap gap-2 rounded-[18px] border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[color-mix(in_srgb,var(--surface-glass)_92%,transparent)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
      {tabbedCatalogViews.map((tab) => {
        const isActive = tab.id === activeCatalogView
        const Icon = tab.icon

        return (
          <Link
            key={tab.id}
            to={tab.id === activeCatalogView ? `${location.pathname}${location.search}` : withEmbed(tab.href)}
            className={`inline-flex min-w-[9rem] items-center gap-2 rounded-[14px] px-4 py-3 text-[0.875rem] font-medium transition ${
              isActive
                ? 'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] !text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.20)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]'
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${isActive ? '!text-white' : ''}`} />
            <span className={isActive ? '!text-white' : ''}>{tab.label}</span>
          </Link>
        )
      })}
    </div>
  )

  if (activeCatalogView === 'document') {
    return (
      <div className="space-y-4">
        <section className="overflow-hidden rounded-[24px] border border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] px-6 py-6 shadow-[var(--shadow-elevated)]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-4">
                {renderCatalogTabs()}
              </div>
            </div>
          </div>
        </section>
        <KnowledgeDocumentsPage
          claimCartItems={claimCartItems}
          claimCartResourceIdSet={claimCartResourceIdSet}
          isClaimCartCollapsed={isClaimCartCollapsed}
          onExpandClaimCart={() => setIsClaimCartCollapsed(false)}
          onCollapseClaimCart={() => setIsClaimCartCollapsed(true)}
          onAddClaimCart={(item) => {
            setClaimCartItems(addCatalogClaimCartItem(buildKnowledgeDocumentClaimCartItem(item)))
          }}
          onRemoveClaimCart={handleRemoveClaimCart}
          onClearClaimCart={handleClearClaimCart}
          onSubmitClaimCart={handleSubmitClaimCart}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[24px] border border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] px-6 py-6 shadow-[var(--shadow-elevated)]">
        <div className="flex flex-col gap-5">
          {activeViewMeta.visibleInTabs || (canManageResources && activeCatalogView === 'data-resource') ? (
            <div className="flex flex-wrap items-start justify-between gap-4">
              {activeViewMeta.visibleInTabs ? (
                <div className="min-w-0 flex-1 space-y-4">
                  {renderCatalogTabs()}
                </div>
              ) : null}
              {canManageResources && activeCatalogView === 'data-resource' ? (
                <button
                  type="button"
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[999px] border border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-5 text-[0.8125rem] font-semibold text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.18)] transition hover:translate-y-[-1px]"
                >
                  <Plus className="h-4 w-4" />
                  新建数据资源
                </button>
              ) : null}
            </div>
          ) : null}
          {activeCatalogView === 'data-resource' ? (
            <CatalogOverviewPanel
              variant="plain"
              activeCategoryNodeId={activeCategoryNodeId}
              onCategorySelect={(id) => updateParams({ categoryNode: id, page: '1' })}
            />
          ) : activeCatalogView === 'spatial-resource' ? (
            <CatalogSpatialOverviewPanel
              items={rawCatalogItems}
              activeLayerKind={activeSpatialLayerKind}
              onLayerKindSelect={(id) => updateParams({ spatialLayerKind: id, page: '1' })}
            />
          ) : activeCatalogView === 'data-source' ? (
            <CatalogSourceOverviewPanel
              sourceTree={baseSourceTree}
              items={rawCatalogItems}
              activeDepartmentNodeId={activeDepartmentNodeId}
              onDepartmentSelect={(id) => updateParams({ departmentNode: id, page: '1' })}
            />
          ) : activeCatalogView === 'service' ? (
            <CatalogServiceOverviewPanel
              businessAttributeTree={baseBusinessAttributeTree}
              items={rawCatalogItems}
              activeBusinessAttributeNodeId={activeBusinessAttributeNodeId}
              onBusinessAttributeSelect={(id) => updateParams({ businessAttributeNode: id, page: '1' })}
            />
          ) : null}
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr]">
        <aside className="space-y-3 pb-3">
          <SidebarTreeSection
            title={activeViewMeta.categoryTitle}
            icon={<Workflow className="h-4 w-4" />}
            tree={categoryTree}
            totalCount={categoryFacetItems.length}
            activeNodeId={activeCategoryNodeId}
            renderNodeIcon={getCategoryIcon}
            onSelect={(id) => updateParams({ categoryNode: id })}
          />
          {isSpatialCatalogView ? (
            <>
              <SidebarTreeSection
                title="来源单位"
                icon={<Building2 className="h-4 w-4" />}
                tree={sourceTree}
                totalCount={sourceFacetItems.length}
                activeNodeId={activeDepartmentNodeId}
                onSelect={(id) => updateParams({ departmentNode: id })}
              />
              <SidebarSection
                title="图层模式"
                icon={<Settings2 className="h-4 w-4" />}
                items={spatialLayerKindOptions}
                activeId={activeSpatialLayerKindId}
                onSelect={(id) => updateParams({ spatialLayerKind: id })}
              />
              <SidebarSection
                title="鉴权方式"
                icon={<Settings2 className="h-4 w-4" />}
                items={spatialAuthModeOptions}
                activeId={activeSpatialAuthModeId}
                onSelect={(id) => updateParams({ spatialAuthMode: id })}
              />
              <SidebarSection
                title="坐标系"
                icon={<Settings2 className="h-4 w-4" />}
                items={spatialReferenceOptions}
                activeId={activeSpatialReferenceId}
                onSelect={(id) => updateParams({ spatialReference: id })}
              />
              <SidebarSection
                title="服务模式"
                icon={<Settings2 className="h-4 w-4" />}
                items={spatialCacheModeOptions}
                activeId={activeSpatialCacheModeId}
                onSelect={(id) => updateParams({ spatialCacheMode: id })}
              />
            </>
          ) : (
            <>
              <SidebarTreeSection
                title="业务属性分类"
                icon={<Workflow className="h-4 w-4" />}
                tree={businessAttributeTree}
                totalCount={businessAttributeFacetItems.length}
                activeNodeId={activeBusinessAttributeNodeId}
                onSelect={(id) => updateParams({ businessAttributeNode: id })}
              />
              <SidebarTreeSection
                title="来源单位"
                icon={<Building2 className="h-4 w-4" />}
                tree={sourceTree}
                totalCount={sourceFacetItems.length}
                activeNodeId={activeDepartmentNodeId}
                onSelect={(id) => updateParams({ departmentNode: id })}
              />
              <SidebarSection
                title="更新周期"
                icon={<Settings2 className="h-4 w-4" />}
                items={cycleOptions}
                activeId={activeCycleId}
                onSelect={(id) => updateParams({ cycle: id })}
              />
            </>
          )}
        </aside>

        <section className={supportsClaimCart && !isClaimCartCollapsed ? 'grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start' : 'space-y-3'}>
          <div className="space-y-3">
          <div className="rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap gap-3">
              <input
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    updateParams({ keyword: searchKeyword })
                  }
                }}
                className="h-11 flex-1 rounded-[10px] border border-[var(--surface-outline)] bg-[var(--field-bg)] px-4 text-[0.8125rem] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
                placeholder={activeViewMeta.searchPlaceholder}
              />
              <button
                type="button"
                className="flex h-11 w-12 items-center justify-center rounded-[10px] border border-[rgba(var(--theme-soft-rgb),0.20)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.18)] transition hover:translate-y-[-1px]"
                onClick={() => updateParams({ keyword: searchKeyword })}
              >
                <Search className="h-4 w-4" />
              </button>
              {supportsClaimCart && isClaimCartCollapsed ? (
                <button
                  type="button"
                  onClick={() => setIsClaimCartCollapsed(false)}
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
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-5 py-4 shadow-[var(--shadow-medium)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-[0.75rem] text-[var(--text-muted)]">
              <div>
                共计 <span className="font-semibold text-[var(--primary)]">{filteredItems.length}</span> {activeViewMeta.resultLabel}
              </div>
              <div>按显示顺序升序展示</div>
            </div>
            {(activeCategoryNodeId || activeBusinessAttributeNodeId || activeDepartmentNodeId || activeCycleId || activeSpatialLayerKindId || activeSpatialAuthModeId || activeSpatialReferenceId || activeSpatialCacheModeId || committedKeyword) ? (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-muted),var(--surface-tint))] px-3 py-3 text-[0.75rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <span className="font-medium text-[var(--text-main)]">当前筛选</span>
                {activeCategoryNodeId ? (
                  <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">
                    {activeViewMeta.categoryTitle}：{categoryTreeFlat.get(activeCategoryNodeId)?.pathLabel ?? activeCategoryNodeId}
                  </span>
                ) : null}
                {activeBusinessAttributeNodeId ? (
                  <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">
                    业务属性分类：{businessAttributeTreeFlat.get(activeBusinessAttributeNodeId)?.pathLabel ?? activeBusinessAttributeNodeId}
                  </span>
                ) : null}
                {activeDepartmentNodeId ? (
                  <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">
                    来源单位：{sourceTreeFlat.get(activeDepartmentNodeId)?.pathLabel ?? activeDepartmentNodeId}
                  </span>
                ) : null}
                {activeCycleId ? <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">更新周期：{activeCycleLabel}</span> : null}
                {activeSpatialLayerKindId ? <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">图层模式：{activeSpatialLayerKindLabel}</span> : null}
                {activeSpatialAuthModeId ? <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">鉴权方式：{activeSpatialAuthModeLabel}</span> : null}
                {activeSpatialReferenceId ? <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">坐标系：{activeSpatialReferenceLabel}</span> : null}
                {activeSpatialCacheModeId ? <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">服务模式：{activeSpatialCacheModeLabel}</span> : null}
                {committedKeyword ? <span className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[var(--status-info-text)]">检索：{committedKeyword}</span> : null}
                <button
                  type="button"
                  className="ml-auto text-[var(--primary)]"
                  onClick={() => {
                    setSearchKeyword('')
                    const clearedParams = new URLSearchParams()
                    if (isEmbedMode) {
                      clearedParams.set('embed', '1')
                    }
                    if (!forceView && shouldPersistLegacyCatalogView) {
                      clearedParams.set('view', activeCatalogView)
                    }
                    setSearchParams(clearedParams)
                  }}
                >
                  清空筛选
                </button>
              </div>
            ) : null}
            {favoriteError ? (
              <div className="mb-4 rounded-[10px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
                {favoriteError}
              </div>
            ) : null}
            <div className="catalog-resource-card-grid grid gap-5">
              {pagedItems.map((item) => {
                const latestStatRecord = latestResourceStatMap.get(item.id) ?? null
                const detailMetricSnapshot = buildDetailMetricSnapshot({
                  fallbackCount: item.count || '未标注',
                  fallbackUpdateCycle: item.updateCycle || '未标注',
                  department: item.department,
                  serviceSummary: item.format.includes('API')
                    ? item.format.some((format) => ['XLS', 'CSV', 'JSON'].includes(format))
                      ? '接口服务 / 目录下载'
                      : '接口服务'
                    : '目录下载',
                  latestRecord: latestStatRecord,
                })
                const domainLabel =
                  item.businessCategoryPath !== '未标注'
                    ? item.businessCategoryPath
                    : item.businessCategory !== '未标注'
                      ? item.businessCategory
                      : item.category
                const secondaryCategoryLabel = resolveSecondaryCategoryLabel(
                  item.businessCategoryPath || '',
                  item.businessCategory !== '未标注' ? item.businessCategory : item.category,
                )

                return (
                  <article
                    key={item.id}
                    className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-[3px] hover:border-[rgba(var(--theme-soft-rgb),0.26)] hover:shadow-[var(--shadow-medium)]"
                  >
                    <div className="border-b border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-tint),var(--surface-muted))] px-6 py-5">
                      <div className="flex items-start gap-3">
                        <span
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[rgba(var(--theme-soft-rgb),0.24)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-tint))] text-[var(--primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_18px_rgba(var(--theme-soft-rgb),0.10)]"
                          title={domainLabel}
                        >
                          {getCategoryIcon(secondaryCategoryLabel)}
                        </span>
                        <Link
                          to={withEmbed(`/catalog/${item.id}`)}
                          state={{ returnTo: detailReturnTo }}
                          className="block min-w-0 flex-1 text-[1.125rem] font-semibold leading-[1.45] tracking-[0.01em] text-[var(--primary)] transition group-hover:text-[var(--primary-strong)] xl:text-[1.1875rem]"
                        >
                          {item.name}
                        </Link>
                      </div>
                    </div>

                    <div className="flex h-full flex-col px-6 pb-6 pt-6">
                      <div className="min-w-0">
                        <p className="line-clamp-3 max-w-[860px] text-[0.9375rem] leading-8 text-[var(--text-secondary)]">{item.description}</p>
                      </div>

                      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-8 text-[0.9375rem] leading-7 text-[var(--text-muted)]">
                        <div>业务数据时间：{detailMetricSnapshot.updateTimeText}</div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={claimCartResourceIdSet.has(item.id)}
                            onClick={() => handleAddClaimCart(item)}
                            className={`inline-flex h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-[0.75rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                              claimCartResourceIdSet.has(item.id)
                                ? 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
                                : 'border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                            }`}
                            title={claimCartResourceIdSet.has(item.id) ? '当前资源已在数据申领夹中' : '加入数据申领夹'}
                          >
                            <Plus className="h-4 w-4" />
                            {claimCartResourceIdSet.has(item.id) ? '已在申领夹' : '加入申领夹'}
                          </button>
                          {isAuthenticated ? (
                            <button
                              type="button"
                              disabled={favoritePendingResourceId === item.id}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                void handleToggleFavorite(item.id)
                              }}
                              className={`inline-flex h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-[0.75rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                favoriteResourceIds.has(item.id)
                                  ? 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
                                  : 'border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                              }`}
                              title={favoriteResourceIds.has(item.id) ? '取消收藏' : '加入我的收藏'}
                            >
                              <Star className={`h-4 w-4 ${favoriteResourceIds.has(item.id) ? 'fill-current' : ''}`} />
                              {favoriteResourceIds.has(item.id) ? '已收藏' : '收藏'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)] md:col-span-2 xl:col-span-3">
                  {isLoading
                    ? '正在加载数据...'
                    : error
                        ? error
                        : activeViewMeta.emptyStateLabel}
                </div>
              ) : null}
            </div>
            {filteredItems.length > 0 ? (
              <div className="mt-6 flex flex-col gap-3 border-t border-[var(--line-soft)] pt-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-[0.75rem] text-[var(--text-muted)]">
                  当前第 <span className="font-semibold text-[var(--primary)]">{safePage}</span> / {totalPages} 页，每页 {pageSize} 条
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
                  <div className="flex items-center overflow-hidden rounded-[10px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[0_8px_20px_rgba(39,80,120,0.05)]">
                    {pageNumbers.map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => updateParams({ page: String(page) })}
                        className={
                          page === safePage
                            ? 'relative inline-flex h-9 min-w-10 items-center justify-center bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-3 text-[0.8125rem] font-semibold text-white'
                            : 'inline-flex h-9 min-w-10 items-center justify-center px-3 text-[0.8125rem] text-[var(--text-secondary)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]'
                        }
                      >
                        {page}
                      </button>
                    ))}
                  </div>
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
                        onClick={() => setIsClaimCartCollapsed(true)}
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
                      onClick={handleClearClaimCart}
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
                              to={withEmbed(item.detailPath || `/catalog/${item.linkedResourceId || item.resourceId}`)}
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
                            onClick={() => handleRemoveClaimCart(item.resourceId)}
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
                    onClick={handleSubmitClaimCart}
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
      {canManageResources ? (
        <ResourceEditDialog
          open={isCreateDialogOpen}
          mode="create"
          categoryTree={data.categoryTree}
          informationCategoryTree={data.informationCategoryTree}
          sourceTree={data.sourceTree}
          regionTree={regionTree}
          editOptions={editOptions}
          onClose={() => setIsCreateDialogOpen(false)}
          onSaved={async () => {
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}
