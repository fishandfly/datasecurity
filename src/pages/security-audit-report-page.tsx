import {
  BarChart3,
  CalendarClock,
  FileDown,
  FileSearch,
  FileText,
  Network,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../components/ui'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { useSecurityGovernancePolicies } from '../lib/nocobase-security-governance'
import { usePortalContext } from '../lib/portal-context'
import { joinSecurityGovernanceItems, type SecurityGovernanceJoinedItem } from '../lib/security-governance'
import { cn } from '../lib/utils'

type ReportStatus = '生成中' | '待复核' | '已归档'
type ReportType = '日报' | '周报' | '月报' | '专项报告'

type AuditReport = {
  id: string
  title: string
  type: ReportType
  status: ReportStatus
  period: string
  owner: string
  logCount: number
  riskCount: number
  traceCount: number
  conclusion: string
}

const auditSecondaryNavItems = [
  { id: 'query', label: '审计日志查询', path: '/security-governance/audit/log-query', icon: FileSearch },
  { id: 'trace', label: '操作链路追溯', path: '/security-governance/audit/trace', icon: Network },
  { id: 'report', label: '审计报告生成', path: '/security-governance/audit/report', icon: FileDown },
]

function buildReports(items: SecurityGovernanceJoinedItem[]): AuditReport[] {
  return items.map((item, index) => ({
    id: `RPT-${String(index + 1).padStart(5, '0')}`,
    title: `${item.securityCategory || '数据安全'}审计${item.coreControlFlag || item.approvalRequired ? '专项报告' : '日报'}`,
    type: item.coreControlFlag || item.approvalRequired ? '专项报告' : '日报',
    status: item.securityReviewStatus === 'pending' || item.approvalRequired ? '待复核' : item.policyStatus === 'disabled' ? '生成中' : '已归档',
    period: item.updateTime ? item.updateTime.slice(0, 10) : '未记录',
    owner: item.securityOwnerUserName || '未指定责任人',
    logCount: 1,
    riskCount: Number(item.coreControlFlag || item.approvalRequired || item.importantDataFlag || item.sensitiveFieldCount > 0),
    traceCount: 1,
    conclusion: item.coreControlFlag ? '发现核心数据跨域访问高风险，需要复核责任链路。' : '访问控制和审计留痕完整，未发现未闭环重大风险。',
  }))
}

function statusTone(status: ReportStatus) {
  if (status === '已归档') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (status === '待复核') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  return 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
}

function AuditSecondaryTabs({ withEmbed, actions }: { withEmbed: (path: string) => string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <nav aria-label="日志链路审计二级导航" className="inline-flex flex-wrap gap-2 rounded-[18px] border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[color-mix(in_srgb,var(--surface-glass)_92%,transparent)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
        {auditSecondaryNavItems.map((item) => {
          const active = item.id === 'report'
          return (
            <Link
              key={item.id}
              to={withEmbed(item.path)}
              className={cn(
                'inline-flex min-h-11 items-center gap-3 whitespace-nowrap rounded-[14px] px-4 py-3 text-[0.875rem] font-medium transition',
                active ? 'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] !text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.20)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]',
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

export function SecurityAuditReportPage() {
  const location = useLocation()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const {
    data: { catalogItems },
    isLoading: isPortalLoading,
  } = usePortalContext()
  const { data: securityPolicies, isLoading: isSecurityLoading } = useSecurityGovernancePolicies(true)
  const [typeFilter, setTypeFilter] = useState<'全部' | ReportType>('全部')

  const joinedItems = useMemo(() => joinSecurityGovernanceItems(securityPolicies, catalogItems), [catalogItems, securityPolicies])
  const reports = useMemo(() => buildReports(joinedItems), [joinedItems])
  const filteredReports = reports.filter((report) => typeFilter === '全部' || report.type === typeFilter)
  const loading = isPortalLoading || isSecurityLoading
  const totalLogs = reports.reduce((sum, item) => sum + item.logCount, 0)
  const totalRisks = reports.reduce((sum, item) => sum + item.riskCount, 0)

  return (
    <div className="space-y-5">
      <AuditSecondaryTabs
        withEmbed={withEmbed}
        actions={
          <>
            <Button className="gap-2"><Plus className="h-4 w-4" />新建报告</Button>
            <Button variant="secondary" className="gap-2"><RefreshCw className="h-4 w-4" />重新生成</Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard title="报告总数" value={reports.length.toLocaleString()} detail="覆盖日报、周报、月报与专项审计。" icon={<FileText className="h-5 w-5" />} />
        <MetricCard title="纳入日志" value={totalLogs.toLocaleString()} detail="已汇总访问、策略、配置和同态加密日志。" icon={<ScrollText className="h-5 w-5" />} />
        <MetricCard title="风险结论" value={totalRisks.toLocaleString()} detail="高风险操作会自动进入专项报告。" icon={<ShieldAlert className="h-5 w-5" />} />
        <MetricCard title="已归档" value={reports.filter((item) => item.status === '已归档').length.toLocaleString()} detail="归档报告保留完整证据链。" icon={<ShieldCheck className="h-5 w-5" />} />
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[1rem] font-semibold text-[var(--text-main)]">报告生成配置</h2>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as '全部' | ReportType)} className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.8125rem] text-[var(--text-secondary)] outline-none">
              {['全部', '日报', '周报', '月报', '专项报告'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ['时间范围', '最近 24 小时 / 自定义周期'],
              ['日志范围', '数据访问、策略变更、配置修改、同态加密'],
              ['分析内容', '异常聚类、责任主体、链路路径、影响范围'],
              ['输出格式', 'PDF / DOCX / Markdown / 审计归档'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <div className="text-[0.875rem] font-semibold text-[var(--text-main)]">{title}</div>
                <div className="mt-2 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{detail}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="mb-3 flex items-center gap-2 text-[0.95rem] font-semibold text-[var(--text-main)]">
            <BarChart3 className="h-4 w-4 text-[var(--primary)]" />
            报告内容占比
          </div>
          {[
            ['审计日志证据', 42],
            ['拒绝访问分析', 26],
            ['链路追踪图谱', 18],
            ['整改建议', 14],
          ].map(([label, value]) => (
            <div key={label} className="mb-3">
              <div className="mb-1 flex justify-between text-[0.8125rem] text-[var(--text-secondary)]">
                <span>{label}</span>
                <span>{value}%</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--surface-muted)]">
                <div className="h-2 rounded-full bg-[var(--primary)]" style={{ width: `${value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载审计报告...</div>
      ) : null}

      <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
        <div className="grid grid-cols-[140px_minmax(260px,1.4fr)_100px_110px_170px_120px_120px_120px_minmax(220px,1fr)_130px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]">
          <span>报告编号</span>
          <span>报告名称</span>
          <span>类型</span>
          <span>状态</span>
          <span>周期</span>
          <span>日志数</span>
          <span>风险数</span>
          <span>链路数</span>
          <span>结论摘要</span>
          <span>操作</span>
        </div>
        <div className="overflow-x-auto">
          {filteredReports.map((report) => (
            <div key={report.id} className="grid min-w-[1420px] grid-cols-[140px_minmax(260px,1.4fr)_100px_110px_170px_120px_120px_120px_minmax(220px,1fr)_130px] gap-3 border-b border-[var(--line)] px-4 py-4 text-[0.8125rem] last:border-b-0 hover:bg-[var(--surface-muted)]">
              <span className="font-medium text-[var(--text-main)]">{report.id}</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-[var(--text-main)]">{report.title}</span>
                <span className="mt-1 block text-[0.75rem] text-[var(--text-muted)]">负责人：{report.owner}</span>
              </span>
              <span className="text-[var(--text-secondary)]">{report.type}</span>
              <span><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(report.status))}>{report.status}</span></span>
              <span className="text-[var(--text-secondary)]">{report.period}</span>
              <span className="font-semibold text-[var(--text-main)]">{report.logCount.toLocaleString()}</span>
              <span className="font-semibold text-[var(--text-main)]">{report.riskCount.toLocaleString()}</span>
              <span className="font-semibold text-[var(--text-main)]">{report.traceCount.toLocaleString()}</span>
              <span className="truncate text-[var(--text-secondary)]">{report.conclusion}</span>
              <span className="flex items-center gap-1">
                <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]" title="查看">
                  <FileSearch className="h-4 w-4" />
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center gap-3 text-[0.8125rem] text-[var(--text-secondary)]">
          <CalendarClock className="h-4 w-4 text-[var(--primary)]" />
          报告可设置每日 02:00 自动生成，生成后进入责任人复核，复核通过后归档并锁定证据版本。
        </div>
      </section>
    </div>
  )
}
