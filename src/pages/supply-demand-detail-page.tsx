import { ArrowLeft, ArrowRight, Database, ImageOff, Layers3, LoaderCircle, Pencil, Search, Workflow, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ScenicPanel, TopicPill } from '../components/ui'
import { canManageCatalogResources } from '../lib/admin-role'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import type { AppCatalogNode } from '../lib/nocobase-app-data'
import { usePortalAppCatalogData } from '../lib/nocobase-app-data'
import type { CatalogItem } from '../lib/nocobase-portal-data'
import { usePortalContext } from '../lib/portal-context'
import {
  type SupplyDemandInfo,
  type SupplyDemandRelatedApp,
  updateSupplyDemandLinkedResources,
  updateSupplyDemandRelatedApps,
  useSupplyDemandPortalData,
} from '../lib/nocobase-supply-demand-data'

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

type EditableResourceOption = {
  id: string
  name: string
  category: string
  department: string
  updateCycle: string
  serviceType: string
  description: string
  searchText: string
}

type EditableApplicationOption = {
  id: string
  name: string
  pathLabel: string
  domainCategoryName: string
  contact: string
  description: string
  tags: string[]
  screenshotUrl: string
  searchText: string
}

type SupplyDemandDetailLocationState = {
  returnTo?: string
}

type LinkedResourceDetail = {
  id: string
  name: string
  category: string
  department: string
  updateCycle: string
  serviceType: string
  description: string
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function pickPrimaryText(...candidates: Array<string | undefined>) {
  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() ?? ''
}

function formatDateLabel(value: string) {
  if (!value) return '待补充'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const year = parsed.getFullYear()
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  const hour = `${parsed.getHours()}`.padStart(2, '0')
  const minute = `${parsed.getMinutes()}`.padStart(2, '0')

  if (hour === '00' && minute === '00') {
    return `${year}-${month}-${day}`
  }

  return `${year}-${month}-${day} ${hour}:${minute}`
}

function buildStatusLabel(item: SupplyDemandInfo) {
  return pickPrimaryText(
    item.satisfactionStatusName,
    item.dataStatusDescription,
    item.dataConnectionDescription,
    '待研判',
  )
}

function buildLinkedResources(item: SupplyDemandInfo, catalogItems: CatalogItem[]) {
  const catalogItemById = new Map(catalogItems.map((catalogItem) => [catalogItem.id, catalogItem] as const))
  const resourceMap = new Map<string, LinkedResourceDetail>()
  const maxLength = Math.max(item.linkedResourceIds.length, item.linkedResourceNames.length)

  for (let index = 0; index < maxLength; index += 1) {
    const linkedResourceId = normalizeText(item.linkedResourceIds[index])
    const linkedResourceName = normalizeText(item.linkedResourceNames[index])
    const catalogItem = linkedResourceId ? catalogItemById.get(linkedResourceId) : undefined
    const resourceName = pickPrimaryText(
      catalogItem?.name,
      linkedResourceName,
      item.requiredDataResourceName,
      '未命名数据资源',
    )
    const key = linkedResourceId || `name:${resourceName}`

    if (!resourceName || resourceMap.has(key)) {
      continue
    }

    resourceMap.set(key, {
      id: linkedResourceId,
      name: resourceName,
      category: pickPrimaryText(catalogItem?.category),
      department: pickPrimaryText(catalogItem?.department),
      updateCycle: pickPrimaryText(catalogItem?.updateCycle),
      serviceType: pickPrimaryText(catalogItem?.serviceType),
      description: pickPrimaryText(catalogItem?.summary, catalogItem?.description),
    })
  }

  if (resourceMap.size === 0) {
    const fallbackName = normalizeText(item.requiredDataResourceName)
    if (fallbackName) {
      resourceMap.set(`name:${fallbackName}`, {
        id: '',
        name: fallbackName,
        category: '',
        department: '',
        updateCycle: '',
        serviceType: '',
        description: '',
      })
    }
  }

  return Array.from(resourceMap.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function buildApplicationCards(relatedApps: SupplyDemandRelatedApp[]) {
  const appMap = new Map<string, SupplyDemandRelatedApp>()

  relatedApps.forEach((app) => {
    const key = app.id || `name:${app.name}`
    if (!appMap.has(key)) {
      appMap.set(key, app)
    }
  })

  return Array.from(appMap.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function buildEditableResourceOptions(catalogItems: CatalogItem[]): EditableResourceOption[] {
  return catalogItems
    .map((catalogItem) => ({
      id: catalogItem.id,
      name: catalogItem.name,
      category: pickPrimaryText(catalogItem.category, catalogItem.serviceType),
      department: pickPrimaryText(catalogItem.department),
      updateCycle: pickPrimaryText(catalogItem.updateCycle),
      serviceType: pickPrimaryText(catalogItem.serviceType),
      description: pickPrimaryText(catalogItem.summary, catalogItem.description),
      searchText: [
        catalogItem.name,
        catalogItem.category,
        catalogItem.department,
        catalogItem.updateCycle,
        catalogItem.serviceType,
        catalogItem.summary,
        catalogItem.description,
      ]
        .map((value) => normalizeText(value).toLowerCase())
        .filter(Boolean)
        .join(' '),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function buildEditableApplicationOptions(appItems: AppCatalogNode[]): EditableApplicationOption[] {
  return appItems
    .map((app) => ({
      id: app.id,
      name: app.name,
      pathLabel: app.pathLabel,
      domainCategoryName: app.domainCategoryName,
      contact: app.contact,
      description: app.description,
      tags: app.tags,
      screenshotUrl: app.screenshotUrl,
      searchText: [
        app.name,
        app.pathLabel,
        app.domainCategoryName,
        app.contact,
        app.description,
        ...app.tags,
      ]
        .map((value) => normalizeText(value).toLowerCase())
        .filter(Boolean)
        .join(' '),
    }))
    .sort((left, right) => left.pathLabel.localeCompare(right.pathLabel, 'zh-CN'))
}

function toggleSelectedId(currentIds: string[], targetId: string) {
  if (!targetId) return currentIds
  return currentIds.includes(targetId)
    ? currentIds.filter((id) => id !== targetId)
    : [...currentIds, targetId]
}

function ResourceTable({
  resources,
  withEmbed,
}: {
  resources: LinkedResourceDetail[]
  withEmbed: (path: string) => string
}) {
  if (resources.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-8 text-[0.875rem] text-[var(--text-muted)]">
        暂无对应数据资源。
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] shadow-[var(--shadow-soft)]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-left text-[0.75rem] uppercase tracking-[0.05em] text-white">
              <th className="px-4 py-3.5 font-semibold">数据资源</th>
              <th className="px-4 py-3.5 font-semibold">资源分类</th>
              <th className="px-4 py-3.5 font-semibold">提供单位</th>
              <th className="px-4 py-3.5 font-semibold">更新周期</th>
              <th className="px-4 py-3.5 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((resource, index) => (
              <tr
                key={resource.id || resource.name}
                className={index % 2 === 0 ? 'bg-[var(--surface-raised-strong)]' : 'bg-[var(--table-row-alt)]'}
              >
                <td className="border-b border-[var(--line-soft)] px-4 py-4">
                  <div className="text-[0.875rem] font-semibold text-[var(--text-main)]">{resource.name}</div>
                  {resource.description ? (
                    <div className="mt-1 line-clamp-2 text-[0.75rem] leading-6 text-[var(--text-secondary)]">{resource.description}</div>
                  ) : null}
                </td>
                <td className="border-b border-[var(--line-soft)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">
                  {resource.category || resource.serviceType || '未标注'}
                </td>
                <td className="border-b border-[var(--line-soft)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">
                  {resource.department || '未填写'}
                </td>
                <td className="border-b border-[var(--line-soft)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">
                  {resource.updateCycle || '未填写'}
                </td>
                <td className="border-b border-[var(--line-soft)] px-4 py-4">
                  {resource.id ? (
                    <Link
                      to={withEmbed(`/catalog/${resource.id}`)}
                      className="inline-flex items-center gap-1 rounded-full border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] px-3 py-1.5 text-[0.75rem] font-semibold text-[var(--primary)] transition hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white"
                    >
                      查看资源
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <span className="text-[0.75rem] text-[var(--text-muted)]">仅关联名称</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ApplicationCards({
  applications,
  withEmbed,
}: {
  applications: SupplyDemandRelatedApp[]
  withEmbed: (path: string) => string
}) {
  if (applications.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-raised)] px-5 py-8 text-[0.875rem] text-[var(--text-muted)]">
        暂无对应应用。
      </div>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {applications.map((app) => (
        <article
          key={app.id || app.name}
          className="overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-4 shadow-[var(--shadow-soft)]"
        >
          <div className="flex gap-4">
            <div className="h-[92px] w-[132px] shrink-0 overflow-hidden rounded-[14px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
              {app.screenshotUrl ? (
                <img src={app.screenshotUrl} alt={app.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-tint))] text-[var(--primary)]">
                  <ImageOff className="h-8 w-8 opacity-80" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-[1rem] font-semibold leading-7 text-[var(--text-main)]">{app.name}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {app.domainCategoryName ? <TopicPill>{app.domainCategoryName}</TopicPill> : null}
                {app.tags.slice(0, 2).map((tag) => (
                  <TopicPill key={`${app.id || app.name}-${tag}`}>{tag}</TopicPill>
                ))}
              </div>
              {app.description ? (
                <div className="mt-3 line-clamp-2 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{app.description}</div>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-[0.75rem] text-[var(--text-secondary)]">{app.contact || '未填写联系人'}</div>
                {app.id ? (
                  <Link
                    to={withEmbed(`/demand/applications/${app.id}`)}
                    className="inline-flex items-center gap-1 rounded-full border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] px-3 py-1.5 text-[0.75rem] font-semibold text-[var(--primary)] transition hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white"
                  >
                    查看应用
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

export function SupplyDemandDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const [isResourceEditDialogOpen, setIsResourceEditDialogOpen] = useState(false)
  const [isApplicationEditDialogOpen, setIsApplicationEditDialogOpen] = useState(false)
  const [resourceSearchKeyword, setResourceSearchKeyword] = useState('')
  const [applicationSearchKeyword, setApplicationSearchKeyword] = useState('')
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([])
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([])
  const [resourceSaveError, setResourceSaveError] = useState<string | null>(null)
  const [applicationSaveError, setApplicationSaveError] = useState<string | null>(null)
  const [isSavingResources, setIsSavingResources] = useState(false)
  const [isSavingApplications, setIsSavingApplications] = useState(false)
  const locationState = (location.state as SupplyDemandDetailLocationState | null) ?? null
  const returnTo = typeof locationState?.returnTo === 'string' ? locationState.returnTo : ''
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const {
    data: supplyDemandItems,
    isLoading: isSupplyDemandLoading,
    error: supplyDemandError,
    reload: reloadSupplyDemandData,
  } = useSupplyDemandPortalData(true, { includeLinkedResources: true, includeRelatedApps: true })
  const {
    data: portalData,
    isLoading: isPortalLoading,
    error: portalError,
    session,
  } = usePortalContext()
  const canManageSupplyDemand = canManageCatalogResources(session?.user.roles)
  const {
    data: appCatalogData,
    isLoading: isApplicationCatalogLoading,
    error: applicationCatalogError,
  } = usePortalAppCatalogData(canManageSupplyDemand)

  const item = useMemo(
    () => supplyDemandItems.find((entry) => entry.id === (id ?? '')) ?? null,
    [id, supplyDemandItems],
  )

  const linkedResources = useMemo(
    () => (item ? buildLinkedResources(item, portalData?.catalogItems ?? []) : []),
    [item, portalData?.catalogItems],
  )
  const relatedApplications = useMemo(
    () => (item ? buildApplicationCards(item.relatedApps) : []),
    [item],
  )
  const editableResourceOptions = useMemo(
    () => buildEditableResourceOptions(portalData?.catalogItems ?? []),
    [portalData?.catalogItems],
  )
  const editableApplicationOptions = useMemo(
    () => buildEditableApplicationOptions(appCatalogData.flatItems),
    [appCatalogData.flatItems],
  )
  const filteredEditableResourceOptions = useMemo(() => {
    const keyword = resourceSearchKeyword.trim().toLowerCase()
    if (!keyword) return editableResourceOptions
    return editableResourceOptions.filter((resource) => resource.searchText.includes(keyword))
  }, [editableResourceOptions, resourceSearchKeyword])
  const filteredEditableApplicationOptions = useMemo(() => {
    const keyword = applicationSearchKeyword.trim().toLowerCase()
    if (!keyword) return editableApplicationOptions
    return editableApplicationOptions.filter((app) => app.searchText.includes(keyword))
  }, [editableApplicationOptions, applicationSearchKeyword])

  if (isSupplyDemandLoading || isPortalLoading) {
    return <div className="py-12 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载供需对接详情...</div>
  }

  if (supplyDemandError || portalError) {
    return (
      <div className="rounded-[18px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-6 text-[0.875rem] leading-7 text-[var(--status-danger-text)]">
        {supplyDemandError || portalError}
      </div>
    )
  }

  if (!item) {
    return <Navigate to={withEmbed('/demand')} replace />
  }

  const basicRows: Array<[string, string, string, string]> = [
    ['场景名称', item.sceneName, '所需数据资源', item.requiredDataResourceName],
    ['领域分类', item.domainCategoryName || '未标注', '数据分类', item.dataCategoryName || '未标注'],
    ['满足情况', buildStatusLabel(item), '发放时间', formatDateLabel(item.distributionDate)],
    ['期望频次', item.dataFrequencyDemandName || '未填写', '接入频次', item.dataSyncFrequencyName || '未填写'],
    ['数据来源单位', item.dataSourceUnitName || '未填写', '数据来源系统', item.dataSourceSystem || '未填写'],
    ['数据提供方式', item.dataSupplyMethodName || '未填写', '联系人', item.dataContactPerson || '未填写'],
    ['主要数据项', item.mainDataItems || '未填写', '', ''],
    ['需求描述', item.demandDescription || '未填写', '', ''],
  ]

  const handleGoBack = () => {
    if (returnTo) {
      navigate(returnTo)
      return
    }

    navigate(withEmbed('/demand'))
  }

  const openResourceEditDialog = () => {
    setSelectedResourceIds(Array.from(new Set(item.linkedResourceIds.filter(Boolean))))
    setResourceSearchKeyword('')
    setResourceSaveError(null)
    setIsResourceEditDialogOpen(true)
  }

  const openApplicationEditDialog = () => {
    setSelectedApplicationIds(Array.from(new Set(item.relatedAppIds.filter(Boolean))))
    setApplicationSearchKeyword('')
    setApplicationSaveError(null)
    setIsApplicationEditDialogOpen(true)
  }

  const closeResourceEditDialog = () => {
    if (isSavingResources) return
    setIsResourceEditDialogOpen(false)
    setResourceSaveError(null)
  }

  const closeApplicationEditDialog = () => {
    if (isSavingApplications) return
    setIsApplicationEditDialogOpen(false)
    setApplicationSaveError(null)
  }

  const handleSaveLinkedResources = async () => {
    setIsSavingResources(true)
    setResourceSaveError(null)

    try {
      await updateSupplyDemandLinkedResources(item.id, selectedResourceIds)
      await reloadSupplyDemandData()
      setIsResourceEditDialogOpen(false)
    } catch (error) {
      setResourceSaveError(error instanceof Error ? error.message : '保存对应数据资源失败')
    } finally {
      setIsSavingResources(false)
    }
  }

  const handleSaveRelatedApplications = async () => {
    setIsSavingApplications(true)
    setApplicationSaveError(null)

    try {
      await updateSupplyDemandRelatedApps(item.id, selectedApplicationIds)
      await reloadSupplyDemandData()
      setIsApplicationEditDialogOpen(false)
    } catch (error) {
      setApplicationSaveError(error instanceof Error ? error.message : '保存对应场景应用失败')
    } finally {
      setIsSavingApplications(false)
    }
  }

  return (
    <div className="space-y-5">
      <ScenicPanel className="overflow-hidden border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] p-0 shadow-[var(--shadow-elevated)]">
        <div className="px-6 py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                {item.domainCategoryName ? <TopicPill>{item.domainCategoryName}</TopicPill> : null}
                <TopicPill>{buildStatusLabel(item)}</TopicPill>
                {item.dataFrequencyDemandName ? <TopicPill>{item.dataFrequencyDemandName}</TopicPill> : null}
              </div>
              <h1 className="mt-5 text-[2rem] font-bold leading-tight text-[var(--text-main)]">{item.sceneName}</h1>
              <div className="mt-3 text-[1rem] text-[var(--text-secondary)]">
                所需数据资源：<span className="font-medium text-[var(--text-main)]">{item.requiredDataResourceName}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoBack}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.8125rem] font-medium text-[var(--text-secondary)] shadow-[0_10px_24px_rgba(51,98,146,0.08)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              返回列表
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[16px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] px-4 py-4 shadow-[0_12px_28px_rgba(33,76,124,0.10)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(var(--theme-soft-rgb),0.10)] text-[var(--primary)]">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[0.75rem] text-[var(--text-muted)]">对应数据资源</div>
                  <div className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{linkedResources.length}</div>
                </div>
              </div>
            </div>
            <div className="rounded-[16px] border border-[rgba(211,232,221,0.38)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--status-success-bg)_80%,var(--surface-raised-strong)),var(--surface-muted))] px-4 py-4 shadow-[0_12px_28px_rgba(33,76,124,0.10)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-text)]">
                  <Layers3 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[0.75rem] text-[var(--text-muted)]">对应应用</div>
                  <div className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{relatedApplications.length}</div>
                </div>
              </div>
            </div>
            <div className="rounded-[16px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised),var(--surface-muted))] px-4 py-4 shadow-[0_12px_28px_rgba(33,76,124,0.10)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(var(--theme-soft-rgb),0.10)] text-[var(--primary)]">
                  <Workflow className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[0.75rem] text-[var(--text-muted)]">业务领域</div>
                  <div className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{item.businessDomainCategoryNames.length || 1}</div>
                </div>
              </div>
            </div>
            <div className="rounded-[16px] border border-[rgba(211,232,221,0.38)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--status-success-bg)_80%,var(--surface-raised-strong)),var(--surface-muted))] px-4 py-4 shadow-[0_12px_28px_rgba(33,76,124,0.10)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-text)]">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[0.75rem] text-[var(--text-muted)]">已关联资源</div>
                  <div className="mt-1 text-[1.25rem] font-semibold text-[var(--text-main)]">{item.linkedResourceIds.length || linkedResources.length}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScenicPanel>

      <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-[1.125rem] font-semibold text-[var(--text-main)]">
          <span className="text-[var(--primary)]"><Workflow className="h-5 w-5" /></span>
          <span>基本信息</span>
        </div>

        <div className="mt-5 overflow-hidden rounded-[16px] border border-[var(--surface-outline)]">
          {basicRows.map((row, index) => (
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

      <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[1.125rem] font-semibold text-[var(--text-main)]">
            <span className="text-[var(--primary)]"><Database className="h-5 w-5" /></span>
            <span>对应数据资源</span>
          </div>
          {canManageSupplyDemand ? (
            <button
              type="button"
              title="编辑对应数据资源"
              onClick={openResourceEditDialog}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[0.8125rem] font-medium ${NAVY_SOFT_BUTTON_CLASS}`}
            >
              <Pencil className="h-4 w-4" />
              编辑对应数据资源
            </button>
          ) : null}
        </div>
        <div className="mt-5">
          <ResourceTable resources={linkedResources} withEmbed={withEmbed} />
        </div>
      </section>

      <section className="rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[1.125rem] font-semibold text-[var(--text-main)]">
            <span className="text-[var(--primary)]"><Layers3 className="h-5 w-5" /></span>
            <span>对应应用</span>
          </div>
          {canManageSupplyDemand ? (
            <button
              type="button"
              title="编辑对应场景应用"
              onClick={openApplicationEditDialog}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[0.8125rem] font-medium ${NAVY_SOFT_BUTTON_CLASS}`}
            >
              <Pencil className="h-4 w-4" />
              编辑对应场景应用
            </button>
          ) : null}
        </div>
        <div className="mt-5">
          <ApplicationCards applications={relatedApplications} withEmbed={withEmbed} />
        </div>
      </section>

      {isResourceEditDialogOpen && typeof document !== 'undefined'
        ? createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,30,43,0.42)] px-4 py-4 backdrop-blur-[3px]">
            <div className="relative flex max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[24px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[0_32px_72px_rgba(0,0,0,0.34)]">
              <div className="flex items-start justify-between gap-4 border-b border-[var(--surface-outline)] px-6 py-5">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-info-text)]">
                    <Database className="h-3.5 w-3.5" />
                    供需对接关联维护
                  </div>
                  <div title="编辑对应数据资源" className="mt-3 text-[1.75rem] font-semibold text-[var(--text-main)]">编辑对应数据资源</div>
                  <div className="mt-2 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
                    从目录资源中选择当前供需对接关联的数据资源，保存后会刷新当前详情页。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeResourceEditDialog}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${NAVY_ICON_BUTTON_CLASS}`}
                  aria-label="关闭编辑对应数据资源对话框"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <div className={DIALOG_FORM_CARD_CLASS}>
                  <label className="block">
                    <span className={DIALOG_FORM_LABEL_CLASS}>资源检索</span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        value={resourceSearchKeyword}
                        onChange={(event) => setResourceSearchKeyword(event.target.value)}
                        className={`${DIALOG_FORM_INPUT_CLASS} pl-11`}
                        placeholder="搜索数据资源名称、分类、提供单位"
                      />
                    </div>
                  </label>
                  <div className="mt-4 flex items-center justify-between gap-3 text-[0.75rem] text-[var(--text-secondary)]">
                    <div>已选择 {selectedResourceIds.length} 项</div>
                    <button
                      type="button"
                      onClick={() => setSelectedResourceIds([])}
                      className="text-[var(--primary)] transition hover:opacity-80"
                    >
                      清空选择
                    </button>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)]">
                  <div className="max-h-[56vh] overflow-auto">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-left text-[0.75rem] uppercase tracking-[0.05em] text-white">
                          <th className="px-4 py-3.5 font-semibold">选择</th>
                          <th className="px-4 py-3.5 font-semibold">数据资源</th>
                          <th className="px-4 py-3.5 font-semibold">资源分类</th>
                          <th className="px-4 py-3.5 font-semibold">提供单位</th>
                          <th className="px-4 py-3.5 font-semibold">更新周期</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEditableResourceOptions.map((resource, index) => {
                          const checked = selectedResourceIds.includes(resource.id)
                          return (
                            <tr
                              key={resource.id}
                              className={index % 2 === 0 ? 'bg-[var(--surface-raised-strong)]' : 'bg-[var(--table-row-alt)]'}
                            >
                              <td className="border-b border-[var(--line-soft)] px-4 py-4">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setSelectedResourceIds((current) => toggleSelectedId(current, resource.id))}
                                  className="h-4 w-4 rounded border-[var(--line)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                              </td>
                              <td className="border-b border-[var(--line-soft)] px-4 py-4">
                                <div className="text-[0.875rem] font-semibold text-[var(--text-main)]">{resource.name}</div>
                                {resource.description ? (
                                  <div className="mt-1 line-clamp-2 text-[0.75rem] leading-6 text-[var(--text-secondary)]">{resource.description}</div>
                                ) : null}
                              </td>
                              <td className="border-b border-[var(--line-soft)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">
                                {resource.category || resource.serviceType || '未标注'}
                              </td>
                              <td className="border-b border-[var(--line-soft)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">
                                {resource.department || '未填写'}
                              </td>
                              <td className="border-b border-[var(--line-soft)] px-4 py-4 text-[0.8125rem] text-[var(--text-secondary)]">
                                {resource.updateCycle || '未填写'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {filteredEditableResourceOptions.length === 0 ? (
                      <div className="px-5 py-10 text-center text-[0.875rem] text-[var(--text-muted)]">
                        当前检索条件下没有匹配的数据资源。
                      </div>
                    ) : null}
                  </div>
                </div>

                {resourceSaveError ? (
                  <div className="mt-5 rounded-[16px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
                    {resourceSaveError}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 py-4">
                <div className="text-[0.75rem] text-[var(--text-muted)]">
                  可多选，保存时会直接覆盖当前供需记录维护的关联资源。
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeResourceEditDialog}
                    className={`inline-flex h-10 items-center rounded-full px-4 text-[0.8125rem] font-medium ${NAVY_SOFT_BUTTON_CLASS}`}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveLinkedResources()
                    }}
                    disabled={isSavingResources}
                    className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[0.8125rem] font-medium ${NAVY_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {isSavingResources ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                    保存对应数据资源
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}

      {isApplicationEditDialogOpen && typeof document !== 'undefined'
        ? createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,30,43,0.42)] px-4 py-4 backdrop-blur-[3px]">
            <div className="relative flex max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[24px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[0_32px_72px_rgba(0,0,0,0.34)]">
              <div className="flex items-start justify-between gap-4 border-b border-[var(--surface-outline)] px-6 py-5">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-info-text)]">
                    <Layers3 className="h-3.5 w-3.5" />
                    场景应用关联维护
                  </div>
                  <div title="编辑对应场景应用" className="mt-3 text-[1.75rem] font-semibold text-[var(--text-main)]">编辑对应场景应用</div>
                  <div className="mt-2 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
                    从场景应用目录中选择当前供需对接关联的应用，保存后会刷新当前详情页。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeApplicationEditDialog}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${NAVY_ICON_BUTTON_CLASS}`}
                  aria-label="关闭编辑对应场景应用对话框"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <div className={DIALOG_FORM_CARD_CLASS}>
                  <label className="block">
                    <span className={DIALOG_FORM_LABEL_CLASS}>应用检索</span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        value={applicationSearchKeyword}
                        onChange={(event) => setApplicationSearchKeyword(event.target.value)}
                        className={`${DIALOG_FORM_INPUT_CLASS} pl-11`}
                        placeholder="搜索场景应用名称、标签、描述"
                      />
                    </div>
                  </label>
                  <div className="mt-4 flex items-center justify-between gap-3 text-[0.75rem] text-[var(--text-secondary)]">
                    <div>已选择 {selectedApplicationIds.length} 项</div>
                    <button
                      type="button"
                      onClick={() => setSelectedApplicationIds([])}
                      className="text-[var(--primary)] transition hover:opacity-80"
                    >
                      清空选择
                    </button>
                  </div>
                </div>

                {applicationCatalogError ? (
                  <div className="mt-5 rounded-[16px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
                    {applicationCatalogError}
                  </div>
                ) : null}

                <div className="mt-5 rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-4">
                  {isApplicationCatalogLoading ? (
                    <div className="py-10 text-center text-[0.875rem] text-[var(--text-muted)]">正在加载场景应用目录...</div>
                  ) : (
                    <div className="grid gap-4 xl:grid-cols-2">
                      {filteredEditableApplicationOptions.map((app) => {
                        const checked = selectedApplicationIds.includes(app.id)
                        return (
                          <label
                            key={app.id}
                            className={`flex cursor-pointer gap-4 rounded-[18px] border px-4 py-4 transition ${
                              checked
                                ? 'border-[rgba(32,113,218,0.32)] bg-[rgba(52,128,224,0.10)] shadow-[0_16px_28px_rgba(33,76,124,0.10)]'
                                : 'border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] hover:border-[rgba(32,113,218,0.24)]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setSelectedApplicationIds((current) => toggleSelectedId(current, app.id))}
                              className="mt-1 h-4 w-4 rounded border-[var(--line)] text-[var(--primary)] focus:ring-[var(--primary)]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-[0.9375rem] font-semibold text-[var(--text-main)]">{app.name}</div>
                                  <div className="mt-1 text-[0.75rem] leading-6 text-[var(--text-secondary)]">{app.pathLabel}</div>
                                </div>
                                {app.domainCategoryName ? <TopicPill>{app.domainCategoryName}</TopicPill> : null}
                              </div>
                              {app.description ? (
                                <div className="mt-3 line-clamp-2 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">{app.description}</div>
                              ) : null}
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                                <span>{app.contact || '未填写联系人'}</span>
                                {app.tags.slice(0, 3).map((tag) => (
                                  <TopicPill key={`${app.id}-${tag}`}>{tag}</TopicPill>
                                ))}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {!isApplicationCatalogLoading && filteredEditableApplicationOptions.length === 0 ? (
                    <div className="py-10 text-center text-[0.875rem] text-[var(--text-muted)]">
                      当前检索条件下没有匹配的场景应用。
                    </div>
                  ) : null}
                </div>

                {applicationSaveError ? (
                  <div className="mt-5 rounded-[16px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
                    {applicationSaveError}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 py-4">
                <div className="text-[0.75rem] text-[var(--text-muted)]">
                  可多选，保存时会直接覆盖当前供需记录维护的关联场景应用。
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeApplicationEditDialog}
                    className={`inline-flex h-10 items-center rounded-full px-4 text-[0.8125rem] font-medium ${NAVY_SOFT_BUTTON_CLASS}`}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveRelatedApplications()
                    }}
                    disabled={isSavingApplications || isApplicationCatalogLoading}
                    className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[0.8125rem] font-medium ${NAVY_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {isSavingApplications ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />}
                    保存对应场景应用
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}
