import type { AppCatalogNode } from './nocobase-app-data.ts'
import type { SupplyDemandInfo, SupplyDemandRelatedApp } from './nocobase-supply-demand-data.ts'

export type ResourceRelatedApplication = {
  appId: string
  appName: string
  description: string
  contact: string
  tags: string[]
  screenshotUrl: string
  domainCategoryName: string
  sceneNames: string[]
  sourceDomainLabels: string[]
  recordCount: number
  linkedResourceCount: number
  connectedCount: number
  pendingCount: number
  latestDistributionDate: string
}

function includesAny(source: string, keywords: string[]) {
  return keywords.some((keyword) => source.includes(keyword))
}

function isConnected(item: SupplyDemandInfo) {
  const raw = [item.satisfactionStatusName, item.dataStatusDescription, item.dataConnectionDescription].join(' ')
  return includesAny(raw, ['已满足', '已接入', '已提供', '已发放'])
}

function isPending(item: SupplyDemandInfo) {
  const raw = [item.satisfactionStatusName, item.dataStatusDescription, item.dataConnectionDescription].join(' ')
  return includesAny(raw, ['无', '未接入', '待', '缺口'])
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

function buildFallbackDescription(sceneNames: string[]) {
  if (sceneNames.length === 0) {
    return '当前应用已通过供需对接与数据资源建立关联。'
  }

  if (sceneNames.length === 1) {
    return `通过“${sceneNames[0]}”场景建立供需对接关联。`
  }

  return `通过“${sceneNames.slice(0, 2).join('、')}”等场景建立供需对接关联。`
}

function mergeTags(currentTags: Set<string>, apps: Array<Pick<SupplyDemandRelatedApp, 'tags'> | Pick<AppCatalogNode, 'tags'>>) {
  apps.forEach((app) => {
    app.tags.forEach((tag) => {
      const normalized = tag.trim()
      if (normalized) {
        currentTags.add(normalized)
      }
    })
  })
}

function pickPrimaryText(...candidates: Array<string | undefined>) {
  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() ?? ''
}

function resolveGroupKey(appId: string, appName: string) {
  return appId || `name:${appName}`
}

export function buildResourceRelatedApplications(
  resourceId: string,
  items: SupplyDemandInfo[],
  catalogAppsById: Map<string, AppCatalogNode> = new Map(),
): ResourceRelatedApplication[] {
  const normalizedResourceId = resourceId.trim()
  if (!normalizedResourceId) {
    return []
  }

  const grouped = new Map<
    string,
    {
      appId: string
      appName: string
      description: string
      contact: string
      tags: Set<string>
      screenshotUrl: string
      domainCategoryName: string
      sceneNames: string[]
      sourceDomainLabels: string[]
      recordCount: number
      linkedResourceIds: Set<string>
      connectedCount: number
      pendingCount: number
      latestDistributionDate: string
    }
  >()

  items.forEach((item) => {
    if (!item.linkedResourceIds.includes(normalizedResourceId) || item.relatedApps.length === 0) {
      return
    }

    item.relatedApps.forEach((relatedApp) => {
      const catalogApp = relatedApp.id ? catalogAppsById.get(relatedApp.id) : undefined
      const appId = pickPrimaryText(relatedApp.id, catalogApp?.id)
      const appName = pickPrimaryText(relatedApp.name, catalogApp?.name, '未命名应用')
      const groupKey = resolveGroupKey(appId, appName)

      const current = grouped.get(groupKey) ?? {
        appId,
        appName,
        description: '',
        contact: '',
        tags: new Set<string>(),
        screenshotUrl: '',
        domainCategoryName: '',
        sceneNames: [],
        sourceDomainLabels: [],
        recordCount: 0,
        linkedResourceIds: new Set<string>(),
        connectedCount: 0,
        pendingCount: 0,
        latestDistributionDate: '',
      }

      current.appId = current.appId || appId
      current.appName = current.appName || appName
      current.recordCount += 1
      current.connectedCount += isConnected(item) ? 1 : 0
      current.pendingCount += isPending(item) ? 1 : 0

      item.linkedResourceIds.forEach((linkedResourceId) => {
        if (linkedResourceId.trim()) {
          current.linkedResourceIds.add(linkedResourceId.trim())
        }
      })

      if (item.sceneName && !current.sceneNames.includes(item.sceneName)) {
        current.sceneNames.push(item.sceneName)
      }

      if (
        item.domainCategoryName
        && item.domainCategoryName !== '未标注'
        && !current.sourceDomainLabels.includes(item.domainCategoryName)
      ) {
        current.sourceDomainLabels.push(item.domainCategoryName)
      }

      const normalizedDate = normalizeDate(item.distributionDate)
      if (normalizedDate && (!current.latestDistributionDate || normalizedDate > current.latestDistributionDate)) {
        current.latestDistributionDate = normalizedDate
      }

      current.description = pickPrimaryText(current.description, catalogApp?.description, relatedApp.description)
      current.contact = pickPrimaryText(current.contact, catalogApp?.contact, relatedApp.contact)
      current.screenshotUrl = pickPrimaryText(current.screenshotUrl, catalogApp?.screenshotUrl, relatedApp.screenshotUrl)
      current.domainCategoryName = pickPrimaryText(
        current.domainCategoryName,
        catalogApp?.domainCategoryName,
        relatedApp.domainCategoryName,
      )

      mergeTags(current.tags, [catalogApp ?? { tags: [] }, relatedApp])
      grouped.set(groupKey, current)
    })
  })

  return Array.from(grouped.values())
    .map((application) => ({
      appId: application.appId,
      appName: application.appName,
      description: application.description || buildFallbackDescription(application.sceneNames),
      contact: application.contact,
      tags: Array.from(application.tags),
      screenshotUrl: application.screenshotUrl,
      domainCategoryName: application.domainCategoryName,
      sceneNames: application.sceneNames,
      sourceDomainLabels: application.sourceDomainLabels,
      recordCount: application.recordCount,
      linkedResourceCount: application.linkedResourceIds.size,
      connectedCount: application.connectedCount,
      pendingCount: application.pendingCount,
      latestDistributionDate: application.latestDistributionDate,
    }))
    .sort((left, right) => {
      if (right.recordCount !== left.recordCount) {
        return right.recordCount - left.recordCount
      }

      if (right.sceneNames.length !== left.sceneNames.length) {
        return right.sceneNames.length - left.sceneNames.length
      }

      if (right.latestDistributionDate !== left.latestDistributionDate) {
        return right.latestDistributionDate.localeCompare(left.latestDistributionDate, 'zh-CN')
      }

      return left.appName.localeCompare(right.appName, 'zh-CN')
    })
}
