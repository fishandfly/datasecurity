import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const listPageSource = readFileSync(resolve(process.cwd(), 'src/pages/knowledge-documents-page.tsx'), 'utf8')
const detailPagePath = resolve(process.cwd(), 'src/pages/knowledge-document-detail-page.tsx')
const detailPageSource = existsSync(detailPagePath) ? readFileSync(detailPagePath, 'utf8') : ''
const apiSource = readFileSync(resolve(process.cwd(), 'src/lib/knowledgebase-api.ts'), 'utf8')
const uiSource = readFileSync(resolve(process.cwd(), 'src/components/ui.tsx'), 'utf8')

test('文档资源详情页保持兼容入口', () => {
  assert.match(listPageSource, /function buildKnowledgeDocumentDetailPath\(relativePath: string\)/)
  assert.match(listPageSource, /to=\{withEmbed\(buildKnowledgeDocumentDetailPath\(item\.relativePath\)\)\}/)
  assert.match(listPageSource, /查看详情/)
})

test('知识文档数据层提供文档路径编码和详情查询能力', () => {
  assert.match(apiSource, /export type KnowledgeDocumentDetail = \{/)
  assert.match(apiSource, /summaryMarkdown: string/)
  assert.match(apiSource, /export function encodeKnowledgeDocumentId\(relativePath: string\)/)
  assert.match(apiSource, /export function decodeKnowledgeDocumentId\(encodedId: string\)/)
  assert.match(apiSource, /export function useKnowledgebaseDocumentDetail\(/)
  assert.match(apiSource, /const KNOWLEDGE_DOCUMENT_COLLECTION = 'eco_knowledge_base'/)
  assert.match(apiSource, /async function getKnowledgeDocumentDetail\(documentId: string\)/)
})

test('文档资源详情页展示元数据、内容摘要和相关文档', () => {
  assert.match(detailPageSource, /import ReactMarkdown from 'react-markdown'/)
  assert.match(detailPageSource, /import remarkGfm from 'remark-gfm'/)
  assert.doesNotMatch(detailPageSource, /useState<KnowledgeDocumentDetailTabKey>/)
  assert.match(detailPageSource, /useParams\(\)/)
  assert.match(detailPageSource, /decodeKnowledgeDocumentId\(id \?\? ''\)/)
  assert.match(detailPageSource, /useKnowledgebaseManifest\(\)/)
  assert.match(detailPageSource, /useKnowledgebaseDocumentDetail\(relativePath\)/)
  assert.match(detailPageSource, /function DetailMarkdownPreview\(\{ markdown \}: \{ markdown: string \}\)/)
  assert.match(detailPageSource, /function resolveMetadataItems\(item:/)
  assert.match(detailPageSource, /const heroFieldLabels = new Set\(\['文档分类', '发布年份', '文档大小', '最近更新'\]\)/)
  assert.match(detailPageSource, /\.filter\(\(field\) => !heroFieldLabels\.has\(field\.label\)\)/)
  assert.match(detailPageSource, /title: '文档分类'/)
  assert.match(detailPageSource, /title: '发布年份'/)
  assert.match(detailPageSource, /title: '文档大小'/)
  assert.match(detailPageSource, /title: '最近更新'/)
  assert.match(detailPageSource, /<ScenicPanel className="flex h-full flex-col p-5">/)
  assert.match(uiSource, /<div className="relative h-full">\{children\}<\/div>/)
  assert.match(detailPageSource, /title="基础信息"/)
  assert.match(detailPageSource, /title="内容摘要"/)
  assert.match(detailPageSource, /title="相关文档"/)
  assert.match(detailPageSource, /<ReactMarkdown/)
  assert.match(detailPageSource, /buildKnowledgeDocumentFileHref\(item\.fileUrl\)/)
  assert.match(detailPageSource, /metadataItems\.map\(\(field\) =>/)
  assert.match(detailPageSource, /当前页面仅展示文档摘要，不展示完整正文。/)
  assert.match(detailPageSource, /<DetailMarkdownPreview markdown=\{detailData\.summaryMarkdown\} \/>/)
  assert.match(detailPageSource, /navigate\(withEmbed\('\/documents'\)\)/)
  assert.match(detailPageSource, />\s*返回\s*<\/button>/)
  assert.match(detailPageSource, /const relatedItems = useMemo\(\(\) => \{/)
  assert.doesNotMatch(detailPageSource, /<iframe/)
})
