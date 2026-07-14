import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAvailableCollectionNames, resolveCollectionName } from './nocobase-collections'
import { nocobaseClient, toErrorMessage } from './nocobase-client'
import { createDemoSecurityPolicies, isDemoFallbackEnabled } from './demo-security-data'
import { loadAllPagesParallel } from './paginated-resource-loader'

const SECURITY_POLICY_COLLECTION_CANDIDATES = ['eco_resource_security_policies'] as const
const SECURITY_FIELD_COLLECTION = 'eco_resource_security_fields'
const SECURITY_POLICY_PAGE_SIZE = 200
const SECURITY_POLICY_APPENDS = [
  'security_category',
  'security_level',
  'data_subject_type',
  'security_owner_user',
] as const

type RawTreeRelation = {
  id?: number | string | null
  nodeName?: string | null
  node_name?: string | null
  name?: string | null
  label?: string | null
}

type RawDictionaryRelation = {
  id?: number | string | null
  dictValueName?: string | null
  dict_value_name?: string | null
  name?: string | null
  label?: string | null
}

type RawUserRelation = {
  id?: number | string | null
  nickname?: string | null
  username?: string | null
}

type RawSecurityPolicyRecord = {
  id?: number | string | null
  resource_id?: number | string | null
  security_category_id?: number | string | null
  security_level_id?: number | string | null
  data_subject_type_id?: number | string | null
  security_owner_user_id?: number | string | null
  security_category?: RawTreeRelation | null
  security_level?: RawDictionaryRelation | null
  data_subject_type?: RawDictionaryRelation | null
  security_owner_user?: RawUserRelation | null
  security_profile_status?: string | null
  security_review_status?: string | null
  important_data_flag?: boolean | null
  core_control_flag?: boolean | null
  share_scope?: string | null
  external_share_allowed?: boolean | null
  open_allowed?: boolean | null
  desensitization_required?: boolean | null
  approval_required?: boolean | null
  security_owner_dept?: string | null
  assessment_basis?: string | null
  risk_notes?: string | null
  last_reviewed_at?: string | null
  next_review_at?: string | null
  policy_code?: string | null
  policy_kind?: string | null
  policy_name?: string | null
  policy_source?: string | null
  policy_status?: string | null
  access_scope?: string | null
  approval_mode?: string | null
  desensitization_mode?: string | null
  export_allowed?: boolean | null
  export_scope?: string | null
  api_access_allowed?: boolean | null
  api_auth_mode?: string | null
  effective_from?: string | null
  effective_to?: string | null
  field_profiles_json?: unknown
  field_policies_json?: unknown
  security_profile_json?: unknown
  policy_detail_json?: unknown
  security_review_json?: unknown
  remarks?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type RawSecurityFieldRecord = Record<string, unknown> & {
  id?: number | string | null
  resource_id?: number | string | null
  policy_id?: number | string | null
}

type RawListResponse<T> = {
  data?: T[]
  meta?: {
    totalPage?: number
  }
}

export type SecurityGovernanceFieldProfileRow = {
  seq: number
  fieldCode: string
  fieldName: string
  dataType: string
  description: string
  informationCategory: string
  classificationLevel: string
  securityLevel: string
  sensitivityType: string
  sensitivityTags: string[]
  identifierFlag: boolean
  quasiIdentifierFlag: boolean
  importantFieldFlag: boolean
  levelBasis: string
  riskNotes: string
  extra: Record<string, unknown>
}

export type SecurityGovernanceFieldPolicyRow = {
  seq: number
  fieldCode: string
  fieldName: string
  requiredAccessScope: string
  requiredDesensitization: boolean
  requiredDesensitizationMode: string
  requiredExportAllowed: boolean
  requiredExportScope: string
  requiredApiAccessAllowed: boolean
  requiredApiReturnMode: string
  requiredApprovalRequired: boolean
  requiredQueryConditionAllowed: boolean
  requiredAggregationAllowed: boolean
  requiredJoinAllowed: boolean
  notes: string
  extra: Record<string, unknown>
}

export type SecurityGovernancePhysicalTableRow = {
  seq: number
  tableName: string
  tableDescription: string
  baselineFlag: boolean
  businessTimeField: string
  businessTimeDesc: string
  sourceSystem: string
  sensitivity: string
  accessScope: string
  desensitizationMode: string
  exportScope: string
  apiAccessAllowed: boolean
}

export type SecurityGovernancePolicyRecord = {
  id: string
  resourceId: string
  resourceName: string
  securityCategoryId: string
  securityCategory: string
  securityLevelId: string
  securityLevel: string
  dataSubjectTypeId: string
  dataSubjectType: string
  securityOwnerUserId: string
  securityOwnerUserName: string
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
  assessmentBasis: string
  riskNotes: string
  lastReviewedAt: string
  nextReviewAt: string
  policyCode: string
  policyKind: string
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
  fieldProfilesJson: Record<string, unknown>[]
  fieldPoliciesJson: Record<string, unknown>[]
  securityProfileJson: Record<string, unknown>
  policyDetailJson: Record<string, unknown>
  securityReviewJson: Record<string, unknown>
  fieldSecurityProfileRows: SecurityGovernanceFieldProfileRow[]
  fieldSecurityPolicyRows: SecurityGovernanceFieldPolicyRow[]
  legacyPhysicalTableRows: SecurityGovernancePhysicalTableRow[]
  fieldSecurityStats: {
    totalFields: number
    sensitiveFieldCount: number
    importantFieldCount: number
  }
  remarks: string
  createdAt: string
  updatedAt: string
}

export function createEmptySecurityGovernancePolicy(resourceId: string, resourceName: string): SecurityGovernancePolicyRecord {
  return {
    id: '', resourceId, resourceName,
    securityCategoryId: '', securityCategory: '', securityLevelId: '', securityLevel: '',
    dataSubjectTypeId: '', dataSubjectType: '', securityOwnerUserId: '', securityOwnerUserName: '',
    securityProfileStatus: 'unsubmitted', securityReviewStatus: 'unsubmitted', importantDataFlag: false, coreControlFlag: false,
    shareScope: '', externalShareAllowed: false, openAllowed: false, desensitizationRequired: false, approvalRequired: false,
    securityOwnerDept: '', assessmentBasis: '', riskNotes: '', lastReviewedAt: '', nextReviewAt: '',
    policyCode: '', policyKind: 'resource_security_profile', policyName: '', policySource: '', policyStatus: 'draft',
    accessScope: '', approvalMode: '', desensitizationMode: '', exportAllowed: false, exportScope: '',
    apiAccessAllowed: false, apiAuthMode: '', effectiveFrom: '', effectiveTo: '',
    fieldProfilesJson: [], fieldPoliciesJson: [], securityProfileJson: {}, policyDetailJson: {}, securityReviewJson: {},
    fieldSecurityProfileRows: [], fieldSecurityPolicyRows: [], legacyPhysicalTableRows: [],
    fieldSecurityStats: { totalFields: 0, sensitiveFieldCount: 0, importantFieldCount: 0 },
    remarks: '', createdAt: '', updatedAt: '',
  }
}

let securityGovernanceCache: SecurityGovernancePolicyRecord[] | null = null
let securityGovernancePromise: Promise<SecurityGovernancePolicyRecord[]> | null = null

function normalizeId(value: unknown) {
  if (value === null || value === undefined) return ''
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

function normalizeBoolean(value: unknown) {
  if (value === true) return true
  const normalized = normalizeText(value).toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y' || normalized === '是'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonLike(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const normalized = value.trim()
  if (!normalized) return null
  try {
    return JSON.parse(normalized)
  } catch {
    return null
  }
}

function parseJsonObject(value: unknown) {
  const parsed = parseJsonLike(value)
  return isRecord(parsed) ? parsed : {}
}

function parseJsonArray(value: unknown) {
  const parsed = parseJsonLike(value)
  if (!Array.isArray(parsed)) return []
  return parsed.filter((item): item is Record<string, unknown> => isRecord(item))
}

function readTreeRelationLabel(value: RawTreeRelation | null | undefined) {
  return normalizeText(
    value?.nodeName
      ?? value?.node_name
      ?? value?.name
      ?? value?.label,
  )
}

function readDictionaryRelationLabel(value: RawDictionaryRelation | null | undefined) {
  return normalizeText(
    value?.dictValueName
      ?? value?.dict_value_name
      ?? value?.name
      ?? value?.label,
  )
}

function readUserRelationLabel(value: RawUserRelation | null | undefined) {
  return normalizeText(value?.nickname ?? value?.username)
}

function omitKnownKeys(value: Record<string, unknown>, knownKeys: string[]) {
  const next: Record<string, unknown> = {}
  Object.entries(value).forEach(([key, currentValue]) => {
    if (!knownKeys.includes(key)) {
      next[key] = currentValue
    }
  })
  return next
}

function looksLikeFieldProfile(value: Record<string, unknown>) {
  return Boolean(
    normalizeText(value.field_code ?? value.fieldCode ?? value.code)
    || normalizeText(value.field_name ?? value.fieldName ?? value.name)
    || normalizeText(value.data_type ?? value.dataType),
  )
}

function looksLikeFieldPolicy(value: Record<string, unknown>) {
  return Boolean(
    normalizeText(value.field_code ?? value.fieldCode ?? value.code)
    || normalizeText(value.field_name ?? value.fieldName ?? value.name)
    || normalizeText(value.required_access_scope ?? value.access_scope),
  )
}

function looksLikePhysicalTableProfile(value: Record<string, unknown>) {
  return Boolean(
    normalizeText(value.table_name ?? value.tableName)
    || normalizeText(value.business_time_field ?? value.businessTimeField)
    || value.baseline_flag != null,
  )
}

function looksLikePhysicalTablePolicy(value: Record<string, unknown>) {
  return Boolean(
    normalizeText(value.table_name ?? value.tableName)
    || normalizeText(value.access_scope)
    || normalizeText(value.desensitization_mode),
  )
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/[、,，;；|]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function parseFieldSecurityProfiles(
  rawProfiles: Record<string, unknown>[],
  securityProfileJson: Record<string, unknown>,
) {
  const sourceRows = rawProfiles.some((item) => looksLikeFieldProfile(item))
    ? rawProfiles.filter((item) => looksLikeFieldProfile(item))
    : parseJsonArray(securityProfileJson.fieldSecurityProfiles ?? securityProfileJson.field_security_profiles)
        .filter((item) => looksLikeFieldProfile(item))

  return sourceRows.map((row, index) => ({
    seq: Number(row.seq ?? index + 1),
    fieldCode: normalizeText(row.field_code ?? row.fieldCode ?? row.code, `field_${index + 1}`),
    fieldName: normalizeText(row.field_name ?? row.fieldName ?? row.name ?? row.label, normalizeText(row.field_code ?? row.fieldCode ?? row.code, `字段${index + 1}`)),
    dataType: normalizeText(row.data_type ?? row.dataType ?? row.type),
    description: normalizeText(row.description ?? row.desc),
    informationCategory: normalizeText(row.information_category ?? row.informationCategory),
    classificationLevel: normalizeText(row.classification_level ?? row.classificationLevel),
    securityLevel: normalizeText(row.security_level ?? row.securityLevel),
    sensitivityType: normalizeText(row.sensitivity_type ?? row.sensitivityType ?? row.sensitivity),
    sensitivityTags: normalizeStringArray(row.sensitivity_tags ?? row.sensitivityTags ?? row.field_tags ?? row.fieldTags),
    identifierFlag: normalizeBoolean(row.identifier_flag ?? row.identifierFlag),
    quasiIdentifierFlag: normalizeBoolean(row.quasi_identifier_flag ?? row.quasiIdentifierFlag),
    importantFieldFlag: normalizeBoolean(row.important_field_flag ?? row.importantFieldFlag),
    levelBasis: normalizeText(row.level_basis ?? row.levelBasis),
    riskNotes: normalizeText(row.risk_notes ?? row.riskNotes),
    extra: omitKnownKeys(row, [
      'seq',
      'field_code',
      'fieldCode',
      'code',
      'field_name',
      'fieldName',
      'name',
      'label',
      'data_type',
      'dataType',
      'type',
      'description',
      'desc',
      'information_category',
      'informationCategory',
      'classification_level',
      'classificationLevel',
      'security_level',
      'securityLevel',
      'sensitivity_type',
      'sensitivityType',
      'sensitivity',
      'sensitivity_tags',
      'sensitivityTags',
      'field_tags',
      'fieldTags',
      'identifier_flag',
      'identifierFlag',
      'quasi_identifier_flag',
      'quasiIdentifierFlag',
      'important_field_flag',
      'importantFieldFlag',
      'level_basis',
      'levelBasis',
      'risk_notes',
      'riskNotes',
    ]),
  }))
}

function parseFieldSecurityPolicies(
  rawPolicies: Record<string, unknown>[],
  policyDetailJson: Record<string, unknown>,
) {
  const sourceRows = rawPolicies.some((item) => looksLikeFieldPolicy(item))
    ? rawPolicies.filter((item) => looksLikeFieldPolicy(item))
    : parseJsonArray(policyDetailJson.fieldSecurityPolicies ?? policyDetailJson.field_security_policies)
        .filter((item) => looksLikeFieldPolicy(item))

  return sourceRows.map((row, index) => ({
    seq: Number(row.seq ?? index + 1),
    fieldCode: normalizeText(row.field_code ?? row.fieldCode ?? row.code, `field_${index + 1}`),
    fieldName: normalizeText(row.field_name ?? row.fieldName ?? row.name ?? row.label),
    requiredAccessScope: normalizeText(row.required_access_scope ?? row.requiredAccessScope ?? row.access_scope),
    requiredDesensitization: normalizeBoolean(row.required_desensitization ?? row.requiredDesensitization),
    requiredDesensitizationMode: normalizeText(row.required_desensitization_mode ?? row.requiredDesensitizationMode ?? row.desensitization_mode),
    requiredExportAllowed: normalizeBoolean(row.required_export_allowed ?? row.requiredExportAllowed ?? row.export_allowed),
    requiredExportScope: normalizeText(row.required_export_scope ?? row.requiredExportScope ?? row.export_scope),
    requiredApiAccessAllowed: normalizeBoolean(row.required_api_access_allowed ?? row.requiredApiAccessAllowed ?? row.api_access_allowed),
    requiredApiReturnMode: normalizeText(row.required_api_return_mode ?? row.requiredApiReturnMode ?? row.api_return_mode),
    requiredApprovalRequired: normalizeBoolean(row.required_approval_required ?? row.requiredApprovalRequired ?? row.approval_required),
    requiredQueryConditionAllowed: normalizeBoolean(row.required_query_condition_allowed ?? row.requiredQueryConditionAllowed),
    requiredAggregationAllowed: normalizeBoolean(row.required_aggregation_allowed ?? row.requiredAggregationAllowed),
    requiredJoinAllowed: normalizeBoolean(row.required_join_allowed ?? row.requiredJoinAllowed),
    notes: normalizeText(row.notes ?? row.note),
    extra: omitKnownKeys(row, [
      'seq',
      'field_code',
      'fieldCode',
      'code',
      'field_name',
      'fieldName',
      'name',
      'label',
      'required_access_scope',
      'requiredAccessScope',
      'access_scope',
      'required_desensitization',
      'requiredDesensitization',
      'required_desensitization_mode',
      'requiredDesensitizationMode',
      'desensitization_mode',
      'required_export_allowed',
      'requiredExportAllowed',
      'export_allowed',
      'required_export_scope',
      'requiredExportScope',
      'export_scope',
      'required_api_access_allowed',
      'requiredApiAccessAllowed',
      'api_access_allowed',
      'required_api_return_mode',
      'requiredApiReturnMode',
      'api_return_mode',
      'required_approval_required',
      'requiredApprovalRequired',
      'approval_required',
      'required_query_condition_allowed',
      'requiredQueryConditionAllowed',
      'required_aggregation_allowed',
      'requiredAggregationAllowed',
      'required_join_allowed',
      'requiredJoinAllowed',
      'notes',
      'note',
    ]),
  }))
}

function parseLegacyPhysicalTableRows(
  rawProfiles: Record<string, unknown>[],
  rawPolicies: Record<string, unknown>[],
  policyDetailJson: Record<string, unknown>,
) {
  const legacyContainer = isRecord(policyDetailJson.legacyPhysicalTables)
    ? policyDetailJson.legacyPhysicalTables
    : isRecord(policyDetailJson.legacy_physical_tables)
      ? policyDetailJson.legacy_physical_tables
      : {}

  const profileRows = (
    parseJsonArray(legacyContainer.profiles ?? legacyContainer.field_profiles_json).some((item) => looksLikePhysicalTableProfile(item))
      ? parseJsonArray(legacyContainer.profiles ?? legacyContainer.field_profiles_json)
      : rawProfiles.filter((item) => looksLikePhysicalTableProfile(item))
  ).filter((item) => looksLikePhysicalTableProfile(item))

  const policyRows = (
    parseJsonArray(legacyContainer.policies ?? legacyContainer.field_policies_json).some((item) => looksLikePhysicalTablePolicy(item))
      ? parseJsonArray(legacyContainer.policies ?? legacyContainer.field_policies_json)
      : rawPolicies.filter((item) => looksLikePhysicalTablePolicy(item))
  ).filter((item) => looksLikePhysicalTablePolicy(item))

  const policyMap = new Map<string, Record<string, unknown>>(
    policyRows.map((row) => [normalizeText(row.table_name ?? row.tableName), row] as const),
  )

  return profileRows.map((row, index) => {
    const tableName = normalizeText(row.table_name ?? row.tableName, `table_${index + 1}`)
    const matchedPolicy = policyMap.get(tableName)
    return {
      seq: Number(row.seq ?? index + 1),
      tableName,
      tableDescription: normalizeText(row.table_description ?? row.tableDescription ?? row.description),
      baselineFlag: normalizeBoolean(row.baseline_flag ?? row.baselineFlag),
      businessTimeField: normalizeText(row.business_time_field ?? row.businessTimeField),
      businessTimeDesc: normalizeText(row.business_time_desc ?? row.businessTimeDesc),
      sourceSystem: normalizeText(row.source_system ?? row.sourceSystem),
      sensitivity: normalizeText(row.sensitivity),
      accessScope: normalizeText(matchedPolicy?.access_scope),
      desensitizationMode: normalizeText(matchedPolicy?.desensitization_mode),
      exportScope: normalizeText(matchedPolicy?.export_scope),
      apiAccessAllowed: normalizeBoolean(matchedPolicy?.api_access_allowed),
    }
  })
}

function buildFieldSecurityStats(rows: SecurityGovernanceFieldProfileRow[]) {
  return {
    totalFields: rows.length,
    sensitiveFieldCount: rows.filter((row) => Boolean(row.sensitivityType || row.sensitivityTags.length > 0 || row.identifierFlag || row.quasiIdentifierFlag)).length,
    importantFieldCount: rows.filter((row) => row.importantFieldFlag).length,
  }
}

function mapSecurityGovernancePolicy(record: RawSecurityPolicyRecord, persistedFieldRows: RawSecurityFieldRecord[] = []): SecurityGovernancePolicyRecord {
  const securityProfileJson = parseJsonObject(record.security_profile_json)
  const policyDetailJson = parseJsonObject(record.policy_detail_json)
  const securityReviewJson = parseJsonObject(record.security_review_json)
  const fieldProfilesJson = parseJsonArray(record.field_profiles_json)
  const fieldPoliciesJson = parseJsonArray(record.field_policies_json)
  const normalizedPersistedFieldRows = persistedFieldRows.map((row) => ({ ...row }))
  const fieldSecurityProfileRows = parseFieldSecurityProfiles(
    normalizedPersistedFieldRows.length > 0 ? normalizedPersistedFieldRows : fieldProfilesJson,
    securityProfileJson,
  )
  const fieldSecurityPolicyRows = parseFieldSecurityPolicies(
    normalizedPersistedFieldRows.length > 0 ? normalizedPersistedFieldRows : fieldPoliciesJson,
    policyDetailJson,
  )
  const legacyPhysicalTableRows = parseLegacyPhysicalTableRows(fieldProfilesJson, fieldPoliciesJson, policyDetailJson)
  const fieldSecurityStats = buildFieldSecurityStats(fieldSecurityProfileRows)

  return {
    id: normalizeId(record.id),
    resourceId: normalizeId(record.resource_id ?? securityProfileJson.resourceId),
    resourceName: normalizeText(securityProfileJson.resourceName),
    securityCategoryId: normalizeId(record.security_category_id ?? record.security_category?.id),
    securityCategory: readTreeRelationLabel(record.security_category),
    securityLevelId: normalizeId(record.security_level_id ?? record.security_level?.id),
    securityLevel: readDictionaryRelationLabel(record.security_level),
    dataSubjectTypeId: normalizeId(record.data_subject_type_id ?? record.data_subject_type?.id),
    dataSubjectType: readDictionaryRelationLabel(record.data_subject_type),
    securityOwnerUserId: normalizeId(record.security_owner_user_id ?? record.security_owner_user?.id),
    securityOwnerUserName: readUserRelationLabel(record.security_owner_user),
    securityProfileStatus: normalizeText(record.security_profile_status),
    securityReviewStatus: normalizeText(record.security_review_status),
    importantDataFlag: normalizeBoolean(record.important_data_flag),
    coreControlFlag: normalizeBoolean(record.core_control_flag),
    shareScope: normalizeText(record.share_scope),
    externalShareAllowed: normalizeBoolean(record.external_share_allowed),
    openAllowed: normalizeBoolean(record.open_allowed),
    desensitizationRequired: normalizeBoolean(record.desensitization_required),
    approvalRequired: normalizeBoolean(record.approval_required),
    securityOwnerDept: normalizeText(record.security_owner_dept),
    assessmentBasis: normalizeText(record.assessment_basis),
    riskNotes: normalizeText(record.risk_notes),
    lastReviewedAt: normalizeText(record.last_reviewed_at),
    nextReviewAt: normalizeText(record.next_review_at),
    policyCode: normalizeText(record.policy_code),
    policyKind: normalizeText(record.policy_kind),
    policyName: normalizeText(record.policy_name),
    policySource: normalizeText(record.policy_source),
    policyStatus: normalizeText(record.policy_status),
    accessScope: normalizeText(record.access_scope),
    approvalMode: normalizeText(record.approval_mode),
    desensitizationMode: normalizeText(record.desensitization_mode),
    exportAllowed: normalizeBoolean(record.export_allowed),
    exportScope: normalizeText(record.export_scope),
    apiAccessAllowed: normalizeBoolean(record.api_access_allowed),
    apiAuthMode: normalizeText(record.api_auth_mode),
    effectiveFrom: normalizeText(record.effective_from),
    effectiveTo: normalizeText(record.effective_to),
    fieldProfilesJson,
    fieldPoliciesJson,
    securityProfileJson,
    policyDetailJson,
    securityReviewJson,
    fieldSecurityProfileRows,
    fieldSecurityPolicyRows,
    legacyPhysicalTableRows,
    fieldSecurityStats,
    remarks: normalizeText(record.remarks),
    createdAt: normalizeText(record.createdAt),
    updatedAt: normalizeText(record.updatedAt),
  }
}

async function resolveSecurityPolicyCollectionName() {
  const availableCollections = await getAvailableCollectionNames()
  const collectionName = resolveCollectionName(availableCollections, SECURITY_POLICY_COLLECTION_CANDIDATES)

  if (availableCollections && !availableCollections.has(collectionName)) {
    throw new Error('当前环境未启用安全管控集合 eco_resource_security_policies')
  }

  return collectionName
}

async function fetchSecurityGovernancePoliciesInternal() {
  const collectionName = await resolveSecurityPolicyCollectionName()
  const availableCollections = await getAvailableCollectionNames()
  const shouldLoadPersistedFields = !availableCollections || availableCollections.has(SECURITY_FIELD_COLLECTION)
  const [rows, persistedFields] = await Promise.all([
    loadAllPagesParallel(async ({ page, pageSize }) => {
      const response = await nocobaseClient.resource(collectionName).list({
        page,
        pageSize,
        sort: '-updatedAt',
        appends: [...SECURITY_POLICY_APPENDS],
      })
      const payload = response.data as RawListResponse<RawSecurityPolicyRecord>
      return {
        data: payload.data ?? [],
        meta: payload.meta,
      }
    }, SECURITY_POLICY_PAGE_SIZE),
    shouldLoadPersistedFields
      ? loadAllPagesParallel(async ({ page, pageSize }) => {
          const response = await nocobaseClient.resource(SECURITY_FIELD_COLLECTION).list({
            page,
            pageSize,
            sort: ['resource_id', 'seq'],
          })
          const payload = response.data as RawListResponse<RawSecurityFieldRecord>
          return {
            data: payload.data ?? [],
            meta: payload.meta,
          }
        }, SECURITY_POLICY_PAGE_SIZE)
      : Promise.resolve([] as RawSecurityFieldRecord[]),
  ])
  const fieldsByResource = new Map<string, RawSecurityFieldRecord[]>()
  const fieldsByPolicy = new Map<string, RawSecurityFieldRecord[]>()
  persistedFields.forEach((field) => {
    const resourceId = normalizeId(field.resource_id)
    const policyId = normalizeId(field.policy_id)
    if (resourceId) {
      fieldsByResource.set(resourceId, [...(fieldsByResource.get(resourceId) ?? []), field])
    }
    if (policyId) {
      fieldsByPolicy.set(policyId, [...(fieldsByPolicy.get(policyId) ?? []), field])
    }
  })

  return rows
    .map((row: RawSecurityPolicyRecord) => mapSecurityGovernancePolicy(
      row,
      fieldsByResource.get(normalizeId(row.resource_id)) ?? fieldsByPolicy.get(normalizeId(row.id)) ?? [],
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt, 'zh-CN', { numeric: true }))
}

async function fetchSecurityGovernancePolicyByFilter(
  filter: Record<string, unknown>,
): Promise<SecurityGovernancePolicyRecord | null> {
  const collectionName = await resolveSecurityPolicyCollectionName()
  const response = await nocobaseClient.resource(collectionName).list({
    page: 1,
    pageSize: 1,
    sort: '-updatedAt',
    appends: [...SECURITY_POLICY_APPENDS],
    filter,
  })
  const payload = response.data as RawListResponse<RawSecurityPolicyRecord>
  const row = payload.data?.[0]
  if (!row) return null

  const resourceId = normalizeId(row.resource_id)
  if (!resourceId) return mapSecurityGovernancePolicy(row)

  const fieldResponse = await nocobaseClient.resource(SECURITY_FIELD_COLLECTION).list({
    page: 1,
    pageSize: SECURITY_POLICY_PAGE_SIZE,
    sort: 'seq',
    filter: { resource_id: resourceId },
  })
  const fieldPayload = fieldResponse.data as RawListResponse<RawSecurityFieldRecord>
  return mapSecurityGovernancePolicy(row, fieldPayload.data ?? [])
}

export function clearSecurityGovernanceCache() {
  securityGovernanceCache = null
  securityGovernancePromise = null
}

export async function fetchSecurityGovernancePolicies({ force }: { force?: boolean } = {}) {
  if (force) {
    clearSecurityGovernanceCache()
  }

  if (securityGovernanceCache) {
    return securityGovernanceCache
  }

  if (securityGovernancePromise) {
    return securityGovernancePromise
  }

  const request = fetchSecurityGovernancePoliciesInternal()
    .then((result) => {
      securityGovernanceCache = result
      return result
    })
    .catch((error) => {
      if (!isDemoFallbackEnabled()) {
        throw error
      }

      const fallback = createDemoSecurityPolicies()
      securityGovernanceCache = fallback
      return fallback
    })
    .finally(() => {
      if (securityGovernancePromise === request) {
        securityGovernancePromise = null
      }
    })

  securityGovernancePromise = request
  return request
}

export async function fetchSecurityGovernancePolicyDetail(policyIdOrResourceId: string, resourceOnly = false) {
  const normalizedId = normalizeId(policyIdOrResourceId)
  if (!normalizedId) {
    throw new Error('缺少安全档案标识')
  }

  const cached = securityGovernanceCache?.find((item) => item.resourceId === normalizedId)
    ?? (resourceOnly ? undefined : securityGovernanceCache?.find((item) => item.id === normalizedId))
  if (cached) {
    return cached
  }

  try {
    const byResourceId = await fetchSecurityGovernancePolicyByFilter({ resource_id: normalizedId })
    if (byResourceId) {
      return byResourceId
    }

    if (!resourceOnly) {
      const byPolicyId = await fetchSecurityGovernancePolicyByFilter({ id: normalizedId })
      if (byPolicyId) {
        return byPolicyId
      }
    }
  } catch (error) {
    if (!isDemoFallbackEnabled()) {
      throw error
    }
    const fallback = createDemoSecurityPolicies()
    securityGovernanceCache = fallback
    return fallback.find((item) => item.resourceId === normalizedId)
      ?? (resourceOnly ? null : fallback.find((item) => item.id === normalizedId) ?? null)
  }

  return null
}

export function useSecurityGovernancePolicies(enabled: boolean) {
  const [data, setData] = useState<SecurityGovernancePolicyRecord[]>(() => securityGovernanceCache ?? [])
  const [isLoading, setIsLoading] = useState(() => enabled && !securityGovernanceCache)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    clearSecurityGovernanceCache()
    setIsLoading(true)
    try {
      const rows = await fetchSecurityGovernancePolicies({ force: true })
      setData(rows)
      setError(null)
    } catch (fetchError) {
      setData([])
      setError(toErrorMessage(fetchError, '安全管控数据刷新失败'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    setError(null)
    setIsLoading(!securityGovernanceCache)

    void fetchSecurityGovernancePolicies()
      .then((rows) => {
        if (cancelled) return
        setData(rows)
      })
      .catch((fetchError) => {
        if (cancelled) return
        setData([])
        setError(toErrorMessage(fetchError, '安全管控数据加载失败'))
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return useMemo(
    () => ({
      data,
      isLoading,
      error,
      refresh,
    }),
    [data, error, isLoading, refresh],
  )
}

export function useSecurityGovernancePolicyDetail(policyIdOrResourceId: string | undefined, enabled: boolean, resourceOnly = false) {
  const normalizedId = normalizeId(policyIdOrResourceId)
  const [data, setData] = useState<SecurityGovernancePolicyRecord | null>(null)
  const [isLoading, setIsLoading] = useState(() => enabled && normalizedId.length > 0)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!normalizedId) return null
    setIsLoading(true)
    try {
      const row = await fetchSecurityGovernancePolicyDetail(normalizedId, resourceOnly)
      setData(row)
      setError(row ? null : '未找到对应的安全档案记录')
      return row
    } catch (fetchError) {
      setData(null)
      setError(toErrorMessage(fetchError, '安全档案详情加载失败'))
      return null
    } finally {
      setIsLoading(false)
    }
  }, [normalizedId, resourceOnly])

  useEffect(() => {
    if (!enabled || !normalizedId) return

    let cancelled = false
    const cached = securityGovernanceCache?.find((item) => item.resourceId === normalizedId)
      ?? (resourceOnly ? undefined : securityGovernanceCache?.find((item) => item.id === normalizedId))
    if (cached) {
      setData(cached)
      setError(null)
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }

    void fetchSecurityGovernancePolicyDetail(normalizedId, resourceOnly)
      .then((row) => {
        if (cancelled) return
        setData(row)
        setError(row ? null : '未找到对应的安全档案记录')
      })
      .catch((fetchError) => {
        if (cancelled) return
        setData(null)
        setError(toErrorMessage(fetchError, '安全档案详情加载失败'))
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled, normalizedId, resourceOnly])

  return useMemo(
    () => ({
      data,
      isLoading,
      error,
      refresh,
    }),
    [data, error, isLoading, refresh],
  )
}
