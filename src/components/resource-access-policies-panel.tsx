import { Power, RefreshCw, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SecurityV3CollectionPage, type SecurityV3CollectionPageConfig } from './security-v3-collection-page'
import { Button } from './ui'
import { toErrorMessage } from '../lib/nocobase-client'
import { formatSecurityV3Value, listSecurityV3Records, type SecurityV3Record } from '../lib/nocobase-security-v3'
import { groupSecurityLabels } from '../lib/security-label-hierarchy'
import { selectImportantFieldEntries } from '../lib/security-log-display'
import { ensureDefaultSecurityApi, publishSecurityApi, publishSecurityPolicy } from '../lib/security-runtime-client'
import { cn } from '../lib/utils'

type ResourceAccessPoliciesPanelProps = {
  resourceId: string
  resourceCode: string
  canManage: boolean
}

function policyToken(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'RESOURCE'
}

function regionOptionValue(record: Record<string, unknown>) {
  const code = String(record.nodeCode || '').trim()
  return /^region-[a-z0-9-]+$/i.test(code) ? code.toUpperCase() : ''
}

function relationRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function decisionTone(value: unknown) {
  const decision = String(value || '')
  if (decision === 'allow') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (decision === 'deny' || decision === 'denied') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
}

function formatRequestTime(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return '-'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized.replace('T', ' ')
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

type DecisionRiskFactor = {
  code: string
  label: string
  score: number
  detail: string
}

type RuntimeTraceStep = {
  stage: string
  name: string
  status: string
  outcome: string
  evaluations?: unknown[]
  protectionLevel: string
  sensitivity: string
  policyCode: string
  policyVersion: string
  outputMode: string
}

type PolicyEvaluation = {
  policyCode: string
  result: string
  reason: string
}

type AccessPath = {
  dataSource: string
  dataResource: string
  dataApplication: string
  api: string
  route: string
}

function decisionEvidence(value: unknown) {
  let source = value
  if (typeof source === 'string') {
    try { source = JSON.parse(source) } catch { source = {} }
  }
  const evidence = relationRecord(source)
  const labelEnrichment = relationRecord(evidence.labelEnrichment)
  const runtimeTraceRecords = Array.isArray(evidence.runtimeTrace)
    ? evidence.runtimeTrace.map((item) => relationRecord(item))
    : []
  const matchedLabels = Array.from(new Set([
    ...(Array.isArray(evidence.matchedLabels) ? evidence.matchedLabels : []),
    ...(Array.isArray(labelEnrichment.matchedLabels) ? labelEnrichment.matchedLabels : []),
    ...runtimeTraceRecords
      .filter((step) => step.stage === 'label_enrichment' || step.name === '标签补全')
      .flatMap((step) => Array.isArray(step.matchedLabels) ? step.matchedLabels : []),
  ].map((item) => String(item || '').trim()).filter(Boolean)))
  const fieldTags = relationRecord(labelEnrichment.fieldTags || evidence.fieldTags)
  const fieldTagSummary = selectImportantFieldEntries(Object.entries(fieldTags).flatMap(([field, tags]) => {
    const values = Array.isArray(tags) ? tags.map((tag) => String(tag || '').trim()).filter(Boolean) : []
    return values.length ? [`${field}：${values.join('、')}`] : []
  }))
  const riskFactors = Array.isArray(evidence.riskFactors)
    ? evidence.riskFactors.map((item) => {
        const factor = relationRecord(item)
        return {
          code: String(factor.code || ''),
          label: String(factor.label || factor.code || '未命名风险因子'),
          score: Number(factor.score || 0),
          detail: String(factor.detail || ''),
        }
      }).filter((item): item is DecisionRiskFactor => Boolean(item.code || item.label))
    : []
  const runtimeTrace = runtimeTraceRecords.length > 0
    ? runtimeTraceRecords.map((step) => {
        return {
          stage: String(step.stage || ''),
          name: String(step.name || step.stage || '运行阶段'),
          status: String(step.status || ''),
          outcome: step.outcome ? String(step.outcome) : '',
          evaluations: Array.isArray(step.evaluations) ? step.evaluations : undefined,
          protectionLevel: String(step.protectionLevel || ''),
          sensitivity: String(step.sensitivity || ''),
          policyCode: String(step.policyCode || ''),
          policyVersion: step.policyVersion == null ? '' : String(step.policyVersion),
          outputMode: String(step.outputMode || ''),
        }
      }).filter((item) => Boolean(item.stage))
    : []
  const rawEvaluations = Array.isArray(evidence.policyEvaluations)
    ? evidence.policyEvaluations
    : runtimeTrace.find((step) => step.stage === 'dynamic_policy')?.evaluations
  const policyEvaluations = Array.isArray(rawEvaluations)
    ? rawEvaluations.map((item) => {
        const evaluation = relationRecord(item)
        return {
          policyCode: String(evaluation.policyCode || evaluation.policy_code || evaluation.code || '运行规则'),
          result: String(evaluation.result || 'unknown'),
          reason: String(evaluation.reason || ''),
        }
      })
    : []
  const path = relationRecord(evidence.accessPath)
  const pathValue = (key: string, fallback: string) => {
    const value = relationRecord(path[key]).name || relationRecord(path[key]).source_name || relationRecord(path[key]).resource_name
    return String(value || fallback)
  }
  const route = relationRecord(path.route)
  const accessPath: AccessPath = {
    dataSource: pathValue('dataSource', '-'),
    dataResource: pathValue('dataResource', '-'),
    dataApplication: pathValue('dataApplication', '-'),
    api: pathValue('api', '-'),
    route: [route.accessMode, route.orchestratorPath, route.outputMode].filter(Boolean).map(String).join(' -> ') || '-',
  }
  return { matchedLabels, fieldTagSummary, riskFactors, runtimeTrace, policyEvaluations, accessPath, labelGroups: groupSecurityLabels(matchedLabels) }
}

function traceStatusLabel(step: RuntimeTraceStep) {
  if (step.stage === 'security_action' && step.outcome) return step.outcome
  if (step.status === 'audit_recorded') return '已记录'
  if (step.status === 'not_matched') return '未命中'
  if (step.status === 'blocked') return '已阻断'
  if (step.status === 'matched') return '已命中'
  if (step.status === 'not_evaluated') return '未执行'
  return '已完成'
}

function traceDetailLabel(step: RuntimeTraceStep) {
  if (step.stage === 'dynamic_policy') {
    return [
      step.policyCode ? `命中策略：${step.policyCode}${step.policyVersion ? `（v${step.policyVersion}）` : ''}` : '未匹配到具体策略',
      step.outputMode ? `输出模式：${step.outputMode}` : '',
    ].filter(Boolean).join('；')
  }
  if (step.stage !== 'classification') return ''
  const protection = ({ l1: 'L1（聚合）', l2: 'L2（明细受控）', l3: 'L3（仅密态）' } as Record<string, string>)[step.protectionLevel.toLowerCase()] || step.protectionLevel
  const sensitivity = ({ public: '公开', internal: '内部', sensitive: '敏感', important: '重要', core: '核心' } as Record<string, string>)[step.sensitivity.toLowerCase()] || step.sensitivity
  return [protection ? `防护层：${protection}` : '', sensitivity ? `敏感度：${sensitivity}` : ''].filter(Boolean).join('；')
}

function resourceTraceStep(evidence: ReturnType<typeof decisionEvidence>, stage: string) {
  return evidence.runtimeTrace.find((step) => step.stage === stage)
}

function resourceStageTone(step: RuntimeTraceStep | undefined) {
  if (!step) return 'text-[var(--text-muted)]'
  if (step.status === 'blocked' || step.outcome === 'DENY') return 'text-[var(--status-danger-text)]'
  if (step.status === 'not_evaluated' || step.status === 'not_matched') return 'text-[var(--text-muted)]'
  return 'text-[var(--status-success-text)]'
}

function ResourceStageCell({ evidence, stage }: { evidence: ReturnType<typeof decisionEvidence>; stage: string }) {
  const step = resourceTraceStep(evidence, stage)
  if (!step) return <span className="text-[var(--text-muted)]">-</span>
  const hideStatus = stage === 'label_enrichment' || stage === 'classification'
  return (
    <div className="min-w-[150px] max-w-[250px] text-[0.72rem] leading-5">
      {hideStatus ? null : <div className={cn('font-medium', resourceStageTone(step))}>{traceStatusLabel(step)}</div>}
      {traceDetailLabel(step) ? <div className="text-[var(--text-secondary)]">{traceDetailLabel(step)}</div> : null}
      {stage === 'label_enrichment' && evidence.labelGroups.length ? (
        <ul className="mt-1 space-y-0.5 pl-2 text-[0.6875rem] text-[var(--text-secondary)]">
          {evidence.labelGroups.map((group) => (
            <li key={group.name}>
              <div className="font-medium text-[var(--text-main)]">{group.name}</div>
              <ul className="ml-2 border-l border-[var(--line)] pl-3">
                {group.labels.map((label) => <li key={label} className="relative pl-2 before:absolute before:left-[-0.8125rem] before:top-1/2 before:h-px before:w-2 before:bg-[var(--line)]">{label}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
      {stage === 'security_action' && step.outputMode ? <div className="text-[var(--text-secondary)]">输出方式：{step.outputMode}</div> : null}
    </div>
  )
}

function ResourcePolicyEvaluationCell({ evidence }: { evidence: ReturnType<typeof decisionEvidence> }) {
  if (!evidence.policyEvaluations.length) return <span className="text-[var(--text-muted)]">-</span>
  const labels: Record<string, string> = { passed: '通过', not_matched: '未命中', failed: '不通过', blocked: '阻断', unknown: '未知' }
  return (
    <div className="min-w-[220px] max-w-[330px] space-y-0.5 text-[0.72rem] leading-5">
      {evidence.policyEvaluations.map((item) => {
        const result = labels[item.result] || item.result
        const tone = item.result === 'passed' ? 'text-[var(--status-success-text)]' : item.result === 'not_matched' ? 'text-[var(--text-muted)]' : 'text-[var(--status-danger-text)]'
        return <div key={`${item.policyCode}-${item.result}-${item.reason}`}><span className={cn('font-medium', tone)}>{item.policyCode}：{result}</span>{item.reason ? <span className="text-[var(--text-secondary)]">（{item.reason}）</span> : null}</div>
      })}
    </div>
  )
}

function ResourceAccessSummaryCell({ log, evidence }: { log: SecurityV3Record; evidence: ReturnType<typeof decisionEvidence> }) {
  return (
    <div className="min-w-[170px] space-y-1.5 text-[0.72rem] leading-5">
      <div className="whitespace-nowrap text-[var(--text-secondary)]">{formatRequestTime(log.requested_at || log.createdAt)}</div>
      <div><span className={cn('inline-flex rounded-full border px-2 py-0.5', decisionTone(log.decision_result))}>{formatSecurityV3Value(log.decision_result)}</span></div>
      <div className="text-[var(--text-secondary)]">风险：{formatSecurityV3Value(log.risk_level)} · {Number(log.risk_score || 0)}</div>
      {evidence.riskFactors.length ? <div className="max-w-[240px] text-[var(--text-secondary)]">风险依据：{evidence.riskFactors.map((factor) => `${factor.label} +${factor.score}`).join('；')}</div> : null}
      <div className="text-[var(--text-muted)]">耗时：{log.duration_ms == null ? '-' : `${Number(log.duration_ms)} ms`}</div>
      {log.decision_reason ? <div className="max-w-[240px] text-[var(--text-secondary)]">原因：{formatSecurityV3Value(log.decision_reason)}</div> : null}
      {evidence.runtimeTrace.length === 0 ? <div className="text-[var(--text-muted)]">无完整版轨迹</div> : null}
    </div>
  )
}

function DecisionEvidence({ value }: { value: unknown }) {
  const evidence = decisionEvidence(value)
  if (!evidence.matchedLabels.length && !evidence.fieldTagSummary.length && !evidence.riskFactors.length && !evidence.runtimeTrace.length) {
    return <span className="text-[var(--text-muted)]">-</span>
  }
  const factorSummary = evidence.riskFactors.map((factor) => `${factor.label} +${factor.score}：${factor.detail}`).join('\n')
  const traceSummary = evidence.runtimeTrace.map((step) => `${step.name}：${traceStatusLabel(step)}${traceDetailLabel(step) ? `（${traceDetailLabel(step)}）` : ''}`).join('\n')
  const policySummary = evidence.policyEvaluations.map((item) => `${item.policyCode}：${item.result}${item.reason ? `（${item.reason}）` : ''}`).join('\n')
  return (
    <div className="min-w-[300px] max-w-[460px] space-y-1.5" title={[traceSummary, policySummary, factorSummary, ...evidence.fieldTagSummary].filter(Boolean).join('\n')}>
      {evidence.matchedLabels.length ? (
        <div className="flex flex-wrap gap-1">
          {evidence.matchedLabels.slice(0, 3).map((label) => (
            <span key={label} className="inline-flex rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-2 py-0.5 text-[0.6875rem] text-[var(--status-info-text)]">{label}</span>
          ))}
          {evidence.matchedLabels.length > 3 ? <span className="text-[0.6875rem] text-[var(--text-muted)]">+{evidence.matchedLabels.length - 3}</span> : null}
        </div>
      ) : null}
      {evidence.labelGroups.length ? (
        <ul className="space-y-0.5 pl-2 text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
          {evidence.labelGroups.map((group) => (
            <li key={group.name}>
              <div className="font-medium text-[var(--text-main)]">{group.name}</div>
              <ul className="ml-2 border-l border-[var(--line)] pl-3">
                {group.labels.map((label) => <li key={label} className="relative pl-2 before:absolute before:left-[-0.8125rem] before:top-1/2 before:h-px before:w-2 before:bg-[var(--line)]">{label}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
      {evidence.fieldTagSummary.length ? <div className="text-[0.6875rem] leading-5 text-[var(--text-secondary)]">字段标签：{evidence.fieldTagSummary.join('；')}</div> : null}
      {evidence.riskFactors.length ? (
        <div className="line-clamp-2 text-[0.75rem] leading-5 text-[var(--text-secondary)]">
          {evidence.riskFactors.map((factor) => `${factor.label} +${factor.score}`).join('；')}
        </div>
      ) : <div className="text-[0.75rem] text-[var(--text-muted)]">未命中动态风险因子</div>}
      {evidence.runtimeTrace.length ? (
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[0.6875rem] text-[var(--text-secondary)]">
          {evidence.runtimeTrace.map((step) => (
            <span key={step.stage} className={cn(
              'whitespace-nowrap',
              step.outcome === 'DENY'
                ? 'text-[var(--status-danger-text)]'
                : step.status === 'not_evaluated' || step.status === 'not_matched'
                  ? 'text-[var(--text-muted)]'
                  : 'text-[var(--status-success-text)]',
            )}>
              {step.name}：{traceStatusLabel(step)}{traceDetailLabel(step) ? `（${traceDetailLabel(step)}）` : ''}
            </span>
          ))}
        </div>
      ) : null}
      {evidence.policyEvaluations.length ? <div className="text-[0.6875rem] leading-5 text-[var(--text-secondary)]">策略评估：{evidence.policyEvaluations.map((item) => `${item.policyCode}=${item.result}${item.reason ? `（${item.reason}）` : ''}`).join('；')}</div> : null}
      {evidence.accessPath.dataSource !== '-' || evidence.accessPath.dataResource !== '-' || evidence.accessPath.dataApplication !== '-' ? (
        <div className="text-[0.6875rem] leading-5 text-[var(--text-secondary)]">访问链路：{evidence.accessPath.dataSource} → {evidence.accessPath.dataResource} → {evidence.accessPath.dataApplication} → {evidence.accessPath.api} → {evidence.accessPath.route}</div>
      ) : null}
    </div>
  )
}

function ResourceAccessDecisionLogs({ resourceId }: { resourceId: string }) {
  const [logs, setLogs] = useState<SecurityV3Record[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
      setError('')
      try {
        const records = await listSecurityV3Records('security_policy_decision_logs', {
        appends: ['subject', 'api_resource', 'policy'],
        sort: ['-requested_at', '-createdAt'],
        })
        setLogs(records.filter((record) => {
          const evidence = decisionEvidence(record.applied_limits_json)
          if (!evidence.runtimeTrace.length || evidence.accessPath.dataSource === '-' || evidence.accessPath.dataResource === '-' || evidence.accessPath.dataApplication === '-') return false
          const api = relationRecord(record.api_resource)
          const policy = relationRecord(record.policy)
        return String(api.resource_id || policy.resource_id || '') === resourceId
      }).slice(0, 10))
    } catch (currentError) {
      setError(toErrorMessage(currentError, '访问策略执行日志读取失败'))
    } finally {
      setLoading(false)
    }
  }, [resourceId])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <section className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--surface-outline)] bg-[var(--table-header-bg)] px-4 py-3">
        <div>
          <h3 className="text-[0.875rem] font-semibold text-[var(--text-main)]">访问策略最近执行日志</h3>
          <p className="mt-1 text-[0.75rem] text-[var(--text-muted)]">展示当前数据资源最近 10 条真实策略决策记录</p>
        </div>
        <Button variant="secondary" className="shrink-0 gap-2" onClick={() => void refresh()}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />刷新
        </Button>
      </div>
      {error ? <div className="m-4 rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1900px] border-collapse text-left text-[0.8125rem]">
          <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]"><tr>{['访问概要', '请求编号', '数据应用 / API', '重要字段', '标签补全', '分类分级', '动态策略', '安全动作', '策略评估', '返回行数'].map((label) => <th key={label} className="border-b border-[var(--line)] px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>{logs.map((log) => (
            <tr key={String(log.id || log.request_id)} className="border-b border-[var(--line)] align-top last:border-b-0 hover:bg-[var(--surface-muted)]">
              <td className="px-4 py-3.5"><ResourceAccessSummaryCell log={log} evidence={decisionEvidence(log.applied_limits_json)} /></td>
              <td className="px-4 py-3.5 font-medium text-[var(--text-main)]">{formatSecurityV3Value(log.request_id)}</td>
              <td className="max-w-[260px] px-4 py-3.5 text-[var(--text-secondary)]"><div className="font-medium">{formatSecurityV3Value(log.subject)}</div><div className="mt-1 text-[var(--text-muted)]">{formatSecurityV3Value(log.api_resource)}</div></td>
              <td className="px-4 py-3.5"><div className="min-w-[150px] max-w-[220px] space-y-0.5 text-[0.72rem] leading-5 text-[var(--text-secondary)]">{decisionEvidence(log.applied_limits_json).fieldTagSummary.length ? decisionEvidence(log.applied_limits_json).fieldTagSummary.map((field) => <div key={field}>{field}</div>) : <span className="text-[var(--text-muted)]">-</span>}</div></td>
              <td className="px-4 py-3.5"><ResourceStageCell evidence={decisionEvidence(log.applied_limits_json)} stage="label_enrichment" /></td>
              <td className="px-4 py-3.5"><ResourceStageCell evidence={decisionEvidence(log.applied_limits_json)} stage="classification" /></td>
              <td className="px-4 py-3.5"><ResourceStageCell evidence={decisionEvidence(log.applied_limits_json)} stage="dynamic_policy" /></td>
              <td className="px-4 py-3.5"><ResourceStageCell evidence={decisionEvidence(log.applied_limits_json)} stage="security_action" /></td>
              <td className="px-4 py-3.5"><ResourcePolicyEvaluationCell evidence={decisionEvidence(log.applied_limits_json)} /></td>
              <td className="px-4 py-3.5 text-[var(--text-secondary)]">{Number(log.returned_rows || 0).toLocaleString()}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {loading && !logs.length ? <div className="px-4 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">正在读取策略执行日志...</div> : null}
      {!loading && !logs.length && !error ? <div className="px-4 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">当前资源尚未产生访问策略执行日志</div> : null}
    </section>
  )
}

export function ResourceAccessPoliciesPanel({ resourceId, resourceCode, canManage }: ResourceAccessPoliciesPanelProps) {
  const [publishedApiCount, setPublishedApiCount] = useState<number | null>(null)
  const [apiStateError, setApiStateError] = useState('')
  const [isPublishingApi, setIsPublishingApi] = useState(false)
  const [apiRefreshVersion, setApiRefreshVersion] = useState(0)

  const refreshPublishedApiState = useCallback(async () => {
    setApiStateError('')
    try {
      const apis = await listSecurityV3Records('security_api_resources', {
        filter: { resource_id: resourceId },
        sort: ['id'],
      })
      setPublishedApiCount(apis.filter((api) => api.api_status === 'enabled' && api.publish_status === 'success').length)
      return apis
    } catch (currentError) {
      setPublishedApiCount(null)
      setApiStateError(toErrorMessage(currentError, '读取当前资源服务通道状态失败'))
      return []
    }
  }, [resourceId])

  useEffect(() => {
    void refreshPublishedApiState()
  }, [refreshPublishedApiState])

  const publishCurrentResourceApi = async () => {
    setIsPublishingApi(true)
    setApiStateError('')
    try {
      const ensured = await ensureDefaultSecurityApi(resourceId)
      const apis = await listSecurityV3Records('security_api_resources', {
        filter: { resource_id: resourceId },
        sort: ['id'],
      })
      const currentApi = apis.find((api) => String(api.id) === String(ensured.id)) || apis[0]
      if (!currentApi?.id) throw new Error('当前数据资源未生成可上线的服务通道')
      if (currentApi.api_status !== 'enabled' || currentApi.publish_status !== 'success') {
        await publishSecurityApi(String(currentApi.id))
      }
      await refreshPublishedApiState()
      setApiRefreshVersion((value) => value + 1)
    } catch (currentError) {
      setApiStateError(toErrorMessage(currentError, '当前资源服务通道上线失败'))
    } finally {
      setIsPublishingApi(false)
    }
  }

  const config = useMemo<SecurityV3CollectionPageConfig>(() => ({
    module: 'resources',
    title: '访问策略',
    collection: 'eco_resource_security_policies',
    appends: ['subject', 'api_resource'],
    filter: { resource_id: resourceId, policy_kind: 'access_policy' },
    readOnly: !canManage,
    canCreate: canManage,
    createLabel: '新增访问策略',
    emptyLabel: canManage ? '当前资源尚未配置可执行访问策略。' : '当前资源尚未配置访问策略。',
    columns: [
      { key: 'policy_code', label: '策略编码' },
      { key: 'policy_name', label: '策略名称' },
      { key: 'subject', label: '数据应用' },
      { key: 'api_resource', label: '服务通道' },
      { key: 'output_mode', label: '输出模式' },
      { key: 'max_rows', label: '最大行数' },
      { key: 'publish_status', label: '发布状态', tone: 'status' },
    ],
    fields: [
      { name: 'resource_id', label: '数据资源', hidden: true, defaultValue: resourceId },
      { name: 'policy_kind', label: '策略类型', hidden: true, defaultValue: 'access_policy' },
      { name: 'policy_code', label: '策略编码', required: true, defaultValue: `ACCESS-${policyToken(resourceCode)}-${String(Date.now()).slice(-6)}` },
      { name: 'policy_name', label: '策略名称', required: true, defaultValue: `${resourceCode} 数据访问策略` },
      { name: 'subject_id', label: '数据应用', required: true, relation: { collection: 'security_access_subjects', labelKey: 'subject_name', filter: { subject_status: 'enabled' } } },
      { name: 'api_resource_id', label: '已发布服务通道', required: true, relation: { collection: 'security_api_resources', labelKey: 'api_name', filter: { resource_id: resourceId, api_status: 'enabled', publish_status: 'success' } } },
      { name: 'scenario', label: '使用场景', type: 'select', required: true, defaultValue: 'online-grid-measurement-query', options: [
        { value: 'dispatch-operation-analysis', label: '调度运行分析' }, { value: 'regional-load-statistics', label: '区域负荷统计' },
        { value: 'cross-domain-load-statistics', label: '跨域负荷统计' }, { value: 'region-load-query', label: '区域负荷查询' },
        { value: 'online-grid-measurement-query', label: '在线电网量测查询' }, { value: 'online-grid-lvf-voltage', label: '在线低频电压查询' },
        { value: 'marketing-2-daily-energy', label: '营销日冻结电量查询' }, { value: 'marketing-2-energy-curve', label: '营销电能示值曲线查询' },
        { value: 'cross-domain-encrypted', label: '跨域密态数据访问' },
      ] },
      { name: 'source_ips_json', label: '允许来源 IP/CIDR', type: 'string-list', defaultValue: [] },
      { name: 'allowed_time_ranges_json', label: '允许调用时段', type: 'time-ranges', defaultValue: [] },
      { name: 'region_scope_json', label: '数据所属区域', type: 'relation-list', relation: { collection: 'jcCategoryTreeNodes', labelKey: 'nodeName', filter: { typeCode: 'eco_region_categories' }, optionValue: regionOptionValue }, defaultValue: [] },
      { name: 'output_mode', label: '输出模式', type: 'select', required: true, defaultValue: 'detail', options: [{ value: 'detail', label: '明细' }, { value: 'masked', label: '脱敏明细' }, { value: 'aggregate', label: '聚合结果' }, { value: 'encrypted', label: '密态结果' }] },
      { name: 'max_requests_per_minute', label: '每分钟请求上限', type: 'number', required: true, defaultValue: 60 },
      { name: 'max_query_days', label: '最大查询天数', type: 'number', required: true, defaultValue: 1 },
      { name: 'max_rows', label: '最大返回行数', type: 'number', required: true, defaultValue: 1000 },
      {
        name: 'abnormal_access_rules_json',
        label: '异常访问决策规则',
        type: 'abnormal-rules',
        required: true,
        defaultValue: {
          offHours: { enabled: true, action: 'deny' },
          highFrequency: { enabled: true, action: 'deny' },
          queryRangeExceeded: { enabled: true, action: 'deny' },
          rowLimitExceeded: { enabled: true, action: 'deny' },
          scopeViolation: { enabled: true, action: 'deny' },
        },
      },
      { name: 'policy_status', label: '策略状态', hidden: true, defaultValue: 'draft' },
    ],
    transformSaveValues: (values) => ({
      ...values,
      resource_id: resourceId,
      policy_kind: 'access_policy',
      publish_status: 'unpublished',
      publish_error: null,
    }),
    rowActions: canManage ? [{
      key: 'publish-policy',
      title: '校验并发布',
      icon: UploadCloud,
      execute: async (record) => {
        const result = await publishSecurityPolicy(String(record.id || ''))
        return `访问策略已发布，版本 V${result.policyVersion}`
      },
    }] : [],
  }), [canManage, resourceCode, resourceId])

  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-4 py-3 text-[0.8125rem] leading-6 text-[var(--status-info-text)]">
        API Key 鉴权与主体服务通道授权在数据应用中先行完成；这里只维护数据资源级策略：场景、来源 IP、时段、数据所属区域、输出模式、查询与频率上限，以及异常访问的允许/拒绝决策。策略仅可绑定已上线服务通道，字段范围或订阅方式由通道发布配置统一控制。
      </div>
      {publishedApiCount === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-[0.8125rem] leading-6 text-[var(--status-warning-text)]">
          <span>当前资源尚无已上线服务通道，因此“已发布服务通道”下拉框暂无可选项。</span>
          {canManage ? (
            <button type="button" disabled={isPublishingApi} onClick={() => void publishCurrentResourceApi()} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[6px] border border-[var(--status-warning-border)] bg-[var(--surface)] px-3 text-[0.75rem] font-semibold text-[var(--status-warning-text)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
              <Power className={cn('h-3.5 w-3.5', isPublishingApi && 'animate-pulse')} />{isPublishingApi ? '上线中...' : '上线当前资源通道'}
            </button>
          ) : null}
        </div>
      ) : null}
      {apiStateError ? <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{apiStateError}</div> : null}
      <SecurityV3CollectionPage key={`${resourceId}:${apiRefreshVersion}`} config={config} embedded />
      <ResourceAccessDecisionLogs resourceId={resourceId} />
    </div>
  )
}
