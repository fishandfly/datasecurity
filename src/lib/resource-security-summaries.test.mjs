import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./resource-security-summaries.ts', import.meta.url), 'utf8')

test('资源运行统计一次加载八类真实关联数据并按资源聚合', () => {
  assert.match(source, /Promise\.all\(\[[\s\S]*eco_data_resources[\s\S]*security_api_resources[\s\S]*security_data_sources[\s\S]*security_ingest_logs[\s\S]*eco_resource_security_policies[\s\S]*security_policy_decision_logs[\s\S]*security_confidential_tasks[\s\S]*security_risk_events/)
  assert.match(source, /id\(record\.resource_id\) === resourceId/)
  assert.match(source, /apiIds\.has\(id\(record\.api_resource_id\)\)/)
  assert.match(source, /decisionIds\.has\(decisionId\)/)
  assert.match(source, /warningCount: pendingRiskCount \+ ingestFailureCount \+ failedHomomorphicTaskCount \+ exceptionSourceCount/)
})
