import { RefreshCw, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SecurityV3CollectionPage, type SecurityV3CollectionPageConfig } from './security-v3-collection-page'
import { Button } from './ui'
import { toErrorMessage } from '../lib/nocobase-client'
import { formatSecurityV3Value, listSecurityV3Records, type SecurityV3Record } from '../lib/nocobase-security-v3'
import { publishSecurityPolicy } from '../lib/security-runtime-client'
import { cn } from '../lib/utils'

type ResourceAccessPoliciesPanelProps = {
  resourceId: string
  resourceCode: string
  canManage: boolean
}

function policyToken(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'RESOURCE'
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
        <table className="w-full min-w-[1100px] border-collapse text-left text-[0.8125rem]">
          <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]"><tr>{['请求时间', '请求编号', '访问主体', 'API', '命中策略', '决策', '决策原因', '风险', '返回行数', '耗时'].map((label) => <th key={label} className="border-b border-[var(--line)] px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>{logs.map((log) => (
            <tr key={String(log.id || log.request_id)} className="border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-muted)]">
              <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{formatRequestTime(log.requested_at || log.createdAt)}</td>
              <td className="px-4 py-3.5 font-medium text-[var(--text-main)]">{formatSecurityV3Value(log.request_id)}</td>
              <td className="px-4 py-3.5 text-[var(--text-secondary)]">{formatSecurityV3Value(log.subject)}</td>
              <td className="px-4 py-3.5 text-[var(--text-secondary)]">{formatSecurityV3Value(log.api_resource)}</td>
              <td className="px-4 py-3.5 text-[var(--text-secondary)]">{formatSecurityV3Value(log.policy)}</td>
              <td className="px-4 py-3.5"><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.75rem]', decisionTone(log.decision_result))}>{formatSecurityV3Value(log.decision_result)}</span></td>
              <td className="max-w-[260px] px-4 py-3.5 text-[var(--text-secondary)]">{formatSecurityV3Value(log.decision_reason)}</td>
              <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{formatSecurityV3Value(log.risk_level)} · {Number(log.risk_score || 0)}</td>
              <td className="px-4 py-3.5 text-[var(--text-secondary)]">{Number(log.returned_rows || 0).toLocaleString()}</td>
              <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{log.duration_ms == null ? '-' : `${Number(log.duration_ms)} ms`}</td>
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
      { key: 'subject', label: '访问主体' },
      { key: 'api_resource', label: 'API' },
      { key: 'output_mode', label: '输出模式' },
      { key: 'max_rows', label: '最大行数' },
      { key: 'risk_threshold', label: '风险阈值' },
      { key: 'publish_status', label: '发布状态', tone: 'status' },
    ],
    fields: [
      { name: 'resource_id', label: '数据资源', hidden: true, defaultValue: resourceId },
      { name: 'policy_kind', label: '策略类型', hidden: true, defaultValue: 'access_policy' },
      { name: 'policy_code', label: '策略编码', required: true, defaultValue: `ACCESS-${policyToken(resourceCode)}-${String(Date.now()).slice(-6)}` },
      { name: 'policy_name', label: '策略名称', required: true, defaultValue: `${resourceCode} 数据访问策略` },
      { name: 'subject_id', label: '访问主体', required: true, relation: { collection: 'security_access_subjects', labelKey: 'subject_name', filter: { subject_status: 'enabled' } } },
      { name: 'api_resource_id', label: '已发布 API', required: true, relation: { collection: 'security_api_resources', labelKey: 'api_name', filter: { resource_id: resourceId, api_status: 'enabled', publish_status: 'success' } } },
      { name: 'scenario', label: '调用场景标识（请求头 X-Scenario）', required: true, defaultValue: 'resource-data-query' },
      { name: 'source_ips_json', label: '允许来源 IP/CIDR', type: 'json', defaultValue: [] },
      { name: 'allowed_time_ranges_json', label: '允许调用时段（days/from/to）', type: 'json', defaultValue: [] },
      { name: 'organization_scope_json', label: '组织范围', type: 'json', defaultValue: [] },
      { name: 'region_scope_json', label: '区域范围', type: 'json', defaultValue: [] },
      { name: 'output_mode', label: '输出模式', type: 'select', required: true, defaultValue: 'detail', options: [{ value: 'detail', label: '明细' }, { value: 'masked', label: '脱敏明细' }, { value: 'aggregate', label: '聚合结果' }, { value: 'encrypted', label: '密态结果' }] },
      { name: 'max_requests_per_minute', label: '每分钟请求上限', type: 'number', required: true, defaultValue: 60 },
      { name: 'max_query_days', label: '最大查询天数', type: 'number', required: true, defaultValue: 1 },
      { name: 'max_rows', label: '最大返回行数', type: 'number', required: true, defaultValue: 1000 },
      { name: 'risk_threshold', label: '风险拒绝阈值（1-100）', type: 'number', required: true, defaultValue: 70 },
      {
        name: 'abnormal_access_rules_json',
        label: '异常访问处置规则（enabled/action/riskScore）',
        type: 'json',
        required: true,
        defaultValue: {
          offHours: { enabled: true, action: 'deny', riskScore: 70 },
          highFrequency: { enabled: true, action: 'deny', riskScore: 70 },
          queryRangeExceeded: { enabled: true, action: 'deny', riskScore: 60 },
          rowLimitExceeded: { enabled: true, action: 'deny', riskScore: 70 },
          scopeViolation: { enabled: true, action: 'deny', riskScore: 80 },
          behaviorAnomaly: { enabled: true, action: 'risk', riskScore: 20 },
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
        API Key 鉴权与主体 API 授权在访问主体中先行完成；这里只维护数据资源级策略：场景、来源 IP、时段、组织/区域范围、输出模式、查询与频率上限、风险阈值及异常访问处置。字段范围由 API 发布配置统一控制，不在访问策略中重复授权。
      </div>
      <SecurityV3CollectionPage config={config} embedded />
      <ResourceAccessDecisionLogs resourceId={resourceId} />
    </div>
  )
}
