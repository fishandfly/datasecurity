import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/pages/run-stats-page.tsx'), 'utf8')

function loadFormatRunStatsRecordMetricValue() {
  const helperSource = source.match(
    /function formatRunStatsRecordMetricValue\(value: number\) \{[\s\S]*?\n\}/,
  )?.[0] ?? ''

  assert.notEqual(helperSource, '', '未找到 formatRunStatsRecordMetricValue 实现')

  const executableSource = helperSource.replace(
    'function formatRunStatsRecordMetricValue(value: number)',
    'function formatRunStatsRecordMetricValue(value)',
  )

  return new Function(`${executableSource}\nreturn formatRunStatsRecordMetricValue`)()
}

test('运行统计记录总量卡片按亿条展示并保留两位小数', () => {
  const formatRunStatsRecordMetricValue = loadFormatRunStatsRecordMetricValue()

  assert.equal(formatRunStatsRecordMetricValue(1325093000), '13.25亿条')
  assert.equal(formatRunStatsRecordMetricValue(0), '0.00亿条')
  assert.match(source, /title="记录总量"[\s\S]*?value=\{formatRunStatsRecordMetricValue\(totalRecords\)\}/)
  assert.match(source, /title: `#\$\{index \+ 1\} \$\{item\.label\}`[\s\S]*?totalRecords: formatRunStatsRecordMetricValue\(item\.totalRecords\)/)
  assert.match(source, /title: item\.label[\s\S]*?totalRecords: formatRunStatsRecordMetricValue\(item\.totalRecords\)/)
})

test('断更表格隐藏业务时间字段列，最新更新表格保留该列', () => {
  assert.match(source, /showBusinessTimeField = true/)
  assert.match(source, /showBusinessTimeField \? <th className="px-3 py-2">业务时间字段<\/th> : null/)
  assert.match(source, /showBusinessTimeField \? <td className="px-3 py-2 text-\[var\(--text-secondary\)\]">\{row\.metainfo\.business_time_field_name \|\| '-'\}<\/td> : null/)
  assert.match(source, /colSpan=\{showBusinessTimeField \? 4 : 3\}/)
  assert.match(source, /title=\{`\$\{FRESHNESS_STOPPED_BAND_LABELS\.threeDayStopped\} Top5`\}[\s\S]*?showBusinessTimeField=\{false\}/)
  assert.match(source, /title=\{`\$\{FRESHNESS_STOPPED_BAND_LABELS\.weeklyStopped\} Top5`\}[\s\S]*?showBusinessTimeField=\{false\}/)
  assert.match(source, /title=\{`\$\{FRESHNESS_STOPPED_BAND_LABELS\.monthlyStopped\} Top5`\}[\s\S]*?showBusinessTimeField=\{false\}/)
  assert.match(source, /title=\{`\$\{FRESHNESS_STOPPED_BAND_LABELS\.yearlyStopped\} Top5`\}[\s\S]*?showBusinessTimeField=\{false\}/)
  assert.match(source, /title=\{`\$\{FRESHNESS_STOPPED_BAND_LABELS\.longTermStopped\} Top5`\}[\s\S]*?showBusinessTimeField=\{false\}/)
  assert.match(source, /title="最新更新 Top5"[\s\S]*?resourceDetailPath=\{resourceDetailPath\}/)
})

test('新鲜度表格去掉状态列和状态参数', () => {
  assert.doesNotMatch(source, /<th className="px-3 py-2">状态<\/th>/)
  assert.doesNotMatch(source, /statusLabel:/)
  assert.doesNotMatch(source, /statusToneClass:/)
  assert.doesNotMatch(source, /rounded-full px-2 py-1 text-\[11px\] font-semibold/)
})

test('断更表格标题区使用浅色背景表达紧迫程度', () => {
  assert.match(source, /titleToneClass\?: string/)
  assert.match(source, /titleToneClass \?\? 'bg-\[var\(--table-header-bg\)\] text-\[var\(--text-main\)\]'/)
  assert.match(source, /title=\{`\$\{FRESHNESS_STOPPED_BAND_LABELS\.threeDayStopped\} Top5`\}[\s\S]*?titleToneClass="bg-\[color-mix\(in_srgb,var\(--status-warning-bg\)_82%,white\)\] text-\[var\(--status-warning-text\)\]"/)
  assert.match(source, /title=\{`\$\{FRESHNESS_STOPPED_BAND_LABELS\.weeklyStopped\} Top5`\}[\s\S]*?titleToneClass="bg-\[rgba\(59,130,246,0\.12\)\] text-\[color-mix\(in_srgb,#2563eb_72%,#1f2937\)\]"/)
  assert.match(source, /title=\{`\$\{FRESHNESS_STOPPED_BAND_LABELS\.monthlyStopped\} Top5`\}[\s\S]*?titleToneClass="bg-\[rgba\(245,158,11,0\.14\)\] text-\[color-mix\(in_srgb,#c2410c_72%,#1f2937\)\]"/)
  assert.match(source, /title=\{`\$\{FRESHNESS_STOPPED_BAND_LABELS\.yearlyStopped\} Top5`\}[\s\S]*?titleToneClass="bg-\[rgba\(249,115,22,0\.16\)\] text-\[color-mix\(in_srgb,#c2410c_82%,#111827\)\]"/)
  assert.match(source, /title=\{`\$\{FRESHNESS_STOPPED_BAND_LABELS\.longTermStopped\} Top5`\}[\s\S]*?titleToneClass="bg-\[color-mix\(in_srgb,var\(--status-danger-bg\)_88%,white\)\] text-\[var\(--status-danger-text\)\]"/)
})
