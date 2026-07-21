import { ArrowLeft, Database, DatabaseZap, FileSearch, FolderTree, LockKeyhole, Network, Pencil, ScrollText, ShieldCheck, Users } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { LineageRelationGraph } from '../components/lineage-relation-graph'
import { ResourceEditDialog } from '../components/resource-edit-dialog'
import { ResourceFieldsPanel } from '../components/resource-fields-panel'
import { ResourceApisPanel } from '../components/resource-apis-panel'
import { ResourceAccessSubjectsPanel } from '../components/resource-access-subjects-panel'
import { ResourceAccessPoliciesPanel } from '../components/resource-access-policies-panel'
import { ResourceHomomorphicPanel } from '../components/resource-homomorphic-panel'
import { ResourceIngestSamplesPanel } from '../components/resource-physical-table-panel'
import { ScenicPanel, StatCard, TopicPill } from '../components/ui'
import { canManageCatalogResources } from '../lib/admin-role'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { connectStatusMeta, formatMB, formatNumber, useLatestResourceBatchStat } from '../lib/nocobase-stat-data'
import type { CatalogItem } from '../lib/nocobase-portal-data'
import { useSecurityDataSources } from '../lib/nocobase-security-runtime'
import { usePortalContext } from '../lib/portal-context'
import { useResourceFieldCount, useResourceSecurityRelations } from '../lib/resource-security-relations'
import { useResourceIngestSamples } from '../lib/resource-ingest-samples'
import { formatSecurityV3Value, type SecurityV3Record } from '../lib/nocobase-security-v3'
import { ensureDefaultSecurityApi } from '../lib/security-runtime-client'

type SecurityGovernanceDetailLocationState = {
  returnTo?: string
}

type SecurityGovernanceDetailTabKey = 'overview' | 'resourceFields' | 'physicalTable' | 'apiInfo' | 'accessSubjects' | 'accessPolicies' | 'homomorphic' | 'accessInfo' | 'status' | 'lineage'

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

function normalizeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function normalizeArray(value: unknown) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatDateTime(value: unknown) {
  const date = new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? '未产生' : date.toLocaleString('zh-CN', { hour12: false })
}

function sourceTypeLabel(value: unknown) {
  return {
    validation_database: '验证数据库',
    existing_api: '已有 API',
    realtime_db: '实时数据库',
    history_db: '历史数据库',
    third_party_api: '第三方 API',
    data_warehouse: '数据仓库',
    yongcai20: '用采 2.0',
    dispatch_cloud: '调控云',
  }[String(value)] || formatSecurityV3Value(value)
}

function sourceSecuritySummary(source: Record<string, unknown>) {
  const config = normalizeObject(source.security_config_json)
  const options = normalizeObject(source.connection_options_json)
  const encrypted = config.encryptionEnabled ?? config.encryption_enabled ?? options.ssl
  const integrity = config.integrityEnabled ?? config.integrity_enabled
  return {
    transport: encrypted ? `已启用（${String(config.encryptionAlgorithm ?? config.encryption_algorithm ?? (options.ssl ? 'TLS' : '受控加密'))}）` : '未启用',
    integrity: integrity ? `已启用（${String(config.checksumAlgorithm ?? config.checksum_algorithm ?? '校验摘要')}）` : '未启用',
    readOnly: options.readOnly === true || options.read_only === true ? '只读接入' : '未限制只读',
    timeout: `${Number(options.timeoutSeconds ?? options.timeout_seconds ?? config.timeoutSeconds ?? 0) || '-'} 秒`,
  }
}

function validationRuleSummary(source: Record<string, unknown>) {
  const rules = normalizeObject(source.validation_rules_json)
  const required = normalizeArray(rules.required)
  const ranges = normalizeObject(rules.numericRanges ?? rules.numeric_ranges)
  const duplicateKeys = normalizeArray(rules.duplicateKeys ?? rules.duplicate_keys)
  const parts = [
    required.length ? `必填字段 ${required.length} 项` : '',
    Object.keys(ranges).length ? `数值范围 ${Object.keys(ranges).length} 项` : '',
    duplicateKeys.length ? `去重键 ${duplicateKeys.length} 项` : '',
    rules.responseShape ? `响应结构 ${String(rules.responseShape)}` : '',
  ].filter(Boolean)
  return parts.join(' / ') || '未配置接入校验规则'
}

export function SecurityGovernanceDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const {
    data: {
      catalogItems,
      categoryTree,
      informationCategoryTree,
      sourceTree,
      regionTree,
      editOptions,
    },
    isLoading: isPortalLoading,
    error: portalError,
    session,
    refresh,
  } = usePortalContext()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editNotice, setEditNotice] = useState('')
  const canManageResources = canManageCatalogResources(session?.user.roles)
  const { data: securityDataSources } = useSecurityDataSources(canManageResources)
  const dataSourceOptions = useMemo(
    () => securityDataSources
      .filter((source) => source.status === 'connected')
      .map((source) => ({ value: source.id, label: `${source.name} (${source.code})` })),
    [securityDataSources],
  )
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
    navigate(withEmbed('/security-governance/resources/catalog'))
  }

  const item = catalogItems.find((entry) => entry.id === id)
  const statEnabled = !isPortalLoading && Boolean(item)
  const { data: latestBatchStat, error: latestBatchStatError } =
    useLatestResourceBatchStat(item?.id, statEnabled)
  const {
    data: securityRelations,
    isLoading: isSecurityRelationsLoading,
    error: securityRelationsError,
  } = useResourceSecurityRelations(item?.id, statEnabled)
  const {
    count: resourceFieldCount,
    isLoading: isResourceFieldCountLoading,
    refresh: refreshResourceFieldCount,
  } = useResourceFieldCount(item?.id, statEnabled)
  const {
    data: ingestSamples,
    isLoading: isIngestSamplesLoading,
    error: ingestSamplesError,
    refresh: refreshIngestSamples,
  } = useResourceIngestSamples(item?.id, statEnabled)
  const handleResourceFieldsChange = useCallback((records: SecurityV3Record[]) => {
    void refreshResourceFieldCount()
    if (canManageCatalogResources(session?.user.roles) && records.length > 0 && item?.id) {
      void ensureDefaultSecurityApi(item.id).catch(() => undefined)
    }
  }, [item?.id, refreshResourceFieldCount, session?.user.roles])
  const isLoading = isPortalLoading
  const error = portalError

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
  const detailTabs: Array<[SecurityGovernanceDetailTabKey, string]> = [
    ['overview', '基本信息'],
    ['resourceFields', '资源字段'],
    ['physicalTable', '接入规则'],
    ['apiInfo', 'API 信息'],
    ['accessSubjects', '访问主体'],
    ['accessPolicies', '访问策略'],
    ['homomorphic', '同态加密'],
    ['lineage', '血缘关系'],
    ['status', '安全状态'],
  ]
  const normalizedRequestedTab = requestedTab === 'accessInfo' ? 'physicalTable' : requestedTab
  const activeTab = detailTabs.some(([key]) => key === normalizedRequestedTab)
    ? (normalizedRequestedTab as SecurityGovernanceDetailTabKey)
    : 'overview'

  const overviewMetrics = [
    {
      key: 'fields',
      title: '字段数量',
      value: isResourceFieldCountLoading
        ? '读取中...'
        : `${formatNumber(resourceFieldCount)} 个`,
      tone: 'blue' as const,
      icon: <Database className="h-4 w-4" />,
    },
    {
      key: 'apiVisits',
      title: 'API 访问次数',
      value: `${formatNumber(securityRelations.decisionLogs.length)} 次`,
      tone: 'green' as const,
      icon: <DatabaseZap className="h-4 w-4" />,
    },
    {
      key: 'policies',
      title: '访问策略数量',
      value: `${formatNumber(securityRelations.accessPolicies.length)} 条`,
      tone: 'blue' as const,
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      key: 'ingestSamples',
      title: '接入抽样数量',
      value: isIngestSamplesLoading
        ? '读取中...'
        : ingestSamples
          ? `${formatNumber(ingestSamples.sampleCount)} 条`
          : ingestSamplesError
            ? '读取失败'
            : '0 条',
      tone: 'green' as const,
      icon: <Network className="h-4 w-4" />,
    },
  ]

  const infoRows = [
    ['资源编码', item.code || '未标注', '数据类型', item.serviceType || '未标注'],
    ['数据分类', item.businessCategoryPath || item.category || '未标注', '业务分类', item.businessAttributePath || item.businessAttribute || '未标注'],
    ['来源单位', item.department || '未标注', '来源系统', item.sourceSystem || physicalTableState.sourceSystems.join('、') || '未标注'],
    ['更新周期', item.updateCycle || '未标注', '数据格式', item.format.join('、') || '未标注'],
    ['资源说明', item.description || item.summary || '未补充', '', ''],
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
  const dataAccessAlignmentItems: AlignmentItem[] = [
    {
      label: '数据源配置',
      path: '/security-governance/ingest/sources',
      value: `${securityRelations.sources.length} 个关联数据源`,
      description: `已连接 ${securityRelations.sources.filter((source) => source.connection_status === 'connected').length} 个 / 最近校验 ${securityRelations.ingestLogs.length} 条`,
      icon: DatabaseZap,
    },
    {
      label: '接入规则配置',
      path: '/security-governance/ingest/validation-rules',
      value: `${securityRelations.sources.length} 个数据源接入配置`,
      description: '传输、完整性、只读连接与数据校验规则',
      icon: ShieldCheck,
    },
    {
      label: '接入日志',
      path: '/security-governance/ingest/logs',
      value: latestStatus?.label || '未产生统计',
      description: latestBatchStat.latestPeriodCode ? `统计批次 ${latestBatchStat.latestPeriodCode}` : businessTimeStatusLabel,
      icon: Network,
    },
  ]
  const auditAlignmentItems: AlignmentItem[] = [
    {
      label: '调用与决策日志',
      path: '/security-governance/access/audit',
      value: `${securityRelations.accessPolicies.filter((policy) => policy.publish_status === 'success').length} 条已发布策略`,
      description: `${securityRelations.apis.filter((api) => api.publish_status === 'success').length} 个已发布 API / 未命中策略默认拒绝`,
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
    <div
      aria-label="数据资源详情导航"
      className="flex gap-2 overflow-x-auto rounded-[18px] border border-[var(--surface-outline-strong)] bg-[color-mix(in_srgb,var(--surface-raised-strong)_94%,transparent)] px-2 pt-2 shadow-[var(--shadow-soft)] backdrop-blur-md"
      role="tablist"
    >
      {detailTabs.map(([key, label]) => (
        <button
          type="button"
          key={key}
          aria-selected={activeTab === key}
          role="tab"
          className={`relative -mb-px inline-flex min-h-12 shrink-0 items-center whitespace-nowrap rounded-t-[14px] border border-transparent px-4 pb-3 pt-3 text-[0.9375rem] ${
            activeTab === key
              ? 'z-10 -translate-y-[1px] border-[rgba(var(--theme-soft-rgb),0.24)] border-b-[var(--surface-raised-strong)] bg-[linear-gradient(180deg,var(--surface-raised-strong),color-mix(in_srgb,var(--primary-soft)_72%,var(--surface-raised)))] font-semibold text-[var(--primary)] shadow-[0_16px_32px_rgba(var(--theme-soft-rgb),0.14)]'
              : 'font-medium text-[var(--text-main)] transition hover:-translate-y-[1px] hover:border-[var(--surface-outline)] hover:bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] hover:text-[var(--primary)]'
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
                <h1 className="max-w-[920px] text-[1.875rem] font-semibold leading-[1.34] text-[var(--text-main)]">{item.name}</h1>
                {latestStatus ? (
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[0.8125rem] font-semibold ${latestStatus.toneClass}`}>{latestStatus.label}</span>
                ) : null}
              </div>

            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {canManageResources ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditNotice('')
                    setIsEditDialogOpen(true)
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[rgba(var(--theme-soft-rgb),0.28)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 text-[0.8125rem] font-semibold text-white shadow-[0_10px_24px_rgba(var(--theme-strong-rgb),0.2)] transition hover:-translate-y-[1px] hover:brightness-105"
                >
                  <Pencil className="h-4 w-4" />
                  编辑数据资源
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleGoBack}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] shadow-[0_10px_24px_rgba(51,98,146,0.08)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                返回数据资源
              </button>
            </div>
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

      {editNotice ? (
        <div className="rounded-[10px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-[0.875rem] text-[var(--status-success-text)]">
          {editNotice}
        </div>
      ) : null}

      {tabsNav}

      {activeTab === 'overview' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader
            icon={<ShieldCheck className="h-5 w-5" />}
            title="基本信息"
            action={(
              <div className="flex flex-wrap items-center gap-2">
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

      {activeTab === 'resourceFields' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader
            icon={<LockKeyhole className="h-5 w-5" />}
            title="资源字段"
          />
          <div className="mt-5">
            <div className="mb-4 rounded-[12px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-4 py-3 text-[0.8125rem] leading-6 text-[var(--status-info-text)]">
              字段仅保留资源字典基础信息和同态任务使用情况。访问策略控制到数据资源层级，字段输出范围统一由 API 发布配置维护。
            </div>
            <ResourceFieldsPanel
              resourceId={item.id}
              homomorphicFieldCodes={securityRelations.homomorphicFieldCodes}
              onFieldsChange={handleResourceFieldsChange}
            />
          </div>
        </section>
      ) : null}

      {activeTab === 'physicalTable' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader icon={<Network className="h-5 w-5" />} title="接入规则" />

          {isSecurityRelationsLoading ? (
            <div className="py-10 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载数据源与接入规则...</div>
          ) : securityRelationsError ? (
            <div className="mt-5 rounded-[12px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-4 text-[0.8125rem] text-[var(--status-danger-text)]">{securityRelationsError}</div>
          ) : (
            <>
              <div className="mt-5">
                <div className="mb-3 text-[0.875rem] font-semibold text-[var(--text-main)]">关联数据源与安全接入规则</div>
                <div className="grid gap-4">
                  {securityRelations.sources.map((source) => {
                    const security = sourceSecuritySummary(source)
                    const tags = normalizeArray(source.source_tags).map(String)
                    return (
                      <article key={String(source.id)} className="rounded-[16px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-[0.75rem] text-[var(--text-muted)]">{String(source.source_code || '未配置编码')}</div>
                            <div className="mt-1 text-[1rem] font-semibold text-[var(--text-main)]">{String(source.source_name || '未命名数据源')}</div>
                          </div>
                          <span className="rounded-full bg-[var(--status-success-bg)] px-2.5 py-1 text-[0.75rem] font-medium text-[var(--status-success-text)]">{formatSecurityV3Value(source.connection_status)}</span>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {[
                            ['来源类型', sourceTypeLabel(source.source_type)],
                            ['责任部门', String(source.owner_dept || '未标注')],
                            ['传输保护', security.transport],
                            ['完整性校验', security.integrity],
                            ['访问模式', security.readOnly],
                            ['连接超时', security.timeout],
                            ['字段校验规则', validationRuleSummary(source)],
                            ['最后检查', formatDateTime(source.last_checked_at)],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-[10px] bg-[var(--surface-muted)] px-3 py-3">
                              <div className="text-[0.6875rem] text-[var(--text-muted)]">{label}</div>
                              <div className="mt-1 text-[0.8125rem] font-medium leading-6 text-[var(--text-main)]">{value}</div>
                            </div>
                          ))}
                        </div>
                        {tags.length ? <div className="mt-4 flex flex-wrap gap-2">{tags.map((tag) => <TopicPill key={tag}>{tag}</TopicPill>)}</div> : null}
                      </article>
                    )
                  })}
                  {securityRelations.sources.length === 0 ? (
                    <div className="rounded-[14px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-8 text-center text-[0.875rem] text-[var(--text-secondary)]">当前资源和关联 API 均未绑定数据源。</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 border-t border-[var(--surface-outline)] pt-5">
                <div className="mb-3 text-[0.875rem] font-semibold text-[var(--text-main)]">规则抽样与逐条校验</div>
                <ResourceIngestSamplesPanel
                  data={ingestSamples}
                  isLoading={isIngestSamplesLoading}
                  error={ingestSamplesError}
                  onRefresh={() => void refreshIngestSamples()}
                />
              </div>

              <div className="mt-6 overflow-hidden rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
                <div className="border-b border-[var(--surface-outline)] bg-[var(--table-header-bg)] px-4 py-3 text-[0.875rem] font-semibold text-[var(--text-main)]">最近接入规则执行日志</div>
                {securityRelations.ingestLogs.length ? securityRelations.ingestLogs.slice(0, 10).map((log) => (
                  <div key={String(log.id)} className="grid gap-2 border-b border-[var(--surface-outline)] px-4 py-3 last:border-b-0 md:grid-cols-[1.1fr_1fr_1fr_0.8fr]">
                    <div className="text-[0.8125rem] font-medium text-[var(--text-main)]">{String(log.batch_code || '未编号批次')}</div>
                    <div className="text-[0.8125rem] text-[var(--text-secondary)]">{formatSecurityV3Value(log.execution_type)}</div>
                    <div className="text-[0.8125rem] text-[var(--text-secondary)]">{formatDateTime(log.started_at)}</div>
                    <div className="text-[0.8125rem] text-[var(--text-secondary)]">{formatSecurityV3Value(log.result_status)} · 拒绝 {Number(log.rejected_count || 0)}</div>
                  </div>
                )) : <div className="px-4 py-8 text-center text-[0.875rem] text-[var(--text-muted)]">尚未产生接入规则执行日志。</div>}
              </div>
            </>
          )}
        </section>
      ) : null}

      {activeTab === 'apiInfo' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader icon={<DatabaseZap className="h-5 w-5" />} title="API 信息" />
          <div className="mt-5">
            <ResourceApisPanel
              resourceId={String(item.id)}
              canManage={canManageResources}
            />
          </div>
        </section>
      ) : null}

      {activeTab === 'accessPolicies' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader icon={<ShieldCheck className="h-5 w-5" />} title="访问策略" />
          <div className="mt-5">
            <ResourceAccessPoliciesPanel resourceId={String(item.id)} resourceCode={item.code} canManage={canManageResources} />
          </div>
        </section>
      ) : null}

      {activeTab === 'accessSubjects' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader icon={<Users className="h-5 w-5" />} title="访问主体" />
          <div className="mt-5">
            <ResourceAccessSubjectsPanel resourceId={String(item.id)} canManage={canManageResources} />
          </div>
        </section>
      ) : null}

      {activeTab === 'homomorphic' ? (
        <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
          <SectionHeader icon={<LockKeyhole className="h-5 w-5" />} title="同态加密" />
          <div className="mt-5">
            <ResourceHomomorphicPanel
              resourceId={String(item.id)}
              resourceCode={item.code}
              canManage={canManageResources}
            />
          </div>
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

      {canManageResources ? (
        <ResourceEditDialog
          open={isEditDialogOpen}
          mode="edit"
          variant="drawer"
          resourceId={item.id}
          categoryTree={categoryTree}
          informationCategoryTree={informationCategoryTree}
          sourceTree={sourceTree}
          regionTree={regionTree}
          editOptions={editOptions}
          securityGovernanceMode
          dataSourceOptions={dataSourceOptions}
          onClose={() => setIsEditDialogOpen(false)}
          onSaved={async () => {
            await refresh()
            await ensureDefaultSecurityApi(item.id).catch(() => undefined)
            setEditNotice('数据资源已保存，详情信息和唯一查询 API 已重新同步。')
          }}
        />
      ) : null}

    </div>
  )
}
