const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}

function normalizeEnvToken(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .split(/[\s:：]+/, 1)[0]
}

export function normalizePortalAiAssistantEnabled(value: string | null | undefined): boolean {
  const normalizedToken = normalizeEnvToken(value)

  return ['1', 'true', 'yes', 'on', 'y', 'shi', '是'].includes(normalizedToken)
}

export const PORTAL_AI_ASSISTANT_ENABLED =
  normalizePortalAiAssistantEnabled(env.VITE_PORTAL_AI_ASSISTANT_ENABLED)
