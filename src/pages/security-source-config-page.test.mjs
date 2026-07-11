import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-source-config-page.tsx'), 'utf8')
const accessRuleConfigPageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-access-rule-config-page.tsx'), 'utf8')
const accessMonitoringPageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-access-monitoring-page.tsx'), 'utf8')
const routesSource = readFileSync(resolve(process.cwd(), 'src/modules/SecurityGovernance/routes.tsx'), 'utf8')

test('数据源配置路由指向真实页面而不是 Feature Plan 占位页', () => {
  assert.match(routesSource, /SecuritySourceConfigPage/)
  assert.match(routesSource, /SecurityAccessRuleConfigPage/)
  assert.match(routesSource, /SecurityAccessMonitoringPage/)
  assert.match(routesSource, /path="\/security-governance\/data-access\/source-config" element=\{<SecuritySourceConfigPage \/>/)
  assert.match(routesSource, /path="\/security-governance\/data-access\/rule-config" element=\{<SecurityAccessRuleConfigPage \/>/)
  assert.match(routesSource, /path="\/security-governance\/data-access\/monitoring" element=\{<SecurityAccessMonitoringPage \/>/)
  assert.match(routesSource, /path="\/security-governance\/source-config" element=\{<Navigate to="\/security-governance\/data-access\/source-config" replace \/>/)
  assert.doesNotMatch(routesSource, /path="\/security-governance\/source-config" element=\{<SecurityFeaturePlaceholderPage \/>/)
})

test('数据源配置页面覆盖筛选、表格、分页和抽屉配置能力', () => {
  assert.match(pageSource, /数据接入管理/)
  assert.match(pageSource, /SourceSecondaryTabs/)
  assert.match(pageSource, /aria-label="数据接入管理二级导航"/)
  assert.match(pageSource, /inline-flex flex-wrap gap-2 rounded-\[18px\]/)
  assert.match(pageSource, /数据源配置/)
  assert.match(pageSource, /接入规则配置/)
  assert.match(pageSource, /接入监控/)
  assert.match(pageSource, /新建数据源/)
  assert.doesNotMatch(pageSource, /批量导入/)
  assert.doesNotMatch(pageSource, /批量删除/)
  assert.match(pageSource, /搜索数据源名称、类型、标签或接入规则/)
  assert.match(pageSource, /标签筛选/)
  assert.match(pageSource, /数据源列表/)
  assert.match(pageSource, /测试连接/)
  assert.match(pageSource, /保存为草稿/)
  assert.match(pageSource, /保存并启用/)
  assert.match(pageSource, /高级设置/)
  assert.match(pageSource, /pageSizeOptions = \[10, 20, 50\]/)
})

test('数据接入管理二级导航使用顶部 tab 且只展示本模块功能', () => {
  const navItemsSource = pageSource.match(/const accessSecondaryNavItems[\s\S]*?\n\]/)?.[0] ?? ''
  const secondaryTabsSource = pageSource.match(/function SourceSecondaryTabs[\s\S]*?\n}\n\nfunction/)?.[0] ?? ''
  assert.match(navItemsSource, /数据源配置/)
  assert.match(navItemsSource, /接入规则配置/)
  assert.match(navItemsSource, /接入监控/)
  assert.match(navItemsSource, /\/security-governance\/data-access\/source-config/)
  assert.match(navItemsSource, /\/security-governance\/data-access\/rule-config/)
  assert.match(navItemsSource, /\/security-governance\/data-access\/monitoring/)
  assert.doesNotMatch(navItemsSource, /\/security-governance\/policy-engine/)
  assert.doesNotMatch(navItemsSource, /\/security-governance\/log-query/)
  assert.doesNotMatch(navItemsSource, /安全态势看板/)
  assert.doesNotMatch(navItemsSource, /访问控制管理/)
  assert.doesNotMatch(navItemsSource, /密态计算管理/)
  assert.doesNotMatch(navItemsSource, /日志链路审计/)
  assert.doesNotMatch(navItemsSource, /系统配置/)
  assert.match(secondaryTabsSource, /inline-flex min-h-11 items-center gap-3 whitespace-nowrap/)
  assert.match(secondaryTabsSource, /actions/)
  assert.match(secondaryTabsSource, /xl:justify-between/)
  assert.match(secondaryTabsSource, /xl:justify-end/)
  assert.match(pageSource, /<SourceSecondaryTabs[\s\S]*actions=\{/)
  assert.doesNotMatch(secondaryTabsSource, /w-full items-center/)
  assert.doesNotMatch(pageSource, /xl:grid-cols-\[248px_minmax\(0,1fr\)\]/)
  assert.doesNotMatch(pageSource, /xl:sticky xl:top-6 xl:self-start/)
})

test('接入规则配置路由指向真实规则页面而不是复用数据源配置页', () => {
  assert.match(accessRuleConfigPageSource, /接入规则配置/)
  assert.match(accessRuleConfigPageSource, /接入网关/)
  assert.match(accessRuleConfigPageSource, /完整性校验/)
  assert.match(accessRuleConfigPageSource, /加密传输/)
  assert.match(accessRuleConfigPageSource, /自动标签/)
  assert.match(accessRuleConfigPageSource, /useSecurityDataSources/)
  assert.match(accessRuleConfigPageSource, /source\.securityConfig/)
  assert.doesNotMatch(accessRuleConfigPageSource, /joinSecurityGovernanceItems/)
  assert.doesNotMatch(accessRuleConfigPageSource, /下发网关/)
})

test('接入监控路由指向真实监控页面而不是复用数据源配置页', () => {
  assert.match(accessMonitoringPageSource, /接入监控/)
  assert.match(accessMonitoringPageSource, /实时接入量/)
  assert.match(accessMonitoringPageSource, /校验通过率/)
  assert.match(accessMonitoringPageSource, /加密传输覆盖/)
  assert.match(accessMonitoringPageSource, /异常网关/)
  assert.match(accessMonitoringPageSource, /接入吞吐趋势/)
})
