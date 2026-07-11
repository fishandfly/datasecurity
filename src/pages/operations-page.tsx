import { useMemo } from 'react'
import { 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  Database, 
  FileWarning, 
  Layers, 
  ZapOff 
} from 'lucide-react'
import { ScenicPanel } from '../components/ui'
import { RunStatsSecondaryNav } from '../components/run-stats-secondary-nav'
import { usePortalContext } from '../lib/portal-context'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import type { CatalogItem } from '../lib/nocobase-portal-data'

export function OperationsPage() {
  const { data, isLoading } = usePortalContext()
  const isEmbedMode = typeof window !== 'undefined' ? readEmbedMode(window.location.search) : false
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const items = data.catalogItems

  const stats = useMemo(() => {
    const totalResources = items.length
    const totalVolume = items.reduce((sum: number, item: CatalogItem) => sum + (item.countValue || 0), 0)
    const orgs = new Set(items.map((i: CatalogItem) => i.departmentId).filter(Boolean))
    const categories = new Set(items.map((i: CatalogItem) => i.categoryId).filter(Boolean))
    const activeResources = items.filter((i: CatalogItem) => i.usageCount > 0).length
    
    // Identified as problem if data volume is 0 and it's not an API (which might have count elsewhere)
    const problemResources = items.filter((i: CatalogItem) => (i.countValue || 0) === 0 && i.supplyMethod !== 'API')

    return {
      totalResources,
      totalVolume,
      totalOrgs: orgs.size,
      totalCategories: categories.size,
      activeResources,
      problemResources: problemResources.length,
      problemItems: problemResources.slice(0, 10)
    }
  }, [items])

  const resolutionStats = useMemo(() => [
    { label: '活跃资源数', value: stats.activeResources, unit: '个', color: 'text-[var(--status-success-text)]' },
    { label: '异常资源数', value: stats.problemResources, unit: '个', color: 'text-[var(--status-warning-text)]' },
    { label: '接入机构数', value: stats.totalOrgs, unit: '家', color: 'text-[var(--text-secondary)]' },
    { label: '资源活跃率', value: items.length > 0 ? ((stats.activeResources / items.length) * 100).toFixed(1) : '0', unit: '%', color: 'text-[var(--primary)]' },
  ], [stats, items.length])

  const updateFreqDistribution = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach((item: CatalogItem) => {
      const cycle = item.updateCycle || '不定期'
      counts[cycle] = (counts[cycle] || 0) + 1
    })
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4)
  }, [items])

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="animate-pulse font-medium text-[var(--text-muted)]">正在同步后台实时运行数据...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4 text-[var(--text-main)]">
      <RunStatsSecondaryNav withEmbed={withEmbed} />
      <ScenicPanel className="overflow-hidden border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] px-6 py-6 shadow-[var(--shadow-elevated)]">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.8125rem] font-medium text-[var(--status-info-text)]">
              <BarChart3 className="h-3.5 w-3.5" />
              数据的运行统计
            </div>
            <h2 className="mt-4 text-[2rem] font-bold tracking-tight text-[var(--text-main)]">
              全省生态环境数据资产概览
            </h2>
            <p className="mt-3 max-w-[800px] text-[0.9375rem] leading-7 text-[var(--text-secondary)]">
              基于后台实时同步全省生态环境数据资源的运行状态。
              涵盖 {stats.totalOrgs} 家机构，涉及 {stats.totalCategories} 个业务领域，累计管理数据资产量达 {stats.totalVolume.toLocaleString('zh-CN')} 条。
            </p>
          </div>
          <div className="flex items-center gap-4">
            {resolutionStats.map(stat => (
              <div key={stat.label} className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] px-6 py-4 shadow-[var(--shadow-soft)] backdrop-blur">
                <div className="text-xs font-medium text-[var(--text-muted)]">{stat.label}</div>
                <div className={`mt-1 text-2xl font-bold ${stat.color}`}>
                  {stat.value}
                  <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">{stat.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScenicPanel>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        {/* 数据更新频次 */}
        <section className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-6 shadow-[var(--shadow-soft)]">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-[var(--text-main)]">
              <Clock className="h-5 w-5 text-[var(--primary)]" />
              数据更新频次分布
            </div>
            <span className="text-xs text-[var(--text-muted)]">基于 {items.length} 个资源项统计</span>
          </div>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {updateFreqDistribution.map((item, idx) => (
              <div key={item.label} className="flex flex-col items-center text-center">
                <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-raised)]">
                  <svg className="h-full w-full -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="transparent"
                      className="text-[var(--surface-outline)]"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="transparent"
                      strokeDasharray={176}
                      strokeDashoffset={176 - (176 * item.value) / items.length}
                      className={[
                        'text-blue-500',
                        'text-emerald-500',
                        'text-indigo-500',
                        'text-amber-500',
                      ][idx % 4]}
                    />
                  </svg>
                  <span className="absolute text-sm font-bold text-[var(--text-main)]">
                    {Math.round((item.value / items.length) * 100)}%
                  </span>
                </div>
                <div className="text-xs font-bold text-[var(--text-secondary)]">{item.label}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">{item.value} 个资源</div>
              </div>
            ))}
          </div>
        </section>

        {/* 决策建议 */}
        <section className="rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-6 shadow-[var(--shadow-soft)]">
           <div className="mb-4 flex items-center gap-2 font-bold text-[var(--text-main)]">
             <Layers className="h-5 w-5 text-[var(--primary)]" />
             资源服务占比
           </div>
           <div className="space-y-4">
              <DistributionBar label="库表交换" value={items.filter((i: CatalogItem) => i.supplyMethod === '数据库').length} total={items.length} color="bg-blue-500" />
              <DistributionBar label="接口服务" value={items.filter((i: CatalogItem) => i.supplyMethod === 'API' || i.apiCount > 0).length} total={items.length} color="bg-emerald-500" />
              <DistributionBar label="离线文件" value={items.filter((i: CatalogItem) => i.supplyMethod === '文件').length} total={items.length} color="bg-amber-500" />
           </div>
           <div className="mt-6 rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-raised)] p-4">
             <div className="text-xs font-bold text-[var(--text-main)]">统计口径说明</div>
             <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
               统计数据每 10 分钟自动从后台同步。数据量计算包含历史存量与实时增量。活跃度基于过去 30 天内的数据调用记录。
             </p>
           </div>
        </section>
      </div>

      {/* 实时问题资源监控清单 */}
      <section className="overflow-hidden rounded-2xl border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between border-b border-[var(--line-soft)] bg-[var(--table-header-bg)] px-6 py-4">
           <div className="flex items-center gap-2 font-bold text-[var(--text-main)]">
             <FileWarning className="h-5 w-5 text-[var(--status-warning-text)]" />
             实时问题资源监控清单
           </div>
           <div className="text-xs text-[var(--text-muted)]">
             共发现 {stats.problemResources} 个疑似异常资源
           </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--line-soft)] bg-[var(--table-header-bg-alt)] text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-6 py-3 font-semibold">资源名称</th>
                <th className="px-6 py-3 font-semibold">异常类型</th>
                <th className="px-6 py-3 font-semibold">责任机构</th>
                <th className="px-6 py-3 font-semibold">更新周期</th>
                <th className="px-6 py-3 font-semibold text-right">数据量</th>
                <th className="px-6 py-3 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-soft)]">
              {stats.problemItems.map((item: CatalogItem) => (
                <tr key={item.id} className="group transition hover:bg-[var(--table-row-hover)]">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-[var(--text-muted)]" />
                      <span className="text-xs font-bold text-[var(--text-main)]">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2.5 py-1 text-[0.625rem] font-bold text-[var(--status-warning-text)]">
                      <ZapOff className="h-3 w-3" />
                      数据断流
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-[var(--text-secondary)]">{item.department}</td>
                  <td className="px-6 py-4 text-xs text-[var(--text-secondary)]">{item.updateCycle}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-[var(--text-main)]">{item.count}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-xs font-bold text-[var(--primary)] hover:text-[var(--primary-strong)]">诊断</button>
                    <span className="mx-2 text-[var(--line)]">|</span>
                    <button className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)]">详情</button>
                  </td>
                </tr>
              ))}
              {stats.problemItems.length === 0 && (
                <tr>
                   <td colSpan={6} className="py-12 text-center text-[var(--text-muted)]">
                      <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-[var(--status-success-border)]" />
                      暂无疑似异常资源，数据运行状况良好。
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function DistributionBar({ label, value, total, color }: { label: string, value: number, total: number, color: string }) {
  const percentage = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[0.6875rem] font-bold">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="text-[var(--text-muted)]">{value} 个 ({percentage.toFixed(1)}%)</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div 
          className={`h-full ${color} transition-all duration-500`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
