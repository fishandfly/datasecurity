import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity,
  Building2,
  Database,
  Factory,
  FlaskConical,
  FolderOpen,
  Layers3,
  MonitorCog,
  Search,
  Sprout,
  Waves,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import heroImage from '../assets/jilin-changbai-tianchi.jpg'
import type { CatalogCategoryTreeNode } from '../lib/catalog-category-tree'
import { getCategoryIcon } from '../lib/category-helper'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { buildRecommendedGroups, buildThemeDistributionGroups, countActiveThemes, extractSecondaryPathLabel, formatLatestDataChangeSummary, formatResourceRecordChangeSummary, limitRecommendedItems, resolveLatestBusinessUpdateTimeText } from '../lib/home-page-insights'
import { buildResourceRecordChangeTopItems, useLatestResourceStatMap, useRunStatsData } from '../lib/nocobase-stat-data'
import { usePortalContext } from '../lib/portal-context'
import { getHomeHeroNotices } from '../lib/home-page-view-state'

const quickAccessCards = [
  {
    title: '供需对接',
    description: '围绕数据需求、资源供给和对接事项发起统一办理入口',
    to: '/demand',
    icon: MonitorCog,
  },
  {
    title: '数据资源',
    description: '快速查看本网站提供的全部数据集、数据项等信息',
    to: '/catalog',
    icon: Database,
  },
  {
    title: '数据API服务',
    description: '快速查看已发布的数据接口、共享服务与能力清单',
    to: '/service-catalog',
    icon: Layers3,
  },
  {
    title: '数据运行',
    description: '查看统计任务、周期作业、运行状态与分析报告',
    to: '/run-stats',
    icon: Activity,
  },
] as const

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

const heroVariants = {
  dark: {
    sectionClassName: 'relative overflow-hidden rounded-[24px] border border-[#cfe0ec] bg-[#0f3d79] shadow-[0_24px_56px_rgba(28,73,126,0.18)]',
    imageClassName: 'absolute inset-0 bg-cover bg-center opacity-30',
    overlayClassName: 'absolute inset-0 bg-[linear-gradient(135deg,rgba(15,61,121,0.90),rgba(31,86,170,0.88))]',
    glowClassName:
      'pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.18),transparent_34%),radial-gradient(circle_at_84%_16%,rgba(255,255,255,0.12),transparent_26%),radial-gradient(circle_at_72%_82%,rgba(122,197,255,0.20),transparent_28%)]',
    gridOpacityClassName: 'pointer-events-none absolute inset-0 opacity-25',
    eyebrowClassName: 'text-[1.125rem] font-medium tracking-[0.18em] text-white/70',
    titleClassName: 'mt-3 text-[2.625rem] font-semibold leading-[1.08] tracking-[0.02em] text-white lg:text-[3rem]',
    summaryClassName: 'mt-4 max-w-[720px] text-[0.9375rem] leading-7 text-white/78',
    searchLabelClassName:
      'flex h-14 items-center gap-3 rounded-[16px] border border-white/12 bg-[rgba(97,181,226,0.18)] px-5 text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm',
    searchIconClassName: 'h-4.5 w-4.5 text-white/78',
    searchInputClassName: 'min-w-0 flex-1 bg-transparent text-[0.875rem] text-white outline-none placeholder:text-white/54',
    searchButtonClassName:
      'inline-flex h-14 items-center justify-center rounded-[16px] border border-[rgba(208,223,240,0.96)] bg-[linear-gradient(180deg,#ffffff,#f4f8fd)] text-[0.9375rem] font-semibold text-[#2b5fc3] shadow-[0_14px_28px_rgba(17,45,91,0.18)] transition hover:-translate-y-[1px]',
    noticeClassName:
      'mt-5 rounded-[14px] border border-white/12 bg-[rgba(255,255,255,0.08)] px-5 py-4 text-[0.8125rem] leading-6 text-white/78 backdrop-blur-sm',
    errorClassName:
      'mt-5 rounded-[14px] border border-[rgba(255,214,209,0.42)] bg-[rgba(130,32,27,0.24)] px-5 py-4 text-[0.8125rem] leading-6 text-white/90 backdrop-blur-sm',
    statsWrapClassName: 'mt-8 grid gap-5 border-t border-white/12 pt-6 sm:grid-cols-2 xl:grid-cols-4',
    statCardClassName: 'min-w-0',
    statLabelClassName: 'text-[0.6875rem] tracking-[0.1em] text-white/58',
    statValueClassName: 'text-[2.125rem] font-semibold leading-none text-white',
    statUnitClassName: 'pb-1 text-[0.8125rem] text-white/62',
    quickCardClassName:
      'group rounded-[18px] border border-[#dde8f2] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5 shadow-[0_16px_34px_rgba(35,79,121,0.06)] transition hover:-translate-y-[2px] hover:border-[#bfd5e8] hover:shadow-[0_22px_40px_rgba(35,79,121,0.10)]',
    quickIconShellClassName:
      'flex h-12 w-12 items-center justify-center rounded-[14px] bg-[linear-gradient(180deg,#e9f3ff,#dfeeff)] text-[var(--primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]',
    quickTitleClassName: 'mt-5 text-[1.625rem] font-semibold tracking-[0.01em] text-[var(--text-main)]',
    quickDescriptionClassName: 'mt-3 text-[0.9375rem] leading-7 text-[var(--text-secondary)]',
  },
  light: {
    sectionClassName: 'relative overflow-hidden rounded-[24px] border border-[#d7e5ef] shadow-[0_24px_56px_rgba(28,73,126,0.12)]',
    imageClassName: 'absolute inset-0 bg-cover bg-center opacity-75',
    overlayClassName:
      'absolute inset-0 bg-[linear-gradient(135deg,rgba(244,248,252,0.24),rgba(233,242,250,0.62)_38%,rgba(220,233,246,0.84)_100%)]',
    glowClassName:
      'pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.66),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.38),transparent_24%),radial-gradient(circle_at_72%_82%,rgba(168,207,236,0.30),transparent_28%)]',
    gridOpacityClassName: 'pointer-events-none absolute inset-0 opacity-18',
    eyebrowClassName: 'text-[1.125rem] font-medium tracking-[0.18em] text-[#69839a]',
    titleClassName: 'mt-3 text-[2.625rem] font-semibold leading-[1.08] tracking-[0.02em] text-[#28445d] lg:text-[3rem]',
    summaryClassName: 'mt-4 max-w-[720px] text-[0.9375rem] leading-7 text-[#4d6479]',
    searchLabelClassName:
      'flex h-14 items-center gap-3 rounded-[16px] border border-white/55 bg-[rgba(255,255,255,0.48)] px-5 text-[#668198] shadow-[0_12px_30px_rgba(57,96,136,0.08),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-md',
    searchIconClassName: 'h-4.5 w-4.5 text-[#4b82d8]',
    searchInputClassName: 'min-w-0 flex-1 bg-transparent text-[0.875rem] text-[#35526a] outline-none placeholder:text-[#7b92a7]',
    searchButtonClassName:
      'inline-flex h-14 items-center justify-center rounded-[16px] border border-[rgba(208,223,240,0.96)] bg-[linear-gradient(180deg,#ffffff,#f4f8fd)] text-[0.9375rem] font-semibold text-[#2b5fc3] shadow-[0_14px_28px_rgba(17,45,91,0.12)] transition hover:-translate-y-[1px]',
    noticeClassName:
      'mt-5 rounded-[14px] border border-white/55 bg-[rgba(255,255,255,0.56)] px-5 py-4 text-[0.8125rem] leading-6 text-[#5a7389] shadow-[0_12px_28px_rgba(57,96,136,0.06)] backdrop-blur-md',
    errorClassName:
      'mt-5 rounded-[14px] border border-[rgba(244,209,203,0.92)] bg-[rgba(255,245,243,0.78)] px-5 py-4 text-[0.8125rem] leading-6 text-[#b44738] shadow-[0_10px_24px_rgba(162,78,60,0.05)] backdrop-blur-sm',
    statsWrapClassName: 'mt-8 grid gap-4 border-t border-white/35 pt-6 sm:grid-cols-2 xl:grid-cols-4',
    statCardClassName:
      'min-w-0 rounded-[18px] border border-white/55 bg-[rgba(255,255,255,0.72)] px-5 py-5 shadow-[0_16px_34px_rgba(57,96,136,0.08)] backdrop-blur-md',
    statLabelClassName: 'text-[0.75rem] tracking-[0.08em] text-[#70879b]',
    statValueClassName: 'text-[2.125rem] font-semibold leading-none text-[#3d7ae2]',
    statUnitClassName: 'pb-1 text-[0.8125rem] text-[#7a8fa3]',
    quickCardClassName:
      'group rounded-[18px] border border-[#dde8f2] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5 shadow-[0_16px_34px_rgba(35,79,121,0.06)] transition hover:-translate-y-[2px] hover:border-[#bfd5e8] hover:shadow-[0_22px_40px_rgba(35,79,121,0.10)]',
    quickIconShellClassName:
      'flex h-12 w-12 items-center justify-center rounded-[14px] bg-[linear-gradient(180deg,#e9f3ff,#dfeeff)] text-[var(--primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]',
    quickTitleClassName: 'mt-5 text-[1.625rem] font-semibold tracking-[0.01em] text-[var(--text-main)]',
    quickDescriptionClassName: 'mt-3 text-[0.9375rem] leading-7 text-[var(--text-secondary)]',
  },
  editorial: {
    sectionClassName:
      'relative overflow-hidden rounded-[24px] border border-[#d9d1c6] bg-[#efe6d8] shadow-[0_24px_56px_rgba(79,66,47,0.14)]',
    imageClassName: 'absolute inset-0 bg-cover bg-center opacity-18 grayscale',
    overlayClassName:
      'absolute inset-0 bg-[linear-gradient(135deg,rgba(244,238,228,0.94),rgba(233,223,208,0.86)_36%,rgba(219,209,193,0.78)_100%)]',
    glowClassName:
      'pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_16%,rgba(255,255,255,0.68),transparent_28%),radial-gradient(circle_at_88%_14%,rgba(110,90,66,0.08),transparent_24%),radial-gradient(circle_at_76%_82%,rgba(162,129,96,0.10),transparent_26%)]',
    gridOpacityClassName: 'pointer-events-none absolute inset-0 opacity-10',
    eyebrowClassName: 'text-[1.125rem] font-medium tracking-[0.22em] text-[#7d6d57]',
    titleClassName: 'mt-3 text-[2.625rem] font-semibold leading-[1.08] tracking-[0.02em] text-[#2f261c] lg:text-[3rem]',
    summaryClassName: 'mt-4 max-w-[720px] text-[0.9375rem] leading-7 text-[#5f5447]',
    searchLabelClassName:
      'flex h-14 items-center gap-3 rounded-[16px] border border-[#d8cdbf] bg-[rgba(255,251,244,0.86)] px-5 text-[#7a6b59] shadow-[0_12px_30px_rgba(96,78,56,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-sm',
    searchIconClassName: 'h-4.5 w-4.5 text-[#8c6a43]',
    searchInputClassName: 'min-w-0 flex-1 bg-transparent text-[0.875rem] text-[#4c4032] outline-none placeholder:text-[#8c7c69]',
    searchButtonClassName:
      'inline-flex h-14 items-center justify-center rounded-[16px] border border-[#cdbba3] bg-[linear-gradient(180deg,#3d3125,#594433)] text-[0.9375rem] font-semibold text-[#f8efe5] shadow-[0_14px_28px_rgba(67,50,35,0.16)] transition hover:-translate-y-[1px]',
    noticeClassName:
      'mt-5 rounded-[14px] border border-[#ddd2c5] bg-[rgba(255,249,242,0.82)] px-5 py-4 text-[0.8125rem] leading-6 text-[#665a4c] shadow-[0_12px_28px_rgba(96,78,56,0.05)] backdrop-blur-sm',
    errorClassName:
      'mt-5 rounded-[14px] border border-[rgba(222,188,176,0.92)] bg-[rgba(255,244,240,0.82)] px-5 py-4 text-[0.8125rem] leading-6 text-[#a84d3c] shadow-[0_10px_24px_rgba(162,78,60,0.05)] backdrop-blur-sm',
    statsWrapClassName: 'mt-8 grid gap-4 border-t border-[#d8ccbd] pt-6 sm:grid-cols-2 xl:grid-cols-4',
    statCardClassName:
      'min-w-0 rounded-[18px] border border-[#e2d7ca] bg-[rgba(255,251,245,0.82)] px-5 py-5 shadow-[0_14px_28px_rgba(96,78,56,0.05)]',
    statLabelClassName: 'text-[0.75rem] tracking-[0.1em] text-[#7f6f5d]',
    statValueClassName: 'text-[2.125rem] font-semibold leading-none text-[#3d3125]',
    statUnitClassName: 'pb-1 text-[0.8125rem] text-[#8f7c69]',
    quickCardClassName:
      'group rounded-[18px] border border-[#ddd1c4] bg-[linear-gradient(180deg,#fffdf9,#f7f0e6)] p-5 shadow-[0_14px_30px_rgba(96,78,56,0.05)] transition hover:-translate-y-[2px] hover:border-[#c8b49a] hover:shadow-[0_20px_36px_rgba(96,78,56,0.10)]',
    quickIconShellClassName:
      'flex h-12 w-12 items-center justify-center rounded-[14px] bg-[linear-gradient(180deg,#f3e4d2,#ead6bf)] text-[#6c4d2f] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]',
    quickTitleClassName: 'mt-5 text-[1.625rem] font-semibold tracking-[0.01em] text-[#2f261c]',
    quickDescriptionClassName: 'mt-3 text-[0.9375rem] leading-7 text-[#655848]',
  },
} as const

export function HomePreviewShell({ variant }: { variant: keyof typeof heroVariants }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data, authRequired, isAuthenticated, isBootstrapping, isLoading, error } = usePortalContext()
  const { catalogItems, categoryTree, businessAttributeTree, sourceTree } = data
  const heroNotices = getHomeHeroNotices({ authRequired, isLoading, error })
  const runStatsEnabled = !isBootstrapping && (!authRequired || isAuthenticated)
  const { data: runStatsData } = useRunStatsData(runStatsEnabled)
  const { data: latestResourceStatMap } = useLatestResourceStatMap(runStatsEnabled)
  const [keyword, setKeyword] = useState('')
  const [browsePanel, setBrowsePanel] = useState<BrowsePanelKey>('topic')
  const heroStyles = heroVariants[variant]
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)

  const submitCatalogSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextKeyword = keyword.trim()

    if (nextKeyword) {
      navigate(withEmbed(`/catalog?keyword=${encodeURIComponent(nextKeyword)}`))
      return
    }

    navigate(withEmbed('/catalog'))
  }

  const themeDistribution = useMemo(() => {
    const themeIcons: LucideIcon[] = [Activity, Waves, Factory, Sprout, FlaskConical, Layers3, MonitorCog, Zap, Database]
    const iconTones = [
      'from-[color-mix(in_srgb,var(--theme-accent-strong)_88%,white)] to-[color-mix(in_srgb,var(--theme-accent)_54%,white)]',
      'from-[color-mix(in_srgb,var(--theme-accent)_78%,white)] to-[color-mix(in_srgb,var(--theme-accent-strong)_68%,white)]',
      'from-[color-mix(in_srgb,var(--theme-support)_74%,white)] to-[color-mix(in_srgb,var(--theme-support-strong)_82%,white)]',
      'from-[color-mix(in_srgb,var(--theme-support)_58%,white)] to-[color-mix(in_srgb,var(--theme-accent-strong)_52%,var(--theme-support-strong))]',
    ] as const

    return buildThemeDistributionGroups(categoryTree, 10).map((item, index) => ({
      ...item,
      icon: themeIcons[index % themeIcons.length],
      tone: iconTones[index % iconTones.length],
    }))
  }, [categoryTree])

  const monitorFeed = useMemo(() => {
    const latestPeriodCode = runStatsData.periods[0] ?? ''
    const previousPeriodCode = runStatsData.periods[1] ?? ''
    const currentPeriodRecords = runStatsData.records.filter((item) => item.periodCode === latestPeriodCode)
    const previousPeriodRecords = previousPeriodCode
      ? runStatsData.records.filter((item) => item.periodCode === previousPeriodCode)
      : []
    const changeItems = buildResourceRecordChangeTopItems(currentPeriodRecords, previousPeriodRecords, 8)
    const feedSource = changeItems.length > 0
      ? changeItems.map((item) => ({
          id: item.resourceId || item.resourceCode || item.key,
          label: item.resourceName,
          value: formatResourceRecordChangeSummary(item),
        }))
      : currentPeriodRecords.slice(0, 8).map((item) => ({
          id: item.resourceId || item.resourceCode || item.id,
          label: item.resourceName,
          value: formatLatestDataChangeSummary(item),
        }))

    return feedSource.map((item, index) => ({
      ...item,
      badge: `Top ${String(index + 1).padStart(2, '0')}`,
    }))
  }, [runStatsData.periods, runStatsData.records])

  const overviewStats = useMemo(() => {
    const totalFields = catalogItems.reduce((sum, item) => sum + item.fieldCount, 0)
    const totalDataRows = catalogItems.reduce((sum, item) => sum + item.countValue, 0)
    const activeThemeCount = countActiveThemes(catalogItems)

    return [
      { label: '业务主题', value: activeThemeCount.toLocaleString('en-US'), unit: '类' },
      { label: '数据资源', value: catalogItems.length.toLocaleString('en-US'), unit: '个' },
      { label: '数据字段', value: totalFields.toLocaleString('en-US'), unit: '项' },
      { label: '数据条数', value: totalDataRows.toLocaleString('en-US'), unit: '条' },
    ]
  }, [catalogItems])

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
  const activeBrowsePanel = browsePanels.find((panel) => panel.key === browsePanel) ?? browsePanels[0]
  const tileToneClasses: Record<CategoryTile['tone'], string> = {
    soft: 'from-[color-mix(in_srgb,var(--theme-accent)_50%,white)] to-[color-mix(in_srgb,var(--primary-soft)_80%,white)]',
    light: 'from-[color-mix(in_srgb,var(--theme-accent)_72%,white)] to-[color-mix(in_srgb,var(--theme-accent)_28%,white)]',
    medium: 'from-[color-mix(in_srgb,var(--theme-accent-strong)_88%,white)] to-[color-mix(in_srgb,var(--theme-accent)_58%,white)]',
  }

  return (
    <div className="space-y-5">
      <section className={heroStyles.sectionClassName}>
        <div
          className={heroStyles.imageClassName}
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        <div className={heroStyles.overlayClassName} />
        <div className={heroStyles.glowClassName} />
        <div className={heroStyles.gridOpacityClassName}>
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.24)_0_1px,transparent_1px_136px),linear-gradient(rgba(255,255,255,0.18)_0_1px,transparent_1px_136px)]" />
        </div>
        <div className="relative px-8 py-8 lg:px-10 lg:py-9">
          <div className="max-w-[780px]">
            <div className={heroStyles.eyebrowClassName}>JILIN ECO DATA CATALOG</div>
            <h1 className={heroStyles.titleClassName}>
              生态环境数据目录
            </h1>
            <p className={heroStyles.summaryClassName}>
              提供目录检索、字段浏览、供需对接、服务接口与运行统计的一体化服务入口，继续沿用现有首页已接入的真实数据口径。
            </p>
          </div>

          <form
            onSubmit={submitCatalogSearch}
            className="mt-7 grid max-w-[760px] gap-3 md:grid-cols-[minmax(0,1fr)_180px]"
          >
            <label className={heroStyles.searchLabelClassName}>
              <Search className={heroStyles.searchIconClassName} />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className={heroStyles.searchInputClassName}
                placeholder="输入资源名称、主题词或部门关键词..."
              />
            </label>
            <button
              type="submit"
              className={heroStyles.searchButtonClassName}
            >
              搜索目录
            </button>
          </form>

          {heroNotices.showAuthNotice ? (
            <div className={heroStyles.noticeClassName}>
              当前真实目录数据已接入后台。未登录时可先预览新版首页结构；登录后可查看实时统计与真实目录内容。
            </div>
          ) : null}
          {heroNotices.errorMessage ? (
            <div className={heroStyles.errorClassName}>
              {heroNotices.errorMessage}
            </div>
          ) : null}

          <div className={heroStyles.statsWrapClassName}>
            {overviewStats.map((item) => (
              <div
                key={item.label}
                className={heroStyles.statCardClassName}
              >
                <div className={heroStyles.statLabelClassName}>{item.label}</div>
                <div className="mt-2 flex items-end gap-2">
                  <span className={heroStyles.statValueClassName}>{item.value}</span>
                  <span className={heroStyles.statUnitClassName}>{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickAccessCards.map((item) => {
          const Icon = item.icon

          return (
            <Link
              key={item.title}
              to={withEmbed(item.to)}
              className={heroStyles.quickCardClassName}
            >
              <div className={heroStyles.quickIconShellClassName}>
                <Icon className="h-5 w-5" />
              </div>
              <div className={heroStyles.quickTitleClassName}>
                {item.title}
              </div>
              <div className={heroStyles.quickDescriptionClassName}>
                {item.description}
              </div>
            </Link>
          )
        })}
      </section>

      <section className="space-y-4 rounded-[14px] border border-[#d7e4ef] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,255,0.92))] p-4 shadow-[var(--shadow-medium)] lg:p-5">
        <div className="grid gap-4 rounded-[16px] border border-[#dbe6f0] bg-[linear-gradient(180deg,rgba(248,251,255,0.98),rgba(244,248,253,0.96))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] lg:grid-cols-[260px_minmax(0,1fr)] lg:p-5">
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
                      : 'group relative flex w-full items-center gap-4 overflow-hidden rounded-[14px] border border-[#dce6ef] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,250,254,0.96))] px-5 py-4 text-left shadow-[0_12px_28px_rgba(37,77,118,0.04)] transition hover:border-[color-mix(in_srgb,var(--theme-accent)_34%,white)] hover:shadow-[0_16px_32px_rgba(var(--theme-strong-rgb),0.08)]'
                  }
                >
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),transparent_45%,rgba(255,255,255,0.12)_100%)]" />
                  <div className="absolute right-[-18px] top-[-10px] h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.34),transparent_68%)]" />
                  <div
                    className={
                      isActive
                        ? 'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border border-white/24 bg-[rgba(255,255,255,0.18)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                        : 'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#fefeff,color-mix(in_srgb,var(--primary-soft)_86%,white))] text-[var(--primary)] shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.08)]'
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

          <div className="rounded-[16px] border border-[#e1e9f1] bg-white/88 p-5 shadow-[0_18px_42px_rgba(38,78,120,0.05)]">
            <div className="mb-5 border-b border-[#ebf0f5] pb-4">
              <div className="text-[1.625rem] font-semibold text-[var(--text-main)]">{activeBrowsePanel.title}</div>
            </div>

            {activeBrowsePanel.groups ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                {activeBrowsePanel.groups?.map((group) => {
                  const Icon = group.icon

                  return (
                    <div
                      key={group.id}
                      className="rounded-[16px] border border-[rgba(214,228,239,0.92)] bg-[linear-gradient(180deg,#ffffff,#f7fbff)] p-4 shadow-[0_14px_30px_rgba(39,80,120,0.05)]"
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
                            <div className="text-[1.0625rem] font-semibold text-[#304255] transition group-hover:text-[var(--primary)]">
                              {group.label}
                            </div>
                            <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">
                              {group.count.toLocaleString()} 个资源
                            </div>
                          </div>
                        </div>
                      </Link>

                      <div className="mt-4 space-y-2 border-t border-[#ecf2f7] pt-3">
                        {group.children.length > 0 ? group.children.map((child) => (
                          <Link
                            key={child.id}
                            to={withEmbed(`/catalog?${group.queryParam}=${encodeURIComponent(child.id)}`)}
                            className="flex items-center justify-between gap-3 rounded-[10px] border border-[#e6eef7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-3 py-2.5 text-[0.8125rem] text-[var(--text-secondary)] transition hover:border-[#cfe0ec] hover:text-[var(--primary)]"
                            title={child.pathLabel}
                          >
                            <span className="truncate">{child.label}</span>
                            <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--primary-soft)_78%,white)] px-2 py-0.5 text-[0.6875rem] text-[var(--primary)]">
                              {child.count}
                            </span>
                          </Link>
                        )) : (
                          <div className="rounded-[10px] border border-dashed border-[#dce7f1] px-3 py-3 text-[0.75rem] text-[var(--text-muted)]">
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
                    <Link key={tile.label} to={withEmbed('/catalog')} className="group flex items-start gap-4 rounded-[14px] px-2 py-1 transition hover:bg-[#f7fbff]">
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

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[10px] border border-[var(--line)] bg-[linear-gradient(180deg,#ffffff,#f8fbfd)] p-5 shadow-[var(--shadow-medium)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-[10px] bg-[linear-gradient(180deg,var(--theme-title-start),var(--theme-title-end))] px-5 py-2 text-[1.125rem] font-semibold text-[#eef5fb] shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.18)]">
                <Activity className="h-5 w-5" />
                生态主题资源分布
              </div>
            </div>
            <div className="rounded-full bg-[color-mix(in_srgb,var(--primary-soft)_78%,white)] px-3 py-1 text-[0.75rem] text-[var(--primary)]">
              {themeDistribution.length} 大主题
            </div>
          </div>
          {themeDistribution.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {themeDistribution.map((item, index) => {
                const Icon = item.icon

                return (
                  <div
                    key={item.label}
                    className="group relative overflow-hidden rounded-[14px] border border-[rgba(214,228,239,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,250,254,0.96))] px-4 py-4 shadow-[0_14px_30px_rgba(39,80,120,0.05)] transition hover:-translate-y-[1px] hover:border-[rgba(var(--theme-soft-rgb),0.18)] hover:shadow-[0_18px_34px_rgba(35,79,121,0.08)]"
                  >
                    <div className="pointer-events-none absolute right-[-18px] top-[-14px] h-20 w-20 rounded-full bg-[radial-gradient(circle,rgba(var(--theme-soft-rgb),0.14),transparent_70%)]" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br ${item.tone} shadow-[0_14px_28px_rgba(var(--theme-strong-rgb),0.16)]`}>
                          <div className="absolute inset-[1px] rounded-[15px] bg-[linear-gradient(180deg,rgba(255,255,255,0.26),rgba(255,255,255,0.06))]" />
                          <Icon className="relative h-6 w-6 text-white drop-shadow-[0_2px_4px_rgba(52,92,144,0.18)]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[0.6875rem] tracking-[0.08em] text-[var(--text-muted)]">TOP {String(index + 1).padStart(2, '0')}</div>
                          <div className="mt-1 truncate text-[1.125rem] font-semibold text-[#304255]">{item.label}</div>
                        </div>
                      </div>
                      <div className="rounded-full bg-[color-mix(in_srgb,var(--primary-soft)_78%,white)] px-2.5 py-1 text-[0.6875rem] font-medium text-[var(--primary)]">
                        占比 {item.share}%
                      </div>
                    </div>

                    <div className="mt-5 flex items-end justify-between gap-4">
                      <div className="flex items-end gap-2">
                        <span className="text-[2.125rem] font-semibold leading-none text-[var(--theme-accent-strong)]">{item.count}</span>
                        <span className="pb-1 text-[0.8125rem] text-[#7b8ea0]">个资源</span>
                      </div>
                      <div className="rounded-full border border-[rgba(214,228,239,0.92)] bg-white px-3 py-1 text-[0.75rem] text-[var(--text-secondary)]">
                        已纳入资源目录
                      </div>
                    </div>

                    {item.children.length > 0 ? (
                      <div className="mt-4 border-t border-[#e7eef6] pt-3">
                        <div className="mb-2 text-[0.6875rem] tracking-[0.08em] text-[var(--text-muted)]">一级展开</div>
                        <div className="grid gap-2">
                          {item.children.map((child) => (
                            <div
                              key={`${item.label}-${child.id}`}
                              className="flex items-center justify-between rounded-[10px] border border-[#e6eef7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-3 py-2 text-[0.8125rem] text-[var(--text-secondary)]"
                              title={`${item.label} / ${child.label}`}
                            >
                              <span className="truncate">{child.label}</span>
                              <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--primary-soft)_78%,white)] px-2 py-0.5 text-[0.6875rem] text-[var(--primary)]">
                                {child.count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[10px] border border-[#e6eef7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-4 py-6 text-[0.8125rem] text-[var(--text-secondary)]">
              暂无可展示的生态主题数据。
            </div>
          )}
        </div>

        <div className="rounded-[10px] border border-[var(--line)] bg-[linear-gradient(180deg,#ffffff,#f8fbfd)] p-5 shadow-[var(--shadow-medium)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-[10px] bg-[linear-gradient(180deg,var(--theme-title-start),var(--theme-title-end))] px-5 py-2 text-[1.125rem] font-semibold text-[#eef5fb] shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.18)]">
                <Database className="h-5 w-5" />
                目录更新概览
              </div>
            </div>
            <div className="flex items-center gap-2 text-[0.75rem] text-[#37996d]">
              <span className="h-2 w-2 rounded-full bg-[#37996d]" />
              近期摘要
            </div>
          </div>
          <div className="space-y-3">
            {monitorFeed.length > 0 ? monitorFeed.map((item) => (
              <div key={item.label} className="rounded-[10px] border border-[#e6eef7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-4 py-4 shadow-[0_10px_24px_rgba(36,77,121,0.05)]">
                <div className="flex items-center justify-between">
                  <div className="text-[0.875rem] font-semibold text-[#304255]">{item.label}</div>
                  <div className="rounded-full bg-[#f4f8fc] px-2 py-1 text-[0.6875rem] text-[var(--text-muted)]">{item.badge}</div>
                </div>
                <div className="mt-2 text-[0.8125rem] text-[var(--text-secondary)]">{item.value}</div>
              </div>
            )) : (
              <div className="rounded-[10px] border border-[#e6eef7] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-4 py-6 text-[0.8125rem] text-[var(--text-secondary)]">
                暂无可展示的目录摘要。
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border border-[var(--line)] bg-[linear-gradient(180deg,#ffffff,#f8fbfd)] p-5 shadow-[var(--shadow-medium)]">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-[1.125rem] font-semibold text-[#3f4c59]">
            <span className="inline-flex items-center gap-2 rounded-[10px] bg-[linear-gradient(180deg,var(--theme-title-start),var(--theme-title-end))] px-5 py-2 text-[1.125rem] font-semibold text-[#eef5fb] shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.18)]">
              <FolderOpen className="h-5 w-5" />
              重点资源目录推荐
            </span>
          </div>
          <div className="rounded-full border border-[rgba(214,228,239,0.92)] bg-[linear-gradient(180deg,#ffffff,#f4f9fe)] px-3 py-1 text-[0.75rem] text-[var(--text-muted)]">
            TOP {recommendedItems.length}
          </div>
        </div>
        {recommendedItems.length > 0 ? (
          <div className="space-y-6">
            {recommendedGroups.map((group) => (
              <section key={group.label} className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-[1rem] font-semibold tracking-[0.01em] text-[#35506a]">{group.label}</div>
                  <div className="rounded-full border border-[#dce8f2] bg-[linear-gradient(180deg,#ffffff,#f5f9fd)] px-3 py-1 text-[0.75rem] text-[#6f879f]">
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
                        className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-[rgba(214,228,239,0.96)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,250,255,0.96))] shadow-[0_18px_38px_rgba(43,84,128,0.07)] transition duration-300 hover:-translate-y-[3px] hover:border-[rgba(184,207,228,0.96)] hover:shadow-[0_26px_52px_rgba(43,84,128,0.12)]"
                      >
                        <div className="border-b border-[rgba(219,232,243,0.96)] bg-[linear-gradient(180deg,rgba(237,247,255,0.98),rgba(231,241,251,0.92))] px-6 py-5">
                          <div className="flex items-start gap-3">
                            <span
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[rgba(126,177,230,0.24)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(233,244,255,0.96))] text-[#4f87ea] shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_8px_18px_rgba(79,135,234,0.08)]"
                              title={secondaryCategoryLabel}
                            >
                              {getCategoryIcon(secondaryCategoryLabel)}
                            </span>
                            <Link
                              to={withEmbed(`/catalog/${item.id}`)}
                              className="block min-w-0 text-[1.125rem] font-semibold leading-[1.45] tracking-[0.01em] text-[#3c7bea] transition group-hover:text-[#2e68d8] xl:text-[1.1875rem]"
                            >
                              {item.name}
                            </Link>
                          </div>
                        </div>

                        <div className="flex h-full flex-col px-6 pb-6 pt-6">
                          <div className="min-w-0">
                            <p className="line-clamp-3 max-w-[860px] text-[0.9375rem] leading-8 text-[#6e86a0]">{item.description}</p>
                          </div>

                          <div className="mt-auto pt-8 text-[0.9375rem] leading-7 text-[#9aadbf]">
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
          <div className="rounded-[14px] border border-[rgba(214,228,239,0.92)] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-5 py-8 text-center text-[0.875rem] text-[var(--text-muted)]">
            暂无推荐目录。
          </div>
        )}
      </div>
    </div>
  )
}
