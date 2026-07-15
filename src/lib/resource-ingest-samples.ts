import { useCallback, useEffect, useState } from 'react'
import { toErrorMessage } from './nocobase-client'
import { fetchResourceLatestRows, type ResourceLatestRows } from './security-runtime-client'

export function useResourceIngestSamples(resourceId: string | undefined, enabled = true) {
  const [data, setData] = useState<ResourceLatestRows | null>(null)
  const [isLoading, setIsLoading] = useState(enabled && Boolean(resourceId))
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!enabled || !resourceId) {
      setData(null)
      setError('')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError('')
    try {
      setData(await fetchResourceLatestRows(resourceId))
    } catch (currentError) {
      setData(null)
      setError(toErrorMessage(currentError, '读取接入抽样失败'))
    } finally {
      setIsLoading(false)
    }
  }, [enabled, resourceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, isLoading, error, refresh }
}
