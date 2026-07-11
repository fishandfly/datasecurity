import { APIClient } from '@nocobase/sdk'

type ImportMetaEnvLike = {
  DEV?: boolean
  MODE?: string
} & Record<string, string | boolean | undefined>

type RuntimeConfigLike = {
  VITE_NOCOBASE_API_BASE_URL?: string
  VITE_NOCOBASE_BROWSER_API_BASE_URL?: string
  VITE_NOCOBASE_BROWSER_AUTH_BASE_URL?: string
}

const env = (import.meta as { env?: ImportMetaEnvLike }).env ?? {}

function readEnvText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readConfigText(value: unknown) {
  return readEnvText(value)
}

function getRuntimeConfig() {
  if (typeof window === 'undefined') {
    return {}
  }

  return (window as Window & { __JL_ECO_SERVICE_RUNTIME_CONFIG__?: RuntimeConfigLike })
    .__JL_ECO_SERVICE_RUNTIME_CONFIG__ ?? {}
}

export const NOCOBASE_AUTHENTICATOR =
  readEnvText(env.VITE_NOCOBASE_AUTHENTICATOR) || 'basic'

const runtimeConfig = getRuntimeConfig()
const configuredBaseUrl =
  readConfigText(runtimeConfig.VITE_NOCOBASE_API_BASE_URL) || readEnvText(env.VITE_NOCOBASE_API_BASE_URL)
const configuredBrowserApiBaseUrl =
  readConfigText(runtimeConfig.VITE_NOCOBASE_BROWSER_API_BASE_URL) ||
  readEnvText(env.VITE_NOCOBASE_BROWSER_API_BASE_URL)
const configuredBrowserAuthBaseUrl =
  readConfigText(runtimeConfig.VITE_NOCOBASE_BROWSER_AUTH_BASE_URL) ||
  readEnvText(env.VITE_NOCOBASE_BROWSER_AUTH_BASE_URL)
const isDevMode = env.DEV === true || readEnvText(env.MODE) === 'development'
const defaultBrowserApiBasePath = isDevMode ? '/api/' : '/data-catalog-manage/api/'

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`
}

function resolveBrowserBaseUrl(configuredUrl?: string) {
  if (configuredUrl) {
    return ensureTrailingSlash(configuredUrl)
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${defaultBrowserApiBasePath}`
  }

  return defaultBrowserApiBasePath
}

function normalizeApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return resolveBrowserBaseUrl(configuredBrowserApiBaseUrl)
  }

  if (!configuredBaseUrl) {
    return 'http://localhost:8196/api/'
  }

  return ensureTrailingSlash(configuredBaseUrl)
}

function normalizeBrowserAuthBaseUrl() {
  if (configuredBrowserAuthBaseUrl) {
    return ensureTrailingSlash(configuredBrowserAuthBaseUrl)
  }

  if (configuredBrowserApiBaseUrl) {
    return ensureTrailingSlash(configuredBrowserApiBaseUrl)
  }

  return resolveBrowserBaseUrl()
}

function resolveSignInBaseUrl() {
  if (configuredBrowserAuthBaseUrl) {
    return ensureTrailingSlash(configuredBrowserAuthBaseUrl)
  }

  if (configuredBrowserApiBaseUrl) {
    return ensureTrailingSlash(configuredBrowserApiBaseUrl)
  }

  if (configuredBaseUrl) {
    return ensureTrailingSlash(configuredBaseUrl)
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${defaultBrowserApiBasePath}`
  }

  return 'http://localhost:8196/api/'
}

function stripApiSuffix(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '')

  if (!normalized || normalized === '/') {
    return ''
  }

  if (normalized === '/api') {
    return ''
  }

  if (normalized.endsWith('/api')) {
    return normalized.slice(0, -4)
  }

  return normalized
}

export function resolveNocobasePublicAssetUrl(value: string) {
  const rawUrl = readEnvText(value)
  if (!rawUrl || !rawUrl.startsWith('/')) {
    return rawUrl
  }

  const baseUrl = new URL(
    normalizeBrowserAuthBaseUrl(),
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost',
  )
  const assetUrl = new URL(rawUrl, baseUrl.origin)
  const pathnameBase = stripApiSuffix(baseUrl.pathname)

  assetUrl.pathname = `${pathnameBase}${assetUrl.pathname}`.replace(/\/{2,}/g, '/')
  return assetUrl.toString()
}

function getStoragePrefix() {
  const baseUrl = normalizeApiBaseUrl()
  const url = new URL(baseUrl)
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  return `JL_ECO_SERVICE_${port}_`
}

function isSessionValidationRequest(url?: string | null) {
  const normalizedUrl = String(url ?? '').trim()
  return normalizedUrl === 'auth:check'
}

export const nocobaseClient = new APIClient({
  baseURL: normalizeApiBaseUrl(),
  storageType: 'localStorage',
  storagePrefix: getStoragePrefix(),
  shareToken: false,
})

// Detect a 401 from the generic backend session check and dispatch a custom
// event so the auth hook can clear the cached token.
if (typeof window !== 'undefined') {
  nocobaseClient.axios.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const requestUrl =
        error &&
        typeof error === 'object' &&
        'config' in error &&
        error.config &&
        typeof error.config === 'object' &&
        'url' in error.config
          ? (error.config as { url?: string | null }).url
          : null
      const status =
        error &&
        typeof error === 'object' &&
        'response' in error &&
        error.response &&
        typeof error.response === 'object' &&
        'status' in error.response
          ? (error.response as { status: number }).status
          : null
      if (status === 401 && nocobaseClient.auth.token && isSessionValidationRequest(requestUrl)) {
        window.dispatchEvent(new CustomEvent('auth:session-expired'))
      }
      return Promise.reject(error)
    },
  )
}

export const nocobaseBrowserAuthClient = new APIClient({
  baseURL: normalizeBrowserAuthBaseUrl(),
  withCredentials: true,
  storageType: 'memory',
  storagePrefix: 'JL_ECO_SERVICE_BROWSER_AUTH_',
  shareToken: false,
})

export function buildNocobaseSignInUrl(redirect?: string | null) {
  const target = new URL(
    resolveSignInBaseUrl(),
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost',
  )
  const pathnameBase = stripApiSuffix(target.pathname)

  target.pathname = `${pathnameBase}/signin`
  target.search = ''
  target.hash = ''

  if (typeof redirect === 'string' && redirect.trim()) {
    target.searchParams.set('redirect', redirect.trim())
  }

  return target.toString()
}

export function toErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data &&
    typeof error.response.data === 'object'
  ) {
    const payload = error.response.data as
      | { errors?: Array<{ message?: string }>; error?: { message?: string } }
      | null

    if (payload?.errors?.[0]?.message) {
      return payload.errors[0].message
    }

    if (payload?.error?.message) {
      return payload.error.message
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}
