import { useMemo } from 'react'
import type { CatalogCategoryTreeNode } from '../lib/catalog-category-tree'
import { createTopCategoryLookup } from '../lib/catalog-category-tree'
import { getCatalogResourceTypeFilterId } from '../lib/catalog-resource-type'
import type { CatalogItem } from '../lib/nocobase-portal-data'
import {
  OverviewMetricCardsGrid,
  formatOverviewMetricValue,
  type OverviewMetricCardItem,
} from './primary-overview-cards'

const LIST_OVERVIEW_CHART_WIDTH = 118

function buildSourceMetricValueNode(sourceCount: number, isActive = false) {
  const valueToneClass = isActive
    ? 'text-[color-mix(in_srgb,var(--theme-accent-strong)_72%,white)] drop-shadow-[0_0_16px_rgba(var(--theme-soft-rgb),0.20)]'
    : 'text-[var(--theme-accent-strong)]'
  const unitToneClass = isActive
    ? 'text-[color-mix(in_srgb,var(--text-secondary)_62%,white_38%)]'
    : 'text-[var(--text-secondary)]'

  return (
    <>
      <span className={`text-[2.125rem] font-semibold leading-none ${valueToneClass}`}>
        {formatOverviewMetricValue(sourceCount)}
      </span>
      <span className={`pb-1 text-[0.75rem] ${unitToneClass}`}>个</span>
    </>
  )
}

function resolveSourceTopNodeId(
  item: Pick<CatalogItem, 'departmentId' | 'departmentAncestorIds'>,
  topCategoryLookup: ReturnType<typeof createTopCategoryLookup>,
) {
  const matchedByDepartmentId = topCategoryLookup.byId.get(item.departmentId)?.id
  if (matchedByDepartmentId) {
    return matchedByDepartmentId
  }

  return item.departmentAncestorIds
    .map((id) => topCategoryLookup.byId.get(id)?.id ?? '')
    .find(Boolean) ?? ''
}

export function CatalogSourceOverviewPanel({
  sourceTree,
  items,
  activeDepartmentNodeId = '',
  onDepartmentSelect,
}: {
  sourceTree: CatalogCategoryTreeNode[]
  items: CatalogItem[]
  activeDepartmentNodeId?: string
  onDepartmentSelect?: (departmentNodeId: string) => void
}) {
  const topCategoryLookup = useMemo(() => createTopCategoryLookup(sourceTree), [sourceTree])
  const activeTopNodeId = activeDepartmentNodeId
    ? (topCategoryLookup.byId.get(activeDepartmentNodeId)?.id ?? '')
    : ''
  const sourceCountsByTopNodeId = useMemo(() => {
    const counts = new Map<string, number>()

    sourceTree.forEach((node) => {
      counts.set(node.id, 0)
    })

    items.forEach((item) => {
      if (getCatalogResourceTypeFilterId(item) !== 'data-source') {
        return
      }

      const topNodeId = resolveSourceTopNodeId(item, topCategoryLookup)
      if (!topNodeId || !counts.has(topNodeId)) {
        return
      }

      counts.set(topNodeId, (counts.get(topNodeId) ?? 0) + 1)
    })

    return counts
  }, [items, sourceTree, topCategoryLookup])

  const sourceStatsRow = useMemo<OverviewMetricCardItem[]>(() => {
    return sourceTree.map((node) => ({
      key: `source-top-${node.id}`,
      label: node.label,
      value: sourceCountsByTopNodeId.get(node.id) ?? 0,
      unit: '个',
      delta: null,
      trend: [{ periodCode: 'current', value: sourceCountsByTopNodeId.get(node.id) ?? 0 }],
      chartWidth: LIST_OVERVIEW_CHART_WIDTH,
      valueNode: buildSourceMetricValueNode(sourceCountsByTopNodeId.get(node.id) ?? 0, activeTopNodeId === node.id),
      hideDeltaText: true,
      trendFooterText: null,
      onClick: onDepartmentSelect ? () => onDepartmentSelect(node.id) : undefined,
      isActive: activeTopNodeId === node.id,
    }))
  }, [activeTopNodeId, onDepartmentSelect, sourceCountsByTopNodeId, sourceTree])

  if (sourceStatsRow.length === 0) {
    return null
  }

  return (
    <section className="relative">
      <OverviewMetricCardsGrid items={sourceStatsRow} isLoading={false} />
    </section>
  )
}
