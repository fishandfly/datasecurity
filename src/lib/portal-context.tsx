import { createContext, useContext, useMemo } from 'react'
import type { PropsWithChildren } from 'react'
import { useLocation } from 'react-router-dom'
import { usePortalNavigations } from './nocobase-portal-navigation'
import { usePortalSiteTitle } from './nocobase-config-center'
import { clearPortalDataCache, usePortalCatalogData } from './nocobase-portal-data'
import { useNocoAuthSession } from './nocobase-auth'
import { useProductSolution } from './product-modules'

type PortalContextValue = ReturnType<typeof usePortalState>

const PortalContext = createContext<PortalContextValue | null>(null)

function usePortalState() {
  const auth = useNocoAuthSession()
  const location = useLocation()
  const appPathname = location.pathname.replace(/^\/data-catalog/, '') || '/'
  const productConfig = useProductSolution(location.search)
  const siteTitle = usePortalSiteTitle(!auth.isBootstrapping)
  const navigationConfig = usePortalNavigations(true, productConfig.enabledModuleIds)
  const portalDataMode = appPathname === '/security-governance'
    || appPathname === '/security-governance/dashboard'
    || appPathname === '/security-governance/resources'
    || appPathname === '/'
    ? 'list'
    : 'full'
  const authRequired = !auth.autoSignInEnabled
  const shouldLoadPortalCatalogData = (appPathname === '/security-governance' || appPathname.startsWith('/security-governance/'))
    && appPathname !== '/personal-center'
    && !auth.isBootstrapping
    && (!authRequired || auth.isAuthenticated)
  const portalData = usePortalCatalogData(shouldLoadPortalCatalogData, portalDataMode)
  const signIn = async (account: string, password: string, authenticatorName?: string) => {
    clearPortalDataCache()
    return auth.signIn(account, password, authenticatorName)
  }
  const startExternalSignIn = async (
    authenticator: Parameters<typeof auth.startExternalSignIn>[0],
    redirectTo: string,
  ) => {
    clearPortalDataCache()
    return auth.startExternalSignIn(authenticator, redirectTo)
  }
  const completeSignInFromUrl = async (urlLike: string) => {
    clearPortalDataCache()
    return auth.completeSignInFromUrl(urlLike)
  }
  const signOut = async () => {
    clearPortalDataCache()
    await auth.signOut()
  }

  return useMemo(
    () => ({
      ...auth,
      signIn,
      startExternalSignIn,
      completeSignInFromUrl,
      signOut,
      siteTitle,
      ...productConfig,
      ...navigationConfig,
      ...portalData,
      authRequired,
      clearDataCache: clearPortalDataCache,
    }),
    [auth, authRequired, navigationConfig, portalData, productConfig, signIn, startExternalSignIn, completeSignInFromUrl, signOut, siteTitle],
  )
}

export function PortalProvider({ children }: PropsWithChildren) {
  const value = usePortalState()
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortalContext() {
  const context = useContext(PortalContext)

  if (!context) {
    throw new Error('usePortalContext must be used within PortalProvider')
  }

  return context
}
