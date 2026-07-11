import { Bot, LoaderCircle, MessageCircle, RefreshCw, Send, Sparkles, Square, X } from 'lucide-react'
import { startTransition, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AI_ASSISTANT_DEFAULT_PROFILE, getAiAssistantQuickPrompts } from '../lib/ai-assistant'
import {
  abortAiEmployeeReply,
  extractAiStreamText,
  streamAiEmployeeReply,
} from '../lib/nocobase-ai-chat'
import { fetchAiAssistantProfile } from '../lib/nocobase-ai-assistant'
import { usePortalContext } from '../lib/portal-context'
import { cn } from '../lib/utils'

const NOCOBASE_AI_AVATAR = '/static/plugins/@nocobase/plugin-ai/dist/client/f0053e745af0ad03.svg'
const AI_ASSISTANT_OPEN_EVENT = 'jl-ai-assistant-open-change'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  status?: 'streaming' | 'done' | 'error'
  progressSteps?: string[]
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isAbortError(error: unknown) {
  return (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
}

function appendAssistantContent(messages: ChatMessage[], messageId: string, content: string) {
  return messages.map((message) => (
    message.id === messageId
      ? { ...message, content: `${message.content}${content}`, status: 'streaming' as const }
      : message
  ))
}

function updateAssistantStatus(messages: ChatMessage[], messageId: string, status: ChatMessage['status'], fallbackContent?: string) {
  return messages.map((message) => {
    if (message.id !== messageId) return message

    return {
      ...message,
      status,
      content: message.content || fallbackContent || message.content,
    }
  })
}

function normalizeProgressStep(step: string) {
  return step
    .replace(/\s+/g, ' ')
    .replace(/^[-*]\s*/, '')
    .trim()
}

function shortenProgressStep(step: string) {
  const normalized = step
    .replace(/[。！？；，、,.!?\s]+$/g, '')
    .replace(/^(好的[，,]?|我看到|让我来|让我|我先来|我先|先来|先|正在)/, '')
    .replace(/(系统中|当前|现在|正在为您|为您|您的)/g, '')
    .replace(/(数据结构|相关信息|详细信息|具体内容)/g, '')
    .trim()

  const preferredPatterns = [
    /查询[^。！？\n]{0,12}/,
    /查看[^。！？\n]{0,12}/,
    /获取[^。！？\n]{0,12}/,
    /查找[^。！？\n]{0,12}/,
    /匹配[^。！？\n]{0,12}/,
    /分析[^。！？\n]{0,12}/,
    /整理[^。！？\n]{0,12}/,
  ]

  for (const pattern of preferredPatterns) {
    const matched = normalized.match(pattern)?.[0]?.trim()
    if (matched) {
      return matched.slice(0, 20)
    }
  }

  if (normalized.length <= 20) {
    return normalized
  }

  return normalized.slice(0, 20)
}

type ProgressStepMatch = {
  raw: string
  short: string
}

function collectProgressStepMatches(content: string) {
  const normalized = content.replace(/\r/g, '')
  const matches = normalized.match(/[^。！？\n]+[。！？]?/g) ?? []
  const progressKeywords = [
    '我来',
    '让我',
    '先看',
    '先查看',
    '先查询',
    '我先',
    '正在',
    '查找',
    '查询',
    '查看',
    '获取',
    '找到',
    '已为您查到',
    '已查询到',
    '好的',
  ]

  const stepMatches: ProgressStepMatch[] = []
  const seenShort = new Set<string>()
  for (const rawPart of matches) {
    const part = normalizeProgressStep(rawPart)
    if (!part) continue
    if (part.length > 60) continue
    if (!progressKeywords.some((keyword) => part.includes(keyword))) continue
    const shortened = shortenProgressStep(part)
    if (!shortened) continue
    if (seenShort.has(shortened)) continue
    seenShort.add(shortened)
    stepMatches.push({
      raw: part,
      short: shortened,
    })
  }

  return stepMatches
}

function collectVisibleProgressSteps(content: string) {
  return collectProgressStepMatches(content).map((step) => step.short)
}

function stripAssistantLeadText(content: string) {
  return content
    .replace(
      /^(?:作为[^。！？\n]{0,40}专家[，,、]?\s*)?(?:我(?:会|将|来|先|马上)?为您|下面为您|接下来为您)(?:[^。！？\n]{0,40}?)(?:匹配|查询|检索|查找|整理|分析|说明)(?:[^。！？\n]{0,20})?[。！？]\s*/u,
      '',
    )
    .replace(/^(?:让我先|我先)(?:[^。！？\n]{0,20})?[。！？]\s*/u, '')
    .trim()
}

function stripVisibleProgressText(content: string) {
  const stepMatches = collectProgressStepMatches(content)
  if (stepMatches.length === 0) return stripAssistantLeadText(content)

  let nextContent = content
  for (const step of stepMatches) {
    nextContent = nextContent.replace(step.raw, '')
  }

  return stripAssistantLeadText(nextContent)
    .replace(/^\s+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function renderAssistantMarkdown(content: string) {
  const visibleSteps = collectVisibleProgressSteps(content)
  const cleanedContent = stripVisibleProgressText(content)

  return (
    <>
      {visibleSteps.length > 0 ? (
        <div className="mb-3 rounded-[14px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-tint),var(--surface-muted))] px-3 py-2.5 shadow-[var(--shadow-soft)]">
          <div className="space-y-2">
            {visibleSteps.map((step, index) => (
              <div key={`progress-${index}`} className="flex items-start gap-2.5">
                <div className="flex w-5 shrink-0 flex-col items-center pt-0.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                  {index < visibleSteps.length - 1 ? (
                    <span className="mt-0.5 h-full min-h-5 w-px bg-[rgba(var(--theme-soft-rgb),0.30)]" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 break-words text-[0.8125rem] leading-5.5 text-[var(--text-secondary)]">
                  {step}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {cleanedContent ? (
        <div className="markdown-body break-words text-[0.875rem] leading-7 text-[var(--text-main)]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: (props) => <h1 className="mt-0 mb-3 text-[1.1rem] font-semibold text-[var(--text-main)]" {...props} />,
              h2: (props) => <h2 className="mt-5 mb-3 text-[1rem] font-semibold text-[var(--text-main)]" {...props} />,
              h3: (props) => <h3 className="mt-4 mb-2 text-[0.9375rem] font-semibold text-[var(--text-main)]" {...props} />,
              p: (props) => <p className="my-2 whitespace-pre-wrap" {...props} />,
              ul: (props) => <ul className="my-2 list-disc pl-5" {...props} />,
              ol: (props) => <ol className="my-2 list-decimal pl-5" {...props} />,
              li: (props) => <li className="my-1" {...props} />,
              hr: (props) => <hr className="my-4 border-0 border-t border-[var(--line-soft)]" {...props} />,
              strong: (props) => <strong className="font-semibold text-[var(--text-main)]" {...props} />,
              a: (props) => <a className="text-[var(--primary)] underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />,
              code: ({ className, children, ...props }) => (
                <code
                  className={cn(
                    'rounded bg-[rgba(var(--theme-soft-rgb),0.12)] px-1.5 py-0.5 font-mono text-[0.8125rem] text-[var(--primary)]',
                    className,
                  )}
                  {...props}
                >
                  {children}
                </code>
              ),
              pre: (props) => (
                <pre
                  className="my-3 overflow-x-auto rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-muted)] p-3 text-[0.8125rem] leading-6 text-[var(--text-main)]"
                  {...props}
                />
              ),
              table: (props) => (
                <div className="my-3 overflow-x-auto rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
                  <table className="min-w-full border-collapse text-left text-[0.8125rem] leading-6" {...props} />
                </div>
              ),
              thead: (props) => <thead className="bg-[var(--table-header-bg)]" {...props} />,
              th: (props) => <th className="border-b border-[var(--surface-outline)] px-3 py-2 font-semibold text-[var(--text-main)]" {...props} />,
              td: (props) => <td className="border-b border-[var(--line-soft)] px-3 py-2 align-top" {...props} />,
              blockquote: (props) => (
                <blockquote
                  className="my-3 border-l-4 border-[rgba(var(--theme-soft-rgb),0.35)] bg-[rgba(var(--theme-soft-rgb),0.06)] px-3 py-2 text-[var(--text-secondary)]"
                  {...props}
                />
              ),
            }}
          >
            {cleanedContent}
          </ReactMarkdown>
        </div>
      ) : null}
    </>
  )
}

export function AiAssistantWidget() {
  const { isAuthenticated, session } = usePortalContext()
  const [isOpen, setIsOpen] = useState(false)
  const [profile, setProfile] = useState(AI_ASSISTANT_DEFAULT_PROFILE)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen || !isAuthenticated) return

    let cancelled = false
    void fetchAiAssistantProfile().then((nextProfile) => {
      if (!cancelled) setProfile(nextProfile)
    })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, isOpen])

  useEffect(() => {
    if (!isOpen) return
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [isOpen, messages])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent<boolean>(AI_ASSISTANT_OPEN_EVENT, { detail: isOpen }))
  }, [isOpen])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  if (!isAuthenticated) {
    return null
  }

  const quickPrompts = getAiAssistantQuickPrompts(Boolean(session?.token)).slice(0, 4)

  const resetConversation = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setSessionId(null)
    setMessages([])
    setError(null)
    setIsStreaming(false)
  }

  const stopStreaming = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    if (sessionId) {
      void abortAiEmployeeReply(sessionId)
    }
    setIsStreaming(false)
  }

  const sendMessage = async (value: string) => {
    const content = value.trim()
    if (!content || isStreaming) return

    if (!session?.token) {
      setError('当前登录态尚未就绪，请稍后再试。')
      return
    }

    const userMessage: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content,
      status: 'done',
    }
    const assistantMessage: ChatMessage = {
      id: createMessageId('assistant'),
      role: 'assistant',
      content: '',
      status: 'streaming',
    }
    const controller = new AbortController()

    abortControllerRef.current = controller
    setInput('')
    setError(null)
    setIsStreaming(true)
    setMessages((current) => [...current, userMessage, assistantMessage])

    try {
      const nextSessionId = await streamAiEmployeeReply({
        sessionId,
        aiEmployee: profile,
        message: content,
        signal: controller.signal,
        onSessionId: setSessionId,
        onEvent: (event) => {
          if (event.type === 'content') {
            const text = extractAiStreamText(event.body)
            if (!text) return

            startTransition(() => {
              setMessages((current) => appendAssistantContent(current, assistantMessage.id, text))
            })
            return
          }
        },
      })

      setSessionId(nextSessionId)
      setMessages((current) => updateAssistantStatus(current, assistantMessage.id, 'done', '已完成。'))
    } catch (caught) {
      if (isAbortError(caught)) {
        setMessages((current) => updateAssistantStatus(current, assistantMessage.id, 'done', '已停止生成。'))
        return
      }

      const message = caught instanceof Error ? caught.message : 'AI 员工回答失败'
      setError(message)
      setMessages((current) => updateAssistantStatus(current, assistantMessage.id, 'error', message))
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      setIsStreaming(false)
    }
  }

  return (
    <>
      {isOpen ? (
        <section className="fixed right-0 top-0 z-50 flex h-screen w-[min(32rem,calc(100vw-0.5rem))] flex-col overflow-hidden rounded-l-[28px] border-l border-t border-b border-[var(--surface-outline-strong)] bg-[var(--surface-raised-strong)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--surface-outline)] bg-[linear-gradient(135deg,var(--surface-tint),var(--surface-raised-strong))] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] shadow-[var(--shadow-soft)]">
                  <Bot className="absolute h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
                  <img
                    src={NOCOBASE_AI_AVATAR}
                    alt={profile.nickname}
                    className="relative z-10 h-8 w-8 rounded-[10px] bg-[var(--surface-raised)]"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[1.0625rem] font-semibold text-[var(--text-main)]">{profile.nickname}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetConversation}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                  aria-label="重新开始对话"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                  aria-label="关闭吉小数"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,var(--surface-hero-start),var(--surface-hero-end))] px-5 py-5">
              {messages.length === 0 ? (
                <div className="rounded-[22px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]">
                  <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(var(--theme-soft-rgb),0.10)] text-[var(--primary)]">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[0.9375rem] font-semibold text-[var(--text-main)]">{profile.greeting}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="rounded-full border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[rgba(var(--theme-soft-rgb),0.08)] px-3 py-1.5 text-[0.75rem] font-medium text-[var(--primary)] transition hover:border-[rgba(var(--theme-soft-rgb),0.32)] hover:bg-[rgba(var(--theme-soft-rgb),0.12)]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[92%] rounded-[18px] px-4 py-3 text-[0.875rem] leading-6 shadow-[var(--shadow-soft)]',
                          message.role === 'user'
                            ? 'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white'
                            : 'border border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-main)]',
                          message.status === 'error' && 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]',
                        )}
                      >
                        {message.content ? (
                          message.role === 'assistant'
                            ? renderAssistantMarkdown(message.content)
                            : <div className="whitespace-pre-wrap break-words">{message.content}</div>
                        ) : (
                          <div className="flex items-center gap-2 text-[var(--text-muted)]">
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            正在生成回答...
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {error ? (
              <div className="border-t border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-2 text-[0.75rem] text-[var(--status-danger-text)]">
                {error}
              </div>
            ) : null}

            <form
              className="border-t border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-4"
              onSubmit={(event) => {
                event.preventDefault()
                void sendMessage(input)
              }}
            >
              <div className="flex items-end gap-2 rounded-[18px] border border-[var(--surface-outline)] bg-[var(--field-bg)] p-2 transition focus-within:border-[var(--primary)] focus-within:bg-[var(--field-bg-strong)]">
                <textarea
                  value={input}
                  rows={1}
                  disabled={isStreaming}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void sendMessage(input)
                    }
                  }}
                  placeholder="向吉小数提问，Shift + Enter 换行"
                  className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[0.875rem] leading-6 text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-70"
                />
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={stopStreaming}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] transition hover:brightness-95"
                    aria-label="停止生成"
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[0_12px_22px_rgba(var(--theme-strong-rgb),0.22)] transition hover:-translate-y-[1px] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="发送问题"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>
        </section>
      ) : null}

      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed right-0 top-1/2 z-50 inline-flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-[22px] border-l border-t border-b border-[var(--surface-outline-strong)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-3 py-4 shadow-[var(--shadow-medium)] backdrop-blur transition hover:-translate-y-1/2 hover:bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-tint))] hover:shadow-[var(--shadow-elevated)]"
          aria-label="打开吉小数"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(var(--theme-soft-rgb),0.10)] text-[var(--primary)]">
            <MessageCircle className="h-5 w-5" />
          </span>
          <span className="text-center">
            <span className="block text-[0.875rem] font-semibold text-[var(--text-main)] [writing-mode:vertical-rl] [text-orientation:mixed]">吉小数</span>
            <span className="mt-2 block text-[0.625rem] tracking-[0.08em] text-[var(--text-secondary)] [writing-mode:vertical-rl] [text-orientation:mixed]">AI 助手</span>
          </span>
        </button>
      ) : null}
    </>
  )
}

export { AI_ASSISTANT_OPEN_EVENT }
