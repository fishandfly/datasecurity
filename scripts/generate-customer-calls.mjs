import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 客户应用演示调用：为 18 个客户访问主体生成真实调用与决策日志。
// - masked 输出策略：走默认查询 API（resource-query）；
// - encrypted 输出策略：带同态参数走密态计算路径（自动创建同态任务并调用 openfhe）；
// - aggregate 输出策略：带聚合参数走 resource-query 聚合路径（按区域+小时分组返回 sum/avg）。
// 认证采用 HMAC 签名（access-key 精确指定主体），密钥复用演示主体凭据 SUBJECT_DEMO_SECRET。
const runtimeBase = process.env.RUNTIME_API_BASE_URL || 'http://127.0.0.1:8090'

function demoSecret() {
  if (process.env.SUBJECT_DEMO_SECRET) return process.env.SUBJECT_DEMO_SECRET
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const envFile = path.join(root, 'docker', '.env')
  if (fs.existsSync(envFile)) {
    const line = fs.readFileSync(envFile, 'utf8').split('\n').find((item) => item.startsWith('SUBJECT_DEMO_SECRET='))
    if (line) return line.slice('SUBJECT_DEMO_SECRET='.length).trim()
  }
  throw new Error('未找到 SUBJECT_DEMO_SECRET（docker/.env 或环境变量）')
}

const apiCodeToPath = {
  VOLT: 'grid-lvf-volt-001',
  CURR: 'grid-lvf-curr-002',
  DAILY: 'cust-daily-energy-003',
  POWER: 'grid-lvf-power-004',
  CURVE: 'cust-power-curve-005',
  PF: 'grid-lvf-pf-006',
  OUTAGE: 'cust-outage-event-007',
  SWITCH: 'grid-switch-event-008',
  NO_RELAD: 'grid-no-relad-009',
  TMR: 'grid-tmr-energy-010',
}

// subject / scenario / api / calls / params?（homomorphic 或 aggregate）
const callPlan = [
  ['APP-ONLINE-GRID', 'online-grid-lvf-voltage', 'VOLT', 6],
  ['APP-ONLINE-GRID', 'online-grid-lvf-current', 'CURR', 5],
  ['APP-ONLINE-GRID', 'online-grid-lvf-power', 'POWER', 4],
  ['APP-MARKETING-2', 'marketing-2-daily-energy', 'DAILY', 5, { operation: 'sum', fieldCode: 'PAP_R', startAt: '2026-06-25T00:00:00+08:00', endAt: '2026-06-26T00:00:00+08:00' }],
  ['APP-MARKETING-2', 'marketing-2-energy-curve', 'CURVE', 4, { operation: 'sum', fieldCode: 'VALUE', startAt: '2026-07-01T08:00:00+08:00', endAt: '2026-07-01T09:00:00+08:00' }],
  ['APP-SALES-FORECAST', 'sales-forecast-energy-curve', 'CURVE', 3, { operation: 'sum', fieldCode: 'VALUE', startAt: '2026-07-01T08:00:00+08:00', endAt: '2026-07-01T09:00:00+08:00' }],
  ['APP-SALES-FORECAST', 'sales-forecast-outage', 'OUTAGE', 3, { operation: 'sum', fieldCode: 'OUTAGE_DURATION_MIN', startAt: '2026-07-01T00:00:00+08:00', endAt: '2026-07-03T00:00:00+08:00' }],
  ['APP-CREDIT-ELECTRIC', 'credit-electric-daily-energy', 'DAILY', 3, { operation: 'sum', fieldCode: 'PAP_R', startAt: '2026-06-25T00:00:00+08:00', endAt: '2026-06-26T00:00:00+08:00' }],
  ['APP-CREDIT-ELECTRIC', 'credit-electric-energy-curve', 'CURVE', 2, { operation: 'sum', fieldCode: 'VALUE', startAt: '2026-07-01T08:00:00+08:00', endAt: '2026-07-01T09:00:00+08:00' }],
  ['APP-LINE-LOSS', 'line-loss-energy-statistics', 'TMR', 4, { aggregate: { metric: 'READ_VALUE', startAt: '2026-06-16T00:00:00+08:00', endAt: '2026-06-18T00:00:00+08:00' } }],
  ['APP-LINE-LOSS', 'line-loss-daily-energy', 'DAILY', 3, { aggregate: { metric: 'PAP_R', startAt: '2026-06-25T00:00:00+08:00', endAt: '2026-06-26T00:00:00+08:00' } }],
  ['APP-LINE-RELATION', 'line-relation-model', 'NO_RELAD', 3, { aggregate: { metric: 'VALUE', startAt: '2026-07-01T00:00:00+08:00', endAt: '2026-07-01T04:00:00+08:00' } }],
  ['APP-LINE-RELATION', 'line-relation-switch', 'SWITCH', 3, { aggregate: { metric: 'SWITCH_STATE', startAt: '2026-07-01T00:00:00+08:00', endAt: '2026-07-01T04:00:00+08:00' } }],
  ['APP-DATA-GOVERN', 'data-quality-volt', 'VOLT', 3],
  ['APP-DATA-GOVERN', 'data-quality-outage', 'OUTAGE', 3],
  ['APP-EXTERNAL-ENV', 'external-env-energy-curve', 'CURVE', 2, { operation: 'sum', fieldCode: 'VALUE', startAt: '2026-07-01T08:00:00+08:00', endAt: '2026-07-01T09:00:00+08:00' }],
  ['APP-DATA-TRANSFER', 'data-transfer-volt', 'VOLT', 4],
  ['APP-DATA-TRANSFER', 'data-transfer-current', 'CURR', 3],
  ['APP-DATA-TRANSFER', 'data-transfer-daily-energy', 'DAILY', 3, { aggregate: { metric: 'PAP_R', startAt: '2026-06-25T00:00:00+08:00', endAt: '2026-06-26T00:00:00+08:00' } }],
  ['APP-FULL-LINK-MONITOR', 'full-link-power', 'POWER', 3],
  ['APP-FULL-LINK-MONITOR', 'full-link-switch', 'SWITCH', 3],
  ['APP-SMART-CITY', 'smart-city-volt', 'VOLT', 4, { aggregate: { metric: 'VOLTAGE', startAt: '2026-07-01T00:00:00+08:00', endAt: '2026-07-01T04:00:00+08:00' } }],
  ['APP-SMART-CITY', 'smart-city-power', 'POWER', 4, { aggregate: { metric: 'P_ACTIVE', startAt: '2026-07-01T00:00:00+08:00', endAt: '2026-07-01T04:00:00+08:00' } }],
  ['APP-SMART-CITY', 'smart-city-tmr', 'TMR', 3, { aggregate: { metric: 'READ_VALUE', startAt: '2026-06-16T00:00:00+08:00', endAt: '2026-06-18T00:00:00+08:00' } }],
  ['APP-MULTI-SOURCE', 'multi-source-volt', 'VOLT', 3],
  ['APP-MULTI-SOURCE', 'multi-source-switch', 'SWITCH', 3],
  ['APP-DIGITAL-SUBSTATION', 'digital-substation-daily-energy', 'DAILY', 3, { operation: 'sum', fieldCode: 'PAP_R', startAt: '2026-06-25T00:00:00+08:00', endAt: '2026-06-26T00:00:00+08:00' }],
  ['APP-DIGITAL-SUBSTATION', 'digital-substation-energy-curve', 'CURVE', 2, { operation: 'sum', fieldCode: 'VALUE', startAt: '2026-07-01T08:00:00+08:00', endAt: '2026-07-01T09:00:00+08:00' }],
  ['APP-CHARGING', 'charging-energy-curve', 'CURVE', 3, { operation: 'sum', fieldCode: 'VALUE', startAt: '2026-07-01T08:00:00+08:00', endAt: '2026-07-01T09:00:00+08:00' }],
  ['APP-CHARGING', 'charging-daily-energy', 'DAILY', 3, { operation: 'sum', fieldCode: 'PAP_R', startAt: '2026-06-25T00:00:00+08:00', endAt: '2026-06-26T00:00:00+08:00' }],
  ['APP-NEW-ENERGY', 'new-energy-power', 'POWER', 4, { aggregate: { metric: 'P_ACTIVE', startAt: '2026-07-01T00:00:00+08:00', endAt: '2026-07-01T04:00:00+08:00' } }],
  ['APP-NEW-ENERGY', 'new-energy-power-factor', 'PF', 3, { aggregate: { metric: 'POWER_FACTOR', startAt: '2026-07-01T00:00:00+08:00', endAt: '2026-07-01T04:00:00+08:00' } }],
  ['APP-AUDIT', 'audit-current', 'CURR', 3],
  ['APP-AUDIT', 'audit-outage', 'OUTAGE', 3],
  ['APP-DISCIPLINE', 'discipline-tmr', 'TMR', 3, { aggregate: { metric: 'READ_VALUE', startAt: '2026-06-16T00:00:00+08:00', endAt: '2026-06-18T00:00:00+08:00' } }],
  ['APP-INTELLIGENT-DISPATCH', 'intelligent-dispatch-volt', 'VOLT', 4],
  ['APP-INTELLIGENT-DISPATCH', 'intelligent-dispatch-switch', 'SWITCH', 3],
  ['APP-INTELLIGENT-DISPATCH', 'intelligent-dispatch-outage', 'OUTAGE', 3, { operation: 'sum', fieldCode: 'OUTAGE_DURATION_MIN', startAt: '2026-07-01T00:00:00+08:00', endAt: '2026-07-03T00:00:00+08:00' }],
]

const secret = demoSecret()

function signedRequest(subjectCode, url, scenario) {
  const parsed = new URL(url)
  const canonicalParams = [...parsed.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
  const canonicalQuery = new URLSearchParams(canonicalParams).toString().replace(/\+/g, '%20')
  const timestamp = String(Date.now())
  const nonce = crypto.randomBytes(18).toString('base64url')
  const bodyDigest = crypto.createHash('sha256').update('').digest('hex')
  const canonical = ['GET', parsed.pathname, canonicalQuery, bodyDigest, timestamp, nonce].join('\n')
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex')
  return {
    headers: {
      'X-Access-Key': subjectCode,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
      'X-Scenario': scenario,
    },
  }
}

async function callOnce(subjectCode, scenario, apiKey, params) {
  const apiPath = apiCodeToPath[apiKey]
  const query = new URLSearchParams({ pageSize: '5' })
  if (params?.aggregate) {
    query.set('regionCode', 'REGION-A')
    query.set('startAt', params.aggregate.startAt)
    query.set('endAt', params.aggregate.endAt)
    query.set('metric', params.aggregate.metric)
  } else if (params) {
    query.set('operation', params.operation)
    query.set('fieldCode', params.fieldCode)
    query.set('regionCode', 'REGION-A')
    query.set('startAt', params.startAt)
    query.set('endAt', params.endAt)
  }
  const url = `${runtimeBase}/data-api/resources/${apiPath}?${query.toString()}`
  const { headers } = signedRequest(subjectCode, url, scenario)
  const response = await fetch(url, { headers })
  const text = await response.text()
  return { status: response.status, ok: response.ok, requestId: response.headers.get('x-request-id'), body: text.slice(0, 80) }
}

let allowCount = 0
let denyCount = 0
const errors = []
for (const [subjectCode, scenario, apiKey, calls, params] of callPlan) {
  for (let index = 0; index < calls; index += 1) {
    try {
      const result = await callOnce(subjectCode, scenario, apiKey, params)
      if (result.ok) allowCount += 1
      else denyCount += 1
    } catch (error) {
      errors.push(`${subjectCode}/${scenario}/${apiKey}: ${error.message}`)
    }
  }
}

console.log(JSON.stringify({
  allow: allowCount,
  deny: denyCount,
  total: allowCount + denyCount,
  errors: errors.length,
  errorDetails: errors.slice(0, 5),
}, null, 2))
if (errors.length) process.exit(1)
