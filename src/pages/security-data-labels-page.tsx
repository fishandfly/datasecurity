import {
  ChevronDown,
  Edit3,
  Filter,
  Plus,
  Search,
  Tags,
  X,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../components/ui'
import {
  saveFieldTagGenerationPolicy,
  useFieldTagGenerationPolicies,
  type FieldTagGenerationPolicyRecord,
  type FieldTagGenerationRule,
} from '../lib/nocobase-field-tags'
import { toErrorMessage } from '../lib/nocobase-client'
import { useSecurityGovernancePolicies, type SecurityGovernancePolicyRecord } from '../lib/nocobase-security-governance'
import { usePortalContext } from '../lib/portal-context'
import { joinSecurityGovernanceItems, type SecurityGovernanceJoinedItem } from '../lib/security-governance'
import { cn } from '../lib/utils'

type SensitivityLevel = '公开' | '内部' | '敏感' | '高敏感'
type LabelStatus = '启用中' | '已禁用' | '待确认'
type StatusFilter = '全部' | LabelStatus

type DataLabelRecord = {
  id: string
  name: string
  code: string
  categoryPath: string
  categoryGroup: string
  sensitivity: SensitivityLevel
  description: string
  resourceNames: string[]
  policyNames: string[]
  resourceCount: number
  policyCount: number
  status: LabelStatus
  createdAt: string
  keywords: string[]
}

type LabelAccumulator = Omit<DataLabelRecord, 'resourceNames' | 'policyNames' | 'resourceCount' | 'policyCount' | 'keywords'> & {
  resourceNames: Set<string>
  policyNames: Set<string>
  keywords: Set<string>
}

type LabelTreeGroup = {
  id: string
  name: string
  labels: DataLabelRecord[]
}

type TagRuleForm = {
  id: string
  title: string
  enabled: boolean
  collectionName: string
  fieldName: string
  logic: 'and' | 'or'
  remark: string
  rules: FieldTagGenerationRule[]
}

function normalizeText(value: unknown) {
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
  return normalizeText(value).slice(0, 10)
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

function normalizeComparable(value: unknown) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return value === null || value === undefined ? '' : String(value).trim()
}

function readPolicyFieldValue(policy: SecurityGovernancePolicyRecord, fieldName: string) {
  const row = policy as unknown as Record<string, unknown>
  const direct = row[fieldName]
  if (direct !== undefined) return direct
  const camelName = fieldName.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
  return row[camelName]
}

function matchesTagRule(policy: SecurityGovernancePolicyRecord, rule: FieldTagGenerationRule) {
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
    default:
      return actual === expected
  }
}

function matchingItems(
  policy: FieldTagGenerationPolicyRecord,
  policies: SecurityGovernancePolicyRecord[],
  joinedItems: SecurityGovernanceJoinedItem[],
) {
  if (policy.collectionName !== 'eco_resource_security_policies') return []
  const matchedPolicyIds = new Set(
    policies
      .filter((item) => {
        if (!policy.rules.length) return false
        const checks = policy.rules.map((rule) => matchesTagRule(item, rule))
        return policy.logic === 'or' ? checks.some(Boolean) : checks.every(Boolean)
      })
      .map((item) => item.id),
  )
  return joinedItems.filter((item) => matchedPolicyIds.has(item.policyId))
}

function buildDataLabels(
  policies: SecurityGovernancePolicyRecord[],
  joinedItems: SecurityGovernanceJoinedItem[],
  tagPolicies: FieldTagGenerationPolicyRecord[],
) {
  const records = new Map<string, LabelAccumulator>()
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
    const labelName = normalizeText(name)
    if (!labelName) return
    const id = normalizeCode(code || labelName)
    const currentStatus = status ?? (item.securityReviewStatus === 'pending' ? '待确认' : item.policyStatus === 'disabled' ? '已禁用' : '启用中')
    const existing = records.get(id)
    if (existing) {
      existing.resourceNames.add(item.name || item.resourceId)
      existing.policyNames.add(policy?.policyName || item.policyId)
      keywords.forEach((keyword) => existing.keywords.add(keyword))
      return
    }
    records.set(id, {
      id,
      name: labelName,
      code: id,
      categoryPath,
      categoryGroup,
      sensitivity,
      description,
      status: currentStatus,
      createdAt: formatDate(policy?.createdAt || item.updateTime),
      resourceNames: new Set([item.name || item.resourceId]),
      policyNames: new Set([policy?.policyName || item.policyId]),
      keywords: new Set([labelName, item.securityCategory, item.securityLevel, item.dataSubjectType, ...keywords].filter(Boolean)),
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
      categoryPath: `数据敏感度分类 / ${sensitivity}级别`,
      categoryGroup: '数据敏感度分类',
      sensitivity,
      description: `标识 ${item.name} 的安全分类和访问控制基线。`,
      item,
      policy,
      keywords: ['安全分类', item.assessmentBasis],
    })
    ensureLabel({
      name: item.securityLevel || `${sensitivity}级别`,
      code: `security_level_${item.securityLevelId || item.securityLevel || sensitivity}`,
      categoryPath: `数据敏感度分类 / ${sensitivity}级别`,
      categoryGroup: '数据敏感度分类',
      sensitivity,
      description: `判定 ${item.name} 的敏感度、保留期限和审批要求。`,
      item,
      policy,
      keywords: ['敏感度', item.riskNotes],
    })
    ensureLabel({
      name: item.dataSubjectType || dataType,
      code: `data_type_${item.dataSubjectTypeId || dataType}`,
      categoryPath: `数据类型分类 / ${dataType}`,
      categoryGroup: '数据类型分类',
      sensitivity,
      description: `区分 ${dataType} 的字段保护、导出和跨域使用策略。`,
      item,
      policy,
      keywords: ['数据类型', dataType],
    })
    ensureLabel({
      name: domain,
      code: `business_domain_${domain}`,
      categoryPath: `业务域分类 / ${domain}`,
      categoryGroup: '业务域分类',
      sensitivity,
      description: `标识来自 ${domain} 的数据责任边界。`,
      item,
      policy,
      keywords: ['业务域', item.department],
    })
  })

  tagPolicies.forEach((tagPolicy) => {
    const items = matchingItems(tagPolicy, policies, joinedItems)
    tagPolicy.tags.forEach((tag) => {
      const id = normalizeCode(`automatic_${tag}`)
      const current = records.get(id)
      const sensitivity = resolveSensitivity(`${tag} ${items.map((item) => item.securityLevel).join(' ')}`, items[0])
      const resourceNames = new Set(items.map((item) => item.name || item.resourceId).filter(Boolean))
      if (current) {
        resourceNames.forEach((name) => current.resourceNames.add(name))
        current.policyNames.add(tagPolicy.title)
        current.keywords.add(tagPolicy.title)
        return
      }
      records.set(id, {
        id,
        name: tag,
        code: id,
        categoryPath: '自动补全标签 / 自定义规则',
        categoryGroup: '自动补全标签',
        sensitivity,
        description: tagPolicy.remark || `${tagPolicy.title} 自动生成的标签。`,
        status: tagPolicy.enabled ? '启用中' : '已禁用',
        createdAt: formatDate(tagPolicy.createdAt),
        resourceNames,
        policyNames: new Set([tagPolicy.title]),
        keywords: new Set([tag, tagPolicy.title, tagPolicy.collectionName, ...tagPolicy.rules.map((rule) => `${rule.fieldName}${rule.operator}${rule.value}`)]),
      })
    })
  })

  return Array.from(records.values())
    .map((record) => ({
      ...record,
      resourceNames: Array.from(record.resourceNames),
      policyNames: Array.from(record.policyNames),
      keywords: Array.from(record.keywords),
      resourceCount: record.resourceNames.size,
      policyCount: record.policyNames.size,
    }))
    .sort((left, right) => left.categoryGroup.localeCompare(right.categoryGroup, 'zh-CN') || left.name.localeCompare(right.name, 'zh-CN'))
}

function buildLabelTree(labels: DataLabelRecord[]) {
  const groups = new Map<string, DataLabelRecord[]>()
  labels.forEach((label) => groups.set(label.categoryGroup, [...(groups.get(label.categoryGroup) || []), label]))
  return Array.from(groups.entries())
    .map(([name, groupLabels]) => ({ id: normalizeCode(name), name, labels: groupLabels } satisfies LabelTreeGroup))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function ruleSummary(policy: FieldTagGenerationPolicyRecord | undefined) {
  if (!policy) return '未配置自动补全规则'
  if (!policy.rules.length) return '规则条件未设置'
  const first = policy.rules[0]
  const operator = { eq: '等于', ne: '不等于', neq: '不等于', contains: '包含', notContains: '不包含', empty: '为空', notEmpty: '不为空' }[first.operator] || first.operator
  const suffix = policy.rules.length > 1 ? ` 等 ${policy.rules.length} 个条件` : ''
  return `${first.fieldName} ${operator} ${first.value || '-'}${suffix}`
}

function createRuleForm(label: DataLabelRecord, policy?: FieldTagGenerationPolicyRecord): TagRuleForm {
  return {
    id: policy?.id || '',
    title: policy?.title || `标签补全-${label.name}`,
    enabled: policy?.enabled ?? true,
    collectionName: policy?.collectionName || 'eco_resource_security_policies',
    fieldName: policy?.fieldName || 'security_tags',
    logic: policy?.logic || 'and',
    remark: policy?.remark || '',
    rules: policy?.rules.length ? policy.rules : [{ fieldName: '', operator: 'eq', value: '' }],
  }
}

function LabelRuleDrawer({
  label,
  policies,
  onClose,
  onSaved,
}: {
  label: DataLabelRecord | null
  policies: FieldTagGenerationPolicyRecord[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const policy = label ? policies.find((item) => item.tags.includes(label.name)) : undefined
  const [form, setForm] = useState<TagRuleForm>(() => label ? createRuleForm(label, policy) : createRuleForm({ name: '', id: '', code: '', categoryPath: '', categoryGroup: '', sensitivity: '公开', description: '', resourceNames: [], policyNames: [], resourceCount: 0, policyCount: 0, status: '启用中', createdAt: '', keywords: [] }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (label) setForm(createRuleForm(label, policy))
    setError('')
  }, [label, policy])

  if (!label) return null

  const updateRule = (index: number, key: keyof FieldTagGenerationRule, value: string) => {
    setForm((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [key]: value } : rule),
    }))
  }

  const save = async () => {
    if (!form.rules.some((rule) => rule.fieldName.trim())) {
      setError('请至少配置一个匹配条件')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveFieldTagGenerationPolicy(form.id, {
        title: form.title,
        enabled: form.enabled,
        dataSourceKey: policy?.dataSourceKey || 'main',
        collectionName: form.collectionName,
        fieldName: form.fieldName,
        logic: form.logic,
        rules: form.rules,
        tags: policy?.tags.length ? policy.tags : [label.name],
        sort: policy?.sort || 999,
        remark: form.remark,
      })
      await onSaved()
      onClose()
    } catch (caught) {
      setError(toErrorMessage(caught, '保存标签规则失败'))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[rgba(8,18,32,0.46)]" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <aside className="absolute inset-y-0 right-0 flex h-full max-h-[100dvh] w-full max-w-[680px] flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)] shadow-[-24px_0_64px_rgba(8,18,32,0.22)]">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <div className="text-[0.75rem] text-[var(--text-muted)]">标签管理</div>
            <h2 className="mt-1 text-[1.125rem] font-semibold text-[var(--text-main)]">{label.name}</h2>
          </div>
          <button type="button" title="关闭" className="rounded-[6px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={onClose}><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><div className="text-[0.75rem] text-[var(--text-muted)]">标签分类</div><div className="mt-1 text-[0.875rem] text-[var(--text-main)]">{label.categoryPath}</div></div>
              <div><div className="text-[0.75rem] text-[var(--text-muted)]">敏感度</div><span className={cn('mt-1 inline-flex rounded-full border px-2.5 py-1 text-[0.75rem] font-medium', sensitivityTone(label.sensitivity))}>{label.sensitivity}</span></div>
              <div><div className="text-[0.75rem] text-[var(--text-muted)]">关联资源</div><div className="mt-1 text-[0.875rem] text-[var(--text-main)]">{label.resourceCount} 个</div></div>
              <div><div className="text-[0.75rem] text-[var(--text-muted)]">补全规则</div><div className="mt-1 text-[0.875rem] text-[var(--text-main)]">{policies.filter((item) => item.tags.includes(label.name)).length} 条</div></div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4"><div><h3 className="text-[0.95rem] font-semibold text-[var(--text-main)]">自动补全规则</h3><p className="mt-1 text-[0.8125rem] text-[var(--text-muted)]">满足全部条件时，系统自动写入此标签。</p></div><label className="flex shrink-0 items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)]"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />启用</label></div>
            <label className="block space-y-1.5 text-[0.8125rem] text-[var(--text-secondary)]"><span>规则名称</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)]" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-[0.8125rem] text-[var(--text-secondary)]"><span>匹配对象</span><input value={form.collectionName} onChange={(event) => setForm((current) => ({ ...current, collectionName: event.target.value }))} className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)]" /></label>
              <label className="block space-y-1.5 text-[0.8125rem] text-[var(--text-secondary)]"><span>标签写入字段</span><input value={form.fieldName} onChange={(event) => setForm((current) => ({ ...current, fieldName: event.target.value }))} className="h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)]" /></label>
            </div>
            <div className="flex items-center justify-between gap-3"><span className="text-[0.8125rem] text-[var(--text-secondary)]">匹配条件</span><select value={form.logic} onChange={(event) => setForm((current) => ({ ...current, logic: event.target.value as 'and' | 'or' }))} className="h-9 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-2 text-[0.75rem] text-[var(--text-secondary)] outline-none"><option value="and">全部满足</option><option value="or">任一满足</option></select></div>
            <div className="space-y-2">
              {form.rules.map((rule, index) => (
                <div key={`${index}-${rule.fieldName}`} className="grid gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] p-3 sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)_32px]">
                  <input aria-label={`条件${index + 1}字段`} value={rule.fieldName} placeholder="字段名，如 policy_status" onChange={(event) => updateRule(index, 'fieldName', event.target.value)} className="h-9 min-w-0 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-2 text-[0.8125rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)]" />
                  <select aria-label={`条件${index + 1}运算符`} value={rule.operator} onChange={(event) => updateRule(index, 'operator', event.target.value)} className="h-9 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-2 text-[0.8125rem] text-[var(--text-secondary)] outline-none"><option value="eq">等于</option><option value="ne">不等于</option><option value="contains">包含</option><option value="notContains">不包含</option><option value="empty">为空</option><option value="notEmpty">不为空</option></select>
                  <input aria-label={`条件${index + 1}取值`} value={rule.value} placeholder="匹配值" disabled={rule.operator === 'empty' || rule.operator === 'notEmpty'} onChange={(event) => updateRule(index, 'value', event.target.value)} className="h-9 min-w-0 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-2 text-[0.8125rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)] disabled:bg-[var(--surface-muted)]" />
                  <button type="button" title="删除条件" disabled={form.rules.length === 1} className="rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--status-danger-text)] disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setForm((current) => ({ ...current, rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index) }))}>×</button>
                </div>
              ))}
              <button type="button" className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-[var(--primary)] hover:underline" onClick={() => setForm((current) => ({ ...current, rules: [...current.rules, { fieldName: '', operator: 'eq', value: '' }] }))}><Plus className="h-3.5 w-3.5" />添加条件</button>
            </div>
            <label className="block space-y-1.5 text-[0.8125rem] text-[var(--text-secondary)]"><span>说明</span><textarea value={form.remark} onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))} className="min-h-20 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[0.875rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)]" placeholder="说明该标签的自动补全依据" /></label>
          </section>
          {error ? <div className="rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div> : null}
        </div>
        <footer className="sticky bottom-0 z-10 flex shrink-0 justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgba(8,18,32,0.08)]"><Button variant="secondary" onClick={onClose}>取消</Button><Button disabled={saving} onClick={() => void save()}>{saving ? '保存中...' : '保存规则'}</Button></footer>
      </aside>
    </div>,
    document.body,
  )
}

export function SecurityDataLabelsPage() {
  const { data: { catalogItems }, isLoading: isPortalLoading } = usePortalContext()
  const { data: securityPolicies, isLoading: isSecurityLoading } = useSecurityGovernancePolicies(true)
  const { data: tagPolicies, isLoading: isTagPolicyLoading, error: tagPolicyError, refresh } = useFieldTagGenerationPolicies(true)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('全部')
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const [editingLabel, setEditingLabel] = useState<DataLabelRecord | null>(null)

  const joinedItems = useMemo(() => joinSecurityGovernanceItems(securityPolicies, catalogItems), [catalogItems, securityPolicies])
  const labels = useMemo(() => buildDataLabels(securityPolicies, joinedItems, tagPolicies), [joinedItems, securityPolicies, tagPolicies])
  const filteredLabels = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return labels.filter((label) => {
      if (statusFilter !== '全部' && label.status !== statusFilter) return false
      if (!query) return true
      return [label.name, label.code, label.categoryPath, label.description, ...label.keywords].some((value) => value.toLowerCase().includes(query))
    })
  }, [keyword, labels, statusFilter])
  const groups = useMemo(() => buildLabelTree(filteredLabels), [filteredLabels])
  const loading = isPortalLoading || isSecurityLoading || isTagPolicyLoading
  const rulePoliciesByTag = useMemo(() => {
    const result = new Map<string, FieldTagGenerationPolicyRecord>()
    tagPolicies.forEach((policy) => policy.tags.forEach((tag) => {
      if (!result.has(tag)) result.set(tag, policy)
    }))
    return result
  }, [tagPolicies])

  useEffect(() => {
    setExpandedGroups((current) => current.length ? current : groups.map((group) => group.id))
  }, [groups])

  const toggleGroup = (id: string) => setExpandedGroups((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  const resetFilters = () => { setKeyword(''); setStatusFilter('全部') }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 border-b border-[var(--line)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h1 className="text-[1.125rem] font-semibold text-[var(--text-main)]">标签管理</h1><p className="mt-1 text-[0.8125rem] text-[var(--text-muted)]">标签按分类层级展示，自动补全规则在标签编辑中直接维护。</p></div>
          <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)]"><span>共 {labels.length} 个标签</span><span className="h-3 border-l border-[var(--line)]" /><span>{tagPolicies.length} 条自动补全规则</span></div>
        </div>
        <div className="grid gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] p-4 lg:grid-cols-[minmax(280px,1fr)_150px_auto]">
          <label className="flex h-10 min-w-0 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3"><Search className="h-4 w-4 text-[var(--text-muted)]" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]" placeholder="搜索标签名称、分类或自动补全规则" /></label>
          <select aria-label="标签状态" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[0.875rem] text-[var(--text-secondary)] outline-none"><option value="全部">全部状态</option><option value="启用中">启用中</option><option value="已禁用">已禁用</option><option value="待确认">待确认</option></select>
          <Button variant="secondary" className="gap-2" onClick={resetFilters}><Filter className="h-4 w-4" />重置</Button>
        </div>
        {tagPolicyError ? <div className="border-b border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-5 py-3 text-[0.8125rem] text-[var(--status-warning-text)]">自动补全规则暂不可读取：{tagPolicyError}</div> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-[0.8125rem]">
            <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]"><tr><th className="w-[28%] border-b border-[var(--line)] px-5 py-3 font-medium">标签名称</th><th className="w-[18%] border-b border-[var(--line)] px-4 py-3 font-medium">分类层级</th><th className="w-28 border-b border-[var(--line)] px-4 py-3 font-medium">敏感度</th><th className="w-36 border-b border-[var(--line)] px-4 py-3 font-medium">关联范围</th><th className="border-b border-[var(--line)] px-4 py-3 font-medium">自动补全规则</th><th className="w-28 border-b border-[var(--line)] px-4 py-3 font-medium">状态</th><th className="w-20 border-b border-[var(--line)] px-4 py-3 font-medium">操作</th></tr></thead>
            <tbody>
              {groups.map((group) => {
                const expanded = expandedGroups.includes(group.id)
                return (
                  <Fragment key={group.id}>
                    <tr key={group.id} className="bg-[color-mix(in_srgb,var(--primary)_7%,var(--surface-raised))]">
                      <td colSpan={7} className="border-b border-[var(--line)] px-5 py-3"><button type="button" className="flex items-center gap-2 font-semibold text-[var(--text-main)] hover:text-[var(--primary)]" onClick={() => toggleGroup(group.id)}><ChevronDown className={cn('h-4 w-4 transition-transform', expanded ? '' : '-rotate-90')} /><Tags className="h-4 w-4 text-[var(--primary)]" />{group.name}<span className="ml-1 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[0.75rem] font-normal text-[var(--text-muted)]">{group.labels.length}</span></button></td>
                    </tr>
                    {expanded ? group.labels.map((label) => {
                      const rule = rulePoliciesByTag.get(label.name)
                      const ruleCount = tagPolicies.filter((item) => item.tags.includes(label.name)).length
                      return <tr key={label.id} className="border-b border-[var(--line)] bg-[var(--surface-raised)] align-top last:border-b-0 hover:bg-[var(--surface-muted)]"><td className="px-5 py-3.5"><div className="flex items-start gap-2"><span className="mt-2 h-px w-4 shrink-0 bg-[var(--line)]" /><div className="min-w-0"><div className="truncate font-medium text-[var(--text-main)]">{label.name}</div><div className="mt-1 truncate text-[0.75rem] text-[var(--text-muted)]">{label.code}</div></div></div></td><td className="px-4 py-3.5 text-[var(--text-secondary)]">{label.categoryPath}</td><td className="px-4 py-3.5"><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.75rem] font-medium', sensitivityTone(label.sensitivity))}>{label.sensitivity}</span></td><td className="px-4 py-3.5 text-[var(--text-secondary)]"><div>{label.resourceCount} 个数据资源</div><div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">{label.categoryGroup === '自动补全标签' ? `${ruleCount} 条补全规则` : `${label.policyCount} 个安全策略`}</div></td><td className="max-w-[320px] px-4 py-3.5"><div className={cn('truncate', rule ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]')} title={ruleSummary(rule)}>{ruleSummary(rule)}</div>{rule ? <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">{rule.enabled ? '已启用' : '已停用'} · {rule.logic === 'and' ? '全部满足' : '任一满足'}</div> : null}</td><td className="px-4 py-3.5"><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[0.75rem] font-medium', statusTone(label.status))}>{label.status}</span></td><td className="px-4 py-3"><button type="button" title="编辑标签规则" className="rounded-[6px] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]" onClick={() => setEditingLabel(label)}><Edit3 className="h-4 w-4" /></button></td></tr>
                    }) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {!loading && !groups.length ? <div className="px-5 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">未找到符合条件的标签</div> : null}
        {loading ? <div className="px-5 py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在读取标签和自动补全规则...</div> : null}
      </section>
      <LabelRuleDrawer label={editingLabel} policies={tagPolicies} onClose={() => setEditingLabel(null)} onSaved={refresh} />
    </div>
  )
}
