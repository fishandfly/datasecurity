import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const monitorSource = readFileSync(resolve(process.cwd(), 'src/lib/security-realtime-monitor.ts'), 'utf8')
const layoutSource = readFileSync(resolve(process.cwd(), 'src/lib/sankey-layout.ts'), 'utf8')

test('实时监控构建两张桑基图（分层策略/密态）', () => {
  assert.match(monitorSource, /buildRealtimeMonitorGraphs/)
  for (const graphId of ['flow', 'homomorphic']) {
    assert.match(monitorSource, new RegExp(`id: '${graphId}'`))
  }
  assert.match(monitorSource, /graphs: \[/)
  assert.match(monitorSource, /buildFlowGraph\(input\)/)
  assert.match(monitorSource, /buildHomomorphicGraph\(input\)/)
  assert.doesNotMatch(monitorSource, /buildExecutionGraph\(input\)/)
})

test('实时监控数据来自真实后台记录并支持时间窗口', () => {
  assert.match(monitorSource, /listSecurityV3Records\('security_data_sources'\)/)
  assert.match(monitorSource, /listSecurityV3Records\('security_policy_decision_logs'/)
  assert.match(monitorSource, /listSecurityV3Records\('security_ingest_logs'/)
  assert.match(monitorSource, /listSecurityV3Records\('security_confidential_tasks'/)
  assert.match(monitorSource, /windowHours <= 0/)
  assert.match(monitorSource, /requested_at: \{ \$gte: since \}/)
  assert.match(monitorSource, /listSecurityV3Records\('security_ingest_logs', \{ sort: \['-started_at'\] \}\)/)
  assert.match(monitorSource, /listSecurityV3Records\('security_streaming_runs'/)
  assert.match(monitorSource, /listSecurityV3Records\('security_streaming_windows'/)
  assert.match(monitorSource, /connection_status\) !== 'disabled'/)
  assert.match(monitorSource, /resource_status\) !== 'disabled'/)
})

test('KPI 覆盖接入、策略、密态、执行与风险', () => {
  for (const label of ['数据源（活动）', '接入校验失败', '资源（启用）', '已发布访问策略', '密态任务已完成', '密态任务失败', '窗口放行', '窗口拒绝']) {
    assert.ok(monitorSource.includes(`label: '${label}'`), `缺少 KPI 标签 ${label}`)
  }
})

test('桑基布局按列定位并生成贝塞尔连线', () => {
  assert.match(layoutSource, /export function layoutSankey/)
  assert.match(layoutSource, /column \* columnWidth/)
  assert.match(layoutSource, /M \$\{sourceX\} \$\{sourceY\} C/)
  assert.match(layoutSource, /strokeWidth: Math\.max\(1\.5/)
  assert.match(layoutSource, /nodeValue\.set\(node\.id, Math\.max/)
})

test('合并图从数据源经接入/流式引擎与分层策略流向数据应用', () => {
  assert.match(monitorSource, /数据源（源端系统）→ 接入通道（含流式处理引擎）→ 数据资源 → 数据中台资源防护层 → 数据服务输出模式 → 数据应用/)
  assert.match(monitorSource, /title: '分层策略流转'/)
  assert.match(monitorSource, /第一列与系统数据源管理保持一致/)
  assert.match(monitorSource, /id: `src:\$\{code\}`,/)
  assert.match(monitorSource, /id: `res:\$\{code\}`,/)
  assert.match(monitorSource, /id: `app:\$\{subjectName\}`,/)
  assert.match(monitorSource, /outputAppCounts/)
  assert.match(monitorSource, /subjectCallStats/)
  assert.match(monitorSource, /value: Math\.max\(1, value\),/)
  assert.match(monitorSource, /if \(outputAppCounts\.has\(key\)\) continue/)
  assert.match(monitorSource, /subjectById\.get\(String\(policy\.subject_id\)\)/)
  assert.match(monitorSource, /links\.push\(\{ from: `ch:\$\{channel\}`, to: `res:\$\{code\}`, value: 1, detail: ingestBySourceDetail\(resource\.data_source_id\) \}\)/)
  assert.match(monitorSource, /links\.push\(\{ from: `res:\$\{code\}`, to: `pr:\$\{level\}`, value: 1, detail: ingestBySourceDetail\(resource\.data_source_id\) \}\)/)
  assert.match(monitorSource, /column: 5, detail: subjectDetailRule/)
  assert.match(monitorSource, /current\.allow \+= 1/)
  assert.match(monitorSource, /current\.deny \+= 1/)
  assert.match(monitorSource, /href: '\/security-governance\/ingest\/sources'/)
  assert.match(monitorSource, /href: `\/security-governance\/resources\/\$\{String\(resource\.id\)\}`/)
  assert.match(monitorSource, /href: '\/security-governance\/access\/subjects'/)
  assert.match(monitorSource, /detail: decisionByOutputDetail\(input, output\)/)
  assert.match(monitorSource, /detail: decisionBySubjectOutputDetail\(input, subjectName, output\)/)
  assert.match(monitorSource, /message_queue: '流式处理引擎'/)
  assert.match(monitorSource, /id: `ch:\$\{channel\}`, label: channel, column: 1/)
  assert.match(monitorSource, /id: 'res:STREAM-WINDOW'/)
  assert.match(monitorSource, /from: 'ch:流式处理引擎', to: 'res:STREAM-WINDOW'/)
  assert.match(monitorSource, /channel === '流式处理引擎' \? streamingRunDetail\(\) : channelDetail\(\)/)
  assert.match(monitorSource, /detail: streamingWindowDetail\(\)/)
  assert.doesNotMatch(monitorSource, /接入校验 → 数据中台资源防护层/)
})

test('桑基节点带明细规则，页面可按集合过滤明细', () => {
  assert.match(layoutSource, /export type SankeyDetailRule/)
  assert.match(monitorSource, /detail: sourceDetail\(\)/)
  assert.match(monitorSource, /detail: resourceLevelDetail\(\)/)
  assert.match(monitorSource, /detail: resourceDetail\(\)/)
  assert.match(monitorSource, /detail: policyOutputDetail\(\)/)
  assert.match(monitorSource, /subjectDetail\(subjectCallStats\)/)
  assert.match(monitorSource, /taskDetailRule = taskDetail\(input\)/)
  assert.match(monitorSource, /detail: taskDetailRule/)
  assert.match(monitorSource, /collections: \{/)
})
