import { useCallback, useEffect, useState } from 'react'
import { SecuritySankeyCard } from './security-sankey-card'
import {
  buildResourceRealtimeMonitorData,
  fetchRealtimeMonitorData,
  type RealtimeMonitorData,
} from '../lib/security-realtime-monitor'
import { toErrorMessage } from '../lib/nocobase-client'

export function ResourceSecuritySankey({ resourceId }: { resourceId: string }) {
  const [data, setData] = useState<RealtimeMonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const monitorData = await fetchRealtimeMonitorData(24)
      setData(buildResourceRealtimeMonitorData(monitorData, resourceId, 24))
    } catch (currentError) {
      setError(toErrorMessage(currentError, '当前资源分层策略流转读取失败'))
    } finally {
      setLoading(false)
    }
  }, [resourceId])

  useEffect(() => { void refresh() }, [refresh])

  if (loading && !data) {
    return <div className="py-10 text-center text-[0.8125rem] text-[var(--text-muted)]">正在加载当前资源分层策略流转...</div>
  }
  if (error && !data) {
    return <div className="rounded-[12px] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-4 text-[0.8125rem] text-[var(--status-danger-text)]">{error}</div>
  }

  const graph = data?.graphs.find((item) => item.id === 'flow')
  if (!graph || !data) {
    return <div className="py-10 text-center text-[0.8125rem] text-[var(--text-muted)]">当前资源暂无可展示的分层策略流转。</div>
  }

  return <SecuritySankeyCard graph={graph} index={0} collections={data.collections} />
}
