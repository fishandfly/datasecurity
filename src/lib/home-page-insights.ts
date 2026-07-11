import type { CatalogCategoryTreeNode, TopCategoryLookup } from './catalog-category-tree'
import type { PeriodSummary, ResourceRecordChangeItem, StatRecord, StatTrendPoint } from './nocobase-stat-data'

export type ThemeDistributionItem = {
  label: string
  count: number
  share: number
}

export type ThemeDistributionChildItem = {
  id: string
  label: string
  count: number
}

export type ThemeDistributionGroup = {
  id: string
  label: string
  count: number
  share: number
  children: ThemeDistributionChildItem[]
}

type ThemeDistributionSource = {
  category: string
  industryCategory: string
}

export type LatestUpdatedSource = {
  name: string
  summary: string
  updateTime: string
}

export type RecommendedSource = LatestUpdatedSource & {
  id: string
  countValue: number
  category: string
  description: string
  serviceType: string
  openType: string
  businessCategory?: string
  businessCategoryPath?: string
}

export type RecommendedGroup<T extends RecommendedSource> = {
  label: string
  items: T[]
}

export type HomeOverviewTrendPoint = {
  periodCode: string
  executedAt: string
  themeCount: number
  resourceCount: number
  fieldCount: number
  recordCount: number
}

export type HomeOverviewMetric = {
  key: 'theme' | 'source' | 'resource' | 'field' | 'record' | 'problem'
  label: string
  value: number
  unit: string
  delta: number | null
  trend: Array<{ periodCode: string; value: number }>
}

export type HomeOverviewSnapshot = {
  latestPeriodCode: string
  latestExecutedAt: string
  trendPoints: HomeOverviewTrendPoint[]
  metrics: HomeOverviewMetric[]
}

type HomeOverviewTrendBucket = {
  periodCode: string
  executedAt: string
  themeLabels: Set<string>
  resourceIds: Set<string>
  fieldCount: number
  recordCount: number
}

const DATA_RESOURCE_TYPE_ID = '33'

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? ''
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function resolveTopCategoryLabel(record: Pick<StatRecord, 'domainCategoryId' | 'domainCategoryName'>, topCategoryLookup?: TopCategoryLookup) {
  const matched = topCategoryLookup?.byId.get(record.domainCategoryId)
  if (matched?.label) {
    return matched.label
  }

  const normalized = normalizeText(record.domainCategoryName)
  if (!normalized || normalized === '未标注') {
    return '未标注'
  }
  return normalized.split('/')[0]?.trim() || normalized
}

function isDataResourceStatRecord(record: Pick<StatRecord, 'resourceTypeId'>) {
  const typeId = normalizeText(record.resourceTypeId)
  if (!typeId) {
    return true
  }
  return typeId === DATA_RESOURCE_TYPE_ID
}

function parseTimestamp(value: string | null | undefined) {
  const normalized = normalizeText(value)

  if (!normalized || normalized === '未标注') {
    return Number.NEGATIVE_INFINITY
  }

  const timestamp = Date.parse(normalized.replace(' ', 'T'))
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

function buildHomeOverviewMetrics(trendPoints: HomeOverviewTrendPoint[]): HomeOverviewMetric[] {
  const latestPoint = trendPoints[trendPoints.length - 1]
  const previousPoint = trendPoints.length > 1 ? trendPoints[trendPoints.length - 2] : null

  return [
    {
      key: 'theme',
      label: '业务主题',
      value: latestPoint?.themeCount ?? 0,
      unit: '类',
      delta: previousPoint ? (latestPoint?.themeCount ?? 0) - previousPoint.themeCount : null,
      trend: trendPoints.map((item) => ({ periodCode: item.periodCode, value: item.themeCount })),
    },
    {
      key: 'resource',
      label: '数据资源',
      value: latestPoint?.resourceCount ?? 0,
      unit: '个',
      delta: previousPoint ? (latestPoint?.resourceCount ?? 0) - previousPoint.resourceCount : null,
      trend: trendPoints.map((item) => ({ periodCode: item.periodCode, value: item.resourceCount })),
    },
    {
      key: 'field',
      label: '数据字段',
      value: latestPoint?.fieldCount ?? 0,
      unit: '项',
      delta: previousPoint ? (latestPoint?.fieldCount ?? 0) - previousPoint.fieldCount : null,
      trend: trendPoints.map((item) => ({ periodCode: item.periodCode, value: item.fieldCount })),
    },
    {
      key: 'record',
      label: '数据条数',
      value: latestPoint?.recordCount ?? 0,
      unit: '条',
      delta: previousPoint ? (latestPoint?.recordCount ?? 0) - previousPoint.recordCount : null,
      trend: trendPoints.map((item) => ({ periodCode: item.periodCode, value: item.recordCount })),
    },
  ]
}

function sortHomeOverviewTrendBuckets(left: HomeOverviewTrendBucket, right: HomeOverviewTrendBucket) {
  const timeDiff = parseTimestamp(left.executedAt) - parseTimestamp(right.executedAt)
  if (timeDiff !== 0) return timeDiff
  return left.periodCode.localeCompare(right.periodCode, 'zh-Hans-CN')
}

function normalizeTrendPeriodCode(point: StatTrendPoint, fallbackPeriodCode: string) {
  const pointPeriodCode = normalizeText(point?.stat_period_code)
  if (pointPeriodCode) return pointPeriodCode

  const pointDate = normalizeText(point?.date)
  if (pointDate) return pointDate

  const pointExecutedAt = normalizeText(point?.execute_time)
  if (pointExecutedAt) return pointExecutedAt

  return fallbackPeriodCode
}

function normalizeTrendExecutedAt(point: StatTrendPoint, fallbackExecutedAt: string) {
  return normalizeText(point?.execute_time) || fallbackExecutedAt
}

function extractPrimaryPathLabel(path: string) {
  const segments = normalizeText(path)
    .split(/[\\/／>＞]/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return ''
  }

  return segments[0] ?? ''
}

export function extractSecondaryPathLabel(path: string) {
  const segments = normalizeText(path)
    .split(/[\\/／>＞]/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length >= 2) {
    return segments[1] ?? ''
  }

  return segments[0] ?? ''
}

export function extractTopLevelCategory(category: string, industryCategory: string) {
  const path = normalizeText(industryCategory)
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (path.length > 0) {
    return path[0]
  }

  return normalizeText(category) || '未标注'
}

export function buildThemeDistribution(items: ThemeDistributionSource[], limit = 10): ThemeDistributionItem[] {
  const counts = new Map<string, number>()

  items.forEach((item) => {
    const topLevelCategory = extractTopLevelCategory(item.category, item.industryCategory)
    counts.set(topLevelCategory, (counts.get(topLevelCategory) ?? 0) + 1)
  })

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      share: items.length > 0 ? Number(((count / items.length) * 100).toFixed(1)) : 0,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-Hans-CN'))
    .slice(0, limit)
}

export function buildThemeDistributionGroups(tree: CatalogCategoryTreeNode[], limit = 10): ThemeDistributionGroup[] {
  const activeTopNodes = tree
    .filter((node) => node.label !== '未标注' && node.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-Hans-CN'))
    .slice(0, limit)

  const totalCount = activeTopNodes.reduce((sum, node) => sum + node.count, 0)

  return activeTopNodes.map((node) => ({
    id: node.id,
    label: node.label,
    count: node.count,
    share: totalCount > 0 ? Number(((node.count / totalCount) * 100).toFixed(1)) : 0,
    children: [...node.children]
      .filter((child) => child.label !== '未标注' && child.count > 0)
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-Hans-CN'))
      .map((child) => ({
        id: child.id,
        label: child.label,
        count: child.count,
      })),
  }))
}

export function countActiveThemes(items: ThemeDistributionSource[]) {
  const themes = new Set<string>()

  items.forEach((item) => {
    const topLevelCategory = extractTopLevelCategory(item.category, item.industryCategory)
    if (topLevelCategory && topLevelCategory !== '未标注') {
      themes.add(topLevelCategory)
    }
  })

  return themes.size
}

export function resolveLatestBusinessUpdateTimeText(
  resourceId: string,
  latestStatRecordByResourceId?: ReadonlyMap<string, Pick<StatRecord, 'metainfo'>>,
) {
  return normalizeText(latestStatRecordByResourceId?.get(resourceId)?.metainfo?.last_record_update_time)
}

export function buildLatestUpdatedItems<T extends LatestUpdatedSource & { id: string }>(
  items: T[],
  limit = 8,
  latestStatRecordByResourceId?: ReadonlyMap<string, Pick<StatRecord, 'metainfo'>>,
): T[] {
  return [...items]
    .sort((left, right) => {
      const leftTime = parseTimestamp(
        latestStatRecordByResourceId
          ? resolveLatestBusinessUpdateTimeText(left.id, latestStatRecordByResourceId)
          : left.updateTime,
      )
      const rightTime = parseTimestamp(
        latestStatRecordByResourceId
          ? resolveLatestBusinessUpdateTimeText(right.id, latestStatRecordByResourceId)
          : right.updateTime,
      )
      if (leftTime !== rightTime) {
        return rightTime > leftTime ? 1 : -1
      }

      const leftRecords = normalizeNumber(latestStatRecordByResourceId?.get(left.id)?.metainfo?.record_count)
      const rightRecords = normalizeNumber(latestStatRecordByResourceId?.get(right.id)?.metainfo?.record_count)
      if (leftRecords !== rightRecords) {
        return rightRecords > leftRecords ? 1 : -1
      }

      return left.id.localeCompare(right.id, 'en')
    })
    .slice(0, limit)
}

export function formatLatestDataChangeSummary(record?: Pick<StatRecord, 'metainfo' | 'dayOnDay'> | null) {
  if (!record) {
    return '暂无最新数据变化量'
  }

  const currentRecords = normalizeNumber(record.metainfo.record_count)
  const deltaRecords = record.dayOnDay.record_count?.delta
  const hasDelta = typeof deltaRecords === 'number' && Number.isFinite(deltaRecords)

  if (hasDelta) {
    const currentText = currentRecords.toLocaleString('zh-CN')
    if (deltaRecords > 0) {
      return `较上期 +${deltaRecords.toLocaleString('zh-CN')} 条，当前 ${currentText} 条`
    }
    if (deltaRecords < 0) {
      return `较上期 -${Math.abs(deltaRecords).toLocaleString('zh-CN')} 条，当前 ${currentText} 条`
    }
    return `较上期持平，当前 ${currentText} 条`
  }

  if (currentRecords > 0) {
    return `当前 ${currentRecords.toLocaleString('zh-CN')} 条`
  }

  return '暂无最新数据变化量'
}

export function formatResourceRecordChangeSummary(item?: Pick<ResourceRecordChangeItem, 'currentRecords' | 'deltaRecords'> | null) {
  if (!item) {
    return '暂无最新数据变化量'
  }

  const currentText = normalizeNumber(item.currentRecords).toLocaleString('zh-CN')
  const deltaRecords = normalizeNumber(item.deltaRecords)

  if (deltaRecords > 0) {
    return `较上期 +${deltaRecords.toLocaleString('zh-CN')} 条，当前 ${currentText} 条`
  }
  if (deltaRecords < 0) {
    return `较上期 -${Math.abs(deltaRecords).toLocaleString('zh-CN')} 条，当前 ${currentText} 条`
  }
  return `较上期持平，当前 ${currentText} 条`
}

export function limitRecommendedItems<T extends RecommendedSource>(
  items: T[],
  limit = 12,
  latestStatRecordByResourceId?: ReadonlyMap<string, Pick<StatRecord, 'metainfo'>>,
): T[] {
  return [...items]
    .sort((left, right) => {
      const leftStat = latestStatRecordByResourceId?.get(left.id)
      const rightStat = latestStatRecordByResourceId?.get(right.id)
      const leftTime = parseTimestamp(resolveLatestBusinessUpdateTimeText(left.id, latestStatRecordByResourceId))
      const rightTime = parseTimestamp(resolveLatestBusinessUpdateTimeText(right.id, latestStatRecordByResourceId))
      if (leftTime !== rightTime) {
        return rightTime > leftTime ? 1 : -1
      }

      const leftRecords = normalizeNumber(leftStat?.metainfo?.record_count)
      const rightRecords = normalizeNumber(rightStat?.metainfo?.record_count)
      if (leftRecords !== rightRecords) {
        return rightRecords > leftRecords ? 1 : -1
      }

      return left.id.localeCompare(right.id, 'en')
    })
    .slice(0, limit)
}

export function resolveRecommendedGroupLabel(item: Pick<RecommendedSource, 'businessCategoryPath' | 'businessCategory' | 'category'>) {
  const primaryLabel = extractPrimaryPathLabel(item.businessCategoryPath ?? '')
  if (primaryLabel && primaryLabel !== '未标注') {
    return primaryLabel
  }

  const businessLabel = normalizeText(item.businessCategory)
  if (businessLabel && businessLabel !== '未标注') {
    return businessLabel
  }

  return normalizeText(item.category) || '未标注'
}

export function buildRecommendedGroups<T extends RecommendedSource>(items: T[]): RecommendedGroup<T>[] {
  const groups = new Map<string, T[]>()

  items.forEach((item) => {
    const label = resolveRecommendedGroupLabel(item)
    const currentItems = groups.get(label) ?? []
    currentItems.push(item)
    groups.set(label, currentItems)
  })

  return Array.from(groups.entries()).map(([label, groupedItems]) => ({
    label,
    items: groupedItems,
  }))
}

export function buildHomeOverviewSnapshot(
  records: StatRecord[],
  periodSummaries: PeriodSummary[],
  options?: { topCategoryLookup?: TopCategoryLookup; limit?: number },
): HomeOverviewSnapshot {
  const filteredRecords = records.filter(isDataResourceStatRecord)
  const recordsByPeriod = new Map<string, StatRecord[]>()
  filteredRecords.forEach((record) => {
    const list = recordsByPeriod.get(record.periodCode) ?? []
    list.push(record)
    recordsByPeriod.set(record.periodCode, list)
  })

  const periodLimit = options?.limit ?? 10
  const summaryPeriodCodes = periodSummaries
    .map((item) => item.periodCode)
    .filter((periodCode, index, source) => source.indexOf(periodCode) === index)
  const summaryByPeriodCode = new Map(periodSummaries.map((item) => [item.periodCode, item]))
  const fallbackPeriodCodes = Array.from(recordsByPeriod.keys()).sort((left, right) => right.localeCompare(left))
  const selectedPeriodCodes = (summaryPeriodCodes.length > 0 ? summaryPeriodCodes : fallbackPeriodCodes)
    .filter((periodCode) => recordsByPeriod.has(periodCode))
    .slice(0, periodLimit)
    .reverse()

  const trendPoints = selectedPeriodCodes.map((periodCode) => {
    const list = recordsByPeriod.get(periodCode) ?? []
    const executedAt = summaryByPeriodCode.get(periodCode)?.executedAt
      ?? list.map((item) => item.executedAt).filter(Boolean).sort((left, right) => right.localeCompare(left))[0]
      ?? ''
    const themeLabels = new Set<string>()
    let fieldCount = 0
    let recordCount = 0

    list.forEach((record) => {
      themeLabels.add(resolveTopCategoryLabel(record, options?.topCategoryLookup))
      fieldCount += normalizeNumber(record.metainfo.field_count)
      recordCount += normalizeNumber(record.metainfo.record_count)
    })

    return {
      periodCode,
      executedAt,
      themeCount: Array.from(themeLabels).filter((label) => label && label !== '未标注').length,
      resourceCount: list.length,
      fieldCount,
      recordCount,
    }
  })

  const latestPoint = trendPoints[trendPoints.length - 1]
  const latestPeriodCode = latestPoint?.periodCode ?? ''
  const latestExecutedAt = latestPoint?.executedAt ?? ''

  return {
    latestPeriodCode,
    latestExecutedAt,
    trendPoints,
    metrics: buildHomeOverviewMetrics(trendPoints),
  }
}

export function buildHomeOverviewSnapshotFromCurrentRecords(
  records: StatRecord[],
  options?: { topCategoryLookup?: TopCategoryLookup; limit?: number },
): HomeOverviewSnapshot {
  const filteredRecords = records.filter(isDataResourceStatRecord)
  const trendBucket = new Map<string, HomeOverviewTrendBucket>()

  filteredRecords.forEach((record) => {
    const trendPoints = record.dayOnDay.trend_30d?.points ?? []
    if (trendPoints.length === 0) return

    trendPoints.forEach((point) => {
      const periodCode = normalizeTrendPeriodCode(point, record.periodCode)
      if (!periodCode) return

      const existing = trendBucket.get(periodCode) ?? {
        periodCode,
        executedAt: normalizeTrendExecutedAt(point, record.executedAt),
        themeLabels: new Set<string>(),
        resourceIds: new Set<string>(),
        fieldCount: 0,
        recordCount: 0,
      }

      const executedAt = normalizeTrendExecutedAt(point, record.executedAt)
      if (parseTimestamp(executedAt) > parseTimestamp(existing.executedAt)) {
        existing.executedAt = executedAt
      }

      const topCategoryLabel = resolveTopCategoryLabel(record, options?.topCategoryLookup)
      if (topCategoryLabel && topCategoryLabel !== '未标注') {
        existing.themeLabels.add(topCategoryLabel)
      }
      existing.resourceIds.add(record.resourceId || record.id)
      existing.fieldCount += normalizeNumber(point.field_count)
      existing.recordCount += normalizeNumber(point.record_count)
      trendBucket.set(periodCode, existing)
    })
  })

  let trendPoints = Array.from(trendBucket.values())
    .sort(sortHomeOverviewTrendBuckets)
    .slice(-(options?.limit ?? 10))
    .map((item) => ({
      periodCode: item.periodCode,
      executedAt: item.executedAt,
      themeCount: item.themeLabels.size,
      resourceCount: item.resourceIds.size,
      fieldCount: item.fieldCount,
      recordCount: item.recordCount,
    }))

  if (trendPoints.length === 0 && filteredRecords.length > 0) {
    const themeLabels = new Set<string>()
    let fieldCount = 0
    let recordCount = 0
    let latestExecutedAt = ''
    let latestPeriodCode = ''

    filteredRecords.forEach((record) => {
      const topCategoryLabel = resolveTopCategoryLabel(record, options?.topCategoryLookup)
      if (topCategoryLabel && topCategoryLabel !== '未标注') {
        themeLabels.add(topCategoryLabel)
      }
      fieldCount += normalizeNumber(record.metainfo.field_count)
      recordCount += normalizeNumber(record.metainfo.record_count)
      if (parseTimestamp(record.executedAt) > parseTimestamp(latestExecutedAt)) {
        latestExecutedAt = record.executedAt
      }
      if (record.periodCode.localeCompare(latestPeriodCode, 'zh-Hans-CN') > 0) {
        latestPeriodCode = record.periodCode
      }
    })

    trendPoints = [
      {
        periodCode: latestPeriodCode,
        executedAt: latestExecutedAt,
        themeCount: themeLabels.size,
        resourceCount: filteredRecords.length,
        fieldCount,
        recordCount,
      },
    ].filter((item) => item.periodCode || item.executedAt)
  }

  const latestPoint = trendPoints[trendPoints.length - 1]
  return {
    latestPeriodCode: latestPoint?.periodCode ?? '',
    latestExecutedAt: latestPoint?.executedAt ?? '',
    trendPoints,
    metrics: buildHomeOverviewMetrics(trendPoints),
  }
}
