import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const themeModeSource = readFileSync(resolve(process.cwd(), 'src/lib/theme-mode.ts'), 'utf8')
const layoutSource = readFileSync(resolve(process.cwd(), 'src/layouts/service-layout.tsx'), 'utf8')
const indexCssSource = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

test('主题模式包含暗色模式并可被识别', () => {
  assert.match(themeModeSource, /export type ThemeMode = 'blue' \| 'green' \| 'blue-white' \| 'dark'/)
  assert.match(themeModeSource, /export type FontSizeMode = 'standard' \| 'large' \| 'largest'/)
  assert.match(themeModeSource, /\{ value: 'dark', label: '暗色' \}/)
  assert.match(themeModeSource, /\{ value: 'standard', label: '标准' \}/)
  assert.match(themeModeSource, /\{ value: 'large', label: '增大' \}/)
  assert.match(themeModeSource, /\{ value: 'largest', label: '最大' \}/)
  assert.match(themeModeSource, /value === 'blue' \|\| value === 'green' \|\| value === 'blue-white' \|\| value === 'dark'/)
  assert.match(themeModeSource, /value === 'standard' \|\| value === 'large' \|\| value === 'largest'/)
})

test('布局右下角主题切换改为图标悬停展开并在选择后收起', () => {
  assert.match(layoutSource, /const \[isThemeMenuOpen, setIsThemeMenuOpen\] = useState\(false\)/)
  assert.match(layoutSource, /onMouseEnter=\{\(\) => setIsThemeMenuOpen\(true\)\}/)
  assert.match(layoutSource, /aria-label="切换主题颜色"/)
  assert.match(layoutSource, /const \[fontSizeMode, setFontSizeMode\] = useState<FontSizeMode>/)
  assert.match(layoutSource, /normalizeFontSizeMode\(window\.localStorage\.getItem\('service-font-size-mode'\)\)/)
  assert.match(layoutSource, /document\.documentElement\.dataset\.fontSize = fontSizeMode/)
  assert.match(layoutSource, /window\.localStorage\.setItem\('service-font-size-mode', fontSizeMode\)/)
  assert.match(layoutSource, /字体大小/)
  assert.match(layoutSource, /显示风格/)
  assert.match(layoutSource, /flex flex-col gap-2 py-1 pr-1/)
  assert.match(layoutSource, /w-\[520px\]/)
  assert.match(layoutSource, /shadow-none backdrop-blur-0/)
  assert.match(layoutSource, /fontSizeModeOptions\.map\(\(\{ value, label \}\) => \(/)
  assert.match(layoutSource, /setFontSizeMode\(value\)/)
  assert.match(layoutSource, /themeModeOptions\.map\(\(\{ value, label \}\) => \(/)
  assert.match(layoutSource, /setThemeMode\(value\)/)
  assert.match(layoutSource, /setIsThemeMenuOpen\(false\)/)
})

test('全局样式提供暗色主题变量', () => {
  assert.match(indexCssSource, /:root:not\(\[data-theme\]\),\s*:root\[data-theme='blue-white'\] \{/)
  assert.match(indexCssSource, /:root\[data-theme='dark'\] \{/)
  assert.match(indexCssSource, /:root:not\(\[data-font-size\]\),\s*:root\[data-font-size='standard'\] \{/)
  assert.match(indexCssSource, /:root\[data-font-size='large'\] \{/)
  assert.match(indexCssSource, /:root\[data-font-size='largest'\] \{/)
  assert.match(indexCssSource, /:root:not\(\[data-font-size\]\),\s*:root\[data-font-size='standard'\]\s*\{\s*font-size: 1rem;/)
  assert.match(indexCssSource, /:root\[data-font-size='large'\]\s*\{\s*font-size: 1\.1875rem;/)
  assert.match(indexCssSource, /:root\[data-font-size='largest'\]\s*\{\s*font-size: 1\.375rem;/)
  assert.match(indexCssSource, /--page-bg: #07111b;/)
  assert.match(indexCssSource, /--brand-title-main: #ebf4ff;/)
})
