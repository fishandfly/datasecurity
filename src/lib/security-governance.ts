import type { CatalogCategoryTreeNode } from './catalog-category-tree'
import type { CatalogItem } from './nocobase-portal-data'
import type { SecurityGovernancePolicyRecord } from './nocobase-security-governance'

export type SecurityGovernanceJoinedItem = {
  id: string
  policyId: string
  resourceId: string
  code: string
  name: string
  summary: string
  department: string
  updateTime: string
  serviceTypeId: string
  serviceType: string
  tags: string[]
  mapPreview: CatalogItem['mapPreview'] | null
  categoryId: string
  category: string
  categoryAncestorIds: string[]
  businessAttributeId: string
  businessAttribute: string
  businessAttributePath: string
  businessAttributeAncestorIds: string[]
  informationCategoryId: string
  informationCategory: string
  informationCategoryPath: string
  informationCategoryAncestorIds: string[]
  securityCategoryId: string
  securityCategory: string
  securityLevelId: string
  securityLevel: string
  dataSubjectTypeId: string
  dataSubjectType: string
  securityProfileStatus: string
  securityReviewStatus: string
  policyStatus: string
  shareScope: string
  accessScope: string
  approvalMode: string
  desensitizationMode: string
  exportScope: string
  apiAuthMode: string
  importantDataFlag: boolean
  coreControlFlag: boolean
  openAllowed: boolean
  externalShareAllowed: boolean
  desensitizationRequired: boolean
  approvalRequired: boolean
  securityOwnerDept: string
  securityOwnerUserName: string
  assessmentBasis: string
  riskNotes: string
  fieldCount: number
  sensitiveFieldCount: number
  importantFieldCount: number
}

export type SecurityGovernanceFilters = {
  keyword?: string
  categoryNodeId?: string
  businessAttributeNodeId?: string
  informationCategoryNodeId?: string
  securityCategoryId?: string
  securityLevelId?: string
  accessScopeId?: string
  shareScopeId?: string
  approvalModeId?: string
  desensitizationModeId?: string
  openAllowed?: string
  externalShareAllowed?: string
}

export type SecurityGovernanceMetric = {
  key: 'total' | 'securityCategoryCoverage' | 'securityLevelCoverage' | 'importantDataCount'
  label: string
  value: number
}

export type SecurityGovernanceOption = {
  id: string
  label: string
  count: number
}

export type SecurityGovernanceSnapshot = {
  filteredItems: SecurityGovernanceJoinedItem[]
  overviewMetrics: SecurityGovernanceMetric[]
  securityCategoryOptions: SecurityGovernanceOption[]
  securityLevelOptions: SecurityGovernanceOption[]
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function normalizeKeyword(value: string | null | undefined) {
  return normalizeText(value).toLowerCase()
}

function normalizeFacetId(value: string | null | undefined) {
  return normalizeText(value) || '__missing__'
}

function compareOptionLabel(left: SecurityGovernanceOption, right: SecurityGovernanceOption) {
  if (right.count !== left.count) {
    return right.count - left.count
  }
  return left.label.localeCompare(right.label, 'zh-CN', { numeric: true })
}

export function resolveSecurityStatusLabel(value: string) {
  switch (value) {
    case 'active':
      return '已生效'
    case 'draft':
      return '草稿'
    case 'pending':
      return '待生效'
    case 'disabled':
      return '已停用'
    case 'approved':
      return '已通过'
    case 'unsubmitted':
      return '未提交'
    case 'returned':
      return '已退回'
    case 'pending_assess':
      return '待评估'
    default:
      return value || '未标注'
  }
}

export function resolveSecurityScopeLabel(value: string) {
  switch (value) {
    case 'dept':
      return '本部门'
    case 'org':
      return '本单位'
    case 'cross_dept':
      return '跨部门'
    case 'gov_share':
      return '政务共享'
    case 'public_open':
      return '社会开放'
    case 'forbidden':
      return '禁止共享'
    case 'public':
      return '公开可见'
    case 'login':
      return '登录可见'
    case 'role':
      return '角色可见'
    case 'whitelist':
      return '白名单可见'
    case 'none':
      return '无'
    case 'single':
      return '单级审批'
    case 'double':
      return '两级审批'
    case 'special':
      return '专项审批'
    case 'field_mask':
      return '字段脱敏'
    case 'stats_only':
      return '仅统计值'
    case 'detail':
      return '明细导出'
    case 'summary':
      return '摘要导出'
    case 'masked':
      return '脱敏导出'
    default:
      return value || '未标注'
  }
}

export function resolveSecurityBooleanLabel(value: boolean) {
  return value ? '是' : '否'
}

export function joinSecurityGovernanceItems(
  policies: SecurityGovernancePolicyRecord[],
  catalogItems: CatalogItem[],
) {
  const catalogMap = new Map(catalogItems.map((item) => [item.id, item] as const))
  const governedResourceIds = new Set<string>()

  const governedItems = policies
    .filter((policy) => policy.policyKind !== 'access_policy' && catalogMap.has(policy.resourceId))
    .map((policy) => {
    const catalogItem = catalogMap.get(policy.resourceId)
    governedResourceIds.add(policy.resourceId)
    return {
      id: policy.id,
      policyId: policy.id,
      resourceId: policy.resourceId,
      code: catalogItem?.code || '',
      name: policy.resourceName || catalogItem?.name || '未命名资源',
      summary: catalogItem?.summary || catalogItem?.description || '',
      department: catalogItem?.department || policy.securityOwnerDept || '',
      updateTime: catalogItem?.updateTime || policy.updatedAt || '',
      serviceTypeId: catalogItem?.serviceTypeId || '',
      serviceType: catalogItem?.serviceType || '',
      tags: catalogItem?.tags || [],
      mapPreview: catalogItem?.mapPreview || null,
      categoryId: catalogItem?.categoryId || '',
      category: catalogItem?.businessCategory || catalogItem?.category || '',
      categoryAncestorIds: catalogItem?.categoryAncestorIds || [],
      businessAttributeId: catalogItem?.businessAttributeId || '',
      businessAttribute: catalogItem?.businessAttribute || '',
      businessAttributePath: catalogItem?.businessAttributePath || catalogItem?.businessAttribute || '',
      businessAttributeAncestorIds: catalogItem?.businessAttributeAncestorIds || [],
      informationCategoryId: catalogItem?.informationCategoryId || '',
      informationCategory: catalogItem?.informationCategory || '',
      informationCategoryPath: catalogItem?.informationCategoryPath || catalogItem?.informationCategory || '',
      informationCategoryAncestorIds: catalogItem?.informationCategoryAncestorIds || [],
      securityCategoryId: policy.securityCategoryId,
      securityCategory: policy.securityCategory || '未标注',
      securityLevelId: policy.securityLevelId,
      securityLevel: policy.securityLevel || '未标注',
      dataSubjectTypeId: policy.dataSubjectTypeId,
      dataSubjectType: policy.dataSubjectType || '未标注',
      securityProfileStatus: policy.securityProfileStatus,
      securityReviewStatus: policy.securityReviewStatus,
      policyStatus: policy.policyStatus,
      shareScope: policy.shareScope,
      accessScope: policy.accessScope,
      approvalMode: policy.approvalMode,
      desensitizationMode: policy.desensitizationMode,
      exportScope: policy.exportScope,
      apiAuthMode: policy.apiAuthMode,
      importantDataFlag: policy.importantDataFlag,
      coreControlFlag: policy.coreControlFlag,
      openAllowed: policy.openAllowed,
      externalShareAllowed: policy.externalShareAllowed,
      desensitizationRequired: policy.desensitizationRequired,
      approvalRequired: policy.approvalRequired,
      securityOwnerDept: policy.securityOwnerDept,
      securityOwnerUserName: policy.securityOwnerUserName,
      assessmentBasis: policy.assessmentBasis,
      riskNotes: policy.riskNotes,
      fieldCount: policy.fieldSecurityStats.totalFields,
      sensitiveFieldCount: policy.fieldSecurityStats.sensitiveFieldCount,
      importantFieldCount: policy.fieldSecurityStats.importantFieldCount,
    } satisfies SecurityGovernanceJoinedItem
    })

  const ungovernedItems = catalogItems
    .filter((item) => !governedResourceIds.has(item.id))
    .map((item) => ({
      id: `resource-${item.id}`,
      policyId: '',
      resourceId: item.id,
      code: item.code || '',
      name: item.name || '未命名资源',
      summary: item.summary || item.description || '',
      department: item.department || '',
      updateTime: item.updateTime || '',
      serviceTypeId: item.serviceTypeId || '',
      serviceType: item.serviceType || '',
      tags: item.tags || [],
      mapPreview: item.mapPreview || null,
      categoryId: item.categoryId || '',
      category: item.businessCategory || item.category || '',
      categoryAncestorIds: item.categoryAncestorIds || [],
      businessAttributeId: item.businessAttributeId || '',
      businessAttribute: item.businessAttribute || '',
      businessAttributePath: item.businessAttributePath || item.businessAttribute || '',
      businessAttributeAncestorIds: item.businessAttributeAncestorIds || [],
      informationCategoryId: item.informationCategoryId || '',
      informationCategory: item.informationCategory || '',
      informationCategoryPath: item.informationCategoryPath || item.informationCategory || '',
      informationCategoryAncestorIds: item.informationCategoryAncestorIds || [],
      securityCategoryId: '',
      securityCategory: '未标注',
      securityLevelId: '',
      securityLevel: '未标注',
      dataSubjectTypeId: '',
      dataSubjectType: '未标注',
      securityProfileStatus: 'unsubmitted',
      securityReviewStatus: 'unsubmitted',
      policyStatus: 'draft',
      shareScope: '',
      accessScope: '',
      approvalMode: '',
      desensitizationMode: '',
      exportScope: '',
      apiAuthMode: '',
      importantDataFlag: false,
      coreControlFlag: false,
      openAllowed: false,
      externalShareAllowed: false,
      desensitizationRequired: false,
      approvalRequired: false,
      securityOwnerDept: '',
      securityOwnerUserName: '',
      assessmentBasis: '',
      riskNotes: '',
      fieldCount: item.fieldCount || 0,
      sensitiveFieldCount: 0,
      importantFieldCount: 0,
    } satisfies SecurityGovernanceJoinedItem))

  return [...governedItems, ...ungovernedItems]
}

function matchesKeyword(item: SecurityGovernanceJoinedItem, keyword: string) {
  if (!keyword) return true

  return [
    item.code,
    item.name,
    item.summary,
    item.serviceType,
    item.category,
    item.businessAttribute,
    item.businessAttributePath,
    item.informationCategory,
    item.informationCategoryPath,
    item.securityCategory,
    item.securityLevel,
    item.dataSubjectType,
    ...item.tags,
    item.securityOwnerDept,
    item.securityOwnerUserName,
    item.assessmentBasis,
    item.riskNotes,
    resolveSecurityScopeLabel(item.shareScope),
    resolveSecurityScopeLabel(item.accessScope),
    resolveSecurityScopeLabel(item.approvalMode),
    resolveSecurityScopeLabel(item.desensitizationMode),
    resolveSecurityStatusLabel(item.securityProfileStatus),
    resolveSecurityStatusLabel(item.securityReviewStatus),
  ]
    .map((value) => normalizeKeyword(value))
    .some((value) => value.includes(keyword))
}

export function matchesSecurityGovernanceFilters(
  item: SecurityGovernanceJoinedItem,
  filters: SecurityGovernanceFilters,
) {
  const categoryNodeId = normalizeText(filters.categoryNodeId)
  const businessAttributeNodeId = normalizeText(filters.businessAttributeNodeId)
  const informationCategoryNodeId = normalizeText(filters.informationCategoryNodeId)
  const securityCategoryId = normalizeFacetId(filters.securityCategoryId)
  const securityLevelId = normalizeFacetId(filters.securityLevelId)
  const accessScopeId = normalizeText(filters.accessScopeId)
  const shareScopeId = normalizeText(filters.shareScopeId)
  const approvalModeId = normalizeText(filters.approvalModeId)
  const desensitizationModeId = normalizeText(filters.desensitizationModeId)
  const openAllowed = normalizeText(filters.openAllowed)
  const externalShareAllowed = normalizeText(filters.externalShareAllowed)
  const keyword = normalizeKeyword(filters.keyword)

  if (categoryNodeId && !item.categoryAncestorIds.includes(categoryNodeId)) {
    return false
  }

  if (businessAttributeNodeId && !(item.businessAttributeAncestorIds || []).includes(businessAttributeNodeId)) {
    return false
  }

  if (informationCategoryNodeId && !(item.informationCategoryAncestorIds || []).includes(informationCategoryNodeId)) {
    return false
  }

  if (securityCategoryId !== '__missing__' && normalizeFacetId(item.securityCategoryId) !== securityCategoryId) {
    return false
  }

  if (securityLevelId !== '__missing__' && normalizeFacetId(item.securityLevelId) !== securityLevelId) {
    return false
  }

  if (accessScopeId && normalizeText(item.accessScope) !== accessScopeId) {
    return false
  }

  if (shareScopeId && normalizeText(item.shareScope) !== shareScopeId) {
    return false
  }

  if (approvalModeId && normalizeText(item.approvalMode) !== approvalModeId) {
    return false
  }

  if (desensitizationModeId && normalizeText(item.desensitizationMode) !== desensitizationModeId) {
    return false
  }

  if (openAllowed && String(item.openAllowed) !== openAllowed) {
    return false
  }

  if (externalShareAllowed && String(item.externalShareAllowed) !== externalShareAllowed) {
    return false
  }

  return matchesKeyword(item, keyword)
}

export function buildSecurityGovernanceCountsById(
  items: SecurityGovernanceJoinedItem[],
  mode: 'category' | 'businessAttribute' | 'information',
) {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    const ancestorIds = mode === 'category'
      ? item.categoryAncestorIds
      : mode === 'businessAttribute'
        ? item.businessAttributeAncestorIds || []
        : item.informationCategoryAncestorIds
    ancestorIds.forEach((id) => {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    })
  })
  return counts
}

function buildFacetOptions(
  items: SecurityGovernanceJoinedItem[],
  mode: 'securityCategory' | 'securityLevel',
) {
  const counts = new Map<string, SecurityGovernanceOption>()
  items.forEach((item) => {
    const id = normalizeFacetId(mode === 'securityCategory' ? item.securityCategoryId : item.securityLevelId)
    const label = normalizeText(mode === 'securityCategory' ? item.securityCategory : item.securityLevel) || '未标注'
    const current = counts.get(id)
    if (current) {
      current.count += 1
      return
    }
    counts.set(id, { id, label, count: 1 })
  })

  return [{ id: '', label: '全部', count: items.length }, ...Array.from(counts.values()).sort(compareOptionLabel)]
}

function buildTopLevelLabelMap(tree: CatalogCategoryTreeNode[]) {
  const labels = new Map<string, string>()

  const visit = (node: CatalogCategoryTreeNode, topLabel: string) => {
    labels.set(node.id, topLabel)
    node.children.forEach((child) => visit(child, topLabel))
  }

  tree.forEach((node) => visit(node, node.label))
  return labels
}

export function buildSecurityGovernanceSnapshot({
  items,
  categoryTree,
  informationCategoryTree,
  filters,
}: {
  items: SecurityGovernanceJoinedItem[]
  categoryTree: CatalogCategoryTreeNode[]
  informationCategoryTree: CatalogCategoryTreeNode[]
  filters: SecurityGovernanceFilters
}): SecurityGovernanceSnapshot {
  const filteredItems = items.filter((item) => matchesSecurityGovernanceFilters(item, filters))
  const categoryTopLevelLabelMap = buildTopLevelLabelMap(categoryTree)
  const informationTopLevelLabelMap = buildTopLevelLabelMap(informationCategoryTree)
  const securityCategoryCoverageIds = new Set(filteredItems.map((item) => normalizeFacetId(item.securityCategoryId)).filter(Boolean))
  const securityLevelCoverageIds = new Set(filteredItems.map((item) => normalizeFacetId(item.securityLevelId)).filter(Boolean))
  const categoryCoverageIds = new Set(
    filteredItems
      .map((item) => item.categoryAncestorIds.find((nodeId) => categoryTopLevelLabelMap.has(nodeId)) ?? '')
      .filter(Boolean),
  )
  const informationCoverageIds = new Set(
    filteredItems
      .map((item) => item.informationCategoryAncestorIds.find((nodeId) => informationTopLevelLabelMap.has(nodeId)) ?? '')
      .filter(Boolean),
  )

  return {
    filteredItems,
    overviewMetrics: [
      { key: 'total', label: '安全档案总数', value: filteredItems.length },
      { key: 'securityCategoryCoverage', label: '安全分类类型', value: securityCategoryCoverageIds.size || categoryCoverageIds.size },
      { key: 'securityLevelCoverage', label: '安全等级层级', value: securityLevelCoverageIds.size || informationCoverageIds.size },
      { key: 'importantDataCount', label: '重要数据数量', value: filteredItems.filter((item) => item.importantDataFlag).length },
    ],
    securityCategoryOptions: buildFacetOptions(items, 'securityCategory'),
    securityLevelOptions: buildFacetOptions(items, 'securityLevel'),
  }
}
