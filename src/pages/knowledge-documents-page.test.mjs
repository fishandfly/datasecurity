import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const serviceLayoutSource = readFileSync(resolve(process.cwd(), 'src/layouts/service-layout.tsx'), 'utf8')
const navigationSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-navigation.ts'), 'utf8')
const documentsCatalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/documents-catalog-page.tsx'), 'utf8')
const documentsPagePath = resolve(process.cwd(), 'src/pages/knowledge-documents-page.tsx')
const documentsPageSource = existsSync(documentsPagePath) ? readFileSync(documentsPagePath, 'utf8') : ''

test('文档资源保留兼容页面且不占用安全管控一级导航', () => {
  assert.doesNotMatch(navigationSource, /title: '文档资源'[\s\S]*target: '\/documents'/)
  assert.doesNotMatch(navigationSource, /title: '数据API服务'[\s\S]*target: '\/service-catalog'/)
  assert.match(navigationSource, /title: '安全态势'[\s\S]*target: '\/security-governance\/dashboard'/)
  assert.doesNotMatch(serviceLayoutSource, /\{ to: '\/documents', label: '文档资源', icon: FolderOpen \}/)
  assert.match(documentsCatalogPageSource, /return <CatalogPage forceView="document" \/>/)
})

test('文档资源页提供分类筛选、卡片展示和全文检索入口', () => {
  assert.match(documentsPageSource, /const \{ data: manifestData, isLoading: isManifestLoading, error: manifestError \} = useKnowledgebaseManifest\(\)/)
  assert.match(documentsPageSource, /const \{ data: searchData, isLoading: isSearchLoading, error: searchError \} = useKnowledgebaseSearch\(/)
  assert.match(documentsPageSource, /placeholder="全文检索知识文档标题、标准编号、正文内容"/)
  assert.match(documentsPageSource, /title="文档分类"/)
  assert.match(documentsPageSource, /title="发布年份"/)
  assert.match(documentsPageSource, /className="grid gap-4 xl:grid-cols-2"/)
  assert.match(documentsPageSource, /function buildKnowledgeDocumentFileHref\(item: KnowledgeDocumentManifestItem \| KnowledgeDocumentSearchItem\)/)
  assert.match(documentsPageSource, /href=\{buildKnowledgeDocumentFileHref\(item\)\}/)
  assert.match(documentsPageSource, /打开文档/)
  assert.doesNotMatch(documentsPageSource, /<TopicPill>文档资源<\/TopicPill>/)
  assert.doesNotMatch(documentsPageSource, /将本地知识文档按分类和年份组织展示，支持在标题、标准编号和正文内容中做全文检索。/)
})

test('文档资源页优先复用清单数据做分类浏览，输入关键词后切换服务端全文检索结果', () => {
  assert.match(documentsPageSource, /const activeRootCategory = searchParams\.get\('category'\) \?\? ''/)
  assert.match(documentsPageSource, /const activeYear = searchParams\.get\('year'\) \?\? ''/)
  assert.match(documentsPageSource, /const committedKeyword = \(searchParams\.get\('keyword'\) \?\? ''\)\.trim\(\)/)
  assert.match(documentsPageSource, /const isSearchMode = committedKeyword\.length > 0/)
  assert.match(documentsPageSource, /const browseItems = useMemo\(\(\) => \{/)
  assert.match(documentsPageSource, /const displayItems = isSearchMode \? searchData\.items : pagedBrowseItems/)
  assert.match(documentsPageSource, /const rootCategoryOptions = useMemo\(\(\) => \[/)
  assert.match(documentsPageSource, /const yearOptions = useMemo\(\(\) => \[/)
  assert.match(documentsPageSource, /const clearFilters = \(\) => \{/)
  assert.match(documentsPageSource, /当前筛选/)
  assert.match(documentsPageSource, /检索结果/)
})
