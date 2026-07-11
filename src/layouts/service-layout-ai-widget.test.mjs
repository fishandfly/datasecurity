import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const serviceLayoutSource = readFileSync(resolve(process.cwd(), 'src/layouts/service-layout.tsx'), 'utf8')
const aiWidgetSource = readFileSync(resolve(process.cwd(), 'src/components/ai-assistant-widget.tsx'), 'utf8')
const featureFlagSource = readFileSync(resolve(process.cwd(), 'src/lib/portal-feature-flags.ts'), 'utf8')

test('公共布局按环境变量控制 5173 自有吉小数浮窗是否显示', () => {
  assert.equal(serviceLayoutSource.includes("../components/ai-assistant-widget"), true)
  assert.equal(serviceLayoutSource.includes('PORTAL_AI_ASSISTANT_ENABLED'), true)
  assert.match(serviceLayoutSource, /!isEmbedMode && location\.pathname !== '\/login' && PORTAL_AI_ASSISTANT_ENABLED \? <AiAssistantWidget \/> : null/)
})

test('吉小数显示开关支持中文是/否等环境变量值', () => {
  assert.match(featureFlagSource, /export function normalizePortalAiAssistantEnabled\(/)
  assert.match(featureFlagSource, /env\.VITE_PORTAL_AI_ASSISTANT_ENABLED/)
  assert.match(featureFlagSource, /return \['1', 'true', 'yes', 'on', 'y', 'shi', '是'\]\.includes\(normalizedToken\)/)
  assert.match(featureFlagSource, /export const PORTAL_AI_ASSISTANT_ENABLED =/)
})

test('吉小数浮窗不再嵌入 NocoBase 原生后台对话界面', () => {
  assert.equal(aiWidgetSource.includes('<iframe'), false)
  assert.equal(aiWidgetSource.includes('NOCOBASE_AI_ENTRY'), false)
  assert.equal(aiWidgetSource.includes("'/admin'"), false)
})

test('吉小数浮窗将 reasoning 事件按时间轴展示', () => {
  assert.equal(aiWidgetSource.includes('collectProgressStepMatches'), true)
  assert.equal(aiWidgetSource.includes('collectVisibleProgressSteps'), true)
  assert.equal(aiWidgetSource.includes('shortenProgressStep'), true)
  assert.equal(aiWidgetSource.includes('stripAssistantLeadText'), true)
  assert.equal(aiWidgetSource.includes('stripVisibleProgressText'), true)
  assert.equal(aiWidgetSource.includes('progress-'), true)
})

test('吉小数浮窗支持 Markdown 正文渲染', () => {
  assert.equal(aiWidgetSource.includes("from 'react-markdown'"), true)
  assert.equal(aiWidgetSource.includes("from 'remark-gfm'"), true)
  assert.equal(aiWidgetSource.includes('renderAssistantMarkdown(message.content)'), true)
})

test('吉小数展开为右侧悬浮贯通式侧栏', () => {
  assert.equal(aiWidgetSource.includes('fixed right-0 top-0'), true)
  assert.equal(aiWidgetSource.includes('h-screen'), true)
  assert.equal(aiWidgetSource.includes('[writing-mode:vertical-rl]'), true)
})

test('吉小数展开时主内容区做轻微让位过渡', () => {
  assert.equal(serviceLayoutSource.includes('AI_ASSISTANT_OPEN_EVENT'), true)
  assert.equal(serviceLayoutSource.includes('isAiAssistantOpen'), true)
  assert.equal(serviceLayoutSource.includes('xl:pr-[min(30rem,30vw)] xl:-translate-x-3'), true)
})

test('吉小数展开时头部和导航也同步轻微左移', () => {
  assert.equal(serviceLayoutSource.includes("transition-[padding-right,transform]"), true)
  assert.equal(serviceLayoutSource.includes('mx-auto flex min-h-[86px]'), true)
  assert.equal(serviceLayoutSource.includes('mx-auto flex w-[90vw] max-w-[1720px] items-center overflow-x-auto px-4'), true)
})

test('吉小数侧栏样式使用主题变量以兼容暗色模式', () => {
  assert.equal(aiWidgetSource.includes('bg-[var(--surface-raised-strong)]'), true)
  assert.equal(aiWidgetSource.includes('border-[var(--surface-outline)]'), true)
  assert.equal(aiWidgetSource.includes('text-[var(--text-main)]'), true)
  assert.equal(aiWidgetSource.includes('bg-[linear-gradient(180deg,var(--surface-hero-start),var(--surface-hero-end))]'), true)
})
