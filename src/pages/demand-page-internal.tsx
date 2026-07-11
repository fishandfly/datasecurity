import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  Check,
  CirclePlus,
  ChevronDown,
  ChevronRight,
  Columns3,
  Database,
  Link2,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { PortalApplicationCatalogSection } from '../components/portal-application-catalog-section'
import { DemandExternalTabView } from '../components/demand-external-tab-view'
import { Button, StatCard, TopicPill } from '../components/ui'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'
import {
  createCategoryLookup,
  createInitialExpandedCategoryIds,
  pruneEmptyCategoryTreeNodes,
  toggleExpandedCategoryId,
  type CatalogCategoryTreeNode,
} from '../lib/catalog-category-tree'
import { getCategoryIcon } from '../lib/category-helper'
import { removeCatalogClaimCartItems } from '../lib/catalog-claim-cart'
import { mergeClaimCartDemandPrefillRows } from '../lib/demand-claim-cart-prefill'
import { filterResourceOptions, type ResourceSearchItem } from '../lib/demand-form-helpers'
import { useDemandPageSupportData } from '../lib/demand-page-support-data'
import { matchesFullTextSearch } from '../lib/full-text-search'
import { buildPaginationItems } from '../lib/pagination'
import { type SelectOption } from '../lib/nocobase-portal-data'
import {
  createSupplyDemandInfoBatch,
  fetchSupplyDemandPortalPage,
  fetchSupplyDemandPortalSummaryData,
  isExternalSupplyDemandItem,
  isInternalSupplyDemandItem,
  type SupplyDemandInfo,
  type SupplyDemandPortalPageResult,
} from '../lib/nocobase-supply-demand-data'
import { getDefaultDemandTabs, usePortalNavigations } from '../lib/nocobase-portal-navigation'
import { ALL_PRODUCT_MODULE_IDS } from '../lib/product-modules'
import { cn } from '../lib/utils'

type SceneSummary = {
  sceneName: string
  recordCount: number
  dominantDomainCategoryId: string
}

type DemandViewTabId = 'demand' | 'external' | 'application'

type FormRowState = {
  id: string
  claimCartItemId: string
  claimCartItemIds: string[]
  sceneName: string
  requiredDataResourceName: string
  mainDataItems: string
  demandDescription: string
  dataFrequencyDemandId: string
  linkedResourceKeyword: string
  linkedResourceId: string
  linkedResourceIds: string[]
  linkedResourceNames: string[]
}

type DemandFormTableRowProps = {
  row: FormRowState
  rowIndex: number
  resourceOptions: ResourceSearchItem[]
  updateCycleOptions: SelectOption[]
  canRemove: boolean
  onChange: (rowId: string, patch: Partial<FormRowState>) => void
  onRemove: (rowId: string) => void
}

type StatusFilterKey = '' | 'connected' | 'partial' | 'pending' | 'review'

type DomainCategoryTreeSelectProps = {
  tree: CatalogCategoryTreeNode[]
  value: string
  onChange: (nextValue: string) => void
}

type DemandPagePrefill = {
  resourceId?: string | number
  claimCartItemId?: string
  claimCartItemIds?: string[]
  linkedResourceId?: string | number
  linkedResourceIds?: Array<string | number>
  resourceName?: string
  resourceNames?: string[]
  title?: string
  description?: string
  useCase?: string
}

type DemandPageLocationState = {
  prefill?: DemandPagePrefill
  prefillRows?: DemandPagePrefill[]
  openCreateDialog?: boolean
  clearClaimCartOnSuccess?: boolean
}

type DemandTableColumnKey =
  | 'id'
  | 'createdById'
  | 'updatedById'
  | 'sceneName'
  | 'requiredDataResourceName'
  | 'mainDataItems'
  | 'demandDescription'
  | 'isRequired'
  | 'dataStatusDescription'
  | 'dataSourceSystem'
  | 'dataContactPerson'
  | 'dataConnectionDescription'
  | 'dataCategoryId'
  | 'dataCategoryName'
  | 'dataSourceUnitId'
  | 'dataSourceUnitName'
  | 'dataFrequencyDemandName'
  | 'dataFrequencyDemandId'
  | 'dataSupplyMethodId'
  | 'dataSupplyMethodName'
  | 'dataSyncFrequencyId'
  | 'dataSyncFrequencyName'
  | 'domainCategoryId'
  | 'domainCategoryName'
  | 'externalDataCategoryId'
  | 'externalDataCategoryName'
  | 'listSourceId'
  | 'listSourceName'
  | 'satisfactionStatusId'
  | 'satisfactionStatusName'
  | 'businessDomainCategoryIds'
  | 'businessDomainCategoryNames'
  | 'linkedResourceIds'
  | 'status'
  | 'linkedResourceNames'
  | 'distributionDate'
  | 'createdAt'
  | 'updatedAt'

type DemandTableSortDirection = 'asc' | 'desc'

type DemandTableSortState = {
  key: DemandTableColumnKey
  direction: DemandTableSortDirection
}

const PAGE_SIZE = 10

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilterKey; label: string }> = [
  { value: '', label: '全部满足情况' },
  { value: 'connected', label: '已接入 / 已满足' },
  { value: 'partial', label: '部分满足' },
  { value: 'pending', label: '待补充' },
  { value: 'review', label: '待研判' },
]

const TABLE_ROW_CLASS = 'group transition-all duration-200 hover:bg-[var(--surface-tint)]'
const TABLE_EVEN_ROW_CLASS = 'bg-[var(--surface-raised-strong)]'
const TABLE_ODD_ROW_CLASS = 'bg-[var(--table-row-alt)]'
const TABLE_CELL_CLASS =
  'border-b border-[var(--line-soft)] transition-colors duration-200 group-hover:bg-[var(--table-row-hover)]'

const NAVY_BUTTON_CLASS =
  'border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-white shadow-[0_14px_28px_rgba(10,104,232,0.18)] transition-all duration-200 hover:brightness-[1.04] hover:-translate-y-[1px]'

const NAVY_SOFT_BUTTON_CLASS =
  'border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] text-[var(--primary)] shadow-[0_10px_24px_rgba(10,104,232,0.10)] transition-all duration-200 hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white hover:-translate-y-[1px]'

const NAVY_ICON_BUTTON_CLASS =
  'border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] text-[var(--primary)] shadow-[0_10px_24px_rgba(10,104,232,0.10)] transition-all duration-200 hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white'

const TABLE_HEAD_ROW_CLASS =
  'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] text-[0.8125rem] uppercase tracking-[0.05em] text-white'

const TABLE_HEAD_CELL_CLASS = 'border-b border-[rgba(255,255,255,0.16)] px-4 py-3.5 font-semibold'
const DIALOG_FORM_CARD_CLASS =
  'rounded-[20px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 shadow-[0_18px_28px_rgba(7,15,28,0.14)]'
const DIALOG_FORM_LABEL_CLASS =
  'mb-2 block text-[0.75rem] font-semibold tracking-[0.02em] text-[var(--text-secondary)]'
const DIALOG_FORM_INPUT_CLASS =
  'h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 text-[0.875rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]'
const DIALOG_FORM_TEXTAREA_CLASS =
  'min-h-[132px] w-full rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 py-3 text-[0.875rem] leading-6 text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]'

const DEMAND_TABLE_COLUMNS: Array<{
  key: DemandTableColumnKey
  label: string
  headClassName?: string
  cellClassName: string
}> = [
  {
    key: 'id',
    label: '记录 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'sceneName',
    label: '场景名称',
    cellClassName: 'max-w-[220px] px-4 py-4 align-top',
  },
  {
    key: 'requiredDataResourceName',
    label: '所需数据资源',
    cellClassName: 'max-w-[250px] px-4 py-4 align-top',
  },
  {
    key: 'mainDataItems',
    label: '主要数据项',
    cellClassName: 'max-w-[260px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]',
  },
  {
    key: 'demandDescription',
    label: '需求描述',
    cellClassName: 'max-w-[300px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]',
  },
  {
    key: 'isRequired',
    label: '是否需要',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'dataFrequencyDemandName',
    label: '期望频次',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'dataSyncFrequencyName',
    label: '接入频次',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'status',
    label: '满足情况',
    cellClassName: 'px-4 py-4 align-top',
  },
  {
    key: 'satisfactionStatusName',
    label: '满足情况原值',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'dataStatusDescription',
    label: '数据现状说明',
    cellClassName: 'max-w-[280px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]',
  },
  {
    key: 'dataSourceSystem',
    label: '数据来源系统',
    cellClassName: 'max-w-[220px] px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'dataSourceUnitName',
    label: '数据来源单位',
    cellClassName: 'max-w-[220px] px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'dataSupplyMethodName',
    label: '数据提供方式',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'dataContactPerson',
    label: '数据对接人及联系方式',
    cellClassName: 'max-w-[220px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]',
  },
  {
    key: 'dataConnectionDescription',
    label: '数据对接说明',
    cellClassName: 'max-w-[280px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]',
  },
  {
    key: 'dataCategoryName',
    label: '信息分类',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'domainCategoryName',
    label: '数据资源分类',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'externalDataCategoryName',
    label: '数据类别',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'listSourceName',
    label: '清单来源',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'businessDomainCategoryNames',
    label: '业务分类',
    cellClassName: 'max-w-[240px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]',
  },
  {
    key: 'linkedResourceNames',
    label: '关联目录资源',
    cellClassName: 'max-w-[260px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]',
  },
  {
    key: 'linkedResourceIds',
    label: '关联资源 ID',
    cellClassName: 'max-w-[220px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]',
  },
  {
    key: 'distributionDate',
    label: '发放日期',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'createdAt',
    label: '创建时间',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'updatedAt',
    label: '更新时间',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'createdById',
    label: '创建人 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'updatedById',
    label: '更新人 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'dataCategoryId',
    label: '信息分类 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'dataSourceUnitId',
    label: '数据来源单位 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'dataFrequencyDemandId',
    label: '期望频次 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'dataSupplyMethodId',
    label: '数据提供方式 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'dataSyncFrequencyId',
    label: '接入频次 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'domainCategoryId',
    label: '数据资源分类 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'externalDataCategoryId',
    label: '数据类别 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'listSourceId',
    label: '清单来源 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'satisfactionStatusId',
    label: '满足情况 ID',
    cellClassName: 'px-4 py-4 align-top text-[0.8125rem] text-[var(--text-secondary)]',
  },
  {
    key: 'businessDomainCategoryIds',
    label: '业务分类 ID',
    cellClassName: 'max-w-[220px] px-4 py-4 align-top text-[0.8125rem] leading-6 text-[var(--text-secondary)]',
  },
]

const DEMAND_TABLE_DEFAULT_VISIBLE_COLUMN_KEYS: DemandTableColumnKey[] = [
  'sceneName',
  'requiredDataResourceName',
  'mainDataItems',
  'demandDescription',
  'dataSyncFrequencyName',
  'status',
  'dataSourceUnitName',
  'dataSupplyMethodName',
]

const DEMAND_TABLE_DEFAULT_SORT: DemandTableSortState = {
  key: 'sceneName',
  direction: 'asc',
}

const LINKED_RESOURCE_COLUMN_KEYS: DemandTableColumnKey[] = ['linkedResourceIds', 'linkedResourceNames']
const EMPTY_SUPPLY_DEMAND_PAGE_RESULT: SupplyDemandPortalPageResult = {
  items: [],
  page: 1,
  pageSize: PAGE_SIZE,
  totalCount: 0,
  totalPages: 1,
}

function buildRowId() {
  return `scene-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizePrefillText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePrefillIdArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (item === null || item === undefined ? '' : String(item).trim()))
    .filter(Boolean)
}

function normalizePrefillNameArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizePrefillText(item))
    .filter(Boolean)
}

function buildEmptyFormRow(prefill?: DemandPagePrefill, sceneName = ''): FormRowState {
  const claimCartItemId = normalizePrefillText(prefill?.claimCartItemId)
  const normalizedClaimCartItemIds = normalizePrefillIdArray(prefill?.claimCartItemIds)
  const claimCartItemIds = Array.from(new Set(
    [
      ...normalizedClaimCartItemIds,
      ...(claimCartItemId ? [claimCartItemId] : []),
    ],
  ))
  const normalizedLinkedResourceIds = normalizePrefillIdArray(prefill?.linkedResourceIds)
  const linkedResourceIds = Array.from(new Set(
    normalizedLinkedResourceIds.length > 0
      ? normalizedLinkedResourceIds
      : (() => {
        const linkedResourceId = prefill?.linkedResourceId ?? (claimCartItemId ? '' : prefill?.resourceId)
        const normalized = linkedResourceId === null || linkedResourceId === undefined ? '' : String(linkedResourceId).trim()
        return normalized ? [normalized] : []
      })(),
  ))
  const normalizedLinkedResourceNames = normalizePrefillNameArray(prefill?.resourceNames)
  const linkedResourceNames = Array.from(new Set(
    normalizedLinkedResourceNames.length > 0
      ? normalizedLinkedResourceNames
      : (() => {
        const resourceName = normalizePrefillText(prefill?.resourceName)
        return resourceName ? [resourceName] : []
      })(),
  ))
  const linkedResourceId = linkedResourceIds.length > 1 ? '' : linkedResourceIds[0] ?? ''
  const linkedResourceKeyword = linkedResourceNames.length > 1 ? '' : linkedResourceNames[0] ?? ''

  return {
    id: buildRowId(),
    claimCartItemId: claimCartItemIds[0] ?? claimCartItemId,
    claimCartItemIds,
    sceneName: normalizePrefillText(sceneName || prefill?.useCase),
    requiredDataResourceName: normalizePrefillText(prefill?.title),
    mainDataItems: '',
    demandDescription: normalizePrefillText(prefill?.description),
    dataFrequencyDemandId: '',
    linkedResourceKeyword,
    linkedResourceId,
    linkedResourceIds,
    linkedResourceNames,
  }
}

function buildCreateDialogPrefillRows(prefillRows: DemandPagePrefill[], prefill?: DemandPagePrefill) {
  if (prefillRows.length > 1) {
    return [buildEmptyFormRow(mergeClaimCartDemandPrefillRows(prefillRows), prefillRows[0]?.useCase ?? '')]
  }

  if (prefillRows.length > 0) {
    return [buildEmptyFormRow(prefillRows[0], prefillRows[0].useCase ?? '')]
  }

  return [buildEmptyFormRow(prefill)]
}

function normalizeDate(value: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateTime(value: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  const year = parsed.getFullYear()
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  const hour = `${parsed.getHours()}`.padStart(2, '0')
  const minute = `${parsed.getMinutes()}`.padStart(2, '0')
  const second = `${parsed.getSeconds()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

function includesAny(source: string, keywords: string[]) {
  return keywords.some((keyword) => source.includes(keyword))
}

function formatJoinedValues(values: string[], fallback = '') {
  return values.filter((value) => value.trim().length > 0).join('、') || fallback
}

function formatBooleanValue(value: boolean) {
  return value ? '是' : '否'
}

function resolveStatusKey(item: SupplyDemandInfo): Exclude<StatusFilterKey, ''> {
  const raw = [item.satisfactionStatusName, item.dataStatusDescription, item.dataConnectionDescription].join(' ')

  if (includesAny(raw, ['已满足', '已接入', '已提供', '已发放'])) {
    return 'connected'
  }

  if (includesAny(raw, ['部分', '补充', '待完善'])) {
    return 'partial'
  }

  if (includesAny(raw, ['无', '未接入', '待', '缺口'])) {
    return 'pending'
  }

  return 'review'
}

function resolveStatusMeta(item: SupplyDemandInfo) {
  const statusKey = resolveStatusKey(item)

  if (statusKey === 'connected') {
    return {
      key: statusKey,
      label: item.satisfactionStatusName || '已接入',
      tone: 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
    }
  }

  if (statusKey === 'partial') {
    return {
      key: statusKey,
      label: item.satisfactionStatusName || '部分满足',
      tone: 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]',
    }
  }

  if (statusKey === 'pending') {
    return {
      key: statusKey,
      label: item.satisfactionStatusName || '待补充',
      tone: 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]',
    }
  }

  return {
    key: statusKey,
    label: item.satisfactionStatusName || '待研判',
    tone: 'border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]',
  }
}

function isPending(item: SupplyDemandInfo) {
  return resolveStatusKey(item) === 'pending'
}

function getDistributionDate(item: SupplyDemandInfo) {
  return normalizeDate(item.distributionDate) || normalizeDate(item.updatedAt) || normalizeDate(item.createdAt)
}

function getDemandCategoryAncestorIds(
  item: Pick<SupplyDemandInfo, 'domainCategoryId'>,
  categoryLookup: ReturnType<typeof createCategoryLookup>,
) {
  const categoryId = item.domainCategoryId.trim()
  if (!categoryId) return []
  return categoryLookup.byId.get(categoryId)?.ancestorIds ?? [categoryId]
}

function mapCategoryTreeCounts(tree: CatalogCategoryTreeNode[], counts: Map<string, number>): CatalogCategoryTreeNode[] {
  return tree.map((node) => ({
    ...node,
    count: counts.get(node.id) ?? 0,
    children: mapCategoryTreeCounts(node.children, counts),
  }))
}

function matchesDemandTableFilters(
  item: SupplyDemandInfo,
  {
    sceneFilter,
    domainFilterNodeId,
    statusFilter,
    keyword,
    domainCategoryLookup,
    ignoreDomainFilter = false,
  }: {
    sceneFilter: string
    domainFilterNodeId: string
    statusFilter: StatusFilterKey
    keyword: string
    domainCategoryLookup: ReturnType<typeof createCategoryLookup>
    ignoreDomainFilter?: boolean
  },
) {
  if (sceneFilter && item.sceneName !== sceneFilter) return false

  if (!ignoreDomainFilter && domainFilterNodeId) {
    const categoryAncestorIds = getDemandCategoryAncestorIds(item, domainCategoryLookup)
    if (!categoryAncestorIds.includes(domainFilterNodeId)) {
      return false
    }
  }

  if (statusFilter && resolveStatusKey(item) !== statusFilter) return false
  if (!matchesKeyword(item, keyword)) return false
  return true
}

function buildSceneSummaries(items: SupplyDemandInfo[]) {
  const summaryMap = new Map<string, SceneSummary>()

  items.forEach((item) => {
    const current =
      summaryMap.get(item.sceneName) ??
      {
        sceneName: item.sceneName,
        recordCount: 0,
        dominantDomainCategoryId: '',
      }

    current.recordCount += 1

    if (!current.dominantDomainCategoryId && item.domainCategoryId) {
      current.dominantDomainCategoryId = item.domainCategoryId
    }

    summaryMap.set(item.sceneName, current)
  })

  return Array.from(summaryMap.values()).sort((left, right) => {
    if (right.recordCount !== left.recordCount) {
      return right.recordCount - left.recordCount
    }
    return left.sceneName.localeCompare(right.sceneName, 'zh-CN')
  })
}

function resolveDemandViewTab(value: string): DemandViewTabId {
  const normalizedValue = value.trim()
  if (normalizedValue === 'external') {
    return 'external'
  }
  if (normalizedValue === 'application') {
    return 'application'
  }
  return 'demand'
}

function buildDemandKeywordHaystack(item: SupplyDemandInfo) {
  return [
    item.sceneName,
    item.requiredDataResourceName,
    item.mainDataItems,
    item.demandDescription,
    item.domainCategoryName,
    item.dataFrequencyDemandName,
    item.dataSyncFrequencyName,
    item.dataStatusDescription,
    item.dataSourceSystem,
    item.dataSourceUnitName,
    item.dataSupplyMethodName,
    item.dataContactPerson,
    item.dataConnectionDescription,
    item.dataCategoryName,
    item.externalDataCategoryName,
    item.listSourceName,
    formatJoinedValues(item.businessDomainCategoryNames),
    formatJoinedValues(item.linkedResourceNames),
    formatJoinedValues(item.relatedAppNames),
  ].join(' ')
}

function matchesKeyword(item: SupplyDemandInfo, keyword: string) {
  return matchesFullTextSearch(buildDemandKeywordHaystack(item), keyword)
}

function getDemandCategoryDescendantIds(tree: CatalogCategoryTreeNode[], activeNodeId: string) {
  if (!activeNodeId) return []

  let matchedNode: CatalogCategoryTreeNode | null = null

  const locateNode = (nodes: CatalogCategoryTreeNode[]) => {
    for (const node of nodes) {
      if (node.id === activeNodeId) {
        matchedNode = node
        return
      }
      locateNode(node.children)
      if (matchedNode) {
        return
      }
    }
  }

  locateNode(tree)
  if (!matchedNode) return []

  const descendantIds: string[] = []
  const collectIds = (node: CatalogCategoryTreeNode) => {
    descendantIds.push(node.id)
    node.children.forEach((child) => collectIds(child))
  }

  collectIds(matchedNode)
  return descendantIds
}

function buildDemandStatusKeywordFilter(keywords: string[]) {
  return {
    $or: keywords.flatMap((keyword) => [
      { data_status_description: { $includes: keyword } },
      { data_connection_description: { $includes: keyword } },
    ]),
  }
}

function buildDemandReviewFilter() {
  const exclusionKeywords = Array.from(
    new Set(['已满足', '已接入', '已提供', '已发放', '部分', '补充', '待完善', '无', '未接入', '待', '缺口']),
  )

  return {
    $and: exclusionKeywords.flatMap((keyword) => [
      { data_status_description: { $notIncludes: keyword } },
      { data_connection_description: { $notIncludes: keyword } },
    ]),
  }
}

function buildDemandStatusFilter(statusFilter: StatusFilterKey) {
  switch (statusFilter) {
    case 'connected':
      return buildDemandStatusKeywordFilter(['已满足', '已接入', '已提供', '已发放'])
    case 'partial':
      return buildDemandStatusKeywordFilter(['部分', '补充', '待完善'])
    case 'pending':
      return buildDemandStatusKeywordFilter(['无', '未接入', '待', '缺口'])
    case 'review':
      return buildDemandReviewFilter()
    default:
      return null
  }
}

function buildDemandKeywordFilter(keyword: string) {
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) return null

  return {
    $or: [
      { scene_name: { $includes: normalizedKeyword } },
      { required_data_resource_name: { $includes: normalizedKeyword } },
      { main_data_items: { $includes: normalizedKeyword } },
      { demand_description: { $includes: normalizedKeyword } },
      { 'linked_data_resources.resource_name': { $includes: normalizedKeyword } },
    ],
  }
}

function combineDemandFilters(filters: Array<Record<string, unknown> | null>) {
  const activeFilters = filters.filter((filter): filter is Record<string, unknown> => Boolean(filter))

  if (activeFilters.length === 0) {
    return null
  }

  if (activeFilters.length === 1) {
    return activeFilters[0]
  }

  return {
    $and: activeFilters,
  }
}

function buildDemandTableServerFilter({
  sceneFilter,
  domainCategoryIds,
  statusFilter,
  keyword,
}: {
  sceneFilter: string
  domainCategoryIds: string[]
  statusFilter: StatusFilterKey
  keyword: string
}) {
  return combineDemandFilters([
    { scene_name: { $ne: '外部数据' } },
    sceneFilter ? { scene_name: sceneFilter } : null,
    domainCategoryIds.length > 0
      ? {
          domain_category_id: {
            $in: domainCategoryIds.map((id) => Number(id)),
          },
        }
      : null,
    buildDemandStatusFilter(statusFilter),
    buildDemandKeywordFilter(keyword),
  ])
}

function resolveDemandTableSortField(key: DemandTableColumnKey) {
  switch (key) {
    case 'id':
      return 'id'
    case 'createdById':
      return 'createdById'
    case 'updatedById':
      return 'updatedById'
    case 'sceneName':
      return 'scene_name'
    case 'requiredDataResourceName':
      return 'required_data_resource_name'
    case 'mainDataItems':
      return 'main_data_items'
    case 'demandDescription':
      return 'demand_description'
    case 'isRequired':
      return 'is_required'
    case 'dataStatusDescription':
      return 'data_status_description'
    case 'dataSourceSystem':
      return 'data_source_system'
    case 'dataContactPerson':
      return 'data_contact_person'
    case 'dataConnectionDescription':
      return 'data_connection_description'
    case 'dataCategoryId':
    case 'dataCategoryName':
      return 'data_category_id'
    case 'dataSourceUnitId':
    case 'dataSourceUnitName':
      return 'data_source_unit_id'
    case 'dataFrequencyDemandId':
    case 'dataFrequencyDemandName':
      return 'data_frequency_demand_id'
    case 'dataSupplyMethodId':
    case 'dataSupplyMethodName':
      return 'data_supply_method_id'
    case 'dataSyncFrequencyId':
    case 'dataSyncFrequencyName':
      return 'data_sync_frequency_id'
    case 'domainCategoryId':
    case 'domainCategoryName':
      return 'domain_category_id'
    case 'externalDataCategoryId':
    case 'externalDataCategoryName':
      return 'external_data_category_id'
    case 'listSourceId':
    case 'listSourceName':
      return 'list_source_id'
    case 'satisfactionStatusId':
    case 'satisfactionStatusName':
      return 'satisfaction_status_id'
    case 'businessDomainCategoryIds':
    case 'businessDomainCategoryNames':
    case 'linkedResourceIds':
    case 'linkedResourceNames':
      return 'updatedAt'
    case 'status':
      return 'data_status_description'
    case 'distributionDate':
      return 'distribution_date'
    case 'createdAt':
      return 'createdAt'
    case 'updatedAt':
      return 'updatedAt'
    default:
      return 'updatedAt'
  }
}

function buildDemandTableServerSort(sortState: DemandTableSortState) {
  const field = resolveDemandTableSortField(sortState.key)
  return sortState.direction === 'desc' ? `-${field}` : field
}

function flattenCategoryTree(tree: CatalogCategoryTreeNode[]) {
  const rows: Array<{ id: string; name: string; parentId: string | null }> = []

  const visit = (node: CatalogCategoryTreeNode, parentId: string | null) => {
    rows.push({ id: node.id, name: node.label, parentId })
    node.children.forEach((child) => visit(child, node.id))
  }

  tree.forEach((node) => visit(node, null))
  return rows
}

function DomainCategoryTreeSelect({ tree, value, onChange }: DomainCategoryTreeSelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lookup = useMemo(() => createCategoryLookup(flattenCategoryTree(tree)), [tree])
  const [open, setOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<string[]>(() => createInitialExpandedCategoryIds(tree, value))

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [open])

  const selectedLabel = value
    ? lookup.byId.get(value)?.pathLabel ?? lookup.byId.get(value)?.name ?? '未找到对应节点'
    : '全部领域'

  const selectNode = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
  }

  const renderNode = (node: CatalogCategoryTreeNode) => {
    const isExpanded = expandedIds.includes(node.id)
    const isSelected = node.id === value

    return (
      <div key={node.id}>
        <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${node.depth * 14}px` }}>
          {node.children.length > 0 ? (
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[rgba(226,236,245,0.92)]"
              onClick={() => setExpandedIds((current) => toggleExpandedCategoryId(current, node.id))}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="inline-flex h-7 w-7 shrink-0" />
          )}

          <button
            type="button"
            onClick={() => selectNode(node.id)}
            className={cn(
              'flex flex-1 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[0.8125rem] transition',
              isSelected
                ? 'bg-[rgba(var(--theme-soft-rgb),0.16)] font-semibold text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(var(--theme-strong-rgb),0.18)]'
                : 'text-[var(--text-main)] hover:bg-[rgba(244,248,252,0.98)]',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-[var(--primary)]">{getCategoryIcon(node.label)}</span>
              <span className="truncate">{node.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {node.count > 0 ? (
                <span className="rounded-full border border-[rgba(32,113,218,0.16)] bg-[rgba(32,113,218,0.08)] px-2 py-0.5 text-[0.6875rem] text-[var(--primary)]">
                  {node.count}
                </span>
              ) : null}
              {isSelected ? <Check className="h-4 w-4" /> : null}
            </span>
          </button>
        </div>

        {node.children.length > 0 && isExpanded ? <div>{node.children.map(renderNode)}</div> : null}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 text-left text-[0.8125rem] outline-none transition hover:border-[var(--primary)]"
      >
        <span className={cn('truncate', value ? 'text-[var(--text-main)]' : 'text-[var(--text-secondary)]')}>{selectedLabel}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-[var(--primary)] transition', open ? 'rotate-180' : '')} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-full min-w-[360px] overflow-hidden rounded-[22px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[var(--shadow-elevated)] xl:min-w-[720px]">
          <div className="border-b border-[var(--surface-outline)] px-5 py-4">
            <div className="text-[0.9375rem] font-semibold text-[var(--text-main)]">数据资源分类</div>
            <div className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">支持按数据资源分类树节点筛选，选中父节点时自动包含其下级分类。</div>
          </div>

          <div className="max-h-[420px] overflow-y-auto px-3 py-3">
            <button
              type="button"
              onClick={() => selectNode('')}
              className={cn(
                'mb-2 flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-[0.875rem] font-medium transition',
                !value
                  ? 'bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
                  : 'text-[var(--text-main)] hover:bg-[var(--surface-tint)]',
              )}
            >
              <span>全部领域</span>
              {!value ? <Check className="h-4 w-4" /> : null}
            </button>

            {tree.length > 0 ? tree.map(renderNode) : <div className="px-3 py-6 text-center text-[0.75rem] text-[var(--text-muted)]">暂无可选节点</div>}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DemandFormTableRow({
  row,
  rowIndex,
  resourceOptions,
  updateCycleOptions,
  canRemove,
  onChange,
  onRemove,
}: DemandFormTableRowProps) {
  const linkedResourceRef = useRef<HTMLDivElement | null>(null)
  const [isLinkedResourceOpen, setIsLinkedResourceOpen] = useState(false)
  const isBatchClaimCartRow = row.claimCartItemIds.length > 1 || row.linkedResourceNames.length > 1
  const rowTitle = isBatchClaimCartRow ? '本次供需申请' : `第 ${rowIndex + 1} 条需求`
  const rowSubtitle = isBatchClaimCartRow
    ? '统一填写申请场景、频次，并确认本次申请包含的数据资源清单'
    : '统一填写资源、用途、频次与目录关联信息'
  const selectedResource = useMemo(
    () => (isBatchClaimCartRow ? null : resourceOptions.find((item) => item.id === row.linkedResourceId) ?? null),
    [isBatchClaimCartRow, resourceOptions, row.linkedResourceId],
  )

  useEffect(() => {
    if (!isLinkedResourceOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!linkedResourceRef.current?.contains(event.target as Node)) {
        setIsLinkedResourceOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isLinkedResourceOpen])

  const resourceCandidates = useMemo(() => {
    const preferredKeyword = row.linkedResourceKeyword || selectedResource?.name || ''
    const matches = filterResourceOptions(resourceOptions, preferredKeyword, 8)

    if (selectedResource && !matches.some((item) => item.id === selectedResource.id)) {
      return [selectedResource, ...matches]
    }

    return matches
  }, [resourceOptions, row.linkedResourceKeyword, selectedResource])

  const showLinkedResourcePanel = !isBatchClaimCartRow && isLinkedResourceOpen && row.linkedResourceKeyword.trim().length > 0
  const batchClaimCartResourceCount = row.linkedResourceNames.length || row.claimCartItemIds.length

  return (
    <div className={DIALOG_FORM_CARD_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-[var(--status-info-bg)] px-2 text-[0.8125rem] font-semibold text-[var(--status-info-text)]">
            {rowIndex + 1}
          </div>
          <div>
            <div className="text-[0.9375rem] font-semibold text-[var(--text-main)]">{rowTitle}</div>
            <div className="text-[0.75rem] text-[var(--text-muted)]">{rowSubtitle}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRemove(row.id)}
          disabled={!canRemove}
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40',
            canRemove
              ? NAVY_SOFT_BUTTON_CLASS
              : 'border border-[var(--surface-outline)] bg-[var(--surface-muted)] text-[var(--text-muted)]',
          )}
          aria-label={`删除第 ${rowIndex + 1} 行`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.05fr)_minmax(0,0.76fr)_minmax(0,1.26fr)]">
        <label className="block">
          <span className={DIALOG_FORM_LABEL_CLASS}>申请场景</span>
          <input
            value={row.sceneName}
            onChange={(event) => onChange(row.id, { sceneName: event.target.value })}
            className={DIALOG_FORM_INPUT_CLASS}
            placeholder="例如：外部数据共享需求"
          />
        </label>

        {isBatchClaimCartRow ? (
          <div className="block">
            <span className={DIALOG_FORM_LABEL_CLASS}>本次申领资源</span>
            <div className="rounded-[14px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-3 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
              <div>
                本次申请会统一写入 <span className="font-semibold text-[var(--text-main)]">1 条供需申请</span>，并关联
                {' '}
                <span className="font-semibold text-[var(--text-main)]">{batchClaimCartResourceCount}</span>
                {' '}
                个数据资源。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {row.linkedResourceNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex rounded-full border border-[var(--status-info-border)] bg-[var(--surface-raised)] px-3 py-1 text-[0.6875rem] text-[var(--text-main)]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <label className="block">
            <span className={DIALOG_FORM_LABEL_CLASS}>所需数据资源名称</span>
            <input
              value={row.requiredDataResourceName}
              onChange={(event) => onChange(row.id, { requiredDataResourceName: event.target.value })}
              className={DIALOG_FORM_INPUT_CLASS}
              placeholder="例如：生态环境监测结果数据"
            />
          </label>
        )}

        <label className="block">
          <span className={DIALOG_FORM_LABEL_CLASS}>期望频次</span>
          <select
            value={row.dataFrequencyDemandId}
            onChange={(event) => onChange(row.id, { dataFrequencyDemandId: event.target.value })}
            className={DIALOG_FORM_INPUT_CLASS}
          >
            <option value="">请选择频次</option>
            {updateCycleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div ref={linkedResourceRef} className="block">
          <span className={DIALOG_FORM_LABEL_CLASS}>关联目录资源</span>
          {isBatchClaimCartRow ? (
            <div className="rounded-[14px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-3 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
              <div>
                已从数据申领夹带入 <span className="font-semibold text-[var(--text-main)]">{batchClaimCartResourceCount}</span> 个数据资源，将按同一张供需申请统一提交。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {row.linkedResourceNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex rounded-full border border-[var(--status-info-border)] bg-[var(--surface-raised)] px-3 py-1 text-[0.6875rem] text-[var(--text-main)]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <input
                  value={row.linkedResourceKeyword}
                  onFocus={() => setIsLinkedResourceOpen(true)}
                  onChange={(event) =>
                    onChange(row.id, {
                      linkedResourceKeyword: event.target.value,
                      linkedResourceId: '',
                      linkedResourceIds: [],
                      linkedResourceNames: [],
                    })
                  }
                  className={cn(DIALOG_FORM_INPUT_CLASS, 'pr-20')}
                  placeholder="输入名称、编码或部门进行联想搜索"
                />
                {row.linkedResourceKeyword || row.linkedResourceId ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(row.id, {
                        linkedResourceKeyword: '',
                        linkedResourceId: '',
                        linkedResourceIds: [],
                        linkedResourceNames: [],
                      })
                      setIsLinkedResourceOpen(false)
                    }}
                    className="absolute right-10 top-1/2 -translate-y-1/2 text-[0.75rem] font-medium text-[var(--primary)] transition hover:opacity-80"
                  >
                    清空
                  </button>
                ) : null}
                <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                {showLinkedResourcePanel ? (
                  <div className="absolute left-0 top-full z-20 mt-2 w-full overflow-hidden rounded-[16px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] shadow-[0_18px_32px_rgba(7,15,28,0.22)]">
                    <div className="max-h-[260px] overflow-y-auto p-2">
                      {resourceCandidates.length > 0 ? (
                        resourceCandidates.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              onChange(row.id, {
                                linkedResourceId: item.id,
                                linkedResourceIds: [item.id],
                                linkedResourceKeyword: item.name,
                                linkedResourceNames: [item.name],
                              })
                              setIsLinkedResourceOpen(false)
                            }}
                            className="flex w-full items-start justify-between gap-3 rounded-[12px] px-3 py-2 text-left transition hover:bg-[var(--surface-tint)]"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-[0.8125rem] font-semibold text-[var(--text-main)]">{item.name}</div>
                              <div className="mt-1 truncate text-[0.6875rem] text-[var(--text-muted)]">
                                编码 {item.code || '未标注'} · 部门 {item.department || '未标注'}
                              </div>
                            </div>
                            <div className="shrink-0 rounded-full border border-[rgba(32,113,218,0.18)] bg-[rgba(32,113,218,0.08)] px-2 py-0.5 text-[0.625rem] text-[var(--primary)]">
                              {item.category || '目录资源'}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-[0.75rem] leading-6 text-[var(--text-muted)]">
                          未找到匹配资源，可继续填写并提交，后续再补关联。
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              {selectedResource ? (
                <div className="mt-3 rounded-[14px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-3 text-[0.75rem] leading-6 text-[var(--text-secondary)]">
                  <div>
                    已关联：<span className="font-semibold text-[var(--text-main)]">{selectedResource.name}</span>
                  </div>
                  <div className="mt-1 text-[0.6875rem] text-[var(--text-muted)]">
                    编码 {selectedResource.code || '未标注'} · 部门 {selectedResource.department || '未标注'}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-[0.6875rem] leading-5 text-[var(--text-muted)]">
                  输入关键词后会直接列出可选目录资源，点击即可完成关联。
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <label className="block">
          <span className={DIALOG_FORM_LABEL_CLASS}>主要数据项</span>
          <textarea
            value={row.mainDataItems}
            onChange={(event) => onChange(row.id, { mainDataItems: event.target.value })}
            className={DIALOG_FORM_TEXTAREA_CLASS}
            placeholder="填写关键字段、指标、主题项"
          />
        </label>

        <label className="block">
          <span className={DIALOG_FORM_LABEL_CLASS}>需求描述</span>
          <textarea
            value={row.demandDescription}
            onChange={(event) => onChange(row.id, { demandDescription: event.target.value })}
            className={DIALOG_FORM_TEXTAREA_CLASS}
            placeholder="填写业务诉求、问题背景、使用目的"
          />
        </label>
      </div>
    </div>
  )
}

export function DemandPageInternal({ demandOnly = false }: { demandOnly?: boolean } = {}) {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { navigations, demandTabs } = usePortalNavigations(true, ALL_PRODUCT_MODULE_IDS)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const { data: supportData, isLoading: isSupportLoading, error: supportError } = useDemandPageSupportData(
    true,
    isCreateDialogOpen,
  )
  const locationState = (location.state as DemandPageLocationState | null) ?? null
  const prefill = (locationState?.prefill ?? {}) satisfies DemandPagePrefill
  const prefillRows = useMemo(() => locationState?.prefillRows ?? [], [locationState?.prefillRows])
  const shouldOpenCreateDialogFromState = Boolean(locationState?.openCreateDialog)
  const shouldClearClaimCartOnSuccess = Boolean(locationState?.clearClaimCartOnSuccess)
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const hasDemandNavigation = navigations.some((item) => item.target === '/demand')
  const resolvedDemandTabs = demandTabs.length > 0 || hasDemandNavigation ? demandTabs : getDefaultDemandTabs()
  const { resourceOptions, categoryTree: baseCategoryTree, updateCycleOptions } = supportData
  const columnSelectorRef = useRef<HTMLDivElement | null>(null)
  const queryKeyword = (searchParams.get('keyword') ?? '').trim()
  const activeDemandTab = demandOnly ? 'demand' : resolveDemandViewTab(searchParams.get('tab') ?? '')

  const [summaryItems, setSummaryItems] = useState<SupplyDemandInfo[]>([])
  const [pagedResult, setPagedResult] = useState<SupplyDemandPortalPageResult>(EMPTY_SUPPLY_DEMAND_PAGE_RESULT)
  const [isSummaryLoading, setIsSummaryLoading] = useState(true)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formRows, setFormRows] = useState<FormRowState[]>(() => buildCreateDialogPrefillRows(prefillRows, prefill))
  const [sceneFilter, setSceneFilter] = useState(prefill.useCase || prefillRows.find((row) => row.useCase?.trim())?.useCase || '')
  const [domainFilterNodeId, setDomainFilterNodeId] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('')
  const [keyword, setKeyword] = useState(queryKeyword)
  const [tableSort, setTableSort] = useState<DemandTableSortState>(DEMAND_TABLE_DEFAULT_SORT)
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<DemandTableColumnKey[]>(
    () => [...DEMAND_TABLE_DEFAULT_VISIBLE_COLUMN_KEYS],
  )
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageRefreshKey, setPageRefreshKey] = useState(0)
  const needsFullSupplyDemandData = visibleColumnKeys.some((key) => LINKED_RESOURCE_COLUMN_KEYS.includes(key))
  const hasOpenedCreateDialogFromStateRef = useRef(false)

  useEffect(() => {
    if (!isColumnSelectorOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!columnSelectorRef.current?.contains(event.target as Node)) {
        setIsColumnSelectorOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isColumnSelectorOpen])

  useEffect(() => {
    if (!shouldOpenCreateDialogFromState || hasOpenedCreateDialogFromStateRef.current) return

    hasOpenedCreateDialogFromStateRef.current = true
    setFormRows(buildCreateDialogPrefillRows(prefillRows, prefill))
    setSubmitError(null)
    setIsCreateDialogOpen(true)
  }, [prefill, prefillRows, shouldOpenCreateDialogFromState])

  const domainCategoryLookup = useMemo(
    () => createCategoryLookup(flattenCategoryTree(baseCategoryTree)),
    [baseCategoryTree],
  )
  const frequencyLabelById = useMemo(
    () => new Map(updateCycleOptions.map((option) => [String(option.value), option.label])),
    [updateCycleOptions],
  )
  const hasBatchClaimCartPrefill = useMemo(
    () => formRows.some((row) => row.claimCartItemIds.length > 1 || row.linkedResourceNames.length > 1),
    [formRows],
  )
  const batchClaimCartResourceCount = useMemo(
    () =>
      formRows.reduce((total, row) => total + Math.max(
        row.linkedResourceNames.length,
        row.linkedResourceIds.length,
        row.claimCartItemIds.length,
      ), 0),
    [formRows],
  )
  const activeColumns = useMemo(
    () => DEMAND_TABLE_COLUMNS.filter((column) => visibleColumnKeys.includes(column.key)),
    [visibleColumnKeys],
  )
  const activeColumnKeys = useMemo(() => activeColumns.map((column) => column.key), [activeColumns])
  const effectiveTableSort = useMemo<DemandTableSortState>(
    () =>
      activeColumnKeys.includes(tableSort.key)
        ? tableSort
        : {
            key: activeColumnKeys[0] ?? DEMAND_TABLE_DEFAULT_SORT.key,
            direction: tableSort.direction,
          },
    [activeColumnKeys, tableSort],
  )

  const domainFilterNodeIds = useMemo(
    () => getDemandCategoryDescendantIds(baseCategoryTree, domainFilterNodeId),
    [baseCategoryTree, domainFilterNodeId],
  )

  const serverFilter = useMemo(
    () =>
      buildDemandTableServerFilter({
        sceneFilter,
        domainCategoryIds: domainFilterNodeIds,
        statusFilter,
        keyword,
      }),
    [domainFilterNodeIds, keyword, sceneFilter, statusFilter],
  )

  const serverSort = useMemo(
    () => buildDemandTableServerSort(effectiveTableSort),
    [effectiveTableSort],
  )

  useEffect(() => {
    let cancelled = false

    setIsSummaryLoading(true)

    fetchSupplyDemandPortalSummaryData()
      .then((payload) => {
        if (cancelled) return
        setSummaryItems(payload)
        setSummaryError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setSummaryError(error instanceof Error ? error.message : '供需对接信息加载失败')
      })
      .finally(() => {
        if (!cancelled) {
          setIsSummaryLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const requestedPage = currentPage

    setIsPageLoading(true)

    fetchSupplyDemandPortalPage({
      page: requestedPage,
      pageSize: PAGE_SIZE,
      sort: serverSort,
      filter: serverFilter,
      includeLinkedResources: needsFullSupplyDemandData,
    })
      .then((payload) => {
        if (cancelled) return
        setPagedResult(payload)
        setPageError(null)

        if (requestedPage > payload.totalPages && payload.totalCount > 0) {
          setCurrentPage(payload.totalPages)
        }
      })
      .catch((error) => {
        if (cancelled) return
        setPagedResult(EMPTY_SUPPLY_DEMAND_PAGE_RESULT)
        setPageError(error instanceof Error ? error.message : '供需对接信息加载失败')
      })
      .finally(() => {
        if (!cancelled) {
          setIsPageLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentPage, needsFullSupplyDemandData, pageRefreshKey, serverFilter, serverSort])

  const internalSummaryItems = useMemo(
    () => summaryItems.filter((item) => isInternalSupplyDemandItem(item)),
    [summaryItems],
  )
  const externalSummaryItems = useMemo(
    () => summaryItems.filter((item) => isExternalSupplyDemandItem(item)),
    [summaryItems],
  )
  const sceneSummaries = useMemo(() => buildSceneSummaries(internalSummaryItems), [internalSummaryItems])
  const sceneSummaryByName = useMemo(
    () => new Map(sceneSummaries.map((item) => [item.sceneName, item])),
    [sceneSummaries],
  )

  const overallMetrics = useMemo(
    () => ({
      total: internalSummaryItems.length,
      scenes: sceneSummaries.length,
      linked: internalSummaryItems.filter((item) => item.linkedResourceIds.length > 0).length,
      pending: internalSummaryItems.filter((item) => isPending(item)).length,
    }),
    [internalSummaryItems, sceneSummaries],
  )
  const externalDemandMetrics = useMemo(() => {
    const sourceUnits = new Set<string>()
    const domainNames = new Set<string>()
    let interfaceCount = 0

    externalSummaryItems.forEach((item) => {
      if (item.dataSourceUnitName.trim()) {
        sourceUnits.add(item.dataSourceUnitName.trim())
      }
      if (item.domainCategoryName.trim()) {
        domainNames.add(item.domainCategoryName.trim())
      }
      if (item.demandDescription.includes('接口')) {
        interfaceCount += 1
      }
    })

    return {
      total: externalSummaryItems.length,
      sources: sourceUnits.size,
      domains: domainNames.size,
      interfaceCount,
    }
  }, [externalSummaryItems])

  const categoryFacetItems = useMemo(
    () =>
      internalSummaryItems.filter((item) =>
        matchesDemandTableFilters(item, {
          sceneFilter,
          domainFilterNodeId,
          statusFilter,
          keyword,
          domainCategoryLookup,
          ignoreDomainFilter: true,
        }),
      ),
    [domainCategoryLookup, domainFilterNodeId, internalSummaryItems, keyword, sceneFilter, statusFilter],
  )

  const categoryCountsById = useMemo(() => {
    const counts = new Map<string, number>()
    categoryFacetItems.forEach((item) => {
      getDemandCategoryAncestorIds(item, domainCategoryLookup).forEach((id) => {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      })
    })
    return counts
  }, [categoryFacetItems, domainCategoryLookup])

  const categoryTree = useMemo(
    () => pruneEmptyCategoryTreeNodes(
      mapCategoryTreeCounts(baseCategoryTree, categoryCountsById),
      { keepNodeIds: domainFilterNodeId ? [domainFilterNodeId] : [] },
    ),
    [baseCategoryTree, categoryCountsById, domainFilterNodeId],
  )
  const totalPages = pagedResult.totalPages
  const safePage = Math.min(Math.max(currentPage, 1), totalPages)
  const pagedItems = pagedResult.items
  const filteredItemCount = pagedResult.totalCount
  const paginationItems = useMemo(() => buildPaginationItems(safePage, totalPages), [safePage, totalPages])
  const currentSortColumnLabel = activeColumns.find((column) => column.key === effectiveTableSort.key)?.label ?? '未设置'
  const isLoading = isSummaryLoading || isPageLoading

  const setRowPatch = (rowId: string, patch: Partial<FormRowState>) => {
    setFormRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))
  }

  const resolveCreateDialogSceneName = (nextSceneName?: string) =>
    (nextSceneName || sceneFilter || prefill.useCase || sceneSummaries[0]?.sceneName || '').trim()

  const addRow = () => {
    setFormRows((current) => [
      ...current,
      buildEmptyFormRow(undefined, current[current.length - 1]?.sceneName ?? resolveCreateDialogSceneName()),
    ])
  }

  const openCreateDialog = (nextSceneName?: string) => {
    const resolvedSceneName = resolveCreateDialogSceneName(nextSceneName)
    setFormRows([buildEmptyFormRow(prefill, resolvedSceneName)])
    setSubmitError(null)
    setIsCreateDialogOpen(true)
  }

  const closeCreateDialog = () => {
    if (isSubmitting) return
    setIsCreateDialogOpen(false)
    setSubmitError(null)
  }

  const removeRow = (rowId: string) => {
    setFormRows((current) => {
      if (current.length === 1) {
        return [buildEmptyFormRow(undefined, current[0]?.sceneName ?? resolveCreateDialogSceneName())]
      }
      return current.filter((row) => row.id !== rowId)
    })
  }

  const resetFilters = () => {
    setSceneFilter('')
    setDomainFilterNodeId('')
    setStatusFilter('')
    setKeyword('')
    setCurrentPage(1)
  }

  const switchDemandTab = (nextTab: DemandViewTabId) => {
    const next = new URLSearchParams(searchParams)
    if (nextTab === 'demand') {
      next.delete('tab')
    } else {
      next.set('tab', nextTab)
    }
    setSearchParams(next, { replace: true })
    setCurrentPage(1)
  }

  const toggleVisibleColumn = (key: DemandTableColumnKey) => {
    setVisibleColumnKeys((current) => {
      if (current.includes(key)) {
        const next = current.filter((item) => item !== key)
        return next.length > 0 ? next : current
      }

      const nextSet = new Set([...current, key])
      return DEMAND_TABLE_COLUMNS.map((column) => column.key).filter((columnKey) => nextSet.has(columnKey))
    })
  }

  const showAllColumns = () => {
    setVisibleColumnKeys(DEMAND_TABLE_COLUMNS.map((column) => column.key))
  }

  const handleTableSort = (key: DemandTableColumnKey) => {
    setCurrentPage(1)
    setTableSort((current) => {
      if (current.key !== key) {
        return { key, direction: 'desc' }
      }
      return {
        key,
        direction: current.direction === 'desc' ? 'asc' : 'desc',
      }
    })
  }

  const renderDemandTableCell = (item: SupplyDemandInfo, columnKey: DemandTableColumnKey) => {
    const statusMeta = resolveStatusMeta(item)
    const distributionDate = getDistributionDate(item)
    const detailPath = withEmbed(`/demand/${item.id}`)
    const detailState = { returnTo: `${location.pathname}${location.search}` }

    switch (columnKey) {
      case 'id':
        return <span className="text-[0.8125rem] text-[var(--text-secondary)]">{item.id || '未记录'}</span>
      case 'createdById':
        return <span className="text-[0.8125rem] text-[var(--text-secondary)]">{item.createdById || '未记录'}</span>
      case 'updatedById':
        return <span className="text-[0.8125rem] text-[var(--text-secondary)]">{item.updatedById || '未记录'}</span>
      case 'sceneName':
        return (
          <>
            <div className="text-[0.875rem] font-semibold text-[var(--text-main)]">{item.sceneName}</div>
            {item.domainCategoryName && item.domainCategoryName !== '未标注' ? (
              <div className="mt-2">
                <TopicPill className="border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]">
                  {item.domainCategoryName}
                </TopicPill>
              </div>
            ) : null}
          </>
        )
      case 'requiredDataResourceName':
        return (
          <div className="text-[0.875rem] font-semibold text-[var(--text-main)]">
            <Link
              to={detailPath}
              state={detailState}
              className="transition hover:text-[var(--primary)] hover:underline"
            >
              {item.requiredDataResourceName}
            </Link>
          </div>
        )
      case 'mainDataItems':
        return <div className="line-clamp-4">{item.mainDataItems}</div>
      case 'demandDescription':
        return (
          <>
            <div className="line-clamp-4">{item.demandDescription || '暂无需求描述'}</div>
            {item.dataStatusDescription ? (
              <div className="mt-2 line-clamp-2 text-[0.75rem] text-[var(--text-muted)]">
                现状：{item.dataStatusDescription}
              </div>
            ) : null}
          </>
        )
      case 'isRequired':
        return (
          <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[0.75rem] font-medium', item.isRequired ? 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]' : 'bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]')}>
            {formatBooleanValue(item.isRequired)}
          </span>
        )
      case 'dataStatusDescription':
        return <div className="line-clamp-4">{item.dataStatusDescription || '暂无说明'}</div>
      case 'dataSourceSystem':
        return <div className="line-clamp-2">{item.dataSourceSystem || '未填写'}</div>
      case 'dataContactPerson':
        return <div className="line-clamp-2">{item.dataContactPerson || '未填写'}</div>
      case 'dataConnectionDescription':
        return <div className="line-clamp-4">{item.dataConnectionDescription || '未填写'}</div>
      case 'dataCategoryId':
        return item.dataCategoryId || '未记录'
      case 'dataCategoryName':
        return item.dataCategoryName || '未标注'
      case 'dataSourceUnitId':
        return item.dataSourceUnitId || '未记录'
      case 'dataSourceUnitName':
        return item.dataSourceUnitName || '未填写'
      case 'dataFrequencyDemandName':
        return item.dataFrequencyDemandName || '未填写'
      case 'dataFrequencyDemandId':
        return item.dataFrequencyDemandId || '未记录'
      case 'dataSupplyMethodId':
        return item.dataSupplyMethodId || '未记录'
      case 'dataSupplyMethodName':
        return item.dataSupplyMethodName || '未填写'
      case 'dataSyncFrequencyId':
        return item.dataSyncFrequencyId || '未记录'
      case 'dataSyncFrequencyName':
        return item.dataSyncFrequencyName || '未填写'
      case 'domainCategoryId':
        return item.domainCategoryId || '未记录'
      case 'domainCategoryName':
        return item.domainCategoryName || '未标注'
      case 'externalDataCategoryId':
        return item.externalDataCategoryId || '未记录'
      case 'externalDataCategoryName':
        return item.externalDataCategoryName || '未填写'
      case 'listSourceId':
        return item.listSourceId || '未记录'
      case 'listSourceName':
        return item.listSourceName || '未填写'
      case 'satisfactionStatusId':
        return item.satisfactionStatusId || '未记录'
      case 'satisfactionStatusName':
        return item.satisfactionStatusName || '未填写'
      case 'businessDomainCategoryIds':
        return formatJoinedValues(item.businessDomainCategoryIds, '未记录')
      case 'businessDomainCategoryNames':
        return formatJoinedValues(item.businessDomainCategoryNames, '未填写')
      case 'status':
        return (
          <span className={cn('rounded-full border px-2.5 py-1 text-[0.75rem] font-medium', statusMeta.tone)}>
            {statusMeta.label}
          </span>
        )
      case 'linkedResourceNames':
        return <div className="line-clamp-3">{formatJoinedValues(item.linkedResourceNames, '未关联')}</div>
      case 'linkedResourceIds':
        return <div className="line-clamp-3">{formatJoinedValues(item.linkedResourceIds, '未记录')}</div>
      case 'distributionDate':
        return distributionDate || '待更新'
      case 'createdAt':
        return formatDateTime(item.createdAt) || '未记录'
      case 'updatedAt':
        return formatDateTime(item.updatedAt) || '未记录'
      default:
        return null
    }
  }

  const submitRows = async () => {
    const filledRows = formRows.filter((row) =>
      [
        row.sceneName,
        row.requiredDataResourceName,
        row.mainDataItems,
        row.demandDescription,
        row.dataFrequencyDemandId,
        row.linkedResourceKeyword,
      ].some((value) => value.trim().length > 0),
    )

    if (filledRows.length === 0) {
      setSubmitError('请至少填写一行场景需求')
      setSubmitSuccess(null)
      return
    }

    for (const [index, row] of filledRows.entries()) {
      if (!row.sceneName.trim()) {
        setSubmitError(`第 ${index + 1} 行请填写申请场景`)
        setSubmitSuccess(null)
        return
      }
      if (!row.requiredDataResourceName.trim()) {
        setSubmitError(`第 ${index + 1} 行请填写所需数据资源名称`)
        setSubmitSuccess(null)
        return
      }
      if (!row.mainDataItems.trim()) {
        setSubmitError(`第 ${index + 1} 行请填写主要数据项`)
        setSubmitSuccess(null)
        return
      }
      if (!row.demandDescription.trim()) {
        setSubmitError(`第 ${index + 1} 行请填写需求描述`)
        setSubmitSuccess(null)
        return
      }
      if (!row.dataFrequencyDemandId) {
        setSubmitError(`第 ${index + 1} 行请选择期望频次`)
        setSubmitSuccess(null)
        return
      }
    }

    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    try {
      const groupedRows = new Map<string, FormRowState[]>()
      filledRows.forEach((row) => {
        const normalizedRowSceneName = row.sceneName.trim()
        const sceneRows = groupedRows.get(normalizedRowSceneName) ?? []
        sceneRows.push(row)
        groupedRows.set(normalizedRowSceneName, sceneRows)
      })

      let totalCreatedCount = 0
      let totalAssociationWarningCount = 0
      const totalRequestedResourceCount = filledRows.length
      const submittedClaimCartItemIds = Array.from(new Set(
        filledRows.flatMap((row) => {
          const ids = row.claimCartItemIds.length > 0 ? row.claimCartItemIds : [row.claimCartItemId]
          return ids.map((item) => item.trim()).filter(Boolean)
        }),
      ))

      for (const [normalizedSceneName, sceneRows] of groupedRows) {
        const matchedSceneSummary = sceneSummaryByName.get(normalizedSceneName)
        const result = await createSupplyDemandInfoBatch({
          sceneName: normalizedSceneName,
          domainCategoryId: matchedSceneSummary?.dominantDomainCategoryId,
          entries: sceneRows.map((row) => ({
            requiredDataResourceName: row.requiredDataResourceName.trim(),
            mainDataItems: row.mainDataItems.trim(),
            demandDescription: row.demandDescription.trim(),
            dataFrequencyDemandId: row.dataFrequencyDemandId,
            dataFrequencyDemandName: frequencyLabelById.get(row.dataFrequencyDemandId) ?? '',
            linkedResourceIds: row.linkedResourceIds.length > 0 ? row.linkedResourceIds : (row.linkedResourceId ? [row.linkedResourceId] : []),
          })),
        })

        totalCreatedCount += result.createdCount
        totalAssociationWarningCount += result.associationWarningCount
      }

      setIsSummaryLoading(true)
      try {
        const refreshedSummary = await fetchSupplyDemandPortalSummaryData()
        setSummaryItems(refreshedSummary)
        setSummaryError(null)
      } catch (refreshError) {
        setSummaryError(refreshError instanceof Error ? refreshError.message : '供需对接信息加载失败')
      } finally {
        setIsSummaryLoading(false)
      }

      const submittedSceneNames = [...groupedRows.keys()]
      if (shouldClearClaimCartOnSuccess && submittedClaimCartItemIds.length > 0) {
        removeCatalogClaimCartItems(submittedClaimCartItemIds)
      }
      setSceneFilter(submittedSceneNames.length === 1 ? submittedSceneNames[0] : '')
      setFormRows([buildEmptyFormRow(undefined, submittedSceneNames[0] ?? '')])
      setIsCreateDialogOpen(false)
      setCurrentPage(1)
      setPageRefreshKey((current) => current + 1)
      setSubmitSuccess(
        totalAssociationWarningCount > 0
          ? `已登记 ${totalCreatedCount} 条供需申请，涉及 ${submittedSceneNames.length} 个场景，包含 ${totalRequestedResourceCount} 个数据资源，关联目录资源有 ${totalAssociationWarningCount} 条未自动写入，请在后台复核。`
          : `已登记 ${totalCreatedCount} 条供需申请，涉及 ${submittedSceneNames.length} 个场景，包含 ${totalRequestedResourceCount} 个数据资源，列表已刷新。`,
      )
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '场景需求登记失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[24px] border border-[var(--surface-outline-strong)] bg-[linear-gradient(135deg,var(--surface-hero-start),var(--surface-hero-end))] px-6 py-6 shadow-[var(--shadow-elevated)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="inline-flex flex-wrap gap-2 rounded-[18px] border border-[rgba(var(--theme-soft-rgb),0.18)] bg-[color-mix(in_srgb,var(--surface-glass)_92%,transparent)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
                {resolvedDemandTabs.map((tab) => {
                  const isActive = tab.id === activeDemandTab
                  const Icon = tab.icon

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => switchDemandTab(tab.id)}
                      className={`inline-flex min-w-[9rem] items-center gap-2 rounded-[14px] px-4 py-3 text-[0.875rem] font-medium transition ${
                        isActive
                          ? 'bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] !text-white shadow-[0_14px_24px_rgba(var(--theme-strong-rgb),0.20)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--primary)]'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? '!text-white' : ''}`} />
                      <span className={isActive ? '!text-white' : ''}>{tab.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center">
              {activeDemandTab === 'demand' ? (
                <Button className={cn('rounded-full', NAVY_BUTTON_CLASS)} onClick={() => openCreateDialog(sceneFilter)}>
                  <CirclePlus className="mr-1 h-4 w-4" />
                  新增场景需求
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {activeDemandTab !== 'application' ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {activeDemandTab === 'demand' ? (
              <>
                <StatCard title="供需记录总数" value={`${overallMetrics.total}`} icon={<Database className="h-5 w-5" />} />
                <StatCard title="覆盖场景数量" value={`${overallMetrics.scenes}`} icon={<Sparkles className="h-5 w-5" />} />
                <StatCard title="已关联资源记录" value={`${overallMetrics.linked}`} icon={<Link2 className="h-5 w-5" />} />
                <StatCard title="待补充事项" value={`${overallMetrics.pending}`} tone="green" icon={<CalendarClock className="h-5 w-5" />} />
              </>
            ) : (
              <>
                <StatCard title="外部需求总数" value={`${externalDemandMetrics.total}`} icon={<Database className="h-5 w-5" />} />
                <StatCard title="对接单位数量" value={`${externalDemandMetrics.sources}`} icon={<Sparkles className="h-5 w-5" />} />
                <StatCard title="领域覆盖数量" value={`${externalDemandMetrics.domains}`} icon={<Link2 className="h-5 w-5" />} />
                <StatCard title="接口共享需求" value={`${externalDemandMetrics.interfaceCount}`} tone="green" icon={<CalendarClock className="h-5 w-5" />} />
              </>
            )}
          </div>
        ) : null}
      </section>

      {activeDemandTab === 'demand' && (pageError || summaryError || supportError) ? (
        <div className="rounded-[16px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-4 text-[0.8125rem] leading-6 text-[var(--status-danger-text)]">
          {pageError ?? summaryError ?? supportError}
        </div>
      ) : null}

      {activeDemandTab === 'external' && summaryError ? (
        <div className="rounded-[16px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-5 py-4 text-[0.8125rem] leading-6 text-[var(--status-danger-text)]">
          {summaryError}
        </div>
      ) : null}

      {activeDemandTab === 'demand' && submitSuccess ? (
        <div className="rounded-[16px] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-5 py-4 text-[0.8125rem] leading-6 text-[var(--status-success-text)]">
          {submitSuccess}
        </div>
      ) : null}

      <section
        className={cn(
          'rounded-[20px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] p-5 shadow-[var(--shadow-medium)]',
          activeDemandTab !== 'demand' ? 'hidden' : '',
        )}
      >
        <div className="border-b border-[var(--surface-outline)] pb-5">
          <div className="text-[1.5rem] font-semibold text-[var(--text-main)]">筛选条件</div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr_0.92fr_1.28fr]">
          <label className="block">
            <span className="mb-2 block text-[0.8125rem] text-[var(--text-main)]">场景名称</span>
            <select
              value={sceneFilter}
              onChange={(event) => {
                setSceneFilter(event.target.value)
                setCurrentPage(1)
              }}
              className="h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 text-[0.8125rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
            >
              <option value="">全部场景</option>
              {sceneSummaries.map((scene) => (
                <option key={scene.sceneName} value={scene.sceneName}>
                  {scene.sceneName}（{scene.recordCount}）
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[0.8125rem] text-[var(--text-main)]">数据资源分类</span>
            <DomainCategoryTreeSelect
              key={`domain-tree-${domainFilterNodeId || 'all'}-${categoryTree.length}`}
              tree={categoryTree}
              value={domainFilterNodeId}
              onChange={(nextValue) => {
                setDomainFilterNodeId(nextValue)
                setCurrentPage(1)
              }}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[0.8125rem] text-[var(--text-main)]">满足情况</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilterKey)
                setCurrentPage(1)
              }}
              className="h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 text-[0.8125rem] text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[0.8125rem] text-[var(--text-main)]">关键词</span>
            <div className="relative">
              <input
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value)
                  setCurrentPage(1)
                }}
                className="h-11 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field-bg)] px-4 pr-10 text-[0.8125rem] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--field-bg-strong)]"
                placeholder="搜索场景、资源、需求描述、关联资源"
              />
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            </div>
          </label>
        </div>

        {filteredItemCount > 0 ? (
          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-[0.75rem] text-[var(--text-muted)]">
              <span>筛选后共 {filteredItemCount} 条</span>
              <span>当前显示列 {activeColumns.length} / {DEMAND_TABLE_COLUMNS.length}</span>
              <span>当前排序：{currentSortColumnLabel}{effectiveTableSort.direction === 'desc' ? ' 降序' : ' 升序'}</span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button className={cn('rounded-full', NAVY_SOFT_BUTTON_CLASS)} onClick={resetFilters}>
                重置筛选
              </Button>

              <div
                ref={columnSelectorRef}
                className={cn('relative', isColumnSelectorOpen ? 'z-20' : '')}
              >
                <button
                  type="button"
                  onClick={() => setIsColumnSelectorOpen((current) => !current)}
                  className={cn('inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full px-4 text-[0.8125rem] font-medium', NAVY_SOFT_BUTTON_CLASS)}
                >
                  <Columns3 className="h-4 w-4" />
                  <span>选择显示列</span>
                </button>

                {isColumnSelectorOpen ? (
                  <div className="absolute right-0 top-full mt-2 w-[420px] max-w-[calc(100vw-2rem)] rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] p-4 shadow-[var(--shadow-medium)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[0.8125rem] font-semibold text-[var(--text-main)]">选择要显示的列</div>
                      <button
                        type="button"
                        onClick={showAllColumns}
                        className="text-[0.75rem] font-medium text-[var(--primary)] transition hover:opacity-80"
                      >
                        全部显示
                      </button>
                    </div>
                    <div className="mt-2 text-[0.75rem] leading-5 text-[var(--text-muted)]">
                      至少保留 1 列；如果隐藏当前排序列，系统会自动切换到首个可见列。
                    </div>
                    <div className="mt-3 grid max-h-[320px] gap-2 overflow-auto pr-1 sm:grid-cols-2">
                      {DEMAND_TABLE_COLUMNS.map((column) => {
                        const checked = activeColumnKeys.includes(column.key)
                        return (
                          <label
                            key={column.key}
                            className="flex items-start gap-3 rounded-[12px] border border-[var(--surface-outline)] bg-[var(--surface-muted)] px-3 py-2 text-[0.75rem] text-[var(--text-main)]"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleVisibleColumn(column.key)}
                              className="mt-0.5 h-4 w-4 rounded border-[var(--surface-outline)] text-[var(--primary)] focus:ring-[var(--primary)]"
                            />
                            <span className="block font-medium">{column.label}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <Button className={cn('rounded-full', NAVY_SOFT_BUTTON_CLASS)} onClick={resetFilters}>
              重置筛选
            </Button>
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-[18px] border border-[var(--surface-outline)] bg-[var(--surface-raised-strong)] shadow-[var(--shadow-soft)]">
          {isLoading || isSupportLoading ? (
            <div className="px-5 py-6 text-[0.8125rem] text-[var(--text-secondary)]">
              正在加载供需对接信息...
            </div>
          ) : filteredItemCount > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-full table-auto border-separate border-spacing-0 text-left">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    {activeColumns.map((column) => {
                      const isActive = effectiveTableSort.key === column.key

                      return (
                        <th key={column.key} className={cn(TABLE_HEAD_CELL_CLASS, column.headClassName)}>
                          <button
                            type="button"
                            onClick={() => handleTableSort(column.key)}
                            className="flex w-full items-center justify-between gap-2 text-left text-white transition hover:text-white/90"
                          >
                            <span>{column.label}</span>
                            {isActive ? (
                              effectiveTableSort.direction === 'desc' ? (
                                <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-white/70" />
                            )}
                          </button>
                        </th>
                      )
                    })}
                    <th className={TABLE_HEAD_CELL_CLASS}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((item, index) => {
                    return (
                      <tr
                        key={item.id}
                        className={cn(TABLE_ROW_CLASS, index % 2 === 0 ? TABLE_EVEN_ROW_CLASS : TABLE_ODD_ROW_CLASS)}
                      >
                        {activeColumns.map((column) => (
                          <td key={`${item.id}-${column.key}`} className={cn(TABLE_CELL_CLASS, column.cellClassName)}>
                            {renderDemandTableCell(item, column.key)}
                          </td>
                        ))}
                        <td className={cn(TABLE_CELL_CLASS, 'px-4 py-4 align-top')}>
                          <Link
                            to={withEmbed(`/demand/${item.id}`)}
                            state={{ returnTo: `${location.pathname}${location.search}` }}
                            className="inline-flex items-center gap-1 rounded-full border border-[rgba(32,113,218,0.18)] bg-[linear-gradient(180deg,rgba(66,148,245,0.14),rgba(18,97,204,0.22))] px-3 py-1.5 text-[0.75rem] font-semibold text-[var(--primary)] transition hover:bg-[linear-gradient(180deg,var(--theme-nav-start),var(--theme-nav-end))] hover:text-white"
                          >
                            查看详情
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-8 text-[0.8125rem] leading-6 text-[var(--text-secondary)]">
              {pageError ? pageError : '当前筛选条件下暂无供需对接记录，可直接点击“新增场景需求”补录。'}
            </div>
          )}
        </div>

        {activeDemandTab === 'demand' && filteredItemCount > 0 ? (
          <div className="mt-5 flex flex-col gap-3 border-t border-[var(--line-soft)] pt-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-[0.75rem] text-[var(--text-muted)]">
              当前第 <span className="font-semibold text-[var(--primary)]">{safePage}</span> / {totalPages} 页，每页 {PAGE_SIZE} 条，共 {filteredItemCount} 条
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                className={cn(
                  'inline-flex h-9 items-center rounded-[10px] px-4 text-[0.8125rem] disabled:cursor-not-allowed disabled:opacity-40',
                  NAVY_SOFT_BUTTON_CLASS,
                )}
              >
                上一页
              </button>
              <div className="flex items-center overflow-hidden rounded-[10px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[0_8px_20px_rgba(39,80,120,0.05)]">
                {paginationItems.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="inline-flex h-9 min-w-10 items-center justify-center px-3 text-[0.8125rem] text-[var(--text-muted)]"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCurrentPage(item)}
                      className={cn(
                        'relative inline-flex h-9 min-w-10 items-center justify-center px-3 text-[0.8125rem] font-semibold',
                        item === safePage ? NAVY_BUTTON_CLASS : NAVY_SOFT_BUTTON_CLASS,
                      )}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                className={cn(
                  'inline-flex h-9 items-center rounded-[10px] px-4 text-[0.8125rem] disabled:cursor-not-allowed disabled:opacity-40',
                  NAVY_SOFT_BUTTON_CLASS,
                )}
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {activeDemandTab === 'external' ? (
        <DemandExternalTabView
          items={externalSummaryItems}
          isLoading={isSummaryLoading}
          buildDetailPath={(id) => withEmbed(`/demand/${id}`)}
          returnTo={`${location.pathname}${location.search}`}
        />
      ) : null}

      {activeDemandTab === 'application' ? <PortalApplicationCatalogSection /> : null}

      {isCreateDialogOpen
        ? typeof document !== 'undefined'
          ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,30,43,0.42)] px-4 py-4 backdrop-blur-[3px]">
              <div className="relative flex max-h-[96vh] w-full max-w-[1580px] flex-col overflow-hidden rounded-[24px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))] shadow-[0_32px_72px_rgba(0,0,0,0.34)]">
                <div className="flex items-start justify-between gap-4 border-b border-[var(--surface-outline)] px-6 py-5">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-1 text-[0.75rem] text-[var(--status-info-text)]">
                      <Sparkles className="h-3.5 w-3.5" />
                      新增场景需求
                    </div>
                    <div className="mt-3 text-[1.75rem] font-semibold text-[var(--text-main)]">供需对接申请表</div>
                  </div>
                  <button
                    type="button"
                    onClick={closeCreateDialog}
                    className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full', NAVY_ICON_BUTTON_CLASS)}
                    aria-label="关闭新增场景需求对话框"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                  <div className="space-y-5">
                    <div className="rounded-[18px] border border-[var(--surface-outline)] bg-[linear-gradient(180deg,var(--surface-raised-strong),var(--surface-muted))]">
                      <div className="flex flex-col gap-3 border-b border-[var(--surface-outline)] px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="text-[1rem] font-semibold text-[var(--text-main)]">需求明细</div>
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="text-[0.75rem] text-[var(--text-muted)]">
                                {hasBatchClaimCartPrefill
                                  ? `当前已编辑 ${formRows.length} 条申请，已带入 ${batchClaimCartResourceCount} 个数据资源`
                                  : `当前已编辑 ${formRows.length} 行`}
                              </div>
                              <Button className={cn('rounded-full', NAVY_SOFT_BUTTON_CLASS)} onClick={addRow}>
                                <Plus className="mr-1 h-4 w-4" />
                                新增一行
                          </Button>
                        </div>
                      </div>

                      {submitError ? (
                        <div className="border-b border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-[0.75rem] leading-6 text-[var(--status-danger-text)]">
                          {submitError}
                        </div>
                      ) : null}

                      <div className="space-y-4 px-4 py-4">
                        {formRows.map((row, index) => (
                          <DemandFormTableRow
                            key={row.id}
                            row={row}
                            rowIndex={index}
                            resourceOptions={resourceOptions}
                            updateCycleOptions={updateCycleOptions}
                            canRemove={formRows.length > 1}
                            onChange={setRowPatch}
                            onRemove={removeRow}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[var(--surface-outline)] bg-[var(--surface-raised)] px-6 py-4">
                  <div className="text-[0.75rem] text-[var(--text-muted)]">
                    提交后将直接写入供需对接信息，并返回主页面表格按当前筛选结果刷新。
                  </div>
                  <div className="flex items-center gap-3">
                    <Button className={cn('rounded-full', NAVY_SOFT_BUTTON_CLASS)} onClick={closeCreateDialog}>
                      取消
                    </Button>
                    <Button
                      className={cn('rounded-full', NAVY_BUTTON_CLASS)}
                      disabled={isSubmitting || isLoading || isSupportLoading}
                      onClick={() => {
                        void submitRows()
                      }}
                    >
                      {isSubmitting ? (
                        <>
                          <CirclePlus className="mr-2 h-4 w-4 animate-spin" />
                          提交中...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          提交供需对接申请
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
