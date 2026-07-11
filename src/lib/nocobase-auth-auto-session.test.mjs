import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const authSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-auth.ts'), 'utf8')
const authModeSource = readFileSync(resolve(process.cwd(), 'src/lib/portal-auth-mode.ts'), 'utf8')
const portalContextSource = readFileSync(resolve(process.cwd(), 'src/lib/portal-context.tsx'), 'utf8')
const protectedRouteSource = readFileSync(resolve(process.cwd(), 'src/components/protected-route.tsx'), 'utf8')
const loginPageSource = readFileSync(resolve(process.cwd(), 'src/pages/login-page.tsx'), 'utf8')
const personalCenterSource = readFileSync(resolve(process.cwd(), 'src/pages/personal-center-page.tsx'), 'utf8')

test('门户默认使用正式登录模式，并保留显式演示自动登录能力', () => {
  assert.match(authModeSource, /export type PortalAccessMode = 'demo-auto' \| 'auth'/)
  assert.match(authModeSource, /function normalizeEnvToken\(value: string \| null \| undefined\)/)
  assert.match(authModeSource, /export function normalizePortalAccessMode\(value: string \| null \| undefined\): PortalAccessMode/)
  assert.match(authModeSource, /const normalizedToken = normalizeEnvToken\(value\)/)
  assert.match(authModeSource, /return normalizedToken === 'auth' \? 'auth' : 'demo-auto'/)
  assert.match(authModeSource, /export function normalizePortalPasswordSignInEnabled\(value: string \| null \| undefined\): boolean/)
  assert.match(authModeSource, /if \(!normalizedToken\) \{\s*return true\s*\}/)
  assert.match(authModeSource, /return !\['0', 'false', 'off', 'no'\]\.includes\(normalizedToken\)/)
  assert.match(authModeSource, /normalizePortalAccessMode\(env\.VITE_PORTAL_ACCESS_MODE \?\? 'auth'\)/)
  assert.match(authModeSource, /normalizePortalPasswordSignInEnabled\(env\.VITE_PORTAL_PASSWORD_LOGIN_ENABLED\)/)
  assert.match(authModeSource, /export const PORTAL_DEMO_ACCOUNT =\s+env\.VITE_PORTAL_DEMO_ACCOUNT\?\.trim\(\) \|\| 'admin@nocobase\.com'/)
  assert.match(authModeSource, /export const PORTAL_DEMO_PASSWORD =\s+env\.VITE_PORTAL_DEMO_PASSWORD\?\.trim\(\) \|\| 'admin123'/)
  assert.match(authSource, /const PORTAL_ACCESS_MODE_STORAGE_KEY = `\$\{nocobaseClient\.storagePrefix\}PORTAL_ACCESS_MODE`/)
  assert.match(authSource, /const ensureAutoSession = useCallback\(async \(\) => \{/)
  assert.match(authSource, /const previousAccessMode = window\.localStorage\.getItem\(PORTAL_ACCESS_MODE_STORAGE_KEY\)\?\.trim\(\) \?\? ''/)
  assert.match(authSource, /window\.localStorage\.setItem\(PORTAL_ACCESS_MODE_STORAGE_KEY, PORTAL_ACCESS_MODE\)/)
  assert.match(authSource, /if \(PORTAL_ACCESS_MODE === 'auth' && previousAccessMode !== 'auth'\)/)
  assert.match(authSource, /clearClientAuthState\(\)/)
  assert.match(authSource, /clearSession\(\)/)
  assert.match(authSource, /if \(!PORTAL_DEMO_AUTO_SIGN_IN_ENABLED\) \{\s*return null\s*\}/)
  assert.match(authSource, /const cachedAuthenticator = nocobaseClient\.auth\.authenticator \|\| NOCOBASE_AUTHENTICATOR/)
  assert.match(authSource, /return await buildSession\(cachedAuthenticator\)/)
  assert.doesNotMatch(authSource, /jc4a:checkSession/)
  assert.doesNotMatch(authSource, /readJc4aSessionValidity/)
  assert.match(authSource, /await signIn\(PORTAL_DEMO_ACCOUNT, PORTAL_DEMO_PASSWORD, NOCOBASE_AUTHENTICATOR\)/)
  assert.match(authSource, /void ensureAutoSession\(\)/)
})

test('PortalContext 在演示模式下不要求登录，并在正式模式下只对已登录用户加载目录数据', () => {
  assert.match(portalContextSource, /const shouldLoadPortalCatalogData = \(appPathname === '\/security-governance' \|\| appPathname\.startsWith\('\/security-governance\/'\)\)/)
  assert.match(portalContextSource, /const authRequired = !auth\.autoSignInEnabled/)
  assert.match(portalContextSource, /&& \(!authRequired \|\| auth\.isAuthenticated\)/)
  assert.match(portalContextSource, /authRequired,/)
})

test('正式登录模式下受保护路由会跳转到登录页并保留回跳地址', () => {
  assert.match(protectedRouteSource, /if \(authRequired && !isAuthenticated\)/)
  assert.match(protectedRouteSource, /to="\/login"/)
  assert.match(protectedRouteSource, /state=\{\{ redirectTo: `\$\{location\.pathname\}\$\{location\.search\}` \}\}/)
})

test('登录页在演示模式自动跳过，在正式模式才展示登录表单', () => {
  assert.match(loginPageSource, /if \(!authRequired\) \{\s*return <Navigate to=\{redirectTo\} replace \/>\s*\}/)
  assert.match(loginPageSource, /if \(isAuthenticated && !callbackInfo\) \{\s*return <Navigate to=\{redirectTo\} replace \/>\s*\}/)
  assert.doesNotMatch(loginPageSource, /if \(!callbackInfo\) \{\s*return <Navigate to=\{redirectTo\} replace \/>\s*\}/)
  assert.match(loginPageSource, /PORTAL_PASSWORD_SIGN_IN_ENABLED/)
  assert.match(loginPageSource, /const shouldAutoStartSingleExternalSignIn =/)
  assert.match(loginPageSource, /!showPasswordLogin/)
  assert.match(loginPageSource, /publicAuthenticators\.externalAuthenticators\.length === 1/)
  assert.match(loginPageSource, /const autoExternalAuthenticator =/)
  assert.match(loginPageSource, /startExternalSignIn\(autoExternalAuthenticator, redirectTo\)/)
  assert.match(loginPageSource, /const shouldRedirectToUnifiedSignIn =/)
  assert.match(loginPageSource, /const callbackUrl = window\.location\.href/)
  assert.match(loginPageSource, /window\.history\.replaceState\(window\.history\.state, '', callbackInfo\.cleanPath\)/)
  assert.match(loginPageSource, /completeSignInFromUrl\(callbackUrl\)/)
  assert.match(loginPageSource, /window\.location\.replace\(buildNocobaseSignInUrl\(portalLoginUrl\.toString\(\)\)\)/)
  assert.match(loginPageSource, /正在跳转统一登录页\.\.\./)
  assert.match(loginPageSource, /正在跳转统一认证中心\.\.\./)
  assert.match(loginPageSource, /当前前台门户支持账号密码和 4A 统一身份认证登录/)
  assert.match(loginPageSource, /当前前台门户仅保留 4A 统一身份认证登录/)
  assert.match(loginPageSource, /用户名 \/ 手机号/)
  assert.match(loginPageSource, /登录密码/)
  assert.match(loginPageSource, /统一认证入口/)
})

test('个人中心不再跳转到登录页', () => {
  assert.doesNotMatch(personalCenterSource, /to=\{withEmbed\('\/login'\)\}/)
})

test('正式登录模式下切换浏览器标签页不会主动清空登录态', () => {
  assert.match(authSource, /window\.addEventListener\('auth:session-expired', clearExpiredSession\)/)
  assert.doesNotMatch(authSource, /document\.addEventListener\('visibilitychange'/)
  assert.doesNotMatch(authSource, /window\.addEventListener\('focus'/)
  assert.doesNotMatch(authSource, /jc4a:checkSession/)
})
