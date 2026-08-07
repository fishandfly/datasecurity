import { nocobaseClient } from './nocobase-client'

export type IntegrityMode = 'inherit' | 'disabled' | 'digest_field'
export type IntegrityFailureAction = 'reject' | 'warn'

export type ResourceIngestValidationConfig = {
  inheritSourceRules: boolean
  samplingOverride: boolean
  samplingEnabled: boolean
  samplingRate: number
  requiredFields: string[]
  numericRanges: Record<string, [number, number]>
  duplicateKeys: string[]
  integrityMode: IntegrityMode
  checksumAlgorithm: 'SM3' | 'SHA-256'
  digestField: string
  checksumFields: string[]
  integrityFailureAction: IntegrityFailureAction
}

export const DEFAULT_RESOURCE_INGEST_VALIDATION_CONFIG: ResourceIngestValidationConfig = {
  inheritSourceRules: true,
  samplingOverride: false,
  samplingEnabled: true,
  samplingRate: 100,
  requiredFields: [],
  numericRanges: {},
  duplicateKeys: [],
  integrityMode: 'inherit',
  checksumAlgorithm: 'SM3',
  digestField: '',
  checksumFields: [],
  integrityFailureAction: 'reject',
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function normalizeFields(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean)))
}

function normalizeRanges(value: unknown) {
  const row = normalizeObject(value)
  const result: Record<string, [number, number]> = {}
  Object.entries(row).forEach(([field, range]) => {
    if (!Array.isArray(range) || range.length < 2) return
    const minimum = Number(range[0])
    const maximum = Number(range[1])
    if (!field.trim() || !Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) return
    result[field.trim()] = [minimum, maximum]
  })
  return result
}

export function parseResourceIngestValidationConfig(value: unknown): ResourceIngestValidationConfig {
  const row = normalizeObject(value)
  const integrityMode = String(row.integrityMode ?? row.integrity_mode ?? 'inherit')
  return {
    inheritSourceRules: normalizeBoolean(row.inheritSourceRules ?? row.inherit_source_rules, true),
    samplingOverride: normalizeBoolean(row.samplingOverride ?? row.sampling_override, false),
    samplingEnabled: normalizeBoolean(row.samplingEnabled ?? row.sampling_enabled, true),
    samplingRate: Math.min(100, Math.max(1, Number(row.samplingRate ?? row.sampling_rate) || 100)),
    requiredFields: normalizeFields(row.requiredFields ?? row.required_fields),
    numericRanges: normalizeRanges(row.numericRanges ?? row.numeric_ranges),
    duplicateKeys: normalizeFields(row.duplicateKeys ?? row.duplicate_keys),
    integrityMode: integrityMode === 'disabled' || integrityMode === 'digest_field' ? integrityMode : 'inherit',
    checksumAlgorithm: String(row.checksumAlgorithm ?? row.checksum_algorithm).toUpperCase() === 'SHA-256' ? 'SHA-256' : 'SM3',
    digestField: String(row.digestField ?? row.digest_field ?? '').trim(),
    checksumFields: normalizeFields(row.checksumFields ?? row.checksum_fields),
    integrityFailureAction: String(row.integrityFailureAction ?? row.integrity_failure_action) === 'warn' ? 'warn' : 'reject',
  }
}

export async function fetchResourceIngestValidationConfig(resourceId: string) {
  const response = await nocobaseClient.resource('eco_data_resources').get({ filterByTk: resourceId })
  const payload = response.data as { data?: { stat_base?: unknown }; stat_base?: unknown }
  const statBase = normalizeObject(payload.data?.stat_base ?? payload.stat_base)
  return parseResourceIngestValidationConfig(statBase.ingest_validation ?? statBase.ingestValidation)
}

export async function saveResourceIngestValidationConfig(resourceId: string, config: ResourceIngestValidationConfig) {
  const response = await nocobaseClient.resource('eco_data_resources').get({ filterByTk: resourceId })
  const payload = response.data as { data?: { stat_base?: unknown }; stat_base?: unknown }
  const statBase = normalizeObject(payload.data?.stat_base ?? payload.stat_base)
  await nocobaseClient.resource('eco_data_resources').update({
    filterByTk: resourceId,
    values: {
      stat_base: {
        ...statBase,
        ingest_validation: config,
      },
    },
  })
}
