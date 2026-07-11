import { useId } from 'react'

type DiagramTone = 'source' | 'resource' | 'current' | 'api' | 'unknown'
type DiagramNodeKind = 'top' | 'column' | 'body' | 'bottom'

type DiagramNode = {
  id: string
  kind: DiagramNodeKind
  x: number
  y: number
  width: number
  height: number
  tone: DiagramTone
  lines: string[]
  eyebrow?: string
}

type DiagramEdge = {
  from: string
  to: string
  emphasize?: boolean
  straight?: boolean
}

const DIAGRAM_WIDTH = 1448
const DIAGRAM_HEIGHT = 760

const laneRects = [
  { id: 'lane-source', x: 120, y: 176, width: 216, height: 410 },
  { id: 'lane-governance', x: 368, y: 176, width: 216, height: 410 },
  { id: 'lane-security', x: 616, y: 176, width: 216, height: 410 },
  { id: 'lane-application', x: 864, y: 176, width: 216, height: 410 },
  { id: 'lane-sharing', x: 1112, y: 176, width: 216, height: 410 },
] as const

const nodes: DiagramNode[] = [
  {
    id: 'ledger-unified',
    kind: 'top',
    x: 724,
    y: 66,
    width: 1208,
    height: 64,
    tone: 'resource',
    lines: ['数据来源一本账', '数据资源一本账', '安全策略一本账', '应用访问一本账', '数据需求一本账', '数据共享一本账'],
  },
  {
    id: 'col-source',
    kind: 'column',
    x: 228,
    y: 148,
    width: 186,
    height: 48,
    tone: 'source',
    lines: ['数据统一接入'],
  },
  {
    id: 'col-governance',
    kind: 'column',
    x: 476,
    y: 148,
    width: 186,
    height: 48,
    tone: 'resource',
    lines: ['数据资源管控'],
  },
  {
    id: 'col-security',
    kind: 'column',
    x: 724,
    y: 148,
    width: 186,
    height: 48,
    tone: 'current',
    lines: ['数据安全管控'],
  },
  {
    id: 'col-application',
    kind: 'column',
    x: 972,
    y: 148,
    width: 186,
    height: 48,
    tone: 'api',
    lines: ['数据应用管控'],
  },
  {
    id: 'col-sharing',
    kind: 'column',
    x: 1220,
    y: 148,
    width: 186,
    height: 48,
    tone: 'unknown',
    lines: ['数据共享管控'],
  },
  {
    id: 'source-warehouse',
    kind: 'body',
    x: 228,
    y: 268,
    width: 186,
    height: 64,
    tone: 'source',
    lines: ['数据仓库'],
  },
  {
    id: 'source-middle-platform',
    kind: 'body',
    x: 228,
    y: 374,
    width: 186,
    height: 64,
    tone: 'source',
    lines: ['数据中台'],
  },
  {
    id: 'source-application-system',
    kind: 'body',
    x: 228,
    y: 480,
    width: 186,
    height: 64,
    tone: 'source',
    lines: ['应用系统'],
  },
  {
    id: 'governance-source',
    kind: 'body',
    x: 476,
    y: 268,
    width: 186,
    height: 64,
    tone: 'resource',
    lines: ['数据统一接入'],
  },
  {
    id: 'governance-catalog',
    kind: 'body',
    x: 476,
    y: 374,
    width: 186,
    height: 64,
    tone: 'resource',
    lines: ['数据资源目录'],
  },
  {
    id: 'governance-api',
    kind: 'body',
    x: 476,
    y: 480,
    width: 186,
    height: 64,
    tone: 'api',
    lines: ['数据API'],
  },
  {
    id: 'security-classification',
    kind: 'body',
    x: 724,
    y: 268,
    width: 186,
    height: 64,
    tone: 'current',
    lines: ['分类分级'],
  },
  {
    id: 'security-access',
    kind: 'body',
    x: 724,
    y: 374,
    width: 186,
    height: 64,
    tone: 'current',
    lines: ['访问策略'],
  },
  {
    id: 'security-sharing',
    kind: 'body',
    x: 724,
    y: 480,
    width: 186,
    height: 64,
    tone: 'current',
    lines: ['共享策略'],
  },
  {
    id: 'application-manage',
    kind: 'body',
    x: 972,
    y: 268,
    width: 186,
    height: 64,
    tone: 'api',
    lines: ['应用管理'],
  },
  {
    id: 'application-demand',
    kind: 'body',
    x: 972,
    y: 374,
    width: 186,
    height: 64,
    tone: 'api',
    lines: ['应用需求'],
  },
  {
    id: 'application-external-demand',
    kind: 'body',
    x: 972,
    y: 480,
    width: 186,
    height: 64,
    tone: 'api',
    lines: ['外部需求'],
  },
  {
    id: 'sharing-same-domain',
    kind: 'body',
    x: 1220,
    y: 268,
    width: 186,
    height: 64,
    tone: 'unknown',
    lines: ['同域访问'],
  },
  {
    id: 'sharing-cross-domain',
    kind: 'body',
    x: 1220,
    y: 374,
    width: 186,
    height: 64,
    tone: 'unknown',
    lines: ['跨域访问'],
  },
  {
    id: 'sharing-homomorphic-encryption',
    kind: 'body',
    x: 1220,
    y: 480,
    width: 186,
    height: 64,
    tone: 'unknown',
    lines: ['同态加密'],
  },
  {
    id: 'unified-stats',
    kind: 'bottom',
    x: 724,
    y: 690,
    width: 1208,
    height: 82,
    tone: 'current',
    lines: ['数据管控统一运行统计分析'],
  },
] satisfies DiagramNode[]

const edges: DiagramEdge[] = [
  { from: 'ledger-unified', to: 'col-source', straight: true },
  { from: 'ledger-unified', to: 'col-governance', straight: true },
  { from: 'ledger-unified', to: 'col-security', straight: true },
  { from: 'ledger-unified', to: 'col-application', straight: true },
  { from: 'ledger-unified', to: 'col-sharing', straight: true },
  { from: 'source-warehouse', to: 'governance-source', emphasize: true },
  { from: 'source-middle-platform', to: 'governance-source', emphasize: true },
  { from: 'source-middle-platform', to: 'governance-catalog', emphasize: true },
  { from: 'source-application-system', to: 'governance-catalog' },
  { from: 'governance-source', to: 'governance-catalog' },
  { from: 'governance-catalog', to: 'governance-api' },
  { from: 'governance-catalog', to: 'security-classification' },
  { from: 'governance-catalog', to: 'security-access', emphasize: true },
  { from: 'governance-catalog', to: 'security-sharing' },
  { from: 'governance-api', to: 'security-access', emphasize: true },
  { from: 'security-classification', to: 'security-access' },
  { from: 'security-access', to: 'security-sharing' },
  { from: 'security-access', to: 'application-manage', emphasize: true },
  { from: 'security-access', to: 'application-demand', emphasize: true },
  { from: 'security-sharing', to: 'application-external-demand', emphasize: true },
  { from: 'application-manage', to: 'application-demand' },
  { from: 'application-demand', to: 'application-external-demand' },
  { from: 'application-manage', to: 'sharing-same-domain', emphasize: true },
  { from: 'application-demand', to: 'sharing-cross-domain', emphasize: true },
  { from: 'application-external-demand', to: 'sharing-homomorphic-encryption', emphasize: true },
  { from: 'sharing-same-domain', to: 'sharing-cross-domain' },
  { from: 'sharing-cross-domain', to: 'sharing-homomorphic-encryption' },
  { from: 'col-source', to: 'unified-stats', straight: true },
  { from: 'col-governance', to: 'unified-stats', straight: true },
  { from: 'col-security', to: 'unified-stats', straight: true },
  { from: 'col-application', to: 'unified-stats', straight: true },
  { from: 'col-sharing', to: 'unified-stats', straight: true },
] satisfies DiagramEdge[]

function getGradientId(prefix: string, tone: DiagramTone) {
  return `${prefix}-${tone}`
}

function buildHorizontalEdgePath(from: DiagramNode, to: DiagramNode) {
  const leftToRight = to.x >= from.x
  const startX = from.x + (leftToRight ? from.width / 2 - 4 : -from.width / 2 + 4)
  const endX = to.x + (leftToRight ? -to.width / 2 + 4 : to.width / 2 - 4)
  const bend = Math.max(72, Math.abs(endX - startX) * 0.28)

  return `M ${startX} ${from.y} C ${startX + (leftToRight ? bend : -bend)} ${from.y} ${endX - (leftToRight ? bend : -bend)} ${to.y} ${endX} ${to.y}`
}

function buildVerticalEdgePath(from: DiagramNode, to: DiagramNode) {
  const downward = from.y <= to.y
  const lineX = from.kind === 'top' ? to.x : from.x
  const startY = downward ? from.y + from.height / 2 - 4 : from.y - from.height / 2 + 4
  const endY = downward ? to.y - to.height / 2 + 4 : to.y + to.height / 2 - 4
  return `M ${lineX} ${startY} L ${lineX} ${endY}`
}

function getEdgePath(edge: DiagramEdge, from: DiagramNode, to: DiagramNode) {
  if (edge.straight) {
    return buildVerticalEdgePath(from, to)
  }

  if (Math.abs(from.x - to.x) < 12) {
    return buildVerticalEdgePath(from, to)
  }

  return buildHorizontalEdgePath(from, to)
}

function getNodeRadius(node: DiagramNode) {
  if (node.kind === 'top') return 22
  if (node.kind === 'bottom') return 28
  if (node.kind === 'column') return 18
  return 20
}

function getNodeStrokeWidth(node: DiagramNode) {
  if (node.kind === 'top' || node.kind === 'bottom') return 1.6
  if (node.kind === 'column') return 1.4
  return 1.2
}

function getNodeFontSize(node: DiagramNode) {
  if (node.kind === 'top') return 20
  if (node.kind === 'bottom') return 22
  if (node.kind === 'column') return 16
  return 16
}

export function HomeArchitectureDiagram() {
  const prefix = useId().replace(/:/g, '')
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const))

  return (
    <section className="space-y-4">
      <div className="overflow-hidden">
        <svg
          viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
          className="h-auto w-full bg-[radial-gradient(circle_at_16%_16%,var(--lineage-canvas-orb-a),transparent_38%),radial-gradient(circle_at_84%_22%,var(--lineage-canvas-orb-b),transparent_40%),linear-gradient(180deg,var(--lineage-canvas-bg-start),var(--lineage-canvas-bg-end))]"
          role="img"
          aria-label="首页平台总体架构示意图"
        >
          <defs>
            <pattern id={`${prefix}-grid`} width="26" height="26" patternUnits="userSpaceOnUse">
              <path d="M 26 0 L 0 0 0 26" fill="none" stroke="var(--lineage-canvas-grid)" strokeWidth="1" />
            </pattern>
            <filter id={`${prefix}-glow`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0
                        0 1 0 0 0
                        0 0 1 0 0
                        0 0 0 0.52 0"
              />
            </filter>
            <linearGradient id={getGradientId(prefix, 'source')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-node-source-start)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-node-source-end)' }} />
            </linearGradient>
            <linearGradient id={getGradientId(prefix, 'resource')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-node-resource-start)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-node-resource-end)' }} />
            </linearGradient>
            <linearGradient id={getGradientId(prefix, 'current')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-node-current-start)' }} />
              <stop offset="42%" style={{ stopColor: 'var(--lineage-node-current-mid)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-node-current-end)' }} />
            </linearGradient>
            <linearGradient id={getGradientId(prefix, 'api')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-node-api-start)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-node-api-end)' }} />
            </linearGradient>
            <linearGradient id={getGradientId(prefix, 'unknown')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-node-unknown-start)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-node-unknown-end)' }} />
            </linearGradient>
            <linearGradient id={`${prefix}-flow`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'var(--lineage-edge-flow-start)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--lineage-edge-flow-end)' }} />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={DIAGRAM_WIDTH} height={DIAGRAM_HEIGHT} fill={`url(#${prefix}-grid)`} opacity="0.12" />

          {laneRects.map((lane) => (
            <g key={lane.id}>
              <rect
                x={lane.x}
                y={lane.y}
                width={lane.width}
                height={lane.height}
                rx="26"
                fill="rgba(6,25,45,0.16)"
                stroke="rgba(188,222,255,0.12)"
                strokeWidth="1"
              />
              <rect
                x={lane.x + 10}
                y={lane.y + 10}
                width={lane.width - 20}
                height={lane.height - 20}
                rx="20"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="6 8"
              />
            </g>
          ))}

          {edges.map((edge, index) => {
            const fromNode = nodeMap.get(edge.from)
            const toNode = nodeMap.get(edge.to)
            if (!fromNode || !toNode) return null

            const pathId = `${prefix}-edge-${index}`
            const path = getEdgePath(edge, fromNode, toNode)
            const trackWidth = edge.emphasize ? 6 : 5
            const flowWidth = edge.emphasize ? 3.4 : 2.8

            return (
              <g key={pathId}>
                <path d={path} fill="none" stroke="var(--lineage-edge-track)" strokeWidth={trackWidth} strokeLinecap="round" />
                <path
                  id={pathId}
                  d={path}
                  fill="none"
                  stroke={`url(#${prefix}-flow)`}
                  strokeWidth={flowWidth}
                  strokeLinecap="round"
                  strokeDasharray={edge.emphasize ? '12 8' : '10 8'}
                  filter={`url(#${prefix}-glow)`}
                >
                  <animate attributeName="stroke-dashoffset" from="0" to="-72" dur={`${3.1 + index * 0.16}s`} repeatCount="indefinite" />
                </path>
                <circle r={edge.emphasize ? '4.1' : '3.6'} fill="var(--lineage-edge-dot)" filter={`url(#${prefix}-glow)`}>
                  <animateMotion dur={`${2.2 + index * 0.14}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                </circle>
              </g>
            )
          })}

          {nodes.map((node) => {
            const left = node.x - node.width / 2
            const top = node.y - node.height / 2
            const radius = getNodeRadius(node)
            const fontSize = getNodeFontSize(node)
            const eyebrowHeight = node.eyebrow ? 18 : 0
            const isTopLedgerNode = node.id === 'ledger-unified'

            return (
              <g key={node.id}>
                <rect
                  x={left}
                  y={top}
                  width={node.width}
                  height={node.height}
                  rx={radius}
                  fill={`url(#${getGradientId(prefix, node.tone)})`}
                  stroke={
                    node.kind === 'top' || node.kind === 'bottom'
                      ? 'var(--lineage-node-stroke-current)'
                      : node.kind === 'column'
                        ? 'var(--lineage-node-stroke-strong)'
                        : 'var(--lineage-node-stroke)'
                  }
                  strokeWidth={getNodeStrokeWidth(node)}
                />
                <rect
                  x={left + 6}
                  y={top + 6}
                  width={node.width - 12}
                  height={node.height - 12}
                  rx={Math.max(12, radius - 6)}
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="1"
                />
                <foreignObject x={left + 10} y={top + 10} width={node.width - 20} height={node.height - 20}>
                  {isTopLedgerNode ? (
                    <div
                      style={{
                        display: 'grid',
                        height: '100%',
                        width: '100%',
                        gridTemplateColumns: '1.15fr 0.85fr',
                        gap: '18px',
                        alignItems: 'center',
                        padding: '2px 10px',
                        color: 'var(--lineage-node-title)',
                        fontFamily: 'inherit',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          minWidth: 0,
                          alignItems: 'center',
                          gap: '12px',
                          borderRight: '1px solid rgba(112, 163, 224, 0.36)',
                          paddingRight: '18px',
                        }}
                      >
                        <div
                          style={{
                            flexShrink: 0,
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '0.12em',
                            color: 'var(--lineage-node-meta)',
                          }}
                        >
                          供给
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            minWidth: 0,
                            flexWrap: 'wrap',
                            gap: '8px 10px',
                            alignItems: 'center',
                            fontSize: '16px',
                            fontWeight: 800,
                            lineHeight: '1.25',
                          }}
                        >
                          {node.lines.slice(0, 3).map((line) => (
                            <span key={line}>{line}</span>
                          ))}
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          minWidth: 0,
                          alignItems: 'center',
                          gap: '12px',
                          paddingLeft: '4px',
                        }}
                      >
                        <div
                          style={{
                            flexShrink: 0,
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '0.12em',
                            color: 'var(--lineage-node-meta)',
                          }}
                        >
                          需求
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            minWidth: 0,
                            flexWrap: 'wrap',
                            gap: '8px 10px',
                            alignItems: 'center',
                            fontSize: '16px',
                            fontWeight: 800,
                            lineHeight: '1.25',
                          }}
                        >
                          {node.lines.slice(3).map((line) => (
                            <span key={line}>{line}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        height: '100%',
                        width: '100%',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px 8px',
                        textAlign: 'center',
                        color: 'var(--lineage-node-title)',
                        fontFamily: 'inherit',
                      }}
                    >
                      {node.eyebrow ? (
                        <div
                          style={{
                            marginBottom: '6px',
                            minHeight: `${eyebrowHeight}px`,
                            fontSize: '11px',
                            lineHeight: '1.2',
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: 'rgba(236,246,255,0.72)',
                          }}
                        >
                          {node.eyebrow}
                        </div>
                      ) : null}
                      {node.lines.map((line, index) => (
                        <div
                          key={`${node.id}-${index}`}
                          style={{
                            fontSize: `${fontSize}px`,
                            fontWeight: node.kind === 'column' ? 700 : 800,
                            lineHeight: '1.3',
                            letterSpacing: node.kind === 'top' || node.kind === 'bottom' ? '0.02em' : '0.01em',
                            color: 'var(--lineage-node-title)',
                          }}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </foreignObject>
              </g>
            )
          })}
        </svg>
      </div>
    </section>
  )
}
