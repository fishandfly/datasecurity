import { createPortal } from 'react-dom'
import { useMemo, useState, type ChangeEvent } from 'react'
import { CalendarClock, ChevronDown, CirclePlus, Database, Link2, Sparkles, Trash2, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { DemandApplicationTabView } from './demand-application-tab-view'
import { Button, StatCard } from './ui'
import {
  createPortalAppCatalogEntry,
  deletePortalAppCatalogAttachment,
  uploadPortalAppCatalogScreenshot,
  usePortalAppCatalogData,
} from '../lib/nocobase-app-data'
import { matchesFullTextSearch } from '../lib/full-text-search'
import type { SelectOption } from '../lib/nocobase-portal-data'
import { cn } from '../lib/utils'

type ApplicationCreateFormState = {
  name: string
  parentId: string
  domainCategoryId: string
  seqId: string
  contact: string
  tagsText: string
  description: string
}

const EMPTY_APPLICATION_CREATE_FORM: ApplicationCreateFormState = {
  name: '',
  parentId: '',
  domainCategoryId: '',
  seqId: '',
  contact: '',
  tagsText: '',
  description: '',
}

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

function buildApplicationCreateForm(initial: Partial<ApplicationCreateFormState> = {}): ApplicationCreateFormState {
  return {
    ...EMPTY_APPLICATION_CREATE_FORM,
    ...initial,
  }
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

export function PortalApplicationCatalogSection() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeApplicationNodeId = searchParams.get('appNode') ?? ''
  const applicationKeyword = (searchParams.get('appKeyword') ?? '').trim()
  const applicationDomainId = searchParams.get('appDomain') ?? ''
  const {
    data: appCatalogData,
    isLoading: isApplicationCatalogLoading,
    error: applicationCatalogError,
    reload: reloadApplicationCatalog,
  } = usePortalAppCatalogData(true)

  const [isApplicationCreateDialogOpen, setIsApplicationCreateDialogOpen] = useState(false)
  const [applicationCreateForm, setApplicationCreateForm] = useState<ApplicationCreateFormState>(EMPTY_APPLICATION_CREATE_FORM)
  const [applicationCreateError, setApplicationCreateError] = useState<string | null>(null)
  const [applicationCreateSuccess, setApplicationCreateSuccess] = useState<string | null>(null)
  const [applicationCreateScreenshotFile, setApplicationCreateScreenshotFile] = useState<File | null>(null)
  const [applicationCreateScreenshotPreviewUrl, setApplicationCreateScreenshotPreviewUrl] = useState('')
  const [isApplicationCreating, setIsApplicationCreating] = useState(false)

  const applicationNodeById = useMemo(
    () => new Map(appCatalogData.flatItems.map((item) => [item.id, item])),
    [appCatalogData.flatItems],
  )

  const activeApplicationNode = useMemo(
    () => applicationNodeById.get(activeApplicationNodeId) ?? null,
    [activeApplicationNodeId, applicationNodeById],
  )

  const resolvedApplicationNodeId = activeApplicationNode?.id ?? ''

  const applicationBaseItems = useMemo(() => {
    if (!activeApplicationNode) {
      return appCatalogData.rootItems
    }

    return activeApplicationNode.children.length > 0 ? activeApplicationNode.children : [activeApplicationNode]
  }, [activeApplicationNode, appCatalogData.rootItems])

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

  const applicationParentOptions = useMemo<SelectOption[]>(
    () => appCatalogData.flatItems.map((item) => ({ value: item.id, label: item.pathLabel })),
    [appCatalogData.flatItems],
  )

  const resolvedApplicationDomainId = useMemo(
    () =>
      applicationDomainOptions.some((option) => option.value === applicationDomainId)
        ? applicationDomainId
        : '',
    [applicationDomainId, applicationDomainOptions],
  )

  const filteredApplicationItems = useMemo(() => {
    return applicationBaseItems.filter((item) => {
      if (resolvedApplicationDomainId && item.domainCategoryId !== resolvedApplicationDomainId) {
        return false
      }

      if (applicationKeyword.trim() && !matchesFullTextSearch(item.searchText, applicationKeyword)) {
        return false
      }

      return true
    })
  }, [applicationBaseItems, applicationKeyword, resolvedApplicationDomainId])

  const applicationMetrics = useMemo(
    () => ({
      totalNodes: appCatalogData.flatItems.length,
      topLevelNodes: appCatalogData.rootItems.length,
      leafNodes: appCatalogData.flatItems.filter((item) => !item.hasChildren).length,
      currentNodes: filteredApplicationItems.length,
    }),
    [appCatalogData.flatItems, appCatalogData.rootItems.length, filteredApplicationItems.length],
  )

  const updateApplicationSearchParams = (updates: { nodeId?: string; keyword?: string; domainId?: string }) => {
    const next = new URLSearchParams(searchParams)

    if (updates.nodeId !== undefined) {
      const normalizedNodeId = updates.nodeId.trim()
      if (normalizedNodeId) {
        next.set('appNode', normalizedNodeId)
      } else {
        next.delete('appNode')
      }
    }

    if (updates.keyword !== undefined) {
      const normalizedKeyword = updates.keyword.trim()
      if (normalizedKeyword) {
        next.set('appKeyword', normalizedKeyword)
      } else {
        next.delete('appKeyword')
      }
    }

    if (updates.domainId !== undefined) {
      const normalizedDomainId = updates.domainId.trim()
      if (normalizedDomainId) {
        next.set('appDomain', normalizedDomainId)
      } else {
        next.delete('appDomain')
      }
    }

    setSearchParams(next, { replace: true })
  }

  const openApplicationCreateDialog = () => {
    const defaultParentId = activeApplicationNode
      ? (activeApplicationNode.hasChildren ? activeApplicationNode.id : activeApplicationNode.parentId ?? '')
      : ''
    const defaultDomainCategoryId = resolvedApplicationDomainId || activeApplicationNode?.domainCategoryId || ''

    setApplicationCreateForm(buildApplicationCreateForm({
      parentId: defaultParentId,
      domainCategoryId: defaultDomainCategoryId,
    }))
    setApplicationCreateScreenshotFile(null)
    setApplicationCreateScreenshotPreviewUrl('')
    setApplicationCreateError(null)
    setApplicationCreateSuccess(null)
    setIsApplicationCreateDialogOpen(true)
  }

  const closeApplicationCreateDialog = () => {
    if (isApplicationCreating) return
    setIsApplicationCreateDialogOpen(false)
    setApplicationCreateScreenshotFile(null)
    setApplicationCreateScreenshotPreviewUrl('')
    setApplicationCreateError(null)
  }

  const setApplicationCreateField = <K extends keyof ApplicationCreateFormState,>(
    key: K,
    value: ApplicationCreateFormState[K],
  ) => {
    setApplicationCreateForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const handleApplicationCreateScreenshotChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setApplicationCreateError('请上传图片格式的应用截图')
      return
    }

    try {
      const previewUrl = await readImageFileAsDataUrl(file)
      setApplicationCreateScreenshotFile(file)
      setApplicationCreateScreenshotPreviewUrl(previewUrl)
      setApplicationCreateError(null)
    } catch (error) {
      setApplicationCreateError(error instanceof Error ? error.message : '读取应用截图失败')
    }
  }

  const clearApplicationCreateScreenshot = () => {
    setApplicationCreateScreenshotFile(null)
    setApplicationCreateScreenshotPreviewUrl('')
  }

  const submitApplicationCreate = async () => {
    const normalizedName = applicationCreateForm.name.trim()
    const normalizedParentId = applicationCreateForm.parentId.trim()
    const normalizedDomainCategoryId = applicationCreateForm.domainCategoryId.trim()

    if (!normalizedName) {
      setApplicationCreateError('请填写场景应用名称')
      return
    }

    setIsApplicationCreating(true)
    setApplicationCreateError(null)

    let created = false
    let uploadedScreenshot: Awaited<ReturnType<typeof uploadPortalAppCatalogScreenshot>> | null = null

    try {
      if (applicationCreateScreenshotFile) {
        uploadedScreenshot = await uploadPortalAppCatalogScreenshot(applicationCreateScreenshotFile)
      }

      await createPortalAppCatalogEntry({
        name: normalizedName,
        parentId: normalizedParentId || null,
        domainCategoryId: normalizedDomainCategoryId,
        seqId: applicationCreateForm.seqId.trim(),
        contact: applicationCreateForm.contact.trim(),
        description: applicationCreateForm.description.trim(),
        tags: splitApplicationTags(applicationCreateForm.tagsText),
        screenshotAttachmentId: uploadedScreenshot?.id ?? null,
      })
      created = true

      updateApplicationSearchParams({
        nodeId: normalizedParentId,
        keyword: '',
        domainId: normalizedDomainCategoryId,
      })

      await reloadApplicationCatalog()
      setApplicationCreateForm(EMPTY_APPLICATION_CREATE_FORM)
      clearApplicationCreateScreenshot()
      setIsApplicationCreateDialogOpen(false)
      setApplicationCreateSuccess(`已新建场景应用“${normalizedName}”，目录已刷新。`)
    } catch (error) {
      if (!created && uploadedScreenshot?.id) {
        try {
          await deletePortalAppCatalogAttachment(uploadedScreenshot.id)
        } catch {
          /* ignore cleanup failure */
        }
      }

      if (created) {
        setApplicationCreateForm(EMPTY_APPLICATION_CREATE_FORM)
        clearApplicationCreateScreenshot()
        setIsApplicationCreateDialogOpen(false)
        setApplicationCreateSuccess(`已新建场景应用“${normalizedName}”，但目录刷新失败，请稍后手动刷新页面。`)
      } else {
        setApplicationCreateError(error instanceof Error ? error.message : '场景应用创建失败')
      }
    } finally {
      setIsApplicationCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[20px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-6 shadow-[var(--shadow-medium)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[1.5rem] font-semibold text-[var(--text-main)]">场景应用</div>
            <div className="mt-2 text-[0.875rem] leading-7 text-[var(--text-secondary)]">
              在数据API服务下统一浏览场景应用目录，支持按分类、领域和关键词筛选，并可直接新增应用节点。
            </div>
          </div>
          <Button className={cn('rounded-full', NAVY_BUTTON_CLASS)} onClick={() => openApplicationCreateDialog()}>
            <CirclePlus className="mr-1 h-4 w-4" />
            新建场景应用
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="应用节点总数" value={`${applicationMetrics.totalNodes}`} icon={<Database className="h-5 w-5" />} />
          <StatCard title="一级分类数量" value={`${applicationMetrics.topLevelNodes}`} icon={<Sparkles className="h-5 w-5" />} />
          <StatCard title="叶子应用数量" value={`${applicationMetrics.leafNodes}`} icon={<Link2 className="h-5 w-5" />} />
          <StatCard title="当前展示数量" value={`${applicationMetrics.currentNodes}`} tone="green" icon={<CalendarClock className="h-5 w-5" />} />
        </div>
      </section>

      {applicationCreateSuccess ? (
        <div className="rounded-[16px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-5 py-4 text-[0.8125rem] leading-6 text-[var(--status-success-text)]">
          {applicationCreateSuccess}
        </div>
      ) : null}

      <DemandApplicationTabView
        tree={appCatalogData.tree}
        items={filteredApplicationItems}
        activeNodeId={resolvedApplicationNodeId}
        activeNodePathLabel={activeApplicationNode?.pathLabel ?? ''}
        keyword={applicationKeyword}
        domainId={resolvedApplicationDomainId}
        domainOptions={applicationDomainOptions}
        isLoading={isApplicationCatalogLoading}
        error={applicationCatalogError}
        onSelectNode={(nodeId) => updateApplicationSearchParams({ nodeId })}
        onSelectDomain={(domainId) => updateApplicationSearchParams({ domainId })}
        onSubmitKeyword={(keyword) => updateApplicationSearchParams({ keyword })}
        onResetFilters={() => updateApplicationSearchParams({ nodeId: '', keyword: '', domainId: '' })}
      />

      {isApplicationCreateDialogOpen
        ? typeof document !== 'undefined'
          ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,30,43,0.42)] px-4 py-4 backdrop-blur-[3px]">
              <div className="relative flex max-h-[92vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[24px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[0_32px_72px_rgba(0,0,0,0.34)]">
                <div className="flex items-start justify-between gap-4 border-b border-[var(--surface-outline)] px-6 py-5">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-info-text)]">
                      <Sparkles className="h-3.5 w-3.5" />
                      场景应用目录
                    </div>
                    <div className="mt-3 text-[1.75rem] font-semibold text-[var(--text-main)]">新建场景应用</div>
                    <div className="mt-2 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
                      支持直接挂到当前分类节点下，提交后会自动刷新右侧场景应用卡片。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeApplicationCreateDialog}
                    className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full', NAVY_ICON_BUTTON_CLASS)}
                    aria-label="关闭新建场景应用对话框"
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
                            value={applicationCreateForm.name}
                            onChange={(event) => setApplicationCreateField('name', event.target.value)}
                            className={DIALOG_FORM_INPUT_CLASS}
                            placeholder="例如：生态环境综合研判驾驶舱"
                          />
                        </label>

                        <label className="block">
                          <span className={DIALOG_FORM_LABEL_CLASS}>父级应用</span>
                          <div className="relative">
                            <select
                              value={applicationCreateForm.parentId}
                              onChange={(event) => setApplicationCreateField('parentId', event.target.value)}
                              className={DIALOG_FORM_SELECT_CLASS}
                            >
                              <option value="">无父级，创建顶层应用</option>
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
                              value={applicationCreateForm.domainCategoryId}
                              onChange={(event) => setApplicationCreateField('domainCategoryId', event.target.value)}
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
                            value={applicationCreateForm.seqId}
                            onChange={(event) => setApplicationCreateField('seqId', event.target.value)}
                            className={DIALOG_FORM_INPUT_CLASS}
                            placeholder="例如：03-12"
                          />
                        </label>

                        <label className="block">
                          <span className={DIALOG_FORM_LABEL_CLASS}>联系人</span>
                          <input
                            value={applicationCreateForm.contact}
                            onChange={(event) => setApplicationCreateField('contact', event.target.value)}
                            className={DIALOG_FORM_INPUT_CLASS}
                            placeholder="例如：李工 / 0431-xxxx"
                          />
                        </label>

                        <label className="block md:col-span-2">
                          <span className={DIALOG_FORM_LABEL_CLASS}>标签</span>
                          <input
                            value={applicationCreateForm.tagsText}
                            onChange={(event) => setApplicationCreateField('tagsText', event.target.value)}
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
                          value={applicationCreateForm.description}
                          onChange={(event) => setApplicationCreateField('description', event.target.value)}
                          className={DIALOG_FORM_TEXTAREA_CLASS}
                          placeholder="简要说明这个场景应用服务的对象、使用方式和核心能力。"
                        />
                      </label>

                      <div className="mt-4">
                        <span className={DIALOG_FORM_LABEL_CLASS}>应用截图</span>
                        <div className="overflow-hidden rounded-[16px] border border-[var(--surface-outline)] bg-[var(--surface-raised)]">
                          <div className="relative h-[188px] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(var(--theme-soft-rgb),0.18),transparent_58%),linear-gradient(180deg,var(--surface-raised-strong),var(--surface-tint))]">
                            {applicationCreateScreenshotPreviewUrl ? (
                              <img
                                src={applicationCreateScreenshotPreviewUrl}
                                alt="应用截图预览"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center px-6 text-center text-[0.8125rem] leading-6 text-[var(--text-muted)]">
                                上传应用首页或核心功能截图，创建完成后会直接展示在场景应用详情页。
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
                                void handleApplicationCreateScreenshotChange(event)
                              }}
                            />
                            上传截图
                          </label>
                          {applicationCreateScreenshotPreviewUrl ? (
                            <button
                              type="button"
                              onClick={clearApplicationCreateScreenshot}
                              className={cn('inline-flex items-center rounded-full px-4 py-2 text-[0.8125rem] font-semibold', NAVY_SOFT_BUTTON_CLASS)}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              清空截图
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 rounded-[16px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 py-4 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
                        <div className="font-semibold text-[var(--text-main)]">提交说明</div>
                        <div className="mt-2">父级应用为空时，将在场景应用目录顶层新增节点。</div>
                        <div>如果未选择领域分类，但父级已配置领域，列表加载时会自动沿用父级分类展示。</div>
                      </div>
                    </div>
                  </div>

                  {applicationCreateError ? (
                    <div className="mt-5 rounded-[16px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
                      {applicationCreateError}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 py-4">
                  <div className="text-[0.75rem] text-[var(--text-muted)]">
                    新建后会清空当前应用关键词筛选，并定位到所选父级节点刷新列表。
                  </div>
                  <div className="flex items-center gap-3">
                    <Button className={cn('rounded-full', NAVY_SOFT_BUTTON_CLASS)} onClick={closeApplicationCreateDialog}>
                      取消
                    </Button>
                    <Button
                      className={cn('rounded-full', NAVY_BUTTON_CLASS)}
                      disabled={isApplicationCreating}
                      onClick={() => {
                        void submitApplicationCreate()
                      }}
                    >
                      {isApplicationCreating ? (
                        <>
                          <CirclePlus className="mr-2 h-4 w-4 animate-spin" />
                          创建中...
                        </>
                      ) : (
                        <>
                          <CirclePlus className="mr-2 h-4 w-4" />
                          提交场景应用
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
