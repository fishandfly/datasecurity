import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const loginPageSource = readFileSync(resolve(process.cwd(), 'src/pages/login-page.tsx'), 'utf8')

test('登录页在暗色主题下使用主题变量而不是浅色硬编码', () => {
  assert.match(loginPageSource, /border-\[var\(--status-info-border\)\] bg-\[linear-gradient\(180deg,var\(--surface-raised-strong\),color-mix\(in_srgb,var\(--status-info-bg\)_72%,var\(--surface-raised\)\)\)\]/)
  assert.match(loginPageSource, /<h2 className="mt-4 text-\[2rem\] font-semibold leading-\[1\.24\] text-\[var\(--text-main\)\]">\{copy\.heroTitle\}<\/h2>/)
  assert.match(loginPageSource, /bg-\[linear-gradient\(180deg,var\(--surface-raised-strong\),var\(--surface-muted\)\)\] p-5 shadow-\[var\(--shadow-elevated\)\] backdrop-blur/)
  assert.match(loginPageSource, /bg-\[linear-gradient\(180deg,var\(--surface-muted\),var\(--surface-tint\)\)\] p-1/)
  assert.match(loginPageSource, /bg-\[var\(--field-bg\)\][\s\S]*text-\[var\(--text-main\)\][\s\S]*placeholder:text-\[var\(--text-muted\)\][\s\S]*focus:bg-\[var\(--field-bg-strong\)\]/)
  assert.match(loginPageSource, /className="w-full rounded-\[8px\] border-\[var\(--surface-outline\)\] bg-\[var\(--surface-raised\)\] hover:border-\[rgba\(var\(--theme-soft-rgb\),0\.22\)\] hover:bg-\[var\(--surface-raised-strong\)\]"/)
  assert.match(loginPageSource, /border-\[var\(--status-warning-border\)\] bg-\[var\(--status-warning-bg\)\][\s\S]*text-\[var\(--status-warning-text\)\]/)
  assert.match(loginPageSource, /border-\[var\(--status-danger-border\)\] bg-\[var\(--status-danger-bg\)\][\s\S]*text-\[var\(--status-danger-text\)\]/)
  assert.doesNotMatch(loginPageSource, /text-\[#203346\]/)
  assert.doesNotMatch(loginPageSource, /bg-white/)
  assert.doesNotMatch(loginPageSource, /bg-\[#f8fbff\]/)
})
