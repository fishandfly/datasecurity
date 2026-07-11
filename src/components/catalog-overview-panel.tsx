import { useMemo } from 'react'
import type { CatalogItem } from '../lib/nocobase-portal-data'
import type { CatalogCategoryTreeNode } from '../lib/catalog-category-tree'
import { getCatalogResourceTypeFilterId } from '../lib/catalog-resource-type'
import { extractTopLevelCategory } from '../lib/home-page-insights'
import { usePortalContext } from '../lib/portal-context'
import {
  OverviewMetricCardsGrid,
  PrimaryOverviewCards,
  formatOverviewMetricValue,
  usePrimaryOverviewCardsData,
  type OverviewMetricCardItem,
} from './primary-overview-cards'

type ResourceCategoryMetricKey = 'base' | 'business' | 'manage' | 'map'

type ResourceCategoryMetricCounts = Record<ResourceCategoryMetricKey, number>

function resolveCategoryMetricKeyByLabel(label: string): ResourceCategoryMetricKey | null {
  if (label === '基础数据') return 'base'
  if (label === '业务数据') return 'business'
  if (label === '管理数据') return 'manage'
  if (label === '地图数据') return 'map'
  return null
}

const RESOURCE_CATEGORY_CARD_META: Array<{
  key: ResourceCategoryMetricKey
  label: string
}> = [
  { key: 'base', label: '基础数据' },
  { key: 'business', label: '业务数据' },
  { key: 'manage', label: '管理数据' },
  { key: 'map', label: '地图数据' },
]

const LIST_OVERVIEW_CHART_WIDTH = 118

function createEmptyResourceCategoryMetricCounts(): ResourceCategoryMetricCounts {
  return {
    base: 0,
    business: 0,
    manage: 0,
    map: 0,
  }
}

function resolveResourceCategoryMetricKey(item: Pick<CatalogItem, 'category' | 'industryCategory'>): ResourceCategoryMetricKey | null {
  const topLevelCategory = extractTopLevelCategory(item.category, item.industryCategory)

  if (topLevelCategory === '基础数据') return 'base'
  if (topLevelCategory === '业务数据') return 'business'
  if (topLevelCategory === '管理数据') return 'manage'
  if (topLevelCategory === '地图数据') return 'map'

  return null
}

function formatResourceCategoryRecordMetric(key: ResourceCategoryMetricKey, recordCount: number) {
  if (key === 'business' || key === 'manage') {
    return {
      valueText: formatOverviewMetricValue(recordCount / 100000000, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
      unit: '亿条',
    }
  }

  if (key === 'base') {
    return {
      valueText: formatOverviewMetricValue(recordCount / 10000, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
      unit: '万条',
    }
  }

  return {
    valueText: formatOverviewMetricValue(recordCount),
    unit: '条',
  }
}

function buildResourceCategoryMetricValueNode(
  categoryKey: ResourceCategoryMetricKey,
  resourceCount: number,
  currentRecordCount: number | null,
  fallbackRecordCount: number,
  isActive = false,
) {
  const recordCount = currentRecordCount ?? fallbackRecordCount
  const recordMetric = formatResourceCategoryRecordMetric(categoryKey, recordCount)
  const resourceValueToneClass = isActive
    ? 'text-[color-mix(in_srgb,var(--theme-accent-strong)_72%,white)] drop-shadow-[0_0_16px_rgba(var(--theme-soft-rgb),0.20)]'
    : 'text-[var(--theme-accent-strong)]'
  const unitToneClass = isActive
    ? 'text-[color-mix(in_srgb,var(--text-secondary)_62%,white_38%)]'
    : 'text-[var(--text-secondary)]'
  const splitToneClass = isActive
    ? 'text-[color-mix(in_srgb,var(--text-muted)_48%,white_52%)]'
    : 'text-[var(--text-muted)]'
  const recordToneClass = isActive
    ? 'text-[color-mix(in_srgb,var(--primary)_62%,white_38%)] drop-shadow-[0_0_14px_rgba(var(--theme-soft-rgb),0.18)]'
    : 'text-[var(--primary)]'

  return (
    <>
      <span className={`text-[2.125rem] font-semibold leading-none ${resourceValueToneClass}`}>
        {formatOverviewMetricValue(resourceCount)}
      </span>
      <span className={`pb-1 text-[0.75rem] ${unitToneClass}`}>个</span>
      <span className={`pb-[2px] text-[1.375rem] font-medium leading-none ${splitToneClass}`}>/</span>
      <span className={`text-[1.125rem] font-semibold leading-none ${recordToneClass}`}>
        {recordMetric.valueText}
      </span>
      <span className={`pb-1 text-[0.75rem] ${unitToneClass}`}>{recordMetric.unit}</span>
    </>
  )
}

export function CatalogOverviewPanel({
  variant = 'default',
  activeCategoryNodeId = '',
  onCategorySelect,
}: {
  variant?: 'default' | 'plain'
  activeCategoryNodeId?: string
  onCategorySelect?: (categoryNodeId: string) => void
}) {
  const { data } = usePortalContext()
  const { catalogItems, categoryTree } = data
  const overviewCardData = usePrimaryOverviewCardsData()
  const primaryMetricsNode = variant !== 'plain' ? <PrimaryOverviewCards data={overviewCardData} /> : null
  const topCategoryNodeIdByKey = useMemo(() => {
    const mapping: Partial<Record<ResourceCategoryMetricKey, string>> = {}
    categoryTree.forEach((node: CatalogCategoryTreeNode) => {
      const key = resolveCategoryMetricKeyByLabel(node.label)
      if (!key || mapping[key]) return
      mapping[key] = node.id
    })
    return mapping
  }, [categoryTree])

  const serviceStatsRow = useMemo<OverviewMetricCardItem[]>(() => {
    const catalogCategoryCounts = createEmptyResourceCategoryMetricCounts()
    const catalogCategoryRecordCounts = createEmptyResourceCategoryMetricCounts()
    const currentCategoryStatCounts = createEmptyResourceCategoryMetricCounts()
    const currentCategoryRecordCounts = createEmptyResourceCategoryMetricCounts()
    const currentCategoryTrendPoints: Record<ResourceCategoryMetricKey, Map<string, number>> = {
      base: new Map<string, number>(),
      business: new Map<string, number>(),
      manage: new Map<string, number>(),
      map: new Map<string, number>(),
    }
    const catalogItemMap = new Map<string, CatalogItem>()

    catalogItems.forEach((item) => {
      const resourceTypeId = getCatalogResourceTypeFilterId(item)
      if (resourceTypeId === 'data-resource') {
        catalogItemMap.set(item.id, item)
        const categoryKey = resolveResourceCategoryMetricKey(item)
        if (!categoryKey) return

        catalogCategoryCounts[categoryKey] += 1
        catalogCategoryRecordCounts[categoryKey] += Math.max(0, Number(item.countValue ?? 0))
      }
    })

    overviewCardData.resourceTrends.forEach((item) => {
      const catalogItem = catalogItemMap.get(item.resourceId)
      if (!catalogItem) return

      const categoryKey = resolveResourceCategoryMetricKey(catalogItem)
      if (!categoryKey) return

      currentCategoryStatCounts[categoryKey] += 1
      currentCategoryRecordCounts[categoryKey] += Math.max(0, Number(item.currentRecordCount ?? 0))

      item.points.forEach((point) => {
        const currentValue = currentCategoryTrendPoints[categoryKey].get(point.periodCode) ?? 0
        currentCategoryTrendPoints[categoryKey].set(point.periodCode, currentValue + Math.max(0, Number(point.recordCount ?? 0)))
      })
    })

    const buildCategoryTrend = (key: ResourceCategoryMetricKey) => {
      if (overviewCardData.trendPeriodCodes.length > 0) {
        return overviewCardData.trendPeriodCodes.map((periodCode) => ({
          periodCode,
          value: currentCategoryTrendPoints[key].get(periodCode) ?? 0,
        }))
      }

      return [
        {
          periodCode: 'current',
          value: currentCategoryRecordCounts[key] > 0 ? currentCategoryRecordCounts[key] : catalogCategoryRecordCounts[key],
        },
      ]
    }

    return RESOURCE_CATEGORY_CARD_META.map((item) => ({
      key: item.key,
      label: item.label,
      value: catalogCategoryCounts[item.key],
      unit: '个',
      delta: null,
      trend: buildCategoryTrend(item.key),
      chartWidth: LIST_OVERVIEW_CHART_WIDTH,
      valueNode: buildResourceCategoryMetricValueNode(
        item.key,
        catalogCategoryCounts[item.key],
        currentCategoryStatCounts[item.key] > 0 ? currentCategoryRecordCounts[item.key] : null,
        catalogCategoryRecordCounts[item.key],
        Boolean(activeCategoryNodeId) && activeCategoryNodeId === topCategoryNodeIdByKey[item.key],
      ),
      hideDeltaText: true,
      onClick: variant === 'plain' && onCategorySelect && topCategoryNodeIdByKey[item.key]
        ? () => onCategorySelect(topCategoryNodeIdByKey[item.key] ?? '')
        : undefined,
      isActive: Boolean(activeCategoryNodeId) && activeCategoryNodeId === topCategoryNodeIdByKey[item.key],
    }))
  }, [activeCategoryNodeId, catalogItems, onCategorySelect, overviewCardData.resourceTrends, overviewCardData.trendPeriodCodes, topCategoryNodeIdByKey, variant])

  return (
    <section
      className={
        variant === 'plain'
          ? 'relative'
          : 'relative overflow-hidden rounded-[14px] border border-[var(--line)] bg-transparent shadow-[var(--shadow-elevated)]'
      }
    >
      <div className={variant === 'plain' ? 'relative' : 'relative px-8 py-8 lg:px-12 lg:py-9'}>
        <div className="space-y-4">
          {primaryMetricsNode}
          {variant === 'plain' ? (
            <OverviewMetricCardsGrid
              items={serviceStatsRow}
              isLoading={overviewCardData.isLoading && overviewCardData.snapshot.latestExecutedAt.length === 0}
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}
