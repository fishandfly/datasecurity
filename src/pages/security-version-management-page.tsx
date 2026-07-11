import {
  Archive,
  CheckCircle2,
  Clock3,
  Diff,
  FileClock,
  FileText,
  GitBranch,
  History,
  RotateCcw,
  ShieldAlert,
  UserCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../components/ui'
import { useSecurityGovernancePolicies } from '../lib/nocobase-security-governance'
import { usePortalContext } from '../lib/portal-context'
import { joinSecurityGovernanceItems, type SecurityGovernanceJoinedItem } from '../lib/security-governance'
import { cn } from '../lib/utils'

type VersionStatus = '待审批' | '已发布' | '已回滚' | '草稿'
type ChangeType = '策略变更' | '标签变更' | '系统参数' | '接入规则'

type VersionRecord = {
  id: string
  version: string
  title: string
  type: ChangeType
  status: VersionStatus
  owner: string
  createdAt: string
  affectedResources: number
  risk: '高' | '中' | '低'
  summary: string
  approvers: string[]
}

function formatDateTime(value: string) {
  const normalized = value.trim()
  if (!normalized) return '未记录'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function buildVersions(items: SecurityGovernanceJoinedItem[]): VersionRecord[] {
  return items.map((item, index) => ({
    id: `CFG-${String(index + 1).padStart(5, '0')}`,
    version: `v${index + 1}`,
    title: `${item.name}安全配置版本`,
    type: item.policyStatus ? '策略变更' : item.securityCategory || item.securityLevel ? '标签变更' : '接入规则',
    status: item.policyStatus === 'disabled'
      ? '已回滚'
      : item.securityReviewStatus === 'pending' || item.approvalRequired
        ? '待审批'
        : item.policyStatus === 'draft' || item.securityReviewStatus === 'unsubmitted'
          ? '草稿'
          : '已发布',
    owner: item.securityOwnerUserName || '未指定责任人',
    createdAt: formatDateTime(item.updateTime),
    affectedResources: 1 + item.sensitiveFieldCount + (item.approvalRequired ? 2 : 0),
    risk: item.coreControlFlag || item.approvalRequired ? '高' : item.importantDataFlag ? '中' : '低',
    summary: item.approvalRequired ? '调整高敏感数据访问审批与导出约束。' : '同步标签、接入规则和默认访问范围。',
    approvers: [item.securityOwnerUserName, item.securityOwnerDept, item.department].filter(Boolean),
  }))
}

function statusTone(status: VersionStatus) {
  if (status === '已发布') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (status === '待审批') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  if (status === '已回滚') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  return 'border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-muted)]'
}

function riskTone(risk: VersionRecord['risk']) {
  if (risk === '高') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  if (risk === '中') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
}

function MetricCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]">{icon}</div>
        <div>
          <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
          <div className="mt-1 text-[1.45rem] font-semibold text-[var(--text-main)]">{value}</div>
        </div>
      </div>
      <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{detail}</div>
    </div>
  )
}

export function SecurityVersionManagementPage() {
  const {
    data: { catalogItems },
    isLoading: isPortalLoading,
  } = usePortalContext()
  const { data: securityPolicies, isLoading: isSecurityLoading } = useSecurityGovernancePolicies(true)
  const [statusFilter, setStatusFilter] = useState<'全部' | VersionStatus>('全部')
  const [selectedVersionId, setSelectedVersionId] = useState('')

  const joinedItems = useMemo(() => joinSecurityGovernanceItems(securityPolicies, catalogItems), [catalogItems, securityPolicies])
  const versions = useMemo(() => buildVersions(joinedItems), [joinedItems])
  const filteredVersions = versions.filter((version) => statusFilter === '全部' || version.status === statusFilter)
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? filteredVersions[0] ?? versions[0] ?? null
  const loading = isPortalLoading || isSecurityLoading

  return (
    <div className="space-y-5">
      <section className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(135deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-[1.75rem] font-semibold text-[var(--text-main)]">配置版本管理</h1>
            <p className="mt-2 max-w-3xl text-[0.875rem] leading-6 text-[var(--text-secondary)]">
              跟踪策略、标签、接入规则和系统参数的配置版本，支持差异对比、审批记录、发布确认与一键回滚。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button className="gap-2"><GitBranch className="h-4 w-4" />创建版本</Button>
            <Button variant="secondary" className="gap-2"><Diff className="h-4 w-4" />版本对比</Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard title="配置版本数" value={versions.length.toLocaleString()} detail="覆盖策略、标签、接入规则与系统参数。" icon={<History className="h-5 w-5" />} />
        <MetricCard title="待审批版本" value={versions.filter((item) => item.status === '待审批').length.toLocaleString()} detail="高风险变更需多级审批后发布。" icon={<Clock3 className="h-5 w-5" />} />
        <MetricCard title="已发布版本" value={versions.filter((item) => item.status === '已发布').length.toLocaleString()} detail="发布版本自动固化快照和审计记录。" icon={<CheckCircle2 className="h-5 w-5" />} />
        <MetricCard title="回滚次数" value={versions.filter((item) => item.status === '已回滚').length.toLocaleString()} detail="回滚操作需记录原因和责任人。" icon={<RotateCcw className="h-5 w-5" />} />
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-[1rem] font-semibold text-[var(--text-main)]">版本列表</h2>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as '全部' | VersionStatus)} className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.8125rem] text-[var(--text-secondary)] outline-none">
              {['全部', '待审批', '已发布', '已回滚', '草稿'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-[126px_minmax(220px,1fr)_110px_110px_110px_120px_150px_140px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]">
            <span>版本号</span>
            <span>变更标题</span>
            <span>类型</span>
            <span>状态</span>
            <span>风险</span>
            <span>影响资源</span>
            <span>创建时间</span>
            <span>操作</span>
          </div>
          <div className="overflow-x-auto">
            {filteredVersions.map((version) => (
              <div key={version.id} className={cn('grid min-w-[1160px] grid-cols-[126px_minmax(220px,1fr)_110px_110px_110px_120px_150px_140px] gap-3 border-b border-[var(--line)] px-4 py-4 text-[0.8125rem] last:border-b-0 hover:bg-[var(--surface-muted)]', selectedVersion?.id === version.id ? 'bg-[color-mix(in_srgb,var(--status-info-bg)_42%,transparent)]' : '')}>
                <button type="button" className="text-left font-semibold text-[var(--primary)]" onClick={() => setSelectedVersionId(version.id)}>{version.version}</button>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[var(--text-main)]">{version.title}</span>
                  <span className="mt-1 block truncate text-[0.75rem] text-[var(--text-muted)]">{version.summary}</span>
                </span>
                <span className="text-[var(--text-secondary)]">{version.type}</span>
                <span><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(version.status))}>{version.status}</span></span>
                <span><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', riskTone(version.risk))}>{version.risk}</span></span>
                <span className="font-semibold text-[var(--text-main)]">{version.affectedResources}</span>
                <span className="text-[var(--text-secondary)]">{version.createdAt}</span>
                <span className="flex items-center gap-1">
                  <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]" title="查看差异">
                    <Diff className="h-4 w-4" />
                  </button>
                  <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--status-danger-text)]" title="回滚">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-[1rem] font-semibold text-[var(--text-main)]">
            <FileClock className="h-4 w-4 text-[var(--primary)]" />
            版本详情
          </div>
          {selectedVersion ? (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-[0.75rem] text-[var(--text-muted)]">当前版本</div>
                <div className="mt-1 text-[1.35rem] font-semibold text-[var(--text-main)]">{selectedVersion.version}</div>
              </div>
              <div className="rounded-[8px] bg-[var(--surface-muted)] p-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{selectedVersion.summary}</div>
              <div className="grid gap-3">
                {([
                  ['变更类型', selectedVersion.type, FileText],
                  ['提交人', selectedVersion.owner, UserCheck],
                  ['审批链路', selectedVersion.approvers.join(' / '), ShieldAlert],
                  ['归档状态', selectedVersion.status === '已发布' ? '已固化快照' : '等待发布确认', Archive],
                ] as Array<[string, string, LucideIcon]>).map(([title, value, Icon]) => (
                  <div key={String(title)} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                    <div className="flex items-center gap-2 text-[0.75rem] text-[var(--text-muted)]">
                      <Icon className="h-4 w-4 text-[var(--primary)]" />
                      {title}
                    </div>
                    <div className="mt-1 text-[0.875rem] font-medium text-[var(--text-main)]">{value}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className="gap-2"><Diff className="h-4 w-4" />查看差异</Button>
                <Button variant="secondary" className="gap-2"><RotateCcw className="h-4 w-4" />发起回滚</Button>
              </div>
            </div>
          ) : null}
        </aside>
      </section>

      {loading ? (
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载配置版本...</div>
      ) : null}
    </div>
  )
}
