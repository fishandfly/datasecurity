import { useEffect, useState } from 'react'
import type { CatalogCategoryTreeNode } from './catalog-category-tree'
import { assertCanManageCatalogResources } from './admin-role'
import { getAvailableCollectionNames, resolveCollectionName } from './nocobase-collections'
import { nocobaseClient, toErrorMessage } from './nocobase-client'
import { loadAllPagesParallel } from './paginated-resource-loader'

type RawAppCatalogRecord = {
  [key: string]: unknown
  id?: unknown
  parentId?: unknown
  seqId?: unknown
  name?: unknown
  tags?: unknown
  contact?: unknown
  description?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  domain_catagory_id?: unknown
  domain_catagory?: unknown
  snapscreen?: unknown
}

export type AppCatalogNode = {
  id: string
  parentId: string | null
  seqId: string
  name: string
  tags: string[]
  contact: string
  description: string
  createdAt: string
  updatedAt: string
  domainCategoryId: string
  domainCategoryName: string
  depth: number
  pathLabel: string
  ancestorIds: string[]
  childCount: number
  descendantCount: number
  displayCount: number
  hasChildren: boolean
  screenshotUrl: string
  screenshotAttachmentIds: string[]
  searchText: string
  children: AppCatalogNode[]
}

export type AppCatalogPortalData = {
  rootItems: AppCatalogNode[]
  flatItems: AppCatalogNode[]
  tree: CatalogCategoryTreeNode[]
}

type CreatePortalAppCatalogEntryParams = {
  name: string
  parentId?: string | null
  seqId?: string
  tags?: string[]
  contact?: string
  description?: string
  domainCategoryId?: string
  screenshotAttachmentId?: string | null
}

type UpdatePortalAppCatalogEntryParams = {
  name: string
  parentId?: string | null
  seqId?: string
  tags?: string[]
  contact?: string
  description?: string
  domainCategoryId?: string
  screenshotAttachmentId?: string | null
}

type RawAttachmentRecord = {
  id?: unknown
  url?: unknown
  preview?: unknown
  filename?: unknown
  title?: unknown
}

type RawMutationResponse = {
  data?: {
    id?: unknown
    data?: {
      id?: unknown
    } | null
  } | null
}

export type PortalAppCatalogScreenshotUploadResult = {
  id: string
  url: string
  previewUrl: string
  filename: string
  title: string
}

type MutableAppCatalogNode = Omit<AppCatalogNode, 'children'> & {
  children: MutableAppCatalogNode[]
  originalIndex: number
}

const APP_COLLECTION_CANDIDATES = ['eco_app'] as const
const EMPTY_APP_CATALOG_DATA: AppCatalogPortalData = {
  rootItems: [],
  flatItems: [],
  tree: [],
}

let appCatalogCache: AppCatalogPortalData | null = null
let appCatalogPromise: Promise<AppCatalogPortalData> | null = null

function normalizeId(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeNullableId(value: unknown) {
  const normalized = normalizeId(value)
  return normalized || null
}

function normalizeText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean)
  }

  const single = normalizeText(value)
  return single ? [single] : []
}

function normalizeUniqueTags(value: string[] | undefined) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => normalizeText(item)).filter(Boolean)))
}

function normalizeRelationValue(value: string | undefined) {
  const normalized = normalizeId(value)
  if (!normalized) return null
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized
}

function normalizeRelationName(value: unknown) {
  if (!value || typeof value !== 'object') {
    return ''
  }

  const relation = value as Record<string, unknown>
  return normalizeText(
    relation.name
      ?? relation.nodeName
      ?? relation.node_name
      ?? relation.label,
  )
}

function normalizeRelationId(value: unknown) {
  if (!value || typeof value !== 'object') {
    return ''
  }

  const relation = value as Record<string, unknown>
  return normalizeId(relation.id)
}

function normalizeUrlText(value: unknown) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  if (!normalized) return ''
  if (
    normalized.startsWith('http://')
    || normalized.startsWith('https://')
    || normalized.startsWith('/')
    || normalized.startsWith('./')
    || normalized.startsWith('../')
    || normalized.startsWith('data:image/')
  ) {
    return normalized
  }
  return ''
}

function resolveMediaUrl(candidate: unknown): string {
  const directUrl = normalizeUrlText(candidate)
  if (directUrl) return directUrl

  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const url = resolveMediaUrl(item)
      if (url) return url
    }
    return ''
  }

  if (!candidate || typeof candidate !== 'object') {
    return ''
  }

  const record = candidate as Record<string, unknown>
  for (const key of ['url', 'src', 'href', 'preview', 'previewUrl', 'thumbnail', 'thumbUrl', 'img']) {
    const url = resolveMediaUrl(record[key])
    if (url) return url
  }

  return ''
}

function resolveAppScreenshotUrl(record: RawAppCatalogRecord) {
  for (const key of [
    'snapscreen',
    'screenshot',
    'screenshotUrl',
    'cover',
    'coverUrl',
    'image',
    'imageUrl',
    'images',
    'thumbnail',
    'thumbnailUrl',
    'app_screenshot',
    'app_cover',
    'app_image',
    'attachment',
    'attachments',
    'file',
    'files',
  ]) {
    const url = resolveMediaUrl(record[key])
    if (url) return url
  }

  return ''
}

function extractAttachmentIds(candidate: unknown) {
  if (Array.isArray(candidate)) {
    return candidate
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return ''
        }
        return normalizeId((item as Record<string, unknown>).id)
      })
      .filter(Boolean)
  }

  if (!candidate || typeof candidate !== 'object') {
    return []
  }

  const id = normalizeId((candidate as Record<string, unknown>).id)
  return id ? [id] : []
}

function normalizeAttachmentUploadResult(record: RawAttachmentRecord): PortalAppCatalogScreenshotUploadResult {
  const id = normalizeId(record.id)
  if (!id) {
    throw new Error('截图上传成功，但未返回附件 ID')
  }

  const previewUrl = normalizeText(record.preview)
  const url = normalizeText(record.url)

  return {
    id,
    url,
    previewUrl: previewUrl || url,
    filename: normalizeText(record.filename),
    title: normalizeText(record.title),
  }
}

function extractMutationRecordId(response: RawMutationResponse | null | undefined) {
  const payload = response?.data
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data) {
    return normalizeId(payload.data.id)
  }

  return normalizeId(payload?.id)
}

async function setPortalAppCatalogScreenshot(
  appCollection: string,
  appId: string,
  screenshotAttachmentId: string | null,
) {
  const normalizedAppId = normalizeId(appId)
  if (!normalizedAppId) {
    throw new Error('未找到场景应用记录，无法更新截图')
  }

  const screenshotAttachmentIds = screenshotAttachmentId
    ? [normalizeRelationValue(screenshotAttachmentId)].filter((value) => value !== null)
    : []

  await nocobaseClient.resource(`${appCollection}.snapscreen`, appId).set({ values: screenshotAttachmentIds })
}

function compareAppNodes(left: MutableAppCatalogNode, right: MutableAppCatalogNode) {
  if (left.seqId && right.seqId) {
    const seqCompare = left.seqId.localeCompare(right.seqId, 'zh-CN', { numeric: true })
    if (seqCompare !== 0) {
      return seqCompare
    }
  } else if (left.seqId || right.seqId) {
    return left.seqId ? -1 : 1
  }

  const nameCompare = left.name.localeCompare(right.name, 'zh-CN', { numeric: true })
  if (nameCompare !== 0) {
    return nameCompare
  }

  return left.originalIndex - right.originalIndex
}

function mapPortalAppRecord(record: RawAppCatalogRecord, index: number): MutableAppCatalogNode | null {
  const id = normalizeId(record.id)
  const name = normalizeText(record.name, '未命名应用')
  if (!id) {
    return null
  }

  const domainCategoryId = normalizeId(record.domain_catagory_id ?? normalizeRelationId(record.domain_catagory))
  const domainCategoryName = normalizeRelationName(record.domain_catagory)

  return {
    id,
    parentId: normalizeNullableId(record.parentId),
    seqId: normalizeText(record.seqId),
    name,
    tags: normalizeTags(record.tags),
    contact: normalizeText(record.contact),
    description: normalizeText(record.description),
    createdAt: normalizeText(record.createdAt),
    updatedAt: normalizeText(record.updatedAt),
    domainCategoryId,
    domainCategoryName,
    depth: 0,
    pathLabel: name,
    ancestorIds: [id],
    childCount: 0,
    descendantCount: 0,
    displayCount: 1,
    hasChildren: false,
    screenshotUrl: resolveAppScreenshotUrl(record),
    screenshotAttachmentIds: extractAttachmentIds(record.snapscreen),
    searchText: name.toLowerCase(),
    children: [],
    originalIndex: index,
  }
}

function toCategoryTreeNode(node: AppCatalogNode): CatalogCategoryTreeNode {
  return {
    id: node.id,
    label: node.name,
    pathLabel: node.pathLabel,
    count: node.displayCount,
    depth: node.depth,
    children: node.children.map((child) => toCategoryTreeNode(child)),
  }
}

export function buildAppCatalogPortalData(records: RawAppCatalogRecord[]): AppCatalogPortalData {
  const mappedNodes = records
    .map((record, index) => mapPortalAppRecord(record, index))
    .filter((node): node is MutableAppCatalogNode => Boolean(node))
  const nodeById = new Map(mappedNodes.map((node) => [node.id, node] as const))
  const rootItems: MutableAppCatalogNode[] = []

  mappedNodes.forEach((node) => {
    const parent = node.parentId ? nodeById.get(node.parentId) : null
    if (!parent || parent.id === node.id) {
      node.parentId = null
      rootItems.push(node)
      return
    }

    parent.children.push(node)
  })

  const visit = (node: MutableAppCatalogNode, parent?: MutableAppCatalogNode) => {
    node.depth = parent ? parent.depth + 1 : 0
    node.pathLabel = parent ? `${parent.pathLabel} / ${node.name}` : node.name
    node.ancestorIds = [...(parent?.ancestorIds ?? []), node.id]
    if (!node.domainCategoryId && parent?.domainCategoryId) {
      node.domainCategoryId = parent.domainCategoryId
    }
    if (!node.domainCategoryName && parent?.domainCategoryName) {
      node.domainCategoryName = parent.domainCategoryName
    }
    node.children.sort(compareAppNodes)
    node.children.forEach((child) => visit(child, node))
    node.childCount = node.children.length
    node.hasChildren = node.childCount > 0
    node.descendantCount = node.children.reduce((sum, child) => sum + child.descendantCount + 1, 0)
    node.displayCount = node.childCount > 0 ? node.childCount : 1
    node.searchText = [
      node.name,
      node.description,
      node.contact,
      node.pathLabel,
      node.domainCategoryName,
      ...node.tags,
    ]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  }

  rootItems.sort(compareAppNodes)
  rootItems.forEach((node) => visit(node))

  const flatItems: AppCatalogNode[] = []
  const flatten = (node: MutableAppCatalogNode) => {
    flatItems.push(node)
    node.children.forEach(flatten)
  }

  rootItems.forEach(flatten)

  return {
    rootItems,
    flatItems,
    tree: rootItems.map((node) => toCategoryTreeNode(node)),
  }
}

async function fetchPortalAppCatalogDataInternal(): Promise<AppCatalogPortalData> {
  const availableCollections = await getAvailableCollectionNames()
  const appCollection = resolveCollectionName(availableCollections, APP_COLLECTION_CANDIDATES)

  if (availableCollections && !availableCollections.has(appCollection)) {
    throw new Error('当前环境未启用场景应用集合 eco_app')
  }

  const appItems = await loadAllPagesParallel(async ({ page, pageSize }) => {
    const response = await nocobaseClient.resource(appCollection).list({
      page,
      pageSize,
      sort: 'seqId',
      appends: ['domain_catagory', 'snapscreen'],
    })
    return response.data as { data: RawAppCatalogRecord[]; meta?: { totalPage?: number } }
  }, 200)

  return buildAppCatalogPortalData(appItems)
}

export function clearPortalAppCatalogCache() {
  appCatalogCache = null
  appCatalogPromise = null
}

export async function fetchPortalAppCatalogData({ force }: { force?: boolean } = {}) {
  if (force) {
    clearPortalAppCatalogCache()
  }

  if (appCatalogCache) {
    return appCatalogCache
  }

  if (appCatalogPromise) {
    return appCatalogPromise
  }

  const request = fetchPortalAppCatalogDataInternal()
    .then((result) => {
      appCatalogCache = result
      return result
    })
    .finally(() => {
      if (appCatalogPromise === request) {
        appCatalogPromise = null
      }
    })

  appCatalogPromise = request
  return request
}

export async function createPortalAppCatalogEntry(params: CreatePortalAppCatalogEntryParams) {
  const availableCollections = await getAvailableCollectionNames()
  const appCollection = resolveCollectionName(availableCollections, APP_COLLECTION_CANDIDATES)

  if (availableCollections && !availableCollections.has(appCollection)) {
    throw new Error('当前环境未启用场景应用集合 eco_app')
  }

  const normalizedName = normalizeText(params.name)
  if (!normalizedName) {
    throw new Error('请填写场景应用名称')
  }

  try {
    const response = await nocobaseClient.resource(appCollection).create({
      values: {
        name: normalizedName,
        parentId: normalizeNullableId(params.parentId),
        seqId: normalizeText(params.seqId),
        tags: normalizeUniqueTags(params.tags),
        contact: normalizeText(params.contact),
        description: normalizeText(params.description),
        domain_catagory_id: normalizeRelationValue(params.domainCategoryId),
      },
    })

    const createdAppId = extractMutationRecordId(response.data as RawMutationResponse | undefined)
    const normalizedScreenshotAttachmentId = normalizeId(params.screenshotAttachmentId)

    if (normalizedScreenshotAttachmentId) {
      if (!createdAppId) {
        throw new Error('场景应用已创建，但未返回应用 ID，无法关联截图')
      }

      try {
        await setPortalAppCatalogScreenshot(appCollection, createdAppId, normalizedScreenshotAttachmentId)
      } catch (screenshotError) {
        try {
          await nocobaseClient.resource(appCollection).destroy({
            filterByTk: normalizeRelationValue(createdAppId) ?? createdAppId,
          })
        } catch (rollbackError) {
          throw new Error(
            `${toErrorMessage(screenshotError, '场景应用截图关联失败')}；且回滚刚创建的场景应用失败：${toErrorMessage(rollbackError, '未知错误')}`,
          )
        }

        throw screenshotError
      }
    }

    clearPortalAppCatalogCache()
    return createdAppId
  } catch (error) {
    throw new Error(toErrorMessage(error, '创建场景应用失败'))
  }
}

export async function uploadPortalAppCatalogScreenshot(file: File) {
  if (!(file instanceof File)) {
    throw new Error('未选择应用截图文件')
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('请上传图片格式的应用截图')
  }

  const formData = new FormData()
  formData.append('file', file)

  try {
    const response = await nocobaseClient.axios.post('/attachments', formData)
    return normalizeAttachmentUploadResult((response.data?.data ?? {}) as RawAttachmentRecord)
  } catch (error) {
    throw new Error(toErrorMessage(error, '上传应用截图失败'))
  }
}

export async function deletePortalAppCatalogAttachment(attachmentId: string) {
  const normalizedAttachmentId = normalizeId(attachmentId)
  if (!normalizedAttachmentId) {
    return
  }

  try {
    await nocobaseClient.resource('attachments').destroy({
      filterByTk: normalizeRelationValue(normalizedAttachmentId) ?? normalizedAttachmentId,
    })
  } catch (error) {
    throw new Error(toErrorMessage(error, '删除应用截图失败'))
  }
}

export async function updatePortalAppCatalogEntry(appId: string, params: UpdatePortalAppCatalogEntryParams) {
  await assertCanManageCatalogResources()

  const availableCollections = await getAvailableCollectionNames()
  const appCollection = resolveCollectionName(availableCollections, APP_COLLECTION_CANDIDATES)

  if (availableCollections && !availableCollections.has(appCollection)) {
    throw new Error('当前环境未启用场景应用集合 eco_app')
  }

  const normalizedAppId = normalizeId(appId)
  const normalizedName = normalizeText(params.name)

  if (!normalizedAppId) {
    throw new Error('未找到场景应用记录，无法保存编辑')
  }

  if (!normalizedName) {
    throw new Error('请填写场景应用名称')
  }

  try {
    await nocobaseClient.resource(appCollection).update({
      filterByTk: normalizeRelationValue(normalizedAppId) ?? normalizedAppId,
      values: {
        name: normalizedName,
        parentId: normalizeNullableId(params.parentId),
        seqId: normalizeText(params.seqId),
        tags: normalizeUniqueTags(params.tags),
        contact: normalizeText(params.contact),
        description: normalizeText(params.description),
        domain_catagory_id: normalizeRelationValue(params.domainCategoryId),
      },
    })

    if (params.screenshotAttachmentId !== undefined) {
      await setPortalAppCatalogScreenshot(appCollection, normalizedAppId, normalizeId(params.screenshotAttachmentId) || null)
    }

    clearPortalAppCatalogCache()
    return normalizedAppId
  } catch (error) {
    throw new Error(toErrorMessage(error, '更新场景应用失败'))
  }
}

export function usePortalAppCatalogData(enabled: boolean) {
  const [data, setData] = useState<AppCatalogPortalData>(appCatalogCache ?? EMPTY_APP_CATALOG_DATA)
  const [isLoadingState, setIsLoadingState] = useState(() => !appCatalogCache)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setIsLoadingState(true)
    try {
      const result = await fetchPortalAppCatalogData({ force: true })
      setData(result)
      setError(null)
      return result
    } catch (err) {
      const message = toErrorMessage(err, '无法从后台获取场景应用数据')
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoadingState(false)
    }
  }

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const fetchData = async () => {
      try {
        const result = await fetchPortalAppCatalogData()
        if (cancelled) return

        setData(result)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(toErrorMessage(err, '无法从后台获取场景应用数据'))
        }
      } finally {
        if (!cancelled) {
          setIsLoadingState(false)
        }
      }
    }

    void fetchData()

    return () => {
      cancelled = true
    }
  }, [enabled])

  const isLoading = enabled && (isLoadingState || (!appCatalogCache && data.flatItems.length === 0 && !error))

  return { data, isLoading, error, reload }
}
