import { nocobaseClient } from './nocobase-client'
import type { DomainCategoryRecord } from './catalog-category-tree'

type CollectionListPayload = {
  data?: Array<{
    name?: string | null
  }>
}

type CollectionFieldListPayload = {
  data?: Array<{
    name?: string | null
  }>
}

type RawTreeNode = Record<string, unknown>

export type NormalizedTreeNode = {
  id: string
  name: string
  parentId: string | null
  typeCode: string
}

let availableCollectionNames: Set<string> | null | undefined
let availableCollectionNamesPromise: Promise<Set<string> | null> | null = null
const availableCollectionFieldNames = new Map<string, Set<string> | null>()
const availableCollectionFieldNamesPromise = new Map<string, Promise<Set<string> | null>>()

function normalizeString(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeId(value: unknown) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

export async function getAvailableCollectionNames() {
  if (availableCollectionNames !== undefined) {
    return availableCollectionNames
  }

  if (availableCollectionNamesPromise) {
    return availableCollectionNamesPromise
  }

  availableCollectionNamesPromise = nocobaseClient
    .resource('collections')
    .list({ page: 1, pageSize: 500 })
    .then((response) => {
      const payload = response?.data as CollectionListPayload | undefined
      const names = new Set<string>()
      ;(payload?.data ?? []).forEach((item) => {
        const name = normalizeString(item?.name)
        if (name) names.add(name)
      })
      availableCollectionNames = names
      return names
    })
    .catch(() => {
      availableCollectionNames = null
      return null
    })
    .finally(() => {
      availableCollectionNamesPromise = null
    })

  return availableCollectionNamesPromise
}

export async function getAvailableFieldNames(collectionName: string) {
  const normalizedCollectionName = normalizeString(collectionName)
  if (!normalizedCollectionName) {
    return null
  }

  if (availableCollectionFieldNames.has(normalizedCollectionName)) {
    return availableCollectionFieldNames.get(normalizedCollectionName) ?? null
  }

  const inflight = availableCollectionFieldNamesPromise.get(normalizedCollectionName)
  if (inflight) {
    return inflight
  }

  const request = nocobaseClient
    .resource('collections.fields', normalizedCollectionName)
    .list({ page: 1, pageSize: 500, paginate: false })
    .then((response) => {
      const payload = response?.data as CollectionFieldListPayload | undefined
      const names = new Set<string>()
      ;(payload?.data ?? []).forEach((item) => {
        const name = normalizeString(item?.name)
        if (name) names.add(name)
      })
      availableCollectionFieldNames.set(normalizedCollectionName, names)
      return names
    })
    .catch(() => {
      availableCollectionFieldNames.set(normalizedCollectionName, null)
      return null
    })
    .finally(() => {
      availableCollectionFieldNamesPromise.delete(normalizedCollectionName)
    })

  availableCollectionFieldNamesPromise.set(normalizedCollectionName, request)
  return request
}

export function resolveCollectionName(
  names: Set<string> | null,
  candidates: readonly [string, ...string[]],
) {
  if (!names) {
    return candidates[0]
  }

  for (const candidate of candidates) {
    if (names.has(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

export function normalizeTreeNode(raw: RawTreeNode): NormalizedTreeNode | null {
  const id = normalizeId(raw.id)
  const name =
    normalizeString(raw.nodeName) ??
    normalizeString(raw.node_name) ??
    normalizeString(raw.name) ??
    normalizeString(raw.label)
  if (!id || !name) {
    return null
  }

  const parentId =
    normalizeId(raw.parentNodeId) ??
    normalizeId(raw.parent_node_id) ??
    normalizeId(raw.parentId) ??
    normalizeId(raw.parent_id)
  const typeCode = normalizeString(raw.typeCode) ?? normalizeString(raw.type_code) ?? ''

  return {
    id,
    name,
    parentId,
    typeCode,
  }
}

export function buildTreeSubsetBySeedIds(nodes: NormalizedTreeNode[], seedIds: string[]) {
  const byId = new Map<string, NormalizedTreeNode>(nodes.map((node) => [node.id, node] as const))
  const includedIds = new Set<string>()

  const includeWithAncestors = (startId: string) => {
    let cursor: string | null = startId
    while (cursor) {
      if (includedIds.has(cursor)) {
        break
      }
      includedIds.add(cursor)
      const parentId: string | null = byId.get(cursor)?.parentId ?? null
      if (!parentId || parentId === cursor) {
        break
      }
      cursor = parentId
    }
  }

  seedIds.forEach((seedId) => {
    if (seedId && byId.has(seedId)) {
      includeWithAncestors(seedId)
    }
  })

  return nodes
    .filter((node) => includedIds.has(node.id))
    .map((node) => ({
      id: node.id,
      name: node.name,
      parentId: node.parentId,
    })) satisfies DomainCategoryRecord[]
}
