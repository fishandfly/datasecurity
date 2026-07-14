import {
  Activity,
  AlertTriangle,
  Copy,
  Edit3,
  Filter,
  Gauge,
  GitBranch,
  MoreHorizontal,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AccessControlSecondaryTabs } from '../components/security-access-control-tabs'
import { Button } from '../components/ui'
import { useSecurityGovernancePolicies, type SecurityGovernancePolicyRecord } from '../lib/nocobase-security-governance'
import { usePortalContext } from '../lib/portal-context'
import { joinSecurityGovernanceItems, resolveSecurityScopeLabel, type SecurityGovernanceJoinedItem } from '../lib/security-governance'
import { cn } from '../lib/utils'

type PolicyType = '访问控制策略' | '分层隔离策略' | '异常检测策略' | '自定义策略'
type PolicyStatus = '启用中' | '已禁用' | '草稿' | '待生效'
type RiskLevel = '高' | '中' | '低'
type StatusFilter = '全部' | PolicyStatus
type TypeFilter = '全部类型' | PolicyType
type RiskFilter = '全部' | RiskLevel
type RuleMode = 'visual' | 'code'

type PolicyEngineRow = {
  id: string
  name: string
  code: string
  description: string
  type: PolicyType
  status: PolicyStatus
  priority: number
  scope: string
  scopeDetail: string
  blockCount: number
  creator: string
  updatedAt: string
  effectiveFrom: string
  effectiveTo: string
  risk: RiskLevel
  resourceName: string
  resourceId: string
  ownerDept: string
  approvalRequired: boolean
  desensitizationMode: string
  exportScope: string
  apiAuthMode: string
  ruleSummary: string
  conditionCount: number
  actionSummary: string
  testCases: string[]
}

const policyTypes: TypeFilter[] = ['全部类型', '访问控制策略', '分层隔离策略', '异常检测策略', '自定义策略']
const policyStatuses: StatusFilter[] = ['全部', '启用中', '已禁用', '草稿', '待生效']
const riskLevels: RiskFilter[] = ['全部', '高', '中', '低']

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function formatDate(value: string) {
  const normalized = normalizeText(value)
  return normalized ? normalized.slice(0, 10) : ''
}

function resolvePolicyScopeLabel(value: string) {
  switch (value) {
    case 'internal-controlled':
      return '内部受控'
    case 'production-zone':
      return '生产控制区'
    case 'conditional':
      return '条件共享'
    case 'deny-external':
      return '禁止外部共享'
    case 'aggregate-only':
      return '仅聚合脱敏'
    case 'dual-approval':
      return '双人复核'
    case 'disabled':
      return '禁止导出'
    default:
      return resolveSecurityScopeLabel(value)
  }
}

function resolvePolicyStatus(item: SecurityGovernanceJoinedItem): PolicyStatus {
  if (item.securityReviewStatus === 'pending' || item.policyStatus === 'pending') return '待生效'
  if (item.policyStatus === 'disabled') return '已禁用'
  if (item.policyStatus === 'draft' || item.securityReviewStatus === 'unsubmitted') return '草稿'
  return '启用中'
}

function resolvePolicyType(item: SecurityGovernanceJoinedItem): PolicyType {
  if (item.coreControlFlag || item.desensitizationRequired) return '分层隔离策略'
  if (item.approvalRequired || item.importantDataFlag) return '异常检测策略'
  return '访问控制策略'
}

function resolveRiskLevel(item: SecurityGovernanceJoinedItem): RiskLevel {
  if (item.coreControlFlag || item.approvalRequired || item.sensitiveFieldCount >= 3) return '高'
  if (item.importantDataFlag || item.desensitizationRequired) return '中'
  return '低'
}

function createBlockCount(item: SecurityGovernanceJoinedItem) {
  if (item.policyStatus === 'disabled') return 0
  return item.approvalRequired ? Math.max(1, item.sensitiveFieldCount) : 0
}

export function buildPolicyEngineRows(
  policies: SecurityGovernancePolicyRecord[],
  joinedItems: SecurityGovernanceJoinedItem[],
): PolicyEngineRow[] {
  return joinedItems.map((item, index) => {
    const policy = policies.find((row) => row.id === item.policyId)
    const type = resolvePolicyType(item)
    const risk = resolveRiskLevel(item)
    const accessScope = resolvePolicyScopeLabel(item.accessScope)
    const shareScope = resolvePolicyScopeLabel(item.shareScope)
    const approvalMode = resolvePolicyScopeLabel(item.approvalMode)
    const desensitization = resolvePolicyScopeLabel(item.desensitizationMode)
    const exportScope = resolvePolicyScopeLabel(item.exportScope)
    const name = policy?.policyName || `${item.securityCategory || '资源'}访问控制策略`

    return {
      id: item.policyId,
      name,
      code: policy?.policyCode || `POL-${String(index + 1).padStart(4, '0')}`,
      description: policy?.remarks || item.assessmentBasis || `围绕 ${item.name} 建立访问、导出、脱敏与执行规则。`,
      type,
      status: resolvePolicyStatus(item),
      priority: item.coreControlFlag ? 90 : item.approvalRequired ? 70 : 40,
      scope: accessScope,
      scopeDetail: `${item.securityOwnerDept || item.department || '未指定责任部门'} / ${shareScope}`,
      blockCount: createBlockCount(item),
      creator: item.securityOwnerUserName || '未指定责任人',
      updatedAt: formatDate(policy?.updatedAt || item.updateTime),
      effectiveFrom: formatDate(policy?.effectiveFrom || ''),
      effectiveTo: formatDate(policy?.effectiveTo || ''),
      risk,
      resourceName: item.name,
      resourceId: item.resourceId,
      ownerDept: item.securityOwnerDept || item.department || '未指定责任部门',
      approvalRequired: item.approvalRequired,
      desensitizationMode: desensitization,
      exportScope,
      apiAuthMode: resolvePolicyScopeLabel(item.apiAuthMode),
      ruleSummary: `${item.securityCategory || '未标注'} + ${item.securityLevel || '未标注'} + ${item.dataSubjectType || '未标注'}`,
      conditionCount: Math.max(2, item.sensitiveFieldCount + (item.approvalRequired ? 2 : 1)),
      actionSummary: item.approvalRequired ? `阻断并标记${approvalMode}` : `允许访问，执行${desensitization}与${exportScope}`,
      testCases: [
        '责任人访问授权资源',
        '普通用户跨部门导出明细',
        item.coreControlFlag ? '核心数据外网来源访问' : '异常时间段批量查询',
      ],
    }
  }).sort((left, right) => right.priority - left.priority || right.blockCount - left.blockCount)
}

function statusTone(status: PolicyStatus) {
  switch (status) {
    case '启用中':
      return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
    case '待生效':
      return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
    case '草稿':
      return 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
    default:
      return 'border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-muted)]'
  }
}

function riskTone(risk: RiskLevel) {
  switch (risk) {
    case '高':
      return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
    case '中':
      return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
    default:
      return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  }
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

function ScopePanel({ policy }: { policy: PolicyEngineRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        ['数据资源', `${policy.resourceName} / ${policy.resourceId}`],
        ['责任部门', policy.ownerDept],
        ['访问范围', policy.scope],
        ['共享范围', policy.scopeDetail],
        ['脱敏方式', policy.desensitizationMode],
        ['导出范围', policy.exportScope],
      ].map(([title, value]) => (
        <div key={title} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
          <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
          <div className="mt-1 text-[0.875rem] font-medium text-[var(--text-main)]">{value}</div>
        </div>
      ))}
    </div>
  )
}

function RuleEditor({ policy, ruleMode, onRuleModeChange }: { policy: PolicyEngineRow; ruleMode: RuleMode; onRuleModeChange: (mode: RuleMode) => void }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">规则编排</h3>
        <div className="inline-flex rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-1">
          {[
            ['visual', '可视化编辑器'],
            ['code', '代码编辑器'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                'rounded-[6px] px-3 py-1.5 text-[0.8125rem]',
                ruleMode === id ? 'bg-[var(--surface)] text-[var(--primary)] shadow-[var(--shadow-soft)]' : 'text-[var(--text-secondary)]',
              )}
              onClick={() => onRuleModeChange(id as RuleMode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {ruleMode === 'visual' ? (
        <div className="space-y-3">
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <div className="mb-3 flex items-center gap-2 text-[0.875rem] font-semibold text-[var(--text-main)]">
              <GitBranch className="h-4 w-4 text-[var(--primary)]" />
              条件组 AND
            </div>
            <div className="grid gap-2">
              {[
                ['数据敏感级别', '等于', policy.risk === '高' ? '核心/高敏感' : policy.risk === '中' ? '敏感' : '内部'],
                ['访问主体角色', '包含', policy.scope],
                ['资源归属部门', '等于', policy.ownerDept],
              ].map(([field, operator, value]) => (
                <div key={`${field}-${operator}`} className="grid gap-2 rounded-[8px] bg-[var(--surface-muted)] p-3 text-[0.8125rem] text-[var(--text-secondary)] sm:grid-cols-[1fr_96px_1fr]">
                  <span>{field}</span>
                  <span>{operator}</span>
                  <span className="font-medium text-[var(--text-main)]">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <div className="mb-3 flex items-center gap-2 text-[0.875rem] font-semibold text-[var(--text-main)]">
              <SlidersHorizontal className="h-4 w-4 text-[var(--primary)]" />
              条件组 OR 与动作配置
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[8px] bg-[var(--surface-muted)] p-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
                异常来源 IP、非工作时间或批量导出命中任一条件时进入高风险分支。
              </div>
              <div className="rounded-[8px] bg-[var(--surface-muted)] p-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
                动作配置：{policy.actionSummary}，同步写入审计日志并通知策略负责人。
              </div>
            </div>
          </div>
        </div>
      ) : (
        <pre className="max-h-72 overflow-auto rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
          {JSON.stringify(
            {
              policy: policy.code,
              effect: policy.approvalRequired ? 'block_review' : 'allow',
              when: {
                and: ['subject.role in scope', 'resource.securityLevel matches rule', 'resource.ownerDept equals policy.ownerDept'],
                or: ['source.ipRisk == high', 'request.export == true', 'request.time outside workHours'],
              },
              action: policy.actionSummary,
            },
            null,
            2,
          )}
        </pre>
      )}
    </section>
  )
}

function PolicyDrawer({
  policy,
  mode,
  ruleMode,
  onRuleModeChange,
  onClose,
  onRunTest,
}: {
  policy: PolicyEngineRow | null
  mode: 'create' | 'edit'
  ruleMode: RuleMode
  onRuleModeChange: (mode: RuleMode) => void
  onClose: () => void
  onRunTest: (policy: PolicyEngineRow) => void
}) {
  if (!policy) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex h-full max-h-[100dvh] w-full max-w-[760px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-strong)]">
        <div className="flex shrink-0 items-start justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <div className="text-[0.75rem] text-[var(--text-muted)]">{mode === 'create' ? '新建策略' : '编辑策略'}</div>
            <h2 className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{policy.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(policy.status))}>{policy.status}</span>
              <span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', riskTone(policy.risk))}>{policy.risk}风险</span>
            </div>
          </div>
          <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">基本信息</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] outline-none" defaultValue={policy.name} placeholder="策略名称" />
              <input className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] outline-none" defaultValue={policy.code} placeholder="策略编码" />
              <select className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] outline-none" defaultValue={policy.type}>
                {policyTypes.filter((item): item is PolicyType => item !== '全部类型').map((item) => <option key={item}>{item}</option>)}
              </select>
              <input type="number" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] outline-none" defaultValue={policy.priority} placeholder="优先级" />
            </div>
            <textarea className="min-h-20 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[0.875rem] outline-none" defaultValue={policy.description} placeholder="策略描述" />
          </section>

          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">生效范围配置</h3>
            <ScopePanel policy={policy} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input type="date" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] outline-none" defaultValue={policy.effectiveFrom} />
              <input type="date" className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] outline-none" defaultValue={policy.effectiveTo} />
            </div>
          </section>

          <RuleEditor policy={policy} ruleMode={ruleMode} onRuleModeChange={onRuleModeChange} />

          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">异常检测配置</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {['异常时间段访问', '批量导出阈值', '来源 IP 风险'].map((item, index) => (
                <label key={item} className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-3 text-[0.8125rem] text-[var(--text-secondary)]">
                  <span>{item}</span>
                  <input type="checkbox" defaultChecked={policy.risk !== '低' || index === 0} />
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">测试与验证</h3>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                <div className="text-[0.75rem] text-[var(--text-muted)]">内置测试用例</div>
                <div className="mt-3 grid gap-2">
                  {policy.testCases.map((item) => (
                    <label key={item} className="flex items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)]">
                      <input type="checkbox" defaultChecked />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
              <Button className="h-10 gap-2 self-start" onClick={() => onRunTest(policy)}>
                <PlayCircle className="h-4 w-4" />
                运行测试
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">执行监督配置</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {['命中事件采集', '异常阻断通知', '审计日志归档'].map((item, index) => (
                <div key={item} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <div className="text-[0.75rem] text-[var(--text-muted)]">监督项 {index + 1}</div>
                  <div className="mt-1 text-[0.875rem] font-medium text-[var(--text-main)]">{item}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 z-10 grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgba(8,18,32,0.08)] sm:flex sm:items-center sm:justify-end">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>取消</Button>
          <Button variant="secondary" className="w-full sm:w-auto">保存为草稿</Button>
          <Button variant="secondary" className="w-full sm:w-auto">发布校验</Button>
          <Button className="w-full sm:w-auto">保存并启用</Button>
        </div>
      </aside>
    </div>,
    document.body,
  )
}

export function SecurityPolicyEnginePage() {
  const {
    data: { catalogItems },
    isLoading: isPortalLoading,
  } = usePortalContext()
  const { data: securityPolicies, isLoading: isSecurityLoading } = useSecurityGovernancePolicies(true)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('全部')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('全部类型')
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('全部')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [drawerPolicy, setDrawerPolicy] = useState<PolicyEngineRow | null>(null)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('edit')
  const [ruleMode, setRuleMode] = useState<RuleMode>('visual')
  const [testPolicy, setTestPolicy] = useState<PolicyEngineRow | null>(null)

  const joinedItems = useMemo(
    () => joinSecurityGovernanceItems(securityPolicies, catalogItems),
    [catalogItems, securityPolicies],
  )
  const policyRows = useMemo(() => buildPolicyEngineRows(securityPolicies, joinedItems), [joinedItems, securityPolicies])
  const filteredRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return policyRows
      .filter((row) => statusFilter === '全部' || row.status === statusFilter)
      .filter((row) => typeFilter === '全部类型' || row.type === typeFilter)
      .filter((row) => riskFilter === '全部' || row.risk === riskFilter)
      .filter((row) => !startDate || row.updatedAt >= startDate)
      .filter((row) => !endDate || row.updatedAt <= endDate)
      .filter((row) => {
        if (!normalizedKeyword) return true
        return [row.name, row.code, row.description, row.creator, row.resourceName, row.ownerDept, row.ruleSummary].some((value) =>
          value.toLowerCase().includes(normalizedKeyword),
        )
      })
  }, [endDate, keyword, policyRows, riskFilter, startDate, statusFilter, typeFilter])

  const activeCount = policyRows.filter((row) => row.status === '启用中').length
  const blockCount = policyRows.reduce((sum, row) => sum + row.blockCount, 0)
  const avgPerformance = Math.max(18, 54 - Math.round(policyRows.length * 1.7))
  const loading = isPortalLoading || isSecurityLoading

  const resetFilters = () => {
    setKeyword('')
    setStatusFilter('全部')
    setTypeFilter('全部类型')
    setRiskFilter('全部')
    setStartDate('')
    setEndDate('')
  }

  const openCreateDrawer = () => {
    const template: PolicyEngineRow = {
      id: 'new-policy',
      name: '新建访问控制策略',
      code: '',
      description: '',
      type: '访问控制策略' as PolicyType,
      status: '草稿' as PolicyStatus,
      priority: 50,
      scope: '',
      scopeDetail: '',
      blockCount: 0,
      creator: '',
      updatedAt: '',
      effectiveFrom: '',
      effectiveTo: '',
      risk: '中' as RiskLevel,
      resourceName: '',
      resourceId: '',
      ownerDept: '',
      approvalRequired: false,
      desensitizationMode: '',
      exportScope: '',
      apiAuthMode: '',
      ruleSummary: '',
      conditionCount: 0,
      actionSummary: '',
      testCases: [],
    }
    setDrawerMode('create')
    setDrawerPolicy(template)
  }

  return (
    <>
      <div className="space-y-5">
        <AccessControlSecondaryTabs
          actions={
            <>
              <Button className="gap-2" onClick={openCreateDrawer}>
                <Plus className="h-4 w-4" />
                新建策略
              </Button>
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard title="策略引擎运行状态" value={loading ? '加载中' : activeCount > 0 ? '有启用策略' : '无启用策略'} detail={`已从后台加载 ${activeCount} 条启用策略。`} icon={<Activity className="h-5 w-5" />} tone="success" />
          <MetricCard title="活跃策略数" value={activeCount.toLocaleString()} detail={`共 ${policyRows.length} 条策略，${policyRows.filter((row) => row.status === '待生效').length} 条待生效。`} icon={<ShieldCheck className="h-5 w-5" />} />
          <MetricCard title="今日拦截次数" value={blockCount.toLocaleString()} detail={`高风险策略贡献 ${policyRows.filter((row) => row.risk === '高').length} 个主要拦截来源。`} icon={<AlertTriangle className="h-5 w-5" />} tone="danger" />
          <MetricCard title="规则执行性能" value={`${avgPerformance} ms`} detail="未接入策略执行指标集合时，仅按策略数量估算展示。" icon={<Gauge className="h-5 w-5" />} tone="warning" />
        </div>

        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.4fr)_repeat(3,minmax(140px,0.7fr))_repeat(2,minmax(150px,0.7fr))_auto]">
            <label className="flex h-10 min-w-0 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3">
              <Search className="h-4 w-4 text-[var(--text-muted)]" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                placeholder="搜索策略名称、描述、创建人"
              />
            </label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none">
              {policyStatuses.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none">
              {policyTypes.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as RiskFilter)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none">
              {riskLevels.map((item) => <option key={item} value={item}>{item === '全部' ? '全部风险' : `${item}风险`}</option>)}
            </select>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none" />
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none" />
            <Button variant="secondary" className="h-10 gap-2" onClick={resetFilters}>
              <Filter className="h-4 w-4" />
              重置筛选
            </Button>
          </div>
        </section>

        {testPolicy ? (
          <section className="rounded-[8px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[0.95rem] font-semibold text-[var(--status-info-text)]">策略测试结果</div>
                <div className="mt-1 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
                  {testPolicy.name} 命中 {testPolicy.conditionCount} 个条件，模拟访问决策为“{testPolicy.approvalRequired ? '阻断复核' : '通过'}”，平均执行耗时 {Math.max(12, avgPerformance - 6)} ms。
                </div>
              </div>
              <button type="button" className="self-start rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={() => setTestPolicy(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">
            正在加载策略引擎配置...
          </div>
        ) : null}

        <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div>
              <h2 className="text-[1rem] font-semibold text-[var(--text-main)]">策略列表</h2>
              <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">拖拽排序可调整优先级，当前展示 {filteredRows.length} 条。</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1320px]">
              <div className="grid grid-cols-[minmax(240px,1.3fr)_132px_96px_92px_150px_110px_120px_112px_220px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]">
                <span>策略名称</span>
                <span>类型</span>
                <span>状态</span>
                <span>优先级</span>
                <span>生效范围</span>
                <span>拦截次数</span>
                <span>创建人</span>
                <span>最后修改</span>
                <span>操作</span>
              </div>

              {filteredRows.map((row) => (
                <div key={row.id} className="grid grid-cols-[minmax(240px,1.3fr)_132px_96px_92px_150px_110px_120px_112px_220px] gap-3 border-b border-[var(--line)] px-4 py-4 text-[0.8125rem] last:border-b-0 hover:bg-[var(--surface-muted)]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-[6px] bg-[var(--surface-muted)] px-2 py-1 text-[0.72rem] text-[var(--text-muted)]">#{row.priority}</span>
                      <button type="button" className="truncate text-left font-semibold text-[var(--text-main)] hover:text-[var(--primary)]" onClick={() => { setDrawerMode('edit'); setDrawerPolicy(row) }}>
                        {row.name}
                      </button>
                    </div>
                    <div className="mt-1 truncate text-[0.75rem] text-[var(--text-muted)]">{row.code} · {row.ruleSummary}</div>
                  </div>
                  <span className="text-[var(--text-secondary)]">{row.type}</span>
                  <span><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(row.status))}>{row.status}</span></span>
                  <span className="font-semibold text-[var(--text-main)]">{row.priority}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[var(--text-main)]">{row.scope}</span>
                    <span className="mt-1 block truncate text-[0.72rem] text-[var(--text-muted)]">{row.scopeDetail}</span>
                  </span>
                  <span className="font-semibold text-[var(--text-main)]">{row.blockCount.toLocaleString()}</span>
                  <span className="truncate text-[var(--text-secondary)]">{row.creator}</span>
                  <span className="text-[var(--text-secondary)]">{row.updatedAt}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]" title="编辑" onClick={() => { setDrawerMode('edit'); setDrawerPolicy(row) }}>
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]" title="复制">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]" title="测试" onClick={() => setTestPolicy(row)}>
                      <PlayCircle className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--status-danger-text)]" title="删除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]" title="更多">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </span>
                </div>
              ))}

              {filteredRows.length === 0 ? (
                <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">暂无符合条件的策略。</div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 text-[0.8125rem] text-[var(--text-secondary)]">
            <span>第 1 页 / 共 {Math.max(1, Math.ceil(filteredRows.length / 20))} 页</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary">上一页</Button>
              <Button variant="secondary">下一页</Button>
            </div>
          </div>
        </section>
      </div>

      <PolicyDrawer
        policy={drawerPolicy}
        mode={drawerMode}
        ruleMode={ruleMode}
        onRuleModeChange={setRuleMode}
        onClose={() => setDrawerPolicy(null)}
        onRunTest={(policy) => setTestPolicy(policy)}
      />
    </>
  )
}
