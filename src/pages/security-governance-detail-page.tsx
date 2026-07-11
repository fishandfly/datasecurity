import { ArrowLeft, Database, DatabaseZap, FileSearch, FolderTree, LockKeyhole, Network, PencilLine, RefreshCw, ScrollText, ShieldCheck, Workflow } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  SecurityGovernanceFieldEditDialog,
  SecurityGovernanceProfileEditDialog,
} from '../components/security-governance-edit-dialog'
import { LatestDataPreviewPanel } from '../components/latest-data-preview-panel'
import { LineageRelationGraph } from '../components/lineage-relation-graph'
import { ScenicPanel, StatCard, TopicPill } from '../components/ui'
import { canManageCatalogResources } from '../lib/admin-role'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { useSecurityGovernancePolicyDetail } from '../lib/nocobase-security-governance'
import { connectStatusMeta, formatMB, formatNumber, useLatestResourceBatchStat } from '../lib/nocobase-stat-data'
import type { CatalogItem } from '../lib/nocobase-portal-data'
import { usePortalContext } from '../lib/portal-context'
import {
  resolveSecurityBooleanLabel,
  resolveSecurityScopeLabel,
  resolveSecurityStatusLabel,
} from '../lib/security-governance'

type SecurityGovernanceDetailLocationState = {
  returnTo?: string
}

type SecurityGovernanceDetailTabKey = 'overview' | 'fieldSecurity' | 'status' | 'physicalTables' | 'latestPreview' | 'lineage'

type PhysicalTableRowState = {
  tableName: string
  sourceSystem: string
  businessTimeField: string
  isBaseline: boolean
}

function splitPhysicalTableNames(value: string) {
  return value
    .split(/[、,，;；\n\r]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== '未标注')
}

function buildPhysicalTableState(item: CatalogItem) {
  const tables = Array.from(
    new Set(
      (item.physicalTables.tables.length > 0 ? item.physicalTables.tables : splitPhysicalTableNames(item.sourceTable))
        .map((table) => table.trim())
        .filter((table) => table.length > 0 && table !== '未标注'),
    ),
  )
  const sourceSystems = Array.from(
    new Set(
      item.physicalTables.sourceSystems
        .map((sourceSystem) => sourceSystem.trim())
        .filter((sourceSystem) => sourceSystem.length > 0 && sourceSystem !== '未标注'),
    ),
  )
  const baseline = item.physicalTables.baseline.trim() && item.physicalTables.baseline !== '未标注'
    ? item.physicalTables.baseline.trim()
    : tables[0] ?? ''

  const orderedRows = (
    item.physicalTables.rows.length > 0
      ? item.physicalTables.rows
      : tables.map((tableName) => ({
          tableName,
          sourceSystem: '',
          businessTimeField: tableName === baseline ? item.physicalTables.businessTimeField.trim() : '',
          isBaseline: tableName === baseline,
        }))
  )
    .map((row) => ({
      ...row,
      tableName: row.tableName.trim(),
      sourceSystem: row.sourceSystem.trim(),
      businessTimeField: row.businessTimeField.trim(),
      isBaseline: row.isBaseline || (!!baseline && row.tableName.trim() === baseline),
    }))
    .filter((row) => row.tableName.length > 0 && row.tableName !== '未标注')

  const uniqueRows = Array.from(new Map(orderedRows.map((row) => [row.tableName, row])).values())
  const rows = baseline
    ? [
        ...uniqueRows.filter((row) => row.tableName === baseline),
        ...uniqueRows.filter((row) => row.tableName !== baseline),
      ]
    : uniqueRows

  return { rows, sourceSystems, baseline }
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-[1.125rem] font-semibold text-[var(--text-main)]">
        <span className="text-[var(--primary)]">{icon}</span>
        <span>{title}</span>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

type AlignmentItem = {
  label: string
  path: string
  value: string
  description: string
  icon: typeof Database
}

function ModuleAlignmentStrip({
  title,
  items,
  withEmbed,
}: {
  title: string
  items: AlignmentItem[]
  withEmbed: (path: string) => string
}) {
  return (
    <div className="mt-5">
      <div className="mb-3 text-[0.8125rem] font-semibold text-[var(--text-secondary)]">{title}</div>
      <div className="grid gap-3 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.label}
            to={withEmbed(item.path)}
            className="group rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-[1px] hover:border-[rgba(var(--theme-soft-rgb),0.28)] hover:shadow-[var(--shadow-medium)]"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--primary-soft)_78%,var(--surface))] text-[var(--primary)]">
                <item.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[0.875rem] font-semibold text-[var(--text-main)] transition group-hover:text-[var(--primary)]">{item.label}</div>
                <div className="mt-1 text-[0.75rem] leading-5 text-[var(--text-muted)]">{item.description}</div>
              </div>
            </div>
            <div className="mt-3 rounded-[10px] bg-[var(--surface-muted)] px-3 py-2 text-[0.8125rem] font-medium text-[var(--text-secondary)]">
              {item.value}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function formatBusinessTimeStatusLabel(status: string, hasConfiguredField: boolean) {
  switch (status.trim()) {
    case 'fresh':
      return '正常更新'
    case 'stale':
      return '长期未更新'
    case 'field_missing':
      return '字段不存在'
    case 'table_missing':
      return '基准表缺失'
    case 'missing':
      return '无业务时间值'
    case 'invalid':
      return '时间值无效'
    case 'not_configured':
      return '未配置业务时间'
    default:
      return hasConfiguredField ? '待统计' : '未配置'
  }
}

function buildBusinessTimeHint(item: CatalogItem, latestStatRecord: ReturnType<typeof useLatestResourceBatchStat>['data']['record']) {
  const ageDays = latestStatRecord?.metainfo.business_time_age_days
  const thresholdDays = latestStatRecord?.metainfo.business_time_stale_threshold_days

  if (typeof ageDays === 'number' && Number.isFinite(ageDays)) {
    if (typeof thresholdDays === 'number' && Number.isFinite(thresholdDays)) {
      return `距今天 ${ageDays} 天，阈值 ${thresholdDays} 天`
    }
    return `距今天 ${ageDays} 天`
  }

  if (latestStatRecord?.metainfo.business_time_trace_summary?.trim()) {
    return latestStatRecord.metainfo.business_time_trace_summary.trim()
  }

  if (item.updateCycle.trim()) {
    return `更新周期：${item.updateCycle.trim()}`
  }

  return '尚未形成可用的业务时间判断信息'
}

function buildSecurityInsight(status: string, hasConfiguredField: boolean) {
  switch (status.trim()) {
    case 'fresh':
      return '业务时间字段已正常识别，可据此判断当前资源是否按周期及时更新。'
    case 'stale':
      return '业务时间字段已识别，但最新业务时间明显滞后，建议检查上游更新任务与共享策略。'
    case 'field_missing':
      return '统计任务已尝试识别业务时间字段，但目标字段不存在，建议核对基准表结构。'
    case 'table_missing':
      return '当前资源缺少有效基准表，安全时效判断无法稳定落地，建议先补齐物理表配置。'
    case 'missing':
      return '业务时间字段存在，但最新记录没有可解析的业务时间值，建议检查源数据质量。'
    case 'invalid':
      return '业务时间值存在但格式无效，建议核对日期字段类型与清洗逻辑。'
    case 'not_configured':
      return '当前资源尚未配置业务时间字段，无法做时效性安全判读。'
    default:
      return hasConfiguredField
        ? '当前资源已配置业务时间字段，等待最新统计任务形成完整安全时效判断。'
        : '当前资源尚未配置业务时间字段，建议先维护基准表与业务时间字段。'
  }
}

function normalizeText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

function formatDateText(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) return '未标注'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateTimeText(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) return '未标注'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export function SecurityGovernanceDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDataItemsEditOpen, setIsDataItemsEditOpen] = useState(false)
  const [editSuccessMessage, setEditSuccessMessage] = useState('')
  const {
    data,
    isLoading: isPortalLoading,
    error: portalError,
    refresh: refreshPortalData,
    session,
  } = usePortalContext()
  const { catalogItems } = data
  const {
    data: securityPolicy,
    isLoading: isSecurityPolicyLoading,
    error: securityPolicyError,
    refresh: refreshSecurityPolicy,
  } = useSecurityGovernancePolicyDetail(id, true)
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const locationState = (location.state ?? null) as SecurityGovernanceDetailLocationState | null
  const returnTo = typeof locationState?.returnTo === 'string' && locationState.returnTo.trim().length > 0
    ? locationState.returnTo
    : ''
  const requestedTab = searchParams.get('tab') as SecurityGovernanceDetailTabKey | null

  const handleGoBack = () => {
    if (returnTo) {
      navigate(returnTo)
      return
    }
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate(withEmbed('/security-governance'))
  }

  const item = catalogItems.find((entry) => entry.id === securityPolicy?.resourceId)
  const statEnabled = !isPortalLoading && Boolean(item)
  const { data: latestBatchStat, isLoading: isLatestBatchStatLoading, error: latestBatchStatError } =
    useLatestResourceBatchStat(item?.id, statEnabled)
  const isLoading = isPortalLoading || isSecurityPolicyLoading
  const error = securityPolicyError || portalError || null

  if (isLoading) {
    return <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载安全管控详情...</div>
  }

  if (error) {
    return (
      <div className="rounded-[18px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-6 text-[0.875rem] leading-7 text-[var(--status-danger-text)]">
        {error}
      </div>
    )
  }

  if (!securityPolicy) {
    return <Navigate to={withEmbed('/security-governance')} replace />
  }

  if (!item) {
    return (
      <div className="rounded-[18px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-6 text-[0.875rem] leading-7 text-[var(--status-danger-text)]">
        关联的数据资源不存在，当前仅保留安全档案主记录。
      </div>
    )
  }

  const physicalTableState = buildPhysicalTableState(item)
  const baselineBusinessTimeField = physicalTableState.rows.find((row) => row.isBaseline)?.businessTimeField
    || item.physicalTables.businessTimeField.trim()
  const latestStatRecord = latestBatchStat.record
  const latestStatus = latestStatRecord ? connectStatusMeta(latestStatRecord.connectStatus) : null
  const businessTimeStatusLabel = formatBusinessTimeStatusLabel(
    latestStatRecord?.metainfo.business_time_status ?? '',
    Boolean(baselineBusinessTimeField),
  )
  const businessTimeHint = buildBusinessTimeHint(item, latestStatRecord)
  const securityInsight = buildSecurityInsight(
    latestStatRecord?.metainfo.business_time_status ?? '',
    Boolean(baselineBusinessTimeField),
  )
  const latestPreviewBaselineTableName = physicalTableState.baseline
    || physicalTableState.rows[0]?.tableName
    || splitPhysicalTableNames(item.sourceTable)[0]
    || item.sourceTable
  const canManageResources = canManageCatalogResources(session?.user.roles)
  const detailTabs: Array<[SecurityGovernanceDetailTabKey, string]> = [
    ['overview', '安全管控信息'],
    ['fieldSecurity', '字段安全'],
    ['lineage', '血缘关系'],
    ['status', '安全状态'],
    ['physicalTables', '物理表'],
    ['latestPreview', '最新预览'],
  ]
  const activeTab = detailTabs.some(([key]) => key === requestedTab)
    ? (requestedTab as SecurityGovernanceDetailTabKey)
    : 'overview'

  const overviewMetrics = [
    {
      key: 'securityCategory',
      title: '安全分类',
      value: securityPolicy.securityCategory || '未标注',
      tone: 'blue' as const,
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      key: 'securityLevel',
      title: '安全等级',
      value: securityPolicy.securityLevel || '未标注',
      tone: 'green' as const,
      icon: <LockKeyhole className="h-4 w-4" />,
    },
    {
      key: 'reviewStatus',
      title: '复核状态',
      value: resolveSecurityStatusLabel(securityPolicy.securityReviewStatus),
      tone: 'blue' as const,
      icon: <RefreshCw className="h-4 w-4" />,
    },
    {
      key: 'importantData',
      title: '重要数据',
      value: resolveSecurityBooleanLabel(securityPolicy.importantDataFlag),
      tone: 'green' as const,
      icon: <Database className="h-4 w-4" />,
    },
  ]

  const physicalTableCount = securityPolicy.legacyPhysicalTableRows.length > 0
    ? securityPolicy.legacyPhysicalTableRows.length
    : physicalTableState.rows.length
  const accessScopeLabel = resolveSecurityScopeLabel(securityPolicy.accessScope)
  const shareScopeLabel = resolveSecurityScopeLabel(securityPolicy.shareScope)
  const approvalModeLabel = resolveSecurityScopeLabel(securityPolicy.approvalMode)
  const desensitizationModeLabel = resolveSecurityScopeLabel(securityPolicy.desensitizationMode)
  const exportScopeLabel = resolveSecurityScopeLabel(securityPolicy.exportScope)
  const apiAuthModeLabel = resolveSecurityScopeLabel(securityPolicy.apiAuthMode)
  const controlFlagLabel = [
    securityPolicy.importantDataFlag ? '重要数据' : '',
    securityPolicy.coreControlFlag ? '核心管控对象' : '',
  ].filter(Boolean).join(' / ') || '普通资源'

  const infoRows = [
    ['数据分类', item.businessCategoryPath || item.category || '未标注', '业务分类', item.businessAttributePath || item.businessAttribute || '未标注'],
    ['数据接入来源', item.sourceSystem || physicalTableState.sourceSystems.join('、') || item.department || '未标注', '物理表数量', `${physicalTableCount.toLocaleString()} 张`],
    ['基准表', physicalTableState.baseline || '未识别', '业务时间字段', baselineBusinessTimeField || '未配置'],
    ['安全分类', securityPolicy.securityCategory || '未标注', '安全等级', securityPolicy.securityLevel || '未标注'],
    ['管控标识', controlFlagLabel, '策略状态', resolveSecurityStatusLabel(securityPolicy.policyStatus)],
    ['安全责任部门', securityPolicy.securityOwnerDept || '未标注', '安全责任人', securityPolicy.securityOwnerUserName || '未标注'],
    ['访问范围', accessScopeLabel, '共享范围', shareScopeLabel],
    ['审批模式', approvalModeLabel, '脱敏方式', desensitizationModeLabel],
    ['导出范围', exportScopeLabel, 'API 鉴权方式', apiAuthModeLabel],
    ['复核计划', `最近 ${formatDateTimeText(securityPolicy.lastReviewedAt)} / 下次 ${formatDateText(securityPolicy.nextReviewAt)}`, '定级依据', securityPolicy.assessmentBasis || '未补充'],
    ['风险说明', securityPolicy.riskNotes || '未补充', '', ''],
  ] as const

  const latestStatusCards = [
    {
      title: '连通状态',
      value: latestStatus?.label || '未产生统计',
      description: latestBatchStat.latestPeriodCode ? `统计批次 ${latestBatchStat.latestPeriodCode}` : '暂无可用统计批次',
    },
    {
      title: '业务时间状态',
      value: businessTimeStatusLabel,
      description: businessTimeHint,
    },
    {
      title: '业务时间字段',
      value: baselineBusinessTimeField || '未配置',
      description: physicalTableState.baseline ? `基准表：${physicalTableState.baseline}` : '尚未识别基准表',
    },
    {
      title: '最新记录量',
      value: latestStatRecord ? `${formatNumber(latestStatRecord.metainfo.record_count ?? 0)} 条` : '未统计',
      description: latestStatRecord ? `存储量 ${formatMB(latestStatRecord.metainfo.storage_bytes ?? 0)}` : '等待统计任务产出',
    },
  ]
  const fieldPolicyByCode = new Map(
    securityPolicy.fieldSecurityPolicyRows.map((row) => [row.fieldCode, row] as const),
  )
  const fieldSecurityRows = securityPolicy.fieldSecurityProfileRows.map((profile, index) => {
    const matchedPolicy = fieldPolicyByCode.get(profile.fieldCode)
    return {
      id: String(profile.seq ?? index + 1),
      fieldName: profile.fieldName || `字段${index + 1}`,
      englishName: profile.fieldCode || '-',
      fieldType: profile.dataType || '未标注',
      informationCategory: [
        profile.informationCategory,
        profile.classificationLevel,
        profile.securityLevel,
      ].filter(Boolean).join(' / ') || '未标注',
      securityPolicy: [
        resolveSecurityScopeLabel(matchedPolicy?.requiredAccessScope ?? ''),
        matchedPolicy?.requiredDesensitization ? resolveSecurityScopeLabel(matchedPolicy.requiredDesensitizationMode) : '',
        matchedPolicy?.requiredExportAllowed ? resolveSecurityScopeLabel(matchedPolicy.requiredExportScope) : '',
        matchedPolicy?.requiredApprovalRequired ? '需审批' : '',
      ].filter((part) => part && part !== '未标注').join(' / ') || '未标注',
      description: profile.description || '未补充',
    }
  })
  const dataAccessAlignmentItems: AlignmentItem[] = [
    {
      label: '数据源配置',
      path: '/security-governance/data-access/source-config',
      value: item.sourceSystem || physicalTableState.sourceSystems.join('、') || '未标注来源系统',
      description: `${physicalTableCount.toLocaleString()} 张物理表 / ${baselineBusinessTimeField || '未配置业务时间字段'}`,
      icon: DatabaseZap,
    },
    {
      label: '接入规则配置',
      path: '/security-governance/data-access/rule-config',
      value: securityPolicy.policyName || securityPolicy.policyCode || `${securityPolicy.securityCategory || '资源'}接入规则`,
      description: `${accessScopeLabel} / ${desensitizationModeLabel}`,
      icon: ShieldCheck,
    },
    {
      label: '接入监控',
      path: '/security-governance/data-access/monitoring',
      value: latestStatus?.label || '未产生统计',
      description: latestBatchStat.latestPeriodCode ? `统计批次 ${latestBatchStat.latestPeriodCode}` : businessTimeStatusLabel,
      icon: Network,
    },
  ]
  const accessControlAlignmentItems: AlignmentItem[] = [
    {
      label: '数据分类分级',
      path: '/security-governance/access-control/classification',
      value: `${securityPolicy.securityCategory || '未标注'} / ${securityPolicy.securityLevel || '未标注'}`,
      description: `${fieldSecurityRows.length.toLocaleString()} 个字段纳入字段安全档案`,
      icon: Workflow,
    },
    {
      label: '策略引擎配置',
      path: '/security-governance/access-control/policy-engine',
      value: securityPolicy.policyName || securityPolicy.policyCode || '访问控制策略',
      description: `${accessScopeLabel} / ${approvalModeLabel} / ${exportScopeLabel}`,
      icon: LockKeyhole,
    },
  ]
  const homomorphicAlignmentItems: AlignmentItem[] = [
    {
      label: '数据同态加密',
      path: '/security-governance/homomorphic-encryption',
      value: securityPolicy.coreControlFlag ? '核心对象优先管控' : securityPolicy.importantDataFlag ? '重要数据受控' : '按策略执行',
      description: `${desensitizationModeLabel} / ${apiAuthModeLabel}`,
      icon: ShieldCheck,
    },
  ]
  const auditAlignmentItems: AlignmentItem[] = [
    {
      label: '日志链路审计',
      path: '/security-governance/audit/log-query',
      value: resolveSecurityStatusLabel(securityPolicy.policyStatus),
      description: `${securityPolicy.securityOwnerUserName || '未指定责任人'} / ${securityPolicy.securityOwnerDept || item.department || '未标注部门'} / ${shareScopeLabel}`,
      icon: FileSearch,
    },
  ]

  const buildTabSearchParams = (tabKey: SecurityGovernanceDetailTabKey) => {
    const next = new URLSearchParams()
    next.set('tab', tabKey)
    if (isEmbedMode) {
      next.set('embed', '1')
    }
    return next
  }

  const handleTabChange = (tabKey: SecurityGovernanceDetailTabKey) => {
    navigate(
      { pathname: location.pathname, search: `?${buildTabSearchParams(tabKey).toString()}` },
      { replace: true, state: locationState ?? undefined },
    )
  }

  const tabsNav = (
    <div className="flex gap-4 border-b border-[var(--line)]">
      {detailTabs.map(([key, label]) => (
        <button
          type="button"
          key={key}
          className={`relative -mb-px inline-flex min-h-12 items-center rounded-t-[14px] border border-transparent px-4 pb-3 pt-3 text-[0.9375rem] ${
            activeTab === key
              ? 'z-10 -translate-y-[1px] border-[rgba(var(--theme-soft-rgb),0.24)] border-b-[var(--surface-raised-strong)] bg-[linear-gradient(180deg,var(--surface-raised-strong),color-mix(in_srgb,var(--primary-soft)_72%,var(--surface-raised)))] font-semibold text-[var(--primary)] shadow-[0_16px_32px_rgba(var(--theme-soft-rgb),0.14)]'
              : 'text-[var(--text-secondary)] transition hover:-translate-y-[1px] hover:border-[var(--surface-outline)] hover:bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] hover:text-[var(--primary)]'
          }`}
          onClick={() => handleTabChange(key)}
        >
          {label}
          {activeTab === key ? <span className="absolute left-1/2 bottom-1.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,var(--theme-accent),var(--primary))]" /> : null}
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      <ScenicPanel className="overflow-hidden border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] p-0 shadow-[var(--shadow-elevated)]">
        <div className="px-6 py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="max-w-[920px] text-[1.875rem] font-semibold leading-[1.34] text-[var(--text-main)]">{securityPolicy.resourceName || item.name}</h1>
                {latestStatus ? (
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[0.8125rem] font-semibold ${latestStatus.toneClass}`}>{latestStatus.label}</span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <TopicPill>安全档案编号：{securityPolicy.policyCode || securityPolicy.id}</TopicPill>
                <TopicPill>资源编码：{item.code || '未标注'}</TopicPill>
                <TopicPill>来源单位：{item.department || '未标注'}</TopicPill>
                <TopicPill>安全分类：{securityPolicy.securityCategory || '未标注'}</TopicPill>
                <TopicPill>安全等级：{securityPolicy.securityLevel || '未标注'}</TopicPill>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoBack}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] shadow-[0_10px_24px_rgba(51,98,146,0.08)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              返回安全管控
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overviewMetrics.map((metric) => (
              <StatCard
                key={metric.key}
                title={metric.title}
                value={metric.value}
                hideRail
                tone={metric.tone}
                icon={metric.icon}
              />
            ))}
          </div>
        </div>
      </ScenicPanel>

      {tabsNav}

      {editSuccessMessage ? (
        <div className="rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-success-text)]">
          {editSuccessMessage}
        </div>
      ) : null}

      {activeTab === 'overview' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader
            icon={<ShieldCheck className="h-5 w-5" />}
            title="安全管控信息"
            action={(
              <div className="flex flex-wrap items-center gap-2">
                {canManageResources ? (
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                  >
                    <PencilLine className="h-4 w-4" />
                    编辑资源
                  </button>
                ) : null}
                <Link
                  to={withEmbed(`/catalog/${item.id}`)}
                  state={{ returnTo: `${location.pathname}${location.search}` }}
                  className="inline-flex h-10 items-center rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  资源目录详情
                </Link>
              </div>
            )}
          />

          <ModuleAlignmentStrip
            title="数据接入管理一致口径"
            items={dataAccessAlignmentItems}
            withEmbed={withEmbed}
          />

          <div className="mt-5 overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
            {infoRows.map((row, index) => (
              <div
                key={`${row[0]}-${index}`}
                className="grid border-b border-[var(--surface-outline)] last:border-b-0 lg:grid-cols-[124px_minmax(320px,1.7fr)_124px_minmax(240px,1fr)]"
              >
                <div className="border-b border-[var(--surface-outline)] bg-[var(--table-header-bg)] px-4 py-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] lg:border-b-0">
                  {row[0]}
                </div>
                <div className={`px-4 py-4 text-[0.875rem] leading-7 text-[var(--text-main)] ${row[2] ? '' : 'lg:col-span-3'}`}>
                  {row[1]}
                </div>
                {row[2] ? (
                  <>
                    <div className="border-t border-[var(--surface-outline)] bg-[var(--table-header-bg)] px-4 py-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] lg:border-l lg:border-t-0">
                      {row[2]}
                    </div>
                    <div className="px-4 py-4 text-[0.875rem] leading-7 text-[var(--text-main)]">{row[3]}</div>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === 'fieldSecurity' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader
            icon={<LockKeyhole className="h-5 w-5" />}
            title="字段安全"
            action={
              canManageResources ? (
                <button
                  type="button"
                  onClick={() => setIsDataItemsEditOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  <PencilLine className="h-4 w-4" />
                  编辑字段
                </button>
              ) : null
            }
          />

          <ModuleAlignmentStrip
            title="访问控制管理一致口径"
            items={accessControlAlignmentItems}
            withEmbed={withEmbed}
          />
          <ModuleAlignmentStrip
            title="数据同态加密一致口径"
            items={homomorphicAlignmentItems}
            withEmbed={withEmbed}
          />

          {fieldSecurityRows.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
              <div className="overflow-x-auto">
                <table className="min-w-[1080px] w-full text-left text-[0.8125rem] text-[var(--text-secondary)]">
                  <thead className="bg-[var(--table-header-bg)] text-[0.75rem] font-semibold text-[var(--text-muted)]">
                    <tr>
                      <th className="px-4 py-3.5">字段名称</th>
                      <th className="px-4 py-3.5">字段编码</th>
                      <th className="px-4 py-3.5">数据类型</th>
                      <th className="px-4 py-3.5">字段分类分级</th>
                      <th className="px-4 py-3.5">字段安全策略</th>
                      <th className="px-4 py-3.5">字段说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldSecurityRows.map((field, index) => (
                      <tr
                        key={field.id}
                        className={index % 2 === 0 ? 'bg-[var(--surface-raised)]' : 'bg-[var(--surface-muted)]'}
                      >
                        <td className="px-4 py-3.5 font-medium text-[var(--text-main)]">{field.fieldName}</td>
                        <td className="px-4 py-3.5">{field.englishName}</td>
                        <td className="px-4 py-3.5">{field.fieldType}</td>
                        <td className="px-4 py-3.5">{field.informationCategory}</td>
                        <td className="px-4 py-3.5">{field.securityPolicy}</td>
                        <td className="px-4 py-3.5">{field.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[14px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-8 text-[0.875rem] leading-7 text-[var(--text-secondary)]">
              当前安全档案尚未维护字段级分类分级信息。
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'lineage' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader icon={<FolderTree className="h-5 w-5" />} title="数据安全血缘关系" />
          <LineageRelationGraph item={item} catalogItems={catalogItems} />
        </section>
      ) : null}

      {activeTab === 'status' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader icon={<ScrollText className="h-5 w-5" />} title="安全状态" />

          <ModuleAlignmentStrip
            title="日志链路审计一致口径"
            items={auditAlignmentItems}
            withEmbed={withEmbed}
          />

          <div className="mt-5 rounded-[14px] border border-[var(--status-info-border)] bg-[linear-gradient(180deg,var(--status-info-bg),color-mix(in_srgb,var(--status-info-bg)_64%,var(--surface-raised)))] px-4 py-4 text-[0.875rem] leading-7 text-[var(--status-info-text)]">
            {securityInsight}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {latestStatusCards.map((card) => (
              <div
                key={card.title}
                className="rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-4 shadow-[var(--shadow-soft)]"
              >
                <div className="text-[0.75rem] text-[var(--text-muted)]">{card.title}</div>
                <div className="mt-2 text-[1.125rem] font-semibold leading-7 text-[var(--text-main)]">{card.value}</div>
                <div className="mt-2 text-[0.75rem] leading-6 text-[var(--text-secondary)]">{card.description}</div>
              </div>
            ))}
          </div>

          {latestStatRecord?.metainfo.business_time_trace_summary?.trim() ? (
            <div className="mt-5 rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-4 text-[0.8125rem] leading-7 text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
              <div className="text-[0.875rem] font-semibold text-[var(--text-main)]">业务时间判定说明</div>
              <div className="mt-2">{latestStatRecord.metainfo.business_time_trace_summary.trim()}</div>
            </div>
          ) : null}

          {latestBatchStatError ? (
            <div className="mt-5 rounded-[14px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-4 text-[0.8125rem] leading-7 text-[var(--status-danger-text)]">
              {latestBatchStatError}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'physicalTables' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader icon={<Database className="h-5 w-5" />} title="物理表参考与业务时间字段" />

          {(securityPolicy.legacyPhysicalTableRows.length > 0 || physicalTableState.rows.length > 0) ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(securityPolicy.legacyPhysicalTableRows.length > 0 ? securityPolicy.legacyPhysicalTableRows : physicalTableState.rows).map((row: PhysicalTableRowState | typeof securityPolicy.legacyPhysicalTableRows[number], index) => (
                <div
                  key={`${row.tableName}-${index}`}
                  className="rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-4 shadow-[var(--shadow-soft)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.75rem] text-[var(--text-muted)]">物理表 {String(index + 1).padStart(2, '0')}</div>
                      <div className="mt-2 break-all text-[0.9375rem] font-semibold leading-6 text-[var(--text-main)]">{row.tableName}</div>
                    </div>
                    {(('isBaseline' in row) && row.isBaseline) || (('baselineFlag' in row) && row.baselineFlag) ? (
                      <span className="shrink-0 rounded-full bg-[var(--status-info-bg)] px-2.5 py-1 text-[0.6875rem] font-medium text-[var(--status-info-text)]">
                        基准表
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-2 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
                    <div>来源系统：{row.sourceSystem || item.sourceSystem || '未标注'}</div>
                    <div>业务时间字段：{row.businessTimeField || '未配置'}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[14px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-8 text-[0.875rem] leading-7 text-[var(--text-secondary)]">
              当前资源尚未维护物理表参考信息，无法形成稳定的业务时间字段与基准表判断。
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'latestPreview' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader icon={<RefreshCw className="h-5 w-5" />} title="最新数据预览" />

          <div className="mt-5">
            <LatestDataPreviewPanel
              baselineTableName={latestPreviewBaselineTableName}
              sourceSystems={physicalTableState.sourceSystems}
              previewData={latestStatRecord?.latestPreviewData ?? null}
              isLoading={isLatestBatchStatLoading}
              errorMessage={latestBatchStatError}
              latestPeriodCode={latestBatchStat.latestPeriodCode}
            />
          </div>
        </section>
      ) : null}

      {canManageResources ? (
        <SecurityGovernanceProfileEditDialog
          open={isEditOpen}
          record={securityPolicy}
          onClose={() => setIsEditOpen(false)}
          onSaved={async () => {
            await refreshPortalData()
            await refreshSecurityPolicy()
            setEditSuccessMessage('安全档案与资源级安全策略已更新。')
          }}
        />
      ) : null}

      {canManageResources ? (
        <SecurityGovernanceFieldEditDialog
          open={isDataItemsEditOpen}
          record={securityPolicy}
          onClose={() => setIsDataItemsEditOpen(false)}
          onSaved={async () => {
            await refreshPortalData()
            await refreshSecurityPolicy()
            setEditSuccessMessage('字段安全档案与字段安全策略已更新。')
          }}
        />
      ) : null}
    </div>
  )
}
