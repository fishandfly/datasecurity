import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-v3-pages.tsx'), 'utf8')
const collectionPageSource = readFileSync(resolve(process.cwd(), 'src/components/security-v3-collection-page.tsx'), 'utf8')
const resourcePolicySource = readFileSync(resolve(process.cwd(), 'src/components/resource-access-policies-panel.tsx'), 'utf8')
const runtimeSource = readFileSync(resolve(process.cwd(), 'security-runtime-service/app/runtime.py'), 'utf8')
const migrationSource = readFileSync(resolve(process.cwd(), 'scripts/migrate-nocobase-v3.mjs'), 'utf8')

test('数据应用配置 API Key 安全引用和授权服务通道清单', () => {
  assert.match(pageSource, /label: 'API Key 安全引用'/)
  assert.match(pageSource, /name: 'allowed_api_codes_json', label: '授权服务通道编码列表', type: 'string-list'/)
  assert.match(pageSource, /name: 'ip_whitelist_json', label: 'IP 白名单', type: 'string-list'/)
  assert.match(collectionPageSource, /function StringListField/)
  assert.match(collectionPageSource, /field\.type === 'string-list'/)
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

test('访问策略使用数据资源、数据应用和服务通道的精确匹配', () => {
  assert.match(pageSource, /name: 'resource_id'/)
  assert.match(pageSource, /name: 'subject_id'/)
  assert.match(pageSource, /name: 'api_resource_id'/)
  assert.match(runtimeSource, /policy\.resource_id = current_api\.resource_id/)
  assert.match(runtimeSource, /policy\.api_resource_id = current_api\.id/)
  assert.doesNotMatch(pageSource, /name: 'access_scope'/)
  assert.doesNotMatch(pageSource, /name: 'security_tags'/)
  assert.doesNotMatch(runtimeSource, /label_group/)
  assert.doesNotMatch(runtimeSource, /resource_matches_policy_selector/)
  assert.match(pageSource, /name: 'abnormal_access_rules_json'/)
  assert.match(runtimeSource, /"offHours"/)
  assert.match(runtimeSource, /"highFrequency"/)
  assert.match(runtimeSource, /"queryRangeExceeded"/)
  assert.match(runtimeSource, /"rowLimitExceeded"/)
  assert.match(runtimeSource, /"scopeViolation"/)
  assert.doesNotMatch(runtimeSource, /policy\.get\("field_allowlist_json"\)/)
})

test('访问策略页面不再提供行为基线配置', () => {
  assert.doesNotMatch(pageSource, /行为基线/)
  assert.doesNotMatch(pageSource, /query_days_stddev/)
  assert.doesNotMatch(pageSource, /rows_stddev/)
})

test('访问策略抽屉使用结构化控件维护运行规则', () => {
  assert.match(pageSource, /name: 'source_ips_json', label: '来源 IP 范围', type: 'string-list'/)
  assert.match(pageSource, /name: 'allowed_time_ranges_json', label: '允许时段', type: 'time-ranges'/)
  assert.match(pageSource, /name: 'scenario', label: '使用场景', type: 'select'/)
  assert.match(pageSource, /name: 'region_scope_json', label: '区域范围', type: 'relation-list'/)
  assert.doesNotMatch(resourcePolicySource, /name: 'organization_scope_json', label: '组织范围'/)
  assert.match(pageSource, /name: 'abnormal_access_rules_json', label: '异常访问决策规则', type: 'abnormal-rules'/)
  assert.match(collectionPageSource, /function StringListField/)
  assert.match(collectionPageSource, /function RelationListField/)
  assert.match(collectionPageSource, /function TimeRangesField/)
  assert.match(collectionPageSource, /function AbnormalRulesField/)
  assert.match(collectionPageSource, /normalizeTimeRanges\(value\)\.filter/)
  assert.match(collectionPageSource, /normalizeAbnormalRules\(value\)/)
})

test('资源访问策略在缺少已发布服务通道时可直接上线当前资源通道', () => {
  assert.match(resourcePolicySource, /label: '已发布服务通道'/)
  assert.match(resourcePolicySource, /api_status: 'enabled', publish_status: 'success'/)
  assert.match(resourcePolicySource, /当前资源尚无已上线服务通道/)
  assert.match(resourcePolicySource, /上线当前资源通道/)
  assert.match(resourcePolicySource, /ensureDefaultSecurityApi\(resourceId\)/)
  assert.match(resourcePolicySource, /publishSecurityApi\(String\(currentApi\.id\)\)/)
  assert.match(resourcePolicySource, /setApiRefreshVersion/)
})

test('区域范围被强制传参、校验并执行过滤', () => {
  assert.match(runtimeSource, /"REGION_REQUIRED"/)
  assert.match(runtimeSource, /策略配置了区域范围，请求必须显式传入 regionCode/)
  assert.match(runtimeSource, /policy_regions and processing_path == "\/internal\/resource-query" and not region_field_code/)
  assert.doesNotMatch(runtimeSource, /organization and _json_list\(policy\.get\("organization_scope_json"\)\)/)
})

test('异常规则只按允许或拒绝直接决定访问结果', () => {
  assert.doesNotMatch(runtimeSource, /behaviorAnomaly/)
  assert.doesNotMatch(runtimeSource, /if score >= threshold:/)
  assert.doesNotMatch(runtimeSource, /risk_threshold/)
  assert.match(runtimeSource, /action 必须是 deny 或 allow/)
})
