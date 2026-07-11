import {
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronDown,
  Clock3,
  DatabaseZap,
  Download,
  FileDown,
  FileSearch,
  FileText,
  GitBranch,
  ListFilter,
  Maximize2,
  Network,
  PanelRight,
  Play,
  RefreshCw,
  Search,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Timer,
  UserRound,
  Workflow,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../components/ui'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { useSecurityGovernancePolicies, type SecurityGovernancePolicyRecord } from '../lib/nocobase-security-governance'
import { usePortalContext } from '../lib/portal-context'
import { joinSecurityGovernanceItems, resolveSecurityScopeLabel, type SecurityGovernanceJoinedItem } from '../lib/security-governance'
import { cn } from '../lib/utils'

type TraceView = 'timeline' | 'graph' | 'table'
type TraceDimension = 'data-object' | 'user-operation' | 'time-range' | 'security-event'
type TraceRisk = '高风险' | '中风险' | '低风险' | '正常'
type TraceResult = '成功' | '失败' | '被拒绝' | '需审批'
type TraceOperationType = '数据接入' | '数据访问' | '策略校验' | '权限变更' | '数据导出' | '同态加密' | '异常阻断'
type GraphLayout = 'force' | 'hierarchy' | 'circle'
type RelationFilter = 'direct' | 'all'

type TraceNode = {
  id: string
  seq: number
  time: string
  level: number
  operationType: TraceOperationType
  userName: string
  userId: string
  userType: '内部用户' | '外部用户'
  department: string
  objectName: string
  objectType: string
  dataSource: string
  description: string
  previousId: string
  nextIds: string[]
  risk: TraceRisk
  result: TraceResult
  params: Record<string, string>
  decisionReason: string
  volume: number
}

const traceViews: Array<{ id: TraceView; label: string; icon: LucideIcon }> = [
  { id: 'timeline', label: '时间线视图', icon: GitBranch },
  { id: 'graph', label: '关系图谱视图', icon: Network },
  { id: 'table', label: '表格视图', icon: Table2 },
]

const traceDimensions: Array<{ id: TraceDimension; label: string }> = [
  { id: 'data-object', label: '按数据对象追溯' },
  { id: 'user-operation', label: '按用户操作追溯' },
  { id: 'time-range', label: '按时间范围追溯' },
  { id: 'security-event', label: '按安全事件追溯' },
]

const operationTypes: TraceOperationType[] = ['数据接入', '数据访问', '策略校验', '权限变更', '数据导出', '同态加密', '异常阻断']
const riskFilters: Array<'全部' | TraceRisk> = ['全部', '高风险', '中风险', '低风险', '正常']
const auditSecondaryNavItems = [
  { id: 'query', label: '审计日志查询', path: '/security-governance/audit/log-query', icon: FileSearch },
  { id: 'trace', label: '操作链路追溯', path: '/security-governance/audit/trace', icon: Network },
  { id: 'report', label: '审计报告生成', path: '/security-governance/audit/report', icon: FileDown },
]

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function formatDateTime(value: string | null | undefined, offsetMinutes = 0) {
  const normalized = normalizeText(value)
  const base = normalized ? Date.parse(normalized) : 0
  if (!Number.isFinite(base) || base <= 0) return ''
  const next = new Date(base - offsetMinutes * 1000 * 60)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())} ${pad(next.getHours())}:${pad(next.getMinutes())}:${pad(next.getSeconds())}`
}

function inferDataSource(item: SecurityGovernanceJoinedItem) {
  const text = `${item.name} ${item.department} ${item.category} ${item.informationCategory}`
  if (/用采|计量|采集|用电|电量/.test(text)) return '用采2.0系统'
  if (/调控|运行|负荷|告警/.test(text)) return '调控云'
  if (/历史|归档|报表/.test(text)) return '历史数据库'
  if (/接口|外部|客户|营销|网上/.test(text)) return '第三方接口'
  return item.department || item.category || '未标注来源'
}

function resolveRisk(item: SecurityGovernanceJoinedItem): TraceRisk {
  if (item.coreControlFlag || item.approvalRequired) return '高风险'
  if (item.importantDataFlag || item.sensitiveFieldCount > 0) return '中风险'
  if (item.desensitizationRequired) return '低风险'
  return '正常'
}

function resolveResult(risk: TraceRisk, item: SecurityGovernanceJoinedItem, operationType: TraceOperationType): TraceResult {
  if (operationType === '异常阻断' || risk === '高风险') return '被拒绝'
  if (item.policyStatus === 'disabled') return '失败'
  if (item.approvalRequired || operationType === '数据导出') return '需审批'
  return '成功'
}

function riskTone(risk: TraceRisk) {
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

function resultTone(result: TraceResult) {
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

function AuditSecondaryTabs({ withEmbed, actions }: { withEmbed: (path: string) => string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <nav
        aria-label="日志链路审计二级导航"
        className="inline-flex flex-wrap gap-2 rounded-[18px] border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[color-mix(in_srgb,var(--surface-glass)_92%,transparent)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur"
      >
        {auditSecondaryNavItems.map((item) => {
          const active = item.id === 'trace'

          return (
            <Link
              key={item.id}
              to={withEmbed(item.path)}
              className={cn(
                'inline-flex min-h-11 items-center gap-3 whitespace-nowrap rounded-[14px] px-4 py-3 text-[0.875rem] font-medium transition',
                active
                  ? 'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] !text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.20)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]',
              )}
            >
              <item.icon className={cn('h-4 w-4', active ? '!text-white' : '')} />
              <span className={active ? '!text-white' : ''}>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      {actions ? <div className="flex flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
    </div>
  )
}

function operationIcon(type: TraceOperationType) {
  switch (type) {
    case '数据接入':
      return DatabaseZap
    case '数据访问':
      return Search
    case '策略校验':
      return ShieldCheck
    case '权限变更':
      return UserRound
    case '数据导出':
      return Download
    case '同态加密':
      return Workflow
    default:
      return ShieldAlert
  }
}

function createTraceNode(
  item: SecurityGovernanceJoinedItem,
  policy: SecurityGovernancePolicyRecord | undefined,
  index: number,
  operationType: TraceOperationType,
  previousId: string,
): TraceNode {
  const risk = resolveRisk(item)
  const result = resolveResult(risk, item, operationType)
  const userName = item.securityOwnerUserName || '未指定责任人'
  const id = `TRACE-${String(index + 1).padStart(4, '0')}`

  return {
    id,
    seq: index + 1,
    time: formatDateTime(policy?.updatedAt || item.updateTime, index * 3),
    level: previousId ? 2 : 1,
    operationType,
    userName,
    userId: '',
    userType: userName.startsWith('svc') ? '外部用户' : '内部用户',
    department: item.securityOwnerDept || item.department || '未指定责任部门',
    objectName: operationType === '策略校验' ? (policy?.policyName || `${item.securityCategory || '安全'}策略`) : item.name,
    objectType: operationType === '策略校验' ? '访问控制策略' : operationType === '数据接入' ? '数据源' : '数据对象',
    dataSource: inferDataSource(item),
    description:
      operationType === '数据接入'
        ? `完成 ${item.name} 接入校验，记录字段安全画像。`
        : operationType === '策略校验'
          ? `匹配 ${policy?.policyName || item.securityCategory || '访问控制策略'}，输出安全决策。`
          : operationType === '数据导出'
            ? `发起 ${item.name} 导出请求，校验导出范围与脱敏规则。`
            : operationType === '异常阻断'
              ? `访问 ${item.name} 时命中异常模型，链路被阻断。`
            : `${userName} 对 ${item.name} 执行${operationType}操作。`,
    previousId,
    nextIds: [],
    risk,
    result,
    params: {
      accessScope: resolveSecurityScopeLabel(item.accessScope),
      shareScope: resolveSecurityScopeLabel(item.shareScope),
      exportScope: resolveSecurityScopeLabel(item.exportScope),
      desensitization: resolveSecurityScopeLabel(item.desensitizationMode),
    },
    decisionReason: risk === '高风险' ? '命中高敏感访问、异常来源或频繁操作规则。' : '匹配常规访问策略并写入审计日志。',
    volume: 24 + ((index * 31 + item.fieldCount) % 420),
  }
}

function buildTraceNodes(
  policies: SecurityGovernancePolicyRecord[],
  joinedItems: SecurityGovernanceJoinedItem[],
): TraceNode[] {
  const nodes = joinedItems.map((item, itemIndex) => {
    const policy = policies.find((row) => row.id === item.policyId)
    const operationType: TraceOperationType = item.policyStatus === 'disabled'
      ? '异常阻断'
      : item.approvalRequired
        ? '数据导出'
        : item.desensitizationRequired
          ? '策略校验'
          : '数据接入'
    return createTraceNode(item, policy, itemIndex, operationType, '')
  })

  return nodes.sort((left, right) => left.seq - right.seq)
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  tone = 'primary',
}: {
  title: string
  value: string
  detail: string
  icon: ReactNode
  tone?: 'primary' | 'success' | 'warning' | 'danger'
}) {
  const toneClass = {
    primary: 'bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]',
    success: 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
    warning: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]',
    danger: 'bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]',
  }[tone]

  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]', toneClass)}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
          <div className="mt-1 truncate text-[1.45rem] font-semibold text-[var(--text-main)]">{value}</div>
        </div>
      </div>
      <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{detail}</div>
    </div>
  )
}

function QueryPanel({
  dimension,
  setDimension,
  traceDepthBack,
  traceDepthForward,
  setTraceDepthBack,
  setTraceDepthForward,
  dataSources,
  users,
  nodes,
  timeWindow,
  onReset,
}: {
  dimension: TraceDimension
  setDimension: (value: TraceDimension) => void
  traceDepthBack: number
  traceDepthForward: number
  setTraceDepthBack: (value: number) => void
  setTraceDepthForward: (value: number) => void
  dataSources: string[]
  users: string[]
  nodes: TraceNode[]
  timeWindow: string
  onReset: () => void
}) {
  return (
    <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap gap-2">
        {traceDimensions.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              'rounded-[8px] border px-4 py-2 text-[0.8125rem] transition',
              dimension === item.id
                ? 'border-[rgba(var(--theme-soft-rgb),0.28)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] !text-white shadow-[0_10px_20px_rgba(var(--theme-strong-rgb),0.16)]'
                : 'border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--primary)]',
            )}
            onClick={() => setDimension(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 2xl:grid-cols-[repeat(3,minmax(160px,1fr))_repeat(2,120px)_auto]">
        {dimension === 'data-object' ? (
          <>
            <select className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none">
              {dataSources.length > 0 ? dataSources.map((item) => <option key={item}>{item}</option>) : <option>暂无数据源</option>}
            </select>
            <input className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" placeholder="数据ID / 数据标签 / 数据表名" />
            <input className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" value={timeWindow} readOnly placeholder="暂无时间窗口" />
          </>
        ) : null}
        {dimension === 'user-operation' ? (
          <>
            <select className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none">
              {users.length > 0 ? users.map((item) => <option key={item}>{item}</option>) : <option>暂无责任人</option>}
            </select>
            <select className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none">
              <option>数据访问、数据导出、异常阻断</option>
              {operationTypes.map((item) => <option key={item}>{item}</option>)}
            </select>
            <input className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" value={timeWindow} readOnly placeholder="暂无时间窗口" />
          </>
        ) : null}
        {dimension === 'time-range' ? (
          <>
            <input type="datetime-local" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" />
            <input type="datetime-local" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" />
            <select className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none">
              <option>全部操作类型</option>
              {operationTypes.map((item) => <option key={item}>{item}</option>)}
            </select>
          </>
        ) : null}
        {dimension === 'security-event' ? (
          <>
            <input className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" placeholder="事件ID" />
            <select className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none">
              {nodes.length > 0 ? nodes.slice(0, 5).map((node) => <option key={node.id}>{node.operationType} / {node.objectName}</option>) : <option>暂无安全事件</option>}
            </select>
            <input className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none" value={timeWindow} readOnly placeholder="暂无时间窗口" />
          </>
        ) : null}
        <input
          type="number"
          min={1}
          max={10}
          value={traceDepthBack}
          onChange={(event) => setTraceDepthBack(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
          className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none"
          aria-label="向前追溯步数"
        />
        <input
          type="number"
          min={1}
          max={10}
          value={traceDepthForward}
          onChange={(event) => setTraceDepthForward(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
          className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none"
          aria-label="向后追溯步数"
        />
        <div className="flex gap-2">
          <Button className="h-10 shrink-0 gap-2">
            <Search className="h-4 w-4" />
            开始追溯
          </Button>
          <Button variant="secondary" className="h-10 shrink-0 gap-2" onClick={onReset}>
            <RefreshCw className="h-4 w-4" />
            重置条件
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[0.75rem] text-[var(--text-muted)]">
        <span>向前追溯 {traceDepthBack} 步</span>
        <span>向后追溯 {traceDepthForward} 步</span>
        <span>时间窗口：{timeWindow || '暂无后台时间记录'}</span>
      </div>
    </section>
  )
}

function TimelineView({
  nodes,
  selectedNodeId,
  onSelect,
  zoom,
  setZoom,
  playbackSpeed,
  setPlaybackSpeed,
}: {
  nodes: TraceNode[]
  selectedNodeId: string
  onSelect: (id: string) => void
  zoom: number
  setZoom: (value: number) => void
  playbackSpeed: number
  setPlaybackSpeed: (value: number) => void
}) {
  return (
    <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-[1rem] font-semibold text-[var(--text-main)]">时间线画布</h2>
          <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">按操作发生顺序串联前置引用、后续影响和风险节点</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="range" min={0} max={100} defaultValue={78} className="w-36 accent-[var(--primary)]" aria-label="时间范围滑块" />
          <Button variant="secondary" className="h-9 px-3 py-0" onClick={() => setZoom(Math.max(1, zoom - 1))}><ZoomOut className="h-4 w-4" /></Button>
          <Button variant="secondary" className="h-9 px-3 py-0" onClick={() => setZoom(Math.min(5, zoom + 1))}><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="secondary" className="h-9 gap-2 px-3 py-0"><Play className="h-4 w-4" />自动播放</Button>
          <select value={playbackSpeed} onChange={(event) => setPlaybackSpeed(Number(event.target.value))} className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-2 text-[0.8125rem] outline-none">
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>
      </div>
      <div className="relative px-4 py-5">
        <div className="absolute bottom-5 left-[7.25rem] top-5 w-px bg-[var(--line)]" />
        <div className="space-y-4">
          {nodes.map((node, index) => {
            const Icon = operationIcon(node.operationType)
            const selected = selectedNodeId === node.id
            return (
              <button
                key={node.id}
                type="button"
                className={cn(
                  'relative grid w-full gap-3 rounded-[8px] border p-4 text-left transition lg:grid-cols-[104px_34px_minmax(0,1fr)]',
                  selected ? 'border-[rgba(var(--theme-soft-rgb),0.34)] bg-[var(--status-info-bg)] shadow-[var(--shadow-medium)]' : 'border-[var(--line)] bg-[var(--surface-muted)] hover:border-[var(--primary)]',
                )}
                onClick={() => onSelect(node.id)}
              >
                <div className="text-[0.75rem] text-[var(--text-muted)]">
                  <div>{node.time.slice(11, 19)}</div>
                  <div className="mt-1">{node.time.slice(0, 10)}</div>
                </div>
                <div className={cn('relative z-10 flex h-8 w-8 items-center justify-center rounded-full border', riskTone(node.risk))}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--text-main)]">{node.operationType}</span>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[0.72rem]', riskTone(node.risk))}>{node.risk}</span>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[0.72rem]', resultTone(node.result))}>{node.result}</span>
                    {node.risk === '高风险' || node.result === '被拒绝' ? <span className="rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 text-[0.72rem] text-[var(--status-warning-text)]">关键节点</span> : null}
                  </div>
                  <div className="mt-2 text-[0.875rem] leading-6 text-[var(--text-secondary)]">{node.description}</div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-[var(--text-muted)]">
                    <span>{node.userName} / {node.department}</span>
                    <span>{node.objectName}</span>
                    <span>前置：{node.previousId || '追溯起点'}</span>
                    <span>后续：{node.nextIds.length} 项</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function GraphView({
  nodes,
  selectedNodeId,
  onSelect,
}: {
  nodes: TraceNode[]
  selectedNodeId: string
  onSelect: (id: string) => void
}) {
  const graphNodes = nodes.slice(0, 8)
  const positions = graphNodes.map((node, index) => ({
    node,
    x: 90 + (index % 4) * 185,
    y: 86 + Math.floor(index / 4) * 160,
  }))

  return (
    <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-[1rem] font-semibold text-[var(--text-main)]">关系图谱画布</h2>
          <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">中心事件、操作节点、用户节点和数据节点的有向关联</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-2 text-[0.8125rem] outline-none" defaultValue="hierarchy">
            {(['force', 'hierarchy', 'circle'] as GraphLayout[]).map((item) => <option key={item} value={item}>{item === 'force' ? '力导向图' : item === 'hierarchy' ? '层次图' : '环形图'}</option>)}
          </select>
          <select className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-2 text-[0.8125rem] outline-none">
            {riskFilters.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-2 text-[0.8125rem] outline-none" defaultValue="all">
            {(['direct', 'all'] as RelationFilter[]).map((item) => <option key={item} value={item}>{item === 'direct' ? '显示直接关系' : '显示所有关系'}</option>)}
          </select>
          <Button variant="secondary" className="h-9 px-3 py-0"><Maximize2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid gap-4 p-4 2xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="overflow-x-auto rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)]">
          <svg viewBox="0 0 760 360" className="h-[360px] min-w-[760px] w-full" aria-label="操作链路关系图谱">
            <defs>
              <marker id="trace-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L9,3 z" fill="var(--primary)" />
              </marker>
            </defs>
            {positions.slice(0, -1).map((point, index) => {
              const next = positions[index + 1]
              return (
                <g key={`${point.node.id}-${next.node.id}`}>
                  <line x1={point.x + 34} y1={point.y} x2={next.x - 34} y2={next.y} stroke="var(--primary)" strokeWidth={Math.max(1.5, point.node.volume / 160)} markerEnd="url(#trace-arrow)" opacity="0.65" />
                  <text x={(point.x + next.x) / 2} y={(point.y + next.y) / 2 - 8} textAnchor="middle" className="fill-[var(--text-muted)] text-[10px]">{point.node.time.slice(11, 16)}</text>
                </g>
              )
            })}
            {positions.map(({ node, x, y }) => {
              const Icon = operationIcon(node.operationType)
              const selected = selectedNodeId === node.id
              const fill = node.risk === '高风险' ? '#ef4444' : node.risk === '中风险' ? '#f59e0b' : node.risk === '低风险' ? '#3b82f6' : '#10b981'
              return (
                <g key={node.id} onClick={() => onSelect(node.id)} className="cursor-pointer">
                  <rect x={x - 52} y={y - 30} width="104" height="60" rx="8" fill={selected ? 'var(--status-info-bg)' : 'var(--surface-raised)'} stroke={selected ? 'var(--primary)' : 'var(--line)'} />
                  <circle cx={x - 34} cy={y - 5} r={12 + Math.min(10, node.volume / 80)} fill={fill} opacity="0.9" />
                  <foreignObject x={x - 44} y={y - 15} width="20" height="20">
                    <Icon className="h-5 w-5 text-white" />
                  </foreignObject>
                  <text x={x + 8} y={y - 7} className="fill-[var(--text-main)] text-[11px] font-semibold">{node.operationType}</text>
                  <text x={x + 8} y={y + 11} className="fill-[var(--text-muted)] text-[10px]">{node.userName.slice(0, 8)}</text>
                </g>
              )
            })}
          </svg>
        </div>
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
          <div className="text-[0.95rem] font-semibold text-[var(--text-main)]">节点详情面板</div>
          {nodes.find((node) => node.id === selectedNodeId) ? (
            <div className="mt-3 space-y-3 text-[0.8125rem] text-[var(--text-secondary)]">
              {(() => {
                const node = nodes.find((item) => item.id === selectedNodeId)!
                return (
                  <>
                    <div className="font-medium text-[var(--text-main)]">{node.id} · {node.operationType}</div>
                    <div>{node.description}</div>
                    <div>用户：{node.userName} / {node.userType}</div>
                    <div>对象：{node.objectName}</div>
                    <div>数据量权重：{node.volume}</div>
                    <div>决策理由：{node.decisionReason}</div>
                  </>
                )
              })()}
            </div>
          ) : (
            <div className="mt-3 text-[0.8125rem] text-[var(--text-muted)]">请选择图谱节点。</div>
          )}
        </div>
      </div>
    </section>
  )
}

function TableView({ nodes, onSelect }: { nodes: TraceNode[]; onSelect: (id: string) => void }) {
  return (
    <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-[1rem] font-semibold text-[var(--text-main)]">操作链路表格</h2>
          <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">支持按操作人、数据对象和时间段复核链路层级</div>
        </div>
        <div className="flex gap-2">
          <select className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-2 text-[0.8125rem] outline-none">
            <option>按操作人分组</option>
            <option>按数据对象分组</option>
            <option>按时间段分组</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[1160px]">
          <div className="grid grid-cols-[54px_150px_70px_120px_130px_160px_1fr_130px_110px_90px_90px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]">
            <span>序号</span>
            <span>操作时间</span>
            <span>层级</span>
            <span>操作类型</span>
            <span>操作人</span>
            <span>操作对象</span>
            <span>操作描述</span>
            <span>前置操作引用</span>
            <span>后续影响</span>
            <span>风险等级</span>
            <span>操作详情</span>
          </div>
          {nodes.map((node) => (
            <div key={node.id} className="grid grid-cols-[54px_150px_70px_120px_130px_160px_1fr_130px_110px_90px_90px] gap-3 border-b border-[var(--line)] px-4 py-3 text-[0.8125rem] last:border-b-0">
              <span className="text-[var(--text-secondary)]">{node.seq}</span>
              <span className="text-[var(--text-secondary)]">{node.time}</span>
              <span className="font-medium text-[var(--primary)]">L{node.level}</span>
              <span>{node.operationType}</span>
              <span className="truncate">{node.userName}</span>
              <span className="truncate">{node.objectName}</span>
              <span className="line-clamp-2 text-[var(--text-secondary)]">{node.description}</span>
              <span className="truncate text-[var(--primary)]">{node.previousId || '追溯起点'}</span>
              <span>{node.nextIds.length} 项</span>
              <span><span className={cn('rounded-full border px-2 py-0.5 text-[0.72rem]', riskTone(node.risk))}>{node.risk}</span></span>
              <button type="button" className="text-left text-[var(--primary)] hover:underline" onClick={() => onSelect(node.id)}>详情</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AnalysisPanel({ nodes }: { nodes: TraceNode[] }) {
  const highRiskNodes = nodes.filter((node) => node.risk === '高风险')
  const abnormalNodes = nodes.filter((node) => node.result === '失败' || node.result === '被拒绝')
  const userCounts = Array.from(nodes.reduce((map, node) => map.set(node.userName, (map.get(node.userName) ?? 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1])
  const sourceFlow = Array.from(new Set(nodes.map((node) => node.dataSource))).slice(0, 4)

  return (
    <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
        <div className="mb-3 flex items-center gap-2 text-[0.95rem] font-semibold text-[var(--text-main)]">
          <PanelRight className="h-4 w-4 text-[var(--primary)]" />
          追溯路径分析
        </div>
        <div className="space-y-3">
          {[
            ['最长操作链路', `L1 到 L${Math.max(...nodes.map((node) => node.level), 1)}，覆盖 ${nodes.length} 个节点`],
            ['最高风险路径', `${highRiskNodes.length} 个高风险节点集中在访问与导出环节`],
            ['最频繁路径', `${nodes[0]?.dataSource || '数据源'} -> 策略引擎 -> 审计日志`],
          ].map(([title, value]) => (
            <div key={title} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
              <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
              <div className="mt-1 text-[0.875rem] leading-6 text-[var(--text-secondary)]">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
        <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">责任人分析</h3>
        <div className="mt-3 space-y-2">
          {userCounts.slice(0, 5).map(([user, count]) => (
            <div key={user} className="flex items-center justify-between gap-3 rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-[0.8125rem]">
              <span className="truncate text-[var(--text-secondary)]">{user}</span>
              <span className="font-medium text-[var(--text-main)]">{count} 次</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
        <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">数据流向分析</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)]">
          {sourceFlow.map((source, index) => (
            <span key={source} className="inline-flex items-center gap-2">
              <span className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-2.5 py-1">{source}</span>
              {index < sourceFlow.length - 1 ? <span className="text-[var(--primary)]">{'->'}</span> : null}
            </span>
          ))}
        </div>
        <div className="mt-3 rounded-[8px] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-[0.8125rem] text-[var(--status-warning-text)]">
          跨域数据传输 {nodes.filter((node) => node.userType === '外部用户').length} 次，敏感数据外流告警 {highRiskNodes.length} 条。
        </div>
      </section>

      <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
        <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">异常节点汇总</h3>
        <div className="mt-3 space-y-2">
          {abnormalNodes.slice(0, 4).map((node) => (
            <button key={node.id} type="button" className="block w-full rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-left text-[0.8125rem] text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-main)]">{node.time.slice(11, 16)}</span> · {node.operationType} · {node.result}
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}

function SmartAnalysis({ nodes, expanded, setExpanded }: { nodes: TraceNode[]; expanded: boolean; setExpanded: (value: boolean) => void }) {
  const highRiskCount = nodes.filter((node) => node.risk === '高风险').length
  const affectedSources = new Set(nodes.map((node) => node.dataSource)).size
  const affectedUsers = new Set(nodes.map((node) => node.userName)).size
  const rejectedCount = nodes.filter((node) => node.result === '被拒绝' || node.result === '失败').length
  const approvalCount = nodes.filter((node) => node.result === '需审批').length

  return (
    <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
      <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setExpanded(!expanded)}>
        <span className="flex items-center gap-2 text-[1rem] font-semibold text-[var(--text-main)]">
          <Brain className="h-4 w-4 text-[var(--primary)]" />
          智能分析结果
        </span>
        <ChevronDown className={cn('h-4 w-4 transition', expanded ? '' : '-rotate-90')} />
      </button>
      {expanded ? (
        <div className="grid gap-4 border-t border-[var(--line)] p-4 lg:grid-cols-3">
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">根因分析</h3>
            <div className="mt-3 text-[0.875rem] leading-7 text-[var(--text-secondary)]">
              {nodes.length > 0
                ? `当前链路基于安全档案生成，发现 ${highRiskCount} 个高风险节点、${rejectedCount} 个异常或拒绝节点、${approvalCount} 个待审批节点。`
                : '后台暂无可用于根因分析的操作链路数据。'}
            </div>
            <div className="mt-3 rounded-[8px] bg-[var(--surface-raised)] px-3 py-2 text-[0.8125rem] text-[var(--text-secondary)]">
              证据链来自安全档案、目录资源和策略状态的关联结果。
            </div>
          </div>
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">影响范围评估</h3>
            <div className="mt-3 grid gap-2 text-[0.8125rem] text-[var(--text-secondary)]">
              <div>受影响的数据对象数量：{nodes.length}</div>
              <div>受影响的用户数量：{affectedUsers}</div>
              <div>受影响的业务系统：{affectedSources}</div>
              <div>高风险操作数量：{highRiskCount}</div>
            </div>
          </div>
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">建议措施</h3>
            <div className="mt-3 space-y-2 text-[0.8125rem] text-[var(--text-secondary)]">
              <div>1. 优先复核高风险与被拒绝节点对应的数据资源。</div>
              <div>2. 补齐缺失责任人、部门和策略更新时间，提升追溯准确度。</div>
              <div>3. 若需要真实操作链路，应接入后台审计日志集合后展示原始审计记录。</div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function SecurityTracePage() {
  const location = useLocation()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const {
    data: { catalogItems },
    isLoading: isPortalLoading,
  } = usePortalContext()
  const { data: securityPolicies, isLoading: isSecurityLoading } = useSecurityGovernancePolicies(true)
  const [activeView, setActiveView] = useState<TraceView>('timeline')
  const [dimension, setDimension] = useState<TraceDimension>('data-object')
  const [traceDepthBack, setTraceDepthBack] = useState(3)
  const [traceDepthForward, setTraceDepthForward] = useState(5)
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [zoom, setZoom] = useState(2)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [smartExpanded, setSmartExpanded] = useState(true)

  const joinedItems = useMemo(
    () => joinSecurityGovernanceItems(securityPolicies, catalogItems),
    [catalogItems, securityPolicies],
  )
  const traceNodes = useMemo(() => buildTraceNodes(securityPolicies, joinedItems), [joinedItems, securityPolicies])
  const effectiveSelectedNodeId = selectedNodeId || traceNodes[0]?.id || ''
  const dataSources = useMemo(() => Array.from(new Set(traceNodes.map((node) => node.dataSource))).slice(0, 12), [traceNodes])
  const users = useMemo(() => Array.from(new Set(traceNodes.map((node) => node.userName))).slice(0, 12), [traceNodes])
  const timeWindow = useMemo(() => {
    const times = traceNodes.map((node) => node.time).filter(Boolean).sort()
    if (times.length === 0) return ''
    return `${times[0]} 至 ${times[times.length - 1]}`
  }, [traceNodes])
  const riskCount = traceNodes.filter((node) => node.risk !== '正常').length
  const highRiskCount = traceNodes.filter((node) => node.risk === '高风险').length
  const externalUserCount = new Set(traceNodes.filter((node) => node.userType === '外部用户').map((node) => node.userName)).size
  const loading = isPortalLoading || isSecurityLoading

  const resetConditions = () => {
    setDimension('data-object')
    setTraceDepthBack(3)
    setTraceDepthForward(5)
    setSelectedNodeId(traceNodes[0]?.id || '')
  }

  return (
    <div className="space-y-5">
      <AuditSecondaryTabs
        withEmbed={withEmbed}
        actions={
          <>
            <Button variant="secondary" className="gap-2">
              <FileText className="h-4 w-4" />
              生成追溯报告
            </Button>
            <div className="inline-flex rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-1">
              {traceViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-[6px] px-3 text-[0.8125rem] transition',
                    activeView === view.id ? 'bg-[var(--surface)] text-[var(--primary)] shadow-[var(--shadow-soft)]' : 'text-[var(--text-secondary)] hover:text-[var(--primary)]',
                  )}
                  onClick={() => setActiveView(view.id)}
                >
                  <view.icon className="h-4 w-4" />
                  {view.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      <QueryPanel
        dimension={dimension}
        setDimension={setDimension}
        traceDepthBack={traceDepthBack}
        traceDepthForward={traceDepthForward}
        setTraceDepthBack={setTraceDepthBack}
        setTraceDepthForward={setTraceDepthForward}
        dataSources={dataSources}
        users={users}
        nodes={traceNodes}
        timeWindow={timeWindow}
        onReset={resetConditions}
      />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard title="操作节点总数" value={loading ? '加载中' : traceNodes.length.toLocaleString()} detail={`时间跨度 ${traceNodes.at(-1)?.time.slice(11, 16) || '--'} 至 ${traceNodes[0]?.time.slice(11, 16) || '--'}`} icon={<ListFilter className="h-5 w-5" />} />
        <MetricCard title="涉及用户数" value={new Set(traceNodes.map((node) => node.userName)).size.toLocaleString()} detail={`外部用户 ${externalUserCount} 个，内部用户 ${Math.max(0, new Set(traceNodes.map((node) => node.userName)).size - externalUserCount)} 个。`} icon={<UserRound className="h-5 w-5" />} tone="success" />
        <MetricCard title="涉及数据源数" value={dataSources.length.toLocaleString()} detail={`${dataSources.slice(0, 3).join('、') || '暂无数据源'} 涉及敏感数据。`} icon={<DatabaseZap className="h-5 w-5" />} tone="warning" />
        <MetricCard title="风险操作数" value={riskCount.toLocaleString()} detail={`高风险 ${highRiskCount} 个，异常或拒绝 ${traceNodes.filter((node) => node.result === '被拒绝' || node.result === '失败').length} 个。`} icon={<AlertTriangle className="h-5 w-5" />} tone={riskCount > 0 ? 'danger' : 'success'} />
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {!loading && traceNodes.length === 0 ? (
            <section className="rounded-[8px] border border-dashed border-[var(--line)] bg-[var(--surface-raised)] px-5 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">
              后台暂无可用于操作链路追溯的安全档案或审计数据。
            </section>
          ) : null}
          {activeView === 'timeline' && traceNodes.length > 0 ? (
            <TimelineView
              nodes={traceNodes}
              selectedNodeId={effectiveSelectedNodeId}
              onSelect={setSelectedNodeId}
              zoom={zoom}
              setZoom={setZoom}
              playbackSpeed={playbackSpeed}
              setPlaybackSpeed={setPlaybackSpeed}
            />
          ) : null}
          {activeView === 'graph' && traceNodes.length > 0 ? <GraphView nodes={traceNodes} selectedNodeId={effectiveSelectedNodeId} onSelect={setSelectedNodeId} /> : null}
          {activeView === 'table' && traceNodes.length > 0 ? <TableView nodes={traceNodes} onSelect={setSelectedNodeId} /> : null}
          <SmartAnalysis nodes={traceNodes} expanded={smartExpanded} setExpanded={setSmartExpanded} />
        </div>
        <AnalysisPanel nodes={traceNodes} />
      </div>
    </div>
  )
}
