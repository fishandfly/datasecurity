import { useState } from 'react'
import { Radar } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SankeyChart } from './sankey-chart'
import { SankeyDetailPanel } from './sankey-detail-panel'
import type {
  RealtimeMonitorCollections,
  RealtimeSankeyGraph,
} from '../lib/security-realtime-monitor'
import type { SankeyLinkSpec, SankeyNodeSpec } from '../lib/sankey-layout'

export function resolveDetailRows(node: SankeyNodeSpec | null, collections: RealtimeMonitorCollections) {
  if (!node?.detail) return null
  const records = collections[node.detail.collection] ?? []
  const rows = records
    .filter((record) => node.detail!.filter(record, node.id))
    .map((record) => (node.detail!.transform ? node.detail!.transform(record, node.id) : record))
  return { title: node.detail.title, columns: node.detail.columns, rows }
}

export function resolveLinkDetailRows(link: SankeyLinkSpec | null, collections: RealtimeMonitorCollections) {
  if (!link?.detail) return null
  const records = collections[link.detail.collection] ?? []
  const rows = records
    .filter((record) => link.detail!.filter(record, ''))
    .map((record) => (link.detail!.transform ? link.detail!.transform(record, '') : record))
  return { title: link.detail.title, columns: link.detail.columns, rows }
}

export function SecuritySankeyCard({
  graph,
  index,
  collections,
  width = 1320,
  height = 580,
}: {
  graph: RealtimeSankeyGraph
  index: number
  collections: RealtimeMonitorCollections
  width?: number
  height?: number
}) {
  const [selectedNode, setSelectedNode] = useState<SankeyNodeSpec | null>(null)
  const [selectedLink, setSelectedLink] = useState<SankeyLinkSpec | null>(null)
  const navigate = useNavigate()
  const detail = resolveDetailRows(selectedNode, collections)
  const linkDetail = resolveLinkDetailRows(selectedLink, collections)
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--surface-raised)] text-[var(--primary)] shadow-[var(--shadow-soft)]">
          <Radar className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-[0.9375rem] font-semibold text-[var(--text-main)]">{graph.title}</h3>
          <p className="mt-0.5 text-[0.75rem] leading-5 text-[var(--text-muted)]">{graph.description}</p>
        </div>
      </div>
      <SankeyChart
        key={`${graph.id}-${index}`}
        nodes={graph.nodes}
        links={graph.links}
        width={width}
        height={height}
        selectedNodeId={selectedNode?.id}
        onNodeSelect={(node) => {
          if (node.href) {
            navigate(node.href)
            return
          }
          setSelectedNode(node)
          setSelectedLink(null)
        }}
        onLinkSelect={(link) => {
          setSelectedLink(link)
          setSelectedNode(null)
        }}
      />
      <SankeyDetailPanel
        title={linkDetail?.title ?? detail?.title ?? '节点明细'}
        columns={linkDetail?.columns ?? detail?.columns ?? []}
        rows={linkDetail?.rows ?? detail?.rows ?? []}
        selectedLabel={selectedLink ? `${selectedLink.from} → ${selectedLink.to}` : selectedNode?.label ?? ''}
      />
    </div>
  )
}
