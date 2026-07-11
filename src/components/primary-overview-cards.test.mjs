import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/components/primary-overview-cards.tsx'), 'utf8')

function loadBuildOverviewTrendShape() {
  const functionSource = source.match(
    /function buildOverviewTrendShape\(values: number\[\], width: number, height: number\) \{[\s\S]*?\n\}/,
  )?.[0] ?? ''

  assert.notEqual(functionSource, '', '未找到 buildOverviewTrendShape 实现')

  const executableSource = functionSource.replace(
    'function buildOverviewTrendShape(values: number[], width: number, height: number)',
    'function buildOverviewTrendShape(values, width, height)',
  )

  return new Function(`${executableSource}\nreturn buildOverviewTrendShape`)()
}

function loadFormatOverviewRecordMetricValue() {
  const helperSource = source.match(
    /export function formatOverviewRecordMetricValue\(value: number\) \{[\s\S]*?\n\}/,
  )?.[0] ?? ''

  assert.notEqual(helperSource, '', '未找到 formatOverviewRecordMetricValue 实现')

  const executableSource = helperSource
    .replace(
      'export function formatOverviewRecordMetricValue(value: number)',
      'function formatOverviewRecordMetricValue(value)',
    )
    .replace(
      /formatOverviewMetricValue\(/g,
      '((value, options) => value.toLocaleString(\'zh-CN\', options))(',
    )

  return new Function(`${executableSource}\nreturn formatOverviewRecordMetricValue`)()
}

function loadFormatOverviewFieldMetricValue() {
  const helperSource = source.match(
    /export function formatOverviewFieldMetricValue\(value: number\) \{[\s\S]*?\n\}/,
  )?.[0] ?? ''

  assert.notEqual(helperSource, '', '未找到 formatOverviewFieldMetricValue 实现')

  const executableSource = helperSource
    .replace(
      'export function formatOverviewFieldMetricValue(value: number)',
      'function formatOverviewFieldMetricValue(value)',
    )
    .replace(
      /formatOverviewMetricValue\(/g,
      '((value, options) => value.toLocaleString(\'zh-CN\', options))(',
    )

  return new Function(`${executableSource}\nreturn formatOverviewFieldMetricValue`)()
}

test('首页概览卡片在只有 1 个趋势点时仍然绘制可见线段', () => {
  const buildOverviewTrendShape = loadBuildOverviewTrendShape()

  const result = buildOverviewTrendShape([1320299560], 160, 64)

  assert.match(result.linePath, / L /)
  assert.deepEqual(result.endPoint, { x: 154, y: 32 })
})

test('首页概览数据条数按亿条展示并保留两位小数', () => {
  const formatOverviewRecordMetricValue = loadFormatOverviewRecordMetricValue()

  assert.equal(formatOverviewRecordMetricValue(1320299560), '13.20')
  assert.match(source, /const RECORD_OVERVIEW_CHART_WIDTH = 118/)
  assert.match(source, /const HOME_RECORD_TREND_BASE = \[/)
  assert.match(source, /periodCode: '2024', value: 428000000/)
  assert.match(source, /periodCode: '2025', value: 589000000/)
  assert.match(source, /item\.key === 'record'[\s\S]*?unit: '亿条'/)
  assert.match(source, /item\.key === 'record'[\s\S]*?valueText: formatOverviewRecordMetricValue\(/)
  assert.match(source, /<span className="inline-block max-w-full whitespace-nowrap text-\[0\.75rem\] font-medium leading-5 tracking-\[-0\.02em\] xl:text-\[0\.8125rem\]">\s*2025年5\.89亿条,2024年4\.28亿条\s*<\/span>/)
  assert.match(source, /item\.key === 'record'[\s\S]*?deltaText: HOME_RECORD_HISTORY_TEXT/)
  assert.match(source, /item\.key === 'record'[\s\S]*?deltaPlacement: 'below-row'/)
  assert.match(source, /item\.key === 'record'[\s\S]*?trend: recordTrend/)
  assert.match(source, /item\.key === 'record' \? '-translate-y-\[5px\]' : ''/)
  assert.match(source, /item\.hideDeltaText \? '-translate-y-\[30px\]' : ''/)
  assert.match(source, /const HIDDEN_TREND_FOOTER_PLACEHOLDER = <span className="invisible">最近 1 次统计<\/span>/)
  assert.match(source, /item\.key === 'record'[\s\S]*?trendFooterText: HIDDEN_TREND_FOOTER_PLACEHOLDER/)
  assert.match(source, /const trendFooterText = item\.trendFooterText === undefined/)
  assert.match(source, /const deltaPlacement = item\.deltaPlacement \?\? 'inline'/)
  assert.match(source, /const chartWidth = item\.chartWidth \?\? \(item\.key === 'record' \? RECORD_OVERVIEW_CHART_WIDTH : OVERVIEW_CHART_WIDTH\)/)
  assert.match(source, /buildOverviewTrendShape\(trendValues, chartWidth, OVERVIEW_CHART_HEIGHT\)/)
  assert.match(source, /<svg width=\{chartWidth\} height=\{OVERVIEW_CHART_HEIGHT\} viewBox=\{`0 0 \$\{chartWidth\} \$\{OVERVIEW_CHART_HEIGHT\}`\}/)
  assert.match(source, /item\.hideDeltaText \|\| deltaPlacement === 'below-row'/)
  assert.match(source, /item\.hideDeltaText \|\| deltaPlacement !== 'below-row' \? null : \(\s*<div className=\{`relative z-\[1\] mt-\[10px\]/)
})

test('首页概览数据字段按万项展示并同步按万项输出变化文案', () => {
  const formatOverviewFieldMetricValue = loadFormatOverviewFieldMetricValue()

  assert.equal(formatOverviewFieldMetricValue(12506), '1.25')
  assert.match(source, /item\.key === 'field'[\s\S]*?unit: '万项'/)
  assert.match(source, /item\.key === 'field'[\s\S]*?valueText: formatOverviewFieldMetricValue\(effectiveFieldCount\)/)
  assert.match(source, /const formattedDeltaValue = unit === '万项'/)
  assert.match(source, /formatOverviewFieldMetricValue\(Math\.abs\(delta\)\)/)
})

test('目录概览分类卡选中态使用更明显的主题高亮层和趋势图强调', () => {
  assert.match(source, /const ACTIVE_OVERVIEW_METRIC_STYLE = \{ line: 'var\(--theme-accent-strong\)', fill: 'rgba\(var\(--theme-strong-rgb\),0\.24\)' \}/)
  assert.match(source, /const ACTIVE_OVERVIEW_CARD_CLASSNAME = 'border-\[rgba\(var\(--theme-soft-rgb\),0\.56\)\] shadow-\[0_0_0_1px_rgba\(var\(--theme-soft-rgb\),0\.32\),0_26px_56px_rgba\(var\(--theme-strong-rgb\),0\.18\)\]'/)
  assert.match(source, /const ACTIVE_OVERVIEW_CARD_TINT_CLASSNAME = 'bg-\[linear-gradient\(145deg,rgba\(var\(--theme-soft-rgb\),0\.18\),rgba\(var\(--theme-strong-rgb\),0\.12\)_46%,transparent_100%\)\]'/)
  assert.match(source, /const metricStyle = item\.isActive \? ACTIVE_OVERVIEW_METRIC_STYLE : baseMetricStyle/)
  assert.match(source, /aria-pressed=\{item\.onClick \? item\.isActive : undefined\}/)
})
