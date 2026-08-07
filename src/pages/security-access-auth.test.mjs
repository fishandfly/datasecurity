import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-v3-pages.tsx'), 'utf8')
const runtimeSource = readFileSync(resolve(process.cwd(), 'security-runtime-service/app/runtime.py'), 'utf8')
const migrationSource = readFileSync(resolve(process.cwd(), 'scripts/migrate-nocobase-v3.mjs'), 'utf8')

test('数据应用配置 API Key 安全引用和授权 API 清单', () => {
  assert.match(pageSource, /label: 'API Key 安全引用'/)
  assert.match(pageSource, /name: 'allowed_api_codes_json'/)
  assert.match(migrationSource, /field\.json\('allowed_api_codes_json'/)
  assert.doesNotMatch(pageSource, /name: 'field_allowlist_json'/)
})

test('Python 运行时先完成 API Key 和主体 API 授权再加载访问策略', () => {
  const apiKeyIndex = runtimeSource.indexOf('load_subject_by_api_key(api_key)')
  const apiAuthorizationIndex = runtimeSource.indexOf('allowed_api_codes =')
  const policyIndex = runtimeSource.indexOf('policy = load_policy(')
  assert.ok(apiKeyIndex > 0)
  assert.ok(apiAuthorizationIndex > apiKeyIndex)
  assert.ok(policyIndex > apiAuthorizationIndex)
  assert.match(runtimeSource, /"API_NOT_AUTHORIZED"/)
})

test('访问策略支持标签组合分层和资源例外策略', () => {
  assert.match(pageSource, /name: 'access_scope'/)
  assert.match(pageSource, /value: 'label_group'/)
  assert.match(pageSource, /name: 'security_tags'/)
  assert.match(pageSource, /protectionLevels/)
  assert.match(pageSource, /fieldTags/)
  assert.match(runtimeSource, /resource_matches_policy_selector/)
  assert.match(runtimeSource, /policy_selector_conditions/)
  assert.match(pageSource, /name: 'abnormal_access_rules_json'/)
  assert.match(runtimeSource, /"offHours"/)
  assert.match(runtimeSource, /"highFrequency"/)
  assert.match(runtimeSource, /"queryRangeExceeded"/)
  assert.match(runtimeSource, /"rowLimitExceeded"/)
  assert.match(runtimeSource, /"scopeViolation"/)
  assert.doesNotMatch(runtimeSource, /policy\.get\("field_allowlist_json"\)/)
})

test('行为基线页面提供查询跨度和返回行数标准差配置', () => {
  assert.match(pageSource, /name: 'query_days_stddev', label: '查询天数标准差', type: 'number', min: 0/)
  assert.match(pageSource, /name: 'rows_stddev', label: '返回行数标准差', type: 'number', min: 0/)
  assert.match(pageSource, /name: 'failure_avg'/)
  assert.match(pageSource, /name: 'generated_at'/)
})

test('异常规则使用配置风险分和策略阈值且校验风险分范围', () => {
  assert.match(runtimeSource, /policy, "behaviorAnomaly", behavior_score > 0/)
  assert.match(runtimeSource, /if score >= threshold:/)
  assert.doesNotMatch(runtimeSource, /score >= threshold or score >= 70/)
  assert.match(runtimeSource, /riskScore 必须在 0 到 100 之间/)
})
