const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}

export type PortalAccessMode = 'demo-auto' | 'auth'

function normalizeEnvToken(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .split(/[\s:：]+/, 1)[0]
}

export function normalizePortalAccessMode(value: string | null | undefined): PortalAccessMode {
  const normalizedToken = normalizeEnvToken(value)

  return normalizedToken === 'auth' ? 'auth' : 'demo-auto'
}

export function normalizePortalPasswordSignInEnabled(value: string | null | undefined): boolean {
  const normalizedToken = normalizeEnvToken(value)

  if (!normalizedToken) {
    return true
  }

  return !['0', 'false', 'off', 'no'].includes(normalizedToken)
}

export const PORTAL_ACCESS_MODE: PortalAccessMode =
  normalizePortalAccessMode(env.VITE_PORTAL_ACCESS_MODE ?? 'auth')

export const PORTAL_DEMO_AUTO_SIGN_IN_ENABLED = PORTAL_ACCESS_MODE === 'demo-auto'

export const PORTAL_PASSWORD_SIGN_IN_ENABLED =
  normalizePortalPasswordSignInEnabled(env.VITE_PORTAL_PASSWORD_LOGIN_ENABLED)

export const PORTAL_DEMO_ACCOUNT =
  env.VITE_PORTAL_DEMO_ACCOUNT?.trim() || 'admin@nocobase.com'

export const PORTAL_DEMO_PASSWORD =
  env.VITE_PORTAL_DEMO_PASSWORD?.trim() || 'admin123'
