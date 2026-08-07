import { DatabaseZap, LockKeyhole, Shield, Tags } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { cn } from '../lib/utils'

const componentNavigations = [
  { label: '接入校验', path: '/security-governance/ingest/sources', prefix: '/security-governance/ingest', icon: DatabaseZap },
  { label: '访问策略', path: '/security-governance/access/publish', prefix: '/security-governance/access', icon: Shield },
  { label: '同态加密', path: '/security-governance/homomorphic/tasks', prefix: '/security-governance/homomorphic', icon: LockKeyhole },
  { label: '分类标签', path: '/security-governance/tags/catalog', prefix: '/security-governance/tags', icon: Tags },
]

export function SecurityComponentSidebar() {
  const location = useLocation()
  const isEmbedMode = readEmbedMode(location.search)

  return (
    <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
      <div className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <div className="text-[0.75rem] font-medium text-[var(--text-muted)]">安全能力</div>
          <div className="mt-1 text-[0.9375rem] font-semibold text-[var(--text-main)]">组件配置</div>
        </div>
        <nav aria-label="组件配置二级导航" className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
          {componentNavigations.map((item) => {
            const active = location.pathname.startsWith(item.prefix)
            return (
              <NavLink
                key={item.path}
                to={appendEmbedToPath(item.path, isEmbedMode)}
                className={cn(
                  'relative flex h-11 min-w-[8.75rem] shrink-0 items-center gap-3 rounded-[6px] px-3 text-[0.8125rem] font-medium transition lg:min-w-0',
                  active
                    ? 'bg-[var(--primary-soft)] text-[var(--primary)] before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-r-full before:bg-[var(--primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]',
                )}
              >
                <item.icon className="h-[1.125rem] w-[1.125rem] shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
