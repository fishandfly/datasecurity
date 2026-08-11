import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const spec = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/base-collections-spec.json'), 'utf8'))
const runtimeSource = readFileSync(resolve(process.cwd(), 'security-runtime-service/app/runtime.py'), 'utf8')
const modelSource = readFileSync(resolve(process.cwd(), 'scripts/security-field-model.mjs'), 'utf8')

function fieldNames(collectionName) {
  return new Set(spec.find((collection) => collection.name === collectionName)?.fields.map((field) => field.name) || [])
}

test('五类安全实体仅保留当前运行链路所需字段', () => {
  const sourceFields = fieldNames('security_data_sources')
  const resourceFields = fieldNames('eco_resource_security_fields')
  const subjectFields = fieldNames('security_access_subjects')
  const policyFields = fieldNames('eco_resource_security_policies')

  for (const field of ['secret_ref', 'security_config_json', 'validation_rules_json', 'tag_rules_json']) assert.ok(sourceFields.has(field))
  for (const field of ['information_category', 'classification_level', 'security_level', 'field_tags', 'important_field_flag', 'required_desensitization', 'output_allowed']) assert.ok(resourceFields.has(field))
  for (const field of ['credential_ref', 'allowed_api_codes_json', 'ip_whitelist_json', 'valid_from', 'valid_to', 'subject_status']) assert.ok(subjectFields.has(field))
  for (const field of ['resource', 'subject', 'api_resource', 'scenario', 'output_mode', 'abnormal_access_rules_json']) assert.ok(policyFields.has(field))

  for (const field of ['sensitivity_level', 'policy', 'workflow_key']) assert.ok(!sourceFields.has(field))
  for (const field of ['identifier_flag', 'quasi_identifier_flag', 'required_access_scope', 'required_export_allowed', 'aggregation_allowed']) assert.ok(!resourceFields.has(field))
  for (const field of ['credential_version', 'description']) assert.ok(!subjectFields.has(field))
  for (const field of ['access_scope', 'field_allowlist_json', 'api_auth_mode', 'export_allowed']) assert.ok(!policyFields.has(field))
})

test('动态策略只允许资源、应用和 API 的精确匹配', () => {
  assert.match(runtimeSource, /policy\.resource_id = current_api\.resource_id/)
  assert.match(runtimeSource, /policy\.api_resource_id = current_api\.id/)
  assert.doesNotMatch(runtimeSource, /label_group/)
  assert.match(modelSource, /DEPRECATED_SECURITY_FIELDS/)
})
