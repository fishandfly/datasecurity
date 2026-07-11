import { buildCatalogSearchPath } from './catalog-search'
import { buildGlobalSearchPath } from './global-search'

export type AiAssistantIntent = 'general' | 'catalog' | 'favorites' | 'demands' | 'linked' | 'apps'

export type AiAssistantProfile = {
  username: string
  nickname: string
  bio: string
  greeting: string
  avatar: string
}

export type AiAssistantCatalogItem = {
  id: string
  name: string
  summary: string
  category: string
  department: string
  tags: string[]
  updateTime: string
}

export type AiAssistantFavoriteItem = {
  favoriteId: string
  resourceId: string
  name: string
  summary: string
  department: string
  businessCategory: string
  updateTime: string
  detailUrl: string
  favoritedAt: string
  missing: boolean
}

export type AiAssistantDemandItem = {
  id: string
  sceneName: string
  requiredDataResourceName: string
  demandDescription: string
  mainDataItems: string
  dataFrequencyDemandName: string
  linkedResourceIds: string[]
  linkedResourceNames: string[]
}

export type AiAssistantAuthorizedResource = {
  resourceId: string
  resourceName: string
  sceneNames: string[]
  sceneCount: number
}

export type AiAssistantApp = {
  id: string
  title: string
  description: string
  to: string
}

export type AiAssistantCard = {
  id: string
  title: string
  subtitle: string
  description: string
  meta: string[]
  to: string
  actionLabel: string
}

export type AiAssistantAction = {
  label: string
  to: string
}

export type AiAssistantReply = {
  intent: AiAssistantIntent
  answer: string
  cards: AiAssistantCard[]
  actions: AiAssistantAction[]
  suggestions: string[]
}

export type AiAssistantContext = {
  isAuthenticated: boolean
  catalogItems: AiAssistantCatalogItem[]
  favorites: AiAssistantFavoriteItem[]
  demands: AiAssistantDemandItem[]
  authorizedResources: AiAssistantAuthorizedResource[]
  apps: AiAssistantApp[]
}

export const AI_ASSISTANT_DEFAULT_PROFILE: AiAssistantProfile = {
  username: '数据资源目录助手',
  nickname: '吉小数',
  bio: '吉小数，可以为您解答任何与数据资源目录有关的问题。',
  greeting: '你好，我是吉小数，可以为您解答任何与数据资源目录有关的问题。',
  avatar: 'nocobase-054-female',
}

const greetingKeywords = ['你好', '您好', 'hi', 'hello', '在吗', '帮帮我']
const favoriteKeywords = ['收藏', '喜欢', '常用']
const demandKeywords = ['供需', '需求', '场景']
const linkedKeywords = ['授权', '关联资源', '给我的数据资源', '我的数据资源']
const appKeywords = ['应用', '系统入口']
const fillerPhrases = [
  '帮我',
  '看看',
  '查看',
  '查询',
  '搜索',
  '找找',
  '找',
  '一下',
  '一下子',
  '可以',
  '帮忙',
  '我想',
  '请问',
  '哪些',
  '有什么',
  '有没有',
  '有哪些',
  '给我',
  '帮我看',
  '有',
  '吗',
  '呢',
]

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function includesAnyKeyword(source: string, keywords: string[]) {
  return keywords.some((keyword) => source.includes(keyword))
}

function sanitizeQuery(query: string, intent: AiAssistantIntent) {
  let value = query.trim()
  if (!value) return ''

  const phrases = [...fillerPhrases]

  if (intent === 'catalog') {
    phrases.push('资源目录', '数据资源', '资源', '目录', '数据')
  }
  if (intent === 'favorites') {
    phrases.push('我的收藏', '收藏', '我的')
  }
  if (intent === 'demands') {
    phrases.push('供需对接', '供需', '需求', '场景', '我的')
  }
  if (intent === 'linked') {
    phrases.push('授权给我的数据资源', '授权资源', '授权', '关联资源', '给我的', '我的')
  }
  if (intent === 'apps') {
    phrases.push('我的应用', '应用', '入口', '我的')
  }

  const sortedPhrases = Array.from(new Set(phrases)).sort((left, right) => right.length - left.length)

  for (const phrase of sortedPhrases) {
    value = value.replaceAll(phrase, ' ')
  }

  const cleaned = value.replace(/[，。！？、,.!?]/g, ' ').replace(/\s+/g, ' ').trim()

  if (cleaned.length <= 1) {
    return ''
  }

  return cleaned
}

function rankTextMatch(keyword: string, fields: string[]) {
  const normalizedKeyword = normalizeText(keyword)
  if (!normalizedKeyword) return 0

  return fields.reduce((score, field, index) => {
    const normalizedField = normalizeText(field)
    if (!normalizedField) return score

    if (normalizedField === normalizedKeyword) {
      return score + (index === 0 ? 80 : 50)
    }

    if (normalizedField.includes(normalizedKeyword)) {
      return score + (index === 0 ? 50 : 24)
    }

    return score
  }, 0)
}

function buildCatalogCard(item: AiAssistantCatalogItem): AiAssistantCard {
  return {
    id: item.id,
    title: item.name,
    subtitle: item.category || '数据资源',
    description: item.summary || '暂无资源摘要。',
    meta: [`归属单位：${item.department || '未标注'}`, `更新时间：${item.updateTime || '未记录'}`],
    to: `/catalog/${item.id}`,
    actionLabel: '查看资源',
  }
}

function buildFavoriteCard(item: AiAssistantFavoriteItem): AiAssistantCard {
  return {
    id: item.favoriteId,
    title: item.name,
    subtitle: item.businessCategory || '我的收藏',
    description: item.summary || '该收藏资源暂无摘要信息。',
    meta: [`来源单位：${item.department || '未标注'}`, `更新时间：${item.updateTime || '未记录'}`],
    to: item.detailUrl || `/catalog/${item.resourceId}`,
    actionLabel: '查看详情',
  }
}

function buildDemandCard(item: AiAssistantDemandItem): AiAssistantCard {
  return {
    id: item.id,
    title: item.requiredDataResourceName || '未命名需求',
    subtitle: item.sceneName || '供需对接',
    description: item.demandDescription || item.mainDataItems || '暂无需求描述。',
    meta: [
      `期望频次：${item.dataFrequencyDemandName || '未填写'}`,
      `关联资源：${item.linkedResourceNames.length > 0 ? item.linkedResourceNames.join('、') : '暂无'}`,
    ],
    to: buildGlobalSearchPath(`${item.sceneName} ${item.requiredDataResourceName}`.trim()),
    actionLabel: '搜索相关内容',
  }
}

function buildLinkedCard(item: AiAssistantAuthorizedResource): AiAssistantCard {
  return {
    id: item.resourceId,
    title: item.resourceName,
    subtitle: '授权给我的数据资源',
    description: item.sceneNames.length > 0 ? `来源场景：${item.sceneNames.join('、')}` : '当前未记录来源场景。',
    meta: [`来源场景：${item.sceneNames.join('、') || '暂无'}`, `关联场景数：${item.sceneCount}`],
    to: `/catalog/${item.resourceId}`,
    actionLabel: '查看资源',
  }
}

function buildAppCard(item: AiAssistantApp): AiAssistantCard {
  return {
    id: item.id,
    title: item.title,
    subtitle: '我的应用',
    description: item.description,
    meta: ['当前状态：建设中'],
    to: item.to,
    actionLabel: '前往查看',
  }
}

function getFallbackActions(keyword: string) {
  return [
    { label: '去目录搜索', to: buildCatalogSearchPath(keyword) },
    { label: '试试全局搜索', to: buildGlobalSearchPath(keyword) },
  ] satisfies AiAssistantAction[]
}

export function getAiAssistantQuickPrompts(isAuthenticated: boolean) {
  const prompts = ['帮我找空气质量资源', '看看供需对接', '授权给我的数据资源有哪些']

  if (isAuthenticated) {
    prompts.unshift('看看我的收藏')
  }

  prompts.push('我的应用有什么')
  return prompts
}

export function detectAiAssistantIntent(query: string): AiAssistantIntent {
  const normalized = normalizeText(query)

  if (!normalized || includesAnyKeyword(normalized, greetingKeywords)) {
    return 'general'
  }
  if (includesAnyKeyword(normalized, favoriteKeywords)) {
    return 'favorites'
  }
  if (includesAnyKeyword(normalized, linkedKeywords)) {
    return 'linked'
  }
  if (includesAnyKeyword(normalized, demandKeywords)) {
    return 'demands'
  }
  if (includesAnyKeyword(normalized, appKeywords)) {
    return 'apps'
  }

  return 'catalog'
}

function buildWelcomeReply(context: AiAssistantContext): AiAssistantReply {
  const cards = [...context.catalogItems]
    .sort((left, right) => right.updateTime.localeCompare(left.updateTime, 'zh-CN'))
    .slice(0, 4)
    .map((item) => buildCatalogCard(item))

  return {
    intent: 'general',
    answer: '我是吉小数，可以帮你找数据资源、查看我的收藏、供需对接、授权给我的数据资源和应用入口。',
    cards,
    actions: [
      { label: '打开资源目录', to: '/catalog' },
      { label: '进入个人中心', to: '/personal-center' },
    ],
    suggestions: getAiAssistantQuickPrompts(context.isAuthenticated),
  }
}

export function buildAiAssistantReply(query: string, context: AiAssistantContext): AiAssistantReply {
  const intent = detectAiAssistantIntent(query)

  if (intent === 'general') {
    return buildWelcomeReply(context)
  }

  if (intent === 'favorites') {
    const keyword = sanitizeQuery(query, intent)
    const matches = keyword
      ? context.favorites.filter((item) => rankTextMatch(keyword, [item.name, item.summary, item.businessCategory, item.department]) > 0)
      : context.favorites

    if (matches.length === 0) {
      return {
        intent,
        answer: keyword ? `你的收藏里暂时没有“${keyword}”相关资源。` : '你当前还没有收藏资源。',
        cards: [],
        actions: keyword ? getFallbackActions(keyword) : [{ label: '去资源目录看看', to: '/catalog' }],
        suggestions: getAiAssistantQuickPrompts(context.isAuthenticated),
      }
    }

    return {
      intent,
      answer: keyword ? `我在你的收藏里找到了 ${matches.length} 条和“${keyword}”相关的资源。` : `你当前收藏了 ${matches.length} 条资源。`,
      cards: matches.slice(0, 4).map((item) => buildFavoriteCard(item)),
      actions: [{ label: '打开个人中心', to: '/personal-center' }],
      suggestions: getAiAssistantQuickPrompts(context.isAuthenticated),
    }
  }

  if (intent === 'demands') {
    const keyword = sanitizeQuery(query, intent)
    const matches = keyword
      ? context.demands.filter((item) => rankTextMatch(keyword, [item.sceneName, item.requiredDataResourceName, item.demandDescription, item.mainDataItems]) > 0)
      : context.demands

    if (matches.length === 0) {
      return {
        intent,
        answer: keyword ? `当前没有命中“${keyword}”相关的供需对接记录。` : '当前账号暂无供需对接记录。',
        cards: [],
        actions: [{ label: '前往供需对接信息', to: '/demand' }],
        suggestions: getAiAssistantQuickPrompts(context.isAuthenticated),
      }
    }

    return {
      intent,
      answer: keyword ? `我找到了 ${matches.length} 条与“${keyword}”相关的供需对接记录。` : `当前共有 ${matches.length} 条供需对接记录。`,
      cards: matches.slice(0, 4).map((item) => buildDemandCard(item)),
      actions: [{ label: '查看全部供需对接', to: '/personal-center' }],
      suggestions: getAiAssistantQuickPrompts(context.isAuthenticated),
    }
  }

  if (intent === 'linked') {
    const keyword = sanitizeQuery(query, intent)
    const matches = keyword
      ? context.authorizedResources.filter((item) => rankTextMatch(keyword, [item.resourceName, item.sceneNames.join(' ')]) > 0)
      : context.authorizedResources

    if (matches.length === 0) {
      return {
        intent,
        answer: keyword ? `当前没有命中“${keyword}”相关的授权资源。` : '当前账号暂无授权给我的数据资源。',
        cards: [],
        actions: [{ label: '去资源目录看看', to: '/catalog' }],
        suggestions: getAiAssistantQuickPrompts(context.isAuthenticated),
      }
    }

    return {
      intent,
      answer: keyword ? `我找到了 ${matches.length} 条与“${keyword}”相关的授权资源。` : `当前共有 ${matches.length} 条授权给你的数据资源。`,
      cards: matches.slice(0, 4).map((item) => buildLinkedCard(item)),
      actions: [{ label: '打开个人中心', to: '/personal-center' }],
      suggestions: getAiAssistantQuickPrompts(context.isAuthenticated),
    }
  }

  if (intent === 'apps') {
    return {
      intent,
      answer: '我的应用入口还在建设中，后续已申请和已接入的应用会统一汇总到这里。',
      cards: context.apps.slice(0, 4).map((item) => buildAppCard(item)),
      actions: [{ label: '查看个人中心', to: '/personal-center' }],
      suggestions: getAiAssistantQuickPrompts(context.isAuthenticated),
    }
  }

  const keyword = sanitizeQuery(query, 'catalog')
  const matches = keyword
    ? context.catalogItems
        .map((item) => ({
          item,
          score: rankTextMatch(keyword, [item.name, item.summary, item.category, item.department, item.tags.join(' ')]),
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || right.item.updateTime.localeCompare(left.item.updateTime, 'zh-CN'))
        .map((entry) => entry.item)
    : [...context.catalogItems].sort((left, right) => right.updateTime.localeCompare(left.updateTime, 'zh-CN'))

  if (matches.length === 0) {
    return {
      intent: 'catalog',
      answer: `目录里暂时没有命中“${keyword || query.trim()}”相关资源，你可以换个关键词再试一次。`,
      cards: [],
      actions: getFallbackActions(keyword || query.trim()),
      suggestions: getAiAssistantQuickPrompts(context.isAuthenticated),
    }
  }

  return {
    intent: 'catalog',
    answer: keyword ? `我先帮你在数据资源目录里找到了 ${matches.length} 条与“${keyword}”相关的资源。` : '我先给你展示最近更新的数据资源。',
    cards: matches.slice(0, 4).map((item) => buildCatalogCard(item)),
    actions: [
      { label: '查看资源目录', to: keyword ? buildCatalogSearchPath(keyword) : '/catalog' },
      { label: '试试全局搜索', to: keyword ? buildGlobalSearchPath(keyword) : '/search' },
    ],
    suggestions: getAiAssistantQuickPrompts(context.isAuthenticated),
  }
}
