import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/components/catalog-overview-panel.tsx'), 'utf8')

function loadFormatResourceCategoryRecordMetric() {
  const functionSource = source.match(
    /function formatResourceCategoryRecordMetric\(key: ResourceCategoryMetricKey, recordCount: number\) \{[\s\S]*?\n\}/,
  )?.[0] ?? ''

  assert.notEqual(functionSource, '', '未找到 formatResourceCategoryRecordMetric 实现')

  const executableSource = functionSource
    .replace(
      'function formatResourceCategoryRecordMetric(key: ResourceCategoryMetricKey, recordCount: number)',
      'function formatResourceCategoryRecordMetric(key, recordCount)',
    )
    .replace(
      /formatOverviewMetricValue\(/g,
      '((value, options) => value.toLocaleString(\'zh-CN\', options))(',
    )

  return new Function(`${executableSource}\nreturn formatResourceCategoryRecordMetric`)()
}

test('总览面板默认只展示顶部资源统计卡，plain 变体展示基础、业务、管理、地图四张分类卡并保留趋势图', () => {
  assert.match(source, /const LIST_OVERVIEW_CHART_WIDTH = 118/)
  assert.match(source, /const serviceStatsRow = useMemo<OverviewMetricCardItem\[\]>\(\(\) => \{/)
  assert.match(source, /activeCategoryNodeId = ''/)
  assert.match(source, /onCategorySelect\?: \(categoryNodeId: string\) => void/)

  const baseIndex = source.indexOf("label: '基础数据'")
  const businessIndex = source.indexOf("label: '业务数据'")
  const manageIndex = source.indexOf("label: '管理数据'")
  const mapIndex = source.indexOf("label: '地图数据'")

  assert.notEqual(baseIndex, -1)
  assert.notEqual(businessIndex, -1)
  assert.notEqual(manageIndex, -1)
  assert.notEqual(mapIndex, -1)
  assert.equal(baseIndex < businessIndex, true)
  assert.equal(businessIndex < manageIndex, true)
  assert.equal(manageIndex < mapIndex, true)
  assert.equal(source.includes('showTrend: false'), false)
  assert.equal(source.includes('asideNode: buildResourceCategoryMetricAsideNode(item.key)'), false)
  assert.equal(source.includes('01 数据分类'), false)
  assert.equal(source.includes('02 业务分类'), false)
  assert.equal(source.includes('useState('), false)
  assert.equal(source.includes('activeTab'), false)
  assert.equal(source.includes('businessStatsRow'), false)
  assert.match(source, /variant !== 'plain'\s*\?\s*<PrimaryOverviewCards data=\{overviewCardData\} \/>\s*:\s*null/)
  assert.match(source, /variant === 'plain'\s*\?\s*\(?\s*<OverviewMetricCardsGrid[\s\S]*?items=\{serviceStatsRow\}/)
  assert.match(source, /chartWidth: LIST_OVERVIEW_CHART_WIDTH/)
  assert.match(source, /hideDeltaText: true/)
  assert.match(source, /onClick: variant === 'plain' && onCategorySelect && topCategoryNodeIdByKey\[item\.key\]/)
  assert.match(source, /isActive: Boolean\(activeCategoryNodeId\) && activeCategoryNodeId === topCategoryNodeIdByKey\[item\.key\]/)
})

test('目录页基础、业务和管理数据条数按指定单位展示并保留一位小数', () => {
  const formatResourceCategoryRecordMetric = loadFormatResourceCategoryRecordMetric()

  assert.deepEqual(formatResourceCategoryRecordMetric('business', 1306100288), { valueText: '13.1', unit: '亿条' })
  assert.deepEqual(formatResourceCategoryRecordMetric('manage', 14184117), { valueText: '0.1', unit: '亿条' })
  assert.deepEqual(formatResourceCategoryRecordMetric('base', 15155), { valueText: '1.5', unit: '万条' })
  assert.match(source, /buildResourceCategoryMetricValueNode\(\s*item\.key,/)
  assert.match(source, /text-\[2\.125rem\]/)
  assert.match(source, /text-\[1\.375rem\]/)
  assert.match(source, /text-\[1\.125rem\]/)
})
