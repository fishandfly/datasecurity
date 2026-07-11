import { Link, useLocation } from 'react-router-dom'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { getDefaultCatalogTabs, usePortalNavigations, type PortalCatalogTabId } from '../lib/nocobase-portal-navigation'
import { ALL_PRODUCT_MODULE_IDS } from '../lib/product-modules'
import { usePortalContext } from '../lib/portal-context'

export function DataProductCatalogTabs({ activeId }: { activeId: PortalCatalogTabId }) {
  const location = useLocation()
  const { isBootstrapping } = usePortalContext()
  const { navigations, catalogTabs } = usePortalNavigations(!isBootstrapping, ALL_PRODUCT_MODULE_IDS)
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const hasCatalogNavigation = navigations.some((item) => item.target === '/catalog')
  const resolvedCatalogTabs = catalogTabs.length > 0 || hasCatalogNavigation ? catalogTabs : getDefaultCatalogTabs()
  const visibleTabs = resolvedCatalogTabs.filter((tab) => tab.visibleInTabs)

  return (
    <div className="inline-flex flex-wrap gap-2 rounded-[18px] border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[color-mix(in_srgb,var(--surface-glass)_92%,transparent)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
      {visibleTabs.map((tab) => {
        const isActive = tab.id === activeId
        const Icon = tab.icon

        return (
          <Link
            key={tab.id}
            to={isActive ? `${location.pathname}${location.search}` : withEmbed(tab.href)}
            className={`inline-flex min-w-[9rem] items-center gap-2 rounded-[14px] px-4 py-3 text-[0.875rem] font-medium transition ${
              isActive
                ? 'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] !text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.20)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]'
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${isActive ? '!text-white' : ''}`} />
            <span className={isActive ? '!text-white' : ''}>{tab.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
