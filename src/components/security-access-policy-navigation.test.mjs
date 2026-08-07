import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const tabsSource = readFileSync(new URL('./security-module-tabs.tsx', import.meta.url), 'utf8')
const routesSource = readFileSync(new URL('../modules/SecurityGovernance/routes.tsx', import.meta.url), 'utf8')
const pagesSource = readFileSync(new URL('../pages/security-v3-pages.tsx', import.meta.url), 'utf8')
const navigationSource = readFileSync(new URL('../lib/nocobase-portal-navigation.ts', import.meta.url), 'utf8')
const sidebarSource = readFileSync(new URL('./security-component-sidebar.tsx', import.meta.url), 'utf8')

test('访问策略下只保留合并后的策略发布二级入口', () => {
  const accessTabs = tabsSource.match(/access: \[[\s\S]*?\n  \],/)?.[0] ?? ''
  assert.match(accessTabs, /label: '策略发布', path: '\/security-governance\/access\/publish'/)
  assert.doesNotMatch(accessTabs, /label: '访问策略'/)
  assert.equal((accessTabs.match(/label: '策略发布'/g) || []).length, 1)
})

test('旧访问策略地址跳转到合并后的策略发布页', () => {
  assert.match(routesSource, /path="\/security-governance\/access\/policies" element=\{<Navigate to="\/security-governance\/access\/publish" replace \/>\}/)
  assert.match(routesSource, /path="\/security-governance\/access\/publish" element=\{<SecurityPolicyPublishPage \/>\}/)
  assert.match(sidebarSource, /label: '访问策略', path: '\/security-governance\/access\/publish'/)
  assert.doesNotMatch(navigationSource, /title: '访问策略'/)
})

test('策略发布页同时支持策略编辑和逐行发布', () => {
  assert.match(pagesSource, /title: '访问策略', createLabel: '新增访问策略', collection: 'eco_resource_security_policies'/)
  assert.match(pagesSource, /transformSaveValues: \(values\) => \(\{ \.\.\.values, publish_status: 'unpublished'/)
  assert.match(pagesSource, /key: 'publish-policy', title: '发布', icon: UploadCloud/)
  assert.match(pagesSource, /publishSecurityPolicy\(String\(record\.id \|\| ''\)\)/)
  assert.match(pagesSource, /formatLocalDateTime\(record\.published_at\)/)
  assert.doesNotMatch(pagesSource, /const publishConfig:/)
  assert.doesNotMatch(pagesSource, /SecurityAccessPoliciesPage/)
})
