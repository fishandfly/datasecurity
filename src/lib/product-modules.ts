import { useMemo } from 'react'
import { MonitorCog } from 'lucide-react'
import { ALL_APP_MODULE_IDS, APP_MODULE_MANIFESTS } from '../modules/registry'
import type { AppModuleId, AppModuleManifest } from '../modules/types'

export type ProductModuleId = AppModuleId

export type ProductSolutionId = 'full' | 'ecology' | 'government-data' | 'power' | 'court'

export type ProductModuleDefinition = AppModuleManifest

export type ProductSolutionDefinition = {
  id: ProductSolutionId
  title: string
  customerLabel: string
  description: string
  moduleIds: ProductModuleId[]
}

const PRODUCT_SOLUTION_STORAGE_KEY = 'JL_ECO_PRODUCT_SOLUTION'

export const PRODUCT_MODULES: ProductModuleDefinition[] = APP_MODULE_MANIFESTS

export const ALL_PRODUCT_MODULE_IDS = ALL_APP_MODULE_IDS

export const PRODUCT_SOLUTIONS: ProductSolutionDefinition[] = [
  {
    id: 'full',
    title: '电网数据安全管控',
    customerLabel: '电网客户',
    description: '聚焦数据安全分类分级、访问控制、跨域共享和安全血缘核查，原数据资源能力作为数据底座复用。',
    moduleIds: ['security-governance'],
  },
  {
    id: 'ecology',
    title: '电网数据安全基础版',
    customerLabel: '基础客户',
    description: '保留方案参数兼容性，运行时统一进入数据安全管控功能面。',
    moduleIds: ['security-governance'],
  },
  {
    id: 'government-data',
    title: '电网数据安全监督版',
    customerLabel: '监督客户',
    description: '保留方案参数兼容性，运行时统一进入数据安全管控功能面。',
    moduleIds: ['security-governance'],
  },
  {
    id: 'power',
    title: '电力安全管控版',
    customerLabel: '电力客户',
    description: '以数据安全管控为主，围绕安全档案、字段策略和血缘关系完成前端闭环。',
    moduleIds: ['security-governance'],
  },
  {
    id: 'court',
    title: '电网数据安全共享版',
    customerLabel: '共享客户',
    description: '保留方案参数兼容性，运行时统一进入数据安全管控功能面。',
    moduleIds: ['security-governance'],
  },
]

const moduleById = new Map(PRODUCT_MODULES.map((item) => [item.id, item]))
const solutionById = new Map(PRODUCT_SOLUTIONS.map((item) => [item.id, item]))

function normalizeSolutionId(value: unknown): ProductSolutionId | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return solutionById.has(normalized as ProductSolutionId) ? normalized as ProductSolutionId : null
}

function readStoredSolutionId(): ProductSolutionId | null {
  if (typeof window === 'undefined') return null
  try {
    return normalizeSolutionId(window.localStorage.getItem(PRODUCT_SOLUTION_STORAGE_KEY))
  } catch {
    return null
  }
}

function persistSolutionId(solutionId: ProductSolutionId) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PRODUCT_SOLUTION_STORAGE_KEY, solutionId)
  } catch {
    // ignore storage failures
  }
}

export function resolveProductSolution(search = ''): ProductSolutionDefinition {
  const params = new URLSearchParams(search)
  const querySolution = normalizeSolutionId(params.get('solution'))
  if (querySolution) {
    persistSolutionId(querySolution)
    return solutionById.get(querySolution) ?? PRODUCT_SOLUTIONS[0]
  }

  const envSolution = normalizeSolutionId(import.meta.env.VITE_PRODUCT_SOLUTION)
  const storedSolution = readStoredSolutionId()
  return solutionById.get(envSolution ?? storedSolution ?? 'power') ?? PRODUCT_SOLUTIONS[0]
}

export function getProductModules(moduleIds: readonly ProductModuleId[]) {
  return moduleIds.map((id) => moduleById.get(id)).filter(Boolean) as ProductModuleDefinition[]
}

export function getProductModule(moduleId: ProductModuleId) {
  return moduleById.get(moduleId)
}

export function isProductModuleEnabled(moduleId: ProductModuleId, enabledModuleIds: readonly ProductModuleId[]) {
  return enabledModuleIds.includes(moduleId)
}

export function isProductPathEnabled(pathname: string, enabledModuleIds: readonly ProductModuleId[]) {
  const normalizedPathname = pathname.replace(/^\/data-catalog/, '') || '/'
  if (normalizedPathname === '/login' || normalizedPathname === '/personal-center') return true

  return getProductModules(enabledModuleIds).some((module) =>
    module.routePrefixes.some((prefix) =>
      prefix === '/'
        ? normalizedPathname === '/'
        : normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`),
    ),
  )
}

export function isProductNavTargetEnabled(target: string, enabledModuleIds: readonly ProductModuleId[]) {
  const [pathname] = target.split('?')
  return getProductModules(enabledModuleIds).some((module) =>
    module.navTargets.some((navTarget) => navTarget === pathname),
  )
}

export function getProductFallbackPath(enabledModuleIds: readonly ProductModuleId[]) {
  return getProductModules(enabledModuleIds)[0]?.primaryPath ?? '/security-governance'
}

export function useProductSolution(search: string) {
  return useMemo(() => {
    const solution = resolveProductSolution(search)
    const modules = getProductModules(solution.moduleIds)

    return {
      solution,
      modules,
      enabledModuleIds: solution.moduleIds,
    }
  }, [search])
}

export const PRODUCT_MODULE_FALLBACK_ICON = MonitorCog
