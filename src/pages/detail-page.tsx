import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { ArrowLeft, Columns3, Database, Download, ExternalLink, ImageOff, Leaf, Layers3, Link2, Mountain, PencilLine, RefreshCw, Sparkles, Star, Upload } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { LatestDataPreviewPanel } from '../components/latest-data-preview-panel'
import { LineageRelationGraph } from '../components/lineage-relation-graph'
import { ResourceLinkEditDialog } from '../components/resource-link-edit-dialog'
import { ResourceMapPreviewPanel } from '../components/resource-map-preview-panel'
import { ResourceEditDialog } from '../components/resource-edit-dialog'
import { DataItemsEditDialog, LineageEditDialog, PhysicalTablesEditDialog } from '../components/resource-structure-edit-dialog'
import { ScenicPanel, TopicPill } from '../components/ui'
import { canManageCatalogResources } from '../lib/admin-role'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import { buildDetailMetricSnapshot } from '../lib/detail-metric-snapshot'
import { usePortalAppCatalogData } from '../lib/nocobase-app-data'
import { buildResourceFavoriteIdentity, fetchFavoriteStatus, toggleFavorite } from '../lib/nocobase-favorites'
import { connectStatusMeta, formatMB, formatNumber, useLatestResourceBatchStat } from '../lib/nocobase-stat-data'
import { useSupplyDemandPortalData } from '../lib/nocobase-supply-demand-data'
import type { CatalogItem } from '../lib/nocobase-portal-data'
import { usePortalContext } from '../lib/portal-context'
import { buildExportedResourceConfig, importResourceConfig, parseImportedResourceConfigText } from '../lib/nocobase-resource-config-transfer'
import { buildResourceRelatedApplications } from '../lib/resource-application-scenes'

type DetailTabKey = 'basicInfo' | 'mapPreview' | 'linkInfo' | 'fields' | 'lineage' | 'physicalTables' | 'latestPreview' | 'similar' | 'applications'

type DetailPageLocationState = {
  returnTo?: string
}

type FieldGraphNode = {
  key: string
  fieldName: string
  englishName: string
  fieldType: string
  description: string
}

function clipText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}

function formatRatio(ratio: number | null | undefined) {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '-'
  const sign = ratio > 0 ? '+' : ''
  return `${sign}${(ratio * 100).toFixed(2)}%`
}

function isStrictDataResource(item: CatalogItem) {
  const serviceTypeId = item.serviceTypeId.trim()
  const serviceType = item.serviceType.replace(/\s+/g, '').trim()
  return serviceTypeId === '33' || serviceType === '数据资源'
}

function buildFieldGraphNodes(item: CatalogItem) {
  const normalized = item.fieldRows
    .map((field, index) => ({
      key: `${field.englishName || field.fieldName || 'field'}-${index}`,
      fieldName: field.fieldName || field.englishName || `字段${index + 1}`,
      englishName: field.englishName || `field_${index + 1}`,
      fieldType: field.fieldType || '未知类型',
      description: field.description || '暂无字段说明',
    }))
    .filter((field) => field.fieldName.trim().length > 0)

  if (normalized.length === 0) {
    return [
      {
        key: 'fallback-field',
        fieldName: '字段信息待补充',
        englishName: 'pending_field',
        fieldType: 'unknown',
        description: '当前资源字段清单尚未维护，请联系数据提供单位补充字段元数据。',
      },
    ]
  }

  return normalized
}

function splitPhysicalTableNames(value: string) {
  return value
    .split(/[、,，;；\n\r]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== '未标注')
}

function buildPhysicalTableState(item: CatalogItem) {
  const tables = Array.from(
    new Set(
      (item.physicalTables.tables.length > 0 ? item.physicalTables.tables : splitPhysicalTableNames(item.sourceTable))
        .map((table) => table.trim())
        .filter((table) => table.length > 0 && table !== '未标注'),
    ),
  )
  const sourceSystems = Array.from(
    new Set(
      item.physicalTables.sourceSystems
        .map((sourceSystem) => sourceSystem.trim())
        .filter((sourceSystem) => sourceSystem.length > 0 && sourceSystem !== '未标注'),
    ),
  )
  const baseline = item.physicalTables.baseline.trim() && item.physicalTables.baseline !== '未标注'
    ? item.physicalTables.baseline.trim()
    : tables[0] ?? ''
  const orderedRows = (
    item.physicalTables.rows.length > 0
      ? item.physicalTables.rows
      : tables.map((tableName) => ({
          tableName,
          sourceSystem: '',
          businessTimeField: tableName === baseline ? item.physicalTables.businessTimeField.trim() : '',
          isBaseline: tableName === baseline,
        }))
  )
    .map((row) => ({
      ...row,
      tableName: row.tableName.trim(),
      sourceSystem: row.sourceSystem.trim(),
      businessTimeField: row.businessTimeField.trim(),
      isBaseline: row.isBaseline || (!!baseline && row.tableName.trim() === baseline),
    }))
    .filter((row) => row.tableName.length > 0 && row.tableName !== '未标注')

  const uniqueRows = Array.from(
    new Map(orderedRows.map((row) => [row.tableName, row])).values(),
  )
  const rows = baseline
    ? [
        ...uniqueRows.filter((row) => row.tableName === baseline),
        ...uniqueRows.filter((row) => row.tableName !== baseline),
      ]
    : uniqueRows

  return { rows, sourceSystems, baseline }
}

function DetailSectionHeader({
  icon,
  title,
  badgeLabel,
  action,
}: {
  icon: ReactNode
  title: string
  badgeLabel?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[1.125rem] font-semibold text-[var(--text-main)]">
            <span className="text-[var(--primary)]">{icon}</span>
            <span>{title}</span>
          </div>
          {badgeLabel ? (
            <span className="inline-flex rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] font-semibold text-[var(--status-info-text)]">
              {badgeLabel}
            </span>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function FieldRelationGraph({ item }: { item: CatalogItem }) {
  const allFields = buildFieldGraphNodes(item)
  const maxVisible = 12
  const visibleFields = allFields.slice(0, maxVisible)
  const remaining = Math.max(0, allFields.length - maxVisible)
  const graphFields: FieldGraphNode[] =
    remaining > 0
      ? [
          ...visibleFields,
          {
            key: 'remaining-fields',
            fieldName: `其余 ${remaining} 项字段`,
            englishName: 'more_fields',
            fieldType: '汇总',
            description: `已在下方字段明细中展示剩余 ${remaining} 项。`,
          },
        ]
      : visibleFields

  const rowCount = Math.max(graphFields.length, 5)
  const graphHeight = Math.max(440, 140 + rowCount * 58)
  const graphWidth = 1120
  const source = { x: 188, y: graphHeight / 2, w: 228, h: 124 }
  const resource = { x: 560, y: graphHeight / 2, w: 286, h: 142 }
  const field = { x: 930, w: 258, h: 54, gap: 58 }
  const fieldStartY = (graphHeight - ((graphFields.length - 1) * field.gap + field.h)) / 2 + field.h / 2

  const sourceToResourcePath = `M ${source.x + source.w / 2 - 2} ${source.y} C ${source.x + 120} ${source.y - 24} ${resource.x - 130} ${resource.y - 18} ${resource.x - resource.w / 2 + 4} ${resource.y}`
  const linkPrefix = `field-link-${item.id}`

  return (
    <div className="mt-4 space-y-4 rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
      <div className="rounded-[10px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] px-3 py-2 text-[0.75rem] text-[var(--text-secondary)]">
        数据关系视图：左侧数据来源 -&gt; 中间资源节点 -&gt; 右侧字段清单
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${graphWidth} ${graphHeight}`}
          className="min-w-[1120px] rounded-[12px] border border-[var(--surface-outline)] bg-[radial-gradient(circle_at_18%_18%,rgba(173,214,255,0.16),transparent_40%),radial-gradient(circle_at_78%_25%,rgba(143,197,255,0.14),transparent_44%),linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          role="img"
          aria-label={`${item.name}数据字段关系图`}
        >
          <defs>
            <pattern id="grid-soft" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(139,182,231,0.32)" strokeWidth="1" />
            </pattern>
            <linearGradient id="flow-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(62,131,230,0.82)" />
              <stop offset="100%" stopColor="rgba(88,170,240,0.58)" />
            </linearGradient>
            <linearGradient id="node-left" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f4f9ff" />
              <stop offset="100%" stopColor="#e8f2ff" />
            </linearGradient>
            <linearGradient id="node-center" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#edf6ff" />
              <stop offset="100%" stopColor="#ddebff" />
            </linearGradient>
            <linearGradient id="node-right" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f8fbff" />
              <stop offset="100%" stopColor="#ecf4ff" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={graphWidth} height={graphHeight} fill="url(#grid-soft)" opacity="0.12" />

          <path d={sourceToResourcePath} fill="none" stroke="url(#flow-stroke)" strokeWidth="3" strokeDasharray="8 10" opacity="0.95">
            <animate attributeName="stroke-dashoffset" from="0" to="-72" dur="4.2s" repeatCount="indefinite" />
          </path>
          <circle r="4.2" fill="rgba(73,156,240,0.9)">
            <animateMotion dur="2.8s" repeatCount="indefinite" rotate="auto">
              <mpath href={`#${linkPrefix}-source`} />
            </animateMotion>
          </circle>
          <path id={`${linkPrefix}-source`} d={sourceToResourcePath} fill="none" stroke="none" />

          {graphFields.map((fieldNode, index) => {
            const y = fieldStartY + index * field.gap
            const pathId = `${linkPrefix}-${index}`
            const fieldPath = `M ${resource.x + resource.w / 2 - 4} ${resource.y} C ${resource.x + 165} ${resource.y + (index % 2 === 0 ? -8 : 8)} ${field.x - 180} ${y} ${field.x - field.w / 2 + 2} ${y}`

            return (
              <g key={fieldNode.key}>
                <path id={pathId} d={fieldPath} fill="none" stroke="rgba(88,164,238,0.72)" strokeWidth="2.1" strokeDasharray="6 8">
                  <animate attributeName="stroke-dashoffset" from="0" to="-56" dur={`${3 + index * 0.18}s`} repeatCount="indefinite" />
                </path>
                <circle r="3.2" fill="rgba(48,133,226,0.95)">
                  <animateMotion dur={`${2.2 + index * 0.14}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                </circle>
                <rect
                  x={field.x - field.w / 2}
                  y={y - field.h / 2}
                  width={field.w}
                  height={field.h}
                  rx="14"
                  fill="url(#node-right)"
                  stroke="rgba(126,180,241,0.64)"
                />
                <text x={field.x - field.w / 2 + 14} y={y - 4} fill="#2d4a67" fontSize="0.8125rem" fontWeight="600">
                  {clipText(fieldNode.fieldName, 17)}
                </text>
                <text x={field.x - field.w / 2 + 14} y={y + 15} fill="#6f87a1" fontSize="0.6875rem">
                  {clipText(`${fieldNode.englishName} · ${fieldNode.fieldType}`, 31)}
                </text>
              </g>
            )
          })}

          <circle cx={source.x - source.w / 2 + 20} cy={source.y - 42} r="10" fill="rgba(77,150,233,0.18)">
            <animate attributeName="r" values="8;12;8" dur="3.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.25;0.55;0.25" dur="3.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={resource.x + resource.w / 2 - 20} cy={resource.y + 44} r="12" fill="rgba(84,170,245,0.2)">
            <animate attributeName="r" values="10;14;10" dur="2.9s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0.52;0.2" dur="2.9s" repeatCount="indefinite" />
          </circle>

          <rect
            x={source.x - source.w / 2}
            y={source.y - source.h / 2}
            width={source.w}
            height={source.h}
            rx="18"
            fill="url(#node-left)"
            stroke="rgba(114,172,238,0.7)"
            strokeWidth="1.2"
          />
          <text x={source.x - source.w / 2 + 18} y={source.y - 28} fill="#5a7692" fontSize="0.75rem">
            数据来源
          </text>
          <text x={source.x - source.w / 2 + 18} y={source.y - 6} fill="#274460" fontSize="1rem" fontWeight="700">
            {clipText(item.department, 16)}
          </text>
          <text x={source.x - source.w / 2 + 18} y={source.y + 16} fill="#6b84a0" fontSize="0.6875rem">
            系统：{clipText(item.sourceSystem, 20)}
          </text>
          <text x={source.x - source.w / 2 + 18} y={source.y + 35} fill="#6b84a0" fontSize="0.6875rem">
            表：{clipText(item.sourceTable, 20)}
          </text>

          <rect
            x={resource.x - resource.w / 2}
            y={resource.y - resource.h / 2}
            width={resource.w}
            height={resource.h}
            rx="22"
            fill="url(#node-center)"
            stroke="rgba(95,162,235,0.76)"
            strokeWidth="1.3"
          />
          <text x={resource.x - resource.w / 2 + 22} y={resource.y - 34} fill="#5f7d9a" fontSize="0.75rem">
            数据资源节点
          </text>
          <text x={resource.x - resource.w / 2 + 22} y={resource.y - 10} fill="#223f59" fontSize="1.125rem" fontWeight="700">
            {clipText(item.name, 20)}
          </text>
          <text x={resource.x - resource.w / 2 + 22} y={resource.y + 15} fill="#65809c" fontSize="0.6875rem">
            编码：{clipText(item.code, 26)}
          </text>
          <text x={resource.x - resource.w / 2 + 22} y={resource.y + 34} fill="#65809c" fontSize="0.6875rem">
            类型：{clipText(item.serviceType, 20)} · 共享：{clipText(item.openType, 12)}
          </text>
        </svg>
      </div>

      <div className="rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-3 text-[0.75rem] text-[var(--text-secondary)]">
        说明：可视化图中默认展示前 {maxVisible} 项字段
        {remaining > 0 ? `（其余 ${remaining} 项字段已在下方明细列出）` : '。'}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {allFields.map((fieldNode) => (
          <div
            key={`detail-${fieldNode.key}`}
            className="rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-4 py-3 shadow-[var(--shadow-soft)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.875rem] font-semibold text-[var(--text-main)]">{fieldNode.fieldName}</div>
              <span className="rounded-full bg-[var(--status-info-bg)] px-2.5 py-0.5 text-[0.6875rem] text-[var(--status-info-text)]">
                {fieldNode.fieldType}
              </span>
            </div>
            <div className="mt-1 text-[0.75rem] text-[var(--text-muted)]">{fieldNode.englishName}</div>
            <div className="mt-2 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{fieldNode.description}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PhysicalTableList({ item }: { item: CatalogItem }) {
  const { rows } = buildPhysicalTableState(item)

  return (
    <div className="mt-4 rounded-[10px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 text-[0.875rem] text-[var(--text-secondary)]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-[1.125rem] font-semibold text-[var(--text-main)]">物理表清单</div>
        <span className="rounded-full bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-info-text)]">
          共 {rows.length} 张表
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-[10px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 text-[0.875rem] text-[var(--text-secondary)]">
          当前资源尚未维护物理表清单，可先通过右上角编辑入口补充基准表、业务时间字段和物理表信息。
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row, index) => {
            const isBaseline = row.isBaseline

            return (
              <div
                key={`${row.tableName}-${index}`}
                className="rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-4 shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[0.75rem] text-[var(--text-muted)]">物理表 {String(index + 1).padStart(2, '0')}</div>
                    <div className="mt-2 break-all text-[0.9375rem] font-semibold leading-6 text-[var(--text-main)]">{row.tableName}</div>
                    {row.businessTimeField ? (
                      <div className="mt-3 rounded-[10px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-muted),var(--surface-tint))] px-3 py-2 text-[0.75rem] text-[var(--text-secondary)]">
                        业务时间字段：{row.businessTimeField}
                      </div>
                    ) : null}
                  </div>
                  {isBaseline ? (
                    <span className="shrink-0 rounded-full bg-[var(--status-info-bg)] px-2.5 py-1 text-[0.6875rem] font-medium text-[var(--status-info-text)]">
                      基准表
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function LinkInfoList({ item }: { item: CatalogItem }) {
  const detailLinks = item.linkInfo.items.filter((entry) => entry.url.trim().length > 0)
  const normalizedLinks =
    item.linkInfo.primary.trim() && !detailLinks.some((entry) => entry.url.trim() === item.linkInfo.primary.trim())
      ? [{ label: '主链接', url: item.linkInfo.primary.trim(), description: '' }, ...detailLinks]
      : detailLinks
  const primaryIndex = item.linkInfo.primary.trim()
    ? normalizedLinks.findIndex((entry) => entry.url.trim() === item.linkInfo.primary.trim())
    : -1
  const primaryLink = primaryIndex >= 0 ? normalizedLinks[primaryIndex] : null
  const otherLinks = normalizedLinks.filter((_, index) => index !== primaryIndex)

  if (normalizedLinks.length === 0) {
    return (
      <div className="mt-4 rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-8 text-[0.875rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
        当前资源尚未维护访问链接，可通过右上角编辑入口补充服务地址、在线预览或下载地址。
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      {primaryLink ? (
        <div className="rounded-[14px] border border-[rgba(var(--theme-soft-rgb),0.24)] bg-[linear-gradient(135deg,var(--surface-raised-strong),color-mix(in_srgb,var(--primary-soft)_72%,var(--surface-muted)))] p-5 shadow-[0_18px_36px_rgba(var(--theme-soft-rgb),0.12)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] font-semibold text-[var(--status-info-text)]">
                  主链接
                </span>
                <span className="text-[0.875rem] font-semibold text-[var(--text-main)]">{primaryLink.label || '主链接'}</span>
              </div>
              <div className="mt-4 break-all text-[0.9375rem] leading-7 text-[var(--text-main)]">{primaryLink.url}</div>
              <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{primaryLink.description || '未填写链接说明'}</div>
            </div>
            <a
              href={primaryLink.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <ExternalLink className="h-4 w-4" />
              打开链接
            </a>
          </div>
        </div>
      ) : null}

      {otherLinks.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {otherLinks.map((entry, index) => (
            <div
              key={`${entry.label}-${entry.url}-${index}`}
              className="rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[0.9375rem] font-semibold text-[var(--text-main)]">{entry.label || `链接 ${index + 1}`}</div>
                  <div className="mt-3 break-all text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{entry.url}</div>
                  <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{entry.description || '未填写链接说明'}</div>
                </div>
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] px-4 text-[0.8125rem] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  <ExternalLink className="h-4 w-4" />
                  打开
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function DetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data, isBootstrapping, isAuthenticated, isLoading, refresh, session } = usePortalContext()
  const { catalogItems } = data
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editSuccessMessage, setEditSuccessMessage] = useState('')
  const [tabEditSuccessMessage, setTabEditSuccessMessage] = useState('')
  const [isDataItemsEditOpen, setIsDataItemsEditOpen] = useState(false)
  const [isLinkInfoEditOpen, setIsLinkInfoEditOpen] = useState(false)
  const [isLineageEditOpen, setIsLineageEditOpen] = useState(false)
  const [isPhysicalTablesEditOpen, setIsPhysicalTablesEditOpen] = useState(false)
  const [isFavorited, setIsFavorited] = useState(false)
  const [favoriteError, setFavoriteError] = useState('')
  const [isFavoriteStatusLoading, setIsFavoriteStatusLoading] = useState(false)
  const [isFavoriteSubmitting, setIsFavoriteSubmitting] = useState(false)
  const [managementErrorMessage, setManagementErrorMessage] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const canManageResources = canManageCatalogResources(session?.user.roles)
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const locationState = (location.state ?? null) as DetailPageLocationState | null
  const returnTo = typeof locationState?.returnTo === 'string' && locationState.returnTo.trim().length > 0
    ? locationState.returnTo
    : ''
  const handleGoBack = () => {
    if (returnTo) {
      navigate(returnTo)
      return
    }
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate(withEmbed('/catalog'))
  }
  const requestedTab = searchParams.get('tab') as DetailTabKey | null
  const item = catalogItems.find((entry) => entry.id === id)
  const isMapApiResource = Boolean(item?.mapPreview)
  const defaultTab: DetailTabKey = isMapApiResource ? 'mapPreview' : 'basicInfo'
  const shouldShowLinkInfoTab = item ? !isStrictDataResource(item) : false
  const baseDetailTabs: Array<[DetailTabKey, string]> = isMapApiResource
    ? [
        ['mapPreview', '地图预览'],
        ['basicInfo', '基础信息'],
        ['linkInfo', '链接信息'],
        ['fields', '数据项'],
        ['lineage', '血缘关系'],
        ['physicalTables', '物理表清单'],
        ['latestPreview', '最新数据预览'],
        ['similar', '相似数据'],
        ['applications', '相关应用'],
      ]
    : [
        ['basicInfo', '基础信息'],
        ['linkInfo', '链接信息'],
        ['fields', '数据项'],
        ['lineage', '血缘关系'],
        ['physicalTables', '物理表清单'],
        ['latestPreview', '最新数据预览'],
        ['similar', '相似数据'],
        ['applications', '相关应用'],
      ]
  const detailTabs: Array<[DetailTabKey, string]> = baseDetailTabs.filter(([key]) => shouldShowLinkInfoTab || key !== 'linkInfo')
  const activeTab = detailTabs.some(([key]) => key === requestedTab) ? (requestedTab as DetailTabKey) : defaultTab
  const favoriteDetailUrl = id ? withEmbed(`/catalog/${id}`) : ''
  const statEnabled = !isLoading && !isBootstrapping && Boolean(item)
  const relatedApplicationsEnabled = statEnabled && activeTab === 'applications'
  const { data: latestBatchStat, isLoading: isLatestBatchStatLoading, error: latestBatchStatError } =
    useLatestResourceBatchStat(item?.id, statEnabled)
  const {
    data: supplyDemandItems,
    isLoading: isRelatedApplicationsLoading,
    error: relatedApplicationsError,
  } = useSupplyDemandPortalData(relatedApplicationsEnabled, { includeRelatedApps: true })
  const { data: relatedApplicationCatalog } = usePortalAppCatalogData(relatedApplicationsEnabled)

  useEffect(() => {
    let cancelled = false

    if (!isAuthenticated || !item) {
      setIsFavorited(false)
      setFavoriteError('')
      setIsFavoriteStatusLoading(false)
      return () => {
        cancelled = true
      }
    }

    setIsFavoriteStatusLoading(true)

    fetchFavoriteStatus(buildResourceFavoriteIdentity(item.id, favoriteDetailUrl))
      .then((result) => {
        if (cancelled) return
        setIsFavorited(result.isFavorited)
        setFavoriteError('')
      })
      .catch((statusError) => {
        if (cancelled) return
        setIsFavorited(false)
        setFavoriteError(statusError instanceof Error ? statusError.message : '收藏状态加载失败')
      })
      .finally(() => {
        if (!cancelled) {
          setIsFavoriteStatusLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [favoriteDetailUrl, isAuthenticated, item])

  if (isLoading) {
    return <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载数据...</div>
  }

  if (!item) {
    return <Navigate to={withEmbed('/catalog')} replace />
  }

  const currentResourceIdentity = {
    resourceId: item.id,
    resourceCode: item.code,
    resourceName: item.name,
  }
  const supportsApi = item.format.includes('API')
  const supportsDownload = item.format.some((format) => ['XLS', 'CSV', 'JSON'].includes(format))
  const hasApiContent = item.apiCount > 0
  const serviceSummary =
    item.serviceType === '数据接口' ? '接口服务' : item.serviceType === '数据下载' ? '目录下载' : '接口服务 / 目录下载'
  const physicalTableState = buildPhysicalTableState(item)
  const latestStatRecord = latestBatchStat.record
  const detailMetricSnapshot = buildDetailMetricSnapshot({
    fallbackCount: '未标注',
    fallbackUpdateCycle: '未标注',
    department: item.department,
    serviceSummary,
    latestRecord: latestStatRecord,
  })

  const detailRows = [
    ['摘要', item.summary, ''],
    ['标签', item.tags.join('、'), ''],
    ['数据资源分类', item.businessCategoryPath, '共享属性', item.openType],
    ['来源单位', item.department, '联系方式', item.contact],
  ]

  const archiveStats = [
    { title: '数据量', value: detailMetricSnapshot.countText, icon: <Database className="h-5 w-5" /> },
    { title: '业务数据更新时间', value: detailMetricSnapshot.updateTimeText, icon: <Leaf className="h-5 w-5" /> },
    { title: '更新周期', value: item.updateCycle || '未标注', icon: <RefreshCw className="h-5 w-5" /> },
    { title: '地区范围', value: item.areaScope, icon: <Mountain className="h-5 w-5" /> },
  ]
  const latestStatus = latestStatRecord ? connectStatusMeta(latestStatRecord.connectStatus) : null
  const latestStatMetrics = latestStatRecord
    ? [
        {
          title: '记录量',
          value: `${formatNumber(latestStatRecord.metainfo.record_count ?? 0)} 条`,
          source: 'stat_metainfo.record_count',
        },
        {
          title: '存储量',
          value: formatMB(latestStatRecord.metainfo.storage_bytes ?? 0),
          source: 'stat_metainfo.storage_bytes',
        },
        {
          title: '字段数',
          value: formatNumber(latestStatRecord.metainfo.field_count ?? 0),
          source: 'stat_metainfo.field_count',
        },
        {
          title: '有值字段',
          value: formatNumber(latestStatRecord.metainfo.non_null_field_count ?? 0),
          source: 'stat_metainfo.non_null_field_count',
        },
        {
          title: '记录日同比',
          value: formatRatio(latestStatRecord.dayOnDay.record_count?.ratio),
          source: 'stat_dayonday.record_count.ratio',
        },
      ]
    : []

  const similarEntries = catalogItems.filter(
    (entry) =>
      entry.id !== item.id
      && isStrictDataResource(entry)
      && entry.category === item.category,
  )
  const similarRecommendations =
    similarEntries.slice(0, 4).map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.summary,
      meta: entry.category === item.category ? '同主题资源' : '相关资源',
    }))

  const relatedApplicationCatalogById = new Map(relatedApplicationCatalog.flatItems.map((entry) => [entry.id, entry] as const))
  const relatedApplications = buildResourceRelatedApplications(item.id, supplyDemandItems, relatedApplicationCatalogById)
  const matchedSupplyDemandItems = supplyDemandItems.filter((entry) => entry.linkedResourceIds.includes(item.id))

  const buildTabSearchParams = (tabKey: DetailTabKey) => {
    const next = new URLSearchParams()
    next.set('tab', tabKey)
    if (isEmbedMode) {
      next.set('embed', '1')
    }
    return next
  }

  const handleTabChange = (tabKey: DetailTabKey) => {
    navigate(
      { pathname: location.pathname, search: `?${buildTabSearchParams(tabKey).toString()}` },
      { replace: true, state: locationState ?? undefined },
    )
  }

  const tabsNav = (
      <div className="mt-8 flex gap-4 border-b border-[var(--line)]">
      {detailTabs.map(([key, label]) => (
        <button
          type="button"
          key={key}
          className={`relative -mb-px inline-flex min-h-12 items-center rounded-t-[14px] border border-transparent px-4 pb-3 pt-3 text-[0.9375rem] ${
            activeTab === key
                ? 'z-10 -translate-y-[1px] border-[rgba(var(--theme-soft-rgb),0.24)] border-b-[var(--surface-raised-strong)] bg-[linear-gradient(180deg,var(--surface-raised-strong),color-mix(in_srgb,var(--primary-soft)_72%,var(--surface-raised)))] font-semibold text-[var(--primary)] shadow-[0_16px_32px_rgba(var(--theme-soft-rgb),0.14)]'
                : 'text-[var(--text-secondary)] transition hover:-translate-y-[1px] hover:border-[var(--surface-outline)] hover:bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] hover:text-[var(--primary)]'
            }`}
          onClick={() => handleTabChange(key as DetailTabKey)}
        >
          {label}
          {activeTab === key ? <span className="absolute left-1/2 bottom-1.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,var(--theme-accent),var(--primary))]" /> : null}
        </button>
      ))}
    </div>
  )

  const tabEditButtonClass = 'inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]'

  const clearManagementMessages = () => {
    setEditSuccessMessage('')
    setTabEditSuccessMessage('')
    setManagementErrorMessage('')
  }

  const handleToggleFavorite = async () => {
    setFavoriteError('')
    setIsFavoriteSubmitting(true)

    try {
      const result = await toggleFavorite(buildResourceFavoriteIdentity(item.id, favoriteDetailUrl))
      setIsFavorited(result.isFavorited)
    } catch (toggleError) {
      setFavoriteError(toggleError instanceof Error ? toggleError.message : '收藏操作失败')
    } finally {
      setIsFavoriteSubmitting(false)
    }
  }

  const handleExportConfig = async () => {
    clearManagementMessages()
    setIsExporting(true)

    try {
      const payload = await buildExportedResourceConfig(item.id)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${item.code || item.id}-structure-config-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setTabEditSuccessMessage('配置 JSON 已导出。')
    } catch (error) {
      setManagementErrorMessage(error instanceof Error ? error.message : '导出配置失败')
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportConfigFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!file) return

    clearManagementMessages()
    setIsImporting(true)

    try {
      const text = await file.text()
      const config = parseImportedResourceConfigText(text, currentResourceIdentity)
      await importResourceConfig(config, currentResourceIdentity)
      await refresh()
      setTabEditSuccessMessage('结构配置已导入到当前资源，并已刷新详情。')
    } catch (error) {
      setManagementErrorMessage(error instanceof Error ? error.message : '导入配置失败')
    } finally {
      setIsImporting(false)
    }
  }

  const latestStatPanel = (
    <div className="mt-5 rounded-[10px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.8125rem] font-semibold text-[var(--status-info-text)]">
            最新情况统计
          </span>
          <span className="text-[0.75rem] text-[var(--text-muted)]">统计批次：{latestBatchStat.latestPeriodCode || '-'}</span>
        </div>
        {latestStatus ? (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.75rem] ${latestStatus.toneClass}`}>{latestStatus.label}</span>
        ) : null}
      </div>

      {isLatestBatchStatLoading ? (
        <div className="mt-3 rounded-[8px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-2 text-[0.8125rem] text-[var(--text-secondary)]">
          正在读取最新批次统计信息...
        </div>
      ) : null}

      {!isLatestBatchStatLoading && latestBatchStatError ? (
        <div className="mt-3 rounded-[8px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-[0.8125rem] text-[var(--status-danger-text)]">{latestBatchStatError}</div>
      ) : null}

      {!isLatestBatchStatLoading && !latestBatchStatError && latestStatRecord ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {latestStatMetrics.map((metric) => (
            <div
              key={metric.title}
              className="rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              <div className="text-[0.75rem] text-[var(--text-muted)]">{metric.title}</div>
              <div className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{metric.value}</div>
              <div className="mt-1 text-[0.6875rem] text-[var(--text-muted)]">来源 {metric.source}</div>
            </div>
          ))}
        </div>
      ) : null}

      {!isLatestBatchStatLoading && !latestBatchStatError && !latestStatRecord ? (
        <div className="mt-3 rounded-[8px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-2 text-[0.8125rem] text-[var(--text-secondary)]">
          {latestBatchStat.latestPeriodCode
            ? `最新批次（${latestBatchStat.latestPeriodCode}）暂无当前资源的统计记录。`
            : '暂无可用统计批次。'}
        </div>
      ) : null}
    </div>
  )

  const basicInfoActionButtons = canManageResources ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => {
          clearManagementMessages()
          setIsEditOpen(true)
        }}
        className={tabEditButtonClass}
      >
        <PencilLine className="h-4 w-4" />
        编辑资源
      </button>
      <button
        type="button"
        onClick={() => {
          void handleExportConfig()
        }}
        disabled={isExporting || isImporting}
        className={tabEditButtonClass}
      >
        <Download className="h-4 w-4" />
        {isExporting ? '导出中...' : '导出配置'}
      </button>
      <button
        type="button"
        onClick={() => importInputRef.current?.click()}
        disabled={isExporting || isImporting}
        className={tabEditButtonClass}
      >
        <Upload className="h-4 w-4" />
        {isImporting ? '导入中...' : '导入配置'}
      </button>
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          void handleImportConfigFile(event)
        }}
      />
    </div>
  ) : null

  const basicInfoPanel = (
    <div className="mt-[1px] rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-6 shadow-[var(--shadow-medium)]">
      <div className="space-y-10">
        <div>
          <div className="mb-4">
            <DetailSectionHeader
              icon={<Database className="h-5 w-5" />}
              title="基础信息"
              action={basicInfoActionButtons}
            />
          </div>

          <div className="mt-8 overflow-hidden rounded-[10px] border border-[var(--line-soft)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            {detailRows.map((row, index) => (
              <div
                key={`${row[0]}-${index}`}
                className="grid border-b border-[var(--line-soft)] last:border-b-0 lg:grid-cols-[108px_minmax(320px,1.7fr)_108px_minmax(240px,1fr)]"
              >
                <div className="border-b border-[var(--line-soft)] bg-[var(--table-header-bg)] px-4 py-4 text-[0.8125rem] font-medium whitespace-nowrap text-[var(--text-secondary)] lg:border-b-0">
                  {row[0]}
                </div>
                <div
                  className={`px-4 py-4 text-[0.875rem] leading-7 text-[var(--text-main)] ${
                    row[2] ? '' : 'lg:col-span-3'
                  }`}
                >
                  {row[1]}
                </div>
                {row[2] ? (
                  <>
                    <div className="border-t border-[var(--line-soft)] bg-[var(--table-header-bg)] px-4 py-4 text-[0.8125rem] font-medium whitespace-nowrap text-[var(--text-secondary)] lg:border-t-0 lg:border-l lg:border-[var(--line-soft)]">
                      {row[2]}
                    </div>
                    <div className="px-4 py-4 text-[0.875rem] leading-7 text-[var(--text-main)]">{row[3] ?? ''}</div>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div>
          {latestStatPanel}
        </div>

        {hasApiContent ? (
          <div>
            <div className="mb-4 flex items-center gap-2 text-[1.125rem] font-semibold text-[var(--text-main)]">
              <span className="text-[1.375rem] leading-none text-[var(--primary)]">|</span>
              <span>资源内容</span>
            </div>
            <div className="overflow-hidden rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-raised-strong)] shadow-[var(--shadow-soft)]">
              {supportsDownload ? (
                <div className="grid items-stretch border-b border-[var(--line-soft)] last:border-b-0 lg:grid-cols-[132px_minmax(320px,1fr)_220px]">
                  <div className="flex items-center bg-[var(--table-header-bg)] px-5 py-4 text-[0.875rem] font-medium whitespace-nowrap text-[var(--text-secondary)]">
                    数据集
                  </div>
                  <div className="flex min-h-[84px] flex-wrap content-center items-center gap-3 px-5 py-4">
                    {item.format.filter((format) => ['XLS', 'CSV', 'JSON'].includes(format)).map((format) => (
                      <span
                        key={format}
                        className="inline-flex h-10 items-center rounded-[10px] border border-[rgba(var(--theme-soft-rgb),0.24)] bg-[var(--status-info-bg)] px-4 text-[0.875rem] font-medium text-[var(--status-info-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      >
                        {format}
                      </span>
                    ))}
                  </div>
                  <div className="flex min-h-[84px] items-center justify-end gap-4 border-t border-[var(--line-soft)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-5 py-4 text-[0.8125rem] text-[var(--text-muted)] lg:border-l lg:border-t-0">
                    <span className="inline-flex h-9 items-center rounded-full bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 font-medium text-white shadow-[0_10px_22px_rgba(var(--theme-strong-rgb),0.18)]">
                      查看
                    </span>
                  </div>
                </div>
              ) : null}
              {supportsApi ? (
                <div className="grid items-stretch border-b border-[var(--line-soft)] last:border-b-0 lg:grid-cols-[132px_minmax(320px,1fr)_220px]">
                  <div className="flex items-center bg-[var(--table-header-bg)] px-5 py-4 text-[0.875rem] font-medium whitespace-nowrap text-[var(--text-secondary)]">
                    数据接口
                  </div>
                  <div className="flex min-h-[84px] items-center gap-3 px-5 py-4">
                    <span className="inline-flex h-10 items-center rounded-[10px] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 text-[0.875rem] font-medium text-[var(--status-warning-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                      API
                    </span>
                    <span className="text-[0.8125rem] text-[var(--text-secondary)]">支持标准 JSON 响应与授权访问控制</span>
                  </div>
                  <div className="flex min-h-[84px] items-center justify-end gap-4 border-t border-[var(--line-soft)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] px-5 py-4 text-[0.8125rem] text-[var(--text-muted)] lg:border-l lg:border-t-0">
                    <span className="inline-flex h-9 items-center rounded-full bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] px-4 font-medium text-white shadow-[0_10px_22px_rgba(var(--theme-strong-rgb),0.18)]">
                      查看
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return (
    <div>
      <ScenicPanel className="overflow-hidden border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] p-0 shadow-[var(--shadow-elevated)]">
        <div className="pointer-events-none absolute left-[-80px] top-[-80px] h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(var(--theme-soft-rgb),0.12),transparent_70%)]" />
        <div className="pointer-events-none absolute right-[-100px] top-[-40px] h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(var(--theme-strong-rgb),0.10),transparent_72%)]" />
        <div className="px-6 py-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="max-w-[820px] text-[1.875rem] font-semibold leading-[1.34] text-[var(--text-main)]">{item.name}</h1>
                  {latestStatus ? (
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[0.8125rem] font-semibold ${latestStatus.toneClass}`}>{latestStatus.label}</span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={isFavoriteSubmitting || isFavoriteStatusLoading}
                    onClick={() => void handleToggleFavorite()}
                    className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[0.8125rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      isFavorited
                        ? 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
                        : 'border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                    }`}
                  >
                    <Star className={`h-4 w-4 ${isFavorited ? 'fill-current' : ''}`} />
                    {isFavoriteSubmitting ? '处理中...' : isFavorited ? '已收藏' : '收藏资源'}
                  </button>
                  <span className="text-[0.75rem] text-[var(--text-muted)]">收藏后可在个人中心快速返回当前资源。</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleGoBack}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] shadow-[0_10px_24px_rgba(51,98,146,0.08)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                返回上一页
              </button>
            </div>
            {favoriteError ? (
              <div className="mt-4 rounded-[10px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
                {favoriteError}
              </div>
            ) : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {archiveStats.map((stat, index) => (
                <div
                  key={stat.title}
                  className={`rounded-[12px] border px-4 py-4 shadow-[0_16px_32px_rgba(39,80,120,0.08)] backdrop-blur ${
                    index % 2 === 1
                      ? 'border-[rgba(211,232,221,0.42)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--status-success-bg)_82%,var(--surface-raised-strong)),var(--surface-muted))]'
                      : 'border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${index % 2 === 1 ? 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]' : 'bg-[var(--status-info-bg)] text-[var(--status-info-text)]'}`}>
                      {stat.icon}
                    </div>
                    <div>
                      <div className="text-[0.75rem] text-[var(--text-muted)]">{stat.title}</div>
                      <div className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{stat.value}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScenicPanel>

      {tabsNav}

      {editSuccessMessage ? (
        <div className="mt-4 rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-success-text)]">{editSuccessMessage}</div>
      ) : null}
      {managementErrorMessage ? (
        <div className="mt-4 rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-danger-text)]">{managementErrorMessage}</div>
      ) : null}
      {tabEditSuccessMessage ? (
        <div className="mt-4 rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-[0.8125rem] text-[var(--status-success-text)]">{tabEditSuccessMessage}</div>
      ) : null}

      {activeTab === 'mapPreview' && item.mapPreview ? (
        <ResourceMapPreviewPanel
          preview={item.mapPreview}
          resourceName={item.name}
        />
      ) : null}

      {activeTab === 'basicInfo' ? basicInfoPanel : null}

      {activeTab === 'linkInfo' ? (
        <div className="mt-[1px] rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-6 shadow-[var(--shadow-medium)]">
          <div className="mb-4">
            <DetailSectionHeader
              icon={<Link2 className="h-5 w-5" />}
              title="链接信息"
              badgeLabel={latestStatus ? latestStatus.label : undefined}
              action={
                canManageResources ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditSuccessMessage('')
                      setTabEditSuccessMessage('')
                      setIsLinkInfoEditOpen(true)
                    }}
                    className={tabEditButtonClass}
                  >
                    <PencilLine className="h-4 w-4" />
                    编辑链接信息
                  </button>
                ) : null
              }
            />
          </div>
          <LinkInfoList item={item} />
        </div>
      ) : null}

      {activeTab === 'fields' ? (
        <div className="mt-[1px] rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-6 shadow-[var(--shadow-medium)]">
          <div className="mb-4">
            <DetailSectionHeader
              icon={<Columns3 className="h-5 w-5" />}
              title="数据项"
              action={
                canManageResources ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditSuccessMessage('')
                      setTabEditSuccessMessage('')
                      setIsDataItemsEditOpen(true)
                    }}
                    className={tabEditButtonClass}
                  >
                    <PencilLine className="h-4 w-4" />
                    编辑数据项
                  </button>
                ) : null
              }
            />
          </div>
          <FieldRelationGraph item={item} />
        </div>
      ) : null}

      {activeTab === 'lineage' ? (
        <div className="mt-[1px] rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-6 shadow-[var(--shadow-medium)]">
          <div className="mb-4">
            <DetailSectionHeader
              icon={<Link2 className="h-5 w-5" />}
              title="血缘关系"
              action={
                canManageResources ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditSuccessMessage('')
                      setTabEditSuccessMessage('')
                      setIsLineageEditOpen(true)
                    }}
                    className={tabEditButtonClass}
                  >
                    <PencilLine className="h-4 w-4" />
                    编辑血缘关系
                  </button>
                ) : null
              }
            />
          </div>
          <LineageRelationGraph item={item} catalogItems={catalogItems} />
        </div>
      ) : null}

      {activeTab === 'physicalTables' ? (
        <div className="mt-[1px] rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-6 shadow-[var(--shadow-medium)]">
          <div className="mb-4">
            <DetailSectionHeader
              icon={<Database className="h-5 w-5" />}
              title="物理表清单"
              action={
                canManageResources ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditSuccessMessage('')
                      setTabEditSuccessMessage('')
                      setIsPhysicalTablesEditOpen(true)
                    }}
                    className={tabEditButtonClass}
                  >
                    <PencilLine className="h-4 w-4" />
                    编辑物理表
                  </button>
                ) : null
              }
            />
          </div>
          <PhysicalTableList item={item} />
        </div>
      ) : null}

      {activeTab === 'latestPreview' ? (
        <LatestDataPreviewPanel
          baselineTableName={physicalTableState.baseline}
          sourceSystems={physicalTableState.sourceSystems}
          previewData={latestStatRecord?.latestPreviewData ?? null}
          isLoading={isLatestBatchStatLoading}
          errorMessage={latestBatchStatError}
          latestPeriodCode={latestBatchStat.latestPeriodCode}
        />
      ) : null}

      {activeTab === 'similar' ? (
        <div className="mt-[1px] rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-6 text-[0.875rem] text-[var(--text-secondary)] shadow-[var(--shadow-medium)]">
          <DetailSectionHeader icon={<Sparkles className="h-5 w-5" />} title="相似数据推荐" />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {similarRecommendations.map((entry) => (
              <Link
                key={entry.id}
                to={withEmbed(`/catalog/${entry.id}`)}
                state={returnTo ? { returnTo } : undefined}
                className="block rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-4 transition hover:bg-[var(--surface-muted)] hover:text-[var(--primary)] hover:shadow-[inset_0_0_0_1px_rgba(44,131,220,0.10),0_12px_24px_rgba(39,80,120,0.05)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[1.125rem] font-semibold text-[var(--text-main)]">{entry.name}</div>
                  <span className="rounded-full bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-info-text)]">
                    {entry.meta}
                  </span>
                </div>
                <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{entry.description}</div>
              </Link>
            ))}
          </div>
          {similarRecommendations.length === 0 ? (
            <div className="mt-4 rounded-[12px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-8 text-center text-[0.8125rem] text-[var(--text-secondary)]">
              后台暂无同主题相似数据资源。
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'applications' ? (
        <div className="mt-[1px] rounded-[12px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-6 text-[0.875rem] text-[var(--text-secondary)] shadow-[var(--shadow-medium)]">
          <DetailSectionHeader icon={<Layers3 className="h-5 w-5" />} title="相关应用" />
          {isRelatedApplicationsLoading ? (
            <div className="mt-4 rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-6 text-[0.8125rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
              正在根据供需对接中的关联数据资源匹配相关应用...
            </div>
          ) : null}
          {!isRelatedApplicationsLoading && relatedApplicationsError ? (
            <div className="mt-4 rounded-[12px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-6 text-[0.8125rem] text-[var(--status-danger-text)] shadow-[var(--shadow-soft)]">
              {relatedApplicationsError}
            </div>
          ) : null}
          {!isRelatedApplicationsLoading && !relatedApplicationsError && relatedApplications.length === 0 ? (
            <div className="mt-4 rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-6 text-[0.8125rem] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
              {matchedSupplyDemandItems.length > 0
                ? '当前资源已在供需对接中建立相关数据资源关联，但这些供需记录尚未维护相关应用。'
                : '当前资源尚未在供需对接中建立相关数据资源关联，请先在供需对接信息中维护相关数据资源。'}
            </div>
          ) : null}
          {!isRelatedApplicationsLoading && !relatedApplicationsError && relatedApplications.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {relatedApplications.map((application, index) => {
                return (
                  <article
                    key={application.appId || application.appName}
                    className="rounded-[14px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-[1px] hover:shadow-[var(--shadow-medium)]"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${
                          index % 2 === 0
                            ? 'bg-[var(--status-info-bg)] text-[var(--status-info-text)]'
                            : 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                        }`}
                      >
                        <Layers3 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="text-[1.125rem] font-semibold text-[var(--text-main)]">{application.appName}</div>
                          <span className="inline-flex rounded-full bg-[var(--surface-raised)] px-3 py-1 text-[0.75rem] text-[var(--text-muted)] shadow-[inset_0_0_0_1px_var(--surface-outline)]">
                            {application.recordCount} 条对接记录
                          </span>
                        </div>
                        <div className="mt-4 overflow-hidden rounded-[16px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
                          <div className="relative h-[124px] overflow-hidden bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-tint))]">
                            {application.screenshotUrl ? (
                              <img
                                src={application.screenshotUrl}
                                alt={application.appName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(var(--theme-soft-rgb),0.24),transparent_58%),linear-gradient(180deg,var(--surface-raised-strong),var(--surface-tint))] text-[var(--primary)]">
                                <ImageOff className="h-12 w-12 opacity-80" />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{application.description}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-info-text)]">
                            <Link2 className="h-3.5 w-3.5" />
                            关联资源 {application.linkedResourceCount} 项
                          </span>
                          <span className="inline-flex rounded-full bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-info-text)]">
                            关联场景 {application.sceneNames.length} 个
                          </span>
                          <span className="inline-flex rounded-full bg-[var(--status-success-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-success-text)]">
                            已接入 {application.connectedCount} 条
                          </span>
                          {application.pendingCount > 0 ? (
                            <span className="inline-flex rounded-full bg-[var(--status-warning-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-warning-text)]">
                              待补充/待研判 {application.pendingCount} 条
                            </span>
                          ) : null}
                          <span className="inline-flex rounded-full bg-[var(--surface-raised)] px-3 py-1 text-[0.75rem] text-[var(--text-muted)] shadow-[inset_0_0_0_1px_var(--surface-outline)]">
                            最近发放 {application.latestDistributionDate || '待更新'}
                          </span>
                        </div>
                        {application.contact ? (
                          <div className="mt-3 text-[0.75rem] text-[var(--text-muted)]">联系人：{application.contact}</div>
                        ) : null}
                        {application.sceneNames.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {application.sceneNames.slice(0, 3).map((sceneName) => (
                              <TopicPill key={`${application.appId || application.appName}-${sceneName}`}>{sceneName}</TopicPill>
                            ))}
                            {application.sceneNames.length > 3 ? (
                              <TopicPill>{`其余 ${application.sceneNames.length - 3} 个场景`}</TopicPill>
                            ) : null}
                          </div>
                        ) : null}
                        {application.tags.length > 0 || application.domainCategoryName || application.sourceDomainLabels.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {application.domainCategoryName ? (
                              <TopicPill>{application.domainCategoryName}</TopicPill>
                            ) : null}
                            {application.sourceDomainLabels
                              .filter((label) => label !== application.domainCategoryName)
                              .map((label) => (
                                <TopicPill key={`${application.appId || application.appName}-domain-${label}`}>{label}</TopicPill>
                              ))}
                            {application.tags.map((tag) => (
                              <TopicPill key={`${application.appId || application.appName}-tag-${tag}`}>{tag}</TopicPill>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
        {canManageResources ? (
          <ResourceEditDialog
            open={isEditOpen}
            resourceId={item.id}
            categoryTree={data.categoryTree}
            informationCategoryTree={data.informationCategoryTree}
            sourceTree={data.sourceTree}
            regionTree={data.regionTree}
            editOptions={data.editOptions}
            onClose={() => setIsEditOpen(false)}
            onSaved={async () => {
              await refresh()
              setTabEditSuccessMessage('')
              setEditSuccessMessage('资源信息已保存到后台，并已刷新当前详情。')
            }}
          />
        ) : null}
        {canManageResources ? (
          <DataItemsEditDialog
            open={isDataItemsEditOpen}
            resourceId={item.id}
            onClose={() => setIsDataItemsEditOpen(false)}
            onSaved={async () => {
              await refresh()
              setEditSuccessMessage('')
              setTabEditSuccessMessage('数据项已保存到后台，并已刷新当前详情。')
            }}
          />
        ) : null}
        {canManageResources ? (
          <ResourceLinkEditDialog
            open={isLinkInfoEditOpen}
            resourceId={item.id}
            onClose={() => setIsLinkInfoEditOpen(false)}
            onSaved={async () => {
              await refresh()
              setEditSuccessMessage('')
              setTabEditSuccessMessage('链接信息已保存到后台，并已刷新当前详情。')
            }}
          />
        ) : null}
        {canManageResources ? (
          <LineageEditDialog
            open={isLineageEditOpen}
            resourceId={item.id}
            catalogItems={catalogItems}
            onClose={() => setIsLineageEditOpen(false)}
            onSaved={async () => {
              await refresh()
              setEditSuccessMessage('')
              setTabEditSuccessMessage('血缘关系已保存到后台，并已刷新当前详情。')
            }}
          />
        ) : null}
        {canManageResources ? (
          <PhysicalTablesEditDialog
            open={isPhysicalTablesEditOpen}
            resourceId={item.id}
            onClose={() => setIsPhysicalTablesEditOpen(false)}
            onSaved={async () => {
              await refresh()
              setEditSuccessMessage('')
              setTabEditSuccessMessage('物理表清单、基准表和业务时间字段已保存到后台，并已刷新当前详情。')
            }}
          />
        ) : null}

    </div>
  )
}
