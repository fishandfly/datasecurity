export type PublicAuthenticatorPayload = {
  name: string
  authType?: string | null
  authTypeTitle?: string | null
  title?: string | null
  options?: Record<string, unknown> | null
}

export type PasswordPortalAuthenticator = PublicAuthenticatorPayload & {
  kind: 'password'
  label: string
}

export type ExternalPortalAuthenticator = PublicAuthenticatorPayload & {
  kind: 'external'
  label: string
  actionResource: string
}

export type PublicAuthenticatorSplit = {
  passwordAuthenticators: PasswordPortalAuthenticator[]
  externalAuthenticators: ExternalPortalAuthenticator[]
  defaultPasswordAuthenticator: PasswordPortalAuthenticator | null
}

const DEFAULT_PORTAL_REDIRECT = '/'
const DEFAULT_LOGIN_PATH = '/data-catalog/login'

function normalizeAppPath(path: string, fallback: string) {
  const trimmed = path.trim()

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback
  }

  if (trimmed.length === 1) {
    return trimmed
  }

  return trimmed.replace(/\/+$/, '')
}

function isPasswordAuthenticator(payload: PublicAuthenticatorPayload) {
  const authType = payload.authType?.trim() ?? ''
  const authTypeTitle = payload.authTypeTitle?.trim() ?? ''

  return /password/i.test(authType) || /password/i.test(authTypeTitle) || payload.name === 'basic'
}

function normalizeLabelCandidate(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || trimmed.includes('{{')) {
    return ''
  }

  return trimmed
}

function resolveAuthenticatorLabel(payload: PublicAuthenticatorPayload) {
  return (
    normalizeLabelCandidate(payload.title) ||
    normalizeLabelCandidate(payload.authTypeTitle) ||
    normalizeLabelCandidate(payload.authType) ||
    payload.name
  )
}

export function normalizePortalRedirectPath(
  redirectTo?: string | null,
  fallback = DEFAULT_PORTAL_REDIRECT,
) {
  if (typeof redirectTo !== 'string') {
    return fallback
  }

  const trimmed = redirectTo.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback
  }

  return trimmed
}

export function splitPublicAuthenticators(
  payloads: PublicAuthenticatorPayload[],
): PublicAuthenticatorSplit {
  const passwordAuthenticators: PasswordPortalAuthenticator[] = []
  const externalAuthenticators: ExternalPortalAuthenticator[] = []

  for (const payload of payloads) {
    const normalizedPayload = {
      ...payload,
      authType: payload.authType?.trim() ?? '',
      authTypeTitle: payload.authTypeTitle?.trim() ?? '',
      title: payload.title?.trim() ?? '',
    }

    if (isPasswordAuthenticator(normalizedPayload)) {
      passwordAuthenticators.push({
        ...normalizedPayload,
        kind: 'password',
        label: resolveAuthenticatorLabel(normalizedPayload),
      })
      continue
    }

    externalAuthenticators.push({
      ...normalizedPayload,
      kind: 'external',
      label: resolveAuthenticatorLabel(normalizedPayload),
      actionResource: normalizedPayload.authType || 'auth',
    })
  }

  return {
    passwordAuthenticators,
    externalAuthenticators,
    defaultPasswordAuthenticator:
      passwordAuthenticators.find((item) => item.name === 'basic') ?? passwordAuthenticators[0] ?? null,
  }
}

export function buildAuthCallbackPath({
  loginPath = DEFAULT_LOGIN_PATH,
  redirectTo,
}: {
  loginPath?: string
  redirectTo?: string | null
}) {
  const path = normalizeAppPath(loginPath, DEFAULT_LOGIN_PATH)
  const params = new URLSearchParams({
    redirectTo: normalizePortalRedirectPath(redirectTo),
  })

  return `${path}?${params.toString()}`
}

export function parseAuthCallback(urlLike: string) {
  const url = new URL(urlLike, 'http://localhost')
  const token = url.searchParams.get('token')?.trim() ?? ''

  if (!token) {
    return null
  }

  const authenticator = url.searchParams.get('authenticator')?.trim() ?? ''
  const redirectTo = normalizePortalRedirectPath(url.searchParams.get('redirectTo'))
  url.searchParams.delete('token')
  url.searchParams.delete('authenticator')

  const cleanQuery = url.searchParams.toString()
  const cleanPath = `${url.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${url.hash}`

  return {
    token,
    authenticator,
    redirectTo,
    cleanPath,
  }
}
