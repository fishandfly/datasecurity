import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/components/catalog-source-overview-panel.tsx'), 'utf8')

test('数据源概览面板按来源单位一级分类生成统计卡，并支持联动来源单位筛选', () => {
  assert.match(source, /const LIST_OVERVIEW_CHART_WIDTH = 118/)
  assert.match(source, /createTopCategoryLookup\(sourceTree\)/)
  assert.match(source, /const activeTopNodeId = activeDepartmentNodeId/)
  assert.match(source, /function resolveSourceTopNodeId\(/)
  assert.match(source, /const sourceCountsByTopNodeId = useMemo\(\(\) => \{/)
  assert.match(source, /sourceTree\.forEach\(\(node\) => \{\s*counts\.set\(node\.id, 0\)/s)
  assert.match(source, /if \(getCatalogResourceTypeFilterId\(item\) !== 'data-source'\) \{/)
  assert.match(source, /const topNodeId = resolveSourceTopNodeId\(item, topCategoryLookup\)/)
  assert.match(source, /counts\.set\(topNodeId, \(counts\.get\(topNodeId\) \?\? 0\) \+ 1\)/)
  assert.match(source, /const sourceStatsRow = useMemo<OverviewMetricCardItem\[\]>\(\(\) => \{/)
  assert.match(source, /return sourceTree\.map\(\(node\) => \(\{/)
  assert.match(source, /label: node\.label/)
  assert.match(source, /value: sourceCountsByTopNodeId\.get\(node\.id\) \?\? 0/)
  assert.match(source, /trend: \[\{ periodCode: 'current', value: sourceCountsByTopNodeId\.get\(node\.id\) \?\? 0 \}\]/)
  assert.match(source, /valueNode: buildSourceMetricValueNode\(sourceCountsByTopNodeId\.get\(node\.id\) \?\? 0, activeTopNodeId === node\.id\)/)
  assert.match(source, /onClick: onDepartmentSelect \? \(\) => onDepartmentSelect\(node\.id\) : undefined/)
  assert.match(source, /isActive: activeTopNodeId === node\.id/)
  assert.match(source, /<OverviewMetricCardsGrid items=\{sourceStatsRow\} isLoading=\{false\} \/>/)
})
