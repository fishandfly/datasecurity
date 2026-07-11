import { useEffect, useMemo, useState } from 'react'
import { AppWindow, Link2, Star, Workflow } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, ScenicPanel } from '../components/ui'
import {
  buildFavoriteResourceSummaries,
  buildResourceFavoriteIdentity,
  fetchFavoriteListMine,
  removeFavorite,
  type FavoriteItem,
} from '../lib/nocobase-favorites'
import { fetchSupplyDemandPortalData, type SupplyDemandInfo } from '../lib/nocobase-supply-demand-data'
import { buildPaginationItems } from '../lib/pagination'
import {
  buildAuthorizedResourceItems,
  getPersonalCenterCardPresentation,
  PERSONAL_CENTER_CARD_ORDER,
  getPersonalCenterGridPresentation,
  getPersonalCenterSectionTitle,
  paginatePersonalCenterSectionItems,
  resolvePersonalCenterSection,
  type PersonalCenterSectionKey,
} from '../lib/personal-center-sections'
import { usePortalCatalogData } from '../lib/nocobase-portal-data'
import { usePortalContext } from '../lib/portal-context'

type CenterModuleCard = {
  key: PersonalCenterSectionKey
  title: string
  value: string
  status: string
  icon: React.ReactNode
  note: string
}

function includesAny(source: string, keywords: string[]) {
  return keywords.some((keyword) => source.includes(keyword))
}

function resolveStatusLabel(item: SupplyDemandInfo) {
  const raw = [item.satisfactionStatusName, item.dataStatusDescription, item.dataConnectionDescription].join(' ')

  if (includesAny(raw, ['已满足', '已接入', '已提供', '已发放'])) {
    return '已接入'
  }

  if (includesAny(raw, ['部分', '补充', '待完善'])) {
    return '部分满足'
  }

  if (includesAny(raw, ['无', '未接入', '待', '缺口'])) {
    return '待补充'
  }

  return '待研判'
}

function formatFavoriteDate(value: string) {
  if (!value) return '未记录'
  return value.includes('T') ? value.slice(0, 10) : value.slice(0, 19)
}

export function PersonalCenterPage() {
  const { isAuthenticated, isBootstrapping, session } = usePortalContext()
  const catalogData = usePortalCatalogData(!isBootstrapping, 'list')
  const { catalogItems } = catalogData.data
  const [items, setItems] = useState<SupplyDemandInfo[]>([])
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoadingCenterData, setIsLoadingCenterData] = useState(false)
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false)
  const [favoritePendingResourceId, setFavoritePendingResourceId] = useState('')
  const [centerError, setCenterError] = useState<string | null>(null)
  const [favoriteError, setFavoriteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!isAuthenticated) {
      setItems([])
      setCenterError(null)
      setIsLoadingCenterData(false)
      return () => {
        cancelled = true
      }
    }

    setIsLoadingCenterData(true)

    fetchSupplyDemandPortalData()
      .then((payload) => {
        if (cancelled) return
        setItems(payload)
        setCenterError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setItems([])
        setCenterError(error instanceof Error ? error.message : '个人中心数据加载失败')
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingCenterData(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  useEffect(() => {
    let cancelled = false

    if (!isAuthenticated) {
      setFavoriteItems([])
      setFavoriteError(null)
      setIsLoadingFavorites(false)
      setFavoritePendingResourceId('')
      return () => {
        cancelled = true
      }
    }

    setIsLoadingFavorites(true)

    fetchFavoriteListMine()
      .then((payload) => {
        if (cancelled) return
        setFavoriteItems(payload)
        setFavoriteError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setFavoriteItems([])
        setFavoriteError(error instanceof Error ? error.message : '我的收藏加载失败')
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingFavorites(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  const myItems = useMemo(() => {
    const normalizedUserId = String(session?.user.id ?? '')
    if (!normalizedUserId) return items

    const hasCreatedByInfo = items.some((item) => item.createdById)
    if (!hasCreatedByInfo) {
      return items
    }

    return items.filter((item) => item.createdById === normalizedUserId)
  }, [items, session?.user.id])

  const linkedDemandItems = useMemo(
    () => myItems.filter((item) => item.linkedResourceIds.length > 0),
    [myItems],
  )
  const authorizedResources = useMemo(
    () => buildAuthorizedResourceItems(myItems),
    [myItems],
  )
  const pendingCount = useMemo(
    () => myItems.filter((item) => resolveStatusLabel(item) === '待补充' || resolveStatusLabel(item) === '待研判').length,
    [myItems],
  )
  const favoriteSummaries = useMemo(
    () =>
      buildFavoriteResourceSummaries(
        favoriteItems,
        catalogItems.map((item) => ({
          id: item.id,
          name: item.name,
          summary: item.summary,
          department: item.department,
          businessCategoryPath: item.businessCategoryPath,
          category: item.category,
          updateTime: item.updateTime,
        })),
      ),
    [catalogItems, favoriteItems],
  )
  const [activeSection, setActiveSection] = useState<PersonalCenterSectionKey>('demands')
  const [hasManualSectionSelection, setHasManualSectionSelection] = useState(false)
  const gridPresentation = useMemo(() => getPersonalCenterGridPresentation(), [])
  const appCards = useMemo(
    () => [
      {
        id: 'apps-placeholder',
        title: '应用中心建设中',
        description: '已申请应用和接入应用将在后续建设，后续会在这里汇总全部已开通的个人应用入口。',
      },
    ],
    [],
  )
  const favoritePagination = useMemo(
    () => paginatePersonalCenterSectionItems(favoriteSummaries, currentPage, gridPresentation.pageSize),
    [currentPage, favoriteSummaries, gridPresentation.pageSize],
  )
  const demandPagination = useMemo(
    () => paginatePersonalCenterSectionItems(myItems, currentPage, gridPresentation.pageSize),
    [currentPage, gridPresentation.pageSize, myItems],
  )
  const linkedPagination = useMemo(
    () => paginatePersonalCenterSectionItems(authorizedResources, currentPage, gridPresentation.pageSize),
    [authorizedResources, currentPage, gridPresentation.pageSize],
  )
  const appPagination = useMemo(
    () => paginatePersonalCenterSectionItems(appCards, currentPage, gridPresentation.pageSize),
    [appCards, currentPage, gridPresentation.pageSize],
  )
  const activePagination = useMemo(() => {
    switch (activeSection) {
      case 'favorites':
        return favoritePagination
      case 'demands':
        return demandPagination
      case 'linked':
        return linkedPagination
      case 'apps':
      default:
        return appPagination
    }
  }, [activeSection, appPagination, demandPagination, favoritePagination, linkedPagination])
  const paginationItems = useMemo(
    () => buildPaginationItems(activePagination.safePage, activePagination.totalPages),
    [activePagination.safePage, activePagination.totalPages],
  )
  const sectionCounts: Record<PersonalCenterSectionKey, number> = {
    favorites: favoriteSummaries.length,
    demands: myItems.length,
    linked: authorizedResources.length,
    apps: 0,
  }
  const activeSectionCardCount = useMemo(() => {
    switch (activeSection) {
      case 'favorites':
        return favoriteSummaries.length
      case 'demands':
        return myItems.length
      case 'linked':
        return authorizedResources.length
      case 'apps':
      default:
        return appCards.length
    }
  }, [activeSection, appCards.length, authorizedResources.length, favoriteSummaries.length, myItems.length])
  const activeSectionTitle = getPersonalCenterSectionTitle(activeSection)

  useEffect(() => {
    setCurrentPage(1)
  }, [activeSection, authorizedResources.length, favoriteSummaries.length, myItems.length])

  useEffect(() => {
    setActiveSection((current) =>
      resolvePersonalCenterSection({
        currentSection: current,
        demandCount: myItems.length,
        favoriteCount: favoriteSummaries.length,
        linkedCount: authorizedResources.length,
        hasManualSelection: hasManualSectionSelection,
      }),
    )
  }, [authorizedResources.length, favoriteSummaries.length, hasManualSectionSelection, myItems.length])

  useEffect(() => {
    if (!isAuthenticated) {
      setHasManualSectionSelection(false)
    }
  }, [isAuthenticated])

  const centerCardsByKey: Record<PersonalCenterSectionKey, CenterModuleCard> = {
    demands: {
      key: 'demands',
      title: '供需对接',
      value: myItems.length.toString(),
      status: '已接入',
      icon: <Workflow className="h-5 w-5" />,
      note: pendingCount > 0 ? `当前有 ${pendingCount} 条供需对接记录待补充或待研判。` : '当前可查看我登记的供需对接记录。',
    },
    favorites: {
      key: 'favorites',
      title: '我的收藏',
      value: favoriteSummaries.length.toString(),
      status: favoriteError ? '加载异常' : '已接入',
      icon: <Star className="h-5 w-5" />,
      note: favoriteSummaries.length > 0 ? `已收藏 ${favoriteSummaries.length} 条资源，可在下方快速返回详情。` : '可在资源目录和资源详情页加入我的收藏。',
    },
    linked: {
      key: 'linked',
      title: '授权给我的数据资源',
      value: authorizedResources.length.toString(),
      status: '已接入',
      icon: <Link2 className="h-5 w-5" />,
      note:
        authorizedResources.length > 0
          ? `当前已汇总 ${authorizedResources.length} 条已授权资源，来源于 ${linkedDemandItems.length} 条供需对接记录。`
          : '当前账号暂无已授权资源。',
    },
    apps: {
      key: 'apps',
      title: '我的应用',
      value: '0',
      status: '待建设',
      icon: <AppWindow className="h-5 w-5" />,
      note: '已申请应用和接入应用将在后续建设。',
    },
  }
  const centerCards = PERSONAL_CENTER_CARD_ORDER.map((key) => centerCardsByKey[key])

  const handleRemoveFavorite = async (resourceId: string, detailUrl: string) => {
    setFavoritePendingResourceId(resourceId)
    setFavoriteError(null)

    try {
      await removeFavorite(buildResourceFavoriteIdentity(resourceId, detailUrl))
      setFavoriteItems((current) => current.filter((item) => item.recordPk !== resourceId))
    } catch (error) {
      setFavoriteError(error instanceof Error ? error.message : '取消收藏失败')
    } finally {
      setFavoritePendingResourceId('')
    }
  }

  const handleSelectSection = (sectionKey: PersonalCenterSectionKey) => {
    setHasManualSectionSelection(true)
    setActiveSection(sectionKey)
  }

  if (isBootstrapping) {
    return <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在同步登录状态...</div>
  }

  return (
    <div className="space-y-6">
      <ScenicPanel className="px-6 py-6">
        {centerError ? (
          <div className="mt-4 rounded-[10px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
            {centerError}
          </div>
        ) : null}
        {catalogData.error ? (
          <div className="mt-4 rounded-[10px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
            {catalogData.error}
          </div>
        ) : null}
        {favoriteError ? (
          <div className="mt-4 rounded-[10px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
            {favoriteError}
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {centerCards.map(({ key, title, value, status, icon, note }) => {
            const cardPresentation = getPersonalCenterCardPresentation(activeSection === key)

            return (
              <button
                key={key}
                type="button"
                aria-pressed={activeSection === key}
                onClick={() => handleSelectSection(key)}
                className={`rounded-[12px] border px-4 py-4 text-left shadow-[0_16px_32px_rgba(39,80,120,0.08)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(44,131,220,0.28)] ${cardPresentation.cardClassName}`}
              >
                <div className="flex items-center justify-between">
                  <div className={`text-[0.75rem] ${cardPresentation.titleClassName}`}>{title}</div>
                  <div className={cardPresentation.iconClassName}>{icon}</div>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <div className={`text-[1.75rem] font-semibold ${cardPresentation.valueClassName}`}>{value}</div>
                  <div
                    className={`mb-1 rounded-full px-2 py-1 text-[0.6875rem] ${
                      status === '已接入' ? 'bg-[var(--status-info-bg)] text-[var(--status-info-text)]' : 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]'
                    }`}
                  >
                    {status}
                  </div>
                </div>
                <div className="mt-2 text-[0.75rem] leading-6 text-[var(--text-secondary)]">{note}</div>
              </button>
            )
          })}
        </div>
      </ScenicPanel>

      <Card className="space-y-4 rounded-[10px] border border-[var(--line)] p-5 shadow-[var(--shadow-soft)]">
        <div className="relative overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[linear-gradient(135deg,var(--surface-tint),var(--surface-raised-strong)_52%,var(--surface-muted))] px-5 py-5 shadow-[0_18px_36px_rgba(var(--theme-soft-rgb),0.08)]">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-44 bg-[linear-gradient(90deg,rgba(var(--theme-soft-rgb),0.10),transparent)]" />
          <div className="pointer-events-none absolute -right-8 top-[-34px] h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(var(--theme-soft-rgb),0.24),transparent_72%)]" />
          <div className="pointer-events-none absolute bottom-[-42px] left-[-18px] h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(var(--theme-support-rgb),0.18),transparent_72%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[1.25rem] font-semibold text-[var(--text-main)]">{activeSectionTitle}</div>
            </div>
            <div className="inline-flex h-10 items-center rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.75rem] font-semibold text-[var(--primary)] shadow-[0_10px_24px_rgba(var(--theme-soft-rgb),0.10)] backdrop-blur">
              {activeSection === 'apps' ? '待建设' : `共 ${sectionCounts[activeSection]} 条`}
            </div>
          </div>
        </div>

        {activeSection === 'favorites' ? (
          isLoadingFavorites || catalogData.isLoading ? (
            <div className="rounded-[10px] bg-[var(--surface-muted)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">正在加载我的收藏...</div>
          ) : (
            <div className={gridPresentation.gridClassName}>
              {favoriteSummaries.length > 0 ? (
                favoritePagination.items.map((item) => (
                  <div
                    key={item.favoriteId}
                    className="flex h-full flex-col rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4 shadow-[var(--shadow-soft)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[0.75rem] text-[var(--text-muted)]">{item.businessCategory}</div>
                    <Link to={item.detailUrl || `/catalog/${item.resourceId}`} className="mt-1 block text-[0.9375rem] font-medium text-[var(--text-main)] hover:text-[var(--primary)]">
                          {item.name}
                        </Link>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[0.6875rem] ${item.missing ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]' : 'bg-[var(--status-info-bg)] text-[var(--status-info-text)]'}`}>
                        {item.missing ? '目录未命中' : '已收藏'}
                      </span>
                    </div>
                    <div className="mt-3 flex-1 text-[0.75rem] leading-6 text-[var(--text-secondary)]">{item.summary}</div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[0.75rem] text-[var(--text-muted)]">
                      <span>来源单位：{item.department}</span>
                      <span>更新时间：{item.updateTime || '未记录'}</span>
                      <span>收藏时间：{formatFavoriteDate(item.favoritedAt)}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Link
                        to={item.detailUrl || `/catalog/${item.resourceId}`}
                        className={gridPresentation.actionButtonClassName}
                      >
                        查看详情
                      </Link>
                      <button
                        type="button"
                        disabled={favoritePendingResourceId === item.resourceId}
                        onClick={() => void handleRemoveFavorite(item.resourceId, item.detailUrl || `/catalog/${item.resourceId}`)}
                        className={gridPresentation.actionButtonClassName}
                      >
                        {favoritePendingResourceId === item.resourceId ? '处理中...' : '取消收藏'}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex h-full flex-col rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4 shadow-[var(--shadow-soft)]">
                  <div className="text-[0.75rem] text-[var(--text-muted)]">我的收藏</div>
                  <div className="mt-2 text-[0.9375rem] font-medium text-[var(--text-main)]">当前还没有收藏资源</div>
                  <div className="mt-3 flex-1 text-[0.75rem] leading-6 text-[var(--text-secondary)]">可前往资源目录或资源详情页加入我的收藏，常用资源会在这里统一分页展示。</div>
                  <div className="mt-4 flex items-center gap-3">
                    <Link to="/catalog" className={gridPresentation.actionButtonClassName}>
                      前往资源目录
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )
        ) : activeSection === 'demands' ? (
          isLoadingCenterData ? (
            <div className="rounded-[10px] bg-[var(--surface-muted)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">正在加载我的供需对接...</div>
          ) : (
            <div className={gridPresentation.gridClassName}>
              {myItems.length > 0 ? (
                demandPagination.items.map((item) => {
                  const status = resolveStatusLabel(item)
                  const keyword = encodeURIComponent(`${item.sceneName} ${item.requiredDataResourceName}`.trim())
                  return (
                    <div
                      key={item.id}
                      className="flex h-full flex-col rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4 shadow-[var(--shadow-soft)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[0.75rem] text-[var(--text-muted)]">{item.sceneName}</div>
                          <div className="mt-1 text-[0.9375rem] font-medium text-[var(--text-main)]">{item.requiredDataResourceName}</div>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[0.6875rem] ${status === '已接入' ? 'bg-[var(--status-info-bg)] text-[var(--status-info-text)]' : 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'}`}>
                          {status}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[0.75rem] text-[var(--text-muted)]">
                        <span>期望频次：{item.dataFrequencyDemandName || '未填写'}</span>
                        <span>关联资源：{item.linkedResourceNames.length > 0 ? item.linkedResourceNames.length : 0} 条</span>
                      </div>
                      <div className="mt-3 rounded-[10px] bg-[var(--surface-muted)] px-3 py-3 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
                        {item.demandDescription || item.mainDataItems || '暂无描述'}
                      </div>
                      <div className="mt-3 flex-1 text-[0.75rem] leading-6 text-[var(--text-muted)]">
                        {item.linkedResourceNames.length > 0 ? `关联资源：${item.linkedResourceNames.join('、')}` : '当前尚未关联目录资源。'}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Link to={`/demand?keyword=${keyword}`} className={gridPresentation.actionButtonClassName}>
                          搜索该需求
                        </Link>
                        {item.linkedResourceIds[0] ? (
                          <Link to={`/catalog/${item.linkedResourceIds[0]}`} className={gridPresentation.actionButtonClassName}>
                            查看关联资源
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="flex h-full flex-col rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4 shadow-[var(--shadow-soft)]">
                  <div className="text-[0.75rem] text-[var(--text-muted)]">我的供需对接</div>
                  <div className="mt-2 text-[0.9375rem] font-medium text-[var(--text-main)]">当前账号暂无供需对接登记记录</div>
                  <div className="mt-3 flex-1 text-[0.75rem] leading-6 text-[var(--text-secondary)]">可前往供需对接信息页补录，后续会在这里按卡片列表分页展示。</div>
                  <div className="mt-4 flex items-center gap-3">
                    <Link to="/demand" className={gridPresentation.actionButtonClassName}>
                      前往供需对接信息
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )
        ) : activeSection === 'linked' ? (
          isLoadingCenterData ? (
            <div className="rounded-[10px] bg-[var(--surface-muted)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">正在加载授权资源...</div>
          ) : (
            <div className={gridPresentation.gridClassName}>
              {authorizedResources.length > 0 ? (
                linkedPagination.items.map((item) => (
                  <div
                    key={item.resourceId}
                    className="flex h-full flex-col rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4 shadow-[var(--shadow-soft)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[0.75rem] text-[var(--text-muted)]">授权资源</div>
                        <Link to={`/catalog/${item.resourceId}`} className="mt-1 block text-[0.9375rem] font-medium text-[var(--text-main)] hover:text-[var(--primary)]">
                          {item.resourceName}
                        </Link>
                      </div>
                      <span className="rounded-full bg-[var(--status-info-bg)] px-2 py-1 text-[0.6875rem] text-[var(--status-info-text)]">
                        关联 {item.sceneCount} 个场景
                      </span>
                    </div>
                    <div className="mt-3 flex-1 text-[0.75rem] leading-6 text-[var(--text-secondary)]">来源供需对接：{item.sceneNames.join('、')}</div>
                    <div className="mt-4 flex items-center gap-3">
                      <Link
                        to={`/catalog/${item.resourceId}`}
                        className={gridPresentation.actionButtonClassName}
                      >
                        查看详情
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex h-full flex-col rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4 shadow-[var(--shadow-soft)]">
                  <div className="text-[0.75rem] text-[var(--text-muted)]">授权给我的数据资源</div>
                  <div className="mt-2 text-[0.9375rem] font-medium text-[var(--text-main)]">当前账号暂无授权资源</div>
                  <div className="mt-3 flex-1 text-[0.75rem] leading-6 text-[var(--text-secondary)]">已通过供需对接授权的数据资源，会在这里按资源卡片的方式统一展示。</div>
                  <div className="mt-4 flex items-center gap-3">
                    <Link to="/catalog" className={gridPresentation.actionButtonClassName}>
                      前往资源目录
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          <div className={gridPresentation.gridClassName}>
            {appPagination.items.map((item) => (
              <div
                key={item.id}
                className="flex h-full flex-col rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4 shadow-[var(--shadow-soft)]"
              >
                <div className="text-[0.75rem] text-[var(--text-muted)]">我的应用</div>
                <div className="mt-2 text-[0.9375rem] font-medium text-[var(--text-main)]">{item.title}</div>
                <div className="mt-3 flex-1 text-[0.75rem] leading-6 text-[var(--text-secondary)]">{item.description}</div>
                <div className="mt-4 flex items-center gap-3">
                  <button type="button" disabled className={gridPresentation.actionButtonClassName}>
                    待建设
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex flex-col gap-3 border-t border-[var(--line-soft)] pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-[0.75rem] text-[var(--text-muted)]">
            当前第 <span className="font-semibold text-[var(--primary)]">{activePagination.safePage}</span> / {activePagination.totalPages} 页，每页 {gridPresentation.pageSize} 张卡片，共 {activeSectionCardCount} 张
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(Math.max(1, activePagination.safePage - 1))}
              disabled={activePagination.safePage === 1}
              className="inline-flex h-9 items-center rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] text-[var(--text-secondary)] transition hover:border-[rgba(var(--theme-soft-rgb),0.16)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一页
            </button>
            <div className="flex items-center overflow-hidden rounded-[10px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[0_8px_20px_rgba(39,80,120,0.05)]">
              {paginationItems.map((item, index) =>
                item === 'ellipsis' ? (
                  <span
                    key={`ellipsis-${activePagination.safePage}-${index}`}
                    className="inline-flex h-9 min-w-10 items-center justify-center px-3 text-[0.8125rem] text-[var(--text-muted)]"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCurrentPage(item)}
                    className={
                      item === activePagination.safePage
                        ? 'relative inline-flex h-9 min-w-10 items-center justify-center bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-3 text-[0.8125rem] font-semibold text-white'
                        : 'inline-flex h-9 min-w-10 items-center justify-center px-3 text-[0.8125rem] text-[var(--text-secondary)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]'
                    }
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage(Math.min(activePagination.totalPages, activePagination.safePage + 1))}
              disabled={activePagination.safePage === activePagination.totalPages}
              className="inline-flex h-9 items-center rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] text-[var(--text-secondary)] transition hover:border-[rgba(var(--theme-soft-rgb),0.16)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
