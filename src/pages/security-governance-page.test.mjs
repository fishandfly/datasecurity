import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const routesSource = readFileSync(resolve(process.cwd(), 'src/modules/SecurityGovernance/routes.tsx'), 'utf8')
const navigationSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-navigation.ts'), 'utf8')
const dashboardSource = readFileSync(resolve(process.cwd(), 'src/pages/security-dashboard-page.tsx'), 'utf8')
const resourcePageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-governance-page.tsx'), 'utf8')
const detailPageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-governance-detail-page.tsx'), 'utf8')
const runtimeSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-security-runtime.ts'), 'utf8')

test('安全管控收敛为四个一级入口', () => {
  assert.match(navigationSource, /title: '安全态势'[\s\S]*target: '\/security-governance\/dashboard'/)
  assert.match(navigationSource, /title: '数据资源'[\s\S]*target: '\/security-governance\/resources\/catalog'/)
  assert.match(navigationSource, /title: '日志中心'[\s\S]*target: '\/security-governance\/logs'/)
  assert.match(navigationSource, /title: '组件配置'[\s\S]*target: '\/security-governance\/components'/)
  assert.doesNotMatch(navigationSource, /风险事件|行为基线/)
})

test('当前路由使用资源目录和统一日志中心，旧入口仅做兼容跳转', () => {
  assert.match(routesSource, /path="\/security-governance\/resources\/catalog" element={<SecurityGovernancePage \/>}/)
  assert.match(routesSource, /path="\/security-governance\/resources\/:id" element={<SecurityGovernanceDetailPage \/>}/)
  assert.match(routesSource, /path="\/security-governance\/logs" element={<SecurityEngineLogCenterPage \/>}/)
  assert.match(routesSource, /path="\/security-governance\/risks\/events" element={<Navigate to="\/security-governance\/logs" replace \/>}/)
  assert.match(routesSource, /path="\/security-governance\/access\/baselines" element={<Navigate to="\/security-governance\/logs" replace \/>}/)
})

test('资源目录展示全部受管控资源并支持分类分级检索', () => {
  assert.match(resourcePageSource, /function isSecurityManagedResource\(item: SecurityGovernanceJoinedItem\)/)
  assert.match(resourcePageSource, /return !item\.mapPreview/)
  assert.match(resourcePageSource, /buildSecurityGovernanceSnapshot/)
  assert.match(resourcePageSource, /title="数据分类"/)
  assert.match(resourcePageSource, /title="业务分类"/)
  assert.match(resourcePageSource, /title="安全分类"/)
  assert.match(resourcePageSource, /title="安全等级"/)
  assert.match(resourcePageSource, /按资源编码、名称、数据分类、业务分类、安全分类、安全等级或风险关键词检索/)
  assert.doesNotMatch(resourcePageSource, /ResourceControlTypeTabs|SECURITY_GOVERNANCE_TABS/)
})

test('资源详情聚合字段、应用、策略、同态任务和访问日志', () => {
  assert.match(detailPageSource, /\['resourceFields', '资源字段'\]/)
  assert.match(detailPageSource, /\['accessSubjects', '数据应用'\]/)
  assert.match(detailPageSource, /\['accessPolicies', '访问策略'\]/)
  assert.match(detailPageSource, /\['homomorphic', '同态加密'\]/)
  assert.match(detailPageSource, /完整版访问日志/)
  assert.match(detailPageSource, /未命中策略默认拒绝/)
  assert.match(detailPageSource, /ensureDefaultSecurityApi\(item\.id\)/)
})

test('运行时只支持两类同态算法且不保留风险事件、行为基线集合', () => {
  assert.match(runtimeSource, /export type OpenFheAlgorithm = 'BFV' \| 'CKKS'/)
  assert.match(runtimeSource, /supportedAlgorithms: \['BFV', 'CKKS'\]/)
  assert.doesNotMatch(runtimeSource, /security_risk_events|security_behavior_baselines/)
  assert.match(dashboardSource, /export function SecurityDashboardPage\(\)/)
})
