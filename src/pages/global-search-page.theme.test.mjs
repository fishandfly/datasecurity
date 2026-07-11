import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/global-search-page.tsx'), 'utf8')
const indexCssSource = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

test('全局搜索页使用专用主题变量承接面板与卡片配色', () => {
  assert.match(pageSource, /var\(--search-hero-bg-start\)/)
  assert.match(pageSource, /var\(--search-section-bg-start\)/)
  assert.match(pageSource, /var\(--search-card-bg-start\)/)
  assert.match(pageSource, /var\(--search-pill-bg\)/)
  assert.match(pageSource, /var\(--search-title\)/)
  assert.match(pageSource, /var\(--search-card-summary\)/)
})

test('全局搜索页移除关键浅色硬编码以支持暗黑主题', () => {
  assert.doesNotMatch(pageSource, /text-\[#203346\]/)
  assert.doesNotMatch(pageSource, /bg-white/)
  assert.doesNotMatch(pageSource, /border-\[#dbe8f6\]/)
  assert.doesNotMatch(pageSource, /rgba\(255,255,255,0\.995\)/)
})

test('暗色主题为全局搜索页提供专用变量覆盖', () => {
  assert.match(indexCssSource, /--search-hero-bg-start:/)
  assert.match(indexCssSource, /--search-card-bg-start:/)
  assert.match(indexCssSource, /:root\[data-theme='dark'\][\s\S]*--search-hero-bg-start:/)
  assert.match(indexCssSource, /:root\[data-theme='dark'\][\s\S]*--search-card-title:/)
})
