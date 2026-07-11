import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const primaryOverviewCardsSource = readFileSync(resolve(process.cwd(), 'src/components/primary-overview-cards.tsx'), 'utf8')
const detailPageSource = readFileSync(resolve(process.cwd(), 'src/pages/detail-page.tsx'), 'utf8')
const uiSource = readFileSync(resolve(process.cwd(), 'src/components/ui.tsx'), 'utf8')

test('绿色主题下目录页分类趋势线使用主题主色而不是固定蓝色', () => {
  assert.match(primaryOverviewCardsSource, /base:\s*THEME_OVERVIEW_METRIC_STYLE/)
  assert.match(primaryOverviewCardsSource, /business:\s*THEME_OVERVIEW_METRIC_STYLE/)
  assert.match(primaryOverviewCardsSource, /manage:\s*THEME_OVERVIEW_METRIC_STYLE/)
  assert.match(primaryOverviewCardsSource, /map:\s*THEME_OVERVIEW_METRIC_STYLE/)
  assert.match(primaryOverviewCardsSource, /const THEME_OVERVIEW_METRIC_STYLE = \{ line: 'var\(--primary\)', fill: 'rgba\(var\(--theme-strong-rgb\),0.16\)' \}/)
})

test('详情页活动 tab 下划线使用主题色渐变而不是固定蓝色渐变', () => {
  assert.match(detailPageSource, /bg-\[linear-gradient\(90deg,var\(--theme-accent\),var\(--primary\)\)\]/)
  assert.doesNotMatch(detailPageSource, /bg-\[linear-gradient\(90deg,#71b8ff,#2c83dc\)\]/)
})

test('StatCard 默认图标色跟随主题主色而不是固定信息蓝', () => {
  assert.match(uiSource, /bg-\[rgba\(var\(--theme-soft-rgb\),0.10\)\] text-\[var\(--primary\)\]/)
  assert.doesNotMatch(uiSource, /tone === 'green' \? 'bg-\[var\(--status-success-bg\)\] text-\[var\(--status-success-text\)\]' : 'bg-\[var\(--status-info-bg\)\] text-\[var\(--status-info-text\)\]'/)
})
