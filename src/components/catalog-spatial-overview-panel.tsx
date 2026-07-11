import { useMemo } from 'react'
import type { CatalogMapPreviewLayerKind, CatalogItem } from '../lib/nocobase-portal-data'
import { getCatalogResourceTypeFilterId } from '../lib/catalog-resource-type'
import { getSpatialLayerKindLabel } from '../lib/catalog-spatial-resource'
import {
  OverviewMetricCardsGrid,
  formatOverviewMetricValue,
  type OverviewMetricCardItem,
} from './primary-overview-cards'

const LIST_OVERVIEW_CHART_WIDTH = 118

function buildSpatialMetricValueNode(resourceCount: number, isActive = false) {
  const valueToneClass = isActive
    ? 'text-[color-mix(in_srgb,var(--theme-accent-strong)_72%,white)] drop-shadow-[0_0_16px_rgba(var(--theme-soft-rgb),0.20)]'
    : 'text-[var(--theme-accent-strong)]'
  const unitToneClass = isActive
    ? 'text-[color-mix(in_srgb,var(--text-secondary)_62%,white_38%)]'
    : 'text-[var(--text-secondary)]'

  return (
    <>
      <span className={`text-[2.125rem] font-semibold leading-none ${valueToneClass}`}>
        {formatOverviewMetricValue(resourceCount)}
      </span>
      <span className={`pb-1 text-[0.75rem] ${unitToneClass}`}>个</span>
    </>
  )
}

const SPATIAL_LAYER_KINDS: Array<{ id: CatalogMapPreviewLayerKind; label: string }> = [
  { id: 'tile', label: getSpatialLayerKindLabel('tile') },
  { id: 'map-image', label: getSpatialLayerKindLabel('map-image') },
  { id: 'feature', label: getSpatialLayerKindLabel('feature') },
  { id: 'scene', label: getSpatialLayerKindLabel('scene') },
  { id: 'amap', label: getSpatialLayerKindLabel('amap') },
]

export function CatalogSpatialOverviewPanel({
  items,
  activeLayerKind = '',
  onLayerKindSelect,
}: {
  items: CatalogItem[]
  activeLayerKind?: string
  onLayerKindSelect?: (layerKind: CatalogMapPreviewLayerKind) => void
}) {
  const countsByLayerKind = useMemo(() => {
    const counts = new Map<CatalogMapPreviewLayerKind, number>()

    SPATIAL_LAYER_KINDS.forEach((item) => {
      counts.set(item.id, 0)
    })

    items.forEach((item) => {
      if (getCatalogResourceTypeFilterId(item) !== 'spatial-resource' || !item.mapPreview) {
        return
      }

      counts.set(item.mapPreview.layerKind, (counts.get(item.mapPreview.layerKind) ?? 0) + 1)
    })

    return counts
  }, [items])

  const spatialStatsRow = useMemo<OverviewMetricCardItem[]>(
    () => SPATIAL_LAYER_KINDS.map((item) => ({
      key: `spatial-layer-kind-${item.id}`,
      label: item.label,
      value: countsByLayerKind.get(item.id) ?? 0,
      unit: '个',
      delta: null,
      trend: [{ periodCode: 'current', value: countsByLayerKind.get(item.id) ?? 0 }],
      chartWidth: LIST_OVERVIEW_CHART_WIDTH,
      valueNode: buildSpatialMetricValueNode(countsByLayerKind.get(item.id) ?? 0, activeLayerKind === item.id),
      hideDeltaText: true,
      trendFooterText: null,
      onClick: onLayerKindSelect ? () => onLayerKindSelect(item.id) : undefined,
      isActive: activeLayerKind === item.id,
    })),
    [activeLayerKind, countsByLayerKind, onLayerKindSelect],
  )

  if (spatialStatsRow.length === 0) {
    return null
  }

  return (
    <section className="relative">
      <OverviewMetricCardsGrid items={spatialStatsRow} isLoading={false} />
    </section>
  )
}
