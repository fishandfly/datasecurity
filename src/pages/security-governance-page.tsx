import { ChevronDown, Database, FolderTree, LockKeyhole, Plus, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ResourceEditDialog } from '../components/resource-edit-dialog'
import { SecurityModuleTabs } from '../components/security-module-tabs'
import { Button, TopicPill } from '../components/ui'
import { canManageCatalogResources } from '../lib/admin-role'
import {
  createInitialExpandedCategoryIds,
  pruneEmptyCategoryTreeNodes,
  toggleExpandedCategoryId,
  type CatalogCategoryTreeNode,
} from '../lib/catalog-category-tree'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { getCatalogResourceTypeFilterId } from '../lib/catalog-resource-type'
import { useSecurityGovernancePolicies } from '../lib/nocobase-security-governance'
import { useSecurityDataSources } from '../lib/nocobase-security-runtime'
import { usePortalContext } from '../lib/portal-context'
import {
  buildSecurityGovernanceCountsById,
  buildSecurityGovernanceSnapshot,
  joinSecurityGovernanceItems,
  resolveSecurityScopeLabel,
  resolveSecurityStatusLabel,
  matchesSecurityGovernanceFilters,
  type SecurityGovernanceJoinedItem,
} from '../lib/security-governance'
import type { EditableResourceRecord } from '../lib/nocobase-resource-edit'

const sidebarItemClass = 'text-[0.875rem] leading-[1.25rem]'
const PAGE_SIZE = 12
const DATABASE_TABLE_LABEL = '数据库表'

type FacetOption = {
  id: string
  label: string
  count: number
}

function normalizeTypeText(value: string) {
  return value.replace(/\s+/g, '').trim()
}

function isDatabaseTableResource(item: SecurityGovernanceJoinedItem) {
  const combinedText = normalizeTypeText(`${item.serviceTypeId} ${item.serviceType} ${item.name} ${item.summary}`)

  if (/文档|文件|附件|知识|报告|制度|规范|标准|PDF|DOC|XLS/i.test(combinedText)) {
    return false
  }

  const catalogTypeId = getCatalogResourceTypeFilterId(item)
  return catalogTypeId !== 'spatial-resource' && catalogTypeId !== 'data-api'
}

function mapTreeCounts(tree: CatalogCategoryTreeNode[], counts: Map<string, number>): CatalogCategoryTreeNode[] {
  return tree.map((node) => ({
    ...node,
    count: counts.get(node.id) ?? 0,
    children: mapTreeCounts(node.children, counts),
  }))
}

function flattenTree(tree: CatalogCategoryTreeNode[]) {
  const lookup = new Map<string, CatalogCategoryTreeNode>()

  const visit = (nodes: CatalogCategoryTreeNode[]) => {
    nodes.forEach((node) => {
      lookup.set(node.id, node)
      visit(node.children)
    })
  }

  visit(tree)
  return lookup
}

function mapFacetOptionsToTree(options: FacetOption[]): CatalogCategoryTreeNode[] {
  return options
    .filter((item) => item.id)
    .map((item) => ({
      id: item.id,
      label: item.label,
      count: item.count,
      depth: 0,
      pathLabel: item.label,
      children: [],
    }))
}

function resolveCreateResourceTypeOptionId(options: Array<{ value: string; label: string }>) {
  return options.find((option) => /数据库|数据表|表/i.test(`${option.label} ${option.value}`))?.value ?? ''
}

function resolveMinuteUpdateCycleOptionId(options: Array<{ value: string; label: string }>) {
  return options.find((option) => option.label.trim() === '分钟')?.value
    ?? options.find((option) => /分钟/.test(`${option.label} ${option.value}`))?.value
    ?? ''
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

  const renderNode = (node: CatalogCategoryTreeNode): ReactNode => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedIds.includes(node.id)
    const isActive = activeNodeId === node.id

    return (
      <div key={node.id}>
        <div
          className={`mb-1 flex items-center gap-1 rounded-[8px] text-left ${sidebarItemClass} ${
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
            <span className="min-w-0 truncate">{node.label}</span>
            <span className="shrink-0">{node.count.toLocaleString()}</span>
          </button>
        </div>

        {hasChildren && isExpanded ? node.children.map((child) => renderNode(child)) : null}
      </div>
    )
  }

  const totalCount = tree.reduce((sum, node) => sum + node.count, 0)

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

      {!collapsed ? (
        <div className="max-h-[420px] overflow-y-auto px-2 py-2.5">
          <button
            type="button"
            className={`mb-1 flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] ${sidebarItemClass} ${
              !activeNodeId
                ? 'bg-[linear-gradient(180deg,var(--status-info-bg),color-mix(in_srgb,var(--status-info-bg)_70%,var(--surface-raised)))] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
                : 'bg-[var(--surface-muted)] text-[var(--text-main)]'
            }`}
            onClick={() => onSelect('')}
          >
            <span>全部</span>
            <span>{totalCount.toLocaleString()}</span>
          </button>
          {tree.map((node) => renderNode(node))}
        </div>
      ) : null}
    </div>
  )
}

export function SecurityGovernancePage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    data: {
      catalogItems,
      categoryTree,
      businessAttributeTree,
      informationCategoryTree,
      sourceTree,
      regionTree,
      editOptions,
    },
    refresh,
    session,
    isLoading: isPortalLoading,
    error: portalError,
  } = usePortalContext()
  const {
    data: securityPolicies,
    isLoading: isSecurityLoading,
    error: securityError,
  } = useSecurityGovernancePolicies(true)
  const {
    data: securityDataSources,
    isLoading: isDataSourceLoading,
    error: dataSourceError,
  } = useSecurityDataSources(true)
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const currentKeyword = searchParams.get('keyword')?.trim() ?? ''
  const activeCategoryNodeId = searchParams.get('categoryNode')?.trim() ?? ''
  const activeBusinessCategoryNodeId = searchParams.get('businessCategoryNode')?.trim() ?? ''
  const activeSecurityCategoryId = searchParams.get('securityCategory')?.trim() ?? ''
  const activeSecurityLevelId = searchParams.get('securityLevel')?.trim() ?? ''
  const rawPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const currentPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const [keywordInput, setKeywordInput] = useState(currentKeyword)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [createNotice, setCreateNotice] = useState('')
  const canManageResources = canManageCatalogResources(session?.user.roles)
  const isLoading = isPortalLoading || isSecurityLoading || isDataSourceLoading
  const error = portalError || securityError || dataSourceError || null
  const governanceItems = useMemo(
    () => joinSecurityGovernanceItems(securityPolicies, catalogItems),
    [catalogItems, securityPolicies],
  )
  const typedGovernanceItems = useMemo(
    () => governanceItems.filter(isDatabaseTableResource),
    [governanceItems],
  )

  useEffect(() => {
    setKeywordInput(currentKeyword)
  }, [currentKeyword])

  const currentFilters = useMemo(
    () => ({
      keyword: currentKeyword,
      categoryNodeId: activeCategoryNodeId,
      businessAttributeNodeId: activeBusinessCategoryNodeId,
      securityCategoryId: activeSecurityCategoryId,
      securityLevelId: activeSecurityLevelId,
    }),
    [activeBusinessCategoryNodeId, activeCategoryNodeId, activeSecurityCategoryId, activeSecurityLevelId, currentKeyword],
  )

  const filteredSnapshot = useMemo(
    () =>
      buildSecurityGovernanceSnapshot({
        items: typedGovernanceItems,
        categoryTree,
        informationCategoryTree,
        filters: currentFilters,
      }),
    [categoryTree, currentFilters, informationCategoryTree, typedGovernanceItems],
  )

  const categoryFacetItems = useMemo(
    () => typedGovernanceItems.filter((item) => matchesSecurityGovernanceFilters(item, { ...currentFilters, categoryNodeId: '' })),
    [currentFilters, typedGovernanceItems],
  )
  const businessCategoryFacetItems = useMemo(
    () => typedGovernanceItems.filter((item) => matchesSecurityGovernanceFilters(item, { ...currentFilters, businessAttributeNodeId: '' })),
    [currentFilters, typedGovernanceItems],
  )
  const securityCategoryFacetItems = useMemo(
    () => typedGovernanceItems.filter((item) => matchesSecurityGovernanceFilters(item, { ...currentFilters, securityCategoryId: '' })),
    [currentFilters, typedGovernanceItems],
  )
  const securityLevelFacetItems = useMemo(
    () => typedGovernanceItems.filter((item) => matchesSecurityGovernanceFilters(item, { ...currentFilters, securityLevelId: '' })),
    [currentFilters, typedGovernanceItems],
  )

  const countedCategoryTree = useMemo(
    () => pruneEmptyCategoryTreeNodes(
      mapTreeCounts(categoryTree, buildSecurityGovernanceCountsById(categoryFacetItems, 'category')),
      { keepNodeIds: activeCategoryNodeId ? [activeCategoryNodeId] : [] },
    ),
    [activeCategoryNodeId, categoryFacetItems, categoryTree],
  )
  const countedBusinessCategoryTree = useMemo(
    () => pruneEmptyCategoryTreeNodes(
      mapTreeCounts(businessAttributeTree, buildSecurityGovernanceCountsById(businessCategoryFacetItems, 'businessAttribute')),
      { keepNodeIds: activeBusinessCategoryNodeId ? [activeBusinessCategoryNodeId] : [] },
    ),
    [activeBusinessCategoryNodeId, businessAttributeTree, businessCategoryFacetItems],
  )
  const securityCategoryOptions = useMemo(
    () =>
      buildSecurityGovernanceSnapshot({
        items: securityCategoryFacetItems,
        categoryTree,
        informationCategoryTree,
        filters: {},
      }).securityCategoryOptions,
    [categoryTree, informationCategoryTree, securityCategoryFacetItems],
  )
  const securityLevelOptions = useMemo(
    () =>
      buildSecurityGovernanceSnapshot({
        items: securityLevelFacetItems,
        categoryTree,
        informationCategoryTree,
        filters: {},
      }).securityLevelOptions,
    [categoryTree, informationCategoryTree, securityLevelFacetItems],
  )

  const categoryLookup = useMemo(() => flattenTree(countedCategoryTree), [countedCategoryTree])
  const businessCategoryLookup = useMemo(() => flattenTree(countedBusinessCategoryTree), [countedBusinessCategoryTree])
  const securityCategoryTree = useMemo(() => mapFacetOptionsToTree(securityCategoryOptions), [securityCategoryOptions])
  const securityLevelTree = useMemo(() => mapFacetOptionsToTree(securityLevelOptions), [securityLevelOptions])
  const securityCategoryLabel = securityCategoryOptions.find((item) => item.id === activeSecurityCategoryId)?.label ?? ''
  const securityLevelLabel = securityLevelOptions.find((item) => item.id === activeSecurityLevelId)?.label ?? ''
  const createResourceInitialValues = useMemo<Partial<EditableResourceRecord>>(
    () => ({
      domainCategoryId: activeCategoryNodeId,
      dataResourceTypeId: resolveCreateResourceTypeOptionId(editOptions.serviceTypeOptions),
      updateCycleId: resolveMinuteUpdateCycleOptionId(editOptions.updateCycleOptions),
      protectionLevel: 'l2',
      resourceStatus: 'enabled',
      tags: [DATABASE_TABLE_LABEL],
    }),
    [activeCategoryNodeId, editOptions.serviceTypeOptions, editOptions.updateCycleOptions],
  )
  const dataSourceOptions = useMemo(
    () => securityDataSources
      .filter((source) => source.status === 'connected')
      .map((source) => ({ value: source.id, label: `${source.name} (${source.code})` })),
    [securityDataSources],
  )

  const sortedItems = useMemo(
    () =>
      [...filteredSnapshot.filteredItems].sort((left, right) =>
        (right.updateTime || '').localeCompare(left.updateTime || '', 'zh-CN', { numeric: true }),
      ),
    [filteredSnapshot.filteredItems],
  )

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(currentPage, 1), totalPages)
  const pagedItems = sortedItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => {
    if (currentPage === safePage) return

    const next = new URLSearchParams(searchParams)
    if (safePage <= 1) {
      next.delete('page')
    } else {
      next.set('page', String(safePage))
    }
    setSearchParams(next, { replace: true })
  }, [currentPage, safePage, searchParams, setSearchParams])

  const updateParams = (updates: Record<string, string>, options?: { resetPage?: boolean }) => {
    const next = new URLSearchParams(searchParams)

    Object.entries(updates).forEach(([key, value]) => {
      const normalized = value.trim()
      if (!normalized) {
        next.delete(key)
      } else {
        next.set(key, normalized)
      }
    })

    if (options?.resetPage !== false) {
      next.delete('page')
    }
    setSearchParams(next, { replace: true })
  }

  const resetFilters = () => {
    setKeywordInput('')
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  return (
    <div className="space-y-3">
      <SecurityModuleTabs
        module="resources"
        actions={canManageResources ? (
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            新建数据资源
          </Button>
        ) : null}
      />
      {createNotice ? (
        <div className="rounded-[8px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-[0.875rem] text-[var(--status-success-text)]">
          {createNotice}
        </div>
      ) : null}
      {isLoading ? (
        <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载数据资源管控视图...</div>
      ) : error ? (
        <div className="rounded-[18px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-6 text-[0.875rem] leading-7 text-[var(--status-danger-text)]">
          {error}
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-4">
              <SidebarTreeSection
                title="数据分类"
                icon={<Database className="h-4 w-4" />}
                tree={countedCategoryTree}
                activeNodeId={activeCategoryNodeId}
                onSelect={(id) => updateParams({ categoryNode: id })}
              />
              <SidebarTreeSection
                title="业务分类"
                icon={<FolderTree className="h-4 w-4" />}
                tree={countedBusinessCategoryTree}
                activeNodeId={activeBusinessCategoryNodeId}
                onSelect={(id) => updateParams({ businessCategoryNode: id })}
              />
              <SidebarTreeSection
                title="安全分类"
                icon={<LockKeyhole className="h-4 w-4" />}
                tree={securityCategoryTree}
                activeNodeId={activeSecurityCategoryId}
                onSelect={(id) => updateParams({ securityCategory: id })}
              />
              <SidebarTreeSection
                title="安全等级"
                icon={<ShieldCheck className="h-4 w-4" />}
                tree={securityLevelTree}
                activeNodeId={activeSecurityLevelId}
                onSelect={(id) => updateParams({ securityLevel: id })}
              />
            </div>

            <div className="space-y-4">
              <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-3 shadow-[var(--shadow-soft)]">
                <div className="flex flex-col gap-4">
                  <form
                    className="flex w-full items-center gap-3 rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-2 shadow-[var(--shadow-soft)]"
                    onSubmit={(event) => {
                      event.preventDefault()
                      updateParams({ keyword: keywordInput })
                    }}
                  >
                    <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                    <input
                      value={keywordInput}
                      onChange={(event) => setKeywordInput(event.target.value)}
                      placeholder="按资源名称、数据分类、业务分类、安全分类、安全等级或风险关键词检索"
                      className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                    />
                    <Button type="submit" className="rounded-full px-4 py-2 text-[0.8125rem]">
                      检索
                    </Button>
                  </form>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <TopicPill>数据类型：{DATABASE_TABLE_LABEL}</TopicPill>
                        {activeCategoryNodeId ? <TopicPill>数据分类：{categoryLookup.get(activeCategoryNodeId)?.pathLabel ?? activeCategoryNodeId}</TopicPill> : null}
                        {activeBusinessCategoryNodeId ? <TopicPill>业务分类：{businessCategoryLookup.get(activeBusinessCategoryNodeId)?.pathLabel ?? activeBusinessCategoryNodeId}</TopicPill> : null}
                        {activeSecurityCategoryId ? <TopicPill>安全分类：{securityCategoryLabel || activeSecurityCategoryId}</TopicPill> : null}
                        {activeSecurityLevelId ? <TopicPill>安全等级：{securityLevelLabel || activeSecurityLevelId}</TopicPill> : null}
                        {currentKeyword ? <TopicPill>关键词：{currentKeyword}</TopicPill> : null}
                        {!activeCategoryNodeId && !activeBusinessCategoryNodeId && !activeSecurityCategoryId && !activeSecurityLevelId && !currentKeyword ? (
                          <TopicPill>当前为{DATABASE_TABLE_LABEL}全量视角</TopicPill>
                        ) : null}
                      </div>
                    </div>
                    <Button variant="secondary" className="rounded-full" onClick={resetFilters}>
                      重置筛选
                    </Button>
                  </div>
                </div>
              </section>

              <div className="space-y-4">
                {pagedItems.length > 0 ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {pagedItems.map((item) => (
                      <article
                        key={item.id}
                        className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)] transition hover:-translate-y-[2px] hover:border-[rgba(var(--theme-soft-rgb),0.24)] hover:shadow-[var(--shadow-medium)]"
                      >
                        <div className="border-b border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-tint),var(--surface-muted))] px-5 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <Link
                                to={withEmbed(`/security-governance/resources/${item.resourceId}`)}
                                state={{ returnTo: `${location.pathname}${location.search}` }}
                                className="block text-[1rem] font-semibold leading-7 text-[var(--text-main)] transition hover:text-[var(--primary)]"
                              >
                                {item.name}
                              </Link>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <TopicPill>{item.department || item.securityOwnerDept || '未标注来源单位'}</TopicPill>
                                <TopicPill className="border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]">
                                  {item.securityCategory || '未标注安全分类'}
                                </TopicPill>
                                <TopicPill className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]">
                                  {item.securityLevel || '未标注安全等级'}
                                </TopicPill>
                                <TopicPill>{resolveSecurityStatusLabel(item.securityReviewStatus)}</TopicPill>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex h-full flex-col px-5 py-5">
                          <div className="space-y-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
                            <div className="flex flex-wrap gap-x-5 gap-y-1">
                              <span>数据主体类型：{item.dataSubjectType || '未标注'}</span>
                              <span>责任部门：{item.securityOwnerDept || item.department || '未标注'}</span>
                              <span>字段数量：{item.fieldCount.toLocaleString()}</span>
                            </div>

                            <div className="flex flex-wrap gap-x-5 gap-y-1">
                              <span>要求访问范围：{resolveSecurityScopeLabel(item.accessScope)}</span>
                              <span>要求共享范围：{resolveSecurityScopeLabel(item.shareScope)}</span>
                              <span>要求脱敏方式：{resolveSecurityScopeLabel(item.desensitizationMode)}</span>
                              <span>要求审批模式：{resolveSecurityScopeLabel(item.approvalMode)}</span>
                            </div>

                            <div className="rounded-[14px] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
                              <span className="font-medium text-[var(--text-main)]">字段监督摘要：</span>
                              敏感字段 {item.sensitiveFieldCount.toLocaleString()} 项，重要字段 {item.importantFieldCount.toLocaleString()} 项。
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[18px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">
                    当前数据类型和筛选条件下暂无符合条件的数据资源。
                  </div>
                )}

                {totalPages > 1 ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      className="rounded-full px-4 py-2 text-[0.8125rem]"
                      disabled={safePage <= 1}
                      onClick={() => updateParams({ page: String(safePage - 1) }, { resetPage: false })}
                    >
                      上一页
                    </Button>
                    <div className="text-[0.8125rem] text-[var(--text-secondary)]">
                      第 {safePage} / {totalPages} 页
                    </div>
                    <Button
                      variant="secondary"
                      className="rounded-full px-4 py-2 text-[0.8125rem]"
                      disabled={safePage >= totalPages}
                      onClick={() => updateParams({ page: String(safePage + 1) }, { resetPage: false })}
                    >
                      下一页
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}
      {canManageResources ? (
        <ResourceEditDialog
          open={isCreateDialogOpen}
          mode="create"
          variant="drawer"
          initialValues={createResourceInitialValues}
          categoryTree={categoryTree}
          informationCategoryTree={informationCategoryTree}
          sourceTree={sourceTree}
          regionTree={regionTree}
          editOptions={editOptions}
          securityGovernanceMode
          dataSourceOptions={dataSourceOptions}
          onClose={() => setIsCreateDialogOpen(false)}
          onSaved={async () => {
            setKeywordInput('')
            setSearchParams(new URLSearchParams(), { replace: true })
            await refresh()
            setCreateNotice('数据资源已创建并从后台重新读取。')
          }}
        />
      ) : null}
    </div>
  )
}
