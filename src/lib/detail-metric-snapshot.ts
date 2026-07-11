type DetailMetricSnapshotInput = {
  fallbackCount: string
  fallbackUpdateCycle: string
  department: string
  serviceSummary: string
  latestRecord?: {
    resourceName?: string | null
    resourceCode?: string | null
    metainfo?: {
      record_count?: number | string | null
      last_record_update_time?: string | null
      business_time_field_name?: string | null
      business_time_status?: string | null
      business_time_field_description?: string | null
      business_time_trace_summary?: string | null
    } | null
  } | null
}

type SourceMetricFallbackLineageNode = {
  id?: string | null
  nodeType?: string | null
}

type SourceMetricFallbackRecord = {
  resourceId: string
  resourceName?: string | null
  resourceCode?: string | null
  metainfo?: {
    record_count?: number | string | null
    last_record_update_time?: string | null
    business_time_field_name?: string | null
    business_time_field_description?: string | null
  } | null
}

export type DetailMetricSnapshot = {
  countText: string
  updateTimeText: string
  updateCycleText: string
  updateBadgeText: string
  serviceNoteText: string
}

const MIN_REASONABLE_BUSINESS_YEAR = 1900
const MAX_REASONABLE_FUTURE_YEAR_OFFSET = 1

function normalizeNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }
  return null
}

function buildDatePartsFromMatch(match: RegExpMatchArray) {
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4] ?? '0')
  const minute = Number(match[5] ?? '0')
  const second = Number(match[6] ?? '0')
  const date = new Date(year, month - 1, day, hour, minute, second)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null
  }

  return { year, month, day, hour, minute }
}

function parseBusinessTimeParts(value: string | null | undefined) {
  if (!value) return null
  const normalized = String(value).trim()
  if (!normalized) return null

  const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!matched) return null

  const parts = buildDatePartsFromMatch(matched)
  if (!parts) return null

  const currentYear = new Date().getFullYear()
  if (parts.year < MIN_REASONABLE_BUSINESS_YEAR || parts.year > currentYear + MAX_REASONABLE_FUTURE_YEAR_OFFSET) {
    return null
  }

  return parts
}

export function formatDetailStatDateTime(value: string | null | undefined) {
  const parts = parseBusinessTimeParts(value)
  if (!parts) return ''
  const year = parts.year
  const month = `${parts.month}`.padStart(2, '0')
  const day = `${parts.day}`.padStart(2, '0')
  const hour = `${parts.hour}`.padStart(2, '0')
  const minute = `${parts.minute}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function businessTimeStatusLabel(status: string | null | undefined) {
  switch (String(status ?? '').trim()) {
    case 'fresh':
      return '正常更新'
    case 'stale':
      return '长期未更新'
    case 'field_missing':
      return '字段不存在'
    case 'table_missing':
      return '基准表缺失'
    case 'missing':
      return '无业务时间值'
    case 'invalid':
      return '时间值无效'
    case 'not_configured':
      return '未配置业务时间'
    default:
      return '未识别'
  }
}

function inferUpdateCycleFromText(value: string | null | undefined) {
  const text = String(value ?? '').trim()
  if (!text) return ''

  const lower = text.toLowerCase()

  if (text.includes('实时')) return '实时'
  if (text.includes('分钟')) return '分钟级'
  if (text.includes('小时')) return '每小时'
  if (text.includes('月') || lower.includes('month')) return '每月'
  if (
    text.includes('年度')
    || text.includes('年份')
    || (text.includes('年') && !text.includes('每年更新'))
    || lower.includes('datayear')
    || lower.includes('data_year')
    || lower === 'nf'
    || lower === 'nd'
    || lower.includes('year')
  ) {
    return '每年'
  }
  if (
    text.includes('每日')
    || text.includes('业务日期')
    || text.includes('数据产生时间')
    || text.includes('数据时间')
    || text.includes('监测时间')
    || text.includes('当天生成当天使用')
    || text.includes('日期')
    || lower.includes('biz_date')
    || lower.includes('date_time')
    || lower.includes('data_time')
    || lower.includes('monitor_time')
    || lower.includes('monitortime')
    || lower.includes('datatime')
    || lower.includes('predict_time')
    || lower.includes('predict_date')
  ) {
    return '每日'
  }

  return ''
}

function inferUpdateCycleFromStatRecord(record: SourceMetricFallbackRecord) {
  return (
    inferUpdateCycleFromText(record.resourceName)
    || inferUpdateCycleFromText(record.metainfo?.business_time_field_description)
    || inferUpdateCycleFromText(record.metainfo?.business_time_field_name)
    || inferUpdateCycleFromText(record.resourceCode)
  )
}

function inferUpdateCycleFromLatestRecord(record: DetailMetricSnapshotInput['latestRecord']) {
  if (!record) return ''

  return (
    inferUpdateCycleFromText(record.metainfo?.business_time_field_description)
    || inferUpdateCycleFromText(record.metainfo?.business_time_field_name)
    || inferUpdateCycleFromText(record.resourceName)
    || inferUpdateCycleFromText(record.resourceCode)
  )
}

function pickDominantUpdateCycle(labels: string[]) {
  if (labels.length === 0) return ''

  const counts = new Map<string, number>()
  labels.forEach((label) => {
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })

  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
  return ranked[0]?.[0] ?? ''
}

function buildComparableBusinessTime(rawValue: string) {
  const parts = parseBusinessTimeParts(rawValue)
  if (!parts) return null

  return {
    rawValue,
    timeValue: new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0).getTime(),
  }
}

export function buildSourceResourceMetricFallback(input: {
  currentResourceId: string
  fallbackUpdateCycle: string
  downstreamNodes?: SourceMetricFallbackLineageNode[] | null
  latestStatRecordByResourceId: ReadonlyMap<string, SourceMetricFallbackRecord>
}) {
  const downstreamIds = Array.from(
    new Set(
      (input.downstreamNodes ?? [])
        .map((node) => String(node.id ?? '').trim())
        .filter((nodeId) => nodeId && nodeId !== input.currentResourceId)
        .filter((nodeId) => {
          const node = (input.downstreamNodes ?? []).find((entry) => String(entry.id ?? '').trim() === nodeId)
          return !node?.nodeType || node.nodeType === 'warehouse_resource'
        }),
    ),
  )

  if (downstreamIds.length === 0) {
    return null
  }

  const records = downstreamIds
    .map((resourceId) => input.latestStatRecordByResourceId.get(resourceId))
    .filter((record): record is SourceMetricFallbackRecord => Boolean(record))

  if (records.length === 0) {
    return null
  }

  let totalRecordCount = 0
  let hasRecordCount = false
  let latestBusinessTime = ''
  let latestBusinessTimeValue = Number.NEGATIVE_INFINITY

  records.forEach((record) => {
    const recordCount = normalizeNumber(record.metainfo?.record_count)
    if (recordCount !== null) {
      totalRecordCount += recordCount
      hasRecordCount = true
    }

    const rawBusinessTime = String(record.metainfo?.last_record_update_time ?? '').trim()
    const comparable = buildComparableBusinessTime(rawBusinessTime)
    if (comparable && comparable.timeValue > latestBusinessTimeValue) {
      latestBusinessTimeValue = comparable.timeValue
      latestBusinessTime = comparable.rawValue
    }
  })

  const inferredUpdateCycle = pickDominantUpdateCycle(
    records
      .map((record) => inferUpdateCycleFromStatRecord(record))
      .filter(Boolean),
  )

  if (!hasRecordCount && !latestBusinessTime && !inferredUpdateCycle) {
    return null
  }

  return {
    record_count: hasRecordCount ? totalRecordCount : null,
    last_record_update_time: latestBusinessTime || null,
    update_cycle:
      inferredUpdateCycle
      || (input.fallbackUpdateCycle && input.fallbackUpdateCycle !== '未标注' ? input.fallbackUpdateCycle : ''),
  }
}

export function buildDetailMetricSnapshot(input: DetailMetricSnapshotInput): DetailMetricSnapshot {
  const recordCount = normalizeNumber(input.latestRecord?.metainfo?.record_count)
  const rawBusinessTimeValue = String(input.latestRecord?.metainfo?.last_record_update_time ?? '').trim()
  const businessTimeText = formatDetailStatDateTime(rawBusinessTimeValue)
  const businessTimeStatus = rawBusinessTimeValue && !businessTimeText ? 'invalid' : input.latestRecord?.metainfo?.business_time_status
  const businessTimeStatusText = businessTimeStatusLabel(businessTimeStatus)
  const businessTimeFieldLabel = String(input.latestRecord?.metainfo?.business_time_field_description ?? '').trim() || '业务时间'
  const businessTimeTraceSummary = String(input.latestRecord?.metainfo?.business_time_trace_summary ?? '').trim()
  const hasLatestRecord = Boolean(input.latestRecord)
  const invalidBusinessTime = businessTimeStatus === 'invalid'
  const updateCycleText = inferUpdateCycleFromLatestRecord(input.latestRecord) || input.fallbackUpdateCycle

  const countText = recordCount === null ? input.fallbackCount : `${recordCount.toLocaleString('zh-CN')} 条`
  const updateTimeText = businessTimeText || (hasLatestRecord ? businessTimeStatusText : '未标注')
  const updateBadgeText = businessTimeText
    ? `业务时间 ${businessTimeText}`
    : hasLatestRecord
      ? `${businessTimeFieldLabel} ${businessTimeStatusText}`
      : '未标注'
  const serviceNoteText = hasLatestRecord
    ? invalidBusinessTime && businessTimeTraceSummary
      ? `${input.department}负责维护该资源。${businessTimeTraceSummary}当前支持${input.serviceSummary}。`
      : `${input.department}负责维护该资源，当前支持${input.serviceSummary}。`
    : `${input.department}负责维护该资源，当前支持${input.serviceSummary}。`

  return {
    countText,
    updateTimeText,
    updateCycleText,
    updateBadgeText,
    serviceNoteText,
  }
}
