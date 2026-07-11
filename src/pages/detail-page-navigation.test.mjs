import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const detailPageSource = readFileSync(resolve(process.cwd(), 'src/pages/detail-page.tsx'), 'utf8')

test('详情页标题右侧提供返回上一页按钮', () => {
  assert.match(detailPageSource, /useNavigate/)
  assert.match(detailPageSource, /type DetailPageLocationState = \{/)
  assert.match(detailPageSource, /const returnTo = typeof locationState\?\.returnTo === 'string'/)
  assert.match(detailPageSource, /const handleGoBack = \(\) => \{/)
  assert.match(detailPageSource, /if \(returnTo\) \{/)
  assert.match(detailPageSource, /navigate\(returnTo\)/)
  assert.match(detailPageSource, /navigate\(-1\)/)
  assert.match(detailPageSource, /navigate\(withEmbed\('\/catalog'\)\)/)
  assert.match(detailPageSource, /<ArrowLeft className="h-4 w-4" \/>/)
  assert.match(detailPageSource, /返回上一页/)
  assert.match(detailPageSource, /state=\{returnTo \? \{ returnTo \} : undefined\}/)
})

test('详情页切换 tab 时保留列表返回地址且不污染历史记录', () => {
  assert.match(detailPageSource, /const handleTabChange = \(tabKey: DetailTabKey\) => \{/)
  assert.match(detailPageSource, /pathname: location\.pathname/)
  assert.match(detailPageSource, /search: `\?\$\{buildTabSearchParams\(tabKey\)\.toString\(\)\}`/)
  assert.match(detailPageSource, /replace: true/)
  assert.match(detailPageSource, /state: locationState \?\? undefined/)
  assert.doesNotMatch(detailPageSource, /onClick=\{\(\) => setSearchParams\(buildTabSearchParams\(key as DetailTabKey\)\)\}/)
})

test('详情页更新周期卡片直接使用资源表 update_cycle 对应值', () => {
  assert.match(detailPageSource, /\{ title: '更新周期', value: item\.updateCycle \|\| '未标注', icon: <RefreshCw className="h-5 w-5" \/> \}/)
  assert.doesNotMatch(detailPageSource, /\{ title: '更新周期', value: detailMetricSnapshot\.updateCycleText/)
})

test('详情页标题右侧显示最新连通状态标识', () => {
  assert.match(detailPageSource, /const latestStatus = latestStatRecord \? connectStatusMeta\(latestStatRecord\.connectStatus\) : null/)
  assert.match(detailPageSource, /<div className="flex flex-wrap items-center gap-3">\s*<h1 className="max-w-\[820px\] text-\[1\.875rem\] font-semibold leading-\[1\.34\] text-\[var\(--text-main\)\]">\{item\.name\}<\/h1>\s*\{latestStatus \? \(/)
  assert.match(detailPageSource, /<span className=\{`inline-flex rounded-full border px-3 py-1 text-\[0\.8125rem\] font-semibold \$\{latestStatus\.toneClass\}`\}>\{latestStatus\.label\}<\/span>/)
})
