import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-v3-pages.tsx'), 'utf8')
const runtimeSource = readFileSync(resolve(process.cwd(), 'security-runtime-service/app/runtime.py'), 'utf8')
const migrationSource = readFileSync(resolve(process.cwd(), 'scripts/migrate-nocobase-v3.mjs'), 'utf8')

test('访问主体配置 API Key 安全引用和授权 API 清单', () => {
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

test('访问策略提供资源级异常访问处置且不使用字段白名单', () => {
  assert.match(pageSource, /name: 'abnormal_access_rules_json'/)
  assert.match(runtimeSource, /"offHours"/)
  assert.match(runtimeSource, /"highFrequency"/)
  assert.match(runtimeSource, /"queryRangeExceeded"/)
  assert.match(runtimeSource, /"rowLimitExceeded"/)
  assert.match(runtimeSource, /"scopeViolation"/)
  assert.doesNotMatch(runtimeSource, /policy\.get\("field_allowlist_json"\)/)
})
