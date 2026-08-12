import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SecurityV3CollectionPage, type SecurityV3CollectionPageConfig } from './security-v3-collection-page'
import { Button } from './ui'
import { toErrorMessage } from '../lib/nocobase-client'
import { listSecurityV3Records, sanitizeSecurityVisibleText, type SecurityV3Record } from '../lib/nocobase-security-v3'
import { cn } from '../lib/utils'

type ResourceHomomorphicPanelProps = {
  resourceId: string
  resourceCode: string
  canManage: boolean
}

function taskCode() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 17)
}

function relationRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const stageLabels: Record<string, string> = {
  created: '任务创建', queued: '任务排队', validation: '范围校验', health_check: '服务检查',
  encrypt: '密文准备', compute: '密文计算', result: '结果回传', failed: '执行失败',
}

function resultTone(result: string) {
  if (result === 'success') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (result === 'failed') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
}

function ResourceHomomorphicLogs({ resourceId }: { resourceId: string }) {
  const [tasks, setTasks] = useState<SecurityV3Record[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const records = await listSecurityV3Records('security_confidential_tasks', {
        appends: ['subject', 'api_resource'],
        sort: ['-updatedAt', '-createdAt'],
      })
      setTasks(records.filter((record) => String(relationRecord(record.api_resource).resource_id || '') === resourceId && record.task_status !== 'archived'))
    } catch (currentError) {
      setError(toErrorMessage(currentError, '同态加密执行日志读取失败'))
    } finally {
      setLoading(false)
    }
  }, [resourceId])

  useEffect(() => { void refresh() }, [refresh])

  const events = useMemo(() => tasks.flatMap((task) => {
    const summary = relationRecord(task.execution_summary_json)
    const rawEvents = [
      ...(Array.isArray(summary.events) ? summary.events : []),
      ...(Array.isArray(summary.logs) ? summary.logs : []),
    ]
    const subject = relationRecord(task.subject)
    return rawEvents.map((rawEvent, index) => {
      const event = relationRecord(rawEvent)
      const duration = event.duration_ms ?? event.durationMs
      return {
        id: String(event.id || `${task.id || 'task'}-${index}`),
        taskId: String(task.id || ''),
        taskCode: sanitizeSecurityVisibleText(task.task_code),
        taskName: sanitizeSecurityVisibleText(task.task_name),
        subjectName: sanitizeSecurityVisibleText(subject.subject_name || '未关联'),
        time: String(event.time || event.created_at || event.createdAt || ''),
        stage: String(event.stage || 'queued'),
        result: String(event.result || 'pending'),
        message: sanitizeSecurityVisibleText(event.message || '任务状态已更新'),
        requestId: sanitizeSecurityVisibleText(event.request_id || event.requestId || ''),
        durationMs: duration == null || !Number.isFinite(Number(duration)) ? null : Number(duration),
      }
    })
  }).sort((left, right) => right.time.localeCompare(left.time)).slice(0, 10), [tasks])

  return (
    <section className="overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--surface-outline)] bg-[var(--table-header-bg)] px-4 py-3">
        <div>
          <h3 className="text-[0.875rem] font-semibold text-[var(--text-main)]">同态加密最近执行日志</h3>
          <p className="mt-1 text-[0.75rem] text-[var(--text-muted)]">展示当前数据资源最近 10 条真实任务阶段事件</p>
        </div>
        <Button variant="secondary" className="shrink-0 gap-2" onClick={() => void refresh()}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />刷新
        </Button>
      </div>
      {error ? <div className="m-4 rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1060px] border-collapse text-left text-[0.8125rem]">
          <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]"><tr>{['记录时间', '任务', '外部访问方', '阶段', '结果', '执行消息', '请求编号', '耗时'].map((label) => <th key={label} className="border-b border-[var(--line)] px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>{events.map((event) => (
            <tr key={`${event.taskId}-${event.id}`} className="border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-muted)]">
              <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{event.time ? event.time.slice(0, 19).replace('T', ' ') : '-'}</td>
              <td className="max-w-[220px] px-4 py-3.5"><div className="truncate font-medium text-[var(--text-main)]">{event.taskName || '-'}</div><div className="mt-1 truncate text-[0.72rem] text-[var(--text-muted)]">{event.taskCode || '-'}</div></td>
              <td className="px-4 py-3.5 text-[var(--text-secondary)]">{event.subjectName}</td>
              <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{stageLabels[event.stage] || '状态更新'}</td>
              <td className="px-4 py-3.5"><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.75rem]', resultTone(event.result))}>{event.result === 'success' ? '成功' : event.result === 'failed' ? '失败' : '处理中'}</span></td>
              <td className="max-w-[320px] px-4 py-3.5 text-[var(--text-secondary)]">{event.message}</td>
              <td className="px-4 py-3.5 text-[var(--text-secondary)]">{event.requestId || '-'}</td>
              <td className="whitespace-nowrap px-4 py-3.5 text-[var(--text-secondary)]">{event.durationMs == null ? '-' : `${event.durationMs} ms`}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {loading && !events.length ? <div className="px-4 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">正在读取同态加密执行日志...</div> : null}
      {!loading && !events.length && !error ? <div className="px-4 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">当前资源尚未产生同态加密执行日志</div> : null}
    </section>
  )
}

export function ResourceHomomorphicPanel({ resourceId, resourceCode, canManage }: ResourceHomomorphicPanelProps) {
  const config = useMemo<SecurityV3CollectionPageConfig>(() => ({
    module: 'resources',
    title: '同态加密任务',
    collection: 'security_confidential_tasks',
    appends: ['subject', 'api_resource', 'crypto_key'],
    rowFilter: (record) => {
      const api = record.api_resource as Record<string, unknown> | null | undefined
      return String(api?.resource_id || '') === resourceId && record.task_status !== 'archived'
    },
    readOnly: !canManage,
    canCreate: canManage,
    canEdit: (record) => record.task_status === 'pending',
    createLabel: '新建同态任务',
    emptyLabel: canManage ? '当前资源尚未创建同态计算任务。' : '当前资源尚无同态计算任务。',
    columns: [
      { key: 'task_code', label: '任务编号' },
      { key: 'task_name', label: '任务名称' },
      { key: 'subject', label: '外部访问方' },
      { key: 'api_resource', label: '密态服务通道' },
      { key: 'measure_field_code', label: '计算字段' },
      { key: 'algorithm', label: '算法', value: (record) => String(record.algorithm || '').toLowerCase() === 'bfv' ? '整数精确型' : '浮点近似型' },
      { key: 'operation', label: '操作', value: (record) => record.operation === 'mean' ? '平均值' : '求和' },
      { key: 'task_status', label: '状态', tone: 'status' },
      { key: 'progress', label: '进度', value: (record) => `${Number(record.progress || 0)}%` },
    ],
    fields: [
      { name: 'task_name', label: '任务名称', required: true, defaultValue: `${resourceCode} 同态聚合任务` },
      { name: 'subject_id', label: '外部访问方', required: true, relation: { collection: 'security_access_subjects', labelKey: 'subject_name', filter: { subject_type: 'external_party', subject_status: 'enabled' } } },
      { name: 'api_resource_id', label: '支持同态计算的已发布服务通道', required: true, relation: { collection: 'security_api_resources', labelKey: 'api_name', filter: { resource_id: resourceId, supports_homomorphic: true, api_status: 'enabled', publish_status: 'success' } } },
      { name: 'measure_field_code', label: '计算字段编码', required: true },
      { name: 'algorithm', label: '算法类型', type: 'select', required: true, defaultValue: 'ckks', options: [{ value: 'ckks', label: '浮点近似型' }, { value: 'bfv', label: '整数精确型' }] },
      { name: 'operation', label: '计算操作', type: 'select', required: true, defaultValue: 'sum', options: [{ value: 'sum', label: '求和' }, { value: 'mean', label: '平均值' }] },
      { name: 'region_scope_json', label: '数据所属区域', type: 'json', required: true, defaultValue: [] },
      { name: 'organization_scope_json', label: '组织数据范围', type: 'json', required: true, defaultValue: [] },
      { name: 'data_start_at', label: '数据开始时间', type: 'datetime', required: true },
      { name: 'data_end_at', label: '数据结束时间', type: 'datetime', required: true },
      { name: 'crypto_key_id', label: '有效公钥/计算密钥版本', required: true, relation: { collection: 'security_crypto_keys', labelKey: 'key_code', filter: { key_status: 'enabled' } } },
      { name: 'idempotency_key', label: '幂等键（可留空自动生成）' },
    ],
    transformSaveValues: (values, { mode }) => {
      if (mode === 'edit') return values
      const compact = taskCode()
      const algorithm = String(values.algorithm || 'ckks').toLowerCase() === 'bfv' ? 'bfv' : 'ckks'
      return {
        ...values,
        task_code: `HE-${algorithm === 'bfv' ? 'INT' : 'FLOAT'}-${compact}`,
        idempotency_key: values.idempotency_key || `resource-${resourceId}-${compact}`,
        scenario: '资源级跨域密态聚合',
        source_domain: '内部受控域',
        target_domain: '外部协作域',
        risk_level: 'normal',
        task_status: 'pending',
        progress: 0,
        sample_count: 0,
        execution_summary_json: { events: [{ time: new Date().toISOString(), stage: 'created', result: 'success', message: '任务配置已创建，等待同态计算引擎执行。' }] },
      }
    },
  }), [canManage, resourceCode, resourceId])

  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-4 py-3 text-[0.8125rem] leading-6 text-[var(--status-info-text)]">
        同态任务只配置真实执行所需信息：外部访问方、支持同态的已发布服务通道、计算字段、数据范围、时间窗口、求和/平均操作、算法和有效密钥版本。任务配置不保存私钥、Secret 或原始明文值。
      </div>
      <SecurityV3CollectionPage config={config} embedded />
    </div>
  )
}
