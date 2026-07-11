import type { PeriodSummary, StatRecord } from './nocobase-stat-data.ts'

export type RunStatsTrendChartPoint = {
  x: number
  y: number
  value: number
}

export type RunStatsTrendChartScaleMode = 'range' | 'zero-baseline'

type RunStatsTrendChartBounds = {
  min: number
  max: number
}

export function resolveRunStatsTrendPeriodCodes(
  jobOptions: Array<{ periodCode: string }>,
  selectedPeriodCode: string,
  limit = 10,
) {
  const normalizedSelectedPeriodCode = String(selectedPeriodCode ?? '').trim()
  if (!normalizedSelectedPeriodCode) return []

  const orderedPeriodCodes = jobOptions
    .map((item) => String(item.periodCode ?? '').trim())
    .filter(Boolean)

  const selectedIndex = orderedPeriodCodes.findIndex((item) => item === normalizedSelectedPeriodCode)
  if (selectedIndex < 0) return [normalizedSelectedPeriodCode]

  return orderedPeriodCodes.slice(selectedIndex, selectedIndex + Math.max(limit, 0))
}

export function buildRunStatsTrendWindow(
  selectedSummary: PeriodSummary | undefined,
  candidateSummaries: PeriodSummary[],
  limit = 5,
) {
  if (!selectedSummary) return []

  const selectedPeriodCode = String(selectedSummary.periodCode ?? '').trim()
  if (!selectedPeriodCode) return []

  const summaryMap = new Map<string, PeriodSummary>()
  candidateSummaries.forEach((item) => {
    const periodCode = String(item.periodCode ?? '').trim()
    if (!periodCode || summaryMap.has(periodCode)) return
    summaryMap.set(periodCode, item)
  })
  summaryMap.set(selectedPeriodCode, selectedSummary)

  const ordered = Array.from(summaryMap.values())
    .sort((a, b) => a.periodCode.localeCompare(b.periodCode))

  const selectedIndex = ordered.findIndex((item) => item.periodCode === selectedPeriodCode)
  if (selectedIndex < 0) {
    return [selectedSummary]
  }

  const windowStart = Math.max(0, selectedIndex - Math.max(limit - 1, 0))
  return ordered.slice(windowStart, selectedIndex + 1)
}

export function buildRunStatsTrendSummariesFromRecords(
  records: Array<Pick<StatRecord, 'dayOnDay'>>,
  currentSummary?: PeriodSummary,
) {
  const bucket = new Map<
    string,
    {
      periodCode: string
      executedAt: string
      resources: number
      totalRecords: number
      totalStorageBytes: number
      totalFieldCount: number
    }
  >()

  records.forEach((record) => {
    record.dayOnDay.trend_30d?.points?.forEach((point, index) => {
      const periodCode = String(point.stat_period_code ?? '').trim()
        || (point.date ? `${point.date.replaceAll('-', '')}_${String(index + 1).padStart(3, '0')}` : '')
      if (!periodCode) return

      const current = bucket.get(periodCode) ?? {
        periodCode,
        executedAt: String(point.execute_time ?? '').trim(),
        resources: 0,
        totalRecords: 0,
        totalStorageBytes: 0,
        totalFieldCount: 0,
      }

      current.resources += 1
      current.totalRecords += Number(point.record_count ?? 0)
      current.totalStorageBytes += Number(point.storage_bytes ?? 0)
      current.totalFieldCount += Number(point.field_count ?? 0)
      if (String(point.execute_time ?? '').trim() > current.executedAt) {
        current.executedAt = String(point.execute_time ?? '').trim()
      }
      bucket.set(periodCode, current)
    })
  })

  const summaries = Array.from(bucket.values())
    .map((item) => ({
      periodCode: item.periodCode,
      executedAt: item.executedAt,
      resources: item.resources,
      totalRecords: item.totalRecords,
      totalStorageBytes: item.totalStorageBytes,
      avgFieldCount: item.resources > 0 ? item.totalFieldCount / item.resources : 0,
      normalCount: 0,
      warningCount: 0,
      errorCount: 0,
      freshResourceCount: 0,
      staleResourceCount: 0,
      missingBusinessTimeCount: 0,
      freshnessRate: 0,
    }))
    .sort((a, b) => a.periodCode.localeCompare(b.periodCode))

  if (summaries.length > 0) {
    return summaries
  }

  return currentSummary ? [currentSummary] : []
}

export function buildRunStatsTrendWindowFromJobOptions(
  periodSummaries: PeriodSummary[],
  jobOptions: Array<{ periodCode: string }>,
  selectedPeriodCode: string,
  limit = 10,
) {
  const normalizedSelectedPeriodCode = String(selectedPeriodCode ?? '').trim()
  if (!normalizedSelectedPeriodCode) return []

  const selectedSummary = periodSummaries.find((item) => item.periodCode === normalizedSelectedPeriodCode)
  if (!selectedSummary) return []

  const scopedPeriodCodes = resolveRunStatsTrendPeriodCodes(jobOptions, normalizedSelectedPeriodCode, limit)
  if (scopedPeriodCodes.length === 0) {
    return buildRunStatsTrendWindow(selectedSummary, periodSummaries, limit)
  }

  const scopedPeriodCodeSet = new Set(scopedPeriodCodes)
  const scopedSummaries = periodSummaries.filter((item) => scopedPeriodCodeSet.has(item.periodCode))

  return buildRunStatsTrendWindow(selectedSummary, scopedSummaries, limit)
}

export function resolveRunStatsTrendChartBounds(
  values: number[],
  options?: { scaleMode?: RunStatsTrendChartScaleMode },
): RunStatsTrendChartBounds {
  if (values.length === 0) {
    return {
      min: 0,
      max: 1,
    }
  }

  const scaleMode = options?.scaleMode ?? 'range'
  const dataMax = Math.max(...values)
  const dataMin = Math.min(...values)

  if (dataMax === dataMin) {
    const padding = Math.max(Math.abs(dataMax) * 0.02, 1)
    return {
      min: dataMin - padding,
      max: dataMax + padding,
    }
  }

  if (scaleMode === 'zero-baseline') {
    const baseMin = Math.min(dataMin, 0)
    const baseMax = Math.max(dataMax, 0)
    const range = baseMax - baseMin
    const padding = Math.max(range * 0.08, 1)

    return {
      min: baseMin - padding * 0.25,
      max: baseMax + padding * 0.25,
    }
  }

  const range = dataMax - dataMin
  const padding = Math.max(range * 0.12, 1)
  const min = dataMin >= 0 ? Math.max(0, dataMin - padding) : dataMin - padding

  return {
    min,
    max: dataMax + padding,
  }
}

export function buildRunStatsTrendChartPoints(
  values: number[],
  width: number,
  height: number,
  options?: { scaleMode?: RunStatsTrendChartScaleMode },
): RunStatsTrendChartPoint[] {
  if (values.length === 0) return []

  const xStep = values.length > 1 ? width / (values.length - 1) : 0
  const bounds = resolveRunStatsTrendChartBounds(values, options)
  const chartRange = Math.max(bounds.max - bounds.min, 1)

  return values.map((value, index) => {
    const x = values.length > 1 ? index * xStep : width / 2
    const ratio = (value - bounds.min) / chartRange
    const y = height - ratio * height

    return {
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      value,
    }
  })
}
