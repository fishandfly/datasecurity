import { useEffect, useState } from 'react'
import { getAvailableCollectionNames } from './nocobase-collections'
import { nocobaseClient, toErrorMessage } from './nocobase-client'
import { loadAllPagesParallel } from './paginated-resource-loader'

export const TAG_GENERATION_POLICY_COLLECTION = 'jcTagGenerationPolicies'
const TAG_GENERATION_POLICY_PAGE_SIZE = 200

type RawTagGenerationPolicyRecord = {
  id?: number | string | null
  title?: string | null
  enabled?: boolean | null
  dataSourceKey?: string | null
  collectionName?: string | null
  fieldName?: string | null
  logic?: string | null
  rules?: unknown
  tags?: unknown
  sort?: number | string | null
  remark?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type RawListResponse<T> = {
  data?: T[]
  meta?: {
    totalPage?: number
  }
}

export type FieldTagGenerationRule = {
  fieldName: string
  operator: string
  value: string
}

export type FieldTagGenerationPolicyRecord = {
  id: string
  title: string
  enabled: boolean
  dataSourceKey: string
  collectionName: string
  fieldName: string
  logic: 'and' | 'or'
  rules: FieldTagGenerationRule[]
  tags: string[]
  sort: number
  remark: string
  createdAt: string
  updatedAt: string
}

let fieldTagPolicyCache: FieldTagGenerationPolicyRecord[] | null = null
let fieldTagPolicyPromise: Promise<FieldTagGenerationPolicyRecord[]> | null = null

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = normalizeText(value).toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => normalizeText(item)).filter(Boolean)))
}

function parseRules(value: unknown): FieldTagGenerationRule[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const fieldName = normalizeText(row.fieldName ?? row.field_name)
      const operator = normalizeText(row.operator || 'eq')
      const ruleValue = normalizeText(row.value)
      if (!fieldName || !operator) return null
      return { fieldName, operator, value: ruleValue }
    })
    .filter((item): item is FieldTagGenerationRule => Boolean(item))
}

function mapTagGenerationPolicy(record: RawTagGenerationPolicyRecord): FieldTagGenerationPolicyRecord {
  return {
    id: normalizeText(record.id),
    title: normalizeText(record.title),
    enabled: normalizeBoolean(record.enabled),
    dataSourceKey: normalizeText(record.dataSourceKey || 'main'),
    collectionName: normalizeText(record.collectionName),
    fieldName: normalizeText(record.fieldName),
    logic: normalizeText(record.logic).toLowerCase() === 'or' ? 'or' : 'and',
    rules: parseRules(record.rules),
    tags: normalizeStringArray(record.tags),
    sort: normalizeNumber(record.sort),
    remark: normalizeText(record.remark),
    createdAt: normalizeText(record.createdAt),
    updatedAt: normalizeText(record.updatedAt),
  }
}

async function fetchFieldTagGenerationPoliciesInternal() {
  const availableCollections = await getAvailableCollectionNames()
  if (availableCollections && !availableCollections.has(TAG_GENERATION_POLICY_COLLECTION)) {
    return []
  }

  const rows = await loadAllPagesParallel(async ({ page, pageSize }) => {
    const response = await nocobaseClient.resource(TAG_GENERATION_POLICY_COLLECTION).list({
      page,
      pageSize,
      sort: 'sort',
    })
    const payload = response.data as RawListResponse<RawTagGenerationPolicyRecord>
    return {
      data: payload.data ?? [],
      meta: payload.meta,
    }
  }, TAG_GENERATION_POLICY_PAGE_SIZE)

  return rows
    .map((row) => mapTagGenerationPolicy(row))
    .filter((row) => row.id && row.title && row.collectionName && row.fieldName && row.tags.length > 0)
    .sort((left, right) => left.sort - right.sort || left.title.localeCompare(right.title, 'zh-CN'))
}

export function clearFieldTagGenerationPolicyCache() {
  fieldTagPolicyCache = null
  fieldTagPolicyPromise = null
}

export type SaveFieldTagGenerationPolicyInput = Omit<FieldTagGenerationPolicyRecord, 'id' | 'createdAt' | 'updatedAt'>

function toFieldTagGenerationPolicyValues(input: SaveFieldTagGenerationPolicyInput) {
  return {
    title: input.title.trim(),
    enabled: input.enabled,
    dataSourceKey: input.dataSourceKey.trim() || 'main',
    collectionName: input.collectionName.trim(),
    fieldName: input.fieldName.trim(),
    logic: input.logic,
    rules: input.rules
      .map((rule) => ({
        fieldName: rule.fieldName.trim(),
        operator: rule.operator.trim() || 'eq',
        value: rule.value.trim(),
      }))
      .filter((rule) => rule.fieldName),
    tags: Array.from(new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))),
    sort: input.sort,
    remark: input.remark.trim(),
  }
}

export async function saveFieldTagGenerationPolicy(
  id: string,
  input: SaveFieldTagGenerationPolicyInput,
) {
  const values = toFieldTagGenerationPolicyValues(input)
  if (!values.title || !values.collectionName || !values.fieldName || !values.tags.length) {
    throw new Error('请完整填写标签规则的名称、目标对象、标签字段和标签名称')
  }

  if (id) {
    await nocobaseClient.resource(TAG_GENERATION_POLICY_COLLECTION).update({ filterByTk: id, values })
  } else {
    await nocobaseClient.resource(TAG_GENERATION_POLICY_COLLECTION).create({ values })
  }
  clearFieldTagGenerationPolicyCache()
}

export async function deleteFieldTagGenerationPolicy(id: string) {
  if (!id) return
  await nocobaseClient.resource(TAG_GENERATION_POLICY_COLLECTION).destroy({ filterByTk: id })
  clearFieldTagGenerationPolicyCache()
}

export async function fetchFieldTagGenerationPolicies({ force }: { force?: boolean } = {}) {
  if (force) {
    clearFieldTagGenerationPolicyCache()
  }

  if (fieldTagPolicyCache) {
    return fieldTagPolicyCache
  }

  if (fieldTagPolicyPromise) {
    return fieldTagPolicyPromise
  }

  const request = fetchFieldTagGenerationPoliciesInternal()
    .then((result) => {
      fieldTagPolicyCache = result
      return result
    })
    .finally(() => {
      if (fieldTagPolicyPromise === request) {
        fieldTagPolicyPromise = null
      }
    })

  fieldTagPolicyPromise = request
  return request
}

export function useFieldTagGenerationPolicies(enabled: boolean) {
  const [data, setData] = useState<FieldTagGenerationPolicyRecord[]>(fieldTagPolicyCache ?? [])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(() => enabled && !fieldTagPolicyCache)

  useEffect(() => {
    let cancelled = false

    if (!enabled) {
      setData([])
      setError(null)
      setIsLoading(false)
      return () => {
        cancelled = true
      }
    }

    if (fieldTagPolicyCache) {
      setData(fieldTagPolicyCache)
      setError(null)
      setIsLoading(false)
      return () => {
        cancelled = true
      }
    }

    setIsLoading(true)
    fetchFieldTagGenerationPolicies()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
      })
      .catch((caught) => {
        if (cancelled) return
        setData([])
        setError(toErrorMessage(caught, '读取标签插件策略失败'))
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

  const refresh = async () => {
    setIsLoading(true)
    try {
      const result = await fetchFieldTagGenerationPolicies({ force: true })
      setData(result)
      setError(null)
    } catch (caught) {
      setError(toErrorMessage(caught, '读取标签规则失败'))
    } finally {
      setIsLoading(false)
    }
  }

  return { data, error, isLoading, refresh }
}
