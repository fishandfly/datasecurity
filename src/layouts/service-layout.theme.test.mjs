import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const layoutSource = readFileSync(resolve(process.cwd(), 'src/layouts/service-layout.tsx'), 'utf8')
const indexCssSource = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

test('顶部导航接入专用主题变量', () => {
  assert.match(layoutSource, /var\(--top-nav-bg-start\)/)
  assert.match(layoutSource, /var\(--top-nav-item-hover-bg\)/)
  assert.match(layoutSource, /var\(--top-nav-item-active-line\)/)
})

test('暗色主题覆盖顶部导航专用变量', () => {
  assert.match(indexCssSource, /--top-nav-bg-start:/)
  assert.match(indexCssSource, /:root\[data-theme='dark'\][\s\S]*--top-nav-bg-start:/)
  assert.match(indexCssSource, /:root\[data-theme='dark'\][\s\S]*--top-nav-item-active-line:/)
})

test('顶部全局搜索条桌面端宽度收窄为原配置约一半', () => {
  assert.match(layoutSource, /sm:w-\[320px\] lg:w-\[380px\] xl:w-\[450px\]/)
  assert.doesNotMatch(layoutSource, /sm:w-\[620px\] lg:w-\[760px\] xl:w-\[900px\]/)
})
