import { useEffect, useMemo } from 'react'
import {
  Activity,
  ArrowRight,
  ClipboardList,
  Database,
  FileSearch,
  Layers3,
  Search,
  Sparkles,
} from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { StatCard, TopicPill } from '../components/ui'
import { getCatalogResourceTypeFilterId } from '../lib/catalog-resource-type'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { compareFullTextSearch, matchesFullTextSearch, normalizeFullTextSearch } from '../lib/full-text-search'
import { usePortalAppCatalogData, type AppCatalogNode } from '../lib/nocobase-app-data'
import {
  extractPeriodDateKey,
  formatDateInputValue,
  useRunStatsData,
  useRunStatsTasks,
  type RunStatsTaskOption,
} from '../lib/nocobase-stat-data'
import { useSupplyDemandPortalData, type SupplyDemandInfo } from '../lib/nocobase-supply-demand-data'
import { usePortalContext } from '../lib/portal-context'
import type { CatalogItem } from '../lib/nocobase-portal-data'

const SEARCH_ACCENT_PILL_CLASS_NAME =
  'border-[var(--search-pill-border)] bg-[var(--search-pill-bg)] text-[var(--search-pill-text)]'
const SEARCH_PANEL_CLASS_NAME =
  'rounded-[20px] border border-[var(--search-section-border)] bg-[linear-gradient(180deg,var(--search-section-bg-start),var(--search-section-bg-end))] shadow-[var(--shadow-medium)]'
const SEARCH_PANEL_HEADER_CLASS_NAME =
  'flex flex-col gap-3 border-b border-[var(--search-section-divider)] pb-4 lg:flex-row lg:items-center lg:justify-between'
const SEARCH_RESULT_CARD_CLASS_NAME =
  'rounded-[18px] border border-[var(--search-card-border)] bg-[linear-gradient(180deg,var(--search-card-bg-start),var(--search-card-bg-end))] px-5 py-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-[1px] hover:border-[var(--search-card-hover-border)]'

function buildSupplyDemandSearchText(item: SupplyDemandInfo) {
  return [
    item.sceneName,
    item.requiredDataResourceName,
    item.mainDataItems,
    item.demandDescription,
    item.domainCategoryName,
    item.dataFrequencyDemandName,
    item.dataSyncFrequencyName,
    item.satisfactionStatusName,
    item.dataStatusDescription,
    item.dataSourceSystem,
    item.dataSourceUnitName,
    item.dataSupplyMethodName,
    item.dataContactPerson,
    item.dataConnectionDescription,
    item.dataCategoryName,
    item.externalDataCategoryName,
    item.listSourceName,
    item.businessDomainCategoryNames.join(' '),
    item.linkedResourceNames.join(' '),
    item.relatedAppNames.join(' '),
    item.relatedApps.flatMap((relatedApp) => [
      relatedApp.name,
      relatedApp.description,
      relatedApp.contact,
      relatedApp.domainCategoryName,
      ...relatedApp.tags,
    ]).join(' '),
  ].join(' ')
}

function buildTaskSearchText(item: RunStatsTaskOption) {
  return `${item.taskCode} ${item.taskName}`.trim()
}

function buildCatalogDetailPath(item: CatalogItem) {
  if (item.mapPreview) {
    return `/catalog/${item.id}?tab=mapPreview`
  }

  if (getCatalogResourceTypeFilterId(item) === 'data-api') {
    return `/catalog/${item.id}?tab=linkInfo`
  }

  return `/catalog/${item.id}`
}

function buildCatalogResultTypeLabel(item: CatalogItem) {
  if (item.mapPreview) {
    return '空间资源'
  }

  const resourceTypeId = getCatalogResourceTypeFilterId(item)
  if (resourceTypeId === 'data-source') {
    return '数据源'
  }

  if (resourceTypeId === 'data-api') {
    return item.serviceType || '数据服务API'
  }

  return item.serviceType || '数据资源'
}

export function GlobalSearchPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { data, isBootstrapping, isLoading: isCatalogLoading } = usePortalContext()
  const { catalogItems } = data
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const returnTo = `${location.pathname}${location.search}`

  const keyword = (searchParams.get('keyword') ?? '').trim()
  const normalizedKeyword = normalizeFullTextSearch(keyword)

  const {
    data: supplyDemandItems,
    isLoading: isSupplyDemandLoading,
  } = useSupplyDemandPortalData(!isBootstrapping, { includeRelatedApps: true })
  const {
    data: appCatalogData,
    isLoading: isApplicationCatalogLoading,
    error: applicationCatalogError,
  } = usePortalAppCatalogData(!isBootstrapping)
  const { data: runStatsData, isLoading: isRunStatsLoading } = useRunStatsData(!isBootstrapping, { lazyByDate: true })
  const latestExecutionDate = useMemo(() => {
    const latestPeriodCode = runStatsData.periodSummaries[0]?.periodCode || runStatsData.periods[0] || ''
    return extractPeriodDateKey(latestPeriodCode) || formatDateInputValue(new Date())
  }, [runStatsData.periodSummaries, runStatsData.periods])
  const {
    taskOptions,
    isLoading: isTaskOptionsLoading,
    ensureExecutionDateLoaded,
  } = useRunStatsTasks(!isBootstrapping, runStatsData.periods)

  useEffect(() => {
    if (isBootstrapping || !latestExecutionDate) return
    void ensureExecutionDateLoaded(latestExecutionDate)
  }, [ensureExecutionDateLoaded, isBootstrapping, latestExecutionDate])

  const resourceResults = useMemo(() => {
    if (!normalizedKeyword) return [] as CatalogItem[]

    return catalogItems
      .filter((item) => matchesFullTextSearch(item.searchText, normalizedKeyword))
      .sort((left, right) =>
        compareFullTextSearch(left.searchText, right.searchText, normalizedKeyword, left.name, right.name),
      )
  }, [catalogItems, normalizedKeyword])

  const supplyDemandResults = useMemo(() => {
    if (!normalizedKeyword) return [] as SupplyDemandInfo[]

    return supplyDemandItems
      .filter((item) => matchesFullTextSearch(buildSupplyDemandSearchText(item), normalizedKeyword))
      .sort((left, right) =>
        compareFullTextSearch(
          buildSupplyDemandSearchText(left),
          buildSupplyDemandSearchText(right),
          normalizedKeyword,
          `${left.sceneName} ${left.requiredDataResourceName}`,
          `${right.sceneName} ${right.requiredDataResourceName}`,
        ),
      )
  }, [normalizedKeyword, supplyDemandItems])

  const applicationResults = useMemo(() => {
    if (!normalizedKeyword) return [] as AppCatalogNode[]

    return appCatalogData.flatItems
      .filter((item) => matchesFullTextSearch(item.searchText, normalizedKeyword))
      .sort((left, right) =>
        compareFullTextSearch(left.searchText, right.searchText, normalizedKeyword, left.name, right.name),
      )
  }, [appCatalogData.flatItems, normalizedKeyword])

  const taskResults = useMemo(() => {
    if (!normalizedKeyword) return [] as RunStatsTaskOption[]

    return taskOptions
      .filter((item) => !item.disabled && matchesFullTextSearch(buildTaskSearchText(item), normalizedKeyword))
      .sort((left, right) =>
        compareFullTextSearch(
          buildTaskSearchText(left),
          buildTaskSearchText(right),
          normalizedKeyword,
          left.taskName,
          right.taskName,
        ),
      )
  }, [normalizedKeyword, taskOptions])

  const totalResultCount = resourceResults.length + supplyDemandResults.length + applicationResults.length + taskResults.length

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[24px] border border-[var(--search-hero-border)] bg-[linear-gradient(135deg,var(--search-hero-bg-start),var(--search-hero-bg-end))] px-6 py-6 shadow-[var(--shadow-elevated)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[960px]">
            <div className="flex flex-wrap items-center gap-3">
              <TopicPill className={SEARCH_ACCENT_PILL_CLASS_NAME}>页头全局搜索</TopicPill>
              <TopicPill className={SEARCH_ACCENT_PILL_CLASS_NAME}>目录资源</TopicPill>
              <TopicPill className={SEARCH_ACCENT_PILL_CLASS_NAME}>供需对接</TopicPill>
              <TopicPill className={SEARCH_ACCENT_PILL_CLASS_NAME}>场景应用</TopicPill>
              <TopicPill className={SEARCH_ACCENT_PILL_CLASS_NAME}>统计作业</TopicPill>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--search-icon-bg-strong)] text-[var(--primary)]">
                <Search className="h-6 w-6" />
              </span>
              <div>
                <div className="text-[1.875rem] font-semibold leading-tight text-[var(--search-title)]">全局搜索结果</div>
                <div className="mt-2 text-[0.875rem] leading-6 text-[var(--search-body-text)]">
                  {keyword ? `当前关键词：${keyword}` : '请输入关键词，统一检索目录资源、供需对接、场景应用和统计作业。'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard title="匹配结果总数" value={`${totalResultCount}`} icon={<Sparkles className="h-5 w-5" />} />
          <StatCard title="目录资源命中" value={`${resourceResults.length}`} icon={<Database className="h-5 w-5" />} />
          <StatCard title="供需对接命中" value={`${supplyDemandResults.length}`} icon={<ClipboardList className="h-5 w-5" />} />
          <StatCard title="场景应用命中" value={`${applicationResults.length}`} icon={<Layers3 className="h-5 w-5" />} />
          <StatCard title="统计作业命中" value={`${taskResults.length}`} tone="green" icon={<Activity className="h-5 w-5" />} />
        </div>
      </section>

      {!keyword ? (
        <section className={`${SEARCH_PANEL_CLASS_NAME} p-8`}>
          <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--search-icon-bg-soft)] text-[var(--primary)]">
              <FileSearch className="h-8 w-8" />
            </span>
            <div className="text-[1.5rem] font-semibold text-[var(--search-title)]">输入关键词开始搜索</div>
            <div className="max-w-[720px] text-[0.875rem] leading-7 text-[var(--search-body-text)]">
              支持从页头统一检索数据资源、数据源、空间资源、数据服务 API、供需对接内容、场景应用，以及统计作业名称或编码。
            </div>
          </div>
        </section>
      ) : null}

      {keyword && totalResultCount === 0 ? (
        <section className={`${SEARCH_PANEL_CLASS_NAME} p-8`}>
          <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--search-icon-bg-soft)] text-[var(--primary)]">
              <Search className="h-8 w-8" />
            </span>
            <div className="text-[1.5rem] font-semibold text-[var(--search-title)]">没有找到匹配结果</div>
            <div className="max-w-[720px] text-[0.875rem] leading-7 text-[var(--search-body-text)]">
              试试更短的关键词，或者换成资源名称、数据源名称、API 名称、场景名称、应用名称、来源单位、任务编码等更明确的检索词。
            </div>
          </div>
        </section>
      ) : null}

      {keyword ? (
        <div className="grid gap-6">
          <section className={`${SEARCH_PANEL_CLASS_NAME} p-5`}>
            <div className={SEARCH_PANEL_HEADER_CLASS_NAME}>
              <div>
                <div className="text-[1.375rem] font-semibold text-[var(--search-title)]">目录资源</div>
                <div className="mt-1 text-[0.8125rem] text-[var(--search-body-text)]">按资源名称、数据源、空间资源、服务 API、来源单位、字段项等检索目录条目。</div>
              </div>
              <Link
                to={withEmbed(`/catalog?keyword=${encodeURIComponent(keyword)}`)}
                className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-[var(--primary)]"
              >
                去资源目录查看
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {isCatalogLoading ? (
              <div className="px-1 py-5 text-[0.8125rem] text-[var(--text-secondary)]">正在检索目录资源...</div>
            ) : resourceResults.length > 0 ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {resourceResults.slice(0, 8).map((item) => (
                  <Link
                    key={`resource-${item.id}`}
                    to={withEmbed(buildCatalogDetailPath(item))}
                    state={{ returnTo }}
                    className={SEARCH_RESULT_CARD_CLASS_NAME}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <TopicPill className={SEARCH_ACCENT_PILL_CLASS_NAME}>{buildCatalogResultTypeLabel(item)}</TopicPill>
                      <TopicPill>{item.category || '未标注分类'}</TopicPill>
                      <TopicPill>{item.department || '未标注单位'}</TopicPill>
                    </div>
                    <div className="mt-3 text-[1.125rem] font-semibold text-[var(--search-card-title)]">{item.name}</div>
                    <div className="mt-2 text-[0.8125rem] text-[var(--search-body-text)]">
                      编码：{item.code || '未标注'} · 类型：{item.serviceType || '未标注'} · 更新周期：{item.updateCycle || '未填写'}
                    </div>
                    <div className="mt-3 line-clamp-2 text-[0.8125rem] leading-6 text-[var(--search-card-summary)]">
                      {item.summary || item.description || item.remarks || '暂无说明'}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-1 py-5 text-[0.8125rem] text-[var(--text-secondary)]">当前关键词下没有匹配的目录资源。</div>
            )}
          </section>

          <section className={`${SEARCH_PANEL_CLASS_NAME} p-5`}>
            <div className={SEARCH_PANEL_HEADER_CLASS_NAME}>
              <div>
                <div className="text-[1.375rem] font-semibold text-[var(--search-title)]">供需对接</div>
                <div className="mt-1 text-[0.8125rem] text-[var(--search-body-text)]">按场景名称、所需资源、主要数据项、需求描述、关联应用等检索供需对接台账。</div>
              </div>
              <Link
                to={withEmbed(`/demand?keyword=${encodeURIComponent(keyword)}`)}
                className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-[var(--primary)]"
              >
                去供需对接台账查看
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {isSupplyDemandLoading ? (
              <div className="px-1 py-5 text-[0.8125rem] text-[var(--text-secondary)]">正在检索供需对接信息...</div>
            ) : supplyDemandResults.length > 0 ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {supplyDemandResults.slice(0, 8).map((item) => (
                  <Link
                    key={`supply-demand-${item.id}`}
                    to={withEmbed(`/demand/${item.id}`)}
                    className={SEARCH_RESULT_CARD_CLASS_NAME}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <TopicPill className={SEARCH_ACCENT_PILL_CLASS_NAME}>{item.sceneName}</TopicPill>
                      {item.satisfactionStatusName ? <TopicPill>{item.satisfactionStatusName}</TopicPill> : null}
                    </div>
                    <div className="mt-3 text-[1.125rem] font-semibold text-[var(--search-card-title)]">{item.requiredDataResourceName}</div>
                    <div className="mt-2 text-[0.8125rem] text-[var(--search-body-text)]">
                      领域：{item.domainCategoryName || '未标注'} · 频次：{item.dataFrequencyDemandName || '未填写'}
                    </div>
                    <div className="mt-3 line-clamp-2 text-[0.8125rem] leading-6 text-[var(--search-card-summary)]">
                      {item.demandDescription || item.mainDataItems || '暂无描述'}
                    </div>
                    {item.relatedAppNames.length > 0 ? (
                      <div className="mt-3 text-[0.75rem] text-[var(--text-secondary)]">
                        关联应用：{item.relatedAppNames.slice(0, 3).join('、')}
                      </div>
                    ) : null}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-1 py-5 text-[0.8125rem] text-[var(--text-secondary)]">当前关键词下没有匹配的供需对接记录。</div>
            )}
          </section>

          <section className={`${SEARCH_PANEL_CLASS_NAME} p-5`}>
            <div className={SEARCH_PANEL_HEADER_CLASS_NAME}>
              <div>
                <div className="text-[1.375rem] font-semibold text-[var(--search-title)]">场景应用</div>
                <div className="mt-1 text-[0.8125rem] text-[var(--search-body-text)]">按应用名称、标签、领域分类、路径、说明等检索供需对接场景应用目录。</div>
              </div>
              <Link
                to={withEmbed(`/demand?tab=application&appKeyword=${encodeURIComponent(keyword)}`)}
                className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-[var(--primary)]"
              >
                去场景应用目录查看
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {isApplicationCatalogLoading ? (
              <div className="px-1 py-5 text-[0.8125rem] text-[var(--text-secondary)]">正在检索场景应用...</div>
            ) : applicationCatalogError ? (
              <div className="px-1 py-5 text-[0.8125rem] text-[var(--text-secondary)]">{applicationCatalogError}</div>
            ) : applicationResults.length > 0 ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {applicationResults.slice(0, 8).map((item) => (
                  <Link
                    key={`application-${item.id}`}
                    to={withEmbed(`/demand/applications/${item.id}`)}
                    className={SEARCH_RESULT_CARD_CLASS_NAME}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <TopicPill className={SEARCH_ACCENT_PILL_CLASS_NAME}>{item.domainCategoryName || '未标注领域'}</TopicPill>
                      {item.tags.slice(0, 2).map((tag) => (
                        <TopicPill key={`${item.id}-${tag}`}>{tag}</TopicPill>
                      ))}
                    </div>
                    <div className="mt-3 text-[1.125rem] font-semibold text-[var(--search-card-title)]">{item.name}</div>
                    <div className="mt-2 text-[0.8125rem] text-[var(--search-body-text)]">
                      路径：{item.pathLabel || item.name}
                    </div>
                    <div className="mt-3 line-clamp-2 text-[0.8125rem] leading-6 text-[var(--search-card-summary)]">
                      {item.description || item.contact || '暂无应用说明'}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-1 py-5 text-[0.8125rem] text-[var(--text-secondary)]">当前关键词下没有匹配的场景应用。</div>
            )}
          </section>

          <section className={`${SEARCH_PANEL_CLASS_NAME} p-5`}>
            <div className={SEARCH_PANEL_HEADER_CLASS_NAME}>
              <div>
                <div className="text-[1.375rem] font-semibold text-[var(--search-title)]">统计作业</div>
                <div className="mt-1 text-[0.8125rem] text-[var(--search-body-text)]">按作业名称和任务编码检索当前统计执行日的作业配置。</div>
              </div>
              <Link
                to={withEmbed('/run-stats')}
                className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-[var(--primary)]"
              >
                去数据运行统计查看
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {isRunStatsLoading || isTaskOptionsLoading ? (
              <div className="px-1 py-5 text-[0.8125rem] text-[var(--text-secondary)]">正在检索统计作业...</div>
            ) : taskResults.length > 0 ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {taskResults.slice(0, 8).map((item) => (
                  <Link
                    key={`task-${item.taskCode}`}
                    to={withEmbed('/run-stats')}
                    className={SEARCH_RESULT_CARD_CLASS_NAME}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <TopicPill className={SEARCH_ACCENT_PILL_CLASS_NAME}>{item.taskCode}</TopicPill>
                      <TopicPill>周期数 {item.periodCount}</TopicPill>
                    </div>
                    <div className="mt-3 text-[1.125rem] font-semibold text-[var(--search-card-title)]">{item.taskName}</div>
                    <div className="mt-2 text-[0.8125rem] text-[var(--search-body-text)]">
                      执行日期：{latestExecutionDate || '未识别'} · 状态：{item.disabled ? '不可用' : '可筛选'}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-1 py-5 text-[0.8125rem] text-[var(--text-secondary)]">当前关键词下没有匹配的统计作业。</div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}
