import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildAuthCallbackPath,
  parseAuthCallback,
  splitPublicAuthenticators,
  type ExternalPortalAuthenticator,
  type PublicAuthenticatorPayload,
  type PublicAuthenticatorSplit,
} from './nocobase-auth-flow'
import {
  NOCOBASE_AUTHENTICATOR,
  nocobaseBrowserAuthClient,
  nocobaseClient,
  toErrorMessage,
} from './nocobase-client'
import {
  PORTAL_ACCESS_MODE,
  PORTAL_DEMO_ACCOUNT,
  PORTAL_DEMO_AUTO_SIGN_IN_ENABLED,
  PORTAL_DEMO_PASSWORD,
} from './portal-auth-mode'

export type AuthUser = {
  id: number
  nickname: string
  username: string
  email: string
  roles: string[]
}

export type AuthSession = {
  token: string
  authenticator: string
  user: AuthUser
}

const PORTAL_ACCESS_MODE_STORAGE_KEY = `${nocobaseClient.storagePrefix}PORTAL_ACCESS_MODE`

type AuthCheckPayload = {
  data: {
    id: number
    nickname?: string | null
    username?: string | null
    email?: string | null
    roles?: Array<{ name?: string | null }>
  }
}

type PublicAuthenticatorListPayload =
  | {
      data?: PublicAuthenticatorPayload[]
    }
  | PublicAuthenticatorPayload[]

function sanitizeUser(payload: AuthCheckPayload['data']) {
  return {
    id: payload.id,
    nickname: payload.nickname ?? payload.username ?? '目录服务用户',
    username: payload.username ?? '',
    email: payload.email ?? '',
    roles: (payload.roles ?? []).map((role) => role.name ?? '').filter(Boolean),
  } satisfies AuthUser
}

function buildFallbackPublicAuthenticators() {
  if (NOCOBASE_AUTHENTICATOR !== 'basic') {
    return splitPublicAuthenticators([])
  }

  return splitPublicAuthenticators([
    {
      name: 'basic',
      authType: 'Email/Password',
      authTypeTitle: '密码',
      title: null,
    },
  ])
}

function clearClientAuthState() {
  nocobaseClient.auth.setToken('')
  nocobaseClient.auth.setAuthenticator('')
  nocobaseClient.auth.role = ''
}

async function fetchCurrentUser() {
  const response = await nocobaseClient.request<AuthCheckPayload>({
    method: 'get',
    url: 'auth:check',
  })

  const user = sanitizeUser(response.data.data)
  nocobaseClient.auth.role = user.roles[0] ?? null
  return user
}

async function fetchPublicAuthenticators() {
  const response = await nocobaseBrowserAuthClient.request<PublicAuthenticatorListPayload>({
    method: 'post',
    url: 'authenticators:publicList',
  })

  const payload = Array.isArray(response.data)
    ? response.data
    : Array.isArray(response.data?.data)
      ? response.data.data
      : []

  return splitPublicAuthenticators(payload)
}

export function useNocoAuthSession() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [publicAuthenticators, setPublicAuthenticators] = useState<PublicAuthenticatorSplit>(
    buildFallbackPublicAuthenticators,
  )
  const [isLoadingAuthenticators, setIsLoadingAuthenticators] = useState(!PORTAL_DEMO_AUTO_SIGN_IN_ENABLED)
  const [authenticatorLoadError, setAuthenticatorLoadError] = useState<string | null>(null)
  const hasStartedAutoSessionRef = useRef(false)

  const clearSession = useCallback(() => {
    setSession(null)
    setAuthError(null)
  }, [])

  const buildSession = useCallback(async (authenticatorName?: string) => {
    const user = await fetchCurrentUser()

    const nextSession = {
      token: nocobaseClient.auth.token ?? '',
      authenticator: nocobaseClient.auth.authenticator || authenticatorName || NOCOBASE_AUTHENTICATOR,
      user,
    } satisfies AuthSession

    setSession(nextSession)
    return nextSession
  }, [])

  const refreshAuthenticators = useCallback(async () => {
    if (PORTAL_DEMO_AUTO_SIGN_IN_ENABLED) {
      const nextAuthenticators = buildFallbackPublicAuthenticators()
      setPublicAuthenticators(nextAuthenticators)
      setAuthenticatorLoadError(null)
      setIsLoadingAuthenticators(false)
      return nextAuthenticators
    }

    setAuthenticatorLoadError(null)
    setIsLoadingAuthenticators(true)

    try {
      const nextAuthenticators = await fetchPublicAuthenticators()
      setPublicAuthenticators(nextAuthenticators)
      return nextAuthenticators
    } catch (error) {
      const message = toErrorMessage(error, '登录方式加载失败，请稍后重试')
      setAuthenticatorLoadError(message)
      throw new Error(message)
    } finally {
      setIsLoadingAuthenticators(false)
    }
  }, [])

  useEffect(() => {
    if (PORTAL_DEMO_AUTO_SIGN_IN_ENABLED) {
      return
    }

    void refreshAuthenticators().catch(() => undefined)
  }, [refreshAuthenticators])

  const signIn = useCallback(
    async (
      account: string,
      password: string,
      authenticatorName = publicAuthenticators.defaultPasswordAuthenticator?.name || NOCOBASE_AUTHENTICATOR,
    ) => {
      setAuthError(null)

      await nocobaseClient.auth.signIn({ account, password }, authenticatorName)
      return buildSession(authenticatorName)
    },
    [buildSession, publicAuthenticators.defaultPasswordAuthenticator?.name],
  )

  const ensureAutoSession = useCallback(async () => {
    const callback = typeof window !== 'undefined' ? parseAuthCallback(window.location.href) : null
    if (callback) {
      setIsBootstrapping(false)
      return null
    }

    setAuthError(null)

    try {
      if (typeof window !== 'undefined') {
        const previousAccessMode = window.localStorage.getItem(PORTAL_ACCESS_MODE_STORAGE_KEY)?.trim() ?? ''
        window.localStorage.setItem(PORTAL_ACCESS_MODE_STORAGE_KEY, PORTAL_ACCESS_MODE)

        if (PORTAL_ACCESS_MODE === 'auth' && previousAccessMode !== 'auth') {
          try {
            await nocobaseClient.auth.signOut()
          } catch {
            // Ignore remote sign-out failures and clear local session anyway.
          } finally {
            clearClientAuthState()
            clearSession()
          }
        }
      }

      if (nocobaseClient.auth.token) {
        const cachedAuthenticator = nocobaseClient.auth.authenticator || NOCOBASE_AUTHENTICATOR

        try {
          return await buildSession(cachedAuthenticator)
        } catch {
          try {
            await nocobaseClient.auth.signOut()
          } catch {
            // Ignore remote sign-out failures during bootstrap cleanup.
          } finally {
            clearClientAuthState()
          }

          clearSession()
        }
      }

      if (!PORTAL_DEMO_AUTO_SIGN_IN_ENABLED) {
        return null
      }

      return await signIn(PORTAL_DEMO_ACCOUNT, PORTAL_DEMO_PASSWORD, NOCOBASE_AUTHENTICATOR)
    } catch (error) {
      clearClientAuthState()
      clearSession()
      const message = toErrorMessage(error, '自动建立访问会话失败，请检查后台服务或账号配置')
      setAuthError(message)
      throw new Error(message)
    } finally {
      setIsBootstrapping(false)
    }
  }, [buildSession, clearSession, signIn])

  useEffect(() => {
    if (hasStartedAutoSessionRef.current) {
      return
    }

    hasStartedAutoSessionRef.current = true
    void ensureAutoSession()
  }, [ensureAutoSession])

  // Only clear the session when the backend明确返回 401 失效信号。
  // 不要在浏览器标签页切换/窗口聚焦时主动校验并清空登录态，
  // 否则 Chrome 切回页面时会把正常会话误判成退出登录。
  useEffect(() => {
    if (PORTAL_DEMO_AUTO_SIGN_IN_ENABLED) {
      return
    }

    const clearExpiredSession = () => {
      if (!nocobaseClient.auth.token) return
      clearClientAuthState()
      clearSession()
    }

    // Session-check interceptor signal — auth:check reported that the cached
    // token is no longer valid.
    window.addEventListener('auth:session-expired', clearExpiredSession)

    return () => {
      window.removeEventListener('auth:session-expired', clearExpiredSession)
    }
  }, [clearSession])

  const startExternalSignIn = useCallback(
    async (authenticator: ExternalPortalAuthenticator, redirectTo: string) => {
      setAuthError(null)

      const response = await nocobaseBrowserAuthClient.resource(authenticator.actionResource).getAuthUrl({
        values: {
          name: authenticator.name,
          redirect: buildAuthCallbackPath({ redirectTo }),
        },
      })

      const payload = response.data as
        | {
            data?: { url?: string | null }
            url?: string | null
          }
        | undefined

      const url = payload?.data?.url ?? payload?.url
      if (!url) {
        throw new Error('未获取到认证跳转地址')
      }

      if (typeof window.location?.assign === 'function') {
        window.location.assign(url)
        return
      }

      window.location.href = url
    },
    [],
  )

  const completeSignInFromUrl = useCallback(
    async (urlLike: string) => {
      const callback = parseAuthCallback(urlLike)
      if (!callback) {
        return null
      }

      setAuthError(null)
      nocobaseClient.auth.setAuthenticator(callback.authenticator || NOCOBASE_AUTHENTICATOR)
      nocobaseClient.auth.setToken(callback.token)

      try {
        const nextSession = await buildSession(callback.authenticator || NOCOBASE_AUTHENTICATOR)
        return {
          ...callback,
          session: nextSession,
        }
      } catch (error) {
        clearClientAuthState()
        clearSession()
        const message = toErrorMessage(error, '登录状态校验失败，请重新登录')
        setAuthError(message)
        throw new Error(message)
      }
    },
    [buildSession, clearSession],
  )

  const signOut = useCallback(async () => {
    try {
      await nocobaseClient.auth.signOut()
    } catch {
      // Ignore remote sign-out failures and clear local state anyway.
    } finally {
      clearClientAuthState()
      clearSession()
    }
  }, [clearSession])

  const signInWithHandling = useCallback(
    async (account: string, password: string, authenticatorName?: string) => {
      try {
        return await signIn(account, password, authenticatorName)
      } catch (error) {
        const message = toErrorMessage(error, '登录失败，请检查账号和密码')
        setAuthError(message)
        throw new Error(message)
      }
    },
    [signIn],
  )

  const startExternalSignInWithHandling = useCallback(
    async (authenticator: ExternalPortalAuthenticator, redirectTo: string) => {
      try {
        await startExternalSignIn(authenticator, redirectTo)
      } catch (error) {
        const message = toErrorMessage(error, '统一认证跳转失败，请稍后重试')
        setAuthError(message)
        throw new Error(message)
      }
    },
    [startExternalSignIn],
  )

  const completeSignInFromUrlWithHandling = useCallback(
    async (urlLike: string) => {
      try {
        return await completeSignInFromUrl(urlLike)
      } catch (error) {
        const message = toErrorMessage(error, '登录状态校验失败，请重新登录')
        setAuthError(message)
        throw new Error(message)
      }
    },
    [completeSignInFromUrl],
  )

  return {
    session,
    authError,
    authenticatorLoadError,
    publicAuthenticators,
    portalAccessMode: PORTAL_ACCESS_MODE,
    autoSignInEnabled: PORTAL_DEMO_AUTO_SIGN_IN_ENABLED,
    isAuthenticated: Boolean(session),
    isBootstrapping,
    isLoadingAuthenticators,
    refreshAuthenticators,
    signIn: signInWithHandling,
    startExternalSignIn: startExternalSignInWithHandling,
    completeSignInFromUrl: completeSignInFromUrlWithHandling,
    signOut,
  }
}
