import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/components/catalog-service-overview-panel.tsx'), 'utf8')

test('数据服务概览面板按业务属性一级分类生成统计卡，并支持联动业务属性筛选', () => {
  assert.match(source, /const LIST_OVERVIEW_CHART_WIDTH = 118/)
  assert.match(source, /createTopCategoryLookup\(businessAttributeTree\)/)
  assert.match(source, /const activeTopNodeId = activeBusinessAttributeNodeId/)
  assert.match(source, /function resolveBusinessAttributeTopNodeId\(/)
  assert.match(source, /const serviceCountsByTopNodeId = useMemo\(\(\) => \{/)
  assert.match(source, /businessAttributeTree\.forEach\(\(node\) => \{\s*counts\.set\(node\.id, 0\)/s)
  assert.match(source, /if \(!isCatalogResourceTypeMatch\(item, 'service'\)\) \{/)
  assert.match(source, /const topNodeId = resolveBusinessAttributeTopNodeId\(item, topCategoryLookup\)/)
  assert.match(source, /counts\.set\(topNodeId, \(counts\.get\(topNodeId\) \?\? 0\) \+ 1\)/)
  assert.match(source, /const totalServiceCount = useMemo\(\s*\(\) => items\.filter\(\(item\) => isCatalogResourceTypeMatch\(item, 'service'\)\)\.length,/)
  assert.match(source, /const serviceStatsRow = useMemo<OverviewMetricCardItem\[\]>\(\(\) => \{/)
  assert.match(source, /label: '总服务数量'/)
  assert.match(source, /value: totalServiceCount/)
  assert.match(source, /trend: \[\{ periodCode: 'current', value: totalServiceCount \}\]/)
  assert.match(source, /valueNode: buildServiceMetricValueNode\(totalServiceCount, !activeTopNodeId\)/)
  assert.match(source, /onClick: onBusinessAttributeSelect \? \(\) => onBusinessAttributeSelect\(''\) : undefined/)
  assert.match(source, /isActive: !activeTopNodeId/)
  assert.match(source, /\.\.\.businessAttributeTree\.map\(\(node\) => \(\{/)
  assert.match(source, /label: node\.label/)
  assert.match(source, /value: serviceCountsByTopNodeId\.get\(node\.id\) \?\? 0/)
  assert.match(source, /trend: \[\{ periodCode: 'current', value: serviceCountsByTopNodeId\.get\(node\.id\) \?\? 0 \}\]/)
  assert.match(source, /valueNode: buildServiceMetricValueNode\(serviceCountsByTopNodeId\.get\(node\.id\) \?\? 0, activeTopNodeId === node\.id\)/)
  assert.match(source, /onClick: onBusinessAttributeSelect \? \(\) => onBusinessAttributeSelect\(node\.id\) : undefined/)
  assert.match(source, /isActive: activeTopNodeId === node\.id/)
  assert.match(source, /<OverviewMetricCardsGrid items=\{serviceStatsRow\} isLoading=\{false\} \/>/)
})
