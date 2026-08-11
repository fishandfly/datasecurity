import { Bell, Check, Gauge, Palette, Search, UserCircle } from 'lucide-react'
import { useLayoutEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AI_ASSISTANT_OPEN_EVENT, AiAssistantWidget } from '../components/ai-assistant-widget'
import { ScrollToTop } from '../components/scroll-to-top'
import { SecurityComponentSidebar } from '../components/security-component-sidebar'
import { canManageCatalogResources } from '../lib/admin-role'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { buildGlobalSearchPath, readGlobalSearchKeyword } from '../lib/global-search'
import { DEFAULT_PORTAL_SITE_TITLE, usePortalSiteBackground, usePortalSiteLogo } from '../lib/nocobase-config-center'
import { PORTAL_AI_ASSISTANT_ENABLED } from '../lib/portal-feature-flags'
import { usePortalContext } from '../lib/portal-context'
import { fontSizeModeOptions, normalizeFontSizeMode, normalizeThemeMode, themeModeOptions, type FontSizeMode, type ThemeMode } from '../lib/theme-mode'
import { cn } from '../lib/utils'
import defaultLogo from '../assets/logo.png'

const themeModeToneClasses: Record<ThemeMode, string> = {
  blue: 'bg-[linear-gradient(135deg,#1d74f5,#59a8ff)]',
  green: 'bg-[linear-gradient(135deg,#1d9c67,#7adf92)]',
  'blue-white': 'bg-[linear-gradient(135deg,#3b82f6,#d9eafe)]',
  dark: 'bg-[linear-gradient(135deg,#1f2937,#64748b)]',
}

const componentConfigPrefixes = [
  '/security-governance/ingest',
  '/security-governance/access',
  '/security-governance/homomorphic',
  '/security-governance/tags',
]

function isPrimaryNavigationActive(pathname: string, target: string, isActive: boolean) {
  if (target === '/security-governance/dashboard') return pathname === target
  if (target === '/security-governance/resources/catalog') {
    return pathname === target || /^\/security-governance\/resources\/(?!apis(?:\/|$))/.test(pathname)
  }
  if (target === '/security-governance/logs') return pathname === target || pathname.startsWith('/security-governance/risks')
  if (target === '/security-governance/components') {
    return pathname === target || componentConfigPrefixes.some((prefix) => pathname.startsWith(prefix))
  }
  return isActive
}

export function ServiceLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, session, siteTitle, primaryNavigations } = usePortalContext()
  const siteLogo = usePortalSiteLogo(!location.pathname.startsWith('/login'))
  const siteBackground = usePortalSiteBackground(true)
  const globalKeyword = readGlobalSearchKeyword(location.pathname, location.search)
  const resolvedSiteTitle = siteTitle || DEFAULT_PORTAL_SITE_TITLE
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'blue-white'
    return normalizeThemeMode(window.localStorage.getItem('service-theme-mode'))
  })
  const [fontSizeMode, setFontSizeMode] = useState<FontSizeMode>(() => {
    if (typeof window === 'undefined') return 'standard'
    return normalizeFontSizeMode(window.localStorage.getItem('service-font-size-mode'))
  })
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false)
  const isEmbedMode = readEmbedMode(location.search)
  const canOpenAdminApps = canManageCatalogResources(session?.user.roles)
  const showComponentSidebar = componentConfigPrefixes.some((prefix) => location.pathname.startsWith(prefix))

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeMode
    window.localStorage.setItem('service-theme-mode', themeMode)
  }, [themeMode])

  useLayoutEffect(() => {
    document.documentElement.dataset.fontSize = fontSizeMode
    window.localStorage.setItem('service-font-size-mode', fontSizeMode)
  }, [fontSizeMode])

  useLayoutEffect(() => {
    const handleAiAssistantOpenChange = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>
      setIsAiAssistantOpen(Boolean(customEvent.detail))
    }

    window.addEventListener(AI_ASSISTANT_OPEN_EVENT, handleAiAssistantOpenChange as EventListener)
    return () => {
      window.removeEventListener(AI_ASSISTANT_OPEN_EVENT, handleAiAssistantOpenChange as EventListener)
    }
  }, [])

  useLayoutEffect(() => {
    document.title = resolvedSiteTitle
  }, [resolvedSiteTitle])

  useLayoutEffect(() => {
    if (siteBackground?.url) {
      document.documentElement.style.setProperty('--portal-background-image', `url(${JSON.stringify(siteBackground.url)})`)
    } else {
      document.documentElement.style.removeProperty('--portal-background-image')
    }

    return () => {
      document.documentElement.style.removeProperty('--portal-background-image')
    }
  }, [siteBackground?.url])

  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)

  const handleGlobalSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const keyword = String(formData.get('keyword') ?? '')
    navigate(withEmbed(buildGlobalSearchPath(keyword)))
  }

  return (
    <div className="min-h-screen text-[var(--text-main)]">
      <ScrollToTop />
      {!isEmbedMode ? (
        <div className="relative border-b border-[var(--line)] bg-transparent shadow-[var(--shadow-soft)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.96),transparent)]" />
          <div
            className={cn(
              'mx-auto flex min-h-[86px] w-[90vw] max-w-[1720px] flex-wrap items-center justify-between gap-4 px-4 py-4 transition-[padding-right,transform] duration-300 ease-out',
              !isEmbedMode && location.pathname !== '/login' && isAiAssistantOpen
                ? 'xl:pr-[min(30rem,30vw)] xl:-translate-x-3'
                : 'pr-4 translate-x-0',
            )}
          >
            <Link to={withEmbed('/')} className="flex min-w-0 items-center gap-3">
              <img src={siteLogo?.url || defaultLogo} alt="Logo" className="h-10 w-auto sm:h-[48px]" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <span className="relative inline-flex min-w-0 items-center pb-[1px] leading-none">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 translate-y-[1px] whitespace-normal text-[1.25rem] font-[800] leading-6 tracking-[0.018em] text-[var(--brand-title-ghost)] sm:whitespace-nowrap sm:text-[2rem] sm:leading-none [font-family:'Microsoft YaHei','PingFang SC','Hiragino Sans GB','Heiti SC','SimHei',sans-serif]"
                    >
                      {resolvedSiteTitle}
                    </span>
                    <span
                      className="relative whitespace-normal text-[1.25rem] font-[800] leading-6 tracking-[0.018em] text-[var(--brand-title-main)] sm:whitespace-nowrap sm:text-[2rem] sm:leading-none [font-family:'Microsoft YaHei','PingFang SC','Hiragino Sans GB','Heiti SC','SimHei',sans-serif]"
                      style={{ textShadow: 'var(--brand-title-shadow)' }}
                    >
                      {resolvedSiteTitle}
                    </span>
                  </span>
                </div>
              </div>
            </Link>
            <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
              <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto sm:flex-nowrap">
                <form
                  key={`global-search:${location.pathname}:${location.search}`}
                  className="group flex h-12 w-full min-w-0 items-center gap-2 rounded-[999px] border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_92%,transparent),color-mix(in_srgb,var(--surface-soft)_96%,transparent))] px-2 pl-3 text-left text-[var(--text-secondary)] shadow-[var(--shadow-soft)] backdrop-blur transition hover:-translate-y-[1px] hover:border-[rgba(var(--theme-soft-rgb),0.32)] hover:shadow-[var(--shadow-medium)] sm:w-[320px] sm:min-w-[320px] sm:gap-3 sm:px-3 sm:pl-4 lg:w-[380px] xl:w-[450px]"
                  onSubmit={(event) => {
                    handleGlobalSearch(event)
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary-soft)_82%,var(--surface))] text-[var(--primary)]">
                      <Search className="h-4 w-4 transition group-hover:scale-110" />
                    </span>
                    <input
                      name="keyword"
                      type="search"
                      defaultValue={globalKeyword}
                      className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                      placeholder="搜索安全档案、字段策略、血缘节点或风险关键词"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-9 shrink-0 items-center rounded-full bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-3 text-[0.8125rem] font-medium text-white shadow-[0_12px_24px_rgba(var(--theme-strong-rgb),0.20)] sm:px-4"
                  >
                    安全检索
                  </button>
                </form>
                <Link
                  to={withEmbed('/personal-center')}
                  className="inline-flex h-10 items-center gap-2 rounded-[999px] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_84%,transparent)] px-4 text-[0.8125rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)] backdrop-blur transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  <UserCircle className="h-4 w-4" />
                  {isAuthenticated ? (session?.user.nickname ?? '个人中心') : '个人中心'}
                </Link>
                <button
                  type="button"
                  aria-label="消息通知"
                  className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_84%,transparent)] text-[var(--text-secondary)] shadow-[var(--shadow-soft)] backdrop-blur transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[0.6875rem] font-semibold leading-5 text-white">
                    12
                  </span>
                </button>
                {canOpenAdminApps ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href="/admin"
                      className="inline-flex h-10 items-center gap-2 rounded-[999px] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_84%,transparent)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] shadow-[var(--shadow-soft)] backdrop-blur transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      <Gauge className="h-4 w-4" />
                      控制台
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!isEmbedMode ? (
        <header className="relative border-y border-[var(--top-nav-border)] bg-[linear-gradient(180deg,var(--top-nav-bg-start),var(--top-nav-bg-end))] shadow-[0_14px_30px_var(--top-nav-shadow)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--top-nav-top-line),transparent)]" />
          <nav
            className={cn(
              'mx-auto flex w-[90vw] max-w-[1720px] items-center overflow-x-auto px-4 transition-[padding-right,transform] duration-300 ease-out',
              !isEmbedMode && location.pathname !== '/login' && isAiAssistantOpen
                ? 'xl:pr-[min(30rem,30vw)] xl:-translate-x-3'
                : 'pr-4 translate-x-0',
            )}
          >
            {primaryNavigations.map((item) => (
              <NavLink
                key={item.key}
                to={withEmbed(item.target)}
                end={item.target === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-[3.375rem] min-w-[8.625rem] shrink-0 items-center justify-center gap-[0.625rem] whitespace-nowrap px-4 text-[0.9375rem] font-semibold !text-[var(--top-nav-text)] transition hover:bg-[var(--top-nav-item-hover-bg)] hover:!text-[var(--top-nav-text)]',
                    isPrimaryNavigationActive(location.pathname, item.target, isActive) &&
                      'bg-[var(--top-nav-item-active-bg)] font-semibold !text-[var(--top-nav-text)] after:absolute after:bottom-0 after:left-1/2 after:h-[0.1875rem] after:w-[3.5rem] after:-translate-x-1/2 after:rounded-full after:bg-[var(--top-nav-item-active-line)] before:absolute before:bottom-[0.625rem] before:left-1/2 before:h-[1.75rem] before:w-[5rem] before:-translate-x-1/2 before:rounded-full before:bg-[radial-gradient(circle,var(--top-nav-item-active-glow),transparent_72%)]',
                  )
                }
              >
                <item.icon className="h-[1.125rem] w-[1.125rem] !text-[var(--top-nav-text)]" />
                <span className="!text-[var(--top-nav-text)]">{item.title}</span>
              </NavLink>
            ))}
          </nav>
        </header>
      ) : null}

      <main
        className={cn(
          'mx-auto w-[90vw] max-w-[1720px] px-4 pb-12 pt-6 transition-[padding-right,transform,filter] duration-300 ease-out',
          !isEmbedMode && location.pathname !== '/login' && isAiAssistantOpen
            ? 'xl:pr-[min(30rem,30vw)] xl:-translate-x-3'
            : 'pr-4 translate-x-0',
        )}
      >
        {showComponentSidebar ? (
          <div className="grid min-w-0 gap-5 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
            <SecurityComponentSidebar />
            <div className="min-w-0">
              <Outlet />
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {!isEmbedMode && location.pathname !== '/login' && PORTAL_AI_ASSISTANT_ENABLED ? <AiAssistantWidget /> : null}

      <div
        className="fixed bottom-4 right-4 z-40 lg:bottom-5 lg:right-5"
        onMouseEnter={() => setIsThemeMenuOpen(true)}
        onMouseLeave={() => setIsThemeMenuOpen(false)}
        onFocusCapture={() => setIsThemeMenuOpen(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsThemeMenuOpen(false)
          }
        }}
      >
        <div
          className={cn(
            'flex items-start justify-end rounded-[22px] transition-[width,padding,box-shadow,background-color,border-color] duration-300 ease-out',
            isThemeMenuOpen
              ? 'w-[520px] max-w-[calc(100vw-1.5rem)] overflow-hidden border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-glass)_94%,transparent)] px-1.5 py-1 shadow-[var(--shadow-medium)] backdrop-blur-md'
              : 'w-auto overflow-visible border border-transparent bg-transparent px-0 py-0 shadow-none backdrop-blur-0',
          )}
        >
          <button
            type="button"
            aria-label="切换主题颜色"
            aria-expanded={isThemeMenuOpen}
            onClick={() => setIsThemeMenuOpen((current) => !current)}
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition',
              isThemeMenuOpen
                ? 'border-[rgba(var(--theme-soft-rgb),0.22)] bg-[rgba(var(--theme-soft-rgb),0.14)] text-[var(--primary)]'
                : 'border-transparent bg-[rgba(var(--theme-soft-rgb),0.10)] text-[var(--text-muted)] hover:bg-[rgba(var(--theme-soft-rgb),0.16)] hover:text-[var(--primary)]',
            )}
          >
            <Palette className="h-4 w-4" />
          </button>

          <div
            className={cn(
              'overflow-hidden transition-all duration-300 ease-out',
              isThemeMenuOpen ? 'ml-2 max-w-[460px] opacity-100' : 'ml-0 max-w-0 opacity-0',
            )}
          >
            <div className="flex flex-col gap-2 py-1 pr-1">
              <div className="flex items-center gap-1 rounded-full border border-[rgba(var(--theme-soft-rgb),0.12)] bg-[rgba(var(--theme-soft-rgb),0.06)] px-1 py-1">
                <span className="px-2 text-[0.6875rem] font-medium whitespace-nowrap text-[var(--text-muted)]">显示风格</span>
                {themeModeOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    tabIndex={isThemeMenuOpen ? 0 : -1}
                    onClick={() => {
                      setThemeMode(value)
                      setIsThemeMenuOpen(false)
                    }}
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[0.6875rem] font-medium whitespace-nowrap transition',
                      themeMode === value
                        ? 'border-[rgba(var(--theme-soft-rgb),0.28)] bg-[rgba(var(--theme-soft-rgb),0.16)] text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(var(--theme-strong-rgb),0.14)]'
                        : 'border-transparent text-[var(--text-muted)] hover:border-[rgba(var(--theme-soft-rgb),0.18)] hover:bg-[rgba(var(--theme-soft-rgb),0.08)] hover:text-[var(--primary)]',
                    )}
                  >
                    <span className={cn('h-2.5 w-2.5 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.36)]', themeModeToneClasses[value])} />
                    <span>{label}</span>
                    {themeMode === value ? <Check className="h-3 w-3" /> : null}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 rounded-full border border-[rgba(var(--theme-soft-rgb),0.12)] bg-[rgba(var(--theme-soft-rgb),0.06)] px-1 py-1">
                <span className="px-2 text-[0.6875rem] font-medium whitespace-nowrap text-[var(--text-muted)]">字体大小</span>
                {fontSizeModeOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    tabIndex={isThemeMenuOpen ? 0 : -1}
                    onClick={() => {
                      setFontSizeMode(value)
                      setIsThemeMenuOpen(false)
                    }}
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[0.6875rem] font-medium whitespace-nowrap transition',
                      fontSizeMode === value
                        ? 'border-[rgba(var(--theme-soft-rgb),0.28)] bg-[rgba(var(--theme-soft-rgb),0.16)] text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(var(--theme-strong-rgb),0.14)]'
                        : 'border-transparent text-[var(--text-muted)] hover:border-[rgba(var(--theme-soft-rgb),0.18)] hover:bg-[rgba(var(--theme-soft-rgb),0.08)] hover:text-[var(--primary)]',
                    )}
                  >
                    <span>{label}</span>
                    {fontSizeMode === value ? <Check className="h-3 w-3" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
