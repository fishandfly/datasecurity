import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-engine-log-center-page.tsx'), 'utf8')
const dataSource = readFileSync(resolve(process.cwd(), 'src/lib/security-engine-logs.ts'), 'utf8')
const tabsSource = readFileSync(resolve(process.cwd(), 'src/components/security-module-tabs.tsx'), 'utf8')
const routesSource = readFileSync(resolve(process.cwd(), 'src/modules/SecurityGovernance/routes.tsx'), 'utf8')

test('风险事件下提供四引擎统一日志中心', () => {
  assert.match(tabsSource, /日志中心.*\/security-governance\/risks\/log-center/)
  assert.match(routesSource, /SecurityEngineLogCenterPage/)
  assert.match(routesSource, /path="\/security-governance\/risks\/log-center"/)
  assert.match(pageSource, /四引擎日志中心/)
  assert.match(pageSource, /接入校验引擎/)
  assert.match(pageSource, /访问策略引擎/)
  assert.match(pageSource, /同态加密引擎/)
  assert.match(pageSource, /流式处理引擎/)
  assert.match(pageSource, /这里只归集日志，不自动创建风险事件/)
})

test('日志中心只汇总真实后台集合且不构造演示日志', () => {
  assert.match(dataSource, /listSecurityV3Records\('security_ingest_logs'/)
  assert.match(dataSource, /listSecurityV3Records\('security_policy_decision_logs'/)
  assert.match(dataSource, /listSecurityV3Records\('security_confidential_tasks'/)
  assert.match(dataSource, /listSecurityV3Records\('security_streaming_runs'/)
  assert.match(dataSource, /resource_delivery_error/)
  assert.match(dataSource, /record\.error_summary/)
  assert.doesNotMatch(dataSource, /mock|demo/i)
})

test('日志中心支持异常筛选与移动端卡片展示', () => {
  assert.match(pageSource, /status === 'failed'/)
  assert.match(pageSource, /engine === 'all'/)
  assert.match(pageSource, /<MobileLogCard/)
  assert.match(pageSource, /md:hidden/)
  assert.match(pageSource, /hidden overflow-hidden.*md:block/)
})

test('同态任务中已成功的步骤不受任务最终状态影响', () => {
  assert.match(dataSource, /if \(value === 'failed'\) return 'failed'/)
  assert.match(dataSource, /if \(value === 'success'\) return 'success'/)
})
