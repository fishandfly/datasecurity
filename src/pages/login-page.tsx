import { useEffect, useMemo, useState } from 'react'
import { Landmark, LockKeyhole, ScanFace, UserCircle2 } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, ScenicPanel, TopicPill } from '../components/ui'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { buildAuthCallbackPath, normalizePortalRedirectPath, parseAuthCallback } from '../lib/nocobase-auth-flow'
import { buildNocobaseSignInUrl } from '../lib/nocobase-client'
import { getLoginPageCopy } from '../lib/login-page-copy'
import { PORTAL_PASSWORD_SIGN_IN_ENABLED } from '../lib/portal-auth-mode'
import { usePortalContext } from '../lib/portal-context'
import { cn } from '../lib/utils'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    signIn,
    startExternalSignIn,
    completeSignInFromUrl,
    authError,
    authRequired,
    authenticatorLoadError,
    isAuthenticated,
    isBootstrapping,
    publicAuthenticators,
    isLoadingAuthenticators,
  } = usePortalContext()
  const copy = getLoginPageCopy()
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingExternalAuthenticator, setPendingExternalAuthenticator] = useState<string | null>(null)
  const [selectedPasswordAuthenticatorName, setSelectedPasswordAuthenticatorName] = useState('')
  const [autoExternalSignInFailed, setAutoExternalSignInFailed] = useState(false)
  const isEmbedMode = readEmbedMode(location.search)
  const defaultRedirectTo = appendEmbedToPath('/', isEmbedMode)
  const callbackInfo = useMemo(() => {
    if (typeof window === 'undefined') {
      return null
    }

    return parseAuthCallback(window.location.href)
  }, [location.hash, location.pathname, location.search])
  const redirectTo = normalizePortalRedirectPath(
    (location.state as { redirectTo?: string } | null)?.redirectTo ??
      callbackInfo?.redirectTo ??
      new URLSearchParams(location.search).get('redirectTo'),
    defaultRedirectTo,
  )
  const selectedPasswordAuthenticator =
    publicAuthenticators.passwordAuthenticators.find(
      (item) => item.name === selectedPasswordAuthenticatorName,
    ) ?? publicAuthenticators.defaultPasswordAuthenticator
  const showPasswordLogin =
    PORTAL_PASSWORD_SIGN_IN_ENABLED && publicAuthenticators.passwordAuthenticators.length > 0
  const showPasswordAuthenticatorSwitch =
    showPasswordLogin && publicAuthenticators.passwordAuthenticators.length > 1
  const autoExternalAuthenticator =
    !showPasswordLogin && publicAuthenticators.externalAuthenticators.length === 1
      ? publicAuthenticators.externalAuthenticators[0]
      : null
  const shouldAutoStartSingleExternalSignIn =
    authRequired &&
    !callbackInfo &&
    !isLoadingAuthenticators &&
    !showPasswordLogin &&
    publicAuthenticators.externalAuthenticators.length === 1 &&
    !autoExternalSignInFailed
  const shouldRedirectToUnifiedSignIn =
    authRequired &&
    !callbackInfo &&
    !isLoadingAuthenticators &&
    !showPasswordLogin &&
    publicAuthenticators.externalAuthenticators.length === 0
  const isBusy = isSubmitting || pendingExternalAuthenticator !== null

  useEffect(() => {
    if (!PORTAL_PASSWORD_SIGN_IN_ENABLED) {
      return
    }

    if (selectedPasswordAuthenticatorName || !publicAuthenticators.defaultPasswordAuthenticator?.name) {
      return
    }

    setSelectedPasswordAuthenticatorName(publicAuthenticators.defaultPasswordAuthenticator.name)
  }, [publicAuthenticators.defaultPasswordAuthenticator?.name, selectedPasswordAuthenticatorName])

  useEffect(() => {
    if (!shouldAutoStartSingleExternalSignIn || !autoExternalAuthenticator) {
      return
    }

    setPendingExternalAuthenticator(autoExternalAuthenticator.name)
    startExternalSignIn(autoExternalAuthenticator, redirectTo)
      .catch(() => {
        setAutoExternalSignInFailed(true)
      })
      .finally(() => {
        setPendingExternalAuthenticator((current) =>
          current === autoExternalAuthenticator.name ? null : current,
        )
      })
  }, [autoExternalAuthenticator, redirectTo, shouldAutoStartSingleExternalSignIn, startExternalSignIn])

  useEffect(() => {
    if (!callbackInfo) {
      return
    }

    let cancelled = false
    setIsSubmitting(true)
    const callbackUrl = window.location.href
    window.history.replaceState(window.history.state, '', callbackInfo.cleanPath)

    completeSignInFromUrl(callbackUrl)
      .then((result) => {
        if (cancelled || !result) {
          return
        }

        navigate(result.redirectTo, { replace: true })
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        navigate(callbackInfo.cleanPath, { replace: true })
      })
      .finally(() => {
        if (!cancelled) {
          setIsSubmitting(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [callbackInfo, completeSignInFromUrl, navigate])

  useEffect(() => {
    if (!shouldRedirectToUnifiedSignIn || typeof window === 'undefined') {
      return
    }

    const portalLoginUrl = new URL(buildAuthCallbackPath({ redirectTo }), window.location.origin)
    window.location.replace(buildNocobaseSignInUrl(portalLoginUrl.toString()))
  }, [redirectTo, shouldRedirectToUnifiedSignIn])

  if (!authRequired) {
    return <Navigate to={redirectTo} replace />
  }

  if (isAuthenticated && !callbackInfo) {
    return <Navigate to={redirectTo} replace />
  }

  if (isBootstrapping && !callbackInfo) {
    return (
      <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">
        正在校验登录状态...
      </div>
    )
  }

  if (shouldRedirectToUnifiedSignIn) {
    return (
      <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">
        正在跳转统一登录页...
      </div>
    )
  }

  if (
    shouldAutoStartSingleExternalSignIn &&
    autoExternalAuthenticator &&
    pendingExternalAuthenticator === autoExternalAuthenticator.name
  ) {
    return (
      <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">
        正在跳转统一认证中心...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ScenicPanel className="px-6 py-8">
        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <div className="max-w-[760px]">
            <div className="inline-flex rounded-full border border-[var(--status-info-border)] bg-[linear-gradient(180deg,var(--surface-raised-strong),color-mix(in_srgb,var(--status-info-bg)_72%,var(--surface-raised)))] px-3 py-1 text-[0.75rem] font-medium text-[var(--status-info-text)] shadow-[0_10px_24px_rgba(var(--theme-soft-rgb),0.08)]">
              统一身份认证
            </div>
            <h2 className="mt-4 text-[2rem] font-semibold leading-[1.24] text-[var(--text-main)]">{copy.heroTitle}</h2>
            <p className="mt-4 text-[0.875rem] leading-7 text-[var(--text-secondary)]">
              {copy.heroDescription}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <TopicPill className="text-[var(--primary)]">供需对接办理</TopicPill>
              <TopicPill>可访问目录</TopicPill>
              <TopicPill>消息通知</TopicPill>
            </div>
          </div>

          <form
            className="rounded-[18px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-elevated)] backdrop-blur"
            onSubmit={(event) => {
              event.preventDefault()
              if (!showPasswordLogin || !selectedPasswordAuthenticator?.name) {
                return
              }

              setIsSubmitting(true)
              signIn(account.trim(), password, selectedPasswordAuthenticator.name)
                .then(() => {
                  navigate(redirectTo, { replace: true })
                })
                .catch(() => undefined)
                .finally(() => {
                  setIsSubmitting(false)
                })
            }}
          >
            <div className="space-y-2 text-center">
              {copy.formEyebrow ? (
                <p className="text-[0.75rem] tracking-[0.12em] text-[var(--text-muted)]">{copy.formEyebrow}</p>
              ) : null}
              <h3 className="text-[1.5rem] font-semibold text-[var(--text-main)]">登录目录服务系统</h3>
            </div>

            <div className="mt-5 rounded-[8px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-muted),var(--surface-tint))] px-4 py-3 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
              {showPasswordLogin
                ? '当前前台门户支持账号密码和 4A 统一身份认证登录。登录成功后将返回当前访问的门户页面。'
                : '当前前台门户仅保留 4A 统一身份认证登录。登录成功后将返回当前访问的门户页面。'}
            </div>

            {showPasswordAuthenticatorSwitch ? (
              <div className="mt-5">
                <div className="mb-2 text-[0.75rem] text-[var(--text-muted)]">密码登录方式</div>
                <div className="grid grid-cols-2 gap-2 rounded-[10px] bg-[linear-gradient(180deg,var(--surface-muted),var(--surface-tint))] p-1">
                  {publicAuthenticators.passwordAuthenticators.map((authenticator) => {
                    const isActive = selectedPasswordAuthenticatorName === authenticator.name

                    return (
                      <button
                        key={authenticator.name}
                        type="button"
                        className={cn(
                          'rounded-[8px] border px-3 py-2 text-[0.8125rem] transition',
                          isActive
                            ? 'border-[var(--primary)] bg-[var(--surface-raised-strong)] text-[var(--primary)] shadow-[0_8px_18px_rgba(var(--theme-soft-rgb),0.16)]'
                            : 'border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--surface-outline)] hover:bg-[var(--surface-raised)]',
                        )}
                        onClick={() => {
                          setSelectedPasswordAuthenticatorName(authenticator.name)
                        }}
                      >
                        {authenticator.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {showPasswordLogin ? (
              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="username" className="mb-2 block text-[0.8125rem] text-[var(--text-main)]">
                    用户名 / 手机号
                  </label>
                  <div className="relative">
                    <UserCircle2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      id="username"
                      name="username"
                      autoComplete="username"
                      value={account}
                      onChange={(event) => setAccount(event.target.value)}
                      className="h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--field-bg)] pl-11 pr-4 text-[0.8125rem] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
                      placeholder="请输入用户名或手机号"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="password" className="mb-2 block text-[0.8125rem] text-[var(--text-main)]">
                    登录密码
                  </label>
                  <div className="relative">
                    <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      id="password"
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--field-bg)] pl-11 pr-4 text-[0.8125rem] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
                      placeholder="请输入登录密码"
                      type="password"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full rounded-[8px]"
                  disabled={
                    isBusy ||
                    account.trim().length === 0 ||
                    password.trim().length === 0 ||
                    !selectedPasswordAuthenticator?.name
                  }
                >
                  {callbackInfo ? '正在完成登录...' : isSubmitting ? '登录中...' : '登录'}
                </Button>
              </div>
            ) : PORTAL_PASSWORD_SIGN_IN_ENABLED ? (
              <div className="mt-5 rounded-[8px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-muted),var(--surface-tint))] px-4 py-3 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
                当前未启用账号密码登录，请使用下方统一身份认证方式登录。
              </div>
            ) : null}

            {publicAuthenticators.externalAuthenticators.length > 0 ? (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-3 text-[0.75rem] text-[var(--text-muted)]">
                  <span className="h-px flex-1 bg-[var(--line)]" />
                  {showPasswordLogin ? '4A 统一认证' : '统一认证入口'}
                  <span className="h-px flex-1 bg-[var(--line)]" />
                </div>
                <div className="space-y-2">
                  {publicAuthenticators.externalAuthenticators.map((authenticator) => {
                    const isPending = pendingExternalAuthenticator === authenticator.name

                    return (
                      <Button
                        key={authenticator.name}
                        type="button"
                        variant="secondary"
                        className="w-full rounded-[8px] border-[var(--surface-outline)] bg-[var(--surface-raised)] hover:border-[rgba(var(--theme-soft-rgb),0.22)] hover:bg-[var(--surface-raised-strong)]"
                        disabled={isBusy}
                        onClick={() => {
                          setPendingExternalAuthenticator(authenticator.name)
                          startExternalSignIn(authenticator, redirectTo)
                            .catch(() => undefined)
                            .finally(() => {
                              setPendingExternalAuthenticator(null)
                            })
                        }}
                      >
                        <ScanFace className="mr-2 h-4 w-4" />
                        {isPending ? '正在跳转认证中心...' : authenticator.label}
                      </Button>
                    )
                  })}
                </div>
              </div>
            ) : !isLoadingAuthenticators ? (
              <div className="mt-5 rounded-[8px] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-warning-text)]">
                当前未检测到可用的统一认证入口，请检查后台认证配置。
              </div>
            ) : null}

            {copy.formNotice ? (
              <div className="mt-4 rounded-[8px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-muted),var(--surface-tint))] px-4 py-3 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
                {copy.formNotice}
              </div>
            ) : null}

            {isLoadingAuthenticators ? (
              <div className="mt-4 rounded-[8px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-muted),var(--surface-tint))] px-4 py-3 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
                正在同步后台认证方式...
              </div>
            ) : null}

            {authenticatorLoadError ? (
              <div className="mt-4 rounded-[8px] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-warning-text)]">
                {authenticatorLoadError}
              </div>
            ) : null}

            {authError ? (
              <div className="mt-4 rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
                {authError}
              </div>
            ) : null}

            <div className="mt-4 flex items-center gap-2 text-[0.75rem] text-[var(--text-muted)]">
              <Landmark className="h-4 w-4" />
              适用对象：厅机关、直属单位、市县生态环境局
            </div>
          </form>
        </div>
      </ScenicPanel>
    </div>
  )
}
