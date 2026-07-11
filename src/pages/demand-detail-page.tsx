import { ArrowRight, Database, Globe, Workflow } from 'lucide-react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { useMemo } from 'react'
import { ScenicPanel, TopicPill } from '../components/ui'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { usePortalDemandCatalogData } from '../lib/nocobase-demand-data'
import { usePortalContext } from '../lib/portal-context'
import { getCategoryIcon } from '../lib/category-helper'

export function DemandDetailPage() {
  const location = useLocation()
  const { id } = useParams()
  const { data: demandData, isLoading: isDemandLoading } = usePortalDemandCatalogData(true)
  const { data: portalData, isLoading: isPortalLoading } = usePortalContext()
  const { demandItems = [] } = demandData || {}
  const { catalogItems = [] } = portalData || {}
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)

  const item = demandItems.find((entry) => entry.id === id)

  // 1. 同领域数据需求推荐 (排除自身，基于分类谱系推荐)
  const linkedDemands = useMemo(() => {
    if (!item || demandItems.length === 0) return []

    const scored = demandItems
      .filter((d) => String(d.id) !== String(item.id) && d.name !== item.name)
      .map((demand) => {
        let score = 0
        
        // 分类路径权重规则
        if (String(demand.categoryId) === String(item.categoryId)) {
          score += 500 // 同二级/三级分类
        } else if (item.categoryAncestorIds.includes(String(demand.categoryId))) {
          // 推荐父、祖父分类
          const distance = item.categoryAncestorIds.length - 1 - item.categoryAncestorIds.indexOf(String(demand.categoryId))
          score += Math.max(0, 400 - distance * 100)
        } else if (demand.categoryAncestorIds?.includes(String(item.categoryId))) {
          // 推荐子、孙分类
          const distance = demand.categoryAncestorIds.length - 1 - demand.categoryAncestorIds.indexOf(String(item.categoryId))
          score += Math.max(0, 400 - distance * 100)
        }

        // 辅助因子
        if (score > 0) {
          if (demand.refSource === item.refSource) score += 50
          if (demand.updateCycle === item.updateCycle) score += 20
        }

        return { demand, score }
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)

    const uniqueMap = new Map<string, typeof scored[0]>()
    for (const s of scored) {
      if (!uniqueMap.has(s.demand.name)) {
        uniqueMap.set(s.demand.name, s)
      }
    }
    return Array.from(uniqueMap.values()).slice(0, 6)
  }, [item, demandItems])

  // 2. 关联资源推荐 (基于领域分类 + 标题模糊相似度)
  const matchedResources = useMemo(() => {
    if (!item || !catalogItems.length) return []

    const scored = catalogItems.map((resource) => {
      let score = 0
      
      // 领域匹配
      if (String(resource.categoryId) === String(item.categoryId)) {
        score += 1000
      } else if (item.categoryAncestorIds.includes(String(resource.categoryId))) {
        score += 300
      } else if (resource.categoryAncestorIds?.includes(String(item.categoryId))) {
        score += 300
      }

      // 标题模糊匹配
      const itemName = (item.name || '').trim()
      const resName = (resource.name || '').trim()
      
      if (resName === itemName) {
        score += 2000
      } else {
        const itemChars = new Set(itemName.split(''))
        const resChars = resName.split('')
        let matchCount = 0
        resChars.forEach(c => {
          if (itemChars.has(c)) matchCount++
        })
        
        const overlapRatio = matchCount / Math.max(itemName.length, resName.length)
        if (overlapRatio > 0.3) {
          score += Math.floor(overlapRatio * 1500)
        }

        // 关键词加分
        const keywords = itemName.split(/[\s、，,;；]+/).filter(k => k.length >= 2)
        keywords.forEach(kw => {
          if (resName.includes(kw)) score += 300
        })
      }
      
      return { resource, score }
    })

    return scored
      .filter((s) => s.score > 200)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8) 
  }, [item, catalogItems])

  // 3. 同场景数据需求
  const sameSceneDemands = useMemo(() => {
    if (!item || !demandItems.length) return []
    return demandItems
      .filter((d) => d.sceneName === item.sceneName && String(d.id) !== String(item.id))
      .slice(0, 6)
  }, [item, demandItems])

  // 4. 相同参考来源
  const sameSourceDemands = useMemo(() => {
    if (!item || !demandItems.length) return []
    return demandItems
      .filter((d) => d.refSource === item.refSource && String(d.id) !== String(item.id))
      .slice(0, 6)
  }, [item, demandItems])

  if (isDemandLoading || isPortalLoading) {
    return <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载需求详情...</div>
  }

  if (!item) {
    return <Navigate to={withEmbed('/demand-catalog')} replace />
  }

  const detailRows = [
    ['需求领域', item.category, '更新周期', item.updateCycle],
    ['参考来源', item.refSource, '需求状态', '已发布'],
    ['场景名称', item.sceneName, ''],
    ['详细描述', item.description, ''],
  ]

  return (
    <div className="space-y-4">
      <ScenicPanel className="overflow-hidden border-[rgba(209,223,235,0.96)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,247,251,0.95))] p-0 shadow-[var(--shadow-elevated)]">
        <div className="px-6 py-8 flex justify-between items-center gap-8">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Link
                to={withEmbed(`/demand-catalog?categoryNode=${item.categoryId}`)}
                className="transition hover:opacity-80"
              >
                <TopicPill className="flex items-center gap-1 border-[#bfdaee] bg-white text-[var(--primary)] text-[0.6875rem] uppercase tracking-wider transition hover:bg-blue-50">
                  <span className="scale-90">{getCategoryIcon(item.category)}</span>
                  {item.category}
                </TopicPill>
              </Link>
              <TopicPill className="border-[#dce6ef] bg-white text-[0.6875rem]">{item.updateCycle}</TopicPill>
            </div>
            <h1 className="max-w-[900px] text-[2rem] font-bold leading-tight text-[#1a2b3b]">
              {item.name}
            </h1>
            <div className="mt-4 flex items-center gap-2 text-[0.875rem] text-[var(--text-secondary)]">
              <Workflow className="h-4 w-4 text-indigo-500" />
              <span className="font-medium">业务场景：</span>
              <Link
                to={withEmbed(`/demand-catalog?keyword=${encodeURIComponent(item.sceneName)}`)}
                className="rounded-md bg-indigo-50 px-2 py-0.5 text-indigo-600 transition hover:bg-indigo-100"
              >
                {item.sceneName}
              </Link>
            </div>
          </div>

          <div className="shrink-0">
            <Link 
              to={withEmbed('/demand')}
              state={{ 
                prefill: { 
                  title: item.name, 
                  description: item.description, 
                  useCase: item.sceneName,
                  resourceId: matchedResources[0]?.resource.id,
                  resourceName: matchedResources[0]?.resource.name
                } 
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-7 py-3.5 text-[0.9375rem] font-semibold !text-white shadow-[0_10px_25px_rgba(37,99,235,0.3)] transition hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0"
            >
              <span className="!text-white">登记场景需求</span>
              <ArrowRight className="h-4 w-4 !text-white" />
            </Link>
          </div>
        </div>
      </ScenicPanel>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* 需求属性 */}
          <div className="rounded-[12px] border border-[rgba(212,225,235,0.96)] bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-2">
              <div className="h-5 w-1 bg-[var(--primary)] rounded-full" />
              <h2 className="text-[1.125rem] font-semibold text-[#24384d]">需求属性</h2>
            </div>
            
            <div className="overflow-hidden rounded-[10px] border border-[var(--line-soft)]">
              {detailRows.map((row, index) => (
                <div
                  key={index}
                  className="grid border-b border-[var(--line-soft)] last:border-b-0 md:grid-cols-[120px_1fr_120px_1fr]"
                >
                  <div className="bg-[#f8fbfe] px-4 py-4 text-[0.8125rem] font-medium text-[var(--text-secondary)]">
                    {row[0]}
                  </div>
                  <div className={`px-4 py-4 text-[0.875rem] leading-relaxed text-[#304255] ${!row[2] ? 'md:col-span-3' : ''}`}>
                    {row[1]}
                  </div>
                  {row[2] && (
                    <>
                      <div className="border-t border-[var(--line-soft)] bg-[#f8fbfe] px-4 py-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] md:border-l md:border-t-0">
                        {row[2]}
                      </div>
                      <div className="border-t border-[var(--line-soft)] px-4 py-4 text-[0.875rem] leading-relaxed text-[#304255] md:border-t-0">
                        {row[3]}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 同领域数据需求 */}
          {linkedDemands.length > 0 && (
            <div className="rounded-[12px] border border-[rgba(212,225,235,0.96)] bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-2">
                <div className="h-5 w-1 bg-blue-600 rounded-full" />
                <h2 className="text-[1.125rem] font-semibold text-[#24384d]">同领域数据需求</h2>
                <span className="text-[0.75rem] text-[var(--text-muted)] ml-1">谱系推荐</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {linkedDemands.map((link) => (
                  <Link
                    key={link.demand.id}
                    to={withEmbed(`/demand-catalog/${link.demand.id}`)}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-blue-100/50 bg-[#f8fbff] p-4 transition hover:border-blue-300 hover:bg-white hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-blue-500">{getCategoryIcon(link.demand.category)}</span>
                        <Link
                          to={withEmbed(`/demand-catalog?categoryNode=${link.demand.categoryId}`)}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[0.6875rem] font-medium text-blue-600 uppercase tracking-wider hover:underline"
                        >
                          {link.demand.category}
                        </Link>
                      </div>
                      <h3 className="text-[1.0625rem] font-bold text-[#2c3e50] line-clamp-2 transition group-hover:text-blue-700">
                        {link.demand.name}
                      </h3>
                      <p className="mt-2 text-[0.75rem] text-[var(--text-muted)] line-clamp-1">
                        {link.demand.refSource} · {link.demand.updateCycle}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-dashed border-blue-100">
                      <span className="text-[0.6875rem] font-medium text-blue-600/70">领域链条推荐</span>
                      <span className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-blue-600">
                        详情 <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 同场景数据需求 */}
          {sameSceneDemands.length > 0 && (
            <div className="rounded-[12px] border border-[rgba(212,225,235,0.96)] bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-2">
                <div className="h-5 w-1 bg-blue-600 rounded-full" />
                <h2 className="text-[1.125rem] font-semibold text-[#24384d]">同场景数据需求</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {sameSceneDemands.map((demand) => (
                  <Link
                    key={demand.id}
                    to={withEmbed(`/demand-catalog/${demand.id}`)}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-blue-100/50 bg-[#f8fbff] p-4 transition hover:border-blue-300 hover:bg-white hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-blue-500">{getCategoryIcon(demand.category)}</span>
                        <Link
                          to={withEmbed(`/demand-catalog?categoryNode=${demand.categoryId}`)}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[0.6875rem] font-medium text-blue-600 uppercase tracking-wider hover:underline"
                        >
                          {demand.category}
                        </Link>
                      </div>
                      <h3 className="text-[1.0625rem] font-bold text-[#2c3e50] line-clamp-2 transition group-hover:text-blue-600">
                        {demand.name}
                      </h3>
                      <p className="mt-2 text-[0.75rem] text-[var(--text-muted)] line-clamp-2">
                        {demand.description}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-dashed border-blue-100">
                      <span className="text-[0.6875rem] text-[var(--text-muted)]">{demand.updateCycle}</span>
                      <span className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-blue-600">
                        查看详情 <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 相同参考来源 */}
          {sameSourceDemands.length > 0 && (
            <div className="rounded-[12px] border border-[rgba(212,225,235,0.96)] bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-2">
                <div className="h-5 w-1 bg-blue-600 rounded-full" />
                <h2 className="text-[1.125rem] font-semibold text-[#24384d]">相同参考来源</h2>
                <span className="text-[0.75rem] text-[var(--text-muted)] ml-1">来源单位：{item.refSource}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {sameSourceDemands.map((demand) => (
                  <Link
                    key={demand.id}
                    to={withEmbed(`/demand-catalog/${demand.id}`)}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-blue-100/50 bg-[#f8fbff] p-4 transition hover:border-blue-300 hover:bg-white hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Globe className="h-3.5 w-3.5 text-blue-500" />
                        <Link
                          to={withEmbed(`/demand-catalog?source=${encodeURIComponent(demand.refSource)}`)}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[0.6875rem] font-medium text-blue-600 hover:underline"
                        >
                          {demand.refSource}
                        </Link>
                      </div>
                      <h3 className="text-[1.0625rem] font-bold text-[#203346] line-clamp-2 transition group-hover:text-blue-700">
                        {demand.name}
                      </h3>
                      <p className="mt-2 text-[0.75rem] text-[var(--text-muted)] line-clamp-2">
                        {demand.description}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-dashed border-blue-100">
                      <span className="flex items-center gap-1 text-[0.6875rem] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                        <span className="scale-75">{getCategoryIcon(demand.category)}</span>
                        {demand.category}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-blue-600">
                        查看详情 <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {/* 数据资源推荐 */}
          <div className="rounded-[12px] border border-[rgba(212,225,235,0.96)] bg-[linear-gradient(180deg,#fff,#f8fafd)] p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[1rem] font-semibold text-[#24384d]">数据资源推荐</h2>
              <span className="text-[0.75rem] text-[var(--text-muted)]">智能匹配 {matchedResources.length} 项</span>
            </div>
            <div className="space-y-3">
              {matchedResources.length > 0 ? (
                matchedResources.map((resItem, idx) => (
                  <Link
                    key={idx}
                    to={withEmbed(`/catalog/${resItem.resource.id}`)}
                    className="group block relative overflow-hidden rounded-[10px] border border-[#e2e8f0] bg-white p-3 transition hover:border-blue-200 hover:shadow-md"
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500 transition group-hover:bg-blue-500 group-hover:text-white">
                        <Database className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-[0.9375rem] font-semibold text-[#2c3e50] truncate group-hover:text-blue-600">
                            {resItem.resource.name}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[0.6875rem] text-[var(--text-muted)]">
                          <span className="truncate max-w-[120px]">{resItem.resource.department}</span>
                          <span className="inline-flex items-center gap-0.5 text-blue-600 group-hover:underline">
                            资源详情 <ArrowRight className="h-2.5 w-2.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-[10px] bg-[#f0f4f8] py-6 text-center text-[0.75rem] text-[var(--text-muted)]">
                  暂未匹配到高度相关的目录资源
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
