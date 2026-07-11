import { AI_ASSISTANT_DEFAULT_PROFILE, type AiAssistantProfile } from './ai-assistant'
import { nocobaseClient, toErrorMessage } from './nocobase-client'

const AI_ASSISTANT_USERNAME = '数据资源目录助手'

type RawAiEmployee = {
  username?: unknown
  nickname?: unknown
  bio?: unknown
  greeting?: unknown
  avatar?: unknown
}

type RawDataWrapper<T> = {
  data?: T
}

let aiAssistantProfilePromise: Promise<AiAssistantProfile> | null = null

function normalizeText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized || fallback
}

function extractPayload<T>(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const candidate = value as T & RawDataWrapper<T>
  if (candidate.data && typeof candidate.data === 'object') {
    return candidate.data
  }
  return candidate as T
}

function mapAiAssistantProfile(value: unknown): AiAssistantProfile {
  if (!value || typeof value !== 'object') {
    return AI_ASSISTANT_DEFAULT_PROFILE
  }

  const raw = value as RawAiEmployee

  return {
    username: normalizeText(raw.username, AI_ASSISTANT_DEFAULT_PROFILE.username),
    nickname: normalizeText(raw.nickname, AI_ASSISTANT_DEFAULT_PROFILE.nickname),
    bio: normalizeText(raw.bio, AI_ASSISTANT_DEFAULT_PROFILE.bio),
    greeting: normalizeText(raw.greeting, AI_ASSISTANT_DEFAULT_PROFILE.greeting),
    avatar: normalizeText(raw.avatar, AI_ASSISTANT_DEFAULT_PROFILE.avatar),
  }
}

export function clearAiAssistantProfileCache() {
  aiAssistantProfilePromise = null
}

export async function fetchAiAssistantProfile() {
  if (!nocobaseClient.auth.token) {
    return AI_ASSISTANT_DEFAULT_PROFILE
  }

  if (!aiAssistantProfilePromise) {
    aiAssistantProfilePromise = nocobaseClient.resource('aiEmployees')
      .get({
        filterByTk: AI_ASSISTANT_USERNAME,
      })
      .then((response) => mapAiAssistantProfile(extractPayload<RawAiEmployee>(response.data)))
      .catch((error) => {
        throw new Error(toErrorMessage(error, 'AI 助手信息加载失败'))
      })
  }

  try {
    return await aiAssistantProfilePromise
  } catch {
    aiAssistantProfilePromise = null
    return AI_ASSISTANT_DEFAULT_PROFILE
  }
}
