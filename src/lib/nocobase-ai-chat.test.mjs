import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-ai-chat.ts'), 'utf8')

test('NocoBase AI 员工客户端使用会话创建和流式回答接口', () => {
  assert.match(source, /aiConversations:create/)
  assert.match(source, /ai:listAllEnabledModels/)
  assert.match(source, /aiConversations:sendMessages/)
  assert.match(source, /Accept: 'text\/event-stream'/)
})

test('NocoBase AI 员工客户端发送消息时带默认模型配置', () => {
  assert.match(source, /function pickDefaultAiModel/)
  assert.match(source, /fetchDefaultAiModel/)
  assert.match(source, /model: \{\s*llmService: defaultModel\.llmService,\s*model: defaultModel\.model,\s*\}/)
})

test('NocoBase AI 员工客户端补充时区请求头', () => {
  assert.match(source, /function getBrowserTimezoneOffset\(/)
  assert.match(source, /headers\.has\('X-Timezone'\)/)
  assert.match(source, /headers\.set\('X-Timezone', getBrowserTimezoneOffset\(\)\)/)
})

test('NocoBase AI 员工客户端解析 SSE data 事件', () => {
  assert.match(source, /class NocobaseAiSseParser/)
  assert.match(source, /line\.startsWith\('data:'\)/)
  assert.match(source, /JSON\.parse\(data\)/)
})

test('NocoBase AI 员工客户端会将 LangGraph 递归上限等技术错误转换成用户可读提示', () => {
  assert.match(source, /function normalizeAiAssistantErrorMessage\(/)
  assert.match(source, /GRAPH_RECURSION_LIMIT/i)
  assert.match(source, /recursion limit/i)
  assert.match(source, /本次回答在推理过程中超出系统步数限制/)
  assert.match(source, /throw new Error\(normalizeAiAssistantErrorMessage\(/)
})
