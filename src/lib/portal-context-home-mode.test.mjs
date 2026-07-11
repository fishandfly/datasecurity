import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const portalContextSource = readFileSync(resolve(process.cwd(), 'src/lib/portal-context.tsx'), 'utf8')

test('安全管控看板、列表页和默认入口统一使用轻量目录模式', () => {
  assert.match(
    portalContextSource,
    /const portalDataMode = appPathname === '\/security-governance'[\s\S]*appPathname === '\/security-governance\/dashboard'[\s\S]*appPathname === '\/security-governance\/resources'[\s\S]*appPathname === '\/'[\s\S]*\? 'list'[\s\S]*: 'full'/,
  )
})
