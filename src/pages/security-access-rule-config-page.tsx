import {
  Activity,
  CheckCircle2,
  DatabaseZap,
  FileCheck2,
  Gauge,
  LockKeyhole,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Tags,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../components/ui'
import { SecurityModuleTabs } from '../components/security-module-tabs'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { useSecurityDataSources, type SecurityDataSourceRecord } from '../lib/nocobase-security-runtime'
import { cn } from '../lib/utils'

type RuleStatus = '启用中' | '待审批' | '草稿' | '已停用'
type RuleType = '网关接入' | '完整性校验' | '加密传输' | '自动标签' | '异常处置'
type SourceScope = string

type AccessRuleRecord = {
  id: string
  name: string
  code: string
  type: RuleType
  status: RuleStatus
  sourceScope: SourceScope
  sourceName: string
  priority: number
  gatewayMode: string
  labelTemplate: string
  checksumAlgorithm: 'SM3' | 'SHA-256'
  encryptionAlgorithm: 'SM4' | 'AES-256'
  integrityRequired: boolean
  encryptionRequired: boolean
  autoLabelEnabled: boolean
  ownerDept: string
  owner: string
  updatedAt: string
  successRate: number | null
  blockedCount: number
  description: string
  conditions: string[]
  actions: string[]
}

const ruleTypes: Array<'全部类型' | RuleType> = ['全部类型', '网关接入']
const ruleStatuses: Array<'全部' | RuleStatus> = ['全部', '启用中', '待审批', '草稿', '已停用']

function resolveRuleStatus(source: SecurityDataSourceRecord): RuleStatus {
  if (source.status === 'connected') return '启用中'
  if (source.status === 'testing') return '待审批'
  if (source.status === 'unconnected') return '草稿'
  return '已停用'
}

function formatDate(value: string) {
  return value ? value.slice(0, 10) : ''
}

function buildAccessRules(sources: SecurityDataSourceRecord[]): AccessRuleRecord[] {
  return sources.map((source): AccessRuleRecord => {
    const config = source.securityConfig
    const actions = [
      config.integrityEnabled ? `启用 ${config.checksumAlgorithm} 完整性校验` : '',
      config.encryptionEnabled ? `使用 ${config.encryptionAlgorithm} 加密传输` : '',
      source.tags.length > 0 ? `绑定数据源标签：${source.tags.join('、')}` : '',
      config.samplingEnabled ? `按 ${config.samplingRate}% 比例执行接入抽样` : '',
    ].filter(Boolean)
    const priority = source.sensitivity === 'highly_sensitive' ? 100 : source.sensitivity === 'sensitive' ? 80 : source.sensitivity === 'internal' ? 60 : 40
    return {
      id: source.id,
      name: `${source.name}安全接入规则`,
      code: `ACCESS-${source.code}`,
      type: '网关接入',
      status: resolveRuleStatus(source),
      sourceScope: source.sourceTypeLabel,
      sourceName: source.name,
      priority,
      gatewayMode: source.sensitivity === 'highly_sensitive' ? '专用接入网关' : '共享接入网关',
      labelTemplate: source.tags.join('、') || '未配置标签',
      checksumAlgorithm: config.checksumAlgorithm,
      encryptionAlgorithm: config.encryptionAlgorithm,
      integrityRequired: config.integrityEnabled,
      encryptionRequired: config.encryptionEnabled,
      autoLabelEnabled: source.tags.length > 0,
      ownerDept: source.ownerDept || '未指定责任部门',
      owner: source.ownerDept || '未指定责任人',
      updatedAt: formatDate(source.updatedAt),
      successRate: source.monitor.checksumPassRate,
      blockedCount: source.monitor.blockedCount,
      description: source.description || `${source.name}的统一安全接入配置。`,
      conditions: [
        `数据源类型等于 ${source.sourceTypeLabel}`,
        `敏感度等于 ${source.sensitivityLabel}`,
        `连接状态等于 ${source.statusLabel}`,
      ],
      actions: actions.length > 0 ? actions : ['未配置安全接入动作'],
    }
  }).sort((left, right) => right.priority - left.priority || (right.successRate ?? -1) - (left.successRate ?? -1))
}

function SourceSecondaryTabs({ actions }: { actions?: ReactNode }) {
  return <SecurityModuleTabs module="ingest" actions={actions} />
}

function statusTone(status: RuleStatus) {
  if (status === '启用中') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (status === '待审批') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  if (status === '草稿') return 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
  return 'border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-muted)]'
}

function MetricCard({ title, value, detail, icon, tone = 'primary' }: { title: string; value: string; detail: string; icon: ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const toneClass = {
    primary: 'bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]',
    success: 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
    warning: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]',
    danger: 'bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]',
  }[tone]

  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-[8px]', toneClass)}>{icon}</div>
        <div>
          <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
          <div className="mt-1 text-[1.45rem] font-semibold text-[var(--text-main)]">{value}</div>
        </div>
      </div>
      <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{detail}</div>
    </div>
  )
}

function RuleDrawer({ rule, onClose }: { rule: AccessRuleRecord | null; onClose: () => void }) {
  if (!rule) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex h-full max-h-[100dvh] w-full max-w-[720px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-strong)]">
        <div className="flex shrink-0 items-start justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <div className="text-[0.75rem] text-[var(--text-muted)]">接入规则详情</div>
            <h2 className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{rule.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(rule.status))}>{rule.status}</span>
              <span className="rounded-full border border-[var(--line)] bg-[var(--surface-muted)] px-2.5 py-1 text-[0.75rem] text-[var(--text-secondary)]">{rule.type}</span>
            </div>
          </div>
          <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="grid gap-3 sm:grid-cols-2">
            {[
              ['规则编码', rule.code],
              ['来源范围', rule.sourceScope],
              ['接入网关', rule.gatewayMode],
              ['责任部门', rule.ownerDept],
              ['完整性算法', rule.checksumAlgorithm],
              ['加密算法', rule.encryptionAlgorithm],
            ].map(([title, value]) => (
              <div key={title} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
                <div className="mt-1 text-[0.875rem] font-medium text-[var(--text-main)]">{value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">规则条件</h3>
            <div className="mt-3 grid gap-2">
              {rule.conditions.map((condition) => (
                <div key={condition} className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-[0.8125rem] text-[var(--text-secondary)]">{condition}</div>
              ))}
            </div>
          </section>

          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">执行动作</h3>
            <div className="mt-3 grid gap-2">
              {rule.actions.map((action) => (
                <div key={action} className="flex items-center gap-2 rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-[0.8125rem] text-[var(--text-secondary)]">
                  <CheckCircle2 className="h-4 w-4 text-[var(--status-success-text)]" />
                  {action}
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            {[
              ['完整性校验', rule.integrityRequired ? '启用' : '关闭'],
              ['加密传输', rule.encryptionRequired ? '启用' : '关闭'],
              ['自动标签', rule.autoLabelEnabled ? rule.labelTemplate : '未启用'],
            ].map(([title, value]) => (
              <div key={title} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
                <div className="mt-1 text-[0.875rem] font-medium text-[var(--text-main)]">{value}</div>
              </div>
            ))}
          </section>
        </div>
        <div className="sticky bottom-0 z-10 flex shrink-0 justify-end border-t border-[var(--line)] bg-[var(--surface)] px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgba(8,18,32,0.08)]">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>关闭</Button>
        </div>
      </aside>
    </div>,
    document.body,
  )
}

export function SecurityAccessRuleConfigPage() {
  const location = useLocation()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const { data: securitySources, isLoading: isSourceLoading, error: sourceError } = useSecurityDataSources(true)
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState<'全部类型' | RuleType>('全部类型')
  const [statusFilter, setStatusFilter] = useState<'全部' | RuleStatus>('全部')
  const [sourceFilter, setSourceFilter] = useState<SourceScope>('全部来源')
  const [selectedRule, setSelectedRule] = useState<AccessRuleRecord | null>(null)

  const rules = useMemo(() => buildAccessRules(securitySources), [securitySources])
  const sourceScopes = useMemo(() => ['全部来源', ...Array.from(new Set(rules.map((rule) => rule.sourceScope)))], [rules])
  const filteredRules = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return rules
      .filter((rule) => typeFilter === '全部类型' || rule.type === typeFilter)
      .filter((rule) => statusFilter === '全部' || rule.status === statusFilter)
      .filter((rule) => sourceFilter === '全部来源' || rule.sourceScope === sourceFilter)
      .filter((rule) => {
        if (!normalizedKeyword) return true
        return [rule.name, rule.code, rule.sourceName, rule.sourceScope, rule.owner, rule.ownerDept, rule.description].some((value) => value.toLowerCase().includes(normalizedKeyword))
      })
  }, [keyword, rules, sourceFilter, statusFilter, typeFilter])
  const loading = isSourceLoading
  const enabledRules = rules.filter((rule) => rule.status === '启用中').length
  const integrityCoverage = rules.length ? Math.round((rules.filter((rule) => rule.integrityRequired).length / rules.length) * 100) : 0
  const encryptionCoverage = rules.length ? Math.round((rules.filter((rule) => rule.encryptionRequired).length / rules.length) * 100) : 0
  const labelCoverage = rules.length ? Math.round((rules.filter((rule) => rule.autoLabelEnabled).length / rules.length) * 100) : 0

  const resetFilters = () => {
    setKeyword('')
    setTypeFilter('全部类型')
    setStatusFilter('全部')
    setSourceFilter('全部来源')
  }

  return (
    <>
      <div className="space-y-5">
        <SourceSecondaryTabs
          actions={
            <Link to={withEmbed('/security-governance/ingest/sources')}>
              <Button className="gap-2"><DatabaseZap className="h-4 w-4" />配置数据源规则</Button>
            </Link>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard title="接入规则总数" value={rules.length.toLocaleString()} detail={`已连接 ${enabledRules} 条，其余保持真实连接状态。`} icon={<ShieldCheck className="h-5 w-5" />} />
          <MetricCard title="完整性校验覆盖" value={`${integrityCoverage}%`} detail="来自数据源安全接入配置。" icon={<FileCheck2 className="h-5 w-5" />} tone="success" />
          <MetricCard title="加密传输覆盖" value={`${encryptionCoverage}%`} detail="仅统计已启用 SM4/AES-256 的数据源。" icon={<LockKeyhole className="h-5 w-5" />} tone="warning" />
          <MetricCard title="标签配置覆盖" value={`${labelCoverage}%`} detail="直接统计数据源后台标签。" icon={<Tags className="h-5 w-5" />} />
        </div>

        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_160px_160px_180px_auto]">
            <label className="flex h-10 min-w-0 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3">
              <Search className="h-4 w-4 text-[var(--text-muted)]" />
              <input
                aria-label="搜索接入规则"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                placeholder="搜索接入规则名称、数据源名称、规则编码或责任部门"
              />
            </label>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as '全部类型' | RuleType)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none">
              {ruleTypes.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as '全部' | RuleStatus)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none">
              {ruleStatuses.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceScope)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none">
              {sourceScopes.map((item) => <option key={item}>{item}</option>)}
            </select>
            <Button variant="secondary" className="gap-2" onClick={resetFilters}>
              <RefreshCw className="h-4 w-4" />
              重置筛选
            </Button>
          </div>
        </section>

        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="mb-4 flex items-center gap-2 text-[1rem] font-semibold text-[var(--text-main)]">
            <Activity className="h-4 w-4 text-[var(--primary)]" />
            接入规则闭环
          </div>
          <div className="grid gap-3 lg:grid-cols-5">
            {[
              ['识别数据源特征', '匹配用采2.0、调控云等来源'],
              ['绑定标签模板', '按安全分类自动标注'],
              ['完整性快速校验', 'SM3/SHA-256 校验批次'],
              ['加密传输', 'SM4/AES-256 安全链路'],
              ['网关下发与审计', '记录规则版本和执行结果'],
            ].map(([title, detail], index) => (
              <div key={title} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 text-[0.875rem] font-semibold text-[var(--text-main)]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]">{index + 1}</span>
                  {title}
                </div>
                <div className="mt-2 text-[0.75rem] leading-5 text-[var(--text-secondary)]">{detail}</div>
              </div>
            ))}
          </div>
        </section>

        {loading ? (
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载接入规则...</div>
        ) : null}
        {sourceError ? (
          <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-3 text-[0.875rem] text-[var(--status-danger-text)]">{sourceError}</div>
        ) : null}

        <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
          <div className="grid grid-cols-[150px_minmax(260px,1.4fr)_118px_110px_112px_150px_130px_130px_110px_130px_140px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]">
            <span>规则编码</span>
            <span>规则名称</span>
            <span>类型</span>
            <span>状态</span>
            <span>优先级</span>
            <span>来源范围</span>
            <span>完整性校验</span>
            <span>加密传输</span>
            <span>通过率</span>
            <span>责任人</span>
            <span>操作</span>
          </div>
          <div className="overflow-x-auto">
            {filteredRules.map((rule) => (
              <div key={rule.id} className="grid min-w-[1480px] grid-cols-[150px_minmax(260px,1.4fr)_118px_110px_112px_150px_130px_130px_110px_130px_140px] gap-3 border-b border-[var(--line)] px-4 py-4 text-[0.8125rem] last:border-b-0 hover:bg-[var(--surface-muted)]">
                <span className="font-medium text-[var(--text-main)]">{rule.code}</span>
                <span className="min-w-0">
                  <button type="button" className="block truncate text-left font-semibold text-[var(--text-main)] hover:text-[var(--primary)]" onClick={() => setSelectedRule(rule)}>{rule.name}</button>
                  <span className="mt-1 block truncate text-[0.75rem] text-[var(--text-muted)]">{rule.sourceName}</span>
                </span>
                <span className="text-[var(--text-secondary)]">{rule.type}</span>
                <span><span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(rule.status))}>{rule.status}</span></span>
                <span className="font-semibold text-[var(--text-main)]">{rule.priority}</span>
                <span className="truncate text-[var(--text-secondary)]">{rule.sourceScope}</span>
                <span className="text-[var(--text-secondary)]">{rule.integrityRequired ? rule.checksumAlgorithm : '关闭'}</span>
                <span className="text-[var(--text-secondary)]">{rule.encryptionRequired ? rule.encryptionAlgorithm : '关闭'}</span>
                <span className="font-semibold text-[var(--text-main)]">{rule.successRate == null ? '-' : `${rule.successRate.toFixed(1)}%`}</span>
                <span className="truncate text-[var(--text-secondary)]">{rule.owner}</span>
                <span className="flex items-center gap-1">
                  <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]" title="查看详情" onClick={() => setSelectedRule(rule)}>
                    <Gauge className="h-4 w-4" />
                  </button>
                </span>
              </div>
            ))}
            {!loading && filteredRules.length === 0 ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">后台暂无匹配的数据源接入规则。</div> : null}
          </div>
        </section>
      </div>
      <RuleDrawer rule={selectedRule} onClose={() => setSelectedRule(null)} />
    </>
  )
}
