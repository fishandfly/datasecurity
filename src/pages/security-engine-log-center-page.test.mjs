import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-engine-log-center-page.tsx'), 'utf8')
const dataSource = readFileSync(resolve(process.cwd(), 'src/lib/security-engine-logs.ts'), 'utf8')
const navigationSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-navigation.ts'), 'utf8')
const routesSource = readFileSync(resolve(process.cwd(), 'src/modules/SecurityGovernance/routes.tsx'), 'utf8')

test('一级导航提供完整版访问日志中心并兼容旧入口', () => {
  assert.match(navigationSource, /title: '日志中心'.*\/security-governance\/logs/)
  assert.match(routesSource, /SecurityEngineLogCenterPage/)
  assert.match(routesSource, /path="\/security-governance\/logs" element={<SecurityEngineLogCenterPage/)
  assert.match(pageSource, /完整版访问日志/)
  assert.match(pageSource, /按数据源查询/)
  assert.match(pageSource, /按数据应用查询/)
  assert.match(pageSource, /按数据资源查询/)
  assert.match(pageSource, /数据源 \/ 数据资源/)
  assert.match(pageSource, /数据应用 \/ API/)
  assert.match(pageSource, /访问概要/)
  assert.match(pageSource, /AccessSummaryCell/)
  assert.match(pageSource, /重要字段/)
  assert.match(pageSource, /selectImportantFieldEntries/)
  assert.match(pageSource, /标签补全.*分类分级.*动态策略.*安全动作.*策略评估/)
  assert.doesNotMatch(pageSource, /\['记录时间'.*'访问过程'/)
  assert.match(routesSource, /path="\/security-governance\/ingest\/logs" element={<Navigate to="\/security-governance\/logs"/)
  assert.match(routesSource, /path="\/security-governance\/access\/audit" element={<Navigate to="\/security-governance\/logs"/)
  assert.match(routesSource, /path="\/security-governance\/homomorphic\/logs" element={<Navigate to="\/security-governance\/logs"/)
  assert.match(routesSource, /path="\/security-governance\/risks\/events" element={<Navigate to="\/security-governance\/logs"/)
})

test('日志中心只汇总完整版决策日志且不构造演示日志', () => {
  assert.doesNotMatch(dataSource, /security_ingest_logs/)
  assert.match(dataSource, /listSecurityV3Records\('security_policy_decision_logs'/)
  assert.match(dataSource, /runtimeTrace/)
  assert.match(dataSource, /dataSource/)
  assert.match(dataSource, /dataResource/)
  assert.doesNotMatch(dataSource, /mock|demo/i)
})

test('日志中心支持异常筛选与移动端卡片展示', () => {
  assert.match(pageSource, /status === 'failed'/)
  assert.match(pageSource, /status === 'all'/)
  assert.match(pageSource, /source/)
  assert.match(pageSource, /resource/)
  assert.match(pageSource, /<LogCard/)
  assert.match(pageSource, /md:hidden/)
  assert.match(pageSource, /hidden overflow-hidden.*md:block/)
})

test('完整版日志保留访问过程和策略结果', () => {
  assert.match(dataSource, /runtimeTrace/)
  assert.match(dataSource, /policyEvaluations/)
  assert.match(dataSource, /accessPath/)
  assert.match(dataSource, /fieldTags/)
  assert.match(dataSource, /matchedLabels/)
  assert.doesNotMatch(pageSource, /完整标签：/)
  assert.doesNotMatch(pageSource, /字段标签：/)
  assert.match(pageSource, /防护层：/)
  assert.match(pageSource, /敏感度：/)
  assert.match(pageSource, /命中策略：/)
  assert.match(dataSource, /policyCode/)
  assert.match(pageSource, /LabelHierarchy/)
  assert.match(pageSource, /<ul className="mt-1 space-y-0\.5 pl-3/)
  assert.match(pageSource, /border-l border-\[var\(--line\)\]/)
  assert.match(dataSource, /labelGroups/)
})
