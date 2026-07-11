import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const clientSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-client.ts'), 'utf8')

test('浏览器环境下 nocobaseClient 默认开发走 /api/、生产走 /data-catalog-manage/api/，并支持显式覆盖', () => {
  assert.match(
    clientSource,
    /type RuntimeConfigLike = \{/,
  )
  assert.match(
    clientSource,
    /__JL_ECO_SERVICE_RUNTIME_CONFIG__\?: RuntimeConfigLike/,
  )
  assert.match(
    clientSource,
    /const configuredBaseUrl =\s+readConfigText\(runtimeConfig\.VITE_NOCOBASE_API_BASE_URL\)\s+\|\|\s+readEnvText\(env\.VITE_NOCOBASE_API_BASE_URL\)/,
  )
  assert.match(
    clientSource,
    /const configuredBrowserApiBaseUrl =\s+readConfigText\(runtimeConfig\.VITE_NOCOBASE_BROWSER_API_BASE_URL\)\s+\|\|\s+readEnvText\(env\.VITE_NOCOBASE_BROWSER_API_BASE_URL\)/,
  )
  assert.match(
    clientSource,
    /const configuredBrowserAuthBaseUrl =\s+readConfigText\(runtimeConfig\.VITE_NOCOBASE_BROWSER_AUTH_BASE_URL\)\s+\|\|\s+readEnvText\(env\.VITE_NOCOBASE_BROWSER_AUTH_BASE_URL\)/,
  )
  assert.match(
    clientSource,
    /const isDevMode = env\.DEV === true \|\| readEnvText\(env\.MODE\) === 'development'/,
  )
  assert.match(
    clientSource,
    /const defaultBrowserApiBasePath = isDevMode \? '\/api\/' : '\/data-catalog-manage\/api\/'/,
  )
  assert.match(
    clientSource,
    /if \(!configuredBaseUrl\) \{\s*return 'http:\/\/localhost:8196\/api\/'/,
  )
  assert.match(
    clientSource,
    /if \(configuredBrowserApiBaseUrl\) \{\s*return ensureTrailingSlash\(configuredBrowserApiBaseUrl\)\s*\}/,
  )
  assert.match(
    clientSource,
    /function isSessionValidationRequest\(url\?: string \| null\)/,
  )
  assert.match(
    clientSource,
    /normalizedUrl === 'auth:check'/,
  )
  assert.doesNotMatch(clientSource, /jc4a:checkSession/)
  assert.match(
    clientSource,
    /status === 401 && nocobaseClient\.auth\.token && isSessionValidationRequest\(requestUrl\)/,
  )
  assert.match(
    clientSource,
    /function stripApiSuffix\(pathname: string\)/,
  )
  assert.match(
    clientSource,
    /export function resolveNocobasePublicAssetUrl\(value: string\)/,
  )
  assert.match(
    clientSource,
    /assetUrl\.pathname = `\$\{pathnameBase\}\$\{assetUrl\.pathname\}`/,
  )
  assert.match(
    clientSource,
    /export function buildNocobaseSignInUrl\(redirect\?: string \| null\)/,
  )
  assert.match(
    clientSource,
    /target\.pathname = `\$\{pathnameBase\}\/signin`/,
  )
  assert.match(
    clientSource,
    /target\.searchParams\.set\('redirect', redirect\.trim\(\)\)/,
  )
})
