import {
  Braces,
  Calculator,
  Database,
  FileCheck2,
  FileOutput,
  KeyRound,
  UploadCloud,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { cn } from '../lib/utils'

export type SecurityModuleId = 'resources' | 'services' | 'ingest' | 'tags' | 'access' | 'homomorphic'

type SecurityModuleTab = {
  label: string
  path: string
  icon: LucideIcon
}

const moduleTabs: Record<SecurityModuleId, SecurityModuleTab[]> = {
  resources: [],
  services: [
    { label: '数据服务通道', path: '/security-governance/resources/apis', icon: Braces },
  ],
  ingest: [
    { label: '数据源', path: '/security-governance/ingest/sources', icon: Database },
    { label: '校验规则', path: '/security-governance/ingest/validation-rules', icon: FileCheck2 },
  ],
  tags: [],
  access: [
    { label: '数据应用', path: '/security-governance/access/subjects', icon: Users },
    { label: '策略发布', path: '/security-governance/access/publish', icon: UploadCloud },
  ],
  homomorphic: [
    { label: '密钥管理', path: '/security-governance/homomorphic/keys', icon: KeyRound },
    { label: '同态任务', path: '/security-governance/homomorphic/tasks', icon: Calculator },
    { label: '计算结果', path: '/security-governance/homomorphic/results', icon: FileOutput },
  ],
}

export function SecurityModuleTabs({ module, actions }: { module: SecurityModuleId; actions?: ReactNode }) {
  const location = useLocation()
  const withEmbed = (path: string) => appendEmbedToPath(path, readEmbedMode(location.search))

  return (
    <div className="flex min-w-0 flex-col gap-3 border-b border-[var(--line)] pb-3 xl:flex-row xl:items-center xl:justify-between">
      <nav aria-label="二级导航" className="flex min-w-0 gap-1 overflow-x-auto rounded-[8px] bg-[var(--surface-muted)] p-1">
        {moduleTabs[module].map((item) => {
          const active = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={withEmbed(item.path)}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 rounded-[6px] px-3 text-[0.8125rem] font-medium transition',
                active
                  ? 'bg-[var(--surface)] text-[var(--primary)] shadow-[var(--shadow-soft)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:shrink-0 xl:justify-end">{actions}</div> : null}
    </div>
  )
}
