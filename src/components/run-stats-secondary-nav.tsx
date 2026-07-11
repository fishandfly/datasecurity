import { Activity, BarChart3, FileText } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

type RunStatsSecondaryNavItem = {
  key: string
  label: string
  to: string
  icon: LucideIcon
}

const RUN_STATS_SECONDARY_NAV_ITEMS: RunStatsSecondaryNavItem[] = [
  { key: 'analysis', label: '运行统计分析', to: '/run-stats', icon: BarChart3 },
  { key: 'report', label: '运行分析报告', to: '/run-stats/report', icon: FileText },
  { key: 'operations', label: '数据运维信息', to: '/run-stats/operations', icon: Activity },
]

type RunStatsSecondaryNavProps = {
  withEmbed: (path: string) => string
}

export function RunStatsSecondaryNav({ withEmbed }: RunStatsSecondaryNavProps) {
  const location = useLocation()

  return (
    <nav
      aria-label="数据运行统计二级导航"
      className="inline-flex flex-wrap gap-2 rounded-[18px] border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[color-mix(in_srgb,var(--surface-glass)_92%,transparent)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur"
    >
      {RUN_STATS_SECONDARY_NAV_ITEMS.map((item) => (
        <Link
          key={item.key}
          to={withEmbed(item.to)}
          className={`inline-flex min-w-[9rem] items-center gap-2 rounded-[14px] px-4 py-3 text-[0.875rem] font-medium transition ${
            location.pathname === item.to
              ? 'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] !text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.20)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]'
          }`}
        >
          <item.icon
            className={`h-4 w-4 shrink-0 ${location.pathname === item.to ? '!text-white' : ''}`}
          />
          <span className={location.pathname === item.to ? '!text-white' : ''}>{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}
