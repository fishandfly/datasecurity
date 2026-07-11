import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const homePageSource = readFileSync(resolve(process.cwd(), 'src/pages/home-page.tsx'), 'utf8')
const homePreviewShellSource = readFileSync(resolve(process.cwd(), 'src/pages/home-preview-shell.tsx'), 'utf8')

test('首页浏览面板提供数据分类、来源分类和业务分类三类入口，并接入业务属性树', () => {
  assert.match(homePageSource, /type BrowsePanelKey = 'department' \| 'topic' \| 'businessAttribute'/)
  assert.match(homePageSource, /const \{ catalogItems, categoryTree, businessAttributeTree, sourceTree \} = data/)
  assert.match(homePageSource, /queryParam: 'businessAttributeNode'/)
  assert.match(homePageSource, /\{ key: 'topic', label: '数据分类', title: '数据分类'/)
  assert.match(homePageSource, /\{ key: 'department', label: '来源分类', title: '来源分类'/)
  assert.match(homePageSource, /\{ key: 'businessAttribute', label: '业务分类', title: '业务分类'/)
  assert.match(homePageSource, /const businessAttributeGroups = useMemo<BrowseGroup\[\]>\(\(\) => \{/)
})

test('首页预览壳同步提供业务属性分类入口', () => {
  assert.match(homePreviewShellSource, /type BrowsePanelKey = 'department' \| 'topic' \| 'businessAttribute'/)
  assert.match(homePreviewShellSource, /const \{ catalogItems, categoryTree, businessAttributeTree, sourceTree \} = data/)
  assert.match(homePreviewShellSource, /queryParam: 'businessAttributeNode'/)
  assert.match(homePreviewShellSource, /\{ key: 'topic', label: '数据分类', title: '数据分类'/)
  assert.match(homePreviewShellSource, /\{ key: 'businessAttribute', label: '业务分类', title: '业务分类'/)
})
