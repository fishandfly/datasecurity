import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock3,
  DatabaseZap,
  Filter,
  KeyRound,
  ListFilter,
  LockKeyhole,
  MonitorSmartphone,
  RefreshCw,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Workflow,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { AccessControlSecondaryTabs } from '../components/security-access-control-tabs'
import { Button } from '../components/ui'
import { useSecurityGovernancePolicies, type SecurityGovernancePolicyRecord } from '../lib/nocobase-security-governance'
import { cn } from '../lib/utils'

type TimeRange = '1h' | '24h' | '7d' | '30d' | 'custom'
type OperationType = '全部操作' | '数据访问' | '策略变更' | '用户登录' | '配置修改' | '数据接入' | '同态加密' | '权限变更' | '异常操作'
type RiskLevel = '全部' | '高风险' | '中风险' | '低风险' | '正常'
type ResultStatus = '成功' | '失败' | '被拒绝' | '需审批'

type AuditLogRecord = {
  id: string
  time: string
  userName: string
  userId: string
  userRole: string
  department: string
  email: string
  phone: string
  operationType: Exclude<OperationType, '全部操作'>
  objectName: string
  objectType: string
  objectId: string
  description: string
  result: ResultStatus
  risk: Exclude<RiskLevel, '全部'>
  ip: string
  location: string
  ipSource: '内网' | '外网' | 'VPN'
  device: string
  os: string
  client: string
  sessionId: string
  requestId: string
  durationMs: number
  policyName: string
  policyId: string
  decision: '通过' | '拒绝' | '需审批'
  decisionReason: string
  params: Record<string, unknown>
  beforeSnapshot: Record<string, unknown>
  afterSnapshot: Record<string, unknown>
  relatedUserEvents: string[]
  relatedResourceEvents: string[]
  auditNote: string
}

const timeRanges: Array<{ id: TimeRange; label: string }> = [
  { id: '1h', label: '最近1小时' },
  { id: '24h', label: '24小时' },
  { id: '7d', label: '7天' },
  { id: '30d', label: '30天' },
  { id: 'custom', label: '自定义' },
]

const operationTypes: OperationType[] = ['全部操作', '数据访问', '策略变更', '用户登录', '配置修改', '数据接入', '同态加密', '权限变更', '异常操作']
const riskLevels: RiskLevel[] = ['全部', '高风险', '中风险', '低风险', '正常']
const pageSizeOptions = [20, 50, 100]

function formatDateTime(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''
  const next = new Date(normalized)
  if (Number.isNaN(next.getTime())) return normalized
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())} ${pad(next.getHours())}:${pad(next.getMinutes())}:${pad(next.getSeconds())}`
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : []
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = String(value ?? '').trim() as T
  return allowed.includes(normalized) ? normalized : fallback
}

function parseAuditLog(value: unknown, policy: SecurityGovernancePolicyRecord, index: number): AuditLogRecord {
  const raw = normalizeRecord(value)
  return {
    id: String(raw.id ?? `AUD-${policy.policyCode}-${index + 1}`),
    time: formatDateTime(String(raw.time ?? policy.updatedAt)),
    userName: String(raw.userName ?? '未记录用户'),
    userId: String(raw.userId ?? ''),
    userRole: String(raw.userRole ?? '未标注'),
    department: String(raw.department ?? policy.securityOwnerDept ?? '未指定责任部门'),
    email: String(raw.email ?? ''),
    phone: String(raw.phone ?? ''),
    operationType: normalizeEnum(raw.operationType, operationTypes.filter((item): item is AuditLogRecord['operationType'] => item !== '全部操作'), '数据访问'),
    objectName: String(raw.objectName ?? policy.resourceName ?? policy.policyName),
    objectType: String(raw.objectType ?? '量测数据资源'),
    objectId: String(raw.objectId ?? policy.resourceId),
    description: String(raw.description ?? ''),
    result: normalizeEnum(raw.result, ['成功', '失败', '被拒绝', '需审批'] as const, '成功'),
    risk: normalizeEnum(raw.risk, ['高风险', '中风险', '低风险', '正常'] as const, '正常'),
    ip: String(raw.ip ?? ''),
    location: String(raw.location ?? '未记录'),
    ipSource: normalizeEnum(raw.ipSource, ['内网', '外网', 'VPN'] as const, '内网'),
    device: String(raw.device ?? '未记录'),
    os: String(raw.os ?? '未记录'),
    client: String(raw.client ?? '未记录'),
    sessionId: String(raw.sessionId ?? ''),
    requestId: String(raw.requestId ?? ''),
    durationMs: Number.isFinite(Number(raw.durationMs)) ? Number(raw.durationMs) : 0,
    policyName: String(raw.policyName ?? policy.policyName),
    policyId: String(raw.policyId ?? policy.policyCode ?? policy.id),
    decision: normalizeEnum(raw.decision, ['通过', '拒绝', '需审批'] as const, '通过'),
    decisionReason: String(raw.decisionReason ?? ''),
    params: normalizeRecord(raw.params),
    beforeSnapshot: normalizeRecord(raw.beforeSnapshot),
    afterSnapshot: normalizeRecord(raw.afterSnapshot),
    relatedUserEvents: normalizeStringArray(raw.relatedUserEvents),
    relatedResourceEvents: normalizeStringArray(raw.relatedResourceEvents),
    auditNote: String(raw.auditNote ?? ''),
  }
}

function buildAuditLogs(policies: SecurityGovernancePolicyRecord[]): AuditLogRecord[] {
  return policies
    .flatMap((policy) => {
      const accessEvents = policy.policyDetailJson.accessEvents
      return Array.isArray(accessEvents)
        ? accessEvents.map((event, index) => parseAuditLog(event, policy, index))
        : []
    })
    .sort((left, right) => right.time.localeCompare(left.time))
}

function riskTone(risk: AuditLogRecord['risk']) {
  switch (risk) {
    case '高风险':
      return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
    case '中风险':
      return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
    case '低风险':
      return 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
    default:
      return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  }
}

function resultTone(result: ResultStatus) {
  switch (result) {
    case '失败':
    case '被拒绝':
      return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
    case '需审批':
      return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
    default:
      return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  }
}

function operationIcon(operationType: AuditLogRecord['operationType']) {
  switch (operationType) {
    case '数据访问':
      return DatabaseZap
    case '策略变更':
      return Workflow
    case '用户登录':
      return UserRound
    case '配置修改':
      return ListFilter
    case '数据接入':
      return RefreshCw
    case '同态加密':
      return LockKeyhole
    case '权限变更':
      return KeyRound
    default:
      return ShieldAlert
  }
}

function countLogsBy<T extends string>(logs: AuditLogRecord[], read: (log: AuditLogRecord) => T) {
  const counts = new Map<T, number>()
  logs.forEach((log) => counts.set(read(log), (counts.get(read(log)) ?? 0) + 1))
  return counts
}

function DonutChart({ logs }: { logs: AuditLogRecord[] }) {
  const counts = countLogsBy(logs, (log) => log.operationType)
  const entries = Array.from(counts.entries()).slice(0, 5)
  const total = Math.max(logs.length, 1)
  let offset = 0
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const colors = ['#3b82f6', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6']

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 112 112" className="h-28 w-28 shrink-0 -rotate-90" aria-label="操作类型分布">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--surface-muted)" strokeWidth="14" />
        {entries.map(([label, count], index) => {
          const dash = (count / total) * circumference
          const segment = (
            <circle
              key={label}
              cx="56"
              cy="56"
              r={radius}
              fill="none"
              stroke={colors[index]}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          )
          offset += dash
          return segment
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        {entries.map(([label, count], index) => (
          <div key={label} className="flex items-center justify-between gap-3 text-[0.8125rem]">
            <span className="flex min-w-0 items-center gap-2 text-[var(--text-secondary)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index] }} />
              <span className="truncate">{label}</span>
            </span>
            <span className="font-medium text-[var(--text-main)]">{Math.round((count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PeakBars({ logs }: { logs: AuditLogRecord[] }) {
  const buckets = [0, 0, 0, 0, 0, 0]
  logs.forEach((log) => {
    const hour = Number(log.time.slice(11, 13))
    const bucket = Math.min(Math.floor(hour / 4), buckets.length - 1)
    buckets[bucket] += 1
  })
  const max = Math.max(...buckets, 1)

  return (
    <div className="flex h-28 items-end gap-2 border-b border-[var(--line)] px-1">
      {buckets.map((count, index) => (
        <div key={`${index}-${count}`} className="flex flex-1 flex-col items-center gap-2">
          <div className="w-full rounded-t-[4px] bg-[linear-gradient(180deg,#60a5fa,#2563eb)]" style={{ height: `${Math.max(12, (count / max) * 100)}%` }} title={`${count} 条`} />
          <span className="text-[0.68rem] text-[var(--text-muted)]">{index * 4}:00</span>
        </div>
      ))}
    </div>
  )
}

function AuditQueryActions({
  advancedExpanded,
  onToggleAdvanced,
}: {
  advancedExpanded: boolean
  onToggleAdvanced: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button variant={advancedExpanded ? 'primary' : 'secondary'} className="gap-2" onClick={onToggleAdvanced}>
        <Filter className="h-4 w-4" />
        高级搜索
      </Button>
    </div>
  )
}

function JsonBlock({ value }: { value: Record<string, unknown> }) {
  return (
    <pre className="max-h-56 overflow-auto rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function LogDetailDrawer({
  log,
  onClose,
}: {
  log: AuditLogRecord | null
  onClose: () => void
}) {
  if (!log) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-dvh max-h-dvh w-full max-w-[620px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-strong)]">
        <div className="flex items-start justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <div className="text-[0.75rem] text-[var(--text-muted)]">日志详情</div>
            <h2 className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{log.id}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', riskTone(log.risk))}>{log.risk}</span>
              <span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', resultTone(log.result))}>{log.result}</span>
            </div>
          </div>
          <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="grid gap-3 sm:grid-cols-2">
            {[
              ['操作时间', `${log.time}.238`],
              ['操作类型', log.operationType],
              ['操作对象', `${log.objectName} / ${log.objectType}`],
              ['操作耗时', `${log.durationMs} ms`],
            ].map(([title, value]) => (
              <div key={title} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
                <div className="mt-1 font-medium text-[var(--text-main)]">{value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">操作人信息</h3>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--primary)]">{log.userName.slice(0, 1)}</div>
              <div className="min-w-0">
                <div className="font-medium text-[var(--text-main)]">{log.userName} · {log.userId}</div>
                <div className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">{log.userRole} / {log.department}</div>
                <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">{log.email} · {log.phone}</div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">操作内容</h3>
            <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-[0.875rem] leading-7 text-[var(--text-secondary)]">{log.description}</div>
            <JsonBlock value={log.params} />
            <div className="grid gap-3 sm:grid-cols-2">
              <JsonBlock value={log.beforeSnapshot} />
              <JsonBlock value={log.afterSnapshot} />
            </div>
          </section>

          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">上下文信息</h3>
            <div className="mt-3 grid gap-3 text-[0.8125rem] sm:grid-cols-2">
              <div className="text-[var(--text-secondary)]">来源 IP：{log.ip} / {log.location}</div>
              <div className="text-[var(--text-secondary)]">设备：{log.device} / {log.os}</div>
              <div className="text-[var(--text-secondary)]">客户端：{log.client}</div>
              <div className="text-[var(--text-secondary)]">会话：{log.sessionId}</div>
              <div className="text-[var(--text-secondary)] sm:col-span-2">请求 ID：{log.requestId}</div>
            </div>
          </section>

          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">安全决策信息</h3>
            <div className="mt-3 space-y-2 text-[0.8125rem] text-[var(--text-secondary)]">
              <div>匹配策略：{log.policyName} / {log.policyId}</div>
              <div>策略决策：{log.decision}</div>
              <div>决策理由：{log.decisionReason}</div>
              <div>异常检测：{log.risk === '高风险' ? '命中高风险访问模型' : '未发现异常模型命中'}</div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">该用户近期相关操作</h3>
              <div className="mt-3 space-y-2 text-[0.8125rem] text-[var(--text-secondary)]">
                {log.relatedUserEvents.map((event) => <div key={event}>· {event}</div>)}
              </div>
            </div>
            <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">该资源近期记录</h3>
              <div className="mt-3 space-y-2 text-[0.8125rem] text-[var(--text-secondary)]">
                {log.relatedResourceEvents.map((event) => <div key={event}>· {event}</div>)}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">审计备注</h3>
            <textarea className="min-h-20 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[0.875rem] outline-none" defaultValue={log.auditNote} placeholder="添加审计备注" />
            <Button variant="secondary">保存备注</Button>
          </section>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] px-6 py-4">
          <Button variant="secondary" onClick={onClose}>关闭</Button>
          <Button variant="secondary">标记为已审计</Button>
          <Button>标记为证据</Button>
        </div>
      </aside>
    </div>
  )
}

function AdvancedFilterPanel({
  expanded,
  onApply,
  onReset,
}: {
  expanded: boolean
  onApply: () => void
  onReset: () => void
}) {
  if (!expanded) return null

  return (
    <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
      <div className="grid gap-4 2xl:grid-cols-4">
        <div className="space-y-3">
          <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">用户筛选</h3>
          <input className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" placeholder="用户姓名" />
          <input className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" placeholder="用户ID" />
          <select className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none">
            <option>全部角色</option>
            <option>责任人</option>
            <option>业务用户</option>
          </select>
        </div>
        <div className="space-y-3">
          <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">操作对象</h3>
          <input className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" placeholder="数据源 / 资源名称" />
          <input className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" placeholder="数据标签" />
          <div className="grid grid-cols-2 gap-2">
            <input className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" placeholder="最小数据量" />
            <input className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" placeholder="最大数据量" />
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">结果与 IP</h3>
          <div className="grid grid-cols-2 gap-2">
            {(['成功', '失败', '被拒绝', '需审批'] as ResultStatus[]).map((item) => (
              <label key={item} className="flex items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-[0.8125rem] text-[var(--text-secondary)]">
                <input type="radio" name="advanced-result" />
                {item}
              </label>
            ))}
          </div>
          <input className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" placeholder="IP 地址或 IP 段" />
          <select className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none">
            <option>全部来源</option>
            <option>内网</option>
            <option>外网</option>
            <option>VPN</option>
          </select>
        </div>
        <div className="space-y-3">
          <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">全文搜索</h3>
          <textarea className="min-h-[132px] w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-[0.875rem] outline-none" placeholder="搜索操作描述、操作参数、策略决策理由" />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onApply}>应用筛选</Button>
            <Button variant="secondary" className="flex-1" onClick={onReset}>重置筛选</Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export function SecurityLogQueryPage() {
  const { data: securityPolicies, isLoading: isSecurityLoading } = useSecurityGovernancePolicies(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [operationType, setOperationType] = useState<OperationType>('全部操作')
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('全部')
  const [keyword, setKeyword] = useState('')
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
  const [expandedLogId, setExpandedLogId] = useState('')
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null)
  const [pageSize, setPageSize] = useState(20)

  const logs = useMemo(() => buildAuditLogs(securityPolicies), [securityPolicies])
  const filteredLogs = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return logs
      .filter((log) => operationType === '全部操作' || log.operationType === operationType)
      .filter((log) => riskLevel === '全部' || log.risk === riskLevel)
      .filter((log) => {
        if (!normalizedKeyword) return true
        return [
          log.id,
          log.userName,
          log.userId,
          log.department,
          log.objectName,
          log.objectType,
          log.description,
          log.policyName,
          log.ip,
          JSON.stringify(log.params),
        ].some((value) => value.toLowerCase().includes(normalizedKeyword))
      })
  }, [keyword, logs, operationType, riskLevel])

  const visibleLogs = filteredLogs.slice(0, pageSize)
  const loading = isSecurityLoading
  const riskCount = filteredLogs.filter((log) => log.risk !== '正常').length

  const resetFilters = () => {
    setTimeRange('24h')
    setOperationType('全部操作')
    setRiskLevel('全部')
    setKeyword('')
  }

  return (
    <>
      <div className="space-y-5">
        <AccessControlSecondaryTabs
          actions={
            <AuditQueryActions
              advancedExpanded={advancedExpanded}
              onToggleAdvanced={() => setAdvancedExpanded((value) => !value)}
            />
          }
        />

        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-[0.75rem] text-[var(--text-muted)]">时间范围</div>
              <div className="flex flex-wrap gap-2">
                {timeRanges.map((range) => (
                  <button
                    key={range.id}
                    type="button"
                    className={cn(
                      'rounded-[8px] border px-3 py-2 text-[0.8125rem] transition',
                      timeRange === range.id
                        ? 'border-[rgba(var(--theme-soft-rgb),0.32)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] !text-white'
                        : 'border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--primary)]',
                    )}
                    onClick={() => setTimeRange(range.id)}
                  >
                    {range.label}
                  </button>
                ))}
                <input type="datetime-local" className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.8125rem] text-[var(--text-secondary)] outline-none" />
                <input type="datetime-local" className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.8125rem] text-[var(--text-secondary)] outline-none" />
              </div>
            </div>
            <div>
              <div className="mb-2 text-[0.75rem] text-[var(--text-muted)]">操作类型</div>
              <div className="flex flex-wrap gap-2">
                {operationTypes.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[0.8125rem] transition',
                      operationType === item
                        ? 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
                        : 'border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--primary)]',
                    )}
                    onClick={() => setOperationType(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[0.75rem] text-[var(--text-muted)]">风险等级</div>
              <div className="flex flex-wrap gap-2">
                {riskLevels.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[0.8125rem] transition',
                      riskLevel === item
                        ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
                        : 'border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--primary)]',
                    )}
                    onClick={() => setRiskLevel(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <AdvancedFilterPanel expanded={advancedExpanded} onApply={() => setAdvancedExpanded(false)} onReset={resetFilters} />

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <div className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]">
                <ScrollText className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[0.75rem] text-[var(--text-muted)]">本次查询总记录数</div>
                <div className="mt-1 text-[1.5rem] font-semibold text-[var(--text-main)]">{filteredLogs.length.toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-3 text-[0.8125rem] text-[var(--text-secondary)]">读取后台安全档案中的结构化访问事件。</div>
          </div>
          <div className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#ef4444]/10 text-[#ef4444]">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[0.75rem] text-[var(--text-muted)]">风险操作数量</div>
                <div className="mt-1 text-[1.5rem] font-semibold text-[var(--text-main)]">{riskCount.toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-3 text-[0.8125rem] text-[var(--text-secondary)]">高 {filteredLogs.filter((log) => log.risk === '高风险').length} / 中 {filteredLogs.filter((log) => log.risk === '中风险').length} / 低 {filteredLogs.filter((log) => log.risk === '低风险').length}</div>
          </div>
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
            <div className="mb-3 flex items-center gap-2 text-[0.875rem] font-semibold text-[var(--text-main)]">
              <BarChart3 className="h-4 w-4 text-[var(--primary)]" />
              操作类型分布
            </div>
            <DonutChart logs={filteredLogs} />
          </div>
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
            <div className="mb-3 flex items-center gap-2 text-[0.875rem] font-semibold text-[var(--text-main)]">
              <Clock3 className="h-4 w-4 text-[var(--primary)]" />
              操作高峰时段
            </div>
            <PeakBars logs={filteredLogs} />
          </div>
        </div>

        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_auto]">
            <label className="flex h-10 min-w-0 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3">
              <Search className="h-4 w-4 text-[var(--text-muted)]" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                placeholder="搜索操作描述、操作对象、用户、IP 或策略"
              />
            </label>
            <Button variant="secondary" className="gap-2" onClick={resetFilters}>
              <Filter className="h-4 w-4" />
              重置筛选
            </Button>
          </div>
        </section>

        {loading ? (
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">
            正在加载审计日志...
          </div>
        ) : null}

        <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
          <div className="grid grid-cols-[150px_170px_132px_minmax(180px,1fr)_minmax(260px,1.5fr)_100px_100px_150px_116px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]">
            <span>操作时间</span>
            <span>操作人</span>
            <span>操作类型</span>
            <span>操作对象</span>
            <span>操作描述</span>
            <span>操作结果</span>
            <span>风险等级</span>
            <span>IP地址</span>
            <span>操作详情</span>
          </div>
          <div className="overflow-x-auto">
            {visibleLogs.map((log) => {
              const Icon = operationIcon(log.operationType)
              const expanded = expandedLogId === log.id
              return (
                <div key={log.id} className="min-w-[1376px] border-b border-[var(--line)]">
                  <div className="grid grid-cols-[150px_170px_132px_minmax(180px,1fr)_minmax(260px,1.5fr)_100px_100px_150px_116px] gap-3 px-4 py-3 text-[0.8125rem]">
                    <span className="text-[var(--text-secondary)]">{log.time}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--primary)]">{log.userName.slice(0, 1)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[var(--text-main)]">{log.userName}</span>
                        <span className="block truncate text-[0.75rem] text-[var(--text-muted)]">{log.userId}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <Icon className="h-4 w-4 text-[var(--primary)]" />
                      {log.operationType}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[var(--text-main)]">{log.objectName}</span>
                      <span className="block truncate text-[0.75rem] text-[var(--text-muted)]">{log.objectType}</span>
                    </span>
                    <span className="min-w-0 truncate text-[var(--text-secondary)]" title={log.description}>{log.description}</span>
                    <span><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.75rem] font-medium', resultTone(log.result))}>{log.result}</span></span>
                    <span><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.75rem] font-medium', riskTone(log.risk))}>{log.risk}</span></span>
                    <span className="min-w-0">
                      <span className="block truncate text-[var(--text-main)]">{log.ip}</span>
                      <span className="block truncate text-[0.75rem] text-[var(--text-muted)]">{log.location}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <button type="button" className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]" onClick={() => setExpandedLogId(expanded ? '' : log.id)}>
                        <ChevronDown className={cn('h-4 w-4 transition', expanded ? 'rotate-180' : '')} />
                      </button>
                      <button type="button" className="rounded-[6px] px-2 py-1.5 text-[var(--primary)] hover:bg-[var(--surface-muted)]" onClick={() => setSelectedLog(log)}>详情</button>
                    </span>
                  </div>
                  {expanded ? (
                    <div className="grid gap-4 border-t border-[var(--line)] bg-[var(--surface-muted)] px-16 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px]">
                      <div>
                        <div className="mb-2 text-[0.75rem] font-medium text-[var(--text-muted)]">完整操作参数 JSON</div>
                        <JsonBlock value={log.params} />
                      </div>
                      <div>
                        <div className="mb-2 text-[0.75rem] font-medium text-[var(--text-muted)]">操作前后数据对比</div>
                        <JsonBlock value={{ before: log.beforeSnapshot, after: log.afterSnapshot }} />
                      </div>
                      <div className="space-y-2 text-[0.8125rem] text-[var(--text-secondary)]">
                        <div className="font-medium text-[var(--text-main)]">关联策略规则信息</div>
                        <div>{log.policyName}</div>
                        <div>耗时：{log.durationMs} ms</div>
                        <div className="flex items-center gap-2">
                          <MonitorSmartphone className="h-4 w-4 text-[var(--primary)]" />
                          {log.device} / {log.client}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[0.8125rem] text-[var(--text-secondary)]">
            <span>共 {filteredLogs.length.toLocaleString()} 条日志，当前显示 {visibleLogs.length.toLocaleString()} 条</span>
            <div className="flex items-center gap-2">
              <span>每页</span>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-2 outline-none">
                {pageSizeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <Button variant="secondary">上一页</Button>
              <Button variant="secondary">下一页</Button>
            </div>
          </div>
        </section>
      </div>
      <LogDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </>
  )
}
