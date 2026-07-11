import { Binary, ScrollText, Tags } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { cn } from '../lib/utils'

const accessControlSecondaryNavItems = [
  { id: 'classification', label: '数据分类分级', path: '/security-governance/access-control/classification', icon: Tags },
  { id: 'policy-engine', label: '策略引擎配置', path: '/security-governance/access-control/policy-engine', icon: Binary },
  { id: 'audit-log', label: '日志链路审计', path: '/security-governance/audit/log-query', icon: ScrollText },
]

function resolveActiveView(pathname: string) {
  if (pathname.includes('/audit/log-query')) return 'audit-log'
  if (pathname.includes('/policy-engine')) return 'policy-engine'
  return 'classification'
}

export function AccessControlSecondaryTabs({ actions }: { actions?: ReactNode }) {
  const location = useLocation()
  const activeView = resolveActiveView(location.pathname)
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <nav
        aria-label="访问控制管理二级导航"
        className="inline-flex flex-wrap gap-2 rounded-[18px] border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[color-mix(in_srgb,var(--surface-glass)_92%,transparent)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur"
      >
        {accessControlSecondaryNavItems.map((item) => {
          const active = activeView === item.id

          return (
            <Link
              key={item.id}
              to={withEmbed(item.path)}
              className={cn(
                'inline-flex min-h-11 items-center gap-3 whitespace-nowrap rounded-[14px] px-4 py-3 text-[0.875rem] font-medium transition',
                active
                  ? 'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] !text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.20)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]',
              )}
            >
              <item.icon className={cn('h-4 w-4', active ? '!text-white' : '')} />
              <span className={active ? '!text-white' : ''}>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      {actions ? <div className="flex flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
    </div>
  )
}
