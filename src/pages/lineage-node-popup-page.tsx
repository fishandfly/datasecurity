import { AppWindow, Database, HardDrive, Layers3, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, ScenicPanel, TopicPill } from '../components/ui'
import { parseLineageNodePopupPayload } from '../lib/lineage-node-popup'
import type { CatalogLineageNodeType } from '../lib/nocobase-portal-data'

const NODE_TYPE_LABEL: Record<CatalogLineageNodeType, string> = {
  data_source: '数据源',
  warehouse_resource: '数据资源',
  warehouse_layer: '仓库分层',
  data_api: '数据API',
  unknown: '血缘节点',
}

function getNodeIcon(nodeType: CatalogLineageNodeType): LucideIcon {
  if (nodeType === 'data_source') return HardDrive
  if (nodeType === 'data_api') return AppWindow
  if (nodeType === 'warehouse_layer') return Layers3
  return Database
}

export function LineageNodePopupPage() {
  const [searchParams] = useSearchParams()
  const payload = useMemo(
    () => parseLineageNodePopupPayload(searchParams.get('payload')),
    [searchParams],
  )

  if (!payload) {
    return (
      <div className="space-y-6">
        <ScenicPanel className="px-6 py-8">
          <div className="text-[0.875rem] text-[var(--text-secondary)]">当前节点详情参数无效，无法展示详情。</div>
        </ScenicPanel>
      </div>
    )
  }

  const Icon = getNodeIcon(payload.nodeType)

  return (
    <div className="space-y-6">
      <ScenicPanel className="px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary-soft)_82%,white)] text-[var(--primary)]">
                <Icon className="h-5 w-5" />
              </span>
              <Badge>{NODE_TYPE_LABEL[payload.nodeType]}</Badge>
            </div>
            <h1 className="mt-4 text-[1.75rem] font-semibold leading-[1.3] text-[#203346]">{payload.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              {payload.level ? <TopicPill>{payload.level}</TopicPill> : null}
              {payload.resourceCode ? <TopicPill>编码：{payload.resourceCode}</TopicPill> : null}
              {payload.ownerName ? <TopicPill>归属：{payload.ownerName}</TopicPill> : null}
            </div>
          </div>
        </div>
      </ScenicPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['节点类型', NODE_TYPE_LABEL[payload.nodeType]],
          ['层次', payload.level || '未标注'],
          ['物理表数量', `${payload.tableCount} 张`],
          ['资源编码', payload.resourceCode || '未标注'],
        ].map(([title, value]) => (
          <div
            key={title}
            className="rounded-[12px] border border-[rgba(214,228,239,0.92)] bg-[linear-gradient(180deg,#ffffff,#f7fbff)] px-4 py-4 shadow-[0_10px_22px_rgba(39,80,120,0.05)]"
          >
            <div className="text-[0.75rem] text-[var(--text-muted)]">{title}</div>
            <div className="mt-2 text-[1.125rem] font-semibold text-[#244056]">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[12px] border border-[rgba(214,228,239,0.92)] bg-white px-5 py-4 shadow-[0_10px_22px_rgba(39,80,120,0.05)]">
          <div className="text-[0.9375rem] font-semibold text-[#2c4862]">直接上游</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {payload.upstream.length > 0 ? (
              payload.upstream.map((node) => (
                <TopicPill key={`upstream-${node.id}`}>{NODE_TYPE_LABEL[node.nodeType]} · {node.name}</TopicPill>
              ))
            ) : (
              <span className="text-[0.8125rem] text-[var(--text-muted)]">当前节点没有直接上游。</span>
            )}
          </div>
        </div>

        <div className="rounded-[12px] border border-[rgba(214,228,239,0.92)] bg-white px-5 py-4 shadow-[0_10px_22px_rgba(39,80,120,0.05)]">
          <div className="text-[0.9375rem] font-semibold text-[#2c4862]">直接下游</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {payload.downstream.length > 0 ? (
              payload.downstream.map((node) => (
                <TopicPill key={`downstream-${node.id}`}>{NODE_TYPE_LABEL[node.nodeType]} · {node.name}</TopicPill>
              ))
            ) : (
              <span className="text-[0.8125rem] text-[var(--text-muted)]">当前节点没有直接下游。</span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[12px] border border-[rgba(214,228,239,0.92)] bg-white px-5 py-4 shadow-[0_10px_22px_rgba(39,80,120,0.05)]">
        <div className="text-[0.9375rem] font-semibold text-[#2c4862]">物理表信息</div>
        {payload.tables.length > 0 ? (
          <div className="mt-4 space-y-3">
            {payload.tables.map((table, index) => (
              <div
                key={`${table.tableName || 'table'}-${index}`}
                className="rounded-[10px] border border-[rgba(221,232,242,0.96)] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-4 py-3"
              >
                <div className="text-[0.875rem] font-semibold text-[#28455f]">{table.tableName || '未标注物理表名'}</div>
                <div className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">{table.description || '暂无说明'}</div>
                {table.rawLayer ? <div className="mt-2 text-[0.75rem] text-[var(--text-muted)]">{table.rawLayer}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 text-[0.8125rem] text-[var(--text-muted)]">当前节点未维护物理表清单。</div>
        )}
      </div>
    </div>
  )
}
