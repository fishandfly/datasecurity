import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-source-config-page.tsx'), 'utf8')
const routesSource = readFileSync(resolve(process.cwd(), 'src/modules/SecurityGovernance/routes.tsx'), 'utf8')
const tabsSource = readFileSync(resolve(process.cwd(), 'src/components/security-module-tabs.tsx'), 'utf8')

test('数据源和校验规则使用精简后的接入模块路由', () => {
  assert.match(routesSource, /SecuritySourceConfigPage/)
  assert.match(routesSource, /SecurityAccessRuleConfigPage/)
  assert.match(routesSource, /path="\/security-governance\/ingest\/sources" element=\{<SecuritySourceConfigPage \/>/)
  assert.match(routesSource, /path="\/security-governance\/ingest\/validation-rules" element=\{<SecurityAccessRuleConfigPage \/>/)
  assert.match(routesSource, /path="\/security-governance\/data-access\/\*" element=\{<Navigate to="\/security-governance\/ingest\/sources" replace \/>/)
})

test('数据源配置只维护连接、Secret 引用和接入安全', () => {
  assert.match(pageSource, /Secret 引用/)
  assert.match(pageSource, /启用传输加密/)
  assert.match(pageSource, /启用完整性校验/)
  assert.match(pageSource, /启用数据抽样/)
  assert.match(pageSource, /抽样率（%）/)
  assert.doesNotMatch(pageSource, /关联安全策略/)
  assert.doesNotMatch(pageSource, /敏感度/)
  assert.doesNotMatch(pageSource, /接入 Workflow/)
  assert.doesNotMatch(pageSource, /失败率阈值/)
})

test('接入模块二级导航仅保留数据源和校验规则', () => {
  assert.match(tabsSource, /label: '数据源', path: '\/security-governance\/ingest\/sources'/)
  assert.match(tabsSource, /label: '校验规则', path: '\/security-governance\/ingest\/validation-rules'/)
  assert.doesNotMatch(tabsSource, /接入监控/)
})
