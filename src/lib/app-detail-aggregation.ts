import type { AppCatalogNode } from './nocobase-app-data.ts'
import type { SupplyDemandInfo, SupplyDemandRelatedApp } from './nocobase-supply-demand-data.ts'
import type { CatalogItem } from './nocobase-portal-data.ts'

export type DemandApplicationRelatedResource = {
  id: string
  name: string
  category: string
  serviceType: string
  department: string
  updateCycle: string
  description: string
  matchedCatalog: boolean
}

export type DemandApplicationRelatedSupplyDemand = {
  id: string
  sceneName: string
  requiredDataResourceName: string
  demandDescription: string
  statusLabel: string
  domainCategoryName: string
  distributionDate: string
  linkedResources: DemandApplicationRelatedResource[]
  matchedAppNames: string[]
  isDirectMatch: boolean
}

export type DemandApplicationDetailSection = {
  app: AppCatalogNode
  descendantAppCount: number
  directRecordCount: number
  aggregateRecordCount: number
  directResourceCount: number
  aggregateResourceCount: number
  aggregateSceneCount: number
  records: DemandApplicationRelatedSupplyDemand[]
  resources: DemandApplicationRelatedResource[]
}

export type DemandApplicationTreeSection = DemandApplicationDetailSection & {
  children: DemandApplicationTreeSection[]
}

export type DemandApplicationDetailData = {
  currentApp: AppCatalogNode
  breadcrumbApps: AppCatalogNode[]
  childSections: DemandApplicationDetailSection[]
  childTreeSections: DemandApplicationTreeSection[]
  currentSection: DemandApplicationDetailSection
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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

function pickPrimaryText(...candidates: Array<string | undefined>) {
  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() ?? ''
}

function buildSubtreeApps(root: AppCatalogNode) {
  const items: AppCatalogNode[] = []
  const visit = (node: AppCatalogNode) => {
    items.push(node)
    node.children.forEach(visit)
  }
  visit(root)
  return items
}

function buildStatusLabel(item: SupplyDemandInfo) {
  return pickPrimaryText(
    item.satisfactionStatusName,
    item.dataStatusDescription,
    item.dataConnectionDescription,
    '待研判',
  )
}

function buildResourceLookupEntry(
  item: SupplyDemandInfo,
  catalogItemById: Map<string, CatalogItem>,
) {
  const resourceMap = new Map<string, DemandApplicationRelatedResource>()
  const maxLength = Math.max(item.linkedResourceIds.length, item.linkedResourceNames.length)

  for (let index = 0; index < maxLength; index += 1) {
    const linkedResourceId = normalizeText(item.linkedResourceIds[index])
    const linkedResourceName = normalizeText(item.linkedResourceNames[index])
    const catalogItem = linkedResourceId ? catalogItemById.get(linkedResourceId) : undefined
    const resourceName = pickPrimaryText(catalogItem?.name, linkedResourceName, item.requiredDataResourceName, '未命名数据资源')
    const key = linkedResourceId || `name:${resourceName}`

    if (!resourceName || resourceMap.has(key)) {
      continue
    }

    resourceMap.set(key, {
      id: linkedResourceId,
      name: resourceName,
      category: pickPrimaryText(catalogItem?.category),
      serviceType: pickPrimaryText(catalogItem?.serviceType),
      department: pickPrimaryText(catalogItem?.department),
      updateCycle: pickPrimaryText(catalogItem?.updateCycle),
      description: pickPrimaryText(catalogItem?.summary, catalogItem?.description),
      matchedCatalog: Boolean(catalogItem),
    })
  }

  if (resourceMap.size === 0) {
    const fallbackName = normalizeText(item.requiredDataResourceName)
    if (fallbackName) {
      resourceMap.set(`name:${fallbackName}`, {
        id: '',
        name: fallbackName,
        category: '',
        serviceType: '',
        department: '',
        updateCycle: '',
        description: '',
        matchedCatalog: false,
      })
    }
  }

  return Array.from(resourceMap.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function resolveMatchedApps(
  relatedApps: SupplyDemandRelatedApp[],
  subtreeIdSet: Set<string>,
  subtreeNameSet: Set<string>,
) {
  return relatedApps.filter((app) => {
    const appId = normalizeText(app.id)
    const appName = normalizeText(app.name)
    if (appId && subtreeIdSet.has(appId)) {
      return true
    }
    return appName ? subtreeNameSet.has(appName) : false
  })
}

function matchesCurrentApp(
  rootApp: AppCatalogNode,
  relatedApp: SupplyDemandRelatedApp,
) {
  const relatedAppId = normalizeText(relatedApp.id)
  const relatedAppName = normalizeText(relatedApp.name)
  if (relatedAppId && relatedAppId === rootApp.id) {
    return true
  }
  return relatedAppName !== '' && relatedAppName === rootApp.name
}

function buildSection(
  rootApp: AppCatalogNode,
  supplyDemandItems: SupplyDemandInfo[],
  catalogItemById: Map<string, CatalogItem>,
) {
  const subtreeApps = buildSubtreeApps(rootApp)
  const subtreeIdSet = new Set(subtreeApps.map((item) => item.id))
  const subtreeNameSet = new Set(subtreeApps.map((item) => item.name))
  const aggregateResources = new Map<string, DemandApplicationRelatedResource>()
  const directResourceKeys = new Set<string>()
  const sceneNames = new Set<string>()
  const records: DemandApplicationRelatedSupplyDemand[] = []
  let directRecordCount = 0

  supplyDemandItems.forEach((item) => {
    const matchedApps = resolveMatchedApps(item.relatedApps, subtreeIdSet, subtreeNameSet)
    if (matchedApps.length === 0) {
      return
    }

    const isDirectMatch = matchedApps.some((relatedApp) => matchesCurrentApp(rootApp, relatedApp))
    if (isDirectMatch) {
      directRecordCount += 1
    }

    if (item.sceneName) {
      sceneNames.add(item.sceneName)
    }

    const linkedResources = buildResourceLookupEntry(item, catalogItemById)
    linkedResources.forEach((resource) => {
      const key = resource.id || `name:${resource.name}`
      aggregateResources.set(key, resource)
      if (isDirectMatch) {
        directResourceKeys.add(key)
      }
    })

    records.push({
      id: item.id,
      sceneName: pickPrimaryText(item.sceneName, '未命名供需场景'),
      requiredDataResourceName: pickPrimaryText(item.requiredDataResourceName, '未命名数据资源'),
      demandDescription: item.demandDescription.trim(),
      statusLabel: buildStatusLabel(item),
      domainCategoryName: pickPrimaryText(item.domainCategoryName, '未标注'),
      distributionDate: normalizeDate(item.distributionDate),
      linkedResources,
      matchedAppNames: Array.from(new Set(matchedApps.map((app) => pickPrimaryText(app.name)).filter(Boolean))),
      isDirectMatch,
    })
  })

  records.sort((left, right) => {
    if (right.distributionDate !== left.distributionDate) {
      return right.distributionDate.localeCompare(left.distributionDate, 'zh-CN')
    }

    if (right.linkedResources.length !== left.linkedResources.length) {
      return right.linkedResources.length - left.linkedResources.length
    }

    return left.sceneName.localeCompare(right.sceneName, 'zh-CN')
  })

  return {
    app: rootApp,
    descendantAppCount: subtreeApps.length - 1,
    directRecordCount,
    aggregateRecordCount: records.length,
    directResourceCount: directResourceKeys.size,
    aggregateResourceCount: aggregateResources.size,
    aggregateSceneCount: sceneNames.size,
    records,
    resources: Array.from(aggregateResources.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
  } satisfies DemandApplicationDetailSection
}

function buildTreeSection(
  rootApp: AppCatalogNode,
  supplyDemandItems: SupplyDemandInfo[],
  catalogItemById: Map<string, CatalogItem>,
): DemandApplicationTreeSection {
  const current = buildSection(rootApp, supplyDemandItems, catalogItemById)
  return {
    ...current,
    children: rootApp.children.map((child) => buildTreeSection(child, supplyDemandItems, catalogItemById)),
  }
}

export function buildDemandApplicationDetailData(
  appId: string,
  appItems: AppCatalogNode[],
  supplyDemandItems: SupplyDemandInfo[],
  catalogItems: CatalogItem[],
): DemandApplicationDetailData | null {
  const normalizedAppId = normalizeText(appId)
  if (!normalizedAppId) {
    return null
  }

  const currentApp = appItems.find((item) => item.id === normalizedAppId)
  if (!currentApp) {
    return null
  }

  const appById = new Map(appItems.map((item) => [item.id, item] as const))
  const catalogItemById = new Map(catalogItems.map((item) => [item.id, item] as const))
  const breadcrumbApps = currentApp.ancestorIds
    .map((ancestorId) => appById.get(ancestorId))
    .filter((item): item is AppCatalogNode => Boolean(item))
  const currentSection = buildSection(currentApp, supplyDemandItems, catalogItemById)
  const childSections = currentApp.children
    .map((child) => buildSection(child, supplyDemandItems, catalogItemById))
    .sort((left, right) => {
      if (right.aggregateRecordCount !== left.aggregateRecordCount) {
        return right.aggregateRecordCount - left.aggregateRecordCount
      }

      if (right.aggregateResourceCount !== left.aggregateResourceCount) {
        return right.aggregateResourceCount - left.aggregateResourceCount
      }

      return left.app.name.localeCompare(right.app.name, 'zh-CN')
    })

  return {
    currentApp,
    breadcrumbApps,
    childSections,
    childTreeSections: currentApp.children.map((child) => buildTreeSection(child, supplyDemandItems, catalogItemById)),
    currentSection,
  }
}
