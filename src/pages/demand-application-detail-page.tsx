import { ArrowRight, ChevronDown, ChevronRight, Database, ImageOff, Layers3, Link2, LoaderCircle, Pencil, Trash2, Upload, Workflow, X } from 'lucide-react'
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { Button, ScenicPanel, TopicPill } from '../components/ui'
import { canManageCatalogResources } from '../lib/admin-role'
import {
  buildDemandApplicationDetailData,
  type DemandApplicationDetailSection,
  type DemandApplicationRelatedResource,
  type DemandApplicationTreeSection,
} from '../lib/app-detail-aggregation'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import {
  deletePortalAppCatalogAttachment,
  updatePortalAppCatalogEntry,
  uploadPortalAppCatalogScreenshot,
  usePortalAppCatalogData,
} from '../lib/nocobase-app-data'
import { useSupplyDemandPortalData } from '../lib/nocobase-supply-demand-data'
import { usePortalContext } from '../lib/portal-context'
import { cn } from '../lib/utils'

const NAVY_BUTTON_CLASS =
  'border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[0_14px_28px_rgba(10,104,232,0.18)] transition-all duration-200 hover:brightness-[1.04] hover:-translate-y-[1px]'

const NAVY_SOFT_BUTTON_CLASS =
  'border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] text-[var(--primary)] shadow-[0_10px_24px_rgba(10,104,232,0.10)] transition-all duration-200 hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white hover:-translate-y-[1px]'

const NAVY_ICON_BUTTON_CLASS =
  'border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] text-[var(--primary)] shadow-[0_10px_24px_rgba(10,104,232,0.10)] transition-all duration-200 hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white'

const DIALOG_FORM_CARD_CLASS =
  'rounded-[20px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 shadow-[0_18px_28px_rgba(7,15,28,0.14)]'

const DIALOG_FORM_LABEL_CLASS =
  'mb-2 block text-[0.75rem] font-semibold tracking-[0.02em] text-[var(--text-secondary)]'

const DIALOG_FORM_INPUT_CLASS =
  'h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]'

const DIALOG_FORM_SELECT_CLASS = `${DIALOG_FORM_INPUT_CLASS} appearance-none pr-10`

const DIALOG_FORM_TEXTAREA_CLASS =
  'min-h-[132px] w-full rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 py-3 text-[0.875rem] leading-6 text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]'

type ApplicationEditFormState = {
  name: string
  parentId: string
  domainCategoryId: string
  seqId: string
  contact: string
  tagsText: string
  description: string
}

type SelectOption = {
  value: string
  label: string
}

function SectionTitle({
  icon,
  title,
  badge,
  action,
}: {
  icon: ReactNode
  title: string
  badge?: string
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
          {badge ? (
            <span className="inline-flex rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] font-semibold text-[var(--status-info-text)]">
              {badge}
            </span>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function formatDateLabel(value: string) {
  return value || '待补充'
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function splitApplicationTags(value: string) {
  return Array.from(new Set(value
    .split(/[，,、；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)))
}

function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        resolve(reader.result)
        return
      }

      reject(new Error('读取应用截图失败'))
    }
    reader.onerror = () => reject(new Error('读取应用截图失败'))
    reader.readAsDataURL(file)
  })
}

function buildApplicationEditForm(currentApp: {
  name: string
  parentId: string | null
  domainCategoryId: string
  seqId: string
  contact: string
  tags: string[]
  description: string
}): ApplicationEditFormState {
  return {
    name: currentApp.name,
    parentId: currentApp.parentId ?? '',
    domainCategoryId: currentApp.domainCategoryId,
    seqId: currentApp.seqId,
    contact: currentApp.contact,
    tagsText: currentApp.tags.join('，'),
    description: currentApp.description,
  }
}

function buildDemandPath(sceneName: string, withEmbed: (path: string) => string) {
  const searchParams = new URLSearchParams()
  searchParams.set('tab', 'demand')
  if (sceneName.trim()) {
    searchParams.set('keyword', sceneName.trim())
  }
  return withEmbed(`/demand?${searchParams.toString()}`)
}

function buildApplicationBackPath(
  currentAppId: string,
  parentId: string | null,
  hasChildren: boolean,
  withEmbed: (path: string) => string,
) {
  const searchParams = new URLSearchParams()
  searchParams.set('tab', 'application')
  const preferredNodeId = hasChildren ? currentAppId : parentId ?? ''
  if (preferredNodeId) {
    searchParams.set('appNode', preferredNodeId)
  }
  return withEmbed(`/demand?${searchParams.toString()}`)
}

function ResourceCard({
  resource,
  withEmbed,
}: {
  resource: DemandApplicationRelatedResource
  withEmbed: (path: string) => string
}) {
  const href = resource.id ? withEmbed(`/catalog/${resource.id}`) : ''

  return (
    <article className="rounded-[18px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[0.9375rem] font-semibold leading-7 text-[var(--text-main)]">{resource.name}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {resource.category ? <TopicPill>{resource.category}</TopicPill> : null}
            {resource.serviceType ? <TopicPill>{resource.serviceType}</TopicPill> : null}
            {resource.matchedCatalog ? (
              <TopicPill className="border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]">
                已入目录
              </TopicPill>
            ) : (
              <TopicPill>供需引用</TopicPill>
            )}
          </div>
        </div>
        {href ? (
          <Link
            to={href}
            className="inline-flex items-center gap-1 rounded-full border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] px-3 py-1.5 text-[0.75rem] font-semibold text-[var(--primary)] transition hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white"
          >
            查看资源
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      {resource.description ? (
        <p className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{resource.description}</p>
      ) : null}

      <div className="mt-4 grid gap-2 text-[0.75rem] text-[var(--text-secondary)] sm:grid-cols-2">
        <div>提供单位：{resource.department || '待补充'}</div>
        <div>更新周期：{resource.updateCycle || '待补充'}</div>
      </div>
    </article>
  )
}

function SupplyDemandCard({
  sectionAppName,
  sceneName,
  requiredDataResourceName,
  demandDescription,
  statusLabel,
  domainCategoryName,
  distributionDate,
  linkedResources,
  matchedAppNames,
  isDirectMatch,
  withEmbed,
}: {
  sectionAppName: string
  sceneName: string
  requiredDataResourceName: string
  demandDescription: string
  statusLabel: string
  domainCategoryName: string
  distributionDate: string
  linkedResources: DemandApplicationRelatedResource[]
  matchedAppNames: string[]
  isDirectMatch: boolean
  withEmbed: (path: string) => string
}) {
  const resourcePreview = linkedResources.slice(0, 4)

  return (
    <article className="rounded-[18px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[1rem] font-semibold leading-7 text-[var(--text-main)]">{sceneName}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <TopicPill>{domainCategoryName}</TopicPill>
            <TopicPill>{statusLabel}</TopicPill>
            {!isDirectMatch ? (
              <TopicPill className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]">
                来自下级应用
              </TopicPill>
            ) : null}
          </div>
        </div>
        <Link
          to={buildDemandPath(sceneName, withEmbed)}
          className="inline-flex items-center gap-1 rounded-full border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] px-3 py-1.5 text-[0.75rem] font-semibold text-[var(--primary)] transition hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white"
        >
          去供需页
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 grid gap-3 text-[0.8125rem] text-[var(--text-secondary)] md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div>
          <div className="font-medium text-[var(--text-main)]">所需数据资源</div>
          <div className="mt-1 leading-6">{requiredDataResourceName || '待补充'}</div>
        </div>
        <div>
          <div className="font-medium text-[var(--text-main)]">发放时间</div>
          <div className="mt-1 leading-6">{formatDateLabel(distributionDate)}</div>
        </div>
      </div>

      {demandDescription ? (
        <p className="mt-3 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{demandDescription}</p>
      ) : null}

      {!isDirectMatch && matchedAppNames.length > 0 ? (
        <div className="mt-3 text-[0.75rem] text-[var(--text-secondary)]">
          命中应用：{matchedAppNames.join('、')}
          {matchedAppNames.includes(sectionAppName) ? '' : `，归属“${sectionAppName}”下级`}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <div className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          关联数据资源
        </div>
        {resourcePreview.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {resourcePreview.map((resource) => (
              <ResourceCard
                key={`${sceneName}-${resource.id || resource.name}`}
                resource={resource}
                withEmbed={withEmbed}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-muted)] px-4 py-5 text-[0.8125rem] text-[var(--text-muted)]">
            当前供需对接暂未关联数据资源。
          </div>
        )}
      </div>
    </article>
  )
}

function ApplicationRelationPanel({
  title,
  description,
  section,
  withEmbed,
}: {
  title: string
  description: string
  section: DemandApplicationDetailSection
  withEmbed: (path: string) => string
}) {
  return (
    <section className="space-y-4 rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
      <SectionTitle
        icon={<Workflow className="h-5 w-5" />}
        title={title}
      />

      <p className="text-[0.875rem] leading-7 text-[var(--text-secondary)]">{description}</p>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4">
          <div className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">关联供需对接</div>
          {section.records.length > 0 ? (
            <div className="space-y-4">
              {section.records.map((record) => (
                <SupplyDemandCard
                  key={`${section.app.id}-${record.id}`}
                  sectionAppName={section.app.name}
                  sceneName={record.sceneName}
                  requiredDataResourceName={record.requiredDataResourceName}
                  demandDescription={record.demandDescription}
                  statusLabel={record.statusLabel}
                  domainCategoryName={record.domainCategoryName}
                  distributionDate={record.distributionDate}
                  linkedResources={record.linkedResources}
                  matchedAppNames={record.matchedAppNames}
                  isDirectMatch={record.isDirectMatch}
                  withEmbed={withEmbed}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-8 text-[0.875rem] text-[var(--text-muted)]">
              暂无关联供需对接记录。
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">关联数据资源汇总</div>
          {section.resources.length > 0 ? (
            <div className="space-y-3">
              {section.resources.map((resource) => (
                <ResourceCard
                  key={`${section.app.id}-${resource.id || resource.name}`}
                  resource={resource}
                  withEmbed={withEmbed}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-8 text-[0.875rem] text-[var(--text-muted)]">
              暂无关联数据资源。
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function buildExpandedTreeIds(sections: DemandApplicationTreeSection[]) {
  const ids: string[] = []
  const visit = (section: DemandApplicationTreeSection) => {
    if (section.children.length > 0) {
      ids.push(section.app.id)
    }
    section.children.forEach(visit)
  }

  sections.forEach(visit)
  return ids
}

function SubApplicationTreeTable({
  sections,
  withEmbed,
}: {
  sections: DemandApplicationTreeSection[]
  withEmbed: (path: string) => string
}) {
  const [expandedIds, setExpandedIds] = useState<string[]>(() => buildExpandedTreeIds(sections))

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const renderRows = (section: DemandApplicationTreeSection, depth = 0): ReactNode[] => {
    const isExpanded = expandedIds.includes(section.app.id)
    const hasChildren = section.children.length > 0
    const detailPath = withEmbed(`/demand/applications/${section.app.id}`)
    const rows: ReactNode[] = [
      (
        <tr
          key={`tree-row-${section.app.id}`}
          className="align-top odd:bg-[var(--surface-raised-strong)] even:bg-[var(--table-row-alt)]"
        >
          <td className="border-b border-[var(--line-soft)] px-4 py-4">
            <div className="flex min-w-0 items-start gap-2" style={{ paddingLeft: `${depth * 24}px` }}>
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpanded(section.app.id)}
                  className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition hover:border-[rgba(var(--theme-soft-rgb),0.22)] hover:text-[var(--primary)]"
                  aria-label={isExpanded ? '收起下级应用详情' : '展开下级应用详情'}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[0.9375rem] font-semibold leading-7 text-[var(--text-main)]">{section.app.name}</div>
              </div>
            </div>
          </td>
          <td className="border-b border-[var(--line-soft)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">
            {section.app.domainCategoryName || '待补充'}
          </td>
          <td className="border-b border-[var(--line-soft)] px-4 py-4">
            {section.records.length > 0 ? (
              <div className="max-w-[360px] space-y-2">
                {section.records.slice(0, 2).map((record) => (
                  <Link
                    key={`${section.app.id}-${record.id}`}
                    to={buildDemandPath(record.sceneName, withEmbed)}
                    className="block rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-2 text-[0.8125rem] font-medium text-[var(--text-main)] transition hover:border-[rgba(var(--theme-soft-rgb),0.22)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]"
                    title={record.sceneName}
                  >
                    <div className="truncate">{record.sceneName}</div>
                    <div className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">{record.statusLabel}</div>
                  </Link>
                ))}
                {section.records.length > 2 ? (
                  <div className="text-[0.75rem] text-[var(--text-muted)]">另有 {section.records.length - 2} 条</div>
                ) : null}
              </div>
            ) : (
              <div className="text-[0.8125rem] text-[var(--text-muted)]">暂无关联供需</div>
            )}
          </td>
          <td className="border-b border-[var(--line-soft)] px-4 py-4">
            {section.resources.length > 0 ? (
              <div className="max-w-[360px] space-y-2">
                {section.resources.slice(0, 2).map((resource) => (
                  resource.id ? (
                    <Link
                      key={`${section.app.id}-${resource.id}`}
                      to={withEmbed(`/catalog/${resource.id}`)}
                      className="block rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-2 text-[0.8125rem] font-medium text-[var(--text-main)] transition hover:border-[rgba(var(--theme-soft-rgb),0.22)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]"
                      title={resource.name}
                    >
                      <div className="truncate">{resource.name}</div>
                      <div className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">{resource.category || resource.serviceType || '数据资源'}</div>
                    </Link>
                  ) : (
                    <div
                      key={`${section.app.id}-${resource.name}`}
                      className="rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-2 text-[0.8125rem] font-medium text-[var(--text-main)]"
                      title={resource.name}
                    >
                      <div className="truncate">{resource.name}</div>
                      <div className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">{resource.category || resource.serviceType || '数据资源'}</div>
                    </div>
                  )
                ))}
                {section.resources.length > 2 ? (
                  <div className="text-[0.75rem] text-[var(--text-muted)]">另有 {section.resources.length - 2} 个</div>
                ) : null}
              </div>
            ) : (
              <div className="text-[0.8125rem] text-[var(--text-muted)]">暂无关联资源</div>
            )}
          </td>
          <td className="border-b border-[var(--line-soft)] px-4 py-4">
            <Link
              to={detailPath}
              className="inline-flex items-center gap-1 rounded-full border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] px-3 py-1.5 text-[0.75rem] font-semibold text-[var(--primary)] transition hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white"
            >
              查看详情
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </td>
        </tr>
      ),
    ]

    if (hasChildren && isExpanded) {
      section.children.forEach((child) => {
        rows.push(...renderRows(child, depth + 1))
      })
    }

    return rows
  }

  return (
    <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
      <SectionTitle
        icon={<Layers3 className="h-5 w-5" />}
        title="下级应用树形表格"
      />

      {sections.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] shadow-[var(--shadow-soft)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-left text-[0.75rem] uppercase tracking-[0.05em] text-white">
                  <th className="px-4 py-3.5 font-semibold">应用节点</th>
                  <th className="px-4 py-3.5 font-semibold">领域分类</th>
                  <th className="px-4 py-3.5 font-semibold">关联供需对接</th>
                  <th className="px-4 py-3.5 font-semibold">关联数据资源</th>
                  <th className="px-4 py-3.5 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>{sections.flatMap((section) => renderRows(section))}</tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-[18px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">
          当前应用没有下级应用。
        </div>
      )}
    </section>
  )
}

export function DemandApplicationDetailPage() {
  const location = useLocation()
  const { id } = useParams()
  const {
    data: appCatalogData,
    isLoading: isAppLoading,
    error: appError,
    reload: reloadApplicationCatalog,
  } = usePortalAppCatalogData(true)
  const {
    data: supplyDemandItems,
    isLoading: isSupplyDemandLoading,
    error: supplyDemandError,
  } = useSupplyDemandPortalData(true, { includeRelatedApps: true })
  const {
    data: portalData,
    isLoading: isPortalLoading,
    error: portalError,
    session,
  } = usePortalContext()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const detailData = useMemo(
    () => buildDemandApplicationDetailData(id ?? '', appCatalogData.flatItems, supplyDemandItems, portalData?.catalogItems ?? []),
    [appCatalogData.flatItems, id, portalData?.catalogItems, supplyDemandItems],
  )
  const canManageApplication = canManageCatalogResources(session?.user.roles)
  const [isApplicationEditDialogOpen, setIsApplicationEditDialogOpen] = useState(false)
  const [applicationEditForm, setApplicationEditForm] = useState<ApplicationEditFormState>({
    name: '',
    parentId: '',
    domainCategoryId: '',
    seqId: '',
    contact: '',
    tagsText: '',
    description: '',
  })
  const [applicationEditError, setApplicationEditError] = useState<string | null>(null)
  const [applicationEditSuccess, setApplicationEditSuccess] = useState<string | null>(null)
  const [applicationEditScreenshotFile, setApplicationEditScreenshotFile] = useState<File | null>(null)
  const [applicationEditScreenshotPreviewUrl, setApplicationEditScreenshotPreviewUrl] = useState('')
  const [applicationEditRemoveScreenshot, setApplicationEditRemoveScreenshot] = useState(false)
  const [isApplicationEditSaving, setIsApplicationEditSaving] = useState(false)
  const applicationDomainOptions = useMemo<SelectOption[]>(
    () =>
      Array.from(
        appCatalogData.flatItems.reduce((lookup, item) => {
          if (!item.domainCategoryId || !item.domainCategoryName) {
            return lookup
          }

          if (!lookup.has(item.domainCategoryId)) {
            lookup.set(item.domainCategoryId, item.domainCategoryName)
          }

          return lookup
        }, new Map<string, string>()),
        ([value, label]) => ({ value, label }),
      ).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN', { numeric: true })),
    [appCatalogData.flatItems],
  )
  const applicationParentOptions = useMemo<SelectOption[]>(() => {
    const currentApp = detailData?.currentApp
    if (!currentApp) {
      return []
    }

    return appCatalogData.flatItems
      .filter((item) => item.id !== currentApp.id && !item.ancestorIds.includes(currentApp.id))
      .map((item) => ({ value: item.id, label: item.pathLabel }))
  }, [appCatalogData.flatItems, detailData])

  const setApplicationEditField = <K extends keyof ApplicationEditFormState,>(
    key: K,
    value: ApplicationEditFormState[K],
  ) => {
    setApplicationEditForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const openApplicationEditDialog = () => {
    const currentApp = detailData?.currentApp
    if (!currentApp) return

    setApplicationEditForm(buildApplicationEditForm(currentApp))
    setApplicationEditScreenshotFile(null)
    setApplicationEditScreenshotPreviewUrl(currentApp.screenshotUrl)
    setApplicationEditRemoveScreenshot(false)
    setApplicationEditError(null)
    setApplicationEditSuccess(null)
    setIsApplicationEditDialogOpen(true)
  }

  const closeApplicationEditDialog = () => {
    if (isApplicationEditSaving) return
    setIsApplicationEditDialogOpen(false)
    setApplicationEditError(null)
    setApplicationEditScreenshotFile(null)
    setApplicationEditRemoveScreenshot(false)
  }

  const handleApplicationEditScreenshotChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setApplicationEditError('请上传图片格式的应用截图')
      return
    }

    try {
      const previewUrl = await readImageFileAsDataUrl(file)
      setApplicationEditScreenshotFile(file)
      setApplicationEditScreenshotPreviewUrl(previewUrl)
      setApplicationEditRemoveScreenshot(false)
      setApplicationEditError(null)
    } catch (error) {
      setApplicationEditError(error instanceof Error ? error.message : '读取应用截图失败')
    }
  }

  const clearApplicationEditScreenshot = () => {
    const currentApp = detailData?.currentApp
    setApplicationEditScreenshotFile(null)
    setApplicationEditScreenshotPreviewUrl('')
    setApplicationEditRemoveScreenshot(Boolean(currentApp?.screenshotUrl))
  }

  const submitApplicationEdit = async () => {
    const currentApp = detailData?.currentApp
    if (!currentApp) return

    const normalizedName = normalizeText(applicationEditForm.name)
    if (!normalizedName) {
      setApplicationEditError('请填写场景应用名称')
      return
    }

    setIsApplicationEditSaving(true)
    setApplicationEditError(null)

    let updated = false
    let uploadedScreenshot: Awaited<ReturnType<typeof uploadPortalAppCatalogScreenshot>> | null = null

    try {
      if (applicationEditScreenshotFile) {
        uploadedScreenshot = await uploadPortalAppCatalogScreenshot(applicationEditScreenshotFile)
      }

      await updatePortalAppCatalogEntry(currentApp.id, {
        name: normalizedName,
        parentId: normalizeText(applicationEditForm.parentId) || null,
        domainCategoryId: normalizeText(applicationEditForm.domainCategoryId),
        seqId: normalizeText(applicationEditForm.seqId),
        contact: normalizeText(applicationEditForm.contact),
        description: normalizeText(applicationEditForm.description),
        tags: splitApplicationTags(applicationEditForm.tagsText),
        screenshotAttachmentId: applicationEditRemoveScreenshot
          ? null
          : uploadedScreenshot
            ? uploadedScreenshot.id
            : undefined,
      })
      updated = true

      if ((applicationEditRemoveScreenshot || uploadedScreenshot) && currentApp.screenshotAttachmentIds.length > 0) {
        await Promise.allSettled(
          currentApp.screenshotAttachmentIds.map((attachmentId) => deletePortalAppCatalogAttachment(attachmentId)),
        )
      }

      await reloadApplicationCatalog()
      setIsApplicationEditDialogOpen(false)
      setApplicationEditScreenshotFile(null)
      setApplicationEditRemoveScreenshot(false)
      setApplicationEditSuccess(`已更新场景应用“${normalizedName}”。`)
    } catch (error) {
      if (!updated && uploadedScreenshot?.id) {
        try {
          await deletePortalAppCatalogAttachment(uploadedScreenshot.id)
        } catch {
          /* ignore cleanup failure */
        }
      }

      if (updated) {
        setIsApplicationEditDialogOpen(false)
        setApplicationEditSuccess(`已更新场景应用“${normalizedName}”，但详情刷新失败，请稍后手动刷新页面。`)
      } else {
        setApplicationEditError(error instanceof Error ? error.message : '更新场景应用失败')
      }
    } finally {
      setIsApplicationEditSaving(false)
    }
  }

  if (isAppLoading || isSupplyDemandLoading || isPortalLoading) {
    return <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载场景应用详情...</div>
  }

  if (appError || supplyDemandError || portalError) {
    return (
      <div className="rounded-[18px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-6 text-[0.875rem] leading-7 text-[var(--status-danger-text)]">
        {appError || supplyDemandError || portalError}
      </div>
    )
  }

  if (!detailData) {
    return <Navigate to={withEmbed('/demand?tab=application')} replace />
  }

  const { currentApp, breadcrumbApps, childTreeSections, currentSection } = detailData
  const backPath = buildApplicationBackPath(currentApp.id, currentApp.parentId, currentApp.hasChildren, withEmbed)
  const currentTreeSection: DemandApplicationTreeSection = {
    ...currentSection,
    children: childTreeSections,
  }
  const detailRows: Array<[string, string, string, string]> = [
    ['应用名称', currentApp.name, '应用路径', currentApp.pathLabel],
    ['领域分类', currentApp.domainCategoryName || '待补充', '联系人', currentApp.contact || '待补充'],
    ['标签', currentApp.tags.length > 0 ? currentApp.tags.join('、') : '待补充', '下级应用数', String(currentApp.childCount)],
    ['应用说明', currentApp.description || '当前应用尚未补充说明。', '', ''],
  ]
  const heroStats = [
    { title: '当前供需对接', value: String(currentSection.directRecordCount), icon: <Link2 className="h-3.5 w-3.5" /> },
    { title: '聚合供需总数', value: String(currentSection.aggregateRecordCount), icon: <Workflow className="h-3.5 w-3.5" /> },
    { title: '聚合数据资源', value: String(currentSection.aggregateResourceCount), icon: <Database className="h-3.5 w-3.5" /> },
    { title: '下级应用总数', value: String(currentApp.childCount), icon: <Layers3 className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="space-y-5">
      {applicationEditSuccess ? (
        <div className="rounded-[16px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-[0.8125rem] leading-6 text-[var(--status-success-text)]">
          {applicationEditSuccess}
        </div>
      ) : null}

      <ScenicPanel className="overflow-hidden border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] p-0 shadow-[var(--shadow-elevated)]">
        <div className="px-6 py-7">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,60%)_minmax(0,40%)] lg:items-stretch">
            <div className="flex h-full min-w-0 flex-col lg:pr-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <h1 className="text-[2rem] font-bold leading-tight text-[var(--text-main)]">{currentApp.name}</h1>
                  <div className="flex flex-wrap items-center gap-3">
                    {canManageApplication ? (
                      <Button
                        title="编辑场景应用"
                        className={cn('rounded-full', NAVY_BUTTON_CLASS)}
                        onClick={openApplicationEditDialog}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        编辑场景应用
                      </Button>
                    ) : null}
                    <Link
                      to={backPath}
                      className="inline-flex h-10 shrink-0 items-center rounded-full border border-[var(--surface-outline)] bg-[color-mix(in_srgb,var(--surface-glass)_92%,transparent)] px-4 text-[0.875rem] font-semibold text-[var(--text-main)] transition hover:border-[rgba(var(--theme-soft-rgb),0.22)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]"
                    >
                      返回
                    </Link>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                  {breadcrumbApps.map((item, index) => {
                    const isLast = index === breadcrumbApps.length - 1
                    const nodePath = withEmbed(`/demand/applications/${item.id}`)

                    return isLast ? (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-1 text-[var(--text-main)]"
                      >
                        {item.name}
                      </span>
                    ) : (
                      <span key={item.id} className="inline-flex items-center gap-2">
                        <Link
                          to={nodePath}
                          className="rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-1 transition hover:border-[rgba(var(--theme-soft-rgb),0.22)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]"
                        >
                          {item.name}
                        </Link>
                        <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      </span>
                    )
                  })}
                </div>
              </div>

              <div className="mt-auto grid gap-3 pt-6 sm:grid-cols-2 xl:grid-cols-4">
                {heroStats.map((stat, index) => (
                  <div
                    key={stat.title}
                    className={index % 2 === 1
                      ? 'rounded-[16px] border border-[rgba(211,232,221,0.38)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--status-success-bg)_80%,var(--surface-raised-strong)),var(--surface-muted))] px-3 py-3 shadow-[0_12px_28px_rgba(33,76,124,0.10)]'
                      : 'rounded-[16px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] px-3 py-3 shadow-[0_12px_28px_rgba(33,76,124,0.10)]'}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={index % 2 === 1
                          ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                          : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(var(--theme-soft-rgb),0.10)] text-[var(--primary)]'}
                      >
                        {stat.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[0.6875rem] leading-5 text-[var(--text-muted)]">{stat.title}</div>
                        <div className="mt-1 text-[1.125rem] font-semibold leading-none text-[var(--text-main)]">{stat.value}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex h-full flex-col justify-end lg:justify-self-stretch">
              <div className="overflow-hidden rounded-[24px] border border-[var(--surface-outline-strong)] bg-[linear-gradient(180deg,var(--surface-raised-strong),color-mix(in_srgb,var(--surface-tint)_72%,var(--surface-muted)))] p-3 shadow-[var(--shadow-medium)]">
                <div className="overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
                  <div className="relative h-[220px] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(var(--theme-soft-rgb),0.24),transparent_58%),linear-gradient(180deg,var(--surface-raised-strong),var(--surface-tint))]">
                    {currentApp.screenshotUrl ? (
                      <img
                        src={currentApp.screenshotUrl}
                        alt={currentApp.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-[var(--primary)]">
                        <ImageOff className="h-14 w-14 opacity-80" />
                        <div className="text-[0.8125rem] text-[var(--text-secondary)]">暂无应用截图</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScenicPanel>

      <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
        <SectionTitle icon={<Layers3 className="h-5 w-5" />} title="场景应用信息" badge={`${currentApp.pathLabel}`} />

        <div className="mt-5 overflow-hidden rounded-[16px] border border-[var(--surface-outline)]">
          {detailRows.map((row, index) => (
            <div
              key={`${row[0]}-${index}`}
              className="grid border-b border-[var(--line-soft)] last:border-b-0 md:grid-cols-[132px_minmax(0,1fr)_132px_minmax(0,1fr)]"
            >
              <div className="bg-[var(--table-header-bg)] px-4 py-4 text-[0.8125rem] font-medium text-[var(--text-secondary)]">
                {row[0]}
              </div>
              <div className={`bg-[var(--surface-raised-strong)] px-4 py-4 text-[0.875rem] leading-7 text-[var(--text-main)] ${!row[2] ? 'md:col-span-3' : ''}`}>
                {row[1]}
              </div>
              {row[2] ? (
                <>
                  <div className="border-t border-[var(--line-soft)] bg-[var(--table-header-bg)] px-4 py-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] md:border-l md:border-t-0">
                    {row[2]}
                  </div>
                  <div className="border-t border-[var(--line-soft)] bg-[var(--surface-raised-strong)] px-4 py-4 text-[0.875rem] leading-7 text-[var(--text-main)] md:border-t-0">
                    {row[3]}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <ApplicationRelationPanel
        title="当前应用关联供需对接与数据资源"
        description="当前分组下直接关联的供需对接，以及汇总到当前应用视角下的数据资源覆盖范围。若当前应用是分组节点，列表中会同时体现下级应用承接的供需关系。"
        section={currentSection}
        withEmbed={withEmbed}
      />

      <SubApplicationTreeTable sections={[currentTreeSection]} withEmbed={withEmbed} />

      {isApplicationEditDialogOpen
        ? typeof document !== 'undefined'
          ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,30,43,0.42)] px-4 py-4 backdrop-blur-[3px]">
              <div className="relative flex max-h-[92vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[24px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[0_32px_72px_rgba(0,0,0,0.34)]">
                <div className="flex items-start justify-between gap-4 border-b border-[var(--surface-outline)] px-6 py-5">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-info-text)]">
                      <Pencil className="h-3.5 w-3.5" />
                      场景应用详情
                    </div>
                    <div className="mt-3 text-[1.75rem] font-semibold text-[var(--text-main)]">编辑场景应用</div>
                    <div className="mt-2 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
                      可直接调整当前应用的路径信息、展示说明和应用截图，保存后会刷新当前详情页。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeApplicationEditDialog}
                    className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full', NAVY_ICON_BUTTON_CLASS)}
                    aria-label="关闭编辑场景应用对话框"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
                    <div className={DIALOG_FORM_CARD_CLASS}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block md:col-span-2">
                          <span className={DIALOG_FORM_LABEL_CLASS}>应用名称</span>
                          <input
                            value={applicationEditForm.name}
                            onChange={(event) => setApplicationEditField('name', event.target.value)}
                            className={DIALOG_FORM_INPUT_CLASS}
                            placeholder="例如：生态环境综合研判驾驶舱"
                          />
                        </label>

                        <label className="block">
                          <span className={DIALOG_FORM_LABEL_CLASS}>父级应用</span>
                          <div className="relative">
                            <select
                              value={applicationEditForm.parentId}
                              onChange={(event) => setApplicationEditField('parentId', event.target.value)}
                              className={DIALOG_FORM_SELECT_CLASS}
                            >
                              <option value="">无父级，作为顶层应用</option>
                              {applicationParentOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                          </div>
                        </label>

                        <label className="block">
                          <span className={DIALOG_FORM_LABEL_CLASS}>领域分类</span>
                          <div className="relative">
                            <select
                              value={applicationEditForm.domainCategoryId}
                              onChange={(event) => setApplicationEditField('domainCategoryId', event.target.value)}
                              className={DIALOG_FORM_SELECT_CLASS}
                            >
                              <option value="">沿用父级或暂不设置</option>
                              {applicationDomainOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                          </div>
                        </label>

                        <label className="block">
                          <span className={DIALOG_FORM_LABEL_CLASS}>排序编码</span>
                          <input
                            value={applicationEditForm.seqId}
                            onChange={(event) => setApplicationEditField('seqId', event.target.value)}
                            className={DIALOG_FORM_INPUT_CLASS}
                            placeholder="例如：03-12"
                          />
                        </label>

                        <label className="block">
                          <span className={DIALOG_FORM_LABEL_CLASS}>联系人</span>
                          <input
                            value={applicationEditForm.contact}
                            onChange={(event) => setApplicationEditField('contact', event.target.value)}
                            className={DIALOG_FORM_INPUT_CLASS}
                            placeholder="例如：李工 / 0431-xxxx"
                          />
                        </label>

                        <label className="block md:col-span-2">
                          <span className={DIALOG_FORM_LABEL_CLASS}>标签</span>
                          <input
                            value={applicationEditForm.tagsText}
                            onChange={(event) => setApplicationEditField('tagsText', event.target.value)}
                            className={DIALOG_FORM_INPUT_CLASS}
                            placeholder="多个标签请用逗号分隔，例如：驾驶舱，研判，会商"
                          />
                        </label>
                      </div>
                    </div>

                    <div className={DIALOG_FORM_CARD_CLASS}>
                      <label className="block">
                        <span className={DIALOG_FORM_LABEL_CLASS}>应用说明</span>
                        <textarea
                          value={applicationEditForm.description}
                          onChange={(event) => setApplicationEditField('description', event.target.value)}
                          className={DIALOG_FORM_TEXTAREA_CLASS}
                          placeholder="简要说明这个场景应用服务的对象、使用方式和核心能力。"
                        />
                      </label>

                      <div className="mt-4">
                        <span className={DIALOG_FORM_LABEL_CLASS}>应用截图</span>
                        <div className="overflow-hidden rounded-[16px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
                          <div className="relative h-[188px] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(var(--theme-soft-rgb),0.18),transparent_58%),linear-gradient(180deg,var(--surface-raised-strong),var(--surface-tint))]">
                            {applicationEditScreenshotPreviewUrl ? (
                              <img
                                src={applicationEditScreenshotPreviewUrl}
                                alt="应用截图预览"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center gap-3 px-6 text-center text-[0.8125rem] leading-6 text-[var(--text-muted)]">
                                <ImageOff className="h-10 w-10 text-[var(--primary)] opacity-80" />
                                <span>当前应用暂无截图，可上传首页或核心功能界面。</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <label className={cn('inline-flex cursor-pointer items-center rounded-full px-4 py-2 text-[0.8125rem] font-semibold', NAVY_SOFT_BUTTON_CLASS)}>
                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={(event) => {
                                void handleApplicationEditScreenshotChange(event)
                              }}
                            />
                            <Upload className="mr-1 h-4 w-4" />
                            上传截图
                          </label>
                          {(applicationEditScreenshotPreviewUrl || applicationEditScreenshotFile) ? (
                            <button
                              type="button"
                              onClick={clearApplicationEditScreenshot}
                              className={cn('inline-flex items-center rounded-full px-4 py-2 text-[0.8125rem] font-semibold', NAVY_SOFT_BUTTON_CLASS)}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              清空截图
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  {applicationEditError ? (
                    <div className="mt-5 rounded-[16px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
                      {applicationEditError}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 py-4">
                  <div className="text-[0.75rem] text-[var(--text-muted)]">
                    保存后会刷新当前应用详情，若调整父级，返回按钮会自动定位到新的目录层级。
                  </div>
                  <div className="flex items-center gap-3">
                    <Button className={cn('rounded-full', NAVY_SOFT_BUTTON_CLASS)} onClick={closeApplicationEditDialog}>
                      取消
                    </Button>
                    <Button
                      className={cn('rounded-full', NAVY_BUTTON_CLASS)}
                      disabled={isApplicationEditSaving}
                      onClick={() => {
                        void submitApplicationEdit()
                      }}
                    >
                      {isApplicationEditSaving ? (
                        <>
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                          保存中...
                        </>
                      ) : (
                        <>
                          <Pencil className="mr-2 h-4 w-4" />
                          保存场景应用
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
          : null
        : null}
    </div>
  )
}
