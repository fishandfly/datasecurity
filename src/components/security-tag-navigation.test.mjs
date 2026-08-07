import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const navigationSource = readFileSync(new URL('../lib/nocobase-portal-navigation.ts', import.meta.url), 'utf8')
const tabsSource = readFileSync(new URL('./security-module-tabs.tsx', import.meta.url), 'utf8')
const routesSource = readFileSync(new URL('../modules/SecurityGovernance/routes.tsx', import.meta.url), 'utf8')
const sidebarSource = readFileSync(new URL('./security-component-sidebar.tsx', import.meta.url), 'utf8')

test('分类标签作为组件配置下的二级导航', () => {
  assert.match(
    sidebarSource,
    /label: '分类标签', path: '\/security-governance\/tags\/catalog'/,
  )
  assert.doesNotMatch(navigationSource, /title: '分类标签'/)
})

test('标签管理统一提供目录、规则和标注记录入口', () => {
  assert.match(tabsSource, /tags: \[[\s\S]*label: '标签目录'[\s\S]*label: '标签规则'[\s\S]*label: '标注记录'/)
  const resourcesTabs = tabsSource.match(/resources: \[[\s\S]*?\n  \],/)?.[0] ?? ''
  const ingestTabs = tabsSource.match(/ingest: \[[\s\S]*?\n  \],/)?.[0] ?? ''
  assert.doesNotMatch(resourcesTabs, /label: '数据标签'/)
  assert.doesNotMatch(ingestTabs, /label: '标签规则'/)
})

test('新标签路由可达且旧入口保持重定向', () => {
  assert.match(routesSource, /path="\/security-governance\/tags\/catalog" element=\{<SecurityDataLabelsPage/)
  assert.match(routesSource, /path="\/security-governance\/tags\/rules" element=\{<SecurityTagRulesPage/)
  assert.match(routesSource, /path="\/security-governance\/tags\/records" element=\{<SecurityTagResultsPage/)
  assert.match(routesSource, /path="\/security-governance\/ingest\/tag-rules" element=\{<Navigate to="\/security-governance\/tags\/rules"/)
})
