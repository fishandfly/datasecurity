import { useMemo } from 'react'
import type { CatalogCategoryTreeNode } from '../lib/catalog-category-tree'
import { createTopCategoryLookup } from '../lib/catalog-category-tree'
import { isCatalogResourceTypeMatch } from '../lib/catalog-resource-type'
import type { CatalogItem } from '../lib/nocobase-portal-data'
import {
  OverviewMetricCardsGrid,
  formatOverviewMetricValue,
  type OverviewMetricCardItem,
} from './primary-overview-cards'

const LIST_OVERVIEW_CHART_WIDTH = 118

function buildServiceMetricValueNode(serviceCount: number, isActive = false) {
  const valueToneClass = isActive
    ? 'text-[color-mix(in_srgb,var(--theme-accent-strong)_72%,white)] drop-shadow-[0_0_16px_rgba(var(--theme-soft-rgb),0.20)]'
    : 'text-[var(--theme-accent-strong)]'
  const unitToneClass = isActive
    ? 'text-[color-mix(in_srgb,var(--text-secondary)_62%,white_38%)]'
    : 'text-[var(--text-secondary)]'

  return (
    <>
      <span className={`text-[2.125rem] font-semibold leading-none ${valueToneClass}`}>
        {formatOverviewMetricValue(serviceCount)}
      </span>
      <span className={`pb-1 text-[0.75rem] ${unitToneClass}`}>个</span>
    </>
  )
}

function resolveBusinessAttributeTopNodeId(
  item: Pick<CatalogItem, 'businessAttributeId' | 'businessAttributeAncestorIds'>,
  topCategoryLookup: ReturnType<typeof createTopCategoryLookup>,
) {
  const matchedByBusinessAttributeId = topCategoryLookup.byId.get(item.businessAttributeId)?.id
  if (matchedByBusinessAttributeId) {
    return matchedByBusinessAttributeId
  }

  return item.businessAttributeAncestorIds
    .map((id) => topCategoryLookup.byId.get(id)?.id ?? '')
    .find(Boolean) ?? ''
}

export function CatalogServiceOverviewPanel({
  businessAttributeTree,
  items,
  activeBusinessAttributeNodeId = '',
  onBusinessAttributeSelect,
}: {
  businessAttributeTree: CatalogCategoryTreeNode[]
  items: CatalogItem[]
  activeBusinessAttributeNodeId?: string
  onBusinessAttributeSelect?: (businessAttributeNodeId: string) => void
}) {
  const topCategoryLookup = useMemo(() => createTopCategoryLookup(businessAttributeTree), [businessAttributeTree])
  const activeTopNodeId = activeBusinessAttributeNodeId
    ? (topCategoryLookup.byId.get(activeBusinessAttributeNodeId)?.id ?? '')
    : ''
  const serviceCountsByTopNodeId = useMemo(() => {
    const counts = new Map<string, number>()

    businessAttributeTree.forEach((node) => {
      counts.set(node.id, 0)
    })

    items.forEach((item) => {
      if (!isCatalogResourceTypeMatch(item, 'service')) {
        return
      }

      const topNodeId = resolveBusinessAttributeTopNodeId(item, topCategoryLookup)
      if (!topNodeId || !counts.has(topNodeId)) {
        return
      }

      counts.set(topNodeId, (counts.get(topNodeId) ?? 0) + 1)
    })

    return counts
  }, [businessAttributeTree, items, topCategoryLookup])
  const totalServiceCount = useMemo(
    () => items.filter((item) => isCatalogResourceTypeMatch(item, 'service')).length,
    [items],
  )

  const serviceStatsRow = useMemo<OverviewMetricCardItem[]>(() => {
    return [
      {
        key: 'service',
        label: '总服务数量',
        value: totalServiceCount,
        unit: '个',
        delta: null,
        trend: [{ periodCode: 'current', value: totalServiceCount }],
        chartWidth: LIST_OVERVIEW_CHART_WIDTH,
        valueNode: buildServiceMetricValueNode(totalServiceCount, !activeTopNodeId),
        hideDeltaText: true,
        trendFooterText: null,
        onClick: onBusinessAttributeSelect ? () => onBusinessAttributeSelect('') : undefined,
        isActive: !activeTopNodeId,
      },
      ...businessAttributeTree.map((node) => ({
        key: `service-business-attribute-top-${node.id}`,
        label: node.label,
        value: serviceCountsByTopNodeId.get(node.id) ?? 0,
        unit: '个',
        delta: null,
        trend: [{ periodCode: 'current', value: serviceCountsByTopNodeId.get(node.id) ?? 0 }],
        chartWidth: LIST_OVERVIEW_CHART_WIDTH,
        valueNode: buildServiceMetricValueNode(serviceCountsByTopNodeId.get(node.id) ?? 0, activeTopNodeId === node.id),
        hideDeltaText: true,
        trendFooterText: null,
        onClick: onBusinessAttributeSelect ? () => onBusinessAttributeSelect(node.id) : undefined,
        isActive: activeTopNodeId === node.id,
      })),
    ]
  }, [activeTopNodeId, businessAttributeTree, onBusinessAttributeSelect, serviceCountsByTopNodeId, totalServiceCount])

  if (serviceStatsRow.length === 0) {
    return null
  }

  return (
    <section className="relative">
      <OverviewMetricCardsGrid items={serviceStatsRow} isLoading={false} />
    </section>
  )
}
