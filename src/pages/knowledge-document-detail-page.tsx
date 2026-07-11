import { useMemo } from 'react'
import { ArrowLeft, CalendarRange, FileSearch, FolderOpen, Link2, Search } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ScenicPanel, StatCard, TopicPill } from '../components/ui'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import {
  decodeKnowledgeDocumentId,
  encodeKnowledgeDocumentId,
  useKnowledgebaseDocumentDetail,
  useKnowledgebaseManifest,
} from '../lib/knowledgebase-api'

function buildKnowledgeDocumentFileHref(fileUrl: string) {
  return fileUrl.trim()
}

function formatDocumentSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '未知大小'
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${Math.round(size / 1024)} KB`
  return `${size} B`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未标注'
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function DetailSectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 text-[1.125rem] font-semibold text-[var(--text-main)]">
      <span className="text-[var(--primary)]">
        <FileSearch className="h-5 w-5" />
      </span>
      <span title={title}>{title}</span>
    </div>
  )
}

function DetailMarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="markdown-body break-words text-[0.9375rem] leading-8 text-[var(--text-main)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="mb-4 text-[1.25rem] font-semibold text-[var(--text-main)]" {...props} />,
          h2: (props) => <h2 className="mt-6 mb-3 text-[1.0625rem] font-semibold text-[var(--text-main)]" {...props} />,
          h3: (props) => <h3 className="mt-5 mb-2 text-[0.9875rem] font-semibold text-[var(--text-main)]" {...props} />,
          p: (props) => <p className="my-2 whitespace-pre-wrap" {...props} />,
          ul: (props) => <ul className="my-3 list-disc pl-5" {...props} />,
          ol: (props) => <ol className="my-3 list-decimal pl-5" {...props} />,
          li: (props) => <li className="my-1" {...props} />,
          a: (props) => <a className="text-[var(--primary)] underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />,
          table: (props) => (
            <div className="my-4 overflow-x-auto rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
              <table className="min-w-full border-collapse text-left text-[0.8125rem] leading-6" {...props} />
            </div>
          ),
          thead: (props) => <thead className="bg-[var(--table-header-bg)]" {...props} />,
          th: (props) => <th className="border-b border-[var(--surface-outline)] px-3 py-2 font-semibold text-[var(--text-main)]" {...props} />,
          td: (props) => <td className="border-b border-[var(--line-soft)] px-3 py-2 align-top text-[var(--text-secondary)]" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="my-4 border-l-4 border-[rgba(var(--theme-soft-rgb),0.35)] bg-[rgba(var(--theme-soft-rgb),0.06)] px-4 py-3 text-[var(--text-secondary)]"
              {...props}
            />
          ),
          hr: (props) => <hr className="my-4 border-0 border-t border-[var(--line-soft)]" {...props} />,
          code: (props) => (
            <code
              className="rounded bg-[rgba(var(--theme-soft-rgb),0.12)] px-1.5 py-0.5 font-mono text-[0.8125rem] text-[var(--primary)]"
              {...props}
            />
          ),
          pre: (props) => (
            <pre
              className="my-4 overflow-x-auto rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-muted)] p-4 text-[0.8125rem] leading-6 text-[var(--text-main)]"
              {...props}
            />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

function resolveMetadataItems(item: {
  title: string
  rootCategory: string
  knowledgeTypeName: string
  year: string
  extension: string
  size: number
  updatedAt: string
  categoryPathLabel: string
  baseInfo: Record<string, unknown> | null
  sourceInfo: Record<string, unknown> | null
  sourceName: string
  sourceUrl: string
}) {
  const baseInfo = item.baseInfo ?? {}
  const sourceInfo = item.sourceInfo ?? {}
  const publishDate = String(baseInfo.publish_date ?? baseInfo.gbrq ?? baseInfo.sxrq ?? '').trim()
  const contentSource = String(baseInfo.content_source ?? sourceInfo.source_name ?? item.sourceName ?? '').trim()
  const sourceSite = String(baseInfo.source_site ?? '').trim()
  const sourceUrl = String(sourceInfo.source_url ?? item.sourceUrl ?? '').trim()
  const heroFieldLabels = new Set(['文档分类', '发布年份', '文档大小', '最近更新'])

  return [
    { label: '文档名称', value: item.title },
    { label: '文档分类', value: item.rootCategory || '未标注' },
    { label: '知识类型', value: item.knowledgeTypeName || '未标注' },
    { label: '发布年份', value: item.year || '未标注' },
    { label: '文档格式', value: item.extension.toUpperCase() },
    { label: '文档大小', value: formatDocumentSize(item.size) },
    { label: '发布时间', value: publishDate || '未标注' },
    { label: '最近更新', value: formatDateTime(item.updatedAt) },
    { label: '来源单位', value: contentSource || '未标注' },
    { label: '来源站点', value: sourceSite || '未标注' },
    { label: '分类路径', value: item.categoryPathLabel || '未标注' },
    { label: '原文链接', value: sourceUrl, isLink: true },
  ].filter((field) => !heroFieldLabels.has(field.label))
}

export function KnowledgeDocumentDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const relativePath = decodeKnowledgeDocumentId(id ?? '')
  const { data: manifestData, isLoading: isManifestLoading } = useKnowledgebaseManifest()
  const { data: detailData, isLoading: isDetailLoading, error: detailError } = useKnowledgebaseDocumentDetail(relativePath)
  const item = detailData.item ?? manifestData.items.find((entry) => entry.relativePath === relativePath) ?? null

  const relatedItems = useMemo(() => {
    if (!item) return []
    return manifestData.items
      .filter((entry) => entry.relativePath !== item.relativePath && entry.rootCategory === item.rootCategory)
      .sort((left, right) => {
        const leftYear = Number.parseInt(left.year || '0', 10)
        const rightYear = Number.parseInt(right.year || '0', 10)
        if (left.year === item.year && right.year !== item.year) return -1
        if (right.year === item.year && left.year !== item.year) return 1
        if (leftYear !== rightYear) return rightYear - leftYear
        return left.title.localeCompare(right.title, 'zh-CN', { numeric: true })
      })
      .slice(0, 8)
  }, [item, manifestData.items])

  if (!relativePath) {
    return <Navigate to={withEmbed('/documents')} replace />
  }

  if (!isManifestLoading && !isDetailLoading && !item) {
    return <Navigate to={withEmbed('/documents')} replace />
  }

  if (!item) {
    return <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载文档详情...</div>
  }

  const heroStats = [
    { title: '文档分类', value: item.rootCategory || '未标注', icon: <FolderOpen className="h-5 w-5" /> },
    { title: '发布年份', value: item.year || '未标注', icon: <CalendarRange className="h-5 w-5" /> },
    { title: '文档大小', value: formatDocumentSize(item.size), icon: <FileSearch className="h-5 w-5" /> },
    { title: '最近更新', value: formatDateTime(item.updatedAt), icon: <Search className="h-5 w-5" /> },
  ]
  const metadataItems = resolveMetadataItems(item)

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[24px] border border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] px-6 py-6 shadow-[var(--shadow-elevated)]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <TopicPill>{item.rootCategory || '文档资源'}</TopicPill>
                {item.year ? <TopicPill>{item.year}</TopicPill> : null}
                <TopicPill>{item.extension.toUpperCase()}</TopicPill>
              </div>
              <h1 className="mt-4 text-[2rem] font-bold leading-[1.35] text-[var(--text-main)]">{item.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                <span>路径：{item.categoryPathLabel}</span>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[var(--surface-raised)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              onClick={() => navigate(withEmbed('/documents'))}
            >
              <ArrowLeft className="h-4 w-4" />
              返回
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {heroStats.map((stat) => (
              <StatCard key={stat.title} title={stat.title} value={stat.value} icon={stat.icon} />
            ))}
          </div>
        </div>
      </section>

      {detailError ? (
        <div className="rounded-[12px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">
          {detailError}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:items-stretch">
        <ScenicPanel className="flex h-full flex-col p-5">
          <div className="flex h-full flex-col gap-4">
            <div className="flex flex-wrap items-center justify-end gap-3">
              {buildKnowledgeDocumentFileHref(item.fileUrl) ? (
                <a
                  href={buildKnowledgeDocumentFileHref(item.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[0.8125rem] font-medium text-[var(--primary)]"
                >
                  打开原文
                </a>
              ) : null}
            </div>

            <div className="space-y-4">
              <DetailSectionHeader title="基础信息" />
              <div className="grid gap-3 lg:grid-cols-2">
                {metadataItems.map((field) => (
                  <div
                    key={field.label}
                    className="rounded-[16px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4 shadow-[var(--shadow-soft)]"
                  >
                    <div className="text-[0.75rem] text-[var(--text-muted)]">{field.label}</div>
                    {field.isLink && field.value ? (
                      <a
                        href={field.value}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 break-all text-[0.875rem] leading-7 text-[var(--primary)]"
                      >
                        <Link2 className="h-4 w-4 shrink-0" />
                        <span>{field.value}</span>
                      </a>
                    ) : (
                      <div className="mt-2 break-words text-[0.9375rem] font-medium leading-7 text-[var(--text-main)]">
                        {field.value || '未标注'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <DetailSectionHeader title="内容摘要" />
              {detailData.paragraphPreview.length > 0 ? (
                <div className="space-y-4 rounded-[16px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-5 py-5 shadow-[var(--shadow-soft)]">
                  <div className="text-[0.75rem] text-[var(--text-muted)]">当前页面仅展示文档摘要，不展示完整正文。</div>
                  <DetailMarkdownPreview markdown={detailData.summaryMarkdown} />
                </div>
              ) : (
                <div className="text-[0.875rem] leading-7 text-[var(--text-muted)]">当前文档暂无可展示的内容摘要。</div>
              )}
            </div>
          </div>
        </ScenicPanel>

        <ScenicPanel className="h-full p-5">
          <div className="space-y-4">
            <DetailSectionHeader title="相关文档" />
            {relatedItems.length > 0 ? (
              <div className="space-y-3">
                {relatedItems.map((relatedItem) => (
                  <NavigateLinkCard
                    key={relatedItem.relativePath}
                    title={relatedItem.title}
                    meta={`${relatedItem.year || '未标注年份'} · ${relatedItem.categoryPathLabel}`}
                    to={withEmbed(`/documents/${encodeKnowledgeDocumentId(relatedItem.relativePath)}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-[0.875rem] leading-7 text-[var(--text-muted)]">当前分类下暂无其他相关文档。</div>
            )}
          </div>
        </ScenicPanel>
      </div>
    </div>
  )
}

function NavigateLinkCard({
  title,
  meta,
  to,
}: {
  title: string
  meta: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="block rounded-[16px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-[1px] hover:border-[rgba(var(--theme-soft-rgb),0.26)]"
    >
      <div className="text-[0.9375rem] font-semibold leading-7 text-[var(--text-main)]">{title}</div>
      <div className="mt-2 text-[0.75rem] leading-6 text-[var(--text-secondary)]">{meta}</div>
    </Link>
  )
}
