import {
  Archive,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  FileClock,
  Filter,
  KeyRound,
  MoreHorizontal,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AccessControlSecondaryTabs } from '../components/security-access-control-tabs'
import { Button, TopicPill } from '../components/ui'
import { useFieldTagGenerationPolicies, type FieldTagGenerationPolicyRecord } from '../lib/nocobase-field-tags'
import { useSecurityGovernancePolicies, type SecurityGovernancePolicyRecord } from '../lib/nocobase-security-governance'
import { usePortalContext } from '../lib/portal-context'
import { joinSecurityGovernanceItems, resolveSecurityScopeLabel, type SecurityGovernanceJoinedItem } from '../lib/security-governance'
import { cn } from '../lib/utils'

type SensitivityLevel = '公开' | '内部' | '敏感' | '高敏感'
type LabelStatus = '启用中' | '已禁用' | '待确认'
type StatusFilter = '全部' | LabelStatus
type UsageFilter = '全部' | '已使用' | '未使用'
type SortBy = 'name' | 'createdAt' | 'usage'

type DataLabelRecord = {
  id: string
  name: string
  code: string
  categoryPath: string
  categoryGroup: string
  sensitivity: SensitivityLevel
  description: string
  sourceNames: string[]
  policyNames: string[]
  sourceCount: number
  policyCount: number
  status: LabelStatus
  createdBy: string
  createdAt: string
  keywords: string[]
  used: boolean
  defaultPermission: string
  retention: string
  allowCrossDomain: boolean
  allowExport: boolean
  allowConfidentialCompute: boolean
  usageTrend: number[]
}

type LabelAccumulator = Omit<DataLabelRecord, 'sourceNames' | 'policyNames' | 'sourceCount' | 'policyCount' | 'used' | 'keywords'> & {
  sourceNames: Set<string>
  policyNames: Set<string>
  keywords: Set<string>
}

type CategoryNode = {
  id: string
  label: string
  count: number
  children?: CategoryNode[]
}

const pageSizeOptions = [20, 50, 100]

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function resolveSensitivity(value: string, item?: SecurityGovernanceJoinedItem): SensitivityLevel {
  const normalized = normalizeText(value)
  if (/高|核心|重要|4|L4/i.test(normalized) || item?.coreControlFlag) return '高敏感'
  if (/敏|3|L3/i.test(normalized) || item?.importantDataFlag || item?.sensitiveFieldCount) return '敏感'
  if (/内|2|L2/i.test(normalized)) return '内部'
  return '公开'
}

function inferDataType(value: string) {
  const source = normalizeText(value)
  if (/量测|计量|采集|曲线/.test(source)) return '量测数据'
  if (/用电|电费|客户|营销/.test(source)) return source.includes('客户') ? '客户信息' : '用电信息'
  if (/设备|台区|线路|站房|资产/.test(source)) return '设备数据'
  if (/运行|调控|负荷|告警/.test(source)) return '运行数据'
  if (/财务|结算|账单/.test(source)) return '财务数据'
  if (/人员|用户|账号/.test(source)) return '人员数据'
  return source || '运行数据'
}

function inferBusinessDomain(value: string) {
  const source = normalizeText(value)
  if (/用采|计量|采集/.test(source)) return '用采2.0系统'
  if (/调控|运行|负荷/.test(source)) return '调控云'
  if (/网上|客户|营销/.test(source)) return '网上电网'
  if (/数智|分析|中台/.test(source)) return '数智吉电'
  return '其他业务系统'
}

function formatDate(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  return normalized.slice(0, 10)
}

function sensitivityTone(level: SensitivityLevel) {
  switch (level) {
    case '高敏感':
      return 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]'
    case '敏感':
      return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
    case '内部':
      return 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
    default:
      return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  }
}

function statusTone(status: LabelStatus) {
  switch (status) {
    case '待确认':
      return 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
    case '已禁用':
      return 'border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-muted)]'
    default:
      return 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)))
}

function createTrend(seed: number) {
  return [seed]
}

function lastCategorySegment(categoryPath: string) {
  const parts = categoryPath.split('>').map((item) => item.trim()).filter(Boolean)
  return parts[parts.length - 1] ?? categoryPath
}

function normalizeComparable(value: unknown) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function readPolicyFieldValue(policy: SecurityGovernancePolicyRecord, fieldName: string) {
  const row = policy as unknown as Record<string, unknown>
  const direct = row[fieldName]
  if (direct !== undefined) return direct
  const camelName = fieldName.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
  return row[camelName]
}

function matchesTagRule(policy: SecurityGovernancePolicyRecord, rule: FieldTagGenerationPolicyRecord['rules'][number]) {
  const actual = normalizeComparable(readPolicyFieldValue(policy, rule.fieldName))
  const expected = normalizeComparable(rule.value)

  switch (rule.operator) {
    case 'ne':
    case 'neq':
      return actual !== expected
    case 'contains':
      return actual.includes(expected)
    case 'notContains':
      return !actual.includes(expected)
    case 'empty':
      return !actual
    case 'notEmpty':
      return Boolean(actual)
    case 'eq':
    default:
      return actual === expected
  }
}

function matchTagPolicyRecords(
  tagPolicy: FieldTagGenerationPolicyRecord,
  policies: SecurityGovernancePolicyRecord[],
  joinedItems: SecurityGovernanceJoinedItem[],
) {
  if (tagPolicy.collectionName !== 'eco_resource_security_policies') {
    return []
  }

  const matchedPolicies = policies.filter((policy) => {
    if (tagPolicy.rules.length === 0) return true
    const checks = tagPolicy.rules.map((rule) => matchesTagRule(policy, rule))
    return tagPolicy.logic === 'or' ? checks.some(Boolean) : checks.every(Boolean)
  })
  const matchedPolicyIds = new Set(matchedPolicies.map((policy) => policy.id))
  return joinedItems.filter((item) => matchedPolicyIds.has(item.policyId))
}

function buildCategoryChildren(records: DataLabelRecord[], group: string, idPrefix: string) {
  return uniqueValues(records.filter((item) => item.categoryGroup === group).map((item) => lastCategorySegment(item.categoryPath)))
    .sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }))
    .map((label) => ({
      id: `${idPrefix}-${label}`,
      label,
      count: countBy(records, (item) => item.categoryGroup === group && item.categoryPath.includes(label)),
    }))
}

function buildDataLabels(
  policies: SecurityGovernancePolicyRecord[],
  joinedItems: SecurityGovernanceJoinedItem[],
  tagPolicies: FieldTagGenerationPolicyRecord[],
): DataLabelRecord[] {
  const map = new Map<string, LabelAccumulator>()

  const ensureLabel = ({
    name,
    code,
    categoryPath,
    categoryGroup,
    sensitivity,
    description,
    item,
    policy,
    keywords = [],
    status,
  }: {
    name: string
    code: string
    categoryPath: string
    categoryGroup: string
    sensitivity: SensitivityLevel
    description: string
    item: SecurityGovernanceJoinedItem
    policy?: SecurityGovernancePolicyRecord
    keywords?: string[]
    status?: LabelStatus
  }) => {
    const normalizedName = normalizeText(name)
    if (!normalizedName) return
    const id = normalizeCode(code || normalizedName)
    const existing = map.get(id)
    const currentStatus = status ?? (item.securityReviewStatus === 'pending' ? '待确认' : item.policyStatus === 'disabled' ? '已禁用' : '启用中')
    const sourceName = item.name || item.resourceId
    const policyName = policy?.policyName || item.securityCategory || item.policyId

    if (existing) {
      existing.sourceNames.add(sourceName)
      existing.policyNames.add(policyName)
      keywords.forEach((keyword) => existing.keywords.add(keyword))
      existing.keywords.add(item.securityCategory)
      existing.keywords.add(item.securityLevel)
      if (existing.status !== '待确认' && currentStatus === '待确认') {
        existing.status = currentStatus
      }
      return
    }

    map.set(id, {
      id,
      name: normalizedName,
      code: id,
      categoryPath,
      categoryGroup,
      sensitivity,
      description,
      status: currentStatus,
      createdBy: item.securityOwnerUserName || '未指定责任人',
      createdAt: formatDate(policy?.createdAt || item.updateTime),
      sourceNames: new Set([sourceName]),
      policyNames: new Set([policyName]),
      keywords: new Set([normalizedName, item.securityCategory, item.securityLevel, item.dataSubjectType, ...keywords].filter(Boolean)),
      defaultPermission: item.approvalRequired ? '需要审批' : resolveSecurityScopeLabel(item.accessScope || 'role'),
      retention: sensitivity === '高敏感' ? '保留 10 年' : sensitivity === '敏感' ? '保留 6 年' : '永久保留',
      allowCrossDomain: item.externalShareAllowed,
      allowExport: item.exportScope !== 'forbidden' && item.exportScope !== 'none',
      allowConfidentialCompute: item.desensitizationRequired || sensitivity !== '公开',
      usageTrend: createTrend(map.size + normalizedName.length),
    })
  }

  joinedItems.forEach((item) => {
    const policy = policies.find((row) => row.id === item.policyId)
    const sensitivity = resolveSensitivity(item.securityLevel || item.securityCategory, item)
    const dataType = inferDataType(`${item.dataSubjectType} ${item.informationCategory} ${item.name}`)
    const domain = inferBusinessDomain(`${item.department} ${item.name} ${item.category}`)

    ensureLabel({
      name: item.securityCategory || '未标注安全分类',
      code: `security_category_${item.securityCategoryId || item.securityCategory}`,
      categoryPath: `数据敏感度分类 > ${sensitivity}级别`,
      categoryGroup: '数据敏感度分类',
      sensitivity,
      description: `用于标识 ${item.name} 的安全分类和访问控制基线。`,
      item,
      policy,
      keywords: ['安全分类', item.assessmentBasis],
    })

    ensureLabel({
      name: item.securityLevel || `${sensitivity}级别`,
      code: `security_level_${item.securityLevelId || item.securityLevel || sensitivity}`,
      categoryPath: `数据敏感度分类 > ${sensitivity}级别`,
      categoryGroup: '数据敏感度分类',
      sensitivity,
      description: `用于判定 ${item.name} 的敏感度、保留期限和审批要求。`,
      item,
      policy,
      keywords: ['敏感度', item.riskNotes],
    })

    ensureLabel({
      name: item.dataSubjectType || dataType,
      code: `data_type_${item.dataSubjectTypeId || dataType}`,
      categoryPath: `数据类型分类 > ${dataType}`,
      categoryGroup: '数据类型分类',
      sensitivity,
      description: `用于区分 ${dataType} 的字段保护、导出和跨域使用策略。`,
      item,
      policy,
      keywords: ['数据类型', dataType],
    })

    ensureLabel({
      name: domain,
      code: `business_domain_${domain}`,
      categoryPath: `业务域分类 > ${domain}`,
      categoryGroup: '业务域分类',
      sensitivity,
      description: `用于标识来自 ${domain} 的业务数据标签和责任边界。`,
      item,
      policy,
      keywords: ['业务域', item.department],
    })

    policy?.fieldSecurityProfileRows.forEach((field) => {
      const fieldSensitivity = resolveSensitivity(field.securityLevel || field.sensitivityType, item)
      field.sensitivityTags.forEach((tag) => {
        ensureLabel({
          name: tag,
          code: `field_tag_${tag}`,
          categoryPath: `自定义分类 > 字段标签`,
          categoryGroup: '自定义分类',
          sensitivity: fieldSensitivity,
          description: `${field.fieldName || field.fieldCode} 字段的敏感标签，用于查询、脱敏和导出规则。`,
          item,
          policy,
          keywords: [field.fieldName, field.fieldCode, field.informationCategory, field.riskNotes],
          status: field.importantFieldFlag ? '待确认' : undefined,
        })
      })
    })
  })

  tagPolicies.forEach((tagPolicy) => {
    const matchedItems = matchTagPolicyRecords(tagPolicy, policies, joinedItems)
    const matchedPolicies = policies.filter((policy) => matchedItems.some((item) => item.policyId === policy.id))

    tagPolicy.tags.forEach((tag) => {
      const id = normalizeCode(`tag_policy_${tagPolicy.id}_${tag}`)
      const sourceNames = new Set(matchedItems.map((item) => item.name || item.resourceId).filter(Boolean))
      const policyNames = new Set([
        tagPolicy.title,
        ...matchedPolicies.map((policy) => policy.policyName || policy.policyCode).filter(Boolean),
      ])
      const sensitivity = resolveSensitivity(`${tag} ${matchedItems.map((item) => item.securityLevel).join(' ')}`, matchedItems[0])

      map.set(id, {
        id,
        name: tag,
        code: id,
        categoryPath: `标签插件 > ${tagPolicy.collectionName}.${tagPolicy.fieldName}`,
        categoryGroup: '标签插件',
        sensitivity,
        description: `${tagPolicy.title} 生成的后端标签，目标字段为 ${tagPolicy.collectionName}.${tagPolicy.fieldName}。`,
        status: tagPolicy.enabled ? '启用中' : '已禁用',
        createdBy: '标签插件',
        createdAt: formatDate(tagPolicy.createdAt),
        sourceNames,
        policyNames,
        keywords: new Set([
          tag,
          tagPolicy.title,
          tagPolicy.collectionName,
          tagPolicy.fieldName,
          tagPolicy.remark,
          ...tagPolicy.rules.map((rule) => `${rule.fieldName}${rule.operator}${rule.value}`),
        ].filter(Boolean)),
        defaultPermission: matchedItems.some((item) => item.approvalRequired) ? '需要审批' : '按标签策略',
        retention: sensitivity === '高敏感' ? '保留 10 年' : sensitivity === '敏感' ? '保留 6 年' : '永久保留',
        allowCrossDomain: matchedItems.some((item) => item.externalShareAllowed),
        allowExport: matchedItems.some((item) => item.exportScope !== 'forbidden' && item.exportScope !== 'none'),
        allowConfidentialCompute: matchedItems.some((item) => item.desensitizationRequired) || sensitivity !== '公开',
        usageTrend: createTrend(sourceNames.size + policyNames.size),
      })
    })
  })

  return Array.from(map.values())
    .map((item) => {
      const sourceNames = Array.from(item.sourceNames)
      const policyNames = Array.from(item.policyNames)
      const keywords = Array.from(item.keywords)
      return {
        ...item,
        sourceNames,
        policyNames,
        keywords,
        sourceCount: sourceNames.length,
        policyCount: policyNames.length,
        used: sourceNames.length > 0 || policyNames.length > 0,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN', { numeric: true }))
}

function countBy(records: DataLabelRecord[], predicate: (record: DataLabelRecord) => boolean) {
  return records.filter(predicate).length
}

function buildCategoryTree(records: DataLabelRecord[]): CategoryNode[] {
  const sensitivityChildren: CategoryNode[] = [
    { id: 'sensitivity-public', label: '公开级别', count: countBy(records, (item) => item.sensitivity === '公开') },
    { id: 'sensitivity-internal', label: '内部级别', count: countBy(records, (item) => item.sensitivity === '内部') },
    { id: 'sensitivity-sensitive', label: '敏感级别', count: countBy(records, (item) => item.sensitivity === '敏感') },
    { id: 'sensitivity-high', label: '高敏感级别', count: countBy(records, (item) => item.sensitivity === '高敏感') },
  ]

  return [
    { id: 'all', label: '全部标签', count: records.length },
    { id: 'group-sensitivity', label: '数据敏感度分类', count: records.filter((item) => item.categoryGroup === '数据敏感度分类').length, children: sensitivityChildren },
    {
      id: 'group-data-type',
      label: '数据类型分类',
      count: records.filter((item) => item.categoryGroup === '数据类型分类').length,
      children: buildCategoryChildren(records, '数据类型分类', 'data-type'),
    },
    {
      id: 'group-domain',
      label: '业务域分类',
      count: records.filter((item) => item.categoryGroup === '业务域分类').length,
      children: buildCategoryChildren(records, '业务域分类', 'domain'),
    },
    {
      id: 'group-tag-plugin',
      label: '标签插件',
      count: records.filter((item) => item.categoryGroup === '标签插件').length,
      children: buildCategoryChildren(records, '标签插件', 'tag-plugin'),
    },
    { id: 'group-source', label: '数据来源分类', count: countBy(records, (item) => item.sourceCount > 0) },
    { id: 'group-custom', label: '自定义分类', count: records.filter((item) => item.categoryGroup === '自定义分类').length },
  ]
}

function matchesCategory(record: DataLabelRecord, activeCategory: string) {
  if (activeCategory === 'all') return true
  if (activeCategory === 'group-sensitivity') return record.categoryGroup === '数据敏感度分类'
  if (activeCategory === 'group-data-type') return record.categoryGroup === '数据类型分类'
  if (activeCategory === 'group-domain') return record.categoryGroup === '业务域分类'
  if (activeCategory === 'group-tag-plugin') return record.categoryGroup === '标签插件'
  if (activeCategory === 'group-source') return record.sourceCount > 0
  if (activeCategory === 'group-custom') return record.categoryGroup === '自定义分类'
  if (activeCategory === 'sensitivity-public') return record.sensitivity === '公开'
  if (activeCategory === 'sensitivity-internal') return record.sensitivity === '内部'
  if (activeCategory === 'sensitivity-sensitive') return record.sensitivity === '敏感'
  if (activeCategory === 'sensitivity-high') return record.sensitivity === '高敏感'
  if (activeCategory.startsWith('data-type-')) return record.categoryPath.includes(activeCategory.replace('data-type-', ''))
  if (activeCategory.startsWith('domain-')) return record.categoryPath.includes(activeCategory.replace('domain-', ''))
  if (activeCategory.startsWith('tag-plugin-')) return record.categoryPath.includes(activeCategory.replace('tag-plugin-', ''))
  return true
}

function MiniTrend({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 118
      const y = 38 - (value / max) * 32
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg viewBox="0 0 118 42" className="h-11 w-full" aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CategoryTree({
  nodes,
  activeCategory,
  onSelect,
}: {
  nodes: CategoryNode[]
  activeCategory: string
  onSelect: (id: string) => void
}) {
  const [collapsedIds, setCollapsedIds] = useState<string[]>(['group-source', 'group-custom'])

  const renderNode = (node: CategoryNode, depth = 0): ReactNode => {
    const hasChildren = Boolean(node.children?.length)
    const isCollapsed = collapsedIds.includes(node.id)
    const isActive = activeCategory === node.id

    return (
      <div key={node.id}>
        <div
          className={cn(
            'mb-1 flex w-full min-w-0 items-center gap-2 rounded-[14px] px-3 py-3 text-left text-[0.875rem] font-medium transition',
            isActive
              ? 'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] !text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.20)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]',
          )}
          style={{ paddingLeft: `${12 + depth * 18}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px]"
              onClick={() => {
                setCollapsedIds((current) => current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id])
              }}
            >
              <ChevronDown className={cn('h-4 w-4 transition', isCollapsed ? '-rotate-90' : '')} />
            </button>
          ) : (
            <span className="h-6 w-6 shrink-0" />
          )}
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(node.id)}>
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[0.75rem]', isActive ? 'bg-white/18 text-white' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]')}>
              {node.count}
            </span>
          </button>
        </div>
        {hasChildren && !isCollapsed ? node.children?.map((child) => renderNode(child, depth + 1)) : null}
      </div>
    )
  }

  return (
    <aside className="rounded-[18px] border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[color-mix(in_srgb,var(--surface-glass)_92%,transparent)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur xl:sticky xl:top-6 xl:self-start">
      <div className="px-3 py-3">
        <div className="text-[0.75rem] text-[var(--text-muted)]">标签分类导航</div>
        <div className="mt-1 text-[0.95rem] font-semibold text-[var(--text-main)]">数据标签管理</div>
      </div>
      <nav>{nodes.map((node) => renderNode(node))}</nav>
    </aside>
  )
}

function LabelDrawer({
  open,
  mode,
  label,
  onClose,
}: {
  open: boolean
  mode: 'create' | 'edit'
  label: DataLabelRecord | null
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 flex h-dvh max-h-dvh w-full max-w-[560px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-strong)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <div className="text-[0.75rem] text-[var(--text-muted)]">{mode === 'create' ? '新建标签' : '编辑标签'}</div>
            <h2 className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{label?.name ?? '新建数据标签'}</h2>
          </div>
          <button type="button" className="rounded-[8px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">基本信息</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] outline-none" defaultValue={label?.name ?? ''} placeholder="标签名称" />
              <input className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] outline-none" defaultValue={label?.code ?? ''} placeholder="英文代码" />
            </div>
            <input className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] outline-none" defaultValue={label?.categoryPath ?? ''} placeholder="标签分类" />
            <textarea className="min-h-24 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[0.875rem] outline-none" defaultValue={label?.description ?? ''} placeholder="标签描述" />
          </section>
          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">敏感度配置</h3>
            <div className="grid gap-2 sm:grid-cols-4">
              {(['公开', '内部', '敏感', '高敏感'] as SensitivityLevel[]).map((level) => (
                <label key={level} className={cn('rounded-[8px] border px-3 py-2 text-center text-[0.8125rem]', label?.sensitivity === level ? sensitivityTone(level) : 'border-[var(--line)] text-[var(--text-secondary)]')}>
                  <input type="radio" name="sensitivity" className="sr-only" defaultChecked={label?.sensitivity === level} />
                  {level}
                </label>
              ))}
            </div>
            <div className="rounded-[8px] bg-[var(--surface-muted)] px-4 py-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
              {label?.sensitivity === '高敏感' ? '建议启用最小授权、脱敏导出和同态加密约束。' : '根据标签敏感度自动匹配默认访问范围、保留期限和导出规则。'}
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">访问控制规则</h3>
            <div className="grid gap-3">
              {['全员可见', '指定角色可见', '需要审批'].map((item) => (
                <label key={item} className="flex items-center gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-[0.875rem] text-[var(--text-secondary)]">
                  <input type="radio" name="permission" defaultChecked={label?.defaultPermission.includes(item.replace('指定', '').replace('全员', '公开'))} />
                  {item}
                </label>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ['允许跨域使用', label?.allowCrossDomain],
                ['允许导出', label?.allowExport],
                ['允许同态计算', label?.allowConfidentialCompute],
              ].map(([title, checked]) => (
                <label key={String(title)} className="flex items-center justify-between rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-[0.8125rem] text-[var(--text-secondary)]">
                  {title}
                  <input type="checkbox" defaultChecked={Boolean(checked)} />
                </label>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">关联与使用统计</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="text-[0.75rem] text-[var(--text-muted)]">引用次数</div>
                <div className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{(label?.sourceCount ?? 0) + (label?.policyCount ?? 0)}</div>
              </div>
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="text-[0.75rem] text-[var(--text-muted)]">关联数据源</div>
                <div className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{label?.sourceCount ?? 0}</div>
              </div>
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                <div className="text-[0.75rem] text-[var(--text-muted)]">关联策略</div>
                <div className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{label?.policyCount ?? 0}</div>
              </div>
            </div>
            <MiniTrend values={label?.usageTrend ?? []} />
          </section>
          <section className="space-y-3">
            <h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">变更说明</h3>
            <textarea className="min-h-20 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[0.875rem] outline-none" placeholder="填写本次标签调整说明" />
          </section>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] px-6 py-4">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="secondary">保存为草稿</Button>
          <Button variant="secondary">保存标签</Button>
          <Button>保存并启用</Button>
        </div>
      </aside>
    </div>
  )
}

export function SecurityDataLabelsPage() {
  const location = useLocation()
  const isAccessControlClassification = location.pathname.includes('/access-control/classification')
  const {
    data: { catalogItems },
    isLoading: isPortalLoading,
  } = usePortalContext()
  const { data: securityPolicies, isLoading: isSecurityLoading } = useSecurityGovernancePolicies(true)
  const { data: tagPolicies, isLoading: isTagPolicyLoading } = useFieldTagGenerationPolicies(true)
  const [activeCategory, setActiveCategory] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('全部')
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('全部')
  const [sortBy, setSortBy] = useState<SortBy>('usage')
  const [pageSize, setPageSize] = useState(20)
  const [selectedId, setSelectedId] = useState('')
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | null>(null)

  const joinedItems = useMemo(
    () => joinSecurityGovernanceItems(securityPolicies, catalogItems),
    [catalogItems, securityPolicies],
  )
  const labels = useMemo(() => buildDataLabels(securityPolicies, joinedItems, tagPolicies), [joinedItems, securityPolicies, tagPolicies])
  const categories = useMemo(() => buildCategoryTree(labels), [labels])

  const filteredLabels = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return labels
      .filter((label) => matchesCategory(label, activeCategory))
      .filter((label) => {
        if (!normalizedKeyword) return true
        return [label.name, label.code, label.description, label.categoryPath, ...label.keywords]
          .map((value) => value.toLowerCase())
          .some((value) => value.includes(normalizedKeyword))
      })
      .filter((label) => statusFilter === '全部' || label.status === statusFilter)
      .filter((label) => usageFilter === '全部' || (usageFilter === '已使用' ? label.used : !label.used))
      .sort((left, right) => {
        if (sortBy === 'createdAt') return right.createdAt.localeCompare(left.createdAt)
        if (sortBy === 'usage') return (right.sourceCount + right.policyCount) - (left.sourceCount + left.policyCount)
        return left.name.localeCompare(right.name, 'zh-CN', { numeric: true })
      })
  }, [activeCategory, keyword, labels, sortBy, statusFilter, usageFilter])

  const visibleLabels = filteredLabels.slice(0, pageSize)
  const selectedLabel = labels.find((label) => label.id === selectedId) ?? visibleLabels[0] ?? labels[0] ?? null
  const loading = isPortalLoading || isSecurityLoading || isTagPolicyLoading
  const usedCount = labels.filter((label) => label.used).length
  const pendingCount = labels.filter((label) => label.status === '待确认').length
  const sensitiveCount = labels.filter((label) => label.sensitivity === '高敏感' || label.sensitivity === '敏感').length
  const currentMonth = new Date().toISOString().slice(0, 7)
  const newLabelsThisMonth = labels.filter((label) => label.createdAt.startsWith(currentMonth)).length

  const resetFilters = () => {
    setKeyword('')
    setStatusFilter('全部')
    setUsageFilter('全部')
    setSortBy('usage')
    setActiveCategory('all')
  }

  const labelActions = (
    <>
      <Button className="gap-2" onClick={() => setDrawerMode('create')}>
        <Plus className="h-4 w-4" />
        新建标签
      </Button>
    </>
  )

  return (
    <>
      <div className="space-y-5">
        {isAccessControlClassification ? <AccessControlSecondaryTabs actions={labelActions} /> : null}
        <div className="grid gap-5 xl:grid-cols-[288px_minmax(0,1fr)]">
          <CategoryTree nodes={categories} activeCategory={activeCategory} onSelect={setActiveCategory} />
          <div className="min-w-0 space-y-5">
            {!isAccessControlClassification ? (
              <section className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(135deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h1 className="text-[1.75rem] font-semibold text-[var(--text-main)]">数据标签管理</h1>
                    <p className="mt-2 max-w-3xl text-[0.875rem] leading-6 text-[var(--text-secondary)]">
                      统一维护数据安全标签、字段标签和业务域标签，让访问控制、脱敏导出和同态加密策略基于同一套标签执行。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">{labelActions}</div>
                </div>
              </section>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {[
                { title: '标签总数', value: labels.length, helper: `本月新增 ${newLabelsThisMonth} 个`, icon: Tags, tone: 'blue' },
                { title: '已使用标签', value: usedCount, helper: `使用率 ${labels.length ? Math.round((usedCount / labels.length) * 100) : 0}%`, icon: CheckCircle2, tone: 'green' },
                { title: '待确认标签', value: pendingCount, helper: '含新建与待完善标签', icon: FileClock, tone: 'amber' },
                { title: '敏感标签数', value: sensitiveCount, helper: '需重点关注', icon: ShieldAlert, tone: 'red' },
              ].map((metric) => (
                <div key={metric.title} className="rounded-[8px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[0.75rem] text-[var(--text-muted)]">{metric.title}</div>
                      <div className="mt-2 text-[1.75rem] font-semibold leading-none text-[var(--text-main)]">{metric.value.toLocaleString()}</div>
                    </div>
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-[8px] border',
                      metric.tone === 'red'
                        ? 'border-[#ef4444]/30 bg-[#ef4444]/10 text-[#ef4444]'
                        : metric.tone === 'amber'
                          ? 'border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#d97706]'
                          : metric.tone === 'green'
                            ? 'border-[#10b981]/25 bg-[#10b981]/10 text-[#10b981]'
                            : 'border-[#3b82f6]/25 bg-[#3b82f6]/10 text-[#3b82f6]',
                    )}>
                      <metric.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-3 text-[0.8125rem] text-[var(--text-secondary)]">{metric.helper}</div>
                </div>
              ))}
            </div>

          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
            <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_150px_150px_170px_auto]">
              <label className="flex h-10 min-w-0 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
                  placeholder="搜索标签名称、描述、关键词"
                />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none">
                {['全部', '启用中', '已禁用', '待确认'].map((item) => <option key={item}>{item}</option>)}
              </select>
              <select value={usageFilter} onChange={(event) => setUsageFilter(event.target.value as UsageFilter)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none">
                {['全部', '已使用', '未使用'].map((item) => <option key={item}>{item}</option>)}
              </select>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none">
                <option value="usage">按使用次数</option>
                <option value="createdAt">按创建时间</option>
                <option value="name">按名称</option>
              </select>
              <Button variant="secondary" className="gap-2" onClick={resetFilters}>
                <Filter className="h-4 w-4" />
                重置筛选
              </Button>
            </div>
          </section>

          {loading ? (
            <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">
              正在加载数据标签...
            </div>
          ) : null}

          <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
            <div className="grid grid-cols-[44px_minmax(220px,1.4fr)_minmax(170px,1fr)_110px_120px_110px_100px_120px_120px_140px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.75rem] font-medium text-[var(--text-muted)]">
              <span><input type="checkbox" aria-label="全选标签" /></span>
              <span>标签名称</span>
              <span>标签分类</span>
              <span>敏感度级别</span>
              <span>标签描述</span>
              <span>关联数据源</span>
              <span>关联策略</span>
              <span>状态</span>
              <span>创建人</span>
              <span>操作</span>
            </div>
            <div className="overflow-x-auto">
              {visibleLabels.map((label) => (
                <div
                  key={label.id}
                  className={cn(
                    'grid min-w-[1280px] grid-cols-[44px_minmax(220px,1.4fr)_minmax(170px,1fr)_110px_120px_110px_100px_120px_120px_140px] gap-3 border-b border-[var(--line)] px-4 py-3 text-[0.8125rem]',
                    selectedLabel?.id === label.id ? 'bg-[color-mix(in_srgb,var(--status-info-bg)_42%,transparent)]' : 'bg-[var(--surface-raised)]',
                  )}
                >
                  <span className="flex items-center"><input type="checkbox" aria-label={`选择${label.name}`} /></span>
                  <button type="button" className="min-w-0 text-left" onClick={() => setSelectedId(label.id)}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />
                      <span className="truncate font-semibold text-[var(--text-main)] hover:text-[var(--primary)]">{label.name}</span>
                    </span>
                    <span className="mt-1 block truncate text-[0.75rem] text-[var(--text-muted)]">{label.code}</span>
                  </button>
                  <span className="min-w-0 truncate text-[var(--text-secondary)]" title={label.categoryPath}>{label.categoryPath}</span>
                  <span><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.75rem] font-medium', sensitivityTone(label.sensitivity))}>{label.sensitivity}</span></span>
                  <span className="min-w-0 truncate text-[var(--text-secondary)]" title={label.description}>{label.description}</span>
                  <button type="button" className="text-left font-medium text-[var(--primary)]">{label.sourceCount}</button>
                  <button type="button" className="text-left font-medium text-[var(--primary)]">{label.policyCount}</button>
                  <span className="flex items-center gap-2">
                    <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.75rem] font-medium', statusTone(label.status))}>{label.status}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-[var(--text-secondary)]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[0.75rem] text-[var(--primary)]">{label.createdBy.slice(0, 1)}</span>
                    <span className="min-w-0 truncate">{label.createdBy}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <button type="button" className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]" onClick={() => { setSelectedId(label.id); setDrawerMode('edit') }}><Edit3 className="h-4 w-4" /></button>
                    <button type="button" className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]"><Copy className="h-4 w-4" /></button>
                    <button type="button" className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--status-danger-text)]"><Trash2 className="h-4 w-4" /></button>
                    <button type="button" className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"><MoreHorizontal className="h-4 w-4" /></button>
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[0.8125rem] text-[var(--text-secondary)]">
              <span>共 {filteredLabels.length.toLocaleString()} 个标签，当前显示 {visibleLabels.length.toLocaleString()} 个</span>
              <div className="flex items-center gap-2">
                <span>每页</span>
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-2 outline-none">
                  {pageSizeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>
          </section>

          {selectedLabel ? (
            <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-soft)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <TopicPill>标签详情</TopicPill>
                    <h2 className="mt-3 text-[1.35rem] font-semibold text-[var(--text-main)]">{selectedLabel.name}</h2>
                    <div className="mt-2 text-[0.8125rem] text-[var(--text-muted)]">{selectedLabel.code} · {selectedLabel.categoryPath}</div>
                  </div>
                  <Button variant="secondary" className="gap-2" onClick={() => setDrawerMode('edit')}>
                    <Edit3 className="h-4 w-4" />
                    编辑
                  </Button>
                </div>
                <p className="mt-4 text-[0.875rem] leading-7 text-[var(--text-secondary)]">{selectedLabel.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedLabel.keywords.slice(0, 8).map((keywordItem) => (
                    <span key={keywordItem} className="rounded-full border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-1 text-[0.75rem] text-[var(--text-secondary)]">{keywordItem}</span>
                  ))}
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    { title: '默认访问权限', value: selectedLabel.defaultPermission, icon: KeyRound },
                    { title: '允许跨域使用', value: selectedLabel.allowCrossDomain ? '允许' : '禁止', icon: Archive },
                    { title: '允许导出', value: selectedLabel.allowExport ? '允许' : '禁止', icon: Download },
                    { title: '允许同态计算', value: selectedLabel.allowConfidentialCompute ? '允许' : '禁止', icon: ShieldCheck },
                  ].map((item) => (
                    <div key={item.title} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                      <div className="flex items-center gap-2 text-[0.75rem] text-[var(--text-muted)]">
                        <item.icon className="h-4 w-4 text-[var(--primary)]" />
                        {item.title}
                      </div>
                      <div className="mt-2 font-semibold text-[var(--text-main)]">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-soft)]">
                <h2 className="text-[1rem] font-semibold text-[var(--text-main)]">使用情况分析</h2>
                <div className="mt-4">
                  <MiniTrend values={selectedLabel.usageTrend} />
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="mb-2 text-[0.75rem] text-[var(--text-muted)]">Top 5 使用数据源</div>
                    {selectedLabel.sourceNames.slice(0, 5).map((sourceName) => (
                      <div key={sourceName} className="flex items-center justify-between border-t border-[var(--line)] py-2 text-[0.8125rem]">
                        <span className="truncate text-[var(--text-secondary)]">{sourceName}</span>
                        <span className="text-[var(--primary)]">查看</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="mb-2 text-[0.75rem] text-[var(--text-muted)]">变更历史时间线</div>
                    {['创建标签', '更新敏感度', '启用标签'].map((event, index) => (
                      <div key={event} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 text-[0.8125rem]">
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />
                        <span className="border-l border-[var(--line)] pb-3 pl-3 text-[var(--text-secondary)]">
                          {selectedLabel.createdAt} · {selectedLabel.createdBy} · {event}{index === 1 ? '，完成规则校验' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
          </div>
        </div>
      </div>
      <LabelDrawer open={drawerMode !== null} mode={drawerMode ?? 'create'} label={drawerMode === 'create' ? null : selectedLabel} onClose={() => setDrawerMode(null)} />
    </>
  )
}
