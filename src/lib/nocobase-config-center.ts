import { useEffect, useState } from 'react'
import { nocobaseBrowserAuthClient, resolveNocobasePublicAssetUrl } from './nocobase-client'

type PublicConfigValueResponse = {
  data?: {
    value?: unknown
  }
}

type PublicConfigImageValue = {
  id?: number
  title?: string
  filename?: string
  url?: string
  preview?: string
}

const SITE_TITLE_STORAGE_KEY = 'JL_ECO_SERVICE_SITE_TITLE'
const SITE_LOGO_STORAGE_KEY = 'JL_ECO_SERVICE_SITE_LOGO'
const SITE_BACKGROUND_STORAGE_KEY = 'JL_ECO_SERVICE_SITE_BACKGROUND'
export const DEFAULT_PORTAL_SITE_TITLE = '电网数据安全管控平台'

let cachedPortalSiteTitle: string | null | undefined
let cachedPortalSiteLogo: PublicConfigImageValue | null | undefined
let cachedPortalSiteBackground: PublicConfigImageValue | null | undefined
let portalSiteTitlePromise: Promise<string> | null = null
let portalSiteLogoPromise: Promise<PublicConfigImageValue | null> | null = null
let portalSiteBackgroundPromise: Promise<PublicConfigImageValue | null> | null = null

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function readStoredPortalSiteTitle() {
  if (typeof window === 'undefined') return ''
  return normalizeText(window.localStorage.getItem(SITE_TITLE_STORAGE_KEY))
}

function persistPortalSiteTitle(value: string) {
  if (typeof window === 'undefined' || !value) return
  window.localStorage.setItem(SITE_TITLE_STORAGE_KEY, value)
}

function normalizePortalLogo(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const record = value as PublicConfigImageValue
  const url = normalizePortalLogoUrl(record.url || record.preview || '')
  return url ? { ...record, url } : null
}

function normalizePortalLogoUrl(value: unknown) {
  const rawUrl = normalizeText(value)
  if (!rawUrl) return ''

  if (rawUrl.startsWith('/')) {
    return resolveNocobasePublicAssetUrl(rawUrl)
  }

  if (!/^https?:\/\//i.test(rawUrl)) {
    return rawUrl
  }

  try {
    const url = new URL(rawUrl)

    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      if (url.port === '9100') {
        return ''
      }

      if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}${url.pathname}${url.search}${url.hash}`
      }
    }

    return url.toString()
  } catch {
    return ''
  }
}

function readStoredPortalImage(storageKey: string) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? normalizePortalLogo(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function persistPortalImage(storageKey: string, value: PublicConfigImageValue | null) {
  if (typeof window === 'undefined') return
  if (!value) {
    window.localStorage.removeItem(storageKey)
    return
  }
  window.localStorage.setItem(storageKey, JSON.stringify(value))
}

export function getPortalSiteTitleFallback() {
  return readStoredPortalSiteTitle() || cachedPortalSiteTitle || DEFAULT_PORTAL_SITE_TITLE
}

export function getPortalSiteLogoFallback() {
  return readStoredPortalImage(SITE_LOGO_STORAGE_KEY) || cachedPortalSiteLogo || null
}

export async function fetchPortalSiteTitle() {
  if (cachedPortalSiteTitle !== undefined) {
    return cachedPortalSiteTitle || DEFAULT_PORTAL_SITE_TITLE
  }

  const storedTitle = readStoredPortalSiteTitle()
  if (storedTitle) {
    cachedPortalSiteTitle = storedTitle
  }

  if (portalSiteTitlePromise) {
    return portalSiteTitlePromise
  }

  portalSiteTitlePromise = (async () => {
    try {
      const response = await nocobaseBrowserAuthClient.resource('jcConfigCenter').publicGetValue({
        values: {
          moduleKey: 'portal',
          groupKey: 'appearance',
          key: 'site_title',
        },
      })

      const payload = response.data as PublicConfigValueResponse | undefined
      const resolvedTitle = normalizeText(payload?.data?.value) || storedTitle || DEFAULT_PORTAL_SITE_TITLE
      cachedPortalSiteTitle = resolvedTitle
      persistPortalSiteTitle(resolvedTitle)
      return resolvedTitle
    } catch {
      cachedPortalSiteTitle = storedTitle || DEFAULT_PORTAL_SITE_TITLE
      return cachedPortalSiteTitle
    } finally {
      portalSiteTitlePromise = null
    }
  })()

  return portalSiteTitlePromise
}

export async function fetchPortalSiteLogo() {
  const storedLogo = readStoredPortalImage(SITE_LOGO_STORAGE_KEY)

  if (portalSiteLogoPromise) {
    return portalSiteLogoPromise
  }

  portalSiteLogoPromise = (async () => {
    try {
      const response = await nocobaseBrowserAuthClient.resource('jcConfigCenter').publicGetValue({
        values: {
          moduleKey: 'portal',
          groupKey: 'appearance',
          key: 'site_logo',
        },
      })

      const payload = response.data as PublicConfigValueResponse | undefined
      const resolvedLogo = normalizePortalLogo(payload?.data?.value) || storedLogo || null
      cachedPortalSiteLogo = resolvedLogo
      persistPortalImage(SITE_LOGO_STORAGE_KEY, resolvedLogo)
      return resolvedLogo
    } catch {
      cachedPortalSiteLogo = storedLogo || cachedPortalSiteLogo || null
      return cachedPortalSiteLogo
    } finally {
      portalSiteLogoPromise = null
    }
  })()

  return portalSiteLogoPromise
}

export async function fetchPortalSiteBackground() {
  const storedBackground = readStoredPortalImage(SITE_BACKGROUND_STORAGE_KEY)

  if (portalSiteBackgroundPromise) {
    return portalSiteBackgroundPromise
  }

  portalSiteBackgroundPromise = (async () => {
    try {
      const response = await nocobaseBrowserAuthClient.resource('jcConfigCenter').publicGetValue({
        values: {
          moduleKey: 'portal',
          groupKey: 'appearance',
          key: 'site_background',
        },
      })

      const payload = response.data as PublicConfigValueResponse | undefined
      const resolvedBackground = normalizePortalLogo(payload?.data?.value)
      cachedPortalSiteBackground = resolvedBackground
      persistPortalImage(SITE_BACKGROUND_STORAGE_KEY, resolvedBackground)
      return resolvedBackground
    } catch {
      cachedPortalSiteBackground = storedBackground || cachedPortalSiteBackground || null
      return cachedPortalSiteBackground
    } finally {
      portalSiteBackgroundPromise = null
    }
  })()

  return portalSiteBackgroundPromise
}

export function usePortalSiteTitle(enabled: boolean) {
  const [siteTitle, setSiteTitle] = useState(() => getPortalSiteTitleFallback())

  useEffect(() => {
    if (!enabled) {
      setSiteTitle(getPortalSiteTitleFallback())
      return
    }

    let cancelled = false

    void fetchPortalSiteTitle().then((value) => {
      if (!cancelled) {
        setSiteTitle(value || DEFAULT_PORTAL_SITE_TITLE)
      }
    })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return siteTitle || DEFAULT_PORTAL_SITE_TITLE
}

export function usePortalSiteLogo(enabled: boolean) {
  const [siteLogo, setSiteLogo] = useState<PublicConfigImageValue | null>(() => getPortalSiteLogoFallback())

  useEffect(() => {
    if (!enabled) {
      setSiteLogo(getPortalSiteLogoFallback())
      return
    }

    let cancelled = false

    void fetchPortalSiteLogo().then((value) => {
      if (!cancelled) {
        setSiteLogo(value || null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return siteLogo
}

export function usePortalSiteBackground(enabled: boolean) {
  const [siteBackground, setSiteBackground] = useState<PublicConfigImageValue | null>(() =>
    readStoredPortalImage(SITE_BACKGROUND_STORAGE_KEY) || cachedPortalSiteBackground || null,
  )

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    void fetchPortalSiteBackground().then((value) => {
      if (!cancelled) {
        setSiteBackground(value || null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return siteBackground
}
