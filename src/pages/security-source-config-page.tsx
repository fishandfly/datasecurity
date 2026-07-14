import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Database,
  DatabaseZap,
  Edit3,
  HardDrive,
  Link2,
  Network,
  Plus,
  RadioTower,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { SecurityModuleTabs } from '../components/security-module-tabs'
import { Button } from '../components/ui'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { useSecurityGovernancePolicies } from '../lib/nocobase-security-governance'
import {
  saveSecurityDataSource,
  useSecurityDataSources,
  useSecurityRuntimeSupportOptions,
  type EditableSecurityDataSource,
  type SecurityDataSourceRecord,
  type SecurityDataSourceStatus,
  type SecurityDataSourceType,
  type SecurityDatabaseDialect,
  type SecuritySensitivityLevel,
} from '../lib/nocobase-security-runtime'
import { toErrorMessage } from '../lib/nocobase-client'
import { testSecurityDataSource } from '../lib/security-runtime-client'
import { cn } from '../lib/utils'

type SourceTypeFilter = '全部' | SecurityDataSourceType
type StatusFilter = '全部' | SecurityDataSourceStatus

const pageSizeOptions = [10, 20, 50]

const sourceTypeIcons: Record<SecurityDataSourceType, LucideIcon> = {
  validation_database: Database,
  existing_api: Link2,
  yongcai20: DatabaseZap,
  dispatch_cloud: Network,
  substation_monitor: Activity,
  distribution_automation: Network,
  wide_area_measurement: RadioTower,
  realtime_db: Database,
  history_db: HardDrive,
  third_party_api: Link2,
  data_warehouse: Database,
}

const inputClassName = 'h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)]'

function formatDate(value: string) {
  return value ? value.slice(0, 10) : '-'
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)))
}

function statusTone(status: SecurityDataSourceStatus) {
  if (status === 'connected') return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  if (status === 'exception') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  if (status === 'testing') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  return 'border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-muted)]'
}

function sensitivityTone(level: SecuritySensitivityLevel) {
  if (level === 'highly_sensitive') return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
  if (level === 'sensitive') return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
  if (level === 'internal') return 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
  return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
}

function SourceSecondaryTabs({ actions }: { actions?: ReactNode }) {
  return <SecurityModuleTabs module="ingest" actions={actions} />
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

function SourceTypeLabel({ source }: { source: SecurityDataSourceRecord }) {
  const Icon = sourceTypeIcons[source.sourceType]
  return (
    <span className="inline-flex items-center gap-2 text-[var(--text-main)]">
      <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[rgba(var(--theme-soft-rgb),0.12)] text-[var(--primary)]">
        <Icon className="h-4 w-4" />
      </span>
      <span>{source.sourceTypeLabel}</span>
    </span>
  )
}

function toEditableSource(source: SecurityDataSourceRecord): EditableSecurityDataSource {
  return {
    id: source.id,
    code: source.code,
    name: source.name,
    sourceType: source.sourceType,
    status: source.status,
    sensitivity: source.sensitivity,
    databaseDialect: source.databaseDialect,
    connectionOptions: { ...source.connectionOptions },
    host: source.host,
    port: source.port,
    databaseName: source.databaseName,
    username: source.username,
    secretRef: source.secretRef,
    description: source.description,
    ownerDept: source.ownerDept,
    policyId: source.policyId,
    workflowKey: source.workflowKey,
    tags: source.tags,
    securityConfig: { ...source.securityConfig },
    lastCheckedAt: source.lastCheckedAt,
  }
}

function createEmptySource(defaultPolicyId: string): EditableSecurityDataSource {
  return {
    code: `SRC-${String(Date.now()).slice(-8)}`,
    name: '',
    sourceType: 'realtime_db',
    status: 'unconnected',
    sensitivity: 'internal',
    databaseDialect: 'postgresql',
    connectionOptions: {},
    host: '',
    port: '',
    databaseName: '',
    username: '',
    secretRef: '',
    description: '',
    ownerDept: '',
    policyId: defaultPolicyId,
    workflowKey: '',
    tags: [],
    securityConfig: {
      encryptionEnabled: true,
      encryptionAlgorithm: 'SM4',
      integrityEnabled: true,
      checksumAlgorithm: 'SM3',
      samplingEnabled: false,
      samplingRate: 100,
      timeoutSeconds: 30,
      failureThreshold: 3,
    },
    lastCheckedAt: '',
  }
}

function SourceDrawer({
  open,
  mode,
  source,
  sourceTypeOptions,
  sensitivityOptions,
  policies,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: 'create' | 'edit'
  source: EditableSecurityDataSource | null
  sourceTypeOptions: Array<{ value: SecurityDataSourceType; label: string }>
  sensitivityOptions: Array<{ value: SecuritySensitivityLevel; label: string }>
  policies: Array<{ id: string; policyName: string; policyCode: string }>
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const [form, setForm] = useState<EditableSecurityDataSource | null>(source)
  const [advancedOpen, setAdvancedOpen] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setForm(source ? { ...source, tags: [...source.tags], securityConfig: { ...source.securityConfig } } : null)
    setNotice('')
  }, [source])

  if (!open || !form) return null

  const update = <K extends keyof EditableSecurityDataSource>(key: K, value: EditableSecurityDataSource[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current)
  }
  const updateSecurity = <K extends keyof EditableSecurityDataSource['securityConfig']>(key: K, value: EditableSecurityDataSource['securityConfig'][K]) => {
    setForm((current) => current ? { ...current, securityConfig: { ...current.securityConfig, [key]: value } } : current)
  }

  const submit = async (draft: boolean) => {
    setIsSaving(true)
    setNotice('')
    try {
      await saveSecurityDataSource({ ...form, status: draft ? 'disabled' : form.status === 'disabled' ? 'unconnected' : form.status })
      await onSaved(draft ? '数据源已保存为停用草稿。' : '数据源已写入后台，需通过连接检查后才会标记为已连接。')
      onClose()
    } catch (error) {
      setNotice(toErrorMessage(error, '数据源保存失败'))
    } finally {
      setIsSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex h-full max-h-[100dvh] w-full max-w-[780px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-strong)]">
        <div className="shrink-0 flex items-start justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <div className="text-[0.75rem] text-[var(--text-muted)]">{mode === 'create' ? '新建数据源' : '编辑数据源'}</div>
            <h2 className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{form.name || '未命名数据源'}</h2>
          </div>
          <button type="button" aria-label="关闭" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">基本信息</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>数据源名称</span><input className={inputClassName} value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>数据源编码</span><input className={inputClassName} value={form.code} onChange={(event) => update('code', event.target.value)} /></label>
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>数据源类型</span><select className={inputClassName} value={form.sourceType} onChange={(event) => update('sourceType', event.target.value as SecurityDataSourceType)}>{sourceTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>责任部门</span><input className={inputClassName} value={form.ownerDept} onChange={(event) => update('ownerDept', event.target.value)} /></label>
            </div>
            <textarea className="min-h-20 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[0.875rem] outline-none focus:border-[var(--primary)]" value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="数据源描述" />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">连接配置</h3>
              <span className="text-[0.75rem] text-[var(--text-muted)]">密码不入库，仅保存 Secret 引用</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>数据库类型</span><select className={inputClassName} value={form.databaseDialect} onChange={(event) => update('databaseDialect', event.target.value as SecurityDatabaseDialect)}><option value="postgresql">PostgreSQL</option><option value="mysql">MySQL</option></select></label>
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>主机 / 接口地址</span><input className={inputClassName} value={form.host} onChange={(event) => update('host', event.target.value)} /></label>
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>端口</span><input className={inputClassName} inputMode="numeric" value={form.port} onChange={(event) => update('port', event.target.value)} /></label>
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>数据库 / 应用标识</span><input className={inputClassName} value={form.databaseName} onChange={(event) => update('databaseName', event.target.value)} /></label>
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>用户名</span><input className={inputClassName} value={form.username} onChange={(event) => update('username', event.target.value)} /></label>
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)] sm:col-span-2"><span>Secret 引用</span><input className={inputClassName} value={form.secretRef} onChange={(event) => update('secretRef', event.target.value)} placeholder="secret://security/data-source/..." /></label>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">分类标签与策略</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>敏感度</span><select className={inputClassName} value={form.sensitivity} onChange={(event) => update('sensitivity', event.target.value as SecuritySensitivityLevel)}>{sensitivityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>关联安全策略</span><select className={inputClassName} value={form.policyId} onChange={(event) => update('policyId', event.target.value)}><option value="">暂不关联</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.policyName || policy.policyCode}</option>)}</select></label>
              <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)] sm:col-span-2"><span>数据标签</span><input className={inputClassName} value={form.tags.join('、')} onChange={(event) => update('tags', uniqueValues(event.target.value.split(/[、,]/)))} placeholder="使用顿号或逗号分隔" /></label>
            </div>
          </section>

          <section className="space-y-3">
            <button type="button" className="flex w-full items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-left text-[0.95rem] font-semibold text-[var(--text-main)]" onClick={() => setAdvancedOpen((value) => !value)}>
              高级设置
              <ChevronDown className={cn('h-4 w-4 transition', advancedOpen ? '' : '-rotate-90')} />
            </button>
            {advancedOpen ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-3 text-[0.8125rem] text-[var(--text-secondary)]"><span>启用传输加密</span><input type="checkbox" checked={form.securityConfig.encryptionEnabled} onChange={(event) => updateSecurity('encryptionEnabled', event.target.checked)} /></label>
                <select className={inputClassName} value={form.securityConfig.encryptionAlgorithm} onChange={(event) => updateSecurity('encryptionAlgorithm', event.target.value as 'SM4' | 'AES-256')}><option>SM4</option><option>AES-256</option></select>
                <label className="flex items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-3 text-[0.8125rem] text-[var(--text-secondary)]"><span>启用完整性校验</span><input type="checkbox" checked={form.securityConfig.integrityEnabled} onChange={(event) => updateSecurity('integrityEnabled', event.target.checked)} /></label>
                <select className={inputClassName} value={form.securityConfig.checksumAlgorithm} onChange={(event) => updateSecurity('checksumAlgorithm', event.target.value as 'SM3' | 'SHA-256')}><option>SM3</option><option>SHA-256</option></select>
                <label className="flex items-center justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-3 text-[0.8125rem] text-[var(--text-secondary)]"><span>启用数据采样</span><input type="checkbox" checked={form.securityConfig.samplingEnabled} onChange={(event) => updateSecurity('samplingEnabled', event.target.checked)} /></label>
                <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>采样率（%）</span><input type="number" min="1" max="100" className={inputClassName} value={form.securityConfig.samplingRate} onChange={(event) => updateSecurity('samplingRate', Number(event.target.value))} /></label>
                <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>超时时间（秒）</span><input type="number" min="1" className={inputClassName} value={form.securityConfig.timeoutSeconds} onChange={(event) => updateSecurity('timeoutSeconds', Number(event.target.value))} /></label>
                <label className="space-y-1 text-[0.8125rem] text-[var(--text-secondary)]"><span>失败率阈值（%）</span><input type="number" min="0" max="100" className={inputClassName} value={form.securityConfig.failureThreshold} onChange={(event) => updateSecurity('failureThreshold', Number(event.target.value))} /></label>
              </div>
            ) : null}
          </section>

          {notice ? <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{notice}</div> : null}
        </div>

        <footer className="sticky bottom-0 z-10 grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgba(8,18,32,0.08)] sm:flex sm:items-center sm:justify-end">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>取消</Button>
          <Button variant="secondary" className="w-full sm:w-auto" disabled={isSaving} onClick={() => void submit(true)}>保存为草稿</Button>
          <Button className="col-span-2 w-full sm:w-auto" disabled={isSaving} onClick={() => void submit(false)}>{isSaving ? '正在保存...' : '保存并启用'}</Button>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}

export function SecuritySourceConfigPage() {
  const location = useLocation()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const { data: sourceRows, isLoading, error, refresh } = useSecurityDataSources(true)
  const { data: supportOptions } = useSecurityRuntimeSupportOptions(true)
  const { data: securityPolicies } = useSecurityGovernancePolicies(true)
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState<SourceTypeFilter>('全部')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('全部')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('edit')
  const [drawerSource, setDrawerSource] = useState<EditableSecurityDataSource | null>(null)
  const [connectionNotice, setConnectionNotice] = useState('')

  const sourceTypeOptions = supportOptions.sourceTypeOptions.length > 0
    ? supportOptions.sourceTypeOptions
    : [
        { id: '', value: 'validation_database' as const, label: '量测验证数据库' },
        { id: '', value: 'existing_api' as const, label: '已有量测接口' },
        { id: '', value: 'yongcai20' as const, label: '用采2.0' },
        { id: '', value: 'dispatch_cloud' as const, label: '调控云' },
        { id: '', value: 'realtime_db' as const, label: '实时库' },
        { id: '', value: 'history_db' as const, label: '历史库' },
        { id: '', value: 'third_party_api' as const, label: '第三方接口' },
      ]
  const statusOptions = supportOptions.connectionStatusOptions
  const sensitivityOptions = supportOptions.sensitivityOptions.length > 0
    ? supportOptions.sensitivityOptions
    : [
        { id: '', value: 'public' as const, label: '公开' },
        { id: '', value: 'internal' as const, label: '内部' },
        { id: '', value: 'sensitive' as const, label: '敏感' },
        { id: '', value: 'highly_sensitive' as const, label: '高敏感' },
      ]

  const allTags = useMemo(() => uniqueValues(sourceRows.flatMap((row) => row.tags)).slice(0, 12), [sourceRows])
  const filteredRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return sourceRows
      .filter((row) => typeFilter === '全部' || row.sourceType === typeFilter)
      .filter((row) => statusFilter === '全部' || row.status === statusFilter)
      .filter((row) => selectedTags.length === 0 || selectedTags.every((tag) => row.tags.includes(tag)))
      .filter((row) => {
        if (!normalizedKeyword) return true
        return [row.name, row.code, row.sourceTypeLabel, row.statusLabel, row.policyName, row.ownerDept, row.description, row.tags.join(' ')]
          .some((value) => value.toLowerCase().includes(normalizedKeyword))
      })
  }, [keyword, selectedTags, sourceRows, statusFilter, typeFilter])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const connectedCount = sourceRows.filter((row) => row.status === 'connected').length
  const abnormalCount = sourceRows.filter((row) => row.status === 'exception').length
  const encryptedCount = sourceRows.filter((row) => row.securityConfig.encryptionEnabled).length
  const sensitiveCount = sourceRows.filter((row) => row.sensitivity === 'sensitive' || row.sensitivity === 'highly_sensitive').length

  const resetFilters = () => {
    setKeyword('')
    setTypeFilter('全部')
    setStatusFilter('全部')
    setSelectedTags([])
    setPage(1)
  }

  const testConnection = async (source: SecurityDataSourceRecord) => {
    setConnectionNotice('')
    try {
      const result = await testSecurityDataSource(source.id)
      setConnectionNotice(`${source.name} 连接检查通过，延迟 ${result.latencyMs ?? 0}ms。`)
    } catch (caught) {
      setConnectionNotice(`${source.name} 连接检查失败：${toErrorMessage(caught, '连接或认证错误')}`)
    } finally {
      await refresh()
    }
  }

  return (
    <>
      <div className="space-y-5">
        <SourceSecondaryTabs
          actions={
            <>
              <label className="flex h-10 w-full items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 sm:w-[320px]">
                <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <input value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1) }} className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]" placeholder="搜索数据源" aria-label="搜索数据源" />
              </label>
              <Button className="gap-2" onClick={() => { setDrawerMode('create'); setDrawerSource(createEmptySource(securityPolicies[0]?.id || '')) }}>
                <Plus className="h-4 w-4" />
                新建数据源
              </Button>
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard title="数据源总数" value={sourceRows.length.toLocaleString()} detail="直接来自后台数据源配置。" icon={<Database className="h-5 w-5" />} />
          <MetricCard title="连接正常" value={connectedCount.toLocaleString()} detail={`最近一次真实连接检查通过 ${connectedCount} 个。`} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
          <MetricCard title="连接异常" value={abnormalCount.toLocaleString()} detail="仅统计已执行连接检查后的异常记录。" icon={<AlertCircle className="h-5 w-5" />} tone={abnormalCount > 0 ? 'danger' : 'success'} />
          <MetricCard title="加密接入" value={encryptedCount.toLocaleString()} detail={`${sensitiveCount} 个敏感或高敏数据源，配置与执行结果分开统计。`} icon={<ShieldCheck className="h-5 w-5" />} tone="warning" />
        </div>

        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
          <div className="grid gap-3 md:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto]">
            <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value as SourceTypeFilter); setPage(1) }} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none">
              <option value="全部">全部类型</option>
              {sourceTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setPage(1) }} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] outline-none">
              <option value="全部">全部状态</option>
              {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <Button variant="secondary" className="h-10 gap-2" onClick={resetFilters}><RefreshCw className="h-4 w-4" />重置筛选</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[0.75rem] text-[var(--text-muted)]">标签筛选</span>
            {allTags.map((tag) => <button key={tag} type="button" className={cn('rounded-full border px-3 py-1 text-[0.75rem]', selectedTags.includes(tag) ? 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]' : 'border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-secondary)]')} onClick={() => { setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]); setPage(1) }}>{tag}</button>)}
          </div>
          {connectionNotice ? <div className="mt-3 rounded-[8px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-info-text)]">{connectionNotice}</div> : null}
          {error ? <div className="mt-3 rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
        </section>

        <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div className="font-semibold text-[var(--text-main)]">数据源列表</div>
            <div className="text-[0.8125rem] text-[var(--text-secondary)]">{isLoading ? '正在加载...' : `共 ${filteredRows.length} 条`}</div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[1200px]">
              <div className="grid grid-cols-[1.35fr_150px_140px_1.2fr_1.1fr_130px_150px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]">
                <span>数据源名称</span><span>数据源类型</span><span>连接状态</span><span>数据标签</span><span>关联策略</span><span>最后检查</span><span>操作</span>
              </div>
              {visibleRows.map((row) => (
                <div key={row.id} className="grid grid-cols-[1.35fr_150px_140px_1.2fr_1.1fr_130px_150px] gap-3 border-b border-[var(--line)] px-4 py-4 text-[0.8125rem] last:border-b-0 hover:bg-[var(--surface-muted)]">
                  <button type="button" className="min-w-0 text-left" onClick={() => { setDrawerMode('edit'); setDrawerSource(toEditableSource(row)) }}><div className="truncate font-medium text-[var(--primary)]">{row.name}</div><div className="mt-1 truncate text-[0.75rem] text-[var(--text-muted)]">{row.code} · {row.ownerDept || '未指定部门'}</div></button>
                  <SourceTypeLabel source={row} />
                  <div className="space-y-2"><span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem]', statusTone(row.status))}><span className="h-1.5 w-1.5 rounded-full bg-current" />{row.statusLabel}</span><button type="button" className="block text-[0.75rem] text-[var(--primary)] hover:underline" onClick={() => void testConnection(row)}>测试连接</button></div>
                  <div className="flex flex-wrap gap-1.5">{row.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-2 py-0.5 text-[0.72rem] text-[var(--status-info-text)]">{tag}</span>)}</div>
                  <Link to={withEmbed('/security-governance/access/policies')} className="line-clamp-2 text-[var(--primary)] hover:underline">{row.policyName || '暂未关联'}</Link>
                  <span className="text-[var(--text-secondary)]">{formatDate(row.lastCheckedAt)}</span>
                  <div className="flex items-start gap-1"><button type="button" title="编辑" className="rounded-[6px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]" onClick={() => { setDrawerMode('edit'); setDrawerSource(toEditableSource(row)) }}><Edit3 className="h-4 w-4" /></button><button type="button" title="测试连接" className="rounded-[6px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]" onClick={() => void testConnection(row)}><RefreshCw className="h-4 w-4" /></button></div>
                </div>
              ))}
              {!isLoading && visibleRows.length === 0 ? <div className="px-4 py-12 text-center text-[0.875rem] text-[var(--text-secondary)]">后台暂无匹配的数据源配置。</div> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 text-[0.8125rem] text-[var(--text-secondary)]">
            <div className="flex items-center gap-2"><span>每页</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-2 outline-none">{pageSizeOptions.map((item) => <option key={item}>{item}</option>)}</select><span>条，总数 {filteredRows.length}</span></div>
            <div className="flex items-center gap-2"><Button variant="secondary" className="h-9 px-3 py-0" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button><span>第 {currentPage} / {pageCount} 页</span><Button variant="secondary" className="h-9 px-3 py-0" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一页</Button></div>
          </div>
        </section>
      </div>

      <SourceDrawer
        open={Boolean(drawerSource)}
        mode={drawerMode}
        source={drawerSource}
        sourceTypeOptions={sourceTypeOptions}
        sensitivityOptions={sensitivityOptions}
        policies={securityPolicies}
        onClose={() => setDrawerSource(null)}
        onSaved={async (message) => { setConnectionNotice(message); await refresh() }}
      />
    </>
  )
}
