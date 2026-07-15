import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Braces,
  Building2,
  ClipboardList,
  Database,
  DatabaseZap,
  FolderOpen,
  Home,
  Link2,
  LockKeyhole,
  MapPinned,
  ScrollText,
  Search,
  Shield,
  Tags,
  UserRound,
  Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { nocobaseBrowserAuthClient } from './nocobase-client'
import { isProductNavTargetEnabled } from './product-modules'
import type { ProductModuleId } from './product-modules'

export type PortalNavigationNode = {
  key: string
  title: string
  icon: string
  target: string
  visible: boolean
  sort: number
  level: number
  sourceType: string
  children: PortalNavigationNode[]
}

export type PortalPrimaryNavigationItem = {
  key: string
  title: string
  target: string
  icon: LucideIcon
}

export type PortalCatalogTabId = 'data-resource' | 'data-product' | 'document' | 'spatial-resource' | 'data-source' | 'service'

export type PortalCatalogTabMeta = {
  id: PortalCatalogTabId
  label: string
  title: string
  categoryTitle: string
  searchPlaceholder: string
  resultLabel: string
  emptyStateLabel: string
  href: string
  icon: LucideIcon
  visibleInTabs: boolean
}

export type PortalDemandTabId = 'demand' | 'external' | 'application'

export type PortalDemandTabMeta = {
  id: PortalDemandTabId
  label: string
  icon: LucideIcon
  target: string
}

type PublicNavigationsResponse = {
  data?: {
    items?: PortalNavigationNode[]
  }
}

const NAVIGATION_STORAGE_KEY = 'JL_ECO_SERVICE_NAVIGATIONS'

const iconMap: Record<string, LucideIcon> = {
  Activity,
  AlertTriangle,
  Braces,
  Building2,
  ClipboardList,
  Database,
  DatabaseZap,
  FolderOpen,
  Home,
  Link2,
  LockKeyhole,
  MapPinned,
  ScrollText,
  Search,
  Shield,
  Tags,
  UserRound,
  Workflow,
}

const DEFAULT_PRIMARY_NAVIGATIONS: PortalPrimaryNavigationItem[] = [
  { key: 'nav_security_dashboard', title: '安全态势', target: '/security-governance/dashboard', icon: Activity },
  { key: 'nav_security_ingest', title: '接入校验', target: '/security-governance/ingest/sources', icon: DatabaseZap },
  { key: 'nav_security_resources', title: '数据资源', target: '/security-governance/resources/catalog', icon: Database },
  { key: 'nav_security_tags', title: '标签管理', target: '/security-governance/tags/catalog', icon: Tags },
  { key: 'nav_security_access', title: '访问策略', target: '/security-governance/access/publish', icon: Shield },
  { key: 'nav_security_risks', title: '风险事件', target: '/security-governance/risks/events', icon: AlertTriangle },
  { key: 'nav_security_homomorphic', title: '同态加密', target: '/security-governance/homomorphic/tasks', icon: LockKeyhole },
]

const EXCLUDED_PRIMARY_NAV_TARGETS = new Set([
  '/security-governance/resources/apis',
  '/security-governance/audit',
  '/security-governance/audit/log-query',
  '/security-governance/log-query',
  '/security-governance/trace',
])

const DEFAULT_CATALOG_TABS: PortalCatalogTabMeta[] = [
  {
    id: 'data-resource',
    label: '数据资源',
    title: '数据资源目录',
    categoryTitle: '数据资源分类',
    searchPlaceholder: '请输入数据名称/名称简拼/数据项搜索',
    resultLabel: '条目录资源',
    emptyStateLabel: '未检索到符合条件的目录资源',
    href: '/catalog',
    icon: Database,
    visibleInTabs: true,
  },
  {
    id: 'data-product',
    label: '数据产品',
    title: '数据产品',
    categoryTitle: '产品分类',
    searchPlaceholder: '请输入数据产品名称、领域、接口地址或责任单位检索',
    resultLabel: '个数据产品',
    emptyStateLabel: '当前筛选下暂无数据产品',
    href: '/data-products',
    icon: Database,
    visibleInTabs: true,
  },
  {
    id: 'document',
    label: '文档资源',
    title: '文档资源',
    categoryTitle: '文档分类',
    searchPlaceholder: '全文检索知识文档标题、标准编号、正文内容',
    resultLabel: '份知识文档',
    emptyStateLabel: '当前筛选下暂无知识文档',
    href: '/documents',
    icon: FolderOpen,
    visibleInTabs: true,
  },
  {
    id: 'spatial-resource',
    label: '空间资源',
    title: '空间资源',
    categoryTitle: '空间资源分类',
    searchPlaceholder: '请输入空间资源名称、服务地址、坐标系或图层类型检索',
    resultLabel: '条空间资源',
    emptyStateLabel: '当前筛选下暂无空间资源',
    href: '/catalog?view=spatial-resource',
    icon: MapPinned,
    visibleInTabs: true,
  },
  {
    id: 'data-source',
    label: '数据源',
    title: '数据源',
    categoryTitle: '数据源分类',
    searchPlaceholder: '请输入数据源名称/名称简拼/数据项搜索',
    resultLabel: '条数据源',
    emptyStateLabel: '未检索到符合条件的数据源',
    href: '/data-source-catalog',
    icon: Building2,
    visibleInTabs: true,
  },
  {
    id: 'service',
    label: '数据API服务',
    title: '数据API服务',
    categoryTitle: '数据API服务分类',
    searchPlaceholder: '请输入API服务名称/名称简拼/服务项搜索',
    resultLabel: '条数据API服务',
    emptyStateLabel: '未检索到符合条件的数据API服务',
    href: '/service-catalog',
    icon: Search,
    visibleInTabs: false,
  },
]

const DEFAULT_DEMAND_TABS: PortalDemandTabMeta[] = [
  { id: 'demand', label: '场景需求', icon: Database, target: '/demand' },
  { id: 'external', label: '外部需求', icon: Link2, target: '/demand?tab=external' },
  { id: 'application', label: '场景应用', icon: Link2, target: '/demand?tab=application' },
]

let cachedNavigations: PortalNavigationNode[] | null | undefined
let navigationPromise: Promise<PortalNavigationNode[]> | null = null

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTarget(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (/^https?:\/\//i.test(normalized)) return normalized
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function normalizeNumber(value: unknown, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function normalizeBoolean(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function resolveIcon(name: string, fallback: LucideIcon) {
  return iconMap[normalizeText(name)] || fallback
}

function sortNodes<T extends { sort?: number }>(items: T[]): T[] {
  return items.slice().sort((left, right) => normalizeNumber(left.sort) - normalizeNumber(right.sort))
}

function ensureDefaultPrimaryNavigations(items: PortalPrimaryNavigationItem[]): PortalPrimaryNavigationItem[] {
  const itemByTarget = new Map(items.map((item) => [item.target, item]))
  const defaultItems = DEFAULT_PRIMARY_NAVIGATIONS.map((item) => {
    const configuredItem = itemByTarget.get(item.target)
    return configuredItem ? { ...configuredItem, key: item.key, title: item.title, icon: item.icon } : item
  })
  const extraItems = items.filter((item) => !item.target.startsWith('/security-governance') && !EXCLUDED_PRIMARY_NAV_TARGETS.has(item.target) && !DEFAULT_PRIMARY_NAVIGATIONS.some((defaultItem) => defaultItem.target === item.target))
  return [...defaultItems, ...extraItems]
}

function readStoredNavigations(): PortalNavigationNode[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(NAVIGATION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PortalNavigationNode[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function persistNavigations(items: PortalNavigationNode[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore storage failures
  }
}

function normalizeNavigationNode(node: unknown): PortalNavigationNode | null {
  if (!node || typeof node !== 'object') return null
  const record = node as Record<string, unknown>
  const key = normalizeText(record.key)
  const title = normalizeText(record.title)
  const target = normalizeTarget(record.target)

  if (!key || !title) {
    return null
  }

  return {
    key,
    title,
    icon: normalizeText(record.icon),
    target,
    visible: normalizeBoolean(record.visible, true),
    sort: normalizeNumber(record.sort),
    level: normalizeNumber(record.level, 1),
    sourceType: normalizeText(record.sourceType),
    children: Array.isArray(record.children)
      ? record.children.map((child) => normalizeNavigationNode(child)).filter(Boolean) as PortalNavigationNode[]
      : [],
  }
}

function filterVisibleNavigationTree(nodes: PortalNavigationNode[]): PortalNavigationNode[] {
  return (nodes || [])
    .filter((node) => node.visible !== false)
    .map((node): PortalNavigationNode => ({
      ...node,
      children: filterVisibleNavigationTree(node.children || []),
    }))
}

function buildCatalogTabMetaFromNavigation(target: string, title: string, iconName: string): PortalCatalogTabMeta | null {
  const normalizedTarget = normalizeTarget(target)

  switch (normalizedTarget) {
    case '/catalog':
      return {
        id: 'data-resource',
        label: title,
        title: '数据资源目录',
        categoryTitle: '数据资源分类',
        searchPlaceholder: '请输入数据名称/名称简拼/数据项搜索',
        resultLabel: '条目录资源',
        emptyStateLabel: '未检索到符合条件的目录资源',
        href: '/catalog',
        icon: resolveIcon(iconName, Database),
        visibleInTabs: true,
      }
    case '/data-products':
      return {
        id: 'data-product',
        label: title,
        title: '数据产品',
        categoryTitle: '产品分类',
        searchPlaceholder: '请输入数据产品名称、领域、接口地址或责任单位检索',
        resultLabel: '个数据产品',
        emptyStateLabel: '当前筛选下暂无数据产品',
        href: '/data-products',
        icon: resolveIcon(iconName, Database),
        visibleInTabs: true,
      }
    case '/documents':
      return {
        id: 'document',
        label: title,
        title: '文档资源',
        categoryTitle: '文档分类',
        searchPlaceholder: '全文检索知识文档标题、标准编号、正文内容',
        resultLabel: '份知识文档',
        emptyStateLabel: '当前筛选下暂无知识文档',
        href: '/documents',
        icon: resolveIcon(iconName, FolderOpen),
        visibleInTabs: true,
      }
    case '/catalog?view=spatial-resource':
      return {
        id: 'spatial-resource',
        label: title,
        title: '空间资源',
        categoryTitle: '空间资源分类',
        searchPlaceholder: '请输入空间资源名称、服务地址、坐标系或图层类型检索',
        resultLabel: '条空间资源',
        emptyStateLabel: '当前筛选下暂无空间资源',
        href: '/catalog?view=spatial-resource',
        icon: resolveIcon(iconName, MapPinned),
        visibleInTabs: true,
      }
    case '/data-source-catalog':
      return {
        id: 'data-source',
        label: title,
        title: '数据源',
        categoryTitle: '数据源分类',
        searchPlaceholder: '请输入数据源名称/名称简拼/数据项搜索',
        resultLabel: '条数据源',
        emptyStateLabel: '未检索到符合条件的数据源',
        href: '/data-source-catalog',
        icon: resolveIcon(iconName, Building2),
        visibleInTabs: true,
      }
    case '/service-catalog':
      return {
        id: 'service',
        label: title,
        title: '数据API服务',
        categoryTitle: '数据API服务分类',
        searchPlaceholder: '请输入API服务名称/名称简拼/服务项搜索',
        resultLabel: '条数据API服务',
        emptyStateLabel: '未检索到符合条件的数据API服务',
        href: '/service-catalog',
        icon: resolveIcon(iconName, Search),
        visibleInTabs: false,
      }
    default:
      return null
  }
}

function buildDemandTabMetaFromNavigation(target: string, title: string, iconName: string): PortalDemandTabMeta | null {
  const normalizedTarget = normalizeTarget(target)

  if (normalizedTarget === '/demand') {
    return { id: 'demand', label: title, icon: resolveIcon(iconName, Database), target: normalizedTarget }
  }

  if (normalizedTarget === '/demand?tab=external') {
    return { id: 'external', label: title, icon: resolveIcon(iconName, Link2), target: normalizedTarget }
  }

  if (normalizedTarget === '/demand?tab=application') {
    return { id: 'application', label: title, icon: resolveIcon(iconName, Link2), target: normalizedTarget }
  }

  return null
}

function buildPrimaryNavigations(navigations: PortalNavigationNode[], enabledModuleIds: readonly ProductModuleId[]): PortalPrimaryNavigationItem[] {
  if (!navigations.length) {
    return DEFAULT_PRIMARY_NAVIGATIONS.filter((item) => isProductNavTargetEnabled(item.target, enabledModuleIds))
  }

  const mapped = sortNodes(filterVisibleNavigationTree(navigations))
    .filter((item) => {
      const target = normalizeTarget(item.target)
      return isProductNavTargetEnabled(target, enabledModuleIds)
    })
    .map((item) => ({
      key: item.key,
      title: item.title,
      target: normalizeTarget(item.target),
      icon: resolveIcon(item.icon, DEFAULT_PRIMARY_NAVIGATIONS.find((defaultItem) => defaultItem.target === normalizeTarget(item.target))?.icon || Database),
    }))

  return ensureDefaultPrimaryNavigations(mapped).filter((item) => isProductNavTargetEnabled(item.target, enabledModuleIds))
}

function buildCatalogTabs(navigations: PortalNavigationNode[]): PortalCatalogTabMeta[] {
  const visibleNavigations = filterVisibleNavigationTree(navigations)
  const catalogNode = visibleNavigations.find((item) => normalizeTarget(item.target) === '/catalog')
  if (!catalogNode?.children?.length) {
    return visibleNavigations.some((item) => normalizeTarget(item.target) === '/catalog') ? [] : DEFAULT_CATALOG_TABS
  }

  const mapped = sortNodes(catalogNode.children)
    .map((child) => buildCatalogTabMetaFromNavigation(child.target, child.title, child.icon || ''))
    .filter(Boolean) as PortalCatalogTabMeta[]

  return mapped.length > 0 ? ensureDataProductCatalogTab(mapped) : DEFAULT_CATALOG_TABS
}

function ensureDataProductCatalogTab(tabs: PortalCatalogTabMeta[]) {
  if (tabs.some((tab) => tab.id === 'data-product')) {
    return tabs
  }

  const dataProductTab = DEFAULT_CATALOG_TABS.find((tab) => tab.id === 'data-product')
  if (!dataProductTab) {
    return tabs
  }

  const dataResourceIndex = tabs.findIndex((tab) => tab.id === 'data-resource')
  if (dataResourceIndex < 0) {
    return [dataProductTab, ...tabs]
  }

  return [
    ...tabs.slice(0, dataResourceIndex + 1),
    dataProductTab,
    ...tabs.slice(dataResourceIndex + 1),
  ]
}

function buildDemandTabs(navigations: PortalNavigationNode[]): PortalDemandTabMeta[] {
  const visibleNavigations = filterVisibleNavigationTree(navigations)
  const demandNode = visibleNavigations.find((item) => normalizeTarget(item.target) === '/demand')
  if (!demandNode?.children?.length) {
    return visibleNavigations.some((item) => normalizeTarget(item.target) === '/demand') ? [] : DEFAULT_DEMAND_TABS
  }

  const mapped = sortNodes(demandNode.children)
    .map((child) => buildDemandTabMetaFromNavigation(child.target, child.title, child.icon || ''))
    .filter(Boolean) as PortalDemandTabMeta[]

  return mapped.length > 0 ? mapped : DEFAULT_DEMAND_TABS
}

export async function fetchPortalNavigations(): Promise<PortalNavigationNode[]> {
  if (cachedNavigations !== undefined) {
    return cachedNavigations || []
  }

  const stored = readStoredNavigations()
  if (stored?.length) {
    cachedNavigations = stored
  }

  if (navigationPromise) {
    return navigationPromise
  }

  navigationPromise = nocobaseBrowserAuthClient
    .resource('jcConfigCenter')
    .publicGetNavigations()
    .then((response) => {
      const payload = response.data as PublicNavigationsResponse | undefined
      const items = Array.isArray(payload?.data?.items)
        ? payload?.data?.items?.map((item) => normalizeNavigationNode(item)).filter(Boolean) as PortalNavigationNode[]
        : []
      const sorted = sortNodes(filterVisibleNavigationTree(items))
      cachedNavigations = sorted
      persistNavigations(sorted)
      return sorted
    })
    .catch(() => {
      cachedNavigations = stored || []
      return cachedNavigations
    })
    .finally(() => {
      navigationPromise = null
    })

  return navigationPromise
}

export function getPortalNavigationFallback(): PortalNavigationNode[] {
  const stored = readStoredNavigations()
  return stored?.length ? stored : []
}

export function usePortalNavigations(enabled: boolean, enabledModuleIds: readonly ProductModuleId[]) {
  const [navigations, setNavigations] = useState<PortalNavigationNode[]>(() => getPortalNavigationFallback())

  useEffect(() => {
    if (!enabled) {
      setNavigations(getPortalNavigationFallback())
      return
    }

    let cancelled = false

    void fetchPortalNavigations().then((items) => {
      if (!cancelled) {
        setNavigations(items)
      }
    })

    return () => {
      cancelled = true
    }
  }, [enabled])

  const primaryNavigations = useMemo(() => buildPrimaryNavigations(navigations, enabledModuleIds), [enabledModuleIds, navigations])
  const catalogTabs = useMemo(() => buildCatalogTabs(navigations), [navigations])
  const demandTabs = useMemo(() => buildDemandTabs(navigations), [navigations])

  return {
    navigations,
    primaryNavigations,
    catalogTabs,
    demandTabs,
  }
}

export function resolveCatalogTabIdByTarget(target: string): PortalCatalogTabId | null {
  return buildCatalogTabMetaFromNavigation(target, '', '')?.id ?? null
}

export function resolveDemandTabIdByTarget(target: string): PortalDemandTabId | null {
  return buildDemandTabMetaFromNavigation(target, '', '')?.id ?? null
}

export function getDefaultCatalogTabs() {
  return DEFAULT_CATALOG_TABS
}

export function getDefaultDemandTabs() {
  return DEFAULT_DEMAND_TABS
}
