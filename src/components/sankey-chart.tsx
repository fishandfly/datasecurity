import { useMemo, useState } from 'react'
import {
  layoutSankey,
  type SankeyLinkSpec,
  type SankeyNodeSpec,
} from '../lib/sankey-layout'

function truncateLabel(label: string, maxLength: number) {
  return label.length > maxLength ? `${label.slice(0, Math.max(1, maxLength - 3))}...` : label
}

export function SankeyChart({
  nodes,
  links,
  width = 960,
  height = 340,
  selectedNodeId,
  onNodeSelect,
  onLinkSelect,
  emptyLabel = '当前时间窗口内没有可展示的流转数据',
}: {
  nodes: SankeyNodeSpec[]
  links: SankeyLinkSpec[]
  width?: number
  height?: number
  selectedNodeId?: string | null
  onNodeSelect?: (node: SankeyNodeSpec) => void
  onLinkSelect?: (link: SankeyLinkSpec) => void
  emptyLabel?: string
}) {
  const [hover, setHover] = useState<{ from: string; to: string; value: number; x: number; y: number } | null>(null)
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)
  const layout = useMemo(() => layoutSankey(nodes, links, width, height), [nodes, links, width, height])
  const labelById = useMemo(() => new Map(nodes.map((node) => [node.id, node.label])), [nodes])

  if (!layout.links.length) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-[14px] border border-dashed border-[var(--surface-outline)] bg-[var(--surface-muted)] px-4 text-center text-[0.8125rem] leading-6 text-[var(--text-muted)]">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label="桑基图"
        onMouseLeave={() => {
          setHover(null)
          setHoveredLink(null)
        }}
      >
        {layout.links.map((link, index) => {
          const linkKey = `${link.from}-${link.to}-${index}`
          const active = hoveredLink === linkKey
          return (
          <g key={linkKey}>
            <path
              d={link.path}
              fill="none"
              stroke={link.color}
              strokeOpacity={active ? 0.95 : 0.32}
              strokeWidth={active ? link.strokeWidth + 4 : link.strokeWidth}
              className="transition-all duration-150 ease-out"
            />
            {link.strokeWidth >= 3 ? (
              <path
                d={link.path}
                fill="none"
                stroke="#ffffff"
                strokeOpacity={active ? 0.95 : 0.45}
                strokeWidth={Math.max(1, (active ? link.strokeWidth + 2 : link.strokeWidth) * 0.35)}
                className={active ? 'sankey-flow' : ''}
              />
            ) : null}
            <path
              d={link.path}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(14, link.strokeWidth + 8)}
              className="cursor-pointer"
              onClick={() => onLinkSelect?.(link)}
              onMouseEnter={(event) => {
                setHoveredLink(linkKey)
                const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
                setHover({
                  from: labelById.get(link.from) ?? link.from,
                  to: labelById.get(link.to) ?? link.to,
                  value: link.value,
                  x: bounds ? event.clientX - bounds.left : 0,
                  y: bounds ? event.clientY - bounds.top : 0,
                })
              }}
              onMouseMove={(event) => {
                const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
                if (bounds) setHover((current) => (current ? { ...current, x: event.clientX - bounds.left, y: event.clientY - bounds.top } : current))
              }}
              onMouseLeave={() => setHoveredLink(null)}
            />
          </g>
          )
        })}
        {layout.nodes.map((node) => (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={5}
              fill={node.color}
              fillOpacity={0.88}
              stroke={selectedNodeId === node.id ? '#ffffff' : 'transparent'}
              strokeWidth={selectedNodeId === node.id ? 2 : 0}
              className="sankey-node-enter cursor-pointer transition-opacity hover:opacity-100"
              onClick={() => onNodeSelect?.(node)}
            >
              <title>{node.label}</title>
            </rect>
            <rect
              x={node.x - 4}
              y={node.y - 4}
              width={node.width + 8}
              height={node.height + 8}
              fill="transparent"
              className="cursor-pointer"
              onClick={() => onNodeSelect?.(node)}
            />
            <text
              x={node.x + node.width / 2}
              y={node.y + node.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              className="pointer-events-none fill-white"
              fontSize={11}
              style={{ fontWeight: 500 }}
            >
              {node.height >= 14 ? truncateLabel(node.label, Math.max(5, Math.floor((node.width - 8) / 10.5))) : ''}
            </text>
          </g>
        ))}
      </svg>
      {hover ? (
        <div
          className="pointer-events-none absolute z-10 rounded-[10px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-3 py-2 text-[0.75rem] leading-5 text-[var(--text-main)] shadow-[var(--shadow-medium)]"
          style={{ left: Math.min(hover.x + 10, width - 220), top: Math.max(0, hover.y - 12) }}
        >
          <div className="font-medium">{hover.from} → {hover.to}</div>
          <div className="text-[var(--text-secondary)]">流转 {hover.value}</div>
        </div>
      ) : null}
    </div>
  )
}
