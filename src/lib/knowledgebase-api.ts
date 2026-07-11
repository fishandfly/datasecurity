import { useEffect, useMemo, useState } from 'react'
import { nocobaseClient, toErrorMessage } from './nocobase-client'
import { loadAllPagesParallel } from './paginated-resource-loader'

type RawKnowledgeType = {
  id?: unknown
  nodeCode?: unknown
  nodeName?: unknown
}

type RawKnowledgeDocumentRecord = {
  id?: unknown
  title?: unknown
  filename?: unknown
  extname?: unknown
  size?: unknown
  path?: unknown
  url?: unknown
  preview?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  knowledge_type_id?: unknown
  knowledge_type?: RawKnowledgeType | null
  base_info?: unknown
  source_info?: unknown
  content?: unknown
}

type RawKnowledgeDocumentListResponse = {
  data?: RawKnowledgeDocumentRecord[]
  meta?: {
    count?: number
    page?: number
    pageSize?: number
    totalPage?: number
  }
}

export type KnowledgeDocumentManifestItem = {
  id: string
  relativePath: string
  title: string
  rootCategory: string
  categoryPathSegments: string[]
  categoryPathLabel: string
  year: string
  extension: string
  size: number
  updatedAt: string
  createdAt: string
  fileUrl: string
  previewUrl: string
  knowledgeTypeId: string
  knowledgeTypeCode: string
  knowledgeTypeName: string
  sourceUrl: string
  sourceName: string
  excerpt: string
  baseInfo: Record<string, unknown> | null
  sourceInfo: Record<string, unknown> | null
}

export type KnowledgeDocumentManifest = {
  generatedAt: string
  totalCount: number
  rootCategoryCounts: Array<{ id: string; label: string; count: number }>
  yearCounts: Array<{ id: string; label: string; count: number }>
  items: KnowledgeDocumentManifestItem[]
}

export type KnowledgeDocumentSearchItem = KnowledgeDocumentManifestItem & {
  excerpt: string
  matchScope: 'title' | 'content' | 'both'
}

export type KnowledgeDocumentSearchResponse = {
  keyword: string
  category: string
  year: string
  page: number
  pageSize: number
  total: number
  items: KnowledgeDocumentSearchItem[]
}

export type KnowledgeDocumentDetail = {
  item: KnowledgeDocumentManifestItem | null
  summaryMarkdown: string
  paragraphPreview: string[]
  contentLength: number
}

type AsyncState<T> = {
  data: T
  isLoading: boolean
  error: string | null
}

type DocumentPageResponse = {
  items: KnowledgeDocumentManifestItem[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

type KnowledgeDocumentQueryParams = {
  category?: string
  year?: string
  keyword?: string
  page?: number
  pageSize?: number
  documentId?: string
}

const KNOWLEDGE_DOCUMENT_COLLECTION = 'eco_knowledge_base'
const KNOWLEDGE_DOCUMENT_LIST_FIELDS = [
  'id',
  'title',
  'filename',
  'extname',
  'size',
  'path',
  'url',
  'preview',
  'createdAt',
  'updatedAt',
  'knowledge_type_id',
  'base_info',
  'source_info',
] as const
const KNOWLEDGE_DOCUMENT_DETAIL_FIELDS = [
  ...KNOWLEDGE_DOCUMENT_LIST_FIELDS,
  'content',
] as const
const KNOWLEDGE_DOCUMENT_APPENDS = ['knowledge_type'] as const
const DEFAULT_MANIFEST_PAGE_SIZE = 200

const EMPTY_MANIFEST: KnowledgeDocumentManifest = {
  generatedAt: '',
  totalCount: 0,
  rootCategoryCounts: [],
  yearCounts: [],
  items: [],
}

const EMPTY_SEARCH_RESPONSE: KnowledgeDocumentSearchResponse = {
  keyword: '',
  category: '',
  year: '',
  page: 1,
  pageSize: 24,
  total: 0,
  items: [],
}

const EMPTY_DETAIL: KnowledgeDocumentDetail = {
  item: null,
  summaryMarkdown: '',
  paragraphPreview: [],
  contentLength: 0,
}

let manifestCache: KnowledgeDocumentManifest | null = null
let manifestPromise: Promise<KnowledgeDocumentManifest> | null = null

function encodeBase64Url(value: string) {
  const encoded = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  )
  const base64 = btoa(encoded)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const decoded = atob(padded)
  const percentEncoded = Array.from(decoded)
    .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .join('')
  return decodeURIComponent(percentEncoded)
}

function normalizeId(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizeObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function normalizeDateText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized
}

function normalizeKnowledgeType(value: RawKnowledgeType | null | undefined) {
  return {
    id: normalizeId(value?.id),
    nodeCode: normalizeText(value?.nodeCode),
    nodeName: normalizeText(value?.nodeName),
  }
}

function resolveDocumentYear(baseInfo: Record<string, unknown> | null, fallbackDate: string) {
  const dateCandidates = [
    normalizeText(baseInfo?.gbrq),
    normalizeText(baseInfo?.sxrq),
    normalizeDateText(fallbackDate),
  ]
  for (const candidate of dateCandidates) {
    const match = candidate.match(/\b(19|20)\d{2}\b/)
    if (match) {
      return match[0]
    }
  }
  return ''
}

function resolveRootCategory(baseInfo: Record<string, unknown> | null, knowledgeTypeName: string) {
  return normalizeText(baseInfo?.source_category_name)
    || normalizeText(baseInfo?.flxz)
    || knowledgeTypeName
    || '未标注分类'
}

function resolveCategoryPathSegments(rootCategory: string, knowledgeTypeName: string) {
  const segments = [knowledgeTypeName, rootCategory]
    .map((item) => item.trim())
    .filter(Boolean)
  return Array.from(new Set(segments))
}

function resolveSourceInfo(sourceInfo: Record<string, unknown> | null) {
  return {
    sourceName: normalizeText(sourceInfo?.source_name),
    sourceUrl: normalizeText(sourceInfo?.source_url),
  }
}

function resolveDocumentExcerpt(baseInfo: Record<string, unknown> | null, sourceInfo: Record<string, unknown> | null) {
  const textCandidates = [
    normalizeText(baseInfo?.title),
    normalizeText(baseInfo?.zdjgName),
    normalizeText(baseInfo?.source_category_name),
    normalizeText(sourceInfo?.source_name),
  ].filter(Boolean)
  return textCandidates.join(' · ')
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/%2F/g, '/')
}

function buildDocumentFileUrl(record: RawKnowledgeDocumentRecord) {
  const baseInfo = normalizeObject(record.base_info)
  const contentOnly = baseInfo?.content_only === true || normalizeText(baseInfo?.source_format).toLowerCase() === 'html'
  if (contentOnly) return ''
  const url = normalizeText(record.url)
  const preview = normalizeText(record.preview)
  if (url && /\.[a-z0-9]+($|\?)/i.test(url)) return url
  if (preview && /\.[a-z0-9]+($|\?)/i.test(preview)) return preview
  const filename = normalizeText(record.filename)
  const path = normalizeText(record.path).replace(/^\/+|\/+$/g, '')
  const baseUrl = url || preview
  if (!baseUrl || !filename) return ''

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  const pathPrefix = path ? `/${encodePathSegment(path)}` : ''
  return `${normalizedBaseUrl}${pathPrefix}/${encodePathSegment(filename)}`
  return ''
}

function mapKnowledgeDocumentRecord(record: RawKnowledgeDocumentRecord): KnowledgeDocumentManifestItem {
  const id = normalizeId(record.id)
  const baseInfo = normalizeObject(record.base_info)
  const sourceInfo = normalizeObject(record.source_info)
  const knowledgeType = normalizeKnowledgeType(record.knowledge_type)
  const contentOnly = baseInfo?.content_only === true || normalizeText(baseInfo?.source_format).toLowerCase() === 'html'
  const extension = contentOnly ? 'html' : normalizeText(record.extname).replace(/^\./, '').toLowerCase()
  const updatedAt = normalizeDateText(record.updatedAt)
  const createdAt = normalizeDateText(record.createdAt)
  const rootCategory = resolveRootCategory(baseInfo, knowledgeType.nodeName)
  const categoryPathSegments = resolveCategoryPathSegments(rootCategory, knowledgeType.nodeName)
  const fileUrl = buildDocumentFileUrl(record)
  const source = resolveSourceInfo(sourceInfo)

  return {
    id,
    relativePath: id,
    title: normalizeText(record.title, '未命名文档'),
    rootCategory,
    categoryPathSegments,
    categoryPathLabel: categoryPathSegments.join(' / ') || '未标注分类',
    year: resolveDocumentYear(baseInfo, updatedAt || createdAt),
    extension: extension || 'file',
    size: normalizeNumber(record.size),
    updatedAt,
    createdAt,
    fileUrl,
    previewUrl: fileUrl,
    knowledgeTypeId: normalizeId(record.knowledge_type_id) || knowledgeType.id,
    knowledgeTypeCode: knowledgeType.nodeCode,
    knowledgeTypeName: knowledgeType.nodeName,
    sourceUrl: source.sourceUrl,
    sourceName: source.sourceName,
    excerpt: resolveDocumentExcerpt(baseInfo, sourceInfo),
    baseInfo,
    sourceInfo,
  }
}

function buildManifest(items: KnowledgeDocumentManifestItem[]): KnowledgeDocumentManifest {
  const rootCategoryMap = new Map<string, number>()
  const yearMap = new Map<string, number>()

  items.forEach((item) => {
    const rootCategory = item.rootCategory || '未标注分类'
    rootCategoryMap.set(rootCategory, (rootCategoryMap.get(rootCategory) ?? 0) + 1)
    if (item.year) {
      yearMap.set(item.year, (yearMap.get(item.year) ?? 0) + 1)
    }
  })

  const rootCategoryCounts = Array.from(rootCategoryMap.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .map(([label, count]) => ({ id: label, label, count }))

  const yearCounts = Array.from(yearMap.entries())
    .sort((left, right) => Number(right[0]) - Number(left[0]))
    .map(([label, count]) => ({ id: label, label, count }))

  return {
    generatedAt: new Date().toISOString(),
    totalCount: items.length,
    rootCategoryCounts,
    yearCounts,
    items,
  }
}

function buildQueryFilter(params: KnowledgeDocumentQueryParams) {
  const andConditions: Array<Record<string, unknown>> = [
    { extname: { $ne: '.md' } },
  ]

  if (params.documentId) {
    andConditions.push({ id: { $eq: params.documentId } })
  }

  if (params.category) {
    andConditions.push({
      $or: [
        { knowledge_type: { nodeName: { $eq: params.category } } },
        { base_info: { source_category_name: { $eq: params.category } } },
        { base_info: { flxz: { $eq: params.category } } },
      ],
    })
  }

  if (params.year) {
    andConditions.push({
      $or: [
        { base_info: { gbrq: { $includes: params.year } } },
        { base_info: { sxrq: { $includes: params.year } } },
        { updatedAt: { $includes: params.year } },
        { createdAt: { $includes: params.year } },
      ],
    })
  }

  const keyword = normalizeText(params.keyword)
  if (keyword) {
    andConditions.push({
      $or: [
        { title: { $includes: keyword } },
        { content: { $includes: keyword } },
        { base_info: { title: { $includes: keyword } } },
        { base_info: { source_category_name: { $includes: keyword } } },
        { source_info: { source_name: { $includes: keyword } } },
      ],
    })
  }

  if (andConditions.length === 1) {
    return andConditions[0]
  }

  return { $and: andConditions }
}

function buildDocumentPagePayload(payload: RawKnowledgeDocumentListResponse | null | undefined): DocumentPageResponse {
  const items = (payload?.data ?? []).map(mapKnowledgeDocumentRecord)
  const totalCount = normalizeNumber(payload?.meta?.count)
  const page = normalizeNumber(payload?.meta?.page) || 1
  const pageSize = normalizeNumber(payload?.meta?.pageSize) || items.length || 1
  const totalPages = normalizeNumber(payload?.meta?.totalPage) || 1
  return { items, totalCount, page, pageSize, totalPages }
}

async function listKnowledgeDocuments(params: KnowledgeDocumentQueryParams) {
  const response = await nocobaseClient.resource(KNOWLEDGE_DOCUMENT_COLLECTION).list({
    page: params.page ?? 1,
    pageSize: params.pageSize ?? DEFAULT_MANIFEST_PAGE_SIZE,
    sort: ['-updatedAt', '-id'],
    fields: [...KNOWLEDGE_DOCUMENT_LIST_FIELDS],
    appends: [...KNOWLEDGE_DOCUMENT_APPENDS],
    filter: buildQueryFilter(params),
  })
  return buildDocumentPagePayload(response.data as RawKnowledgeDocumentListResponse)
}

async function getKnowledgeDocumentDetail(documentId: string) {
  const response = await nocobaseClient.resource(KNOWLEDGE_DOCUMENT_COLLECTION).list({
    page: 1,
    pageSize: 1,
    sort: ['-updatedAt', '-id'],
    fields: [...KNOWLEDGE_DOCUMENT_DETAIL_FIELDS],
    appends: [...KNOWLEDGE_DOCUMENT_APPENDS],
    filter: buildQueryFilter({ documentId }),
  })
  const payload = response.data as RawKnowledgeDocumentListResponse
  const rawItem = payload.data?.[0] ?? null
  if (!rawItem) {
    return EMPTY_DETAIL
  }
  const item = mapKnowledgeDocumentRecord(rawItem)
  const content = normalizeText(rawItem.content)
  const paragraphPreview = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter((paragraph) => !/^#\s+/.test(paragraph))
    .filter((paragraph) => !/^-\s*(发布日期|公布日期|施行日期|信息来源|来源|作者|原文链接)[:：]/.test(paragraph))
    .slice(0, 6)

  return {
    item,
    summaryMarkdown: paragraphPreview.join('\n\n'),
    paragraphPreview,
    contentLength: content.length,
  }
}

async function fetchKnowledgebaseManifest() {
  if (manifestCache) return manifestCache
  if (manifestPromise) return manifestPromise

  manifestPromise = (async () => {
    const rows = await loadAllPagesParallel<KnowledgeDocumentManifestItem>(async ({ page, pageSize }) => {
      const payload = await listKnowledgeDocuments({ page, pageSize })
      return {
        data: payload.items,
        meta: {
          totalPage: payload.totalPages,
        },
      }
    }, DEFAULT_MANIFEST_PAGE_SIZE)

    const manifest = buildManifest(rows)
    manifestCache = manifest
    manifestPromise = null
    return manifest
  })().catch((error) => {
    manifestPromise = null
    throw error
  })

  return manifestPromise
}

function resolveMatchScope(item: KnowledgeDocumentManifestItem, keyword: string): 'title' | 'content' | 'both' {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return 'content'
  const titleMatched = item.title.toLowerCase().includes(normalizedKeyword)
  const excerptMatched = item.excerpt.toLowerCase().includes(normalizedKeyword)
  if (titleMatched && excerptMatched) return 'both'
  if (titleMatched) return 'title'
  return 'content'
}

export function encodeKnowledgeDocumentId(relativePath: string) {
  return encodeBase64Url(relativePath)
}

export function decodeKnowledgeDocumentId(encodedId: string) {
  if (!encodedId.trim()) return ''
  try {
    return decodeBase64Url(encodedId)
  } catch {
    return ''
  }
}

export function useKnowledgebaseManifest(): AsyncState<KnowledgeDocumentManifest> {
  const [state, setState] = useState<{
    ready: boolean
    data: KnowledgeDocumentManifest
    error: string | null
  }>({
    ready: false,
    data: EMPTY_MANIFEST,
    error: null,
  })

  useEffect(() => {
    let active = true

    fetchKnowledgebaseManifest()
      .then((data) => {
        if (!active) return
        setState({ ready: true, data, error: null })
      })
      .catch((error) => {
        if (!active) return
        setState({
          ready: true,
          data: EMPTY_MANIFEST,
          error: toErrorMessage(error, '知识文档清单加载失败'),
        })
      })

    return () => {
      active = false
    }
  }, [])

  return {
    data: state.data,
    isLoading: !state.ready,
    error: state.error,
  }
}

export function useKnowledgebaseSearch(
  params: {
    keyword: string
    category: string
    year: string
    page: number
    pageSize: number
  },
): AsyncState<KnowledgeDocumentSearchResponse> {
  const normalizedKeyword = params.keyword.trim()
  const requestKey = JSON.stringify({
    keyword: normalizedKeyword,
    category: params.category,
    year: params.year,
    page: params.page,
    pageSize: params.pageSize,
  })

  const idleData = useMemo(() => ({
    ...EMPTY_SEARCH_RESPONSE,
    category: params.category,
    year: params.year,
    page: params.page,
    pageSize: params.pageSize,
  }), [params.category, params.page, params.pageSize, params.year])

  const [state, setState] = useState<{
    requestKey: string
    data: KnowledgeDocumentSearchResponse
    error: string | null
  }>({
    requestKey: '',
    data: idleData,
    error: null,
  })

  useEffect(() => {
    if (!normalizedKeyword) {
      return
    }

    let active = true

    listKnowledgeDocuments({
      keyword: normalizedKeyword,
      category: params.category,
      year: params.year,
      page: params.page,
      pageSize: params.pageSize,
    })
      .then((payload) => {
        if (!active) return
        setState({
          requestKey,
          data: {
            keyword: normalizedKeyword,
            category: params.category,
            year: params.year,
            page: payload.page,
            pageSize: payload.pageSize,
            total: payload.totalCount,
            items: payload.items.map((item) => ({
              ...item,
              matchScope: resolveMatchScope(item, normalizedKeyword),
            })),
          },
          error: null,
        })
      })
      .catch((error) => {
        if (!active) return
        setState({
          requestKey,
          data: {
            ...idleData,
            keyword: normalizedKeyword,
          },
          error: toErrorMessage(error, '知识文档检索失败'),
        })
      })

    return () => {
      active = false
    }
  }, [idleData, normalizedKeyword, params.category, params.page, params.pageSize, params.year, requestKey])

  if (!normalizedKeyword) {
    return {
      data: idleData,
      isLoading: false,
      error: null,
    }
  }

  return {
    data: state.requestKey === requestKey ? state.data : {
      ...idleData,
      keyword: normalizedKeyword,
    },
    isLoading: state.requestKey !== requestKey,
    error: state.requestKey === requestKey ? state.error : null,
  }
}

export function useKnowledgebaseDocumentDetail(relativePath: string): AsyncState<KnowledgeDocumentDetail> {
  const normalizedRelativePath = relativePath.trim()
  const [state, setState] = useState<{
    requestKey: string
    data: KnowledgeDocumentDetail
    error: string | null
  }>({
    requestKey: '',
    data: EMPTY_DETAIL,
    error: null,
  })

  useEffect(() => {
    if (!normalizedRelativePath) {
      return
    }

    let active = true

    getKnowledgeDocumentDetail(normalizedRelativePath)
      .then((data) => {
        if (!active) return
        setState({
          requestKey: normalizedRelativePath,
          data,
          error: null,
        })
      })
      .catch((error) => {
        if (!active) return
        setState({
          requestKey: normalizedRelativePath,
          data: EMPTY_DETAIL,
          error: toErrorMessage(error, '知识文档详情加载失败'),
        })
      })

    return () => {
      active = false
    }
  }, [normalizedRelativePath])

  if (!normalizedRelativePath) {
    return {
      data: EMPTY_DETAIL,
      isLoading: false,
      error: null,
    }
  }

  return {
    data: state.requestKey === normalizedRelativePath ? state.data : EMPTY_DETAIL,
    isLoading: state.requestKey !== normalizedRelativePath,
    error: state.requestKey === normalizedRelativePath ? state.error : null,
  }
}
