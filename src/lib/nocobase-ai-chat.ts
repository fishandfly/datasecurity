import { AI_ASSISTANT_DEFAULT_PROFILE, type AiAssistantProfile } from './ai-assistant'
import { nocobaseClient } from './nocobase-client'

export const NOCOBASE_AI_EMPLOYEE_USERNAME = AI_ASSISTANT_DEFAULT_PROFILE.username

export type NocobaseAiMessageRole = 'user' | string

export type NocobaseAiMessageInput = {
  role: NocobaseAiMessageRole
  content: {
    type: 'text'
    content: string
  }
  attachments?: unknown[]
  workContext?: unknown[]
}

export type NocobaseAiStreamEvent = {
  type: string
  body?: unknown
  errorName?: string
}

export type NocobaseAiModelSelection = {
  llmService: string
  llmServiceTitle?: string
  model: string
  modelLabel?: string
  provider?: string
  providerTitle?: string
  supportWebSearch?: boolean
}

type NocobaseAiEnabledModelService = {
  llmService?: unknown
  llmServiceTitle?: unknown
  provider?: unknown
  providerTitle?: unknown
  enabledModels?: unknown
  supportWebSearch?: unknown
}

type NocobaseAiEnabledModel = {
  label?: unknown
  value?: unknown
}

export type StreamAiEmployeeReplyOptions = {
  sessionId?: string | null
  aiEmployee?: AiAssistantProfile
  message: string
  signal?: AbortSignal
  onSessionId?: (sessionId: string) => void
  onEvent?: (event: NocobaseAiStreamEvent) => void
}

const PORTAL_AI_SYSTEM_MESSAGE = [
  '当前入口是吉林省生态环境数据资源目录前台门户。',
  '请优先围绕数据资源目录、供需对接、场景应用、个人收藏、授权资源等业务问题回答。',
  '回答应使用中文，尽量简洁、可执行。',
].join('\n')

let defaultAiModelPromise: Promise<NocobaseAiModelSelection> | null = null

function getBrowserOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return 'http://localhost:13000'
}

function getBrowserTimezoneOffset() {
  const totalMinutes = -new Date().getTimezoneOffset()
  const sign = totalMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(totalMinutes)
  const hours = String(Math.floor(absMinutes / 60)).padStart(2, '0')
  const minutes = String(absMinutes % 60).padStart(2, '0')

  return `${sign}${hours}:${minutes}`
}

export function buildNocobaseApiActionUrl(action: string) {
  const baseURL = nocobaseClient.axios.defaults.baseURL || '/api/'
  const resolvedBase = new URL(baseURL, getBrowserOrigin())
  return new URL(`./${action}`, resolvedBase).toString()
}

function buildNocobaseFetchHeaders(extra?: Record<string, string>) {
  const headers = new Headers({
    Accept: 'application/json',
    ...extra,
  })

  Object.entries(nocobaseClient.getHeaders() as Record<string, string>).forEach(([key, value]) => {
    if (value && !headers.has(key)) {
      headers.set(key, value)
    }
  })

  if (!headers.has('X-Locale')) {
    headers.set('X-Locale', 'zh-CN')
  }

  if (!headers.has('X-Timezone')) {
    headers.set('X-Timezone', getBrowserTimezoneOffset())
  }

  return headers
}

function dispatchSessionExpiredIfNeeded(status: number) {
  if (status === 401 && typeof window !== 'undefined' && nocobaseClient.auth.token) {
    window.dispatchEvent(new CustomEvent('auth:session-expired'))
  }
}

function extractPayload(value: unknown) {
  if (!value || typeof value !== 'object') return value
  if ('data' in value) return (value as { data?: unknown }).data
  return value
}

function normalizeAiAssistantErrorMessage(message: string, fallback = 'AI 员工回答失败') {
  const normalizedMessage = message.trim()
  if (!normalizedMessage) return fallback

  const normalizedLower = normalizedMessage.toLowerCase()
  if (
    normalizedLower.includes('graph_recursion_limit')
    || normalizedLower.includes('recursion limit')
    || normalizedLower.includes('langgraph')
  ) {
    return '本次回答在推理过程中超出系统步数限制，请缩小问题范围后重试。'
  }

  if (
    normalizedLower.includes('timeout')
    || normalizedLower.includes('timed out')
    || normalizedLower.includes('network error')
  ) {
    return '本次回答处理超时或连接中断，请稍后重试。'
  }

  if (/https?:\/\/\S+/i.test(normalizedMessage) || normalizedMessage.includes('\n')) {
    return fallback
  }

  return normalizedMessage
}

function extractErrorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback

  const payload = value as {
    error?: string | { message?: string }
    errors?: Array<{ message?: string }>
    messages?: Array<{ message?: string }>
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return normalizeAiAssistantErrorMessage(payload.error.trim(), fallback)
  }

  if (payload.error && typeof payload.error === 'object' && payload.error.message) {
    return normalizeAiAssistantErrorMessage(payload.error.message, fallback)
  }

  const message = payload.errors?.[0]?.message ?? payload.messages?.[0]?.message
  return normalizeAiAssistantErrorMessage(message || '', fallback)
}

async function readErrorResponse(response: Response, fallback: string) {
  const text = await response.text().catch(() => '')
  if (!text) return fallback

  try {
    return extractErrorMessage(JSON.parse(text), fallback)
  } catch {
    return normalizeAiAssistantErrorMessage(text.trim(), fallback)
  }
}

export async function createAiEmployeeConversation(aiEmployee: AiAssistantProfile) {
  const response = await fetch(buildNocobaseApiActionUrl('aiConversations:create'), {
    method: 'POST',
    credentials: 'include',
    headers: buildNocobaseFetchHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      aiEmployee: {
        username: aiEmployee.username,
        nickname: aiEmployee.nickname,
        bio: aiEmployee.bio,
        greeting: aiEmployee.greeting,
        avatar: aiEmployee.avatar,
      },
      systemMessage: PORTAL_AI_SYSTEM_MESSAGE,
    }),
  })

  dispatchSessionExpiredIfNeeded(response.status)

  if (!response.ok) {
    throw new Error(await readErrorResponse(response, `AI 员工会话创建失败（${response.status}）`))
  }

  const payload = extractPayload(await response.json().catch(() => null))
  const sessionId =
    payload && typeof payload === 'object' && 'sessionId' in payload
      ? String((payload as { sessionId?: unknown }).sessionId ?? '').trim()
      : ''

  if (!sessionId) {
    throw new Error('AI 员工会话创建失败：未返回 sessionId')
  }

  return sessionId
}

function parseSseBlock(block: string): NocobaseAiStreamEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim()

  if (!data) return null
  if (data === '[DONE]') return { type: 'stream_end' }

  try {
    const parsed = JSON.parse(data) as NocobaseAiStreamEvent
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null
    }
    return parsed
  } catch {
    return {
      type: 'content',
      body: data,
    }
  }
}

export class NocobaseAiSseParser {
  private buffer = ''

  push(chunk: string) {
    this.buffer += chunk
    const events: NocobaseAiStreamEvent[] = []

    let match = this.buffer.match(/\r?\n\r?\n/)
    while (match?.index !== undefined) {
      const block = this.buffer.slice(0, match.index)
      this.buffer = this.buffer.slice(match.index + match[0].length)

      const event = parseSseBlock(block)
      if (event) events.push(event)

      match = this.buffer.match(/\r?\n\r?\n/)
    }

    return events
  }

  flush() {
    if (!this.buffer.trim()) return []

    const event = parseSseBlock(this.buffer)
    this.buffer = ''
    return event ? [event] : []
  }
}

export function extractAiStreamText(body: unknown) {
  if (typeof body === 'string') return body

  if (body && typeof body === 'object') {
    const payload = body as { content?: unknown; text?: unknown; status?: unknown }
    if (payload.status === 'stop') return ''
    if (typeof payload.content === 'string') return payload.content
    if (typeof payload.text === 'string') return payload.text
  }

  return ''
}

function buildUserMessage(message: string): NocobaseAiMessageInput {
  return {
    role: 'user',
    content: {
      type: 'text',
      content: message,
    },
  }
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function pickDefaultAiModel(payload: unknown): NocobaseAiModelSelection | null {
  if (!Array.isArray(payload)) return null

  for (const service of payload as NocobaseAiEnabledModelService[]) {
    if (!service || typeof service !== 'object') continue

    const llmService = readText(service.llmService)
    if (!llmService || !Array.isArray(service.enabledModels)) continue

    const enabledModel = (service.enabledModels as NocobaseAiEnabledModel[])
      .find((model) => readText(model?.value))
    const model = readText(enabledModel?.value)
    if (!model) continue

    return {
      llmService,
      llmServiceTitle: readText(service.llmServiceTitle) || undefined,
      model,
      modelLabel: readText(enabledModel?.label) || model,
      provider: readText(service.provider) || undefined,
      providerTitle: readText(service.providerTitle) || undefined,
      supportWebSearch: typeof service.supportWebSearch === 'boolean' ? service.supportWebSearch : undefined,
    }
  }

  return null
}

export async function fetchDefaultAiModel() {
  defaultAiModelPromise ??= (async () => {
    const response = await fetch(buildNocobaseApiActionUrl('ai:listAllEnabledModels'), {
      method: 'POST',
      credentials: 'include',
      headers: buildNocobaseFetchHeaders({
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({}),
    })

    dispatchSessionExpiredIfNeeded(response.status)

    if (!response.ok) {
      throw new Error(await readErrorResponse(response, `后台可用大模型查询失败（${response.status}）`))
    }

    const defaultModel = pickDefaultAiModel(extractPayload(await response.json().catch(() => null)))
    if (!defaultModel) {
      throw new Error('后台尚未配置可用大模型服务')
    }

    return defaultModel
  })().catch((error) => {
    defaultAiModelPromise = null
    throw error
  })

  return defaultAiModelPromise
}

async function readAiEventStream(response: Response, onEvent?: (event: NocobaseAiStreamEvent) => void) {
  if (!response.body) {
    throw new Error('AI 员工接口未返回可读取的流')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = new NocobaseAiSseParser()

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    for (const event of parser.push(chunk)) {
      onEvent?.(event)
      if (event.type === 'error') {
        throw new Error(normalizeAiAssistantErrorMessage(extractAiStreamText(event.body), 'AI 员工回答失败'))
      }
    }
  }

  const tail = decoder.decode()
  const events = [...(tail ? parser.push(tail) : []), ...parser.flush()]
  for (const event of events) {
    onEvent?.(event)
    if (event.type === 'error') {
      throw new Error(normalizeAiAssistantErrorMessage(extractAiStreamText(event.body), 'AI 员工回答失败'))
    }
  }
}

export async function streamAiEmployeeReply({
  sessionId,
  aiEmployee = AI_ASSISTANT_DEFAULT_PROFILE,
  message,
  signal,
  onSessionId,
  onEvent,
}: StreamAiEmployeeReplyOptions) {
  const nextSessionId = sessionId || (await createAiEmployeeConversation(aiEmployee))
  const defaultModel = await fetchDefaultAiModel()
  onSessionId?.(nextSessionId)

  const response = await fetch(buildNocobaseApiActionUrl('aiConversations:sendMessages'), {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: buildNocobaseFetchHeaders({
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      sessionId: nextSessionId,
      aiEmployee: aiEmployee.username || NOCOBASE_AI_EMPLOYEE_USERNAME,
      messages: [buildUserMessage(message)],
      model: {
        llmService: defaultModel.llmService,
        model: defaultModel.model,
      },
      stream: true,
    }),
  })

  dispatchSessionExpiredIfNeeded(response.status)

  if (!response.ok) {
    throw new Error(await readErrorResponse(response, `AI 员工回答接口请求失败（${response.status}）`))
  }

  await readAiEventStream(response, onEvent)
  return nextSessionId
}

export async function abortAiEmployeeReply(sessionId: string) {
  if (!sessionId) return

  await fetch(buildNocobaseApiActionUrl('aiConversations:abort'), {
    method: 'POST',
    credentials: 'include',
    headers: buildNocobaseFetchHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ sessionId }),
  }).catch(() => undefined)
}
