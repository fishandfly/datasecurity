import { useMemo, useState } from 'react'
import {
  Activity,
  Building2,
  Database,
  Factory,
  FlaskConical,
  FolderOpen,
  Layers3,
  MonitorCog,
  Sprout,
  Waves,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { CatalogOverviewPanel } from '../components/catalog-overview-panel'
import { HomeArchitectureDiagram } from '../components/home-architecture-diagram'
import type { CatalogCategoryTreeNode } from '../lib/catalog-category-tree'
import { getCategoryIcon } from '../lib/category-helper'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { buildLatestUpdatedItems, buildRecommendedGroups, extractSecondaryPathLabel, limitRecommendedItems, resolveLatestBusinessUpdateTimeText } from '../lib/home-page-insights'
import { useLatestResourceStatMap } from '../lib/nocobase-stat-data'
import { usePortalContext } from '../lib/portal-context'
import { getHomeHeroNotices } from '../lib/home-page-view-state'
import { getProductModule, isProductModuleEnabled } from '../lib/product-modules'
import type { ProductModuleId } from '../lib/product-modules'

type QuickAccessCard = {
  moduleId: ProductModuleId
  title: string
  description: string
  to: string
  icon: LucideIcon
}

const quickAccessCards: QuickAccessCard[] = [
  {
    moduleId: 'security-governance',
    title: '数据安全管控',
    description: '进入安全态势、数据接入、访问控制、审计追溯和标签配置',
    to: '/security-governance/dashboard',
    icon: MonitorCog,
  },
]

type CategoryTile = {
  icon: LucideIcon
  label: string
  tone: 'soft' | 'light' | 'medium'
}

type BrowsePanelKey = 'department' | 'topic' | 'businessAttribute'

type BrowseGroup = {
  id: string
  label: string
  count: number
  icon: LucideIcon
  tone: CategoryTile['tone']
  children: CatalogCategoryTreeNode[]
  queryParam: 'categoryNode' | 'departmentNode' | 'businessAttributeNode'
}

type BrowsePanel = {
  key: BrowsePanelKey
  label: string
  title: string
  description: string
  tiles?: CategoryTile[]
  groups?: BrowseGroup[]
}

type SolutionModuleCard = {
  moduleId: ProductModuleId
  title: string
  summary: string
  to: string
  metrics: string[]
}

type OverviewTabKey = 'data' | 'source' | 'business'

type UpdateOverviewItem = {
  id: string
  label: string
  department: string
  updateTimeText: string
  badge: string
}

type UpdateOverviewSection = {
  key: string
  label: string
  hint: string
  items: UpdateOverviewItem[]
}

type UpdateOverviewTabView = {
  key: OverviewTabKey
  tabLabel: string
  title: string
  description: string
  icon: LucideIcon
  columns: UpdateOverviewSection[]
  layout?: 'three' | 'four'
  emptyText: string
}

type SourceUpdateSectionLabel = '部级' | '省级内部' | '省级外部'

type SourceUpdateSectionConfig = {
  key: 'ministry' | 'provincialInternal' | 'provincialExternal'
  label: SourceUpdateSectionLabel
  hint: string
}

type SourceUpdateCatalogItem = {
  id: string
  name: string
  department: string
  sourceSystem: string
  departmentAncestorIds: string[]
}

const SOURCE_UPDATE_ROWS_PER_COLUMN = 10
const BUSINESS_UPDATE_COLUMNS = 3

const SOURCE_UPDATE_SECTION_CONFIG: SourceUpdateSectionConfig[] = [
  { key: 'ministry', label: '部级', hint: '国家部委回流与部级共享资源' },
  { key: 'provincialInternal', label: '省级内部', hint: '厅内处室、直属单位与内部业务资源' },
  { key: 'provincialExternal', label: '省级外部', hint: '省内外部协同部门与行业共享资源' },
]

function normalizeSourceLabel(value: string) {
  return value.replace(/\s+/g, '').trim()
}

function matchesSourceTreeLabel(node: CatalogCategoryTreeNode, label: SourceUpdateSectionLabel) {
  const target = normalizeSourceLabel(label)
  const pathSegments = node.pathLabel
    .split(/[\\/／>＞]/)
    .map((segment) => normalizeSourceLabel(segment))
    .filter(Boolean)

  return pathSegments.includes(target) || normalizeSourceLabel(node.label) === target
}

function collectSourceNodeIdsByLabel(tree: CatalogCategoryTreeNode[], label: SourceUpdateSectionLabel) {
  const matchedIds = new Set<string>()

  const visit = (nodes: CatalogCategoryTreeNode[]) => {
    nodes.forEach((node) => {
      if (matchesSourceTreeLabel(node, label)) {
        matchedIds.add(node.id)
      }
      if (node.children.length > 0) {
        visit(node.children)
      }
    })
  }

  visit(tree)
  return matchedIds
}

function inferSourceSectionLabel(item: Pick<SourceUpdateCatalogItem, 'department' | 'sourceSystem'>): SourceUpdateSectionLabel {
  const haystack = normalizeSourceLabel(`${item.department} ${item.sourceSystem}`)

  if (/国家|部委|国务院|生态环境部|国家回流/.test(haystack)) {
    return '部级'
  }

  if (/生态环境|监测中心|执法局|环科院|监督站|大气处|水处|固废处|环评处|法规处|综合处|办公室/.test(haystack)) {
    return '省级内部'
  }

  return '省级外部'
}

function isSourceSectionMatch(
  item: SourceUpdateCatalogItem,
  sectionLabel: SourceUpdateSectionLabel,
  sourceNodeIds: ReadonlySet<string>,
) {
  if (sourceNodeIds.size > 0) {
    return item.departmentAncestorIds.some((id) => sourceNodeIds.has(id))
  }

  return inferSourceSectionLabel(item) === sectionLabel
}

type UpdateOverviewPanelProps = {
  columns: UpdateOverviewSection[]
  layout?: 'three' | 'four'
  withEmbed: (path: string) => string
  emptyText: string
}

const DATA_UPDATE_COLUMNS = 4

function UpdateOverviewPanel({
  columns,
  layout = 'three',
  withEmbed,
  emptyText,
}: UpdateOverviewPanelProps) {
  const gridClassName = layout === 'four' ? 'grid gap-4 lg:grid-cols-2 xl:grid-cols-4' : 'grid gap-4 lg:grid-cols-3'

  return (
    <>
      {columns.length > 0 ? (
        <div className={gridClassName}>
          {columns.map((section) => (
            <section
              key={section.key}
              className="rounded-[16px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--card-bg-start),var(--card-bg-end))] p-4 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-start justify-between gap-3 border-b border-[var(--line-soft)] pb-3">
                <div>
                  <div className="text-[1rem] font-semibold text-[var(--text-main)]">{section.label}</div>
                  <div className="mt-1 text-[0.75rem] leading-6 text-[var(--text-muted)]">{section.hint}</div>
                </div>
                <div className="rounded-full bg-[color-mix(in_srgb,var(--primary-soft)_78%,var(--surface))] px-2.5 py-1 text-[0.6875rem] font-medium text-[var(--primary)]">
                  {section.items.length}/{SOURCE_UPDATE_ROWS_PER_COLUMN}
                </div>
              </div>

              <div className="mt-3 space-y-2.5">
                {section.items.length > 0 ? section.items.map((item) => (
                  <Link
                    key={item.id}
                    to={withEmbed(`/catalog/${item.id}`)}
                    className="group block rounded-[12px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_96%,transparent),color-mix(in_srgb,var(--surface-soft)_90%,transparent))] px-3 py-3 shadow-[var(--shadow-soft)] transition hover:-translate-y-[1px] hover:border-[rgba(var(--theme-soft-rgb),0.24)] hover:shadow-[var(--shadow-medium)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary-soft)_82%,white)] text-[0.6875rem] font-semibold text-[var(--primary)]">
                        {item.badge}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[0.875rem] font-semibold text-[var(--text-main)] transition group-hover:text-[var(--primary)]">
                          {item.label}
                        </div>
                        <div className="mt-1 truncate text-[0.75rem] text-[var(--text-muted)]">
                          来源单位：{item.department}
                        </div>
                        <div className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">
                          业务数据更新时间：{item.updateTimeText}
                        </div>
                      </div>
                    </div>
                  </Link>
                )) : (
                  <div className="rounded-[12px] border border-dashed border-[var(--line-soft)] px-4 py-6 text-[0.8125rem] text-[var(--text-secondary)]">
                    当前暂无可展示的业务时间摘要。
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-[12px] border border-dashed border-[var(--line-soft)] px-4 py-6 text-[0.8125rem] text-[var(--text-secondary)]">
          {emptyText}
        </div>
      )}
    </>
  )
}

export function HomePage() {
  const location = useLocation()
  const { data, authRequired, isAuthenticated, isBootstrapping, isLoading, error, solution, modules, enabledModuleIds } = usePortalContext()
  const { catalogItems, categoryTree, businessAttributeTree, sourceTree } = data
  const heroNotices = getHomeHeroNotices({ authRequired, isLoading, error })
  const [browsePanel, setBrowsePanel] = useState<BrowsePanelKey>('topic')
  const [activeOverviewTab, setActiveOverviewTab] = useState<OverviewTabKey>('data')
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const statEnabled = !isBootstrapping && (!authRequired || isAuthenticated)
  const { data: latestResourceStatMap } = useLatestResourceStatMap(statEnabled)
  const enabledQuickAccessCards = useMemo(
    () => quickAccessCards.filter((item) => isProductModuleEnabled(item.moduleId, enabledModuleIds)),
    [enabledModuleIds],
  )

  const dataUpdateColumns = useMemo(() => {
    return [...categoryTree]
      .filter((node) => node.label !== '未标注' && node.count > 0)
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-Hans-CN'))
      .slice(0, DATA_UPDATE_COLUMNS)
      .map((node) => {
        const matchedItems = catalogItems.filter((item) => item.categoryAncestorIds.includes(node.id))

        return {
          key: node.id,
          label: node.label,
          hint: `该分类共 ${node.count.toLocaleString()} 个资源`,
          items: buildLatestUpdatedItems(matchedItems, SOURCE_UPDATE_ROWS_PER_COLUMN, latestResourceStatMap).map((item, index) => {
            const latestBusinessUpdateTime = resolveLatestBusinessUpdateTimeText(item.id, latestResourceStatMap)
            return {
              id: item.id,
              label: item.name,
              department: item.department,
              updateTimeText: latestBusinessUpdateTime || '未标注',
              badge: String(index + 1).padStart(2, '0'),
            }
          }),
        } satisfies UpdateOverviewSection
      })
  }, [catalogItems, categoryTree, latestResourceStatMap])

  const sourceUpdateColumns = useMemo(() => {
    return SOURCE_UPDATE_SECTION_CONFIG.map((section) => {
      const sourceNodeIds = collectSourceNodeIdsByLabel(sourceTree, section.label)
      const matchedItems = catalogItems.filter((item) =>
        isSourceSectionMatch(item, section.label, sourceNodeIds),
      )

      return {
        ...section,
        items: buildLatestUpdatedItems(matchedItems, SOURCE_UPDATE_ROWS_PER_COLUMN, latestResourceStatMap).map((item, index) => {
          const latestBusinessUpdateTime = resolveLatestBusinessUpdateTimeText(item.id, latestResourceStatMap)
          return {
            id: item.id,
            label: item.name,
            department: item.department,
            updateTimeText: latestBusinessUpdateTime || '未标注',
            badge: String(index + 1).padStart(2, '0'),
          }
        }),
      } satisfies UpdateOverviewSection
    })
  }, [catalogItems, latestResourceStatMap, sourceTree])

  const businessUpdateColumns = useMemo(() => {
    return [...businessAttributeTree]
      .filter((node) => node.label !== '未标注' && node.count > 0)
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-Hans-CN'))
      .slice(0, BUSINESS_UPDATE_COLUMNS)
      .map((node) => {
        const matchedItems = catalogItems.filter((item) => item.businessAttributeAncestorIds.includes(node.id))

        return {
          key: node.id,
          label: node.label,
          hint: `该分类共 ${node.count.toLocaleString()} 个资源`,
          items: buildLatestUpdatedItems(matchedItems, SOURCE_UPDATE_ROWS_PER_COLUMN, latestResourceStatMap).map((item, index) => {
            const latestBusinessUpdateTime = resolveLatestBusinessUpdateTimeText(item.id, latestResourceStatMap)
            return {
              id: item.id,
              label: item.name,
              department: item.department,
              updateTimeText: latestBusinessUpdateTime || '未标注',
              badge: String(index + 1).padStart(2, '0'),
            }
          }),
        } satisfies UpdateOverviewSection
      })
  }, [businessAttributeTree, catalogItems, latestResourceStatMap])

  const overviewTabViews = useMemo<UpdateOverviewTabView[]>(() => ([
    {
      key: 'data',
      tabLabel: '按数据分类',
      title: '按数据分类的业务数据更新时间概览',
      description: '按数据分类选择资源量最高的 4 个一级分类分栏，每列展示最近 10 条业务数据。',
      icon: Layers3,
      columns: dataUpdateColumns,
      layout: 'four',
      emptyText: '当前暂无可展示的数据分类业务时间摘要。',
    },
    {
      key: 'source',
      tabLabel: '按来源分类',
      title: '按来源分类的业务数据更新时间概览',
      description: '按来源单位分为部级、省级内部、省级外部三列，每列展示最近 10 条业务数据。',
      icon: Database,
      columns: sourceUpdateColumns,
      layout: 'three',
      emptyText: '当前暂无可展示的来源分类业务时间摘要。',
    },
    {
      key: 'business',
      tabLabel: '按业务分类',
      title: '按业务分类的业务数据更新时间概览',
      description: '按业务分类选择资源量最高的 3 个一级分类分栏，每列展示最近 10 条业务数据。',
      icon: FolderOpen,
      columns: businessUpdateColumns,
      layout: 'three',
      emptyText: '当前暂无可展示的业务分类业务时间摘要。',
    },
  ]), [businessUpdateColumns, dataUpdateColumns, sourceUpdateColumns])
  const activeOverviewView = overviewTabViews.find((item) => item.key === activeOverviewTab) ?? overviewTabViews[0]

  const topicGroups = useMemo<BrowseGroup[]>(() => {
    const topicIcons: LucideIcon[] = [Activity, Database, MonitorCog, FlaskConical]
    const topicTones: CategoryTile['tone'][] = ['medium', 'light', 'soft', 'medium']

    return categoryTree
      .filter((node) => node.label !== '未标注' && node.count > 0)
      .map((node, index) => ({
        id: node.id,
        label: node.label,
        count: node.count,
        icon: topicIcons[index % topicIcons.length],
        tone: topicTones[index % topicTones.length],
        children: node.children.filter((child) => child.label !== '未标注' && child.count > 0),
        queryParam: 'categoryNode',
      }))
  }, [categoryTree])

  const sourceGroups = useMemo<BrowseGroup[]>(() =>
    sourceTree
      .filter((node) => node.label !== '未标注')
      .map((node, index) => {
    const departmentIcons: LucideIcon[] = [Building2, Database, Activity, MonitorCog, Waves, Sprout, Zap, Factory, Layers3]
    const departmentTones: CategoryTile['tone'][] = ['medium', 'light', 'soft', 'medium', 'light', 'soft', 'medium', 'light', 'soft']

    return {
      id: node.id,
      label: node.label,
      count: node.count,
      icon: departmentIcons[index % departmentIcons.length],
      tone: departmentTones[index % departmentTones.length],
      children: node.children.filter((child) => child.label !== '未标注'),
      queryParam: 'departmentNode',
    }
  }), [sourceTree])

  const businessAttributeGroups = useMemo<BrowseGroup[]>(() => {
    const businessAttributeIcons: LucideIcon[] = [FolderOpen, Layers3, Database, MonitorCog, Factory, Zap, Sprout, Waves]
    const businessAttributeTones: CategoryTile['tone'][] = ['soft', 'medium', 'light', 'soft', 'medium', 'light', 'soft', 'medium']

    return businessAttributeTree
      .filter((node) => node.label !== '未标注' && node.count > 0)
      .map((node, index) => ({
        id: node.id,
        label: node.label,
        count: node.count,
        icon: businessAttributeIcons[index % businessAttributeIcons.length],
        tone: businessAttributeTones[index % businessAttributeTones.length],
        children: node.children.filter((child) => child.label !== '未标注' && child.count > 0),
        queryParam: 'businessAttributeNode',
      }))
  }, [businessAttributeTree])

  const browsePanels = useMemo<BrowsePanel[]>(() => ([
    { key: 'topic', label: '数据分类', title: '数据分类', description: '按照数据资源分类查看一级主题与二级细分方向', groups: topicGroups },
    { key: 'department', label: '来源分类', title: '来源分类', description: '按照来源单位浏览资源归属与共享能力', groups: sourceGroups },
    { key: 'businessAttribute', label: '业务分类', title: '业务分类', description: '按照业务属性查看一级主题与二级细分方向', groups: businessAttributeGroups },
  ]), [businessAttributeGroups, sourceGroups, topicGroups])

  const recommendedItems = useMemo(
    () => limitRecommendedItems(catalogItems, 30, latestResourceStatMap),
    [catalogItems, latestResourceStatMap],
  )
  const recommendedGroups = useMemo(
    () =>
      buildRecommendedGroups(recommendedItems).map((group) => ({
        ...group,
        items: group.items.length >= 6 ? group.items.slice(0, 6) : group.items.slice(0, 3),
      })),
    [recommendedItems],
  )
  const solutionModuleCards = useMemo<SolutionModuleCard[]>(() => {
    return modules.map((module) => {
      return {
        moduleId: module.id,
        title: module.title,
        summary: '围绕资源级和字段级安全要求形成分类分级、责任归属和共享策略闭环。',
        to: module.primaryPath,
        metrics: ['资源安全档案', '字段安全清单', '共享范围策略'],
      }
    })
  }, [modules])
  const activeBrowsePanel = browsePanels.find((panel) => panel.key === browsePanel) ?? browsePanels[0]
  const tileToneClasses: Record<CategoryTile['tone'], string> = {
    soft: 'from-[color-mix(in_srgb,var(--theme-accent)_50%,white)] to-[color-mix(in_srgb,var(--primary-soft)_80%,white)]',
    light: 'from-[color-mix(in_srgb,var(--theme-accent)_72%,white)] to-[color-mix(in_srgb,var(--theme-accent)_28%,white)]',
    medium: 'from-[color-mix(in_srgb,var(--theme-accent-strong)_88%,white)] to-[color-mix(in_srgb,var(--theme-accent)_58%,white)]',
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-[14px] border border-[var(--line)] bg-transparent shadow-[var(--shadow-elevated)]">
        <div className="relative">
          <CatalogOverviewPanel />
          {heroNotices.showLoadingNotice ? (
            <div className="mx-8 mb-8 mt-4 rounded-[12px] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] px-5 py-4 text-[0.8125rem] leading-6 text-[var(--text-secondary)] shadow-[var(--shadow-soft)] lg:mx-12">
              正在加载数据...
            </div>
          ) : null}
          {heroNotices.errorMessage ? (
            <div className="mx-8 mb-8 mt-4 rounded-[12px] border border-[rgba(229,120,102,0.32)] bg-[rgba(162,56,40,0.14)] px-5 py-4 text-[0.8125rem] leading-6 text-[#de8878] lg:mx-12">
              {heroNotices.errorMessage}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[14px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface),var(--surface-soft))] p-5 shadow-[var(--shadow-medium)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-[760px]">
            <div className="text-[0.8125rem] font-semibold text-[var(--primary)]">{solution.customerLabel}</div>
            <div className="mt-2 text-[1.5rem] font-semibold text-[var(--text-main)]">{solution.title}</div>
            <div className="mt-2 text-[0.9375rem] leading-7 text-[var(--text-secondary)]">{solution.description}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {modules.map((module) => (
              <Link
                key={module.id}
                to={withEmbed(module.primaryPath)}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[rgba(var(--theme-soft-rgb),0.20)] bg-[color-mix(in_srgb,var(--primary-soft)_64%,var(--surface))] px-3 text-[0.8125rem] font-semibold text-[var(--primary)] transition hover:border-[rgba(var(--theme-soft-rgb),0.34)] hover:bg-[color-mix(in_srgb,var(--primary-soft)_76%,var(--surface))]"
              >
                <module.icon className="h-4 w-4" />
                {module.shortTitle}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {solutionModuleCards.map((item) => {
            const module = getProductModule(item.moduleId)
            const Icon = module?.icon ?? MonitorCog

            return (
              <Link
                key={item.moduleId}
                to={withEmbed(item.to)}
                className="group rounded-[12px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--card-bg-start),var(--card-bg-end))] p-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-[2px] hover:border-[rgba(var(--theme-soft-rgb),0.26)] hover:shadow-[var(--shadow-medium)]"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[0_12px_22px_rgba(var(--theme-strong-rgb),0.18)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[1rem] font-semibold text-[var(--text-main)] group-hover:text-[var(--primary)]">{item.title}</div>
                    <div className="mt-1 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{item.summary}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.metrics.map((metric) => (
                    <span
                      key={metric}
                      className="rounded-full border border-[var(--line-soft)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-2.5 py-1 text-[0.75rem] text-[var(--text-muted)]"
                    >
                      {metric}
                    </span>
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {enabledModuleIds.length > 1 ? <HomeArchitectureDiagram /> : null}

      <section className="space-y-4 rounded-[14px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--panel-bg-start),var(--panel-bg-end))] p-4 shadow-[var(--shadow-medium)] lg:p-5">
        <div className="grid gap-4 xl:grid-cols-4">
          {enabledQuickAccessCards.map((item, index) => {
            const Icon = item.icon

            return (
              <Link
                key={item.title}
                to={withEmbed(item.to)}
                className="group relative overflow-hidden rounded-[14px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--card-bg-start),var(--card-bg-end))] p-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-[2px] hover:border-[rgba(var(--theme-soft-rgb),0.24)] hover:shadow-[var(--shadow-medium)]"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)]" />
                <div className="relative overflow-hidden rounded-[12px] border border-[rgba(var(--theme-soft-rgb),0.16)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary-soft)_84%,var(--surface)),color-mix(in_srgb,var(--theme-accent)_14%,var(--surface-soft))_52%,color-mix(in_srgb,var(--surface)_92%,transparent))] px-5 pb-5 pt-4">
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--theme-accent-strong)_20%,transparent),color-mix(in_srgb,var(--theme-accent)_10%,transparent)_50%,transparent)]" />
                  <div className="absolute right-[-10px] top-[-14px] h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.18),transparent_68%)]" />
                  <div className="absolute left-5 top-4 h-12 w-20 rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)] blur-[1px]" />
                  <div className="absolute bottom-3 left-4 right-4 h-10 rounded-[10px] border border-[rgba(255,255,255,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))]" />
                  <div className="relative flex h-[108px] items-center justify-center">
                    <div className="absolute h-16 w-32 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--theme-accent-strong)_24%,transparent),transparent_70%)] blur-[10px]" />
                    <div className="flex h-18 w-18 items-center justify-center rounded-[20px] border border-[rgba(255,255,255,0.16)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_88%,white_8%),color-mix(in_srgb,var(--primary-soft)_72%,var(--surface-soft)))] shadow-[0_18px_34px_rgba(var(--theme-strong-rgb),0.16)]">
                      <Icon className="h-9 w-9 text-[var(--primary)]" />
                    </div>
                    <div className="absolute left-2 top-2 text-[1.75rem] font-semibold tracking-[0.08em] text-white/35">
                      0{index + 1}
                    </div>
                  </div>
                </div>
                <div className="px-2 pb-1 pt-4 text-center">
                  <div className="text-[1.75rem] font-semibold tracking-[0.01em] text-[var(--text-main)]">{item.title}</div>
                  <div className="mx-auto mt-3 max-w-[240px] text-[1rem] leading-7 text-[var(--text-secondary)]">
                    {item.description}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        <div className="grid gap-4 rounded-[16px] border border-[var(--line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_96%,transparent),color-mix(in_srgb,var(--surface-soft)_92%,transparent))] p-4 shadow-[var(--shadow-soft)] lg:grid-cols-[260px_minmax(0,1fr)] lg:p-5">
          <div className="space-y-4">
            {browsePanels.map((panel, index) => {
              const isActive = panel.key === activeBrowsePanel.key

              return (
                <button
                  key={panel.key}
                  type="button"
                  onClick={() => setBrowsePanel(panel.key)}
                  className={
                    isActive
                      ? 'group relative flex w-full items-center gap-4 overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--theme-accent-strong)_34%,white)] bg-[linear-gradient(135deg,var(--theme-nav-start),var(--theme-nav-end))] px-5 py-4 text-left shadow-[0_18px_34px_rgba(var(--theme-strong-rgb),0.24)]'
                      : 'group relative flex w-full items-center gap-4 overflow-hidden rounded-[14px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--card-bg-start),var(--card-bg-end))] px-5 py-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[color-mix(in_srgb,var(--theme-accent)_34%,white)] hover:shadow-[var(--shadow-medium)]'
                  }
                >
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),transparent_45%,rgba(255,255,255,0.12)_100%)]" />
                  <div className="absolute right-[-18px] top-[-10px] h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.34),transparent_68%)]" />
                  <div
                    className={
                      isActive
                        ? 'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border border-white/24 bg-[rgba(255,255,255,0.18)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                        : 'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_92%,white_8%),color-mix(in_srgb,var(--primary-soft)_86%,var(--surface-soft)))] text-[var(--primary)] shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.08)]'
                    }
                  >
                    <span className="text-[1.25rem] font-semibold">{`0${index + 1}`}</span>
                  </div>
                  <div className="relative min-w-0 max-w-[4.5em]">
                    <div className={isActive ? 'text-[1.75rem] font-semibold leading-[1.22] text-white' : 'text-[1.75rem] font-semibold leading-[1.22] text-[var(--text-main)]'}>
                      {panel.label}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="rounded-[16px] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-5 shadow-[var(--shadow-soft)]">
            <div className="mb-5 border-b border-[var(--line-soft)] pb-4">
              <div className="text-[1.625rem] font-semibold text-[var(--text-main)]">{activeBrowsePanel.title}</div>
            </div>

            {activeBrowsePanel.groups ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                {activeBrowsePanel.groups?.map((group) => {
                  const Icon = group.icon

                  return (
                    <div
                      key={group.id}
                      className="rounded-[16px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--card-bg-start),var(--card-bg-end))] p-4 shadow-[var(--shadow-soft)]"
                    >
                      <Link
                        to={withEmbed(`/catalog?${group.queryParam}=${encodeURIComponent(group.id)}`)}
                        className="group block"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br ${tileToneClasses[group.tone]} shadow-[0_14px_28px_rgba(var(--theme-strong-rgb),0.16)]`}>
                            <div className="absolute inset-[1px] rounded-[15px] bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0.06))]" />
                            <Icon className="relative h-6 w-6 text-white drop-shadow-[0_2px_4px_rgba(52,92,144,0.18)]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[1.0625rem] font-semibold text-[var(--text-main)] transition group-hover:text-[var(--primary)]">
                              {group.label}
                            </div>
                            <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
                              {group.count.toLocaleString()} 个资源
                            </div>
                          </div>
                        </div>
                      </Link>

                      <div className="mt-4 space-y-2 border-t border-[var(--line-soft)] pt-3">
                        {group.children.length > 0 ? group.children.map((child) => (
                          <Link
                            key={child.id}
                            to={withEmbed(`/catalog?${group.queryParam}=${encodeURIComponent(child.id)}`)}
                            className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_94%,transparent),color-mix(in_srgb,var(--surface-soft)_88%,transparent))] px-3 py-2.5 text-[0.8125rem] text-[var(--text-secondary)] transition hover:border-[rgba(var(--theme-soft-rgb),0.24)] hover:text-[var(--primary)]"
                            title={child.pathLabel}
                          >
                            <span className="truncate">{child.label}</span>
                            <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--primary-soft)_78%,white)] px-2 py-0.5 text-[0.6875rem] text-[var(--primary)]">
                              {child.count}
                            </span>
                          </Link>
                        )) : (
                          <div className="rounded-[10px] border border-dashed border-[var(--line-soft)] px-3 py-3 text-[0.75rem] text-[var(--text-muted)]">
                            暂无二级分类
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                {activeBrowsePanel.tiles?.map((tile) => {
                  const Icon = tile.icon

                  return (
                    <Link key={tile.label} to={withEmbed('/catalog')} className="group flex items-start gap-4 rounded-[14px] px-2 py-1 transition hover:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]">
                      <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br ${tileToneClasses[tile.tone]} shadow-[0_14px_28px_rgba(var(--theme-strong-rgb),0.16)]`}>
                        <div className="absolute inset-[1px] rounded-[17px] bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0.06))]" />
                        <Icon className="relative h-7 w-7 text-white drop-shadow-[0_2px_4px_rgba(52,92,144,0.18)]" />
                      </div>
                      <div className="pt-1 text-[0.875rem] font-medium leading-6 text-[var(--text-main)] transition group-hover:text-[var(--primary)]">
                        {tile.label}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="rounded-[10px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface),var(--surface-soft))] p-5 shadow-[var(--shadow-medium)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-[10px] bg-[linear-gradient(180deg,var(--theme-title-start),var(--theme-title-end))] px-5 py-2 text-[1.125rem] font-semibold text-[#eef5fb] shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.18)]">
                <activeOverviewView.icon className="h-5 w-5" />
                {activeOverviewView.title}
              </div>
              <div className="mt-3 text-[0.8125rem] text-[var(--text-secondary)]">
                {activeOverviewView.description}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-b border-[var(--line-soft)] pb-4">
            {overviewTabViews.map((item) => {
              const isActive = item.key === activeOverviewView.key
              const TabIcon = item.icon

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveOverviewTab(item.key)}
                  className={
                    isActive
                      ? 'inline-flex items-center gap-2 rounded-[12px] border border-[color-mix(in_srgb,var(--theme-accent-strong)_28%,white)] bg-[linear-gradient(135deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 py-2.5 text-[0.875rem] font-semibold text-white shadow-[0_14px_28px_rgba(var(--theme-strong-rgb),0.18)]'
                      : 'inline-flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--card-bg-start),var(--card-bg-end))] px-4 py-2.5 text-[0.875rem] font-medium text-[var(--text-secondary)] transition hover:border-[rgba(var(--theme-soft-rgb),0.24)] hover:text-[var(--primary)]'
                  }
                >
                  <TabIcon className="h-4 w-4" />
                  {item.tabLabel}
                </button>
              )
            })}
          </div>

          <UpdateOverviewPanel
            columns={activeOverviewView.columns}
            layout={activeOverviewView.layout}
            withEmbed={withEmbed}
            emptyText={activeOverviewView.emptyText}
          />
        </div>
      </div>

      <div className="rounded-[10px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface),var(--surface-soft))] p-5 shadow-[var(--shadow-medium)]">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-[1.125rem] font-semibold text-[var(--text-main)]">
            <span className="inline-flex items-center gap-2 rounded-[10px] bg-[linear-gradient(180deg,var(--theme-title-start),var(--theme-title-end))] px-5 py-2 text-[1.125rem] font-semibold text-[#eef5fb] shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.18)]">
              <FolderOpen className="h-5 w-5" />
              重点资源目录推荐
            </span>
          </div>
          <div className="rounded-full border border-[var(--line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_94%,transparent),color-mix(in_srgb,var(--surface-soft)_88%,transparent))] px-3 py-1 text-[0.75rem] text-[var(--text-muted)]">
            TOP {recommendedItems.length}
          </div>
        </div>
        {recommendedItems.length > 0 ? (
          <div className="space-y-6">
            {recommendedGroups.map((group) => (
              <section key={group.label} className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-[1rem] font-semibold tracking-[0.01em] text-[var(--text-main)]">{group.label}</div>
                  <div className="rounded-full border border-[var(--line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_94%,transparent),color-mix(in_srgb,var(--surface-soft)_88%,transparent))] px-3 py-1 text-[0.75rem] text-[var(--text-secondary)]">
                    {group.items.length} 项
                  </div>
                </div>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) => {
                    const domainLabel =
                      item.businessCategoryPath && item.businessCategoryPath !== '未标注'
                        ? item.businessCategoryPath
                        : item.businessCategory && item.businessCategory !== '未标注'
                          ? item.businessCategory
                          : item.category
                    const secondaryCategoryLabel = extractSecondaryPathLabel(item.businessCategoryPath || '') || domainLabel
                    const latestBusinessUpdateTime = resolveLatestBusinessUpdateTimeText(item.id, latestResourceStatMap)

                    return (
                      <article
                        key={item.id}
                        className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--card-bg-start),var(--card-bg-end))] shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-[3px] hover:border-[rgba(var(--theme-soft-rgb),0.22)] hover:shadow-[var(--shadow-medium)]"
                      >
                        <div className="border-b border-[var(--line-soft)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_94%,white_6%),color-mix(in_srgb,var(--primary-soft)_32%,var(--surface-soft)))] px-6 py-5">
                          <div className="flex items-start gap-3">
                            <span
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[rgba(var(--theme-soft-rgb),0.22)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_92%,white_6%),color-mix(in_srgb,var(--primary-soft)_72%,var(--surface-soft)))] text-[var(--primary)] shadow-[0_8px_18px_rgba(var(--theme-strong-rgb),0.08)]"
                              title={secondaryCategoryLabel}
                            >
                              {getCategoryIcon(secondaryCategoryLabel)}
                            </span>
                            <Link
                              to={withEmbed(`/catalog/${item.id}`)}
                              className="block min-w-0 text-[1.125rem] font-semibold leading-[1.45] tracking-[0.01em] text-[var(--primary)] transition group-hover:text-[var(--theme-accent-strong)] xl:text-[1.1875rem]"
                            >
                              {item.name}
                            </Link>
                          </div>
                        </div>

                        <div className="flex h-full flex-col px-6 pb-6 pt-6">
                          <div className="min-w-0">
                            <p className="line-clamp-3 max-w-[860px] text-[0.9375rem] leading-8 text-[var(--text-secondary)]">{item.description}</p>
                          </div>

                          <div className="mt-auto pt-8 text-[0.9375rem] leading-7 text-[var(--text-muted)]">
                            <div>业务数据时间：{latestBusinessUpdateTime || '未标注'}</div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-[14px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--card-bg-start),var(--card-bg-end))] px-5 py-8 text-center text-[0.875rem] text-[var(--text-muted)]">
            暂无推荐目录。
          </div>
        )}
      </div>
    </div>
  )
}
