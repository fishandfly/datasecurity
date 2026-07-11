import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const configCenterSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-config-center.ts'), 'utf8')
const navigationSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-navigation.ts'), 'utf8')
const portalContextSource = readFileSync(resolve(process.cwd(), 'src/lib/portal-context.tsx'), 'utf8')
const layoutSource = readFileSync(resolve(process.cwd(), 'src/layouts/service-layout.tsx'), 'utf8')

test('配置中心站点标题从公共配置中心接口读取 portal.appearance.site_title', () => {
  assert.match(configCenterSource, /resource\('jcConfigCenter'\)\.publicGetValue\(\{/)
  assert.match(configCenterSource, /moduleKey:\s*'portal'/)
  assert.match(configCenterSource, /groupKey:\s*'appearance'/)
  assert.match(configCenterSource, /key:\s*'site_title'/)
})

test('配置中心站点 Logo 从公共配置中心接口读取 portal.appearance.site_logo', () => {
  assert.match(configCenterSource, /resource\('jcConfigCenter'\)\.publicGetValue\(\{/)
  assert.match(configCenterSource, /moduleKey:\s*'portal'/)
  assert.match(configCenterSource, /groupKey:\s*'appearance'/)
  assert.match(configCenterSource, /key:\s*'site_logo'/)
})

test('门户上下文暴露 siteTitle 给公共布局使用', () => {
  assert.match(portalContextSource, /const siteTitle = usePortalSiteTitle\(!auth\.isBootstrapping\)/)
  assert.match(portalContextSource, /const navigationConfig = usePortalNavigations\(true, productConfig\.enabledModuleIds\)/)
  assert.match(portalContextSource, /siteTitle,/)
  assert.match(portalContextSource, /\.\.\.navigationConfig,/)
})

test('公共布局使用配置中心站点标题渲染左上角并同步浏览器标题', () => {
  assert.match(layoutSource, /const \{ isAuthenticated, session, siteTitle, primaryNavigations \} = usePortalContext\(\)/)
  assert.match(layoutSource, /document\.title = resolvedSiteTitle/)
  assert.equal(layoutSource.includes('吉林省生态环境数据资源目录'), false)
  assert.match(layoutSource, /\{resolvedSiteTitle\}/)
  assert.match(layoutSource, /primaryNavigations\.map\(\(item\) => \(/)
})

test('公共布局左上角 Logo 优先使用配置中心 site_logo', () => {
  assert.match(layoutSource, /usePortalSiteLogo\(!location\.pathname\.startsWith\('\/login'\)\)/)
  assert.match(layoutSource, /siteLogo\?\.url \|\| defaultLogo/)
})

test('配置中心 Logo 会规避不可访问的本机 MinIO 地址', () => {
  assert.match(configCenterSource, /function normalizePortalLogoUrl\(value: unknown\)/)
  assert.match(configCenterSource, /url\.hostname === '127\.0\.0\.1' \|\| url\.hostname === 'localhost'/)
  assert.match(configCenterSource, /url\.port === '9100'/)
})

test('配置中心 Logo 使用 NocoBase 公共附件地址解析器处理相对路径', () => {
  assert.match(configCenterSource, /resolveNocobasePublicAssetUrl/)
  assert.match(configCenterSource, /return resolveNocobasePublicAssetUrl\(rawUrl\)/)
})

test('配置中心站点背景图从公共接口读取并写入页面背景 CSS 变量', () => {
  assert.match(configCenterSource, /key:\s*'site_background'/)
  assert.match(configCenterSource, /const resolvedBackground = normalizePortalLogo\(payload\?\.data\?\.value\)/)
  assert.match(configCenterSource, /export function usePortalSiteBackground\(enabled: boolean\)/)
  assert.match(layoutSource, /usePortalSiteBackground\(true\)/)
  assert.match(layoutSource, /--portal-background-image/)
})

test('门户导航配置通过公共配置中心接口读取并缓存', () => {
  assert.match(navigationSource, /resource\('jcConfigCenter'\)\s*\.publicGetNavigations\(\)/)
  assert.match(navigationSource, /JL_ECO_SERVICE_NAVIGATIONS/)
  assert.match(navigationSource, /visible:\s*normalizeBoolean\(record\.visible,\s*true\)/)
  assert.match(navigationSource, /function filterVisibleNavigationTree\(nodes: PortalNavigationNode\[\]\)/)
  assert.match(navigationSource, /buildPrimaryNavigations/)
  assert.match(navigationSource, /buildCatalogTabs/)
  assert.match(navigationSource, /buildDemandTabs/)
})
