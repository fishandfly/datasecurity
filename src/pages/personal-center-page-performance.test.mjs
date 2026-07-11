import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const personalCenterPageSource = readFileSync(resolve(process.cwd(), 'src/pages/personal-center-page.tsx'), 'utf8')
const portalContextSource = readFileSync(resolve(process.cwd(), 'src/lib/portal-context.tsx'), 'utf8')

test('个人中心页面改用轻量目录模式而不是依赖 PortalContext 全量 catalogItems', () => {
  assert.match(personalCenterPageSource, /usePortalCatalogData\(true,\s*'list'\)|usePortalCatalogData\([^,]+,\s*'list'\)/)
  assert.equal(personalCenterPageSource.includes('const { catalogItems } = data'), false)
})

test('PortalProvider 不再为 /personal-center 首屏预加载整套目录资源', () => {
  assert.match(portalContextSource, /&& appPathname !== '\/personal-center'/)
})
