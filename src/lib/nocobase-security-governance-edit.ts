import { useEffect, useState } from 'react'
import { assertCanManageCatalogResources } from './admin-role'
import { nocobaseClient, toErrorMessage } from './nocobase-client'
import {
  clearSecurityGovernanceCache,
  fetchSecurityGovernancePolicies,
  type SecurityGovernanceFieldPolicyRow,
  type SecurityGovernanceFieldProfileRow,
  type SecurityGovernancePolicyRecord,
} from './nocobase-security-governance'

type RawUserRecord = {
  id?: number | string | null
  nickname?: string | null
  username?: string | null
}

type RawListResponse<T> = {
  data?: T[]
}

export type SecurityGovernanceSelectOption = {
  value: string
  label: string
}

export type EditableSecurityGovernanceRecord = {
  id: string
  resourceId: string
  resourceName: string
  securityCategoryId: string
  securityLevelId: string
  dataSubjectTypeId: string
  securityProfileStatus: string
  securityReviewStatus: string
  importantDataFlag: boolean
  coreControlFlag: boolean
  shareScope: string
  externalShareAllowed: boolean
  openAllowed: boolean
  desensitizationRequired: boolean
  approvalRequired: boolean
  securityOwnerDept: string
  securityOwnerUserId: string
  assessmentBasis: string
  riskNotes: string
  lastReviewedAt: string
  nextReviewAt: string
  policyCode: string
  policyName: string
  policySource: string
  policyStatus: string
  accessScope: string
  approvalMode: string
  desensitizationMode: string
  exportAllowed: boolean
  exportScope: string
  apiAccessAllowed: boolean
  apiAuthMode: string
  effectiveFrom: string
  effectiveTo: string
  remarks: string
}

export type EditableSecurityGovernanceFieldRow = {
  id: string
  seq: number
  fieldCode: string
  fieldName: string
  dataType: string
  description: string
  informationCategory: string
  classificationLevel: string
  securityLevel: string
  sensitivityType: string
  importantFieldFlag: boolean
  identifierFlag: boolean
  quasiIdentifierFlag: boolean
  levelBasis: string
  riskNotes: string
  requiredAccessScope: string
  requiredDesensitization: boolean
  requiredDesensitizationMode: string
  requiredExportAllowed: boolean
  requiredExportScope: string
  requiredApiAccessAllowed: boolean
  requiredApiReturnMode: string
  requiredApprovalRequired: boolean
}

export type SecurityGovernanceEditSupportOptions = {
  securityCategoryOptions: SecurityGovernanceSelectOption[]
  securityLevelOptions: SecurityGovernanceSelectOption[]
  dataSubjectTypeOptions: SecurityGovernanceSelectOption[]
  securityOwnerUserOptions: SecurityGovernanceSelectOption[]
  shareScopeOptions: SecurityGovernanceSelectOption[]
  accessScopeOptions: SecurityGovernanceSelectOption[]
  approvalModeOptions: SecurityGovernanceSelectOption[]
  desensitizationModeOptions: SecurityGovernanceSelectOption[]
  exportScopeOptions: SecurityGovernanceSelectOption[]
  apiAuthModeOptions: SecurityGovernanceSelectOption[]
  securityProfileStatusOptions: SecurityGovernanceSelectOption[]
  securityReviewStatusOptions: SecurityGovernanceSelectOption[]
  policyStatusOptions: SecurityGovernanceSelectOption[]
}

const EMPTY_EDITABLE_SECURITY_GOVERNANCE: EditableSecurityGovernanceRecord = {
  id: '',
  resourceId: '',
  resourceName: '',
  securityCategoryId: '',
  securityLevelId: '',
  dataSubjectTypeId: '',
  securityProfileStatus: '',
  securityReviewStatus: '',
  importantDataFlag: false,
  coreControlFlag: false,
  shareScope: '',
  externalShareAllowed: false,
  openAllowed: false,
  desensitizationRequired: false,
  approvalRequired: false,
  securityOwnerDept: '',
  securityOwnerUserId: '',
  assessmentBasis: '',
  riskNotes: '',
  lastReviewedAt: '',
  nextReviewAt: '',
  policyCode: '',
  policyName: '',
  policySource: '',
  policyStatus: '',
  accessScope: '',
  approvalMode: '',
  desensitizationMode: '',
  exportAllowed: false,
  exportScope: '',
  apiAccessAllowed: false,
  apiAuthMode: '',
  effectiveFrom: '',
  effectiveTo: '',
  remarks: '',
}

function normalizeId(value: unknown) {
  if (value == null) return ''
  return String(value).trim()
}

function normalizeText(value: unknown, fallback = '') {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : fallback
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return fallback
}

function formatDateInputValue(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  return normalized.slice(0, 10)
}

function formatDateTimeInputValue(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}`
}

function toDateTimeValue(value: string) {
  const normalized = normalizeText(value)
  return normalized ? new Date(normalized).toISOString() : null
}

function toDateValue(value: string) {
  const normalized = normalizeText(value)
  return normalized || null
}

function mapEditableSecurityRecord(record: SecurityGovernancePolicyRecord): EditableSecurityGovernanceRecord {
  return {
    id: record.id,
    resourceId: record.resourceId,
    resourceName: record.resourceName,
    securityCategoryId: record.securityCategoryId,
    securityLevelId: record.securityLevelId,
    dataSubjectTypeId: record.dataSubjectTypeId,
    securityProfileStatus: record.securityProfileStatus,
    securityReviewStatus: record.securityReviewStatus,
    importantDataFlag: record.importantDataFlag,
    coreControlFlag: record.coreControlFlag,
    shareScope: record.shareScope,
    externalShareAllowed: record.externalShareAllowed,
    openAllowed: record.openAllowed,
    desensitizationRequired: record.desensitizationRequired,
    approvalRequired: record.approvalRequired,
    securityOwnerDept: record.securityOwnerDept,
    securityOwnerUserId: record.securityOwnerUserId,
    assessmentBasis: record.assessmentBasis,
    riskNotes: record.riskNotes,
    lastReviewedAt: formatDateTimeInputValue(record.lastReviewedAt),
    nextReviewAt: formatDateInputValue(record.nextReviewAt),
    policyCode: record.policyCode,
    policyName: record.policyName,
    policySource: record.policySource,
    policyStatus: record.policyStatus,
    accessScope: record.accessScope,
    approvalMode: record.approvalMode,
    desensitizationMode: record.desensitizationMode,
    exportAllowed: record.exportAllowed,
    exportScope: record.exportScope,
    apiAccessAllowed: record.apiAccessAllowed,
    apiAuthMode: record.apiAuthMode,
    effectiveFrom: formatDateInputValue(record.effectiveFrom),
    effectiveTo: formatDateInputValue(record.effectiveTo),
    remarks: record.remarks,
  }
}

function mergeFieldPolicy(
  profile: SecurityGovernanceFieldProfileRow,
  policy: SecurityGovernanceFieldPolicyRow | undefined,
  index: number,
): EditableSecurityGovernanceFieldRow {
  return {
    id: `${profile.fieldCode || `field-${index + 1}`}-${index + 1}`,
    seq: Number(profile.seq ?? index + 1),
    fieldCode: profile.fieldCode,
    fieldName: profile.fieldName,
    dataType: profile.dataType,
    description: profile.description,
    informationCategory: profile.informationCategory,
    classificationLevel: profile.classificationLevel,
    securityLevel: profile.securityLevel,
    sensitivityType: profile.sensitivityType,
    importantFieldFlag: profile.importantFieldFlag,
    identifierFlag: profile.identifierFlag,
    quasiIdentifierFlag: profile.quasiIdentifierFlag,
    levelBasis: profile.levelBasis,
    riskNotes: profile.riskNotes,
    requiredAccessScope: policy?.requiredAccessScope ?? '',
    requiredDesensitization: policy?.requiredDesensitization ?? false,
    requiredDesensitizationMode: policy?.requiredDesensitizationMode ?? '',
    requiredExportAllowed: policy?.requiredExportAllowed ?? false,
    requiredExportScope: policy?.requiredExportScope ?? '',
    requiredApiAccessAllowed: policy?.requiredApiAccessAllowed ?? false,
    requiredApiReturnMode: policy?.requiredApiReturnMode ?? '',
    requiredApprovalRequired: policy?.requiredApprovalRequired ?? false,
  }
}

function mapEditableSecurityFieldRows(record: SecurityGovernancePolicyRecord): EditableSecurityGovernanceFieldRow[] {
  const policyByFieldCode = new Map(
    record.fieldSecurityPolicyRows.map((row) => [normalizeText(row.fieldCode), row] as const),
  )

  return record.fieldSecurityProfileRows.map((row, index) => (
    mergeFieldPolicy(row, policyByFieldCode.get(normalizeText(row.fieldCode)), index)
  ))
}

function buildDistinctOptions(
  policies: SecurityGovernancePolicyRecord[],
  pick: (item: SecurityGovernancePolicyRecord) => { value: string; label: string },
) {
  const seen = new Map<string, SecurityGovernanceSelectOption>()
  policies.forEach((item) => {
    const option = pick(item)
    if (!option.value || seen.has(option.value)) return
    seen.set(option.value, option)
  })
  return Array.from(seen.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN', { numeric: true }))
}

async function fetchSecurityOwnerUsers() {
  const response = await nocobaseClient.resource('users').list({
    page: 1,
    pageSize: 200,
    sort: 'id',
  })
  const payload = response.data as RawListResponse<RawUserRecord>
  return (payload.data ?? [])
    .map((item) => ({
      value: normalizeId(item.id),
      label: normalizeText(item.nickname ?? item.username, normalizeId(item.id)),
    }))
    .filter((item) => item.value)
}

function findOptionLabel(options: SecurityGovernanceSelectOption[], value: string) {
  const normalizedValue = normalizeId(value)
  if (!normalizedValue) return ''
  return options.find((option) => option.value === normalizedValue)?.label ?? ''
}

function parseSecurityLevelNo(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const matched = value.match(/\d+/)
    if (matched) {
      return Number(matched[0])
    }
  }

  return null
}

export async function fetchSecurityGovernanceEditSupportOptions(): Promise<SecurityGovernanceEditSupportOptions> {
  const [policies, userOptions] = await Promise.all([
    fetchSecurityGovernancePolicies(),
    fetchSecurityOwnerUsers().catch(() => []),
  ])

  return {
    securityCategoryOptions: buildDistinctOptions(policies, (item) => ({ value: item.securityCategoryId, label: item.securityCategory || item.securityCategoryId })),
    securityLevelOptions: buildDistinctOptions(policies, (item) => ({ value: item.securityLevelId, label: item.securityLevel || item.securityLevelId })),
    dataSubjectTypeOptions: buildDistinctOptions(policies, (item) => ({ value: item.dataSubjectTypeId, label: item.dataSubjectType || item.dataSubjectTypeId })),
    securityOwnerUserOptions: userOptions,
    shareScopeOptions: buildDistinctOptions(policies, (item) => ({ value: item.shareScope, label: item.shareScope || '未标注' })),
    accessScopeOptions: buildDistinctOptions(policies, (item) => ({ value: item.accessScope, label: item.accessScope || '未标注' })),
    approvalModeOptions: buildDistinctOptions(policies, (item) => ({ value: item.approvalMode, label: item.approvalMode || '未标注' })),
    desensitizationModeOptions: buildDistinctOptions(policies, (item) => ({ value: item.desensitizationMode, label: item.desensitizationMode || '未标注' })),
    exportScopeOptions: buildDistinctOptions(policies, (item) => ({ value: item.exportScope, label: item.exportScope || '未标注' })),
    apiAuthModeOptions: buildDistinctOptions(policies, (item) => ({ value: item.apiAuthMode, label: item.apiAuthMode || '未标注' })),
    securityProfileStatusOptions: buildDistinctOptions(policies, (item) => ({ value: item.securityProfileStatus, label: item.securityProfileStatus || '未标注' })),
    securityReviewStatusOptions: buildDistinctOptions(policies, (item) => ({ value: item.securityReviewStatus, label: item.securityReviewStatus || '未标注' })),
    policyStatusOptions: buildDistinctOptions(policies, (item) => ({ value: item.policyStatus, label: item.policyStatus || '未标注' })),
  }
}

function buildResourceSecurityProfileValues(
  original: SecurityGovernancePolicyRecord,
  values: EditableSecurityGovernanceRecord,
  options?: SecurityGovernanceEditSupportOptions,
) {
  const originalSecurityLevelNo = parseSecurityLevelNo(original.securityProfileJson.securityLevelNo)
  const selectedSecurityLevelLabel =
    values.securityLevelId === original.securityLevelId
      ? original.securityLevel
      : findOptionLabel(options?.securityLevelOptions ?? [], values.securityLevelId)
  const securityLevelNo = parseSecurityLevelNo(selectedSecurityLevelLabel) ?? originalSecurityLevelNo

  return {
    security_category_id: values.securityCategoryId || null,
    security_level_id: values.securityLevelId || null,
    data_subject_type_id: values.dataSubjectTypeId || null,
    security_profile_status: values.securityProfileStatus || null,
    security_review_status: values.securityReviewStatus || null,
    important_data_flag: values.importantDataFlag,
    core_control_flag: values.coreControlFlag,
    share_scope: values.shareScope || null,
    external_share_allowed: values.externalShareAllowed,
    open_allowed: values.openAllowed,
    desensitization_required: values.desensitizationRequired,
    approval_required: values.approvalRequired,
    security_owner_dept: values.securityOwnerDept.trim(),
    security_owner_user_id: values.securityOwnerUserId || null,
    assessment_basis: values.assessmentBasis.trim(),
    risk_notes: values.riskNotes.trim(),
    last_reviewed_at: toDateTimeValue(values.lastReviewedAt),
    next_review_at: toDateValue(values.nextReviewAt),
    policy_code: values.policyCode.trim(),
    policy_name: values.policyName.trim(),
    policy_source: values.policySource.trim(),
    policy_status: values.policyStatus || null,
    access_scope: values.accessScope || null,
    approval_mode: values.approvalMode || null,
    desensitization_mode: values.desensitizationMode || null,
    export_allowed: values.exportAllowed,
    export_scope: values.exportScope || null,
    api_access_allowed: values.apiAccessAllowed,
    api_auth_mode: values.apiAuthMode || null,
    effective_from: toDateValue(values.effectiveFrom),
    effective_to: toDateValue(values.effectiveTo),
    remarks: values.remarks.trim(),
    security_profile_json: {
      ...original.securityProfileJson,
      resourceId: original.resourceId,
      resourceName: original.resourceName,
      securityCategoryId: values.securityCategoryId || null,
      securityLevelNo,
      dataSubjectTypeId: values.dataSubjectTypeId || null,
      updatedAt: new Date().toISOString(),
    },
    policy_detail_json: {
      ...original.policyDetailJson,
      control: {
        ...(original.policyDetailJson.control && typeof original.policyDetailJson.control === 'object' ? original.policyDetailJson.control : {}),
        share_scope: values.shareScope || null,
        access_scope: values.accessScope || null,
        approval_mode: values.approvalMode || null,
        desensitization_mode: values.desensitizationMode || null,
        export_scope: values.exportScope || null,
        api_auth_mode: values.apiAuthMode || null,
      },
      data_subject_type_id: values.dataSubjectTypeId || null,
      security_category_id: values.securityCategoryId || null,
      security_level_id: values.securityLevelId || null,
    },
  }
}

function buildFieldSecurityValues(original: SecurityGovernancePolicyRecord, rows: EditableSecurityGovernanceFieldRow[]) {
  const normalizedRows = rows.filter((row) => normalizeText(row.fieldCode).length > 0 || normalizeText(row.fieldName).length > 0)
  return {
    field_profiles_json: original.fieldProfilesJson,
    field_policies_json: original.fieldPoliciesJson,
    security_profile_json: {
      ...original.securityProfileJson,
      fieldSecurityProfiles: normalizedRows.map((row, index) => ({
        seq: index + 1,
        field_code: row.fieldCode.trim(),
        field_name: row.fieldName.trim(),
        data_type: row.dataType.trim(),
        description: row.description.trim(),
        information_category: row.informationCategory.trim() || null,
        classification_level: row.classificationLevel.trim() || null,
        security_level: row.securityLevel.trim() || null,
        sensitivity_type: row.sensitivityType.trim() || null,
        important_field_flag: row.importantFieldFlag,
        identifier_flag: row.identifierFlag,
        quasi_identifier_flag: row.quasiIdentifierFlag,
        level_basis: row.levelBasis.trim() || null,
        risk_notes: row.riskNotes.trim() || null,
      })),
      fieldSecurityStats: {
        totalFields: normalizedRows.length,
        sensitiveFieldCount: normalizedRows.filter((row) => Boolean(row.sensitivityType || row.identifierFlag || row.quasiIdentifierFlag)).length,
        importantFieldCount: normalizedRows.filter((row) => row.importantFieldFlag).length,
      },
      updatedAt: new Date().toISOString(),
    },
    policy_detail_json: {
      ...original.policyDetailJson,
      fieldSecurityPolicies: normalizedRows.map((row, index) => ({
        seq: index + 1,
        field_code: row.fieldCode.trim(),
        field_name: row.fieldName.trim(),
        required_access_scope: row.requiredAccessScope.trim() || null,
        required_desensitization: row.requiredDesensitization,
        required_desensitization_mode: row.requiredDesensitizationMode.trim() || null,
        required_export_allowed: row.requiredExportAllowed,
        required_export_scope: row.requiredExportScope.trim() || null,
        required_api_access_allowed: row.requiredApiAccessAllowed,
        required_api_return_mode: row.requiredApiReturnMode.trim() || null,
        required_approval_required: row.requiredApprovalRequired,
      })),
    },
  }
}

export async function saveEditableSecurityGovernanceRecord(
  original: SecurityGovernancePolicyRecord,
  values: EditableSecurityGovernanceRecord,
  options?: SecurityGovernanceEditSupportOptions,
) {
  await assertCanManageCatalogResources()
  await nocobaseClient.resource('eco_resource_security_policies').update({
    filterByTk: original.id,
    values: buildResourceSecurityProfileValues(original, values, options),
  })
  clearSecurityGovernanceCache()
}

export async function saveEditableSecurityGovernanceFieldRows(
  original: SecurityGovernancePolicyRecord,
  rows: EditableSecurityGovernanceFieldRow[],
) {
  await assertCanManageCatalogResources()
  await nocobaseClient.resource('eco_resource_security_policies').update({
    filterByTk: original.id,
    values: buildFieldSecurityValues(original, rows),
  })
  clearSecurityGovernanceCache()
}

export function useEditableSecurityGovernanceRecord(record: SecurityGovernancePolicyRecord | null, enabled: boolean) {
  const [data, setData] = useState<EditableSecurityGovernanceRecord>(EMPTY_EDITABLE_SECURITY_GOVERNANCE)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !record) return
    setIsLoading(true)
    try {
      setData(mapEditableSecurityRecord(record))
      setError(null)
    } catch (currentError) {
      setError(toErrorMessage(currentError, '读取安全档案编辑信息失败'))
    } finally {
      setIsLoading(false)
    }
  }, [enabled, record])

  return { data, isLoading, error, setData }
}

export function useEditableSecurityGovernanceFieldRows(record: SecurityGovernancePolicyRecord | null, enabled: boolean) {
  const [data, setData] = useState<EditableSecurityGovernanceFieldRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !record) return
    setIsLoading(true)
    try {
      setData(mapEditableSecurityFieldRows(record))
      setError(null)
    } catch (currentError) {
      setError(toErrorMessage(currentError, '读取字段安全编辑信息失败'))
    } finally {
      setIsLoading(false)
    }
  }, [enabled, record])

  return { data, isLoading, error, setData }
}
