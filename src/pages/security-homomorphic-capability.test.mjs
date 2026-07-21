import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const routes = readFileSync(new URL('../modules/SecurityGovernance/routes.tsx', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../lib/nocobase-security-runtime.ts', import.meta.url), 'utf8')
const tasks = readFileSync(new URL('./security-confidential-computing-page.tsx', import.meta.url), 'utf8')
const logs = readFileSync(new URL('./security-homomorphic-logs-page.tsx', import.meta.url), 'utf8')
const results = readFileSync(new URL('./security-homomorphic-results-page.tsx', import.meta.url), 'utf8')

test('同态任务页是资源 API 自动任务记录页', () => {
  assert.match(routes, /homomorphic\/tasks" element={<SecurityConfidentialComputingPage/)
  assert.match(tasks, /资源 API 自动密态任务/)
  assert.match(tasks, /task\.executionSummary\.trigger === 'resource-api-policy'/)
  assert.doesNotMatch(tasks, /新建同态任务/)
  assert.doesNotMatch(tasks, /审批通过/)
  assert.doesNotMatch(tasks, /执行任务/)
})

test('正式任务页不接收或传递明文数值数组', () => {
  assert.doesNotMatch(tasks, /computeRequest/)
  assert.doesNotMatch(tasks, /valuesText/)
  assert.doesNotMatch(tasks, /executeOpenFheTask/)
  assert.doesNotMatch(tasks, /createConfidentialTask/)
  assert.match(tasks, /原始数值只存在于服务端内存/)
})

test('自动任务从任务表字段读取操作、字段和样本数', () => {
  assert.match(runtime, /operation: normalizeText\(raw\.operation\)/)
  assert.match(runtime, /fieldCode: normalizeText\(raw\.measure_field_code/)
  assert.match(runtime, /sampleCount: Math\.max\(0, normalizeNumber\(raw\.sample_count/)
  assert.match(results, /task\.operation === 'mean'/)
  assert.match(results, /task\.sampleCount\.toLocaleString\(\)/)
  assert.doesNotMatch(results, /computeRequest\?\.values/)
})

test('同态日志包含服务端资源取数阶段', () => {
  assert.match(logs, /resource_read: '资源取数'/)
  assert.match(logs, /\['bfv', 'ckks'\]\.includes/)
})

test('计算结果页展示引擎返回的真实结果与校验状态', () => {
  assert.match(results, /summary\.value/)
  assert.match(results, /summary\.verificationPassed/)
  assert.match(results, /payload\.requestId/)
})
