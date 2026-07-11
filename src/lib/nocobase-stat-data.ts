import { useCallback, useEffect, useRef, useState } from 'react'
import { nocobaseClient, toErrorMessage } from './nocobase-client'
import { loadAllPages } from './paginated-resource-loader'
import { normalizeLatestPreviewData, type LatestPreviewData } from './resource-preview-data'

export type ConnectStatusCode = '01' | '02' | '04' | '99' | string
export type DataLayerCode = 'ODS' | 'DWD' | 'DWS' | 'ADS' | 'DIM' | 'OTHER'

export type ConnectStatusMeta = {
  label: string
  toneClass: string
}

export type StatMetaInfo = {
  table_count?: number
  field_count?: number
  record_count?: number
  storage_bytes?: number
  non_null_field_count?: number
  last_record_update_time?: string | null
  business_time_field_name?: string | null
  business_time_field_description?: string | null
  business_time_field_type?: string | null
  business_time_raw_value?: string | null
  business_time_parser?: string | null
  business_time_trace_summary?: string | null
  business_time_trace?: Record<string, unknown> | null
  business_time_suggested_field_name?: string | null
  business_time_status?: string | null
  business_time_age_days?: number | null
  business_time_stale_threshold_days?: number | null
  compare_task_code?: string | null
  compare_task_name?: string | null
  compare_execute_time?: string | null
}

export type StatTrendPoint = {
  date?: string | null
  execute_time?: string | null
  stat_period_code?: string | null
  stat_type?: string | null
  record_count?: number | null
  storage_bytes?: number | null
  field_count?: number | null
  non_null_field_count?: number | null
  last_record_update_time?: string | null
}

export type StatTrendWindow = {
  window_days?: number
  task_code?: string | null
  task_name?: string | null
  points?: StatTrendPoint[]
}

export type StatDayOnDay = {
  compare_period_code?: string | null
  compare_task_code?: string | null
  compare_task_name?: string | null
  compare_execute_time?: string | null
  record_count?: {
    current?: number
    previous?: number | null
    delta?: number
    ratio?: number | null
  }
  trend_30d?: StatTrendWindow | null
}

export type StatQuality = {
  connect_status?: string
  empty_table_count?: number
  error_table_count?: number
  all_null_field_count?: number
  stale_business_time_count?: number
  missing_business_time_count?: number
  business_time_status?: string | null
  business_time_age_days?: number | null
}

export type StatRecord = {
  id: string
  periodCode: string
  executedAt: string
  resourceId: string
  resourceTypeId: string
  resourceCode: string
  resourceName: string
  domainCategoryId: string
  domainCategoryName: string
  dataLayerCode: DataLayerCode
  dataLayerName: string
  connectStatus: ConnectStatusCode
  metainfo: StatMetaInfo
  dayOnDay: StatDayOnDay
  quality: StatQuality
  latestPreviewData: LatestPreviewData | null
  errorList: Array<Record<string, unknown>>
}

type RawStatRecord = {
  id: number | string
  ID?: number | string
  createdAt?: string | null
  updatedAt?: string | null
  created_at?: string | null
  updated_at?: string | null
  CreatedAt?: string | null
  UpdatedAt?: string | null
  stat_period_code?: string | null
  StatPeriodCode?: string | null
  statPeriodCode?: string | null
  data_resource_id?: number | string | null
  DataResourceID?: number | string | null
  dataResourceId?: number | string | null
  stat_connect?: string | null
  StatConnect?: string | null
  statConnect?: string | null
  stat_metainfo?: unknown
  StatMetainfo?: unknown
  statMetainfo?: unknown
  stat_dayonday?: unknown
  StatDayOnDay?: unknown
  StatDayonday?: unknown
  statDayOnDay?: unknown
  stat_quality?: unknown
  StatQuality?: unknown
  statQuality?: unknown
  stat_error?: unknown
  StatError?: unknown
  statError?: unknown
  new_data?: unknown
  NewData?: unknown
  newData?: unknown
  latest_preview_data?: unknown
  latestPreviewData?: unknown
  data_resource?: RawStatResource | null
}

type RawStatResource = {
  id?: number | string
  data_resource_type_id?: number | string | null
  dataResourceTypeId?: number | string | null
  resource_code?: string | null
  resourceCode?: string | null
  resource_name?: string | null
  resourceName?: string | null
  domain_category_id?: number | string | null
  domainCategoryId?: number | string | null
  domain_category?: {
    id?: number | string | null
    node_name?: string | null
    nodeName?: string | null
    name?: string | null
  } | null
  source_tablelist?: unknown
  sourceTablelist?: unknown
}

function normalizeLatestPreviewDataValue(value: unknown): LatestPreviewData | null {
  return normalizeLatestPreviewData(parseJson<Record<string, unknown> | null>(value, null))
}

export type StatDimensionSeed = {
  key: string
  label: string
  order: number
}

export type StatDimensionSummary = {
  key: string
  label: string
  order: number
  resourceCount: number
  totalRecords: number
  totalStorageBytes: number
  totalDeltaRecords: number
  totalDeltaRatio: number
}

export type StatDimensionChangeItem = {
  key: string
  label: string
  resourceCount: number
  currentRecords: number
  previousRecords: number
  deltaRecords: number
  deltaRatio: number
}

export type ResourceRecordChangeItem = {
  key: string
  resourceId: string
  resourceCode: string
  resourceName: string
  currentRecords: number
  previousRecords: number
  deltaRecords: number
  deltaRatio: number
}

export type PeriodSummary = {
  periodCode: string
  executedAt: string
  resources: number
  totalRecords: number
  totalStorageBytes: number
  avgFieldCount: number
  normalCount: number
  warningCount: number
  errorCount: number
  freshResourceCount: number
  staleResourceCount: number
  missingBusinessTimeCount: number
  freshnessRate: number
}

export type RunStatsData = {
  records: StatRecord[]
  summaryRecords: StatRecord[]
  periods: string[]
  periodSummaries: PeriodSummary[]
}

export type RunStatsTaskBinding = {
  taskCode: string
  taskName: string
}

export type RunStatsTaskOption = RunStatsTaskBinding & {
  periodCount: number
  disabled: boolean
}

export type RunStatsTaskData = {
  taskOptions: RunStatsTaskOption[]
  periodTaskMap: Record<string, RunStatsTaskBinding>
}

export type RunStatsJobOption = {
  periodCode: string
  executedAt: string
  taskCode: string
  taskName: string
}

export type CurrentRunStatsQueryDefaults = {
  executionDate: string
  taskCode: string
  taskName: string
  periodCode: string
}

export type CurrentRunStatsSnapshot = {
  data: RunStatsData
  taskData: RunStatsTaskData
  defaultQuery: CurrentRunStatsQueryDefaults
}

export type FreshnessTopGroups = {
  latestUpdated: StatRecord[]
  threeDayStopped: StatRecord[]
  yearlyStopped: StatRecord[]
  monthlyStopped: StatRecord[]
  weeklyStopped: StatRecord[]
  longTermStopped: StatRecord[]
  threeDayStoppedCount: number
  yearlyStoppedCount: number
  monthlyStoppedCount: number
  weeklyStoppedCount: number
  longTermStoppedCount: number
}

export type LatestResourceBatchStat = {
  latestPeriodCode: string
  record: StatRecord | null
}

export type CurrentOverviewTrendPoint = {
  periodCode: string
  executedAt: string
  recordCount: number
}

export type CurrentOverviewResourceTrendPoint = {
  periodCode: string
  recordCount: number
}

export type CurrentOverviewResourceTrend = {
  resourceId: string
  currentRecordCount: number
  points: CurrentOverviewResourceTrendPoint[]
}

export type CurrentOverviewStats = {
  themeCount: number
  resourceCount: number
  fieldCount: number
  recordCount: number
  dataSourceCount: number
  isFallback: boolean
  trendPoints: CurrentOverviewTrendPoint[]
  resourceTrends: CurrentOverviewResourceTrend[]
}

type CurrentOverviewTrendWindow = Pick<CurrentOverviewStats, 'trendPoints' | 'resourceTrends'>

type RunStatsHookOptions = {
  lazyByDate?: boolean
}

const EMPTY_DATA: RunStatsData = {
  records: [],
  summaryRecords: [],
  periods: [],
  periodSummaries: [],
}

const EMPTY_LATEST_RESOURCE_BATCH_STAT: LatestResourceBatchStat = {
  latestPeriodCode: '',
  record: null,
}

const EMPTY_CURRENT_RUN_STATS_QUERY_DEFAULTS: CurrentRunStatsQueryDefaults = {
  executionDate: '',
  taskCode: '',
  taskName: '',
  periodCode: '',
}

const EMPTY_CURRENT_RUN_STATS_SNAPSHOT: CurrentRunStatsSnapshot = {
  data: EMPTY_DATA,
  taskData: {
    taskOptions: [],
    periodTaskMap: {},
  },
  defaultQuery: EMPTY_CURRENT_RUN_STATS_QUERY_DEFAULTS,
}

const EMPTY_CURRENT_OVERVIEW_STATS: CurrentOverviewStats = {
  themeCount: 0,
  resourceCount: 0,
  fieldCount: 0,
  recordCount: 0,
  dataSourceCount: 0,
  isFallback: true,
  trendPoints: [],
  resourceTrends: [],
}

export const DATA_LAYER_SEEDS: StatDimensionSeed[] = [
  { key: 'ODS', label: 'ODS（操作数据层）', order: 1 },
  { key: 'DWD', label: 'DWD（明细数据层）', order: 2 },
  { key: 'DWS', label: 'DWS（汇总数据层）', order: 3 },
  { key: 'ADS', label: 'ADS（应用数据层）', order: 4 },
  { key: 'DIM', label: 'DIM（公共维度层）', order: 5 },
]

let statCache: RunStatsData | null = null
let statPromise: Promise<RunStatsData> | null = null
let statHydrationPromise: Promise<RunStatsData> | null = null
let statCacheComplete = false
const statLoadedExecutionDates = new Set<string>()
const statDatePromises = new Map<string, Promise<RunStatsData>>()
const statLoadedDetailPeriods = new Set<string>()
const statPeriodPromises = new Map<string, Promise<RunStatsData>>()
const latestResourceBatchCache = new Map<string, LatestResourceBatchStat>()
const latestResourceBatchPromises = new Map<string, Promise<LatestResourceBatchStat>>()
type StatSourceDescriptor = {
  resourceName: string
  dataSourceKey: string
  headers: Record<string, string>
}

type RawStatTaskRecord = {
  id?: number | string | null
  task_code?: string | null
  taskCode?: string | null
  TaskCode?: string | null
  task_name?: string | null
  taskName?: string | null
  TaskName?: string | null
}

type RawStatJobRecord = {
  id?: number | string | null
  ID?: number | string | null
  job_code?: string | null
  jobCode?: string | null
  JobCode?: string | null
  stat_period_code?: string | null
  statPeriodCode?: string | null
  StatPeriodCode?: string | null
  execute_time?: string | null
  executeTime?: string | null
  ExecuteTime?: string | null
  task_code?: string | null
  taskCode?: string | null
  TaskCode?: string | null
  task_name?: string | null
  taskName?: string | null
  TaskName?: string | null
  created_at?: string | null
  createdAt?: string | null
  updated_at?: string | null
  updatedAt?: string | null
}

type RunStatsTaskCatalogEntry = {
  taskCode: string
  taskName: string
}

let statTaskSourceDescriptorCache: StatSourceDescriptor | null | undefined
let statTaskSourceDescriptorPromise: Promise<StatSourceDescriptor | null> | null = null
const statSourceErrorLogCache = new Set<string>()
let statSourceResourceMapCache: Map<string, RawStatResource> | null = null
const DIRECT_STAT_SOURCE = {
  resourceName: 'eco_data_stat',
  dataSourceKey: 'main',
  headers: {},
} satisfies StatSourceDescriptor
const DIRECT_CURRENT_STAT_SOURCE = {
  resourceName: 'eco_data_stat_current',
  dataSourceKey: 'main',
  headers: {},
} satisfies StatSourceDescriptor
const DIRECT_STAT_TASK_SOURCE = {
  resourceName: 'eco_stat_task',
  dataSourceKey: 'main',
  headers: {},
} satisfies StatSourceDescriptor
const DIRECT_STAT_JOB_SOURCE = {
  resourceName: 'eco_stat_job',
  dataSourceKey: 'main',
  headers: {},
} satisfies StatSourceDescriptor
const STAT_RESOURCE_APPENDS = ['domain_category']
const STAT_ROW_FIELDS = [
  'id',
  'created_at',
  'updated_at',
  'stat_period_code',
  'data_resource_id',
  'stat_metainfo',
  'stat_dayonday',
  'stat_quality',
  'stat_connect',
  'stat_error',
]
const CURRENT_OVERVIEW_STAT_ROW_FIELDS = [
  'id',
  'created_at',
  'updated_at',
  'stat_period_code',
  'data_resource_id',
  'stat_metainfo',
  'stat_dayonday',
] as const
const LATEST_RESOURCE_STAT_ROW_FIELDS = [
  'id',
  'created_at',
  'updated_at',
  'stat_period_code',
  'data_resource_id',
  'stat_metainfo',
] as const
const STAT_RESOURCE_FIELDS = [
  'id',
  'data_resource_type_id',
  'resource_code',
  'resource_name',
  'domain_category_id',
  'source_tablelist',
]
// `eco_data_stat.id` is generated from `YYYYMMDD + batch + row_index`,
// so descending `id` is equivalent to the latest batch order while avoiding
// a costly sort on the non-indexed `stat_period_code` column.
const LATEST_STAT_SORT = '-id'
const DATE_SCOPED_PERIOD_DISCOVERY_LIMIT = 200
const DATE_SCOPED_PERIOD_DISCOVERY_PAGE_SIZE = 500
const EXACT_PERIOD_FETCH_PAGE_SIZE = 1000
const STAT_JOB_PAGE_SIZE = 200
const STAT_RESOURCE_PAGE_SIZE = 1000
const STAT_RESOURCE_FILTER_MAX_ENCODED_LENGTH = 6000
const INITIAL_RUN_STATS_PERIOD_LIMIT = 1
const CURRENT_OVERVIEW_TREND_POINT_LIMIT = 5
const CURRENT_OVERVIEW_PAGE_SIZE = 2000

// == localStorage cache persistence for stat data ==
const LS_CACHE_OVERVIEW = 'eco_stat_cache_overview_v3'
const LS_CACHE_RUN_SNAPSHOT = 'eco_stat_cache_run_snapshot_v2'
const CACHE_TTL_MINUTES = 30

type StorageCacheEntry<T> = {
  data: T
  cachedAt: string
}

function readStorageCache<T>(key: string): StorageCacheEntry<T> | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return null
    if (!('data' in parsed)) return null

    // Support both new format ({ cachedAt, data }) and legacy format ({ date, data })
    const cachedAt = typeof parsed.cachedAt === 'string'
      ? parsed.cachedAt
      : (typeof parsed.date === 'string'
        ? new Date(parsed.date + 'T00:00:00.000Z').toISOString()
        : new Date().toISOString())

    return { data: parsed.data as T, cachedAt }
  } catch {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key) } catch { /* ignore */ }
    return null
  }
}

function writeStorageCache(key: string, data: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, JSON.stringify({
      cachedAt: new Date().toISOString(),
      data,
    }))
  } catch { /* ignore */ }
}

function isCacheFresh(cachedAt: string): boolean {
  const cachedTime = new Date(cachedAt).getTime()
  if (isNaN(cachedTime)) return false
  return (Date.now() - cachedTime) < CACHE_TTL_MINUTES * 60 * 1000
}

function isCurrentOverviewStatsCacheUsable(stats: CurrentOverviewStats | null | undefined) {
  if (!stats) return false
  if (stats.resourceCount <= 0) return true
  if (stats.recordCount <= 0) return false
  if (stats.trendPoints.length === 0) return false
  return true
}

const EMPTY_RUN_STATS_TASK_DATA: RunStatsTaskData = {
  taskOptions: [],
  periodTaskMap: {},
}
let statTaskCatalogCache: RunStatsTaskCatalogEntry[] | null = null
let statTaskCatalogPromise: Promise<RunStatsTaskCatalogEntry[]> | null = null
const statTaskJobRowsByExecutionDateCache = new Map<string, RawStatJobRecord[]>()
const statTaskDatePromises = new Map<string, Promise<RawStatJobRecord[]>>()
let recentStatJobRowsCache: RawStatJobRecord[] | null = null
let recentStatJobRowsPromise: Promise<RawStatJobRecord[]> | null = null
let currentOverviewStatsCache: CurrentOverviewStats | null = null
let currentOverviewStatsPromise: Promise<CurrentOverviewStats> | null = null
let latestResourceStatMapCache: Map<string, StatRecord> | null = null
let latestResourceStatMapPromise: Promise<Map<string, StatRecord>> | null = null
let currentRunStatsSnapshotCache: CurrentRunStatsSnapshot | null = null
let currentRunStatsSnapshotPromise: Promise<CurrentRunStatsSnapshot> | null = null

// Restore memory caches from localStorage on module load
{
  const overview = readStorageCache<CurrentOverviewStats>(LS_CACHE_OVERVIEW)
  if (overview?.data && isCacheFresh(overview.cachedAt) && isCurrentOverviewStatsCacheUsable(overview.data)) {
    currentOverviewStatsCache = { ...EMPTY_CURRENT_OVERVIEW_STATS, ...overview.data }
  }
  const snapshot = readStorageCache<CurrentRunStatsSnapshot>(LS_CACHE_RUN_SNAPSHOT)
  if (snapshot?.data && isCacheFresh(snapshot.cachedAt)) {
    currentRunStatsSnapshotCache = snapshot.data
  }
}

const FALLBACK_TASK_NAME_BY_CODE: Record<string, string> = {
  dw30: '30分钟数仓统计',
  dw1d: '每日数仓统计',
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'object') return value as T
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return fallback
    try {
      return JSON.parse(text) as T
    } catch {
      return fallback
    }
  }
  return fallback
}

function numeric(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function normalizeStatTrendPoints(value: unknown): StatTrendPoint[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      date: item.date == null ? null : String(item.date).trim() || null,
      execute_time: item.execute_time == null ? null : String(item.execute_time).trim() || null,
      stat_period_code: item.stat_period_code == null ? null : String(item.stat_period_code).trim() || null,
      stat_type: item.stat_type == null ? null : String(item.stat_type).trim() || null,
      record_count: item.record_count == null ? null : numeric(item.record_count),
      storage_bytes: item.storage_bytes == null ? null : numeric(item.storage_bytes),
      field_count: item.field_count == null ? null : numeric(item.field_count),
      non_null_field_count: item.non_null_field_count == null ? null : numeric(item.non_null_field_count),
      last_record_update_time:
        item.last_record_update_time == null ? null : String(item.last_record_update_time).trim() || null,
    }))
}

function normalizeStatDayOnDay(value: unknown): StatDayOnDay {
  const raw = parseJson<Record<string, unknown>>(value, {})
  const rawRecordCount = raw.record_count
  const recordCount =
    rawRecordCount && typeof rawRecordCount === 'object' && !Array.isArray(rawRecordCount)
      ? {
          current: (rawRecordCount as Record<string, unknown>).current == null
            ? undefined
            : numeric((rawRecordCount as Record<string, unknown>).current),
          previous: (rawRecordCount as Record<string, unknown>).previous == null
            ? null
            : numeric((rawRecordCount as Record<string, unknown>).previous),
          delta: (rawRecordCount as Record<string, unknown>).delta == null
            ? undefined
            : numeric((rawRecordCount as Record<string, unknown>).delta),
          ratio: (rawRecordCount as Record<string, unknown>).ratio == null
            ? null
            : numeric((rawRecordCount as Record<string, unknown>).ratio),
        }
      : undefined
  const rawTrend = raw.trend_30d
  const trend =
    rawTrend && typeof rawTrend === 'object' && !Array.isArray(rawTrend)
      ? {
          window_days: (rawTrend as Record<string, unknown>).window_days == null
            ? undefined
            : numeric((rawTrend as Record<string, unknown>).window_days),
          task_code: (rawTrend as Record<string, unknown>).task_code == null
            ? null
            : String((rawTrend as Record<string, unknown>).task_code).trim() || null,
          task_name: (rawTrend as Record<string, unknown>).task_name == null
            ? null
            : String((rawTrend as Record<string, unknown>).task_name).trim() || null,
          points: normalizeStatTrendPoints((rawTrend as Record<string, unknown>).points),
        }
      : null

  return {
    compare_period_code: raw.compare_period_code == null ? null : String(raw.compare_period_code).trim() || null,
    compare_task_code: raw.compare_task_code == null ? null : String(raw.compare_task_code).trim() || null,
    compare_task_name: raw.compare_task_name == null ? null : String(raw.compare_task_name).trim() || null,
    compare_execute_time: raw.compare_execute_time == null ? null : String(raw.compare_execute_time).trim() || null,
    record_count: recordCount,
    trend_30d: trend,
  }
}

function getFirstDefined<T>(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key]
    if (value !== undefined && value !== null) return value as T
  }
  return undefined
}

function getRawStatRowId(raw: RawStatRecord) {
  return getFirstDefined<number | string>((raw as Record<string, unknown>), ['id', 'ID']) ?? ''
}

function getRawStatPeriodCode(raw: RawStatRecord) {
  return String(getFirstDefined((raw as Record<string, unknown>), ['stat_period_code', 'StatPeriodCode', 'statPeriodCode']) ?? '').trim()
}

function getRawStatResourceId(raw: RawStatRecord) {
  return getFirstDefined<number | string>((raw as Record<string, unknown>), ['data_resource_id', 'DataResourceID', 'dataResourceId'])
}

function getRawStatConnectStatus(raw: RawStatRecord) {
  return String(getFirstDefined((raw as Record<string, unknown>), ['stat_connect', 'StatConnect', 'statConnect']) ?? '').trim()
}

function getRawStatCreatedAt(raw: RawStatRecord) {
  return String(getFirstDefined((raw as Record<string, unknown>), ['updatedAt', 'updated_at', 'UpdatedAt', 'createdAt', 'created_at', 'CreatedAt']) ?? '').trim()
}

function getRawStatMetainfoValue(raw: RawStatRecord) {
  return getFirstDefined((raw as Record<string, unknown>), ['stat_metainfo', 'StatMetainfo', 'statMetainfo'])
}

function getRawStatDayOnDayValue(raw: RawStatRecord) {
  return getFirstDefined((raw as Record<string, unknown>), ['stat_dayonday', 'StatDayOnDay', 'StatDayonday', 'statDayOnDay'])
}

function getRawStatQualityValue(raw: RawStatRecord) {
  return getFirstDefined((raw as Record<string, unknown>), ['stat_quality', 'StatQuality', 'statQuality'])
}

function getRawStatErrorValue(raw: RawStatRecord) {
  return getFirstDefined((raw as Record<string, unknown>), ['stat_error', 'StatError', 'statError'])
}

function getRawStatLatestPreviewValue(raw: RawStatRecord) {
  return getFirstDefined((raw as Record<string, unknown>), ['new_data', 'NewData', 'newData', 'latest_preview_data', 'latestPreviewData'])
}

function normalizeStatSourceResourceId(value: unknown) {
  const text = String(value ?? '').trim()
  return text || ''
}

function normalizeNonEmptyString(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function getRawStatTaskCode(raw: RawStatTaskRecord | RawStatJobRecord | RunStatsTaskCatalogEntry) {
  return normalizeNonEmptyString((raw as RawStatTaskRecord).task_code ?? (raw as RawStatTaskRecord).taskCode ?? (raw as RawStatTaskRecord).TaskCode)
}

function getRawStatTaskName(raw: RawStatTaskRecord | RawStatJobRecord | RunStatsTaskCatalogEntry) {
  return normalizeNonEmptyString((raw as RawStatTaskRecord).task_name ?? (raw as RawStatTaskRecord).taskName ?? (raw as RawStatTaskRecord).TaskName)
}

function getRawStatJobPeriodCode(raw: RawStatJobRecord) {
  return normalizeNonEmptyString(raw.job_code ?? raw.jobCode ?? raw.JobCode ?? raw.stat_period_code ?? raw.statPeriodCode ?? raw.StatPeriodCode)
}

function getRawStatJobExecuteTime(raw: RawStatJobRecord) {
  return normalizeNonEmptyString(raw.execute_time ?? raw.executeTime ?? raw.ExecuteTime)
}

function sortTaskCatalogEntries(entries: RunStatsTaskCatalogEntry[]) {
  return [...entries].sort((a, b) => {
    const codeDiff = a.taskCode.localeCompare(b.taskCode, 'zh-CN')
    if (codeDiff !== 0) return codeDiff
    return a.taskName.localeCompare(b.taskName, 'zh-CN')
  })
}

function normalizeRunStatsTaskCatalog(rows: Array<RawStatTaskRecord | RunStatsTaskCatalogEntry>) {
  const taskMap = new Map<string, RunStatsTaskCatalogEntry>()

  rows.forEach((row) => {
    const taskCode = getRawStatTaskCode(row)
    const taskName = getRawStatTaskName(row)
    if (!taskCode || !taskName) return
    taskMap.set(taskCode, {
      taskCode,
      taskName,
    })
  })

  return sortTaskCatalogEntries(Array.from(taskMap.values()))
}

function buildRunStatsTaskCatalogData(taskCatalog: RunStatsTaskCatalogEntry[]): RunStatsTaskData {
  return {
    taskOptions: taskCatalog.map((item) => ({
      taskCode: item.taskCode,
      taskName: item.taskName,
      periodCount: 0,
      disabled: false,
    })),
    periodTaskMap: {},
  }
}

function normalizeRunStatsTaskPeriodMap(rows: RawStatJobRecord[]) {
  const periodTaskMap: Record<string, RunStatsTaskBinding> = {}

  rows.forEach((row) => {
    const periodCode = getRawStatJobPeriodCode(row)
    const taskCode = getRawStatTaskCode(row)
    const taskName = getRawStatTaskName(row)
    if (!periodCode || !taskCode || !taskName) return
    if (periodTaskMap[periodCode]) return
    periodTaskMap[periodCode] = {
      taskCode,
      taskName,
    }
  })

  return periodTaskMap
}

function hydrateRunStatsTaskLookup(
  taskCatalog: RunStatsTaskCatalogEntry[],
  periodTaskMap: Record<string, RunStatsTaskBinding>,
  fallbackPeriodCodes: string[] = [],
): RunStatsTaskData {
  const effectivePeriodTaskMap: Record<string, RunStatsTaskBinding> = { ...periodTaskMap }
  const normalizedFallbackPeriodCodes = Array.from(
    new Set(
      fallbackPeriodCodes
        .map((item) => String(item ?? '').trim())
        .filter(Boolean),
    ),
  )

  if (Object.keys(effectivePeriodTaskMap).length === 0 && taskCatalog.length === 1 && normalizedFallbackPeriodCodes.length > 0) {
    const [onlyTask] = taskCatalog
    normalizedFallbackPeriodCodes.forEach((periodCode) => {
      effectivePeriodTaskMap[periodCode] = {
        taskCode: onlyTask.taskCode,
        taskName: onlyTask.taskName,
      }
    })
  }

  const periodCountMap = new Map<string, number>()
  Object.values(effectivePeriodTaskMap).forEach((binding) => {
    periodCountMap.set(binding.taskCode, (periodCountMap.get(binding.taskCode) ?? 0) + 1)
  })

  const sortedCatalog = sortTaskCatalogEntries(taskCatalog)
  return {
    taskOptions: sortedCatalog.map((item) => {
      const periodCount = periodCountMap.get(item.taskCode) ?? 0
      return {
        taskCode: item.taskCode,
        taskName: item.taskName,
        periodCount,
        disabled: periodCount === 0 && sortedCatalog.length > 1,
      }
    }),
    periodTaskMap: effectivePeriodTaskMap,
  }
}

export function buildRunStatsTaskLookup(
  taskRows: Array<RawStatTaskRecord | RunStatsTaskCatalogEntry>,
  jobRows: RawStatJobRecord[],
  fallbackPeriodCodes: string[] = [],
) {
  return hydrateRunStatsTaskLookup(
    normalizeRunStatsTaskCatalog(taskRows),
    normalizeRunStatsTaskPeriodMap(jobRows),
    fallbackPeriodCodes,
  )
}

export function buildRunStatsJobOptions(rows: RawStatJobRecord[], taskCode: string): RunStatsJobOption[] {
  const normalizedTaskCode = normalizeNonEmptyString(taskCode)
  if (!normalizedTaskCode) return []

  const jobMap = new Map<string, RunStatsJobOption>()

  rows.forEach((row) => {
    const rowTaskCode = getRawStatTaskCode(row)
    if (rowTaskCode !== normalizedTaskCode) return

    const periodCode = getRawStatJobPeriodCode(row)
    if (!periodCode) return

    const next: RunStatsJobOption = {
      periodCode,
      executedAt: getRawStatJobExecuteTime(row),
      taskCode: rowTaskCode,
      taskName: getRawStatTaskName(row) || FALLBACK_TASK_NAME_BY_CODE[rowTaskCode] || rowTaskCode,
    }
    const current = jobMap.get(periodCode)
    if (!current || next.executedAt > current.executedAt) {
      jobMap.set(periodCode, next)
    }
  })

  return Array.from(jobMap.values()).sort((a, b) => {
    const periodDiff = b.periodCode.localeCompare(a.periodCode, 'zh-CN')
    if (periodDiff !== 0) return periodDiff
    return b.executedAt.localeCompare(a.executedAt, 'zh-CN')
  })
}

export function buildStatSourceDescriptorChain(
  primary: StatSourceDescriptor | null | undefined,
  _secondary?: StatSourceDescriptor | null,
) {
  return primary ? [primary] : []
}

function compareRawStatJobRows(a: RawStatJobRecord, b: RawStatJobRecord) {
  const periodDiff = getRawStatJobPeriodCode(b).localeCompare(getRawStatJobPeriodCode(a), 'zh-CN')
  if (periodDiff !== 0) return periodDiff
  return getRawStatJobExecuteTime(b).localeCompare(getRawStatJobExecuteTime(a), 'zh-CN')
}

function mergeRunStatsJobRowsByPriority(rowGroups: RawStatJobRecord[][]) {
  const jobMap = new Map<string, { row: RawStatJobRecord; priority: number }>()

  rowGroups.forEach((rows, priority) => {
    rows.forEach((row) => {
      const periodCode = getRawStatJobPeriodCode(row)
      if (!periodCode) return

      const existing = jobMap.get(periodCode)
      if (!existing) {
        jobMap.set(periodCode, { row, priority })
        return
      }

      if (priority < existing.priority) {
        jobMap.set(periodCode, { row, priority })
        return
      }

      if (priority === existing.priority && compareRawStatJobRows(row, existing.row) < 0) {
        jobMap.set(periodCode, { row, priority })
      }
    })
  })

  return Array.from(jobMap.values(), (entry) => entry.row).sort(compareRawStatJobRows)
}

export function mergeRunStatsJobRows(mainRows: RawStatJobRecord[], fallbackRows: RawStatJobRecord[] = []) {
  return mergeRunStatsJobRowsByPriority([mainRows, fallbackRows])
}

export function filterStatJobRowsByExecutionDate(rows: RawStatJobRecord[], dateKey: string) {
  const normalizedDateKey = extractExecutionDateKey(dateKey)
  if (!normalizedDateKey) return []

  return rows
    .filter((row) => extractPeriodDateKey(getRawStatJobPeriodCode(row)) === normalizedDateKey)
    .sort(compareRawStatJobRows)
}

function resolveCurrentTaskBinding(record: Pick<StatRecord, 'periodCode' | 'metainfo' | 'dayOnDay'>): RunStatsTaskBinding | null {
  const taskCodeCandidates = [
    record.dayOnDay.compare_task_code,
    record.dayOnDay.trend_30d?.task_code,
    record.metainfo.compare_task_code,
  ]
  const taskNameCandidates = [
    record.dayOnDay.compare_task_name,
    record.dayOnDay.trend_30d?.task_name,
    record.metainfo.compare_task_name,
  ]

  const taskCode = taskCodeCandidates.find((value) => normalizeNonEmptyString(value)) ?? ''
  if (!taskCode || !record.periodCode) return null

  const taskName = taskNameCandidates.find((value) => normalizeNonEmptyString(value))
    ?? FALLBACK_TASK_NAME_BY_CODE[taskCode]
    ?? taskCode

  return {
    taskCode,
    taskName,
  }
}

export function buildRunStatsTaskLookupFromCurrentRecords(records: Array<Pick<StatRecord, 'periodCode' | 'metainfo' | 'dayOnDay'>>) {
  const periodTaskMap: Record<string, RunStatsTaskBinding> = {}

  records.forEach((record) => {
    const binding = resolveCurrentTaskBinding(record)
    if (!binding || periodTaskMap[record.periodCode]) return
    periodTaskMap[record.periodCode] = binding
  })

  return hydrateRunStatsTaskLookup(
    sortTaskCatalogEntries(
      Array.from(
        new Map(
          Object.values(periodTaskMap).map((item) => [item.taskCode, item] as const),
        ).values(),
      ),
    ),
    periodTaskMap,
    Object.keys(periodTaskMap),
  )
}

export function buildCurrentRunStatsQueryDefaults(data: RunStatsData, taskData: RunStatsTaskData): CurrentRunStatsQueryDefaults {
  const latestSummary = data.periodSummaries[0]
  if (!latestSummary) return EMPTY_CURRENT_RUN_STATS_QUERY_DEFAULTS

  const binding = taskData.periodTaskMap[latestSummary.periodCode]
  return {
    executionDate: extractPeriodDateKey(latestSummary.periodCode) || extractExecutionDateKey(latestSummary.executedAt),
    taskCode: binding?.taskCode ?? '',
    taskName: binding?.taskName ?? '',
    periodCode: latestSummary.periodCode,
  }
}

export function buildCurrentRunStatsQueryDefaultsFromJobRows(jobRows: RawStatJobRecord[]): CurrentRunStatsQueryDefaults {
  const latestJob = jobRows.find((row) => {
    const periodCode = getRawStatJobPeriodCode(row)
    const taskCode = getRawStatTaskCode(row)
    return Boolean(periodCode && taskCode)
  })
  if (!latestJob) return EMPTY_CURRENT_RUN_STATS_QUERY_DEFAULTS

  const periodCode = getRawStatJobPeriodCode(latestJob)
  const taskCode = getRawStatTaskCode(latestJob)
  const taskName = getRawStatTaskName(latestJob) || FALLBACK_TASK_NAME_BY_CODE[taskCode] || taskCode
  const executionDate = extractPeriodDateKey(periodCode) || extractExecutionDateKey(getRawStatJobExecuteTime(latestJob))

  return {
    executionDate,
    taskCode,
    taskName,
    periodCode,
  }
}

function logStatSourceError(action: string, error: unknown, meta?: Record<string, unknown>) {
  const message = toErrorMessage(error, action)
  const cacheKey = `${action}:${message}:${JSON.stringify(meta ?? {})}`
  if (statSourceErrorLogCache.has(cacheKey)) return
  statSourceErrorLogCache.add(cacheKey)
  console.error('[stat-source]', {
    action,
    message,
    ...meta,
  })
}

function parseStatDateTime(value: unknown): Date | null {
  const text = String(value ?? '').trim()
  if (!text) return null

  const normalized = text.replace(' ', 'T')
  const native = new Date(normalized)
  if (!Number.isNaN(native.getTime())) return native

  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!matched) return null

  const [, year, month, day, hour = '00', minute = '00', second = '00'] = matched
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
}

export function formatDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function extractExecutionDateKey(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return formatDateInputValue(date)
  }
  return value.trim().slice(0, 10)
}

export function extractPeriodDateKey(periodCode: string) {
  const normalized = String(periodCode ?? '').trim()
  const matched = normalized.match(/^(\d{4})(\d{2})(\d{2})_/)
  if (!matched) return ''
  return `${matched[1]}-${matched[2]}-${matched[3]}`
}

function sortRunStatsRecords(records: StatRecord[]) {
  return [...records]
    .filter((item) => item.periodCode)
    .sort((a, b) => {
      if (a.periodCode !== b.periodCode) return b.periodCode.localeCompare(a.periodCode)
      return Number(b.id) - Number(a.id)
    })
}

function buildRunStatsDataFromSources(records: StatRecord[], summaryRecords: StatRecord[] = records): RunStatsData {
  const sortedRecords = sortRunStatsRecords(records)
  const sortedSummaryRecords = sortRunStatsRecords(summaryRecords)
  const summarySource = sortedSummaryRecords.length > 0 ? sortedSummaryRecords : sortedRecords
  const periods = Array.from(new Set(summarySource.map((item) => item.periodCode))).sort((a, b) => b.localeCompare(a))
  const periodSummaries = buildPeriodSummaries(summarySource)
  return {
    records: sortedRecords,
    summaryRecords: sortedSummaryRecords,
    periods,
    periodSummaries,
  }
}

export function filterRunStatsDataByPeriods(data: RunStatsData, allowedPeriodCodes: Iterable<string>) {
  const allowed = new Set(
    Array.from(allowedPeriodCodes, (item) => String(item ?? '').trim()).filter(Boolean),
  )
  if (allowed.size === 0) return EMPTY_DATA

  return buildRunStatsDataFromSources(
    data.records.filter((item) => allowed.has(item.periodCode)),
    data.summaryRecords.filter((item) => allowed.has(item.periodCode)),
  )
}

function mergeRunStatsData(base: RunStatsData, incoming: RunStatsData): RunStatsData {
  const recordMap = new Map<string, StatRecord>()
  ;[...base.records, ...incoming.records].forEach((item) => {
    recordMap.set(item.id, item)
  })
  const summaryRecordMap = new Map<string, StatRecord>()
  ;[
    ...base.summaryRecords,
    ...incoming.summaryRecords,
    ...base.records,
    ...incoming.records,
  ].forEach((item) => {
    summaryRecordMap.set(item.id, item)
  })
  return buildRunStatsDataFromSources(Array.from(recordMap.values()), Array.from(summaryRecordMap.values()))
}

function markExecutionDatesLoaded(data: RunStatsData) {
  data.periodSummaries.forEach((summary) => {
    const key = extractPeriodDateKey(summary.periodCode) || extractExecutionDateKey(summary.executedAt)
    if (key) {
      statLoadedExecutionDates.add(key)
    }
  })
}

function markPeriodDetailsLoaded(data: RunStatsData) {
  data.records.forEach((record) => {
    if (record.periodCode) {
      statLoadedDetailPeriods.add(record.periodCode)
    }
  })
}

function resolvedBusinessTime(item: Pick<StatRecord, 'metainfo'>) {
  return parseStatDateTime(item.metainfo.last_record_update_time)
}

function resolvedBusinessTimeAgeDays(item: Pick<StatRecord, 'metainfo'>, periodEnd: Date) {
  const businessTime = resolvedBusinessTime(item)
  if (!businessTime) return null
  const businessDay = Date.UTC(businessTime.getFullYear(), businessTime.getMonth(), businessTime.getDate())
  const periodDay = Date.UTC(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate())
  return Math.max(0, Math.floor((periodDay - businessDay) / (24 * 60 * 60 * 1000)))
}

function compareByBusinessTimeDesc(a: StatRecord, b: StatRecord) {
  const aTime = resolvedBusinessTime(a)?.getTime() ?? 0
  const bTime = resolvedBusinessTime(b)?.getTime() ?? 0
  if (aTime !== bTime) return bTime - aTime
  return a.resourceCode.localeCompare(b.resourceCode, 'zh-CN')
}

function previousPeriodRecordCount(item: Pick<StatRecord, 'dayOnDay'>) {
  return numeric(item.dayOnDay.record_count?.previous)
}

function hasNoCurrentPeriodIncrement(item: Pick<StatRecord, 'dayOnDay'>) {
  return numeric(item.dayOnDay.record_count?.delta) <= 0
}

function compareStoppedByPreviousDesc(a: StatRecord, b: StatRecord) {
  const previousDiff = previousPeriodRecordCount(b) - previousPeriodRecordCount(a)
  if (previousDiff !== 0) return previousDiff
  return compareByBusinessTimeDesc(a, b)
}

function normalizeDataLayerCode(value: unknown): DataLayerCode {
  const text = String(value ?? '').trim().toUpperCase()
  if (!text) return 'OTHER'
  if (text.includes('ODS') || text.startsWith('ODS_')) return 'ODS'
  if (text.includes('DWD') || text.startsWith('DWD_')) return 'DWD'
  if (text.includes('DWS') || text.startsWith('DWS_')) return 'DWS'
  if (text.includes('ADS') || text.startsWith('ADS_')) return 'ADS'
  if (text.includes('DIM') || text.startsWith('DIM_')) return 'DIM'
  return 'OTHER'
}

function resolveDataLayerMeta(code: DataLayerCode) {
  const matched = DATA_LAYER_SEEDS.find((item) => item.key === code)
  if (matched) return matched
  return { key: 'OTHER', label: '其他/未识别', order: 999 }
}

function resolveResourceDataLayer(rawResource: RawStatRecord['data_resource']): {
  code: DataLayerCode
  name: string
} {
  const sourceTableList = parseJson<{ baseline_layer?: unknown; baseline_table?: unknown; tables?: Array<{ layer?: unknown; table_name?: unknown }> }>(
    rawResource?.source_tablelist,
    {},
  )
  const candidates = [
    sourceTableList.baseline_layer,
    ...(sourceTableList.tables ?? []).flatMap((item) => [item?.layer, item?.table_name]),
    sourceTableList.baseline_table,
  ]
  const code: DataLayerCode = candidates
    .map((item) => normalizeDataLayerCode(item))
    .find((item) => item !== 'OTHER') ?? 'OTHER'
  const meta = resolveDataLayerMeta(code)
  return {
    code,
    name: meta.label,
  }
}

function calcPeriodRatioDelta(current: number, previous: number | undefined) {
  if (typeof previous !== 'number' || !Number.isFinite(previous)) return 0
  if (previous <= 0) return current > 0 ? 1 : 0
  return (current - previous) / previous
}

export function businessTimeStatus(item: Pick<StatRecord, 'metainfo' | 'quality'>) {
  return String(item.metainfo.business_time_status ?? item.quality.business_time_status ?? '').trim()
}

export function hasBusinessTime(item: Pick<StatRecord, 'metainfo'>) {
  return Boolean(String(item.metainfo.last_record_update_time ?? '').trim())
}

const missingBusinessTimeStatuses = new Set(['not_configured', 'table_missing', 'field_missing', 'missing', 'invalid'])

export function isStaleBusinessTime(item: Pick<StatRecord, 'metainfo' | 'quality'>) {
  return businessTimeStatus(item) === 'stale' || numeric(item.quality.stale_business_time_count) > 0
}

export function isMissingBusinessTime(item: Pick<StatRecord, 'metainfo' | 'quality'>) {
  return !hasBusinessTime(item) || missingBusinessTimeStatuses.has(businessTimeStatus(item)) || numeric(item.quality.missing_business_time_count) > 0
}

export function isFreshBusinessTime(item: Pick<StatRecord, 'metainfo' | 'quality'>) {
  return hasBusinessTime(item) && !isMissingBusinessTime(item) && !isStaleBusinessTime(item)
}

export function businessTimeStatusLabel(status: string | null | undefined) {
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

export function attachDataResourcesToStatRows(rawRows: RawStatRecord[], resources: RawStatResource[]) {
  if (rawRows.length === 0 || resources.length === 0) return rawRows

  const resourceById = new Map(
    resources
      .map((resource) => {
        const id = normalizeStatSourceResourceId(resource.id)
        return id ? [id, resource] as const : null
      })
      .filter((entry): entry is readonly [string, RawStatResource] => Boolean(entry)),
  )

  return rawRows.map((row) => {
    if (row.data_resource) return row
    const resourceId = normalizeStatSourceResourceId(getRawStatResourceId(row))
    if (!resourceId) return row
    const resource = resourceById.get(resourceId)
    return resource ? { ...row, data_resource: resource } : row
  })
}

export function mapStatRecord(raw: RawStatRecord): StatRecord {
  const metainfo = parseJson<StatMetaInfo>(getRawStatMetainfoValue(raw), {})
  const dayOnDay = normalizeStatDayOnDay(getRawStatDayOnDayValue(raw))
  const quality = parseJson<StatQuality>(getRawStatQualityValue(raw), {})
  const errors = parseJson<Array<Record<string, unknown>>>(getRawStatErrorValue(raw), [])
  const latestPreviewData = normalizeLatestPreviewDataValue(getRawStatLatestPreviewValue(raw))
  const connectStatus = (quality.connect_status || getRawStatConnectStatus(raw) || '99') as ConnectStatusCode
  const dataLayer = resolveResourceDataLayer(raw.data_resource)
  const rawDomainCategoryId = raw.data_resource?.domain_category_id ?? raw.data_resource?.domainCategoryId ?? raw.data_resource?.domain_category?.id ?? ''
  const rawDomainCategoryName = raw.data_resource?.domain_category?.node_name
    ?? raw.data_resource?.domain_category?.nodeName
    ?? raw.data_resource?.domain_category?.name
    ?? ''

  return {
    id: String(getRawStatRowId(raw) ?? ''),
    periodCode: getRawStatPeriodCode(raw),
    executedAt: getRawStatCreatedAt(raw),
    resourceId: String(getRawStatResourceId(raw) ?? raw.data_resource?.id ?? ''),
    resourceTypeId: String(raw.data_resource?.data_resource_type_id ?? raw.data_resource?.dataResourceTypeId ?? '').trim(),
    resourceCode: String(raw.data_resource?.resource_code ?? raw.data_resource?.resourceCode ?? ''),
    resourceName: String(raw.data_resource?.resource_name ?? raw.data_resource?.resourceName ?? '未命名资源'),
    domainCategoryId: String(rawDomainCategoryId ?? '').trim(),
    domainCategoryName: String(rawDomainCategoryName ?? '').trim() || '未标注',
    dataLayerCode: dataLayer.code,
    dataLayerName: dataLayer.name,
    connectStatus,
    metainfo: {
      table_count: numeric(metainfo.table_count),
      field_count: numeric(metainfo.field_count),
      record_count: numeric(metainfo.record_count),
      storage_bytes: numeric(metainfo.storage_bytes),
      non_null_field_count: numeric(metainfo.non_null_field_count),
      last_record_update_time: metainfo.last_record_update_time ?? null,
      business_time_field_name: metainfo.business_time_field_name ?? null,
      business_time_field_description: metainfo.business_time_field_description ?? null,
      business_time_field_type: metainfo.business_time_field_type ?? null,
      business_time_raw_value: metainfo.business_time_raw_value ?? null,
      business_time_parser: metainfo.business_time_parser ?? null,
      business_time_trace_summary: metainfo.business_time_trace_summary ?? null,
      business_time_trace: (metainfo.business_time_trace ?? null) as Record<string, unknown> | null,
      business_time_suggested_field_name: metainfo.business_time_suggested_field_name ?? null,
      business_time_status: metainfo.business_time_status ?? null,
      business_time_age_days: metainfo.business_time_age_days == null ? null : numeric(metainfo.business_time_age_days),
      business_time_stale_threshold_days: metainfo.business_time_stale_threshold_days == null ? null : numeric(metainfo.business_time_stale_threshold_days),
      compare_task_code: metainfo.compare_task_code ?? null,
      compare_task_name: metainfo.compare_task_name ?? null,
      compare_execute_time: metainfo.compare_execute_time ?? null,
    },
    dayOnDay,
    quality: {
      connect_status: quality.connect_status,
      empty_table_count: numeric(quality.empty_table_count),
      error_table_count: numeric(quality.error_table_count),
      all_null_field_count: numeric(quality.all_null_field_count),
      stale_business_time_count: numeric(quality.stale_business_time_count),
      missing_business_time_count: numeric(quality.missing_business_time_count),
      business_time_status: quality.business_time_status ?? null,
      business_time_age_days: quality.business_time_age_days == null ? null : numeric(quality.business_time_age_days),
    },
    latestPreviewData,
    errorList: Array.isArray(errors) ? errors : [],
  }
}

export function buildStatDimensionSummaries(
  records: StatRecord[],
  selector: (item: StatRecord) => { key: string; label: string; order?: number },
  options?: { limit?: number; sortBy?: 'recordsDesc' | 'order'; seedGroups?: StatDimensionSeed[] },
): StatDimensionSummary[] {
  const bucket = new Map<string, StatDimensionSummary & { previousRecords: number }>()

  options?.seedGroups?.forEach((seed) => {
    bucket.set(seed.key, {
      key: seed.key,
      label: seed.label,
      order: seed.order,
      resourceCount: 0,
      totalRecords: 0,
      totalStorageBytes: 0,
      totalDeltaRecords: 0,
      totalDeltaRatio: 0,
      previousRecords: 0,
    })
  })

  records.forEach((item) => {
    const selected = selector(item)
    const currentRecords = item.metainfo.record_count ?? 0
    const previousRecords = item.dayOnDay.record_count?.previous
      ?? (typeof item.dayOnDay.record_count?.delta === 'number' ? currentRecords - item.dayOnDay.record_count.delta : 0)
    const existing = bucket.get(selected.key) ?? {
      key: selected.key,
      label: selected.label,
      order: selected.order ?? 999,
      resourceCount: 0,
      totalRecords: 0,
      totalStorageBytes: 0,
      totalDeltaRecords: 0,
      totalDeltaRatio: 0,
      previousRecords: 0,
    }

    existing.resourceCount += 1
    existing.totalRecords += currentRecords
    existing.totalStorageBytes += item.metainfo.storage_bytes ?? 0
    existing.totalDeltaRecords += item.dayOnDay.record_count?.delta ?? 0
    existing.previousRecords += previousRecords
    bucket.set(selected.key, existing)
  })

  const rows = Array.from(bucket.values()).map((item) => ({
    key: item.key,
    label: item.label,
    order: item.order,
    resourceCount: item.resourceCount,
    totalRecords: item.totalRecords,
    totalStorageBytes: item.totalStorageBytes,
    totalDeltaRecords: item.totalDeltaRecords,
    totalDeltaRatio: calcPeriodRatioDelta(item.totalRecords, item.previousRecords),
  }))

  rows.sort((a, b) => {
    if (options?.sortBy === 'order') {
      if (a.order !== b.order) return a.order - b.order
      if (a.totalRecords !== b.totalRecords) return b.totalRecords - a.totalRecords
      return a.label.localeCompare(b.label, 'zh-CN')
    }
    if (a.totalRecords !== b.totalRecords) return b.totalRecords - a.totalRecords
    if (a.totalDeltaRecords !== b.totalDeltaRecords) return b.totalDeltaRecords - a.totalDeltaRecords
    return a.label.localeCompare(b.label, 'zh-CN')
  })

  return typeof options?.limit === 'number' ? rows.slice(0, options.limit) : rows
}

export function buildDimensionChangeTopItems(
  records: StatRecord[],
  selector: (item: StatRecord) => { key: string; label: string },
  limit = 5,
): StatDimensionChangeItem[] {
  const bucket = new Map<string, StatDimensionChangeItem>()

  records.forEach((item) => {
    const selected = selector(item)
    const currentRecords = item.metainfo.record_count ?? 0
    const previousRecords = item.dayOnDay.record_count?.previous
      ?? (typeof item.dayOnDay.record_count?.delta === 'number' ? currentRecords - item.dayOnDay.record_count.delta : 0)
    const deltaRecords = currentRecords - previousRecords
    const existing = bucket.get(selected.key) ?? {
      key: selected.key,
      label: selected.label,
      resourceCount: 0,
      currentRecords: 0,
      previousRecords: 0,
      deltaRecords: 0,
      deltaRatio: 0,
    }

    existing.resourceCount += 1
    existing.currentRecords += currentRecords
    existing.previousRecords += previousRecords
    existing.deltaRecords += deltaRecords
    bucket.set(selected.key, existing)
  })

  const rows = Array.from(bucket.values())
    .map((item) => ({
      ...item,
      deltaRatio: calcPeriodRatioDelta(item.currentRecords, item.previousRecords),
    }))
    .filter((item) => item.deltaRecords !== 0)

  rows.sort((a, b) => {
    const deltaAbsDiff = Math.abs(b.deltaRecords) - Math.abs(a.deltaRecords)
    if (deltaAbsDiff !== 0) return deltaAbsDiff
    if (a.currentRecords !== b.currentRecords) return b.currentRecords - a.currentRecords
    return a.label.localeCompare(b.label, 'zh-CN')
  })

  return rows.slice(0, Math.max(limit, 0))
}

export function buildResourceRecordChangeTopItems(
  currentRecords: StatRecord[],
  previousRecords: StatRecord[] = [],
  limit = 5,
): ResourceRecordChangeItem[] {
  const currentByResource = new Map<string, StatRecord>()
  const previousByResource = new Map<string, StatRecord>()
  const keyOf = (item: StatRecord) => item.resourceId || item.resourceCode || item.id

  currentRecords.forEach((item) => {
    currentByResource.set(keyOf(item), item)
  })
  previousRecords.forEach((item) => {
    previousByResource.set(keyOf(item), item)
  })

  const changes: ResourceRecordChangeItem[] = []

  currentByResource.forEach((current, key) => {
    const previous = previousByResource.get(key)
    const currentValue = current.metainfo.record_count ?? 0
    const previousValue = previous
      ? (previous.metainfo.record_count ?? 0)
      : (
          current.dayOnDay.record_count?.previous
          ?? (typeof current.dayOnDay.record_count?.delta === 'number'
            ? currentValue - current.dayOnDay.record_count.delta
            : 0)
        )
    const deltaRecords = currentValue - previousValue
    if (deltaRecords === 0) return

    changes.push({
      key,
      resourceId: current.resourceId || previous?.resourceId || '',
      resourceCode: current.resourceCode || previous?.resourceCode || '-',
      resourceName: current.resourceName || previous?.resourceName || '未命名资源',
      currentRecords: currentValue,
      previousRecords: previousValue,
      deltaRecords,
      deltaRatio: calcPeriodRatioDelta(currentValue, previousValue),
    })
  })

  previousByResource.forEach((previous, key) => {
    if (currentByResource.has(key)) return
    const previousValue = previous.metainfo.record_count ?? 0
    if (previousValue === 0) return

    changes.push({
      key,
      resourceId: previous.resourceId || '',
      resourceCode: previous.resourceCode || '-',
      resourceName: previous.resourceName || '未命名资源',
      currentRecords: 0,
      previousRecords: previousValue,
      deltaRecords: -previousValue,
      deltaRatio: calcPeriodRatioDelta(0, previousValue),
    })
  })

  changes.sort((a, b) => {
    const absDiff = Math.abs(b.deltaRecords) - Math.abs(a.deltaRecords)
    if (absDiff !== 0) return absDiff
    return b.currentRecords - a.currentRecords
  })

  return changes.slice(0, Math.max(limit, 0))
}

function buildPeriodSummaries(records: StatRecord[]): PeriodSummary[] {
  const bucket = new Map<string, StatRecord[]>()
  for (const row of records) {
    if (!row.periodCode) continue
    const list = bucket.get(row.periodCode) ?? []
    list.push(row)
    bucket.set(row.periodCode, list)
  }

  const summaries: PeriodSummary[] = []
  for (const [periodCode, list] of bucket.entries()) {
    const executedAt = list
      .map((item) => item.executedAt)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] ?? ''
    const resources = list.length
    const totalRecords = list.reduce((sum, item) => sum + numeric(item.metainfo.record_count), 0)
    const totalStorageBytes = list.reduce((sum, item) => sum + numeric(item.metainfo.storage_bytes), 0)
    const totalFields = list.reduce((sum, item) => sum + numeric(item.metainfo.field_count), 0)
    const normalCount = list.filter((item) => item.connectStatus === '01').length
    const warningCount = list.filter((item) => item.connectStatus === '04').length
    const errorCount = list.filter((item) => item.connectStatus === '02' || item.connectStatus === '99').length
    const freshResourceCount = list.filter(isFreshBusinessTime).length
    const staleResourceCount = list.filter(isStaleBusinessTime).length
    const missingBusinessTimeCount = list.filter(isMissingBusinessTime).length
    summaries.push({
      periodCode,
      executedAt,
      resources,
      totalRecords,
      totalStorageBytes,
      avgFieldCount: resources > 0 ? totalFields / resources : 0,
      normalCount,
      warningCount,
      errorCount,
      freshResourceCount,
      staleResourceCount,
      missingBusinessTimeCount,
      freshnessRate: resources > 0 ? freshResourceCount / resources : 0,
    })
  }

  summaries.sort((a, b) => b.periodCode.localeCompare(a.periodCode))
  return summaries
}

export const FRESHNESS_STOPPED_BAND_LABELS = {
  threeDayStopped: '3日断更（3 ~ 7日）',
  weeklyStopped: '周断更（8 ~ 30日）',
  monthlyStopped: '月断更（31 ~ 180日）',
  yearlyStopped: '年断更（181 ~ 360日）',
  longTermStopped: '长期断更（361日及以上）',
} as const

export const FRESHNESS_STOPPED_BAND_NOTES = {
  threeDayStopped: '业务时间距统计周期结束时间为 3 ~ 7 日',
  weeklyStopped: '业务时间距统计周期结束时间为 8 ~ 30 日',
  monthlyStopped: '业务时间距统计周期结束时间为 31 ~ 180 日',
  yearlyStopped: '业务时间距统计周期结束时间为 181 ~ 360 日',
  longTermStopped: '业务时间距统计周期结束时间为 361 日及以上',
} as const

export function buildFreshnessTopGroups(records: StatRecord[], periodEndAt: string): FreshnessTopGroups {
  const periodEnd = parseStatDateTime(periodEndAt)
  if (!periodEnd) {
    return {
      latestUpdated: [],
      threeDayStopped: [],
      yearlyStopped: [],
      monthlyStopped: [],
      weeklyStopped: [],
      longTermStopped: [],
      threeDayStoppedCount: 0,
      yearlyStoppedCount: 0,
      monthlyStoppedCount: 0,
      weeklyStoppedCount: 0,
      longTermStoppedCount: 0,
    }
  }

  const eligibleWithAge = records
    .filter((item) => resolvedBusinessTime(item) && !isMissingBusinessTime(item))
    .map((item) => ({
      item,
      ageDays: resolvedBusinessTimeAgeDays(item, periodEnd),
    }))
    .filter((entry): entry is { item: StatRecord; ageDays: number } => entry.ageDays !== null)

  const eligible = eligibleWithAge.map((entry) => entry.item)
  const stoppedEligible = new Set(eligible.filter(hasNoCurrentPeriodIncrement))
  const longTermStoppedAll = eligibleWithAge.filter((entry) => entry.ageDays >= 361).map((entry) => entry.item)
  const yearlyStoppedAll = eligibleWithAge.filter((entry) => entry.ageDays >= 181 && entry.ageDays <= 360).map((entry) => entry.item)
  const monthlyStoppedAll = eligibleWithAge.filter((entry) => entry.ageDays >= 31 && entry.ageDays <= 180).map((entry) => entry.item)
  const weeklyStoppedAll = eligibleWithAge.filter((entry) => entry.ageDays >= 8 && entry.ageDays <= 30).map((entry) => entry.item)
  const threeDayStoppedAll = eligibleWithAge.filter((entry) => entry.ageDays >= 3 && entry.ageDays <= 7).map((entry) => entry.item)

  const toStoppedTop5 = (items: StatRecord[]) => items
    .filter((item) => stoppedEligible.has(item))
    .sort(compareStoppedByPreviousDesc)
    .slice(0, 5)

  return {
    latestUpdated: [...eligible].sort(compareByBusinessTimeDesc).slice(0, 5),
    threeDayStopped: toStoppedTop5(threeDayStoppedAll),
    yearlyStopped: toStoppedTop5(yearlyStoppedAll),
    monthlyStopped: toStoppedTop5(monthlyStoppedAll),
    weeklyStopped: toStoppedTop5(weeklyStoppedAll),
    longTermStopped: toStoppedTop5(longTermStoppedAll),
    threeDayStoppedCount: threeDayStoppedAll.length,
    yearlyStoppedCount: yearlyStoppedAll.length,
    monthlyStoppedCount: monthlyStoppedAll.length,
    weeklyStoppedCount: weeklyStoppedAll.length,
    longTermStoppedCount: longTermStoppedAll.length,
  }
}

export function buildRunStatsData(rawRows: RawStatRecord[]): RunStatsData {
  const records = rawRows.map(mapStatRecord)
  return buildRunStatsDataFromSources(records)
}

type StatListPayload = {
  source: StatSourceDescriptor | null
  data: RawStatRecord[]
  meta?: {
    totalPage?: number
  }
}

type StatJobListPayload = {
  source: StatSourceDescriptor | null
  data: RawStatJobRecord[]
  meta?: {
    totalPage?: number
  }
}

type StatTaskListPayload = {
  source: StatSourceDescriptor | null
  data: RawStatTaskRecord[]
  meta?: {
    totalPage?: number
  }
}

function buildRolelessStatSourceHeaders(extraHeaders?: Record<string, string>) {
  const headers: Record<string, string> = {}
  const locale = normalizeNonEmptyString(nocobaseClient.auth?.locale)
  const authenticator = normalizeNonEmptyString(nocobaseClient.auth?.authenticator)
  const token = normalizeNonEmptyString(nocobaseClient.auth?.token)

  if (locale) {
    headers['X-Locale'] = locale
  }
  if (authenticator) {
    headers['X-Authenticator'] = authenticator
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return {
    ...headers,
    ...(extraHeaders ?? {}),
  }
}

function buildRolelessStatSourceUrl(resourceName: string, params: Record<string, unknown>) {
  const baseURL = normalizeNonEmptyString(nocobaseClient.axios?.defaults?.baseURL)
  if (!baseURL) {
    throw new Error('未配置后台 API 地址')
  }

  const url = new URL(`./${resourceName}:list`, baseURL)
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (key === 'filter' && typeof value === 'object') {
      url.searchParams.set(key, JSON.stringify(value))
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null || item === '') return
        url.searchParams.append(key, String(item))
      })
      return
    }
    url.searchParams.set(key, String(value))
  })
  return url.toString()
}

async function rolelessListStatSourceResource<T>(
  resourceName: string,
  params: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  if (typeof fetch !== 'function') {
    throw new Error('当前环境不支持 fetch')
  }

  const response = await fetch(buildRolelessStatSourceUrl(resourceName, params), {
    method: 'GET',
    headers: buildRolelessStatSourceHeaders(headers),
  })

  const rawText = await response.text()
  const payload = parseJson<{ data?: T[]; meta?: { totalPage?: number }; errors?: Array<{ message?: string }> } | null>(rawText, null)

  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || rawText || `HTTP ${response.status}`
    throw new Error(message)
  }

  return payload
}

async function loadStatTaskSourceDescriptor() {
  if (statTaskSourceDescriptorCache !== undefined) return statTaskSourceDescriptorCache

  if (!statTaskSourceDescriptorPromise) {
    statTaskSourceDescriptorPromise = Promise.resolve(DIRECT_STAT_TASK_SOURCE)
      .then((descriptor) => {
        statTaskSourceDescriptorCache = descriptor
        return descriptor
      })
      .finally(() => {
        statTaskSourceDescriptorPromise = null
      })
  }

  return statTaskSourceDescriptorPromise
}

async function loadStatSourceDescriptorChain() {
  return buildStatSourceDescriptorChain(DIRECT_STAT_SOURCE)
}

async function loadCurrentStatSourceDescriptorChain() {
  return buildStatSourceDescriptorChain(DIRECT_CURRENT_STAT_SOURCE)
}

async function loadStatJobSourceDescriptorChain() {
  return buildStatSourceDescriptorChain(DIRECT_STAT_JOB_SOURCE)
}

async function listStatTaskRows(params: {
  page: number
  pageSize: number
  sort?: string | null
  filter?: Record<string, unknown>
}): Promise<StatTaskListPayload> {
  const source = await loadStatTaskSourceDescriptor()
  if (!source) {
    return {
      source: null,
      data: [],
      meta: { totalPage: 1 },
    }
  }

  try {
    const normalizedSort = params.sort === null ? undefined : (params.sort ?? 'task_code')
    const payload =
      typeof fetch === 'function'
        ? await rolelessListStatSourceResource<RawStatTaskRecord>(
            source.resourceName,
            {
              page: params.page,
              pageSize: params.pageSize,
              sort: normalizedSort,
              filter: params.filter,
            },
            source.headers,
          )
        : (
            await nocobaseClient.resource(source.resourceName, undefined, source.headers).list({
              page: params.page,
              pageSize: params.pageSize,
              sort: normalizedSort,
              filter: params.filter,
            })
          ).data as { data?: RawStatTaskRecord[]; meta?: { totalPage?: number } } | null
    return {
      source,
      data: payload?.data ?? [],
      meta: payload?.meta,
    }
  } catch (error) {
    logStatSourceError('读取统计任务配置表失败，统计任务下拉框将为空', error, {
      resourceName: source.resourceName,
      dataSourceKey: source.dataSourceKey,
    })
    return {
      source: null,
      data: [],
      meta: { totalPage: 1 },
    }
  }
}

async function listStatSourceRows(source: StatSourceDescriptor, params: {
  page: number
  pageSize: number
  sort?: string | null
  filter?: Record<string, unknown>
  fields?: string[]
}): Promise<StatListPayload> {
  try {
    const normalizedSort = params.sort === null ? undefined : (params.sort ?? LATEST_STAT_SORT)
    const fetchRequestParams = {
      page: params.page,
      pageSize: params.pageSize,
      sort: normalizedSort,
      filter: params.filter,
      'fields[]': params.fields,
    }
    const payload =
      typeof fetch === 'function'
        ? await rolelessListStatSourceResource<RawStatRecord>(
            source.resourceName,
            fetchRequestParams,
            source.headers,
          )
        : (
            await nocobaseClient.resource(source.resourceName, undefined, source.headers).list({
              page: params.page,
              pageSize: params.pageSize,
              sort: normalizedSort,
              filter: params.filter,
              fields: params.fields,
            })
          ).data as { data?: RawStatRecord[]; meta?: { totalPage?: number } } | null
    return {
      source,
      data: payload?.data ?? [],
      meta: payload?.meta,
    }
  } catch (error) {
    logStatSourceError('读取外部统计表失败，已回退为空统计结果', error, {
      resourceName: source.resourceName,
      dataSourceKey: source.dataSourceKey,
    })
    return {
      source: null,
      data: [],
      meta: { totalPage: 1 },
    }
  }
}

async function listCurrentStatSourceRows(source: StatSourceDescriptor, params: {
  page: number
  pageSize: number
  sort?: string | null
  filter?: Record<string, unknown>
  fields?: string[]
}): Promise<StatListPayload> {
  try {
    const normalizedSort = params.sort === null ? undefined : (params.sort ?? LATEST_STAT_SORT)
    const fetchRequestParams = {
      page: params.page,
      pageSize: params.pageSize,
      sort: normalizedSort,
      filter: params.filter,
      'fields[]': params.fields,
    }
    const payload =
      typeof fetch === 'function'
        ? await rolelessListStatSourceResource<RawStatRecord>(
            source.resourceName,
            fetchRequestParams,
            source.headers,
          )
        : (
            await nocobaseClient.resource(source.resourceName, undefined, source.headers).list({
              page: params.page,
              pageSize: params.pageSize,
              sort: normalizedSort,
              filter: params.filter,
              fields: params.fields,
            })
          ).data as { data?: RawStatRecord[]; meta?: { totalPage?: number } } | null
    return {
      source,
      data: payload?.data ?? [],
      meta: payload?.meta,
    }
  } catch (error) {
    logStatSourceError('读取 current 外部统计表失败，最新快照查询将返回空结果', error, {
      resourceName: source.resourceName,
      dataSourceKey: source.dataSourceKey,
    })
    return {
      source: null,
      data: [],
      meta: { totalPage: 1 },
    }
  }
}

async function listStatJobSourceRows(source: StatSourceDescriptor, params: {
  page: number
  pageSize: number
  sort?: string | null
  filter?: Record<string, unknown>
}): Promise<StatJobListPayload> {
  try {
    const normalizedSort = params.sort === null ? undefined : (params.sort ?? LATEST_STAT_SORT)
    const payload =
      typeof fetch === 'function'
        ? await rolelessListStatSourceResource<RawStatJobRecord>(
            source.resourceName,
            {
              page: params.page,
              pageSize: params.pageSize,
              sort: normalizedSort,
              filter: params.filter,
            },
            source.headers,
          )
        : (
            await nocobaseClient.resource(source.resourceName, undefined, source.headers).list({
              page: params.page,
              pageSize: params.pageSize,
              sort: normalizedSort,
              filter: params.filter,
            })
          ).data as { data?: RawStatJobRecord[]; meta?: { totalPage?: number } } | null
    return {
      source,
      data: payload?.data ?? [],
      meta: payload?.meta,
    }
  } catch (error) {
    logStatSourceError('读取外部统计任务表失败，统计任务筛选将仅展示任务列表', error, {
      resourceName: source.resourceName,
      dataSourceKey: source.dataSourceKey,
    })
    return {
      source: null,
      data: [],
      meta: { totalPage: 1 },
    }
  }
}

function buildRawStatRowMergeKey(row: RawStatRecord) {
  const periodCode = getRawStatPeriodCode(row)
  const resourceId = normalizeStatSourceResourceId(getRawStatResourceId(row))
  const rowId = String(getRawStatRowId(row) ?? '').trim()

  if (periodCode && resourceId) {
    return `${periodCode}::${resourceId}`
  }

  if (periodCode && rowId) {
    return `${periodCode}::id::${rowId}`
  }

  return rowId
}

function isRawStatRowPreferred(next: RawStatRecord, current: RawStatRecord) {
  const nextUpdatedAt = getRawStatCreatedAt(next)
  const currentUpdatedAt = getRawStatCreatedAt(current)
  if (nextUpdatedAt !== currentUpdatedAt) {
    return nextUpdatedAt > currentUpdatedAt
  }

  return String(getRawStatRowId(next) ?? '').localeCompare(String(getRawStatRowId(current) ?? ''), 'zh-CN') > 0
}

function mergeRawStatRowsByPriority(rowGroups: RawStatRecord[][]) {
  const rowMap = new Map<string, { row: RawStatRecord; priority: number }>()

  rowGroups.forEach((rows, priority) => {
    rows.forEach((row) => {
      const key = buildRawStatRowMergeKey(row)
      if (!key) return

      const existing = rowMap.get(key)
      if (!existing) {
        rowMap.set(key, { row, priority })
        return
      }

      if (priority < existing.priority) {
        rowMap.set(key, { row, priority })
        return
      }

      if (priority === existing.priority && isRawStatRowPreferred(row, existing.row)) {
        rowMap.set(key, { row, priority })
      }
    })
  })

  return Array.from(rowMap.values(), (entry) => entry.row)
}

function matchStatRowFilter(row: RawStatRecord, filter?: Record<string, unknown>) {
  if (!filter) return true

  if ('stat_period_code' in filter) {
    const statPeriodFilter = filter.stat_period_code
    if (statPeriodFilter && typeof statPeriodFilter === 'object' && !Array.isArray(statPeriodFilter)) {
      const startsWith = normalizeNonEmptyString((statPeriodFilter as Record<string, unknown>).$startsWith)
      if (startsWith && !getRawStatPeriodCode(row).startsWith(startsWith)) {
        return false
      }
    } else {
      const expectedPeriodCode = String(statPeriodFilter ?? '').trim()
      if (expectedPeriodCode && getRawStatPeriodCode(row) !== expectedPeriodCode) {
        return false
      }
    }
  }

  if ('data_resource_id' in filter) {
    const expectedResourceId = normalizeStatSourceResourceId(filter.data_resource_id)
    if (expectedResourceId && normalizeStatSourceResourceId(getRawStatResourceId(row)) !== expectedResourceId) {
      return false
    }
  }

  return true
}

function sanitizeCurrentStatFilter(filter?: Record<string, unknown>) {
  if (!filter) return undefined

  const { stat_period_code: _ignoredStatPeriodCode, ...rest } = filter
  return Object.keys(rest).length > 0 ? rest : undefined
}

function matchStatJobRowFilter(row: RawStatJobRecord, filter?: Record<string, unknown>) {
  if (!filter) return true

  if ('job_code' in filter) {
    const jobCodeFilter = filter.job_code
    if (jobCodeFilter && typeof jobCodeFilter === 'object' && !Array.isArray(jobCodeFilter)) {
      const startsWith = normalizeNonEmptyString((jobCodeFilter as Record<string, unknown>).$startsWith)
      if (startsWith && !getRawStatJobPeriodCode(row).startsWith(startsWith)) {
        return false
      }
    } else {
      const expectedPeriodCode = String(jobCodeFilter ?? '').trim()
      if (expectedPeriodCode && getRawStatJobPeriodCode(row) !== expectedPeriodCode) {
        return false
      }
    }
  }

  if ('stat_period_code' in filter) {
    const statPeriodFilter = filter.stat_period_code
    if (statPeriodFilter && typeof statPeriodFilter === 'object' && !Array.isArray(statPeriodFilter)) {
      const startsWith = normalizeNonEmptyString((statPeriodFilter as Record<string, unknown>).$startsWith)
      if (startsWith && !getRawStatJobPeriodCode(row).startsWith(startsWith)) {
        return false
      }
    } else {
      const expectedPeriodCode = String(statPeriodFilter ?? '').trim()
      if (expectedPeriodCode && getRawStatJobPeriodCode(row) !== expectedPeriodCode) {
        return false
      }
    }
  }

  if ('task_code' in filter) {
    const expectedTaskCode = normalizeNonEmptyString(filter.task_code)
    if (expectedTaskCode && getRawStatTaskCode(row) !== expectedTaskCode) {
      return false
    }
  }

  return true
}

function normalizeResourceFilterValues(resourceIds: string[]) {
  return resourceIds.map((resourceId) => {
    const numericId = Number(resourceId)
    return Number.isSafeInteger(numericId) ? numericId : resourceId
  })
}

function encodeResourceIdFilterLength(resourceIds: Array<number | string>) {
  return encodeURIComponent(JSON.stringify({
    id: {
      $in: resourceIds,
    },
  })).length
}

export function buildResourceIdFilterBatches(resourceIds: string[], maxEncodedLength = STAT_RESOURCE_FILTER_MAX_ENCODED_LENGTH) {
  const normalizedIds = normalizeResourceFilterValues(resourceIds)
  if (normalizedIds.length === 0) return []
  if (maxEncodedLength <= 0) return [normalizedIds]

  const batches: Array<Array<number | string>> = []
  let currentBatch: Array<number | string> = []

  normalizedIds.forEach((resourceId) => {
    const nextBatch = [...currentBatch, resourceId]
    const nextBatchEncodedLength = encodeResourceIdFilterLength(nextBatch)

    if (currentBatch.length > 0 && nextBatchEncodedLength > maxEncodedLength) {
      batches.push(currentBatch)
      currentBatch = [resourceId]
      return
    }

    currentBatch = nextBatch
  })

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

export function selectInitialRunStatsPeriodCodes(periodCodes: string[], limit = INITIAL_RUN_STATS_PERIOD_LIMIT) {
  const safeLimit = Math.max(0, Math.trunc(limit))
  if (safeLimit === 0) return []
  return periodCodes
    .map((periodCode) => String(periodCode ?? '').trim())
    .filter(Boolean)
    .slice(0, safeLimit)
}

async function loadStatSourceResourcesByIds(resourceIds: string[]) {
  const normalizedIds = Array.from(new Set(resourceIds.map((item) => normalizeStatSourceResourceId(item)).filter(Boolean)))
  if (normalizedIds.length === 0) return new Map<string, RawStatResource>()

  const missingIds = normalizedIds.filter((resourceId) => !statSourceResourceMapCache?.has(resourceId))
  if (missingIds.length > 0) {
    const idBatches = buildResourceIdFilterBatches(missingIds)
    try {
      const rowsByBatch = await Promise.all(
        idBatches.map((resourceIdBatch) =>
          loadAllPages<RawStatResource>(async ({ page, pageSize }) => {
            const response = await nocobaseClient.resource('eco_data_resources').list({
              page,
              pageSize,
              sort: 'id',
              fields: [...STAT_RESOURCE_FIELDS],
              appends: [...STAT_RESOURCE_APPENDS],
              filter: {
                id: {
                  $in: resourceIdBatch,
                },
              },
            })
            const payload = response.data as { data?: RawStatResource[]; meta?: { totalPage?: number } } | null
            return {
              data: payload?.data ?? [],
              meta: payload?.meta,
            }
          }, STAT_RESOURCE_PAGE_SIZE),
        ),
      )
      const rows = rowsByBatch.flat()

      const nextCache = new Map(statSourceResourceMapCache ?? [])
      rows.forEach((row) => {
        const id = normalizeStatSourceResourceId(row.id)
        if (id) nextCache.set(id, row)
      })
      statSourceResourceMapCache = nextCache
    } catch (error) {
      logStatSourceError('按资源 ID 读取数据资源基础信息失败，统计结果将缺少部分资源关系', error, {
        resourceCount: missingIds.length,
        batchCount: idBatches.length,
      })
    }
  }

  return new Map(
    normalizedIds
      .map((resourceId) => {
        const resource = statSourceResourceMapCache?.get(resourceId)
        return resource ? [resourceId, resource] as const : null
      })
      .filter((entry): entry is readonly [string, RawStatResource] => Boolean(entry)),
  )
}

async function attachStatSourceResources(rawRows: RawStatRecord[]) {
  if (rawRows.length === 0) return rawRows
  const resourceMap = await loadStatSourceResourcesByIds(
    rawRows.map((row) => normalizeStatSourceResourceId(getRawStatResourceId(row))),
  )
  return attachDataResourcesToStatRows(rawRows, Array.from(resourceMap.values()))
}

async function loadStatTaskCatalog() {
  if (statTaskCatalogCache !== null) return statTaskCatalogCache

  if (!statTaskCatalogPromise) {
    statTaskCatalogPromise = loadAllPages<RawStatTaskRecord>(async ({ page, pageSize }) => {
      const payload = await listStatTaskRows({
        page,
        pageSize,
        sort: 'task_code',
      })
      return {
        data: payload.data.filter((row) => Boolean(getRawStatTaskCode(row) && getRawStatTaskName(row))),
        meta: payload.meta,
      }
    }, 200)
      .then((rows) => {
        const catalog = normalizeRunStatsTaskCatalog(rows)
        statTaskCatalogCache = catalog
        return catalog
      })
      .catch((error) => {
        logStatSourceError('读取统计任务目录失败，统计任务下拉框将为空', error)
        statTaskCatalogCache = []
        return []
      })
      .finally(() => {
        statTaskCatalogPromise = null
      })
  }

  return statTaskCatalogPromise
}

async function fetchStatRows(options: {
  filter?: Record<string, unknown>
  sort?: string | null
  pageSize?: number
  compact?: boolean
  attachResources?: boolean
  fields?: readonly string[]
}): Promise<RawStatRecord[]> {
  const sources = await loadStatSourceDescriptorChain()
  if (sources.length === 0) return []

  const rowsBySource = await Promise.all(
    sources.map((source) =>
      loadAllPages<RawStatRecord>(async ({ page, pageSize }) => {
        const payload = await listStatSourceRows(source, {
          page,
          pageSize,
          filter: options.filter,
          sort: options.sort,
          fields: options.compact === false ? undefined : [...(options.fields ?? STAT_ROW_FIELDS)],
        })
        const rows = payload.data.filter((row) => matchStatRowFilter(row, options.filter))
        return {
          data: rows,
          meta: payload.meta,
        }
      }, options.pageSize ?? 200),
    ),
  )
  const rawRows = mergeRawStatRowsByPriority(rowsBySource)

  if (rawRows.length === 0 || options.attachResources === false) return rawRows
  return attachStatSourceResources(rawRows)
}

async function fetchCurrentStatRows(options: {
  filter?: Record<string, unknown>
  sort?: string | null
  pageSize?: number
  compact?: boolean
  attachResources?: boolean
  fields?: readonly string[]
}): Promise<RawStatRecord[]> {
  const sources = await loadCurrentStatSourceDescriptorChain()
  if (sources.length === 0) return []
  const sanitizedFilter = sanitizeCurrentStatFilter(options.filter)

  const rowsBySource = await Promise.all(
    sources.map((source) =>
      loadAllPages<RawStatRecord>(async ({ page, pageSize }) => {
        const payload = await listCurrentStatSourceRows(source, {
          page,
          pageSize,
          filter: sanitizedFilter,
          sort: options.sort,
          fields: options.compact === false ? undefined : [...(options.fields ?? STAT_ROW_FIELDS)],
        })
        const rows = payload.data.filter((row) => matchStatRowFilter(row, sanitizedFilter))
        return {
          data: rows,
          meta: payload.meta,
        }
      }, options.pageSize ?? 200),
    ),
  )
  const rawRows = mergeRawStatRowsByPriority(rowsBySource)

  if (rawRows.length === 0 || options.attachResources === false) return rawRows
  return attachStatSourceResources(rawRows)
}

async function fetchStatJobRows(options: {
  filter?: Record<string, unknown>
  sort?: string | null
  pageSize?: number
}) {
  const sources = await loadStatJobSourceDescriptorChain()
  if (sources.length === 0) return []

  const rowsBySource = await Promise.all(
    sources.map((source) =>
      loadAllPages<RawStatJobRecord>(async ({ page, pageSize }) => {
        const payload = await listStatJobSourceRows(source, {
          page,
          pageSize,
          filter: options.filter,
          sort: options.sort,
        })
        return {
          data: (payload.data ?? []).filter((row) => matchStatJobRowFilter(row, options.filter)),
          meta: payload.meta,
        }
      }, options.pageSize ?? STAT_JOB_PAGE_SIZE),
    ),
  )

  return mergeRunStatsJobRowsByPriority(rowsBySource)
}

async function fetchRecentStatJobRows() {
  if (recentStatJobRowsCache) return recentStatJobRowsCache

  if (!recentStatJobRowsPromise) {
    recentStatJobRowsPromise = fetchStatJobRows({
      sort: '-job_code',
      pageSize: DATE_SCOPED_PERIOD_DISCOVERY_PAGE_SIZE,
    })
      .then((rows) => {
        recentStatJobRowsCache = rows
        return rows
      })
      .finally(() => {
        recentStatJobRowsPromise = null
      })
  }

  return recentStatJobRowsPromise
}

async function fetchStatJobRowsByExecutionDate(dateKey: string): Promise<RawStatJobRecord[]> {
  const normalizedDateKey = extractExecutionDateKey(dateKey)
  if (!normalizedDateKey) return []

  const periodDatePrefix = normalizedDateKey.replaceAll('-', '')
  if (!periodDatePrefix) return []

  const filter = {
    job_code: {
      $startsWith: `${periodDatePrefix}_`,
    },
  }
  return fetchStatJobRows({
    filter,
    sort: '-job_code',
    pageSize: STAT_JOB_PAGE_SIZE,
  })
}

function buildCachedRunStatsTaskLookup(
  dateKey: string,
  taskCatalog: RunStatsTaskCatalogEntry[],
  fallbackPeriodCodes: string[] = [],
) {
  const normalizedDateKey = extractExecutionDateKey(dateKey)
  if (!normalizedDateKey) return buildRunStatsTaskCatalogData(taskCatalog)
  return hydrateRunStatsTaskLookup(
    taskCatalog,
    normalizeRunStatsTaskPeriodMap(statTaskJobRowsByExecutionDateCache.get(normalizedDateKey) ?? []),
    fallbackPeriodCodes,
  )
}

async function ensureStatTaskJobRowsByExecutionDateLoaded(dateKey: string): Promise<RawStatJobRecord[]> {
  const normalizedDateKey = extractExecutionDateKey(dateKey)
  if (!normalizedDateKey) return []
  if (statTaskJobRowsByExecutionDateCache.has(normalizedDateKey)) {
    return statTaskJobRowsByExecutionDateCache.get(normalizedDateKey) ?? []
  }

  if (recentStatJobRowsCache || recentStatJobRowsPromise) {
    const cachedJobRows = recentStatJobRowsCache ?? await recentStatJobRowsPromise ?? []
    const dateScopedRows = filterStatJobRowsByExecutionDate(cachedJobRows, normalizedDateKey)
    statTaskJobRowsByExecutionDateCache.set(normalizedDateKey, dateScopedRows)
    return dateScopedRows
  }

  let requestPromise = statTaskDatePromises.get(normalizedDateKey)
  if (!requestPromise) {
    requestPromise = fetchStatJobRowsByExecutionDate(normalizedDateKey)
      .then((rows) => {
        statTaskJobRowsByExecutionDateCache.set(normalizedDateKey, rows)
        return rows
      })
      .catch((error) => {
        logStatSourceError('读取按日统计作业失败，统计任务筛选将为空', error, {
          dateKey: normalizedDateKey,
        })
        statTaskJobRowsByExecutionDateCache.set(normalizedDateKey, [])
        return []
      })
      .finally(() => {
        statTaskDatePromises.delete(normalizedDateKey)
      })
    statTaskDatePromises.set(normalizedDateKey, requestPromise)
  }

  return requestPromise
}

async function ensureRunStatsTaskExecutionDateLoaded(dateKey: string, fallbackPeriodCodes: string[] = []) {
  const normalizedDateKey = extractExecutionDateKey(dateKey)
  const [taskCatalog, rows] = await Promise.all([
    loadStatTaskCatalog(),
    ensureStatTaskJobRowsByExecutionDateLoaded(normalizedDateKey),
  ])
  if (!normalizedDateKey) {
    return buildRunStatsTaskCatalogData(taskCatalog)
  }

  return hydrateRunStatsTaskLookup(
    taskCatalog,
    normalizeRunStatsTaskPeriodMap(rows),
    fallbackPeriodCodes,
  )
}

export async function fetchRunStatsJobOptionsByExecutionDate(dateKey: string, taskCode: string) {
  const normalizedDateKey = extractExecutionDateKey(dateKey)
  const normalizedTaskCode = normalizeNonEmptyString(taskCode)
  if (!normalizedDateKey || !normalizedTaskCode) return []

  const rows = await ensureStatTaskJobRowsByExecutionDateLoaded(normalizedDateKey)
  return buildRunStatsJobOptions(rows, normalizedTaskCode)
}

export async function fetchRunStatsJobOptionsByTask(taskCode: string, limit = 200) {
  const normalizedTaskCode = normalizeNonEmptyString(taskCode)
  if (!normalizedTaskCode || limit <= 0) return []

  const rows = await fetchStatJobRows({
    filter: { task_code: normalizedTaskCode },
    sort: '-job_code',
    pageSize: Math.max(limit, STAT_JOB_PAGE_SIZE),
  })

  return buildRunStatsJobOptions(rows, normalizedTaskCode).slice(0, limit)
}

async function fetchRecentPeriodCodesByExecutionDate(dateKey: string, limit: number): Promise<string[]> {
  const normalizedDateKey = extractExecutionDateKey(dateKey)
  if (!normalizedDateKey || limit <= 0) return []

  const periodCodes: string[] = []
  const seen = new Set<string>()

  const rows = await ensureStatTaskJobRowsByExecutionDateLoaded(normalizedDateKey)
  rows.forEach((row) => {
    const periodCode = getRawStatJobPeriodCode(row)
    if (!periodCode || seen.has(periodCode) || periodCodes.length >= limit) return
    seen.add(periodCode)
    periodCodes.push(periodCode)
  })

  return periodCodes
}

async function fetchStatRowsByExecutionDate(dateKey: string): Promise<RawStatRecord[]> {
  const periodCodes = await fetchRecentPeriodCodesByExecutionDate(dateKey, DATE_SCOPED_PERIOD_DISCOVERY_LIMIT)
  if (periodCodes.length === 0) return []

  const rawRowsByPeriod = await Promise.all(
    periodCodes.map((periodCode) =>
      fetchStatRows({
        filter: { stat_period_code: periodCode },
        sort: null,
        pageSize: EXACT_PERIOD_FETCH_PAGE_SIZE,
        attachResources: false,
      }),
    ),
  )

  return attachStatSourceResources(rawRowsByPeriod.flat())
}

async function fetchRecentPeriodCodes(limit: number): Promise<string[]> {
  if (limit <= 0) return []

  const rows = await fetchRecentStatJobRows()
  const periodCodes: string[] = []
  const seen = new Set<string>()

  rows.forEach((row) => {
    const periodCode = getRawStatJobPeriodCode(row)
    if (!periodCode || seen.has(periodCode) || periodCodes.length >= limit) return
    seen.add(periodCode)
    periodCodes.push(periodCode)
  })

  return periodCodes
}

async function fetchRunStatsInitialData(): Promise<RunStatsData> {
  const recentPeriodCodes = selectInitialRunStatsPeriodCodes(await fetchRecentPeriodCodes(2))
  if (recentPeriodCodes.length === 0) return EMPTY_DATA

  const rawRowsByPeriod = await Promise.all(
    recentPeriodCodes.map((periodCode) =>
      fetchStatRows({
        filter: { stat_period_code: periodCode },
        sort: '-id',
        pageSize: EXACT_PERIOD_FETCH_PAGE_SIZE,
        attachResources: false,
      }),
    ),
  )

  return buildRunStatsData(await attachStatSourceResources(rawRowsByPeriod.flat()))
}

async function fetchRunStatsData(): Promise<RunStatsData> {
  const rawRows = await fetchStatRows({
    sort: '-id',
  })
  return buildRunStatsData(rawRows)
}

async function fetchRunStatsByDate(dateKey: string): Promise<RunStatsData> {
  const rows = await fetchStatRowsByExecutionDate(dateKey)
  if (rows.length === 0) return EMPTY_DATA
  return buildRunStatsData(rows)
}

async function fetchRunStatsInitialDateData(): Promise<RunStatsData> {
  return fetchRunStatsInitialData()
}

async function ensureFullRunStatsData(): Promise<RunStatsData> {
  if (statCache && statCacheComplete) return statCache

  if (!statHydrationPromise) {
    statHydrationPromise = fetchRunStatsData()
      .then((payload) => {
        statCache = payload
        statCacheComplete = true
        markExecutionDatesLoaded(payload)
        markPeriodDetailsLoaded(payload)
        return payload
      })
      .finally(() => {
        statHydrationPromise = null
      })
  }

  return statHydrationPromise
}

async function ensureExecutionDateLoaded(dateKey: string): Promise<RunStatsData> {
  const normalizedDateKey = extractExecutionDateKey(dateKey)
  if (!normalizedDateKey) return statCache ?? EMPTY_DATA
  if (statCacheComplete) return statCache ?? EMPTY_DATA
  if (statLoadedExecutionDates.has(normalizedDateKey)) return statCache ?? EMPTY_DATA

  let requestPromise = statDatePromises.get(normalizedDateKey)
  if (!requestPromise) {
    requestPromise = fetchRunStatsByDate(normalizedDateKey)
      .then((payload) => {
        statLoadedExecutionDates.add(normalizedDateKey)
        markPeriodDetailsLoaded(payload)
        statCache = statCache ? mergeRunStatsData(statCache, payload) : payload
        return statCache
      })
      .finally(() => {
        statDatePromises.delete(normalizedDateKey)
      })
    statDatePromises.set(normalizedDateKey, requestPromise)
  }

  return requestPromise
}

async function fetchPeriodDetails(periodCode: string): Promise<RunStatsData> {
  const normalizedPeriodCode = String(periodCode ?? '').trim()
  if (!normalizedPeriodCode) return EMPTY_DATA

  const rows = await fetchStatRows({
    filter: { stat_period_code: normalizedPeriodCode },
    sort: '-id',
  })
  return buildRunStatsData(rows)
}

async function ensurePeriodLoaded(periodCode: string): Promise<RunStatsData> {
  const normalizedPeriodCode = String(periodCode ?? '').trim()
  if (!normalizedPeriodCode) return statCache ?? EMPTY_DATA
  if (statCacheComplete) return statCache ?? EMPTY_DATA
  if (statLoadedDetailPeriods.has(normalizedPeriodCode)) return statCache ?? EMPTY_DATA

  let requestPromise = statPeriodPromises.get(normalizedPeriodCode)
  if (!requestPromise) {
    requestPromise = fetchPeriodDetails(normalizedPeriodCode)
      .then((payload) => {
        markPeriodDetailsLoaded(payload)
        statCache = statCache ? mergeRunStatsData(statCache, payload) : payload
        return statCache
      })
      .finally(() => {
        statPeriodPromises.delete(normalizedPeriodCode)
      })
    statPeriodPromises.set(normalizedPeriodCode, requestPromise)
  }

  return requestPromise
}

function normalizeResourceIdFilter(resourceId: string) {
  return resourceId.trim()
}

function isDataResourceStatRecord(record: Pick<StatRecord, 'resourceTypeId'>) {
  const typeId = normalizeNonEmptyString(record.resourceTypeId)
  if (!typeId) return true
  return typeId === '33'
}

function keepLatestStatRecordByResource(records: StatRecord[]) {
  const latestByResourceId = new Map<string, StatRecord>()

  records.forEach((record) => {
    const resourceId = normalizeNonEmptyString(record.resourceId)
    if (!resourceId) return

    const existing = latestByResourceId.get(resourceId)
    if (!existing) {
      latestByResourceId.set(resourceId, record)
      return
    }

    if (!isDw1dCurrentStatRecord(existing) && isDw1dCurrentStatRecord(record)) {
      latestByResourceId.set(resourceId, record)
    }
  })

  return latestByResourceId
}

function isDw1dCurrentStatRecord(record: Pick<StatRecord, 'metainfo' | 'dayOnDay'>) {
  return record.metainfo.compare_task_code === 'dw1d'
    || record.dayOnDay.compare_task_code === 'dw1d'
    || record.dayOnDay.trend_30d?.task_code === 'dw1d'
}

function isDw30CurrentStatRecord(record: Pick<StatRecord, 'metainfo' | 'dayOnDay'>) {
  return record.metainfo.compare_task_code === 'dw30'
    || record.dayOnDay.compare_task_code === 'dw30'
    || record.dayOnDay.trend_30d?.task_code === 'dw30'
}

function normalizeCurrentOverviewTrendPeriodCode(point: StatTrendPoint, fallbackPeriodCode: string, index: number) {
  const pointPeriodCode = normalizeNonEmptyString(point.stat_period_code)
  if (pointPeriodCode) return pointPeriodCode

  const pointDate = normalizeNonEmptyString(point.date)
  if (pointDate) {
    return `${pointDate.replaceAll('-', '')}_${String(index + 1).padStart(3, '0')}`
  }

  const pointExecutedAt = normalizeNonEmptyString(point.execute_time)
  if (pointExecutedAt) {
    const executeDateKey = extractExecutionDateKey(pointExecutedAt)
    if (executeDateKey) {
      return `${executeDateKey.replaceAll('-', '')}_${String(index + 1).padStart(3, '0')}`
    }
  }

  return fallbackPeriodCode
}

function compareCurrentOverviewTrendPoints(left: CurrentOverviewTrendPoint, right: CurrentOverviewTrendPoint) {
  const periodDiff = left.periodCode.localeCompare(right.periodCode, 'zh-CN')
  if (periodDiff !== 0) return periodDiff
  return left.executedAt.localeCompare(right.executedAt, 'zh-CN')
}

function buildCurrentOverviewTrendWindow(records: StatRecord[], limit = CURRENT_OVERVIEW_TREND_POINT_LIMIT): CurrentOverviewTrendWindow {
  const todayKey = formatDateInputValue(new Date())
  const trendBucket = new Map<string, CurrentOverviewTrendPoint & { resourceIds: Set<string> }>()
  const resourceTrendMap = new Map<string, {
    currentRecordCount: number
    points: Map<string, number>
  }>()

  records.forEach((record) => {
    const resourceId = normalizeNonEmptyString(record.resourceId) || normalizeNonEmptyString(record.id)
    if (!resourceId) return

    const resourceTrend = resourceTrendMap.get(resourceId) ?? {
      currentRecordCount: Number(record.metainfo.record_count ?? 0),
      points: new Map<string, number>(),
    }
    resourceTrend.currentRecordCount = Number(record.metainfo.record_count ?? 0)
    resourceTrendMap.set(resourceId, resourceTrend)

    const trendPoints = record.dayOnDay.trend_30d?.points ?? []
    trendPoints.forEach((point, index) => {
      const periodCode = normalizeCurrentOverviewTrendPeriodCode(point, record.periodCode, index)
      if (!periodCode) return

      const periodDateKey = extractPeriodDateKey(periodCode)
      if (periodDateKey && periodDateKey > todayKey) return

      const executedAt = normalizeNonEmptyString(point.execute_time) || record.executedAt
      const current = trendBucket.get(periodCode) ?? {
        periodCode,
        executedAt,
        recordCount: 0,
        resourceIds: new Set<string>(),
      }

      if (normalizeNonEmptyString(executedAt) && executedAt.localeCompare(current.executedAt, 'zh-CN') > 0) {
        current.executedAt = executedAt
      }

      current.recordCount += Number(point.record_count ?? 0)
      current.resourceIds.add(resourceId)
      trendBucket.set(periodCode, current)
      resourceTrend.points.set(periodCode, Number(point.record_count ?? 0))
    })
  })

  const trendPoints = Array.from(trendBucket.values())
    .sort(compareCurrentOverviewTrendPoints)
    .slice(-Math.max(limit, 0))
    .map((item) => ({
      periodCode: item.periodCode,
      executedAt: item.executedAt,
      recordCount: item.recordCount,
    }))

  const selectedPeriodCodes = new Set(trendPoints.map((item) => item.periodCode))
  const resourceTrends = Array.from(resourceTrendMap.entries())
    .map(([resourceId, item]) => ({
      resourceId,
      currentRecordCount: item.currentRecordCount,
      points: Array.from(item.points.entries())
        .filter(([periodCode]) => selectedPeriodCodes.has(periodCode))
        .sort(([leftPeriodCode], [rightPeriodCode]) => leftPeriodCode.localeCompare(rightPeriodCode, 'zh-CN'))
        .map(([periodCode, recordCount]) => ({
          periodCode,
          recordCount,
        })),
    }))

  return { trendPoints, resourceTrends }
}

function mergeCurrentOverviewTrendWindows(
  primaryWindow: CurrentOverviewTrendWindow,
  fallbackWindow: CurrentOverviewTrendWindow,
  limit = CURRENT_OVERVIEW_TREND_POINT_LIMIT,
): CurrentOverviewTrendWindow {
  const safeLimit = Math.max(0, Math.trunc(limit))
  if (safeLimit === 0) {
    return { trendPoints: [], resourceTrends: [] }
  }

  const trendBucket = new Map<string, CurrentOverviewTrendPoint>()
  fallbackWindow.trendPoints.forEach((item) => {
    if (!item.periodCode) return
    trendBucket.set(item.periodCode, item)
  })
  primaryWindow.trendPoints.forEach((item) => {
    if (!item.periodCode) return
    trendBucket.set(item.periodCode, item)
  })

  const trendPoints = Array.from(trendBucket.values())
    .sort(compareCurrentOverviewTrendPoints)
    .slice(-safeLimit)

  const selectedPeriodCodes = new Set(trendPoints.map((item) => item.periodCode))
  const resourceBucket = new Map<string, {
    currentRecordCount: number
    points: Map<string, number>
  }>()

  function collectWindow(window: CurrentOverviewTrendWindow, replaceCurrentCount: boolean) {
    window.resourceTrends.forEach((item) => {
      const current = resourceBucket.get(item.resourceId) ?? {
        currentRecordCount: item.currentRecordCount,
        points: new Map<string, number>(),
      }

      if (replaceCurrentCount || current.points.size === 0) {
        current.currentRecordCount = item.currentRecordCount
      }

      item.points.forEach((point) => {
        current.points.set(point.periodCode, point.recordCount)
      })

      resourceBucket.set(item.resourceId, current)
    })
  }

  collectWindow(fallbackWindow, false)
  collectWindow(primaryWindow, true)

  const resourceTrends = Array.from(resourceBucket.entries())
    .map(([resourceId, item]) => ({
      resourceId,
      currentRecordCount: item.currentRecordCount,
      points: Array.from(item.points.entries())
        .filter(([periodCode]) => selectedPeriodCodes.has(periodCode))
        .sort(([leftPeriodCode], [rightPeriodCode]) => leftPeriodCode.localeCompare(rightPeriodCode, 'zh-CN'))
        .map(([periodCode, recordCount]) => ({
          periodCode,
          recordCount,
        })),
    }))
    .filter((item) => item.points.length > 0)

  return {
    trendPoints,
    resourceTrends,
  }
}

function resolveCurrentOverviewTrendTaskCode(records: StatRecord[]) {
  for (const record of records) {
    const taskCode = normalizeNonEmptyString(record.dayOnDay.trend_30d?.task_code)
      || normalizeNonEmptyString(record.dayOnDay.compare_task_code)
      || normalizeNonEmptyString(record.metainfo.compare_task_code)
    if (taskCode) return taskCode
  }

  return ''
}

export function buildCurrentOverviewStats(records: StatRecord[], fallbackTrendRecords: StatRecord[] = []): CurrentOverviewStats {
  const dedupedRecords = Array.from(keepLatestStatRecordByResource(records).values())
  const dataSourceCount = dedupedRecords.filter(r => normalizeNonEmptyString(r.resourceTypeId) === '32').length
  const latestRecords = dedupedRecords.filter(isDataResourceStatRecord)
  if (latestRecords.length === 0) {
    return { ...EMPTY_CURRENT_OVERVIEW_STATS, dataSourceCount }
  }

  const themeLabels = new Set<string>()
  let fieldCount = 0
  const dw30Records = latestRecords.filter((record) => isDw30CurrentStatRecord(record))
  const overviewRecords = dw30Records.length > 0 ? dw30Records : latestRecords
  const latestResourceIds = new Set(
    latestRecords
      .map((record) => normalizeNonEmptyString(record.resourceId) || normalizeNonEmptyString(record.id))
      .filter(Boolean),
  )
  const normalizedFallbackTrendRecords = fallbackTrendRecords.filter((record) => {
    const resourceId = normalizeNonEmptyString(record.resourceId) || normalizeNonEmptyString(record.id)
    if (!resourceId || !latestResourceIds.has(resourceId)) return false
    if (dw30Records.length === 0) return true
    return isDw30CurrentStatRecord(record)
  })
  const overviewTrendWindow = mergeCurrentOverviewTrendWindows(
    buildCurrentOverviewTrendWindow(overviewRecords, CURRENT_OVERVIEW_TREND_POINT_LIMIT),
    buildCurrentOverviewTrendWindow(normalizedFallbackTrendRecords, CURRENT_OVERVIEW_TREND_POINT_LIMIT),
    CURRENT_OVERVIEW_TREND_POINT_LIMIT,
  )
  const recordCount = overviewTrendWindow.trendPoints.length > 0
    ? overviewTrendWindow.trendPoints[overviewTrendWindow.trendPoints.length - 1].recordCount
    : latestRecords.reduce((sum, record) => sum + Number(record.metainfo.record_count ?? 0), 0)

  latestRecords.forEach((record) => {
    const topLevelCategory = normalizeNonEmptyString(record.domainCategoryName).split('/')[0]?.trim() ?? ''
    if (topLevelCategory && topLevelCategory !== '未标注') {
      themeLabels.add(topLevelCategory)
    }
    fieldCount += Number(record.metainfo.field_count ?? 0)
  })

  return {
    themeCount: themeLabels.size,
    resourceCount: latestRecords.length,
    fieldCount,
    recordCount,
    dataSourceCount,
    isFallback: false,
    trendPoints: overviewTrendWindow.trendPoints,
    resourceTrends: overviewTrendWindow.resourceTrends,
  }
}

async function fetchCurrentOverviewTrendFallbackRecords(
  records: StatRecord[],
  limit = CURRENT_OVERVIEW_TREND_POINT_LIMIT,
): Promise<StatRecord[]> {
  const safeLimit = Math.max(0, Math.trunc(limit))
  if (safeLimit === 0 || records.length === 0) return []

  const taskCode = resolveCurrentOverviewTrendTaskCode(records)
  const periodCodes = taskCode
    ? (await fetchRunStatsJobOptionsByTask(taskCode, safeLimit)).map((item) => item.periodCode)
    : await fetchRecentPeriodCodes(safeLimit)
  const uniquePeriodCodes = Array.from(new Set(periodCodes.map((item) => String(item ?? '').trim()).filter(Boolean)))

  if (uniquePeriodCodes.length === 0) return []

  const rawRowsByPeriod = await Promise.all(
    uniquePeriodCodes.map((periodCode) =>
      fetchStatRows({
        filter: { stat_period_code: periodCode },
        sort: '-id',
        pageSize: EXACT_PERIOD_FETCH_PAGE_SIZE,
        attachResources: false,
        fields: CURRENT_OVERVIEW_STAT_ROW_FIELDS,
      }),
    ),
  )

  return rawRowsByPeriod.flat().map((row) => mapStatRecord(row))
}

async function fetchLatestResourceStatMap(): Promise<Map<string, StatRecord>> {
  if (latestResourceStatMapCache) return latestResourceStatMapCache

  if (!latestResourceStatMapPromise) {
    latestResourceStatMapPromise = fetchCurrentStatRows({
      sort: '-id',
      pageSize: 500,
      fields: LATEST_RESOURCE_STAT_ROW_FIELDS,
    })
      .then((rows) => {
        const mappedRows = rows
          .map((row) => mapStatRecord(row))
          .filter((record) => isDw30CurrentStatRecord(record))

        if (mappedRows.length > 0) {
          return mappedRows
        }

        return rows.map((row) => mapStatRecord(row))
      })
      .then((records) => {
        const recordMap = new Map<string, StatRecord>()
        records.forEach((record) => {
          const resourceId = normalizeNonEmptyString(record.resourceId)
          if (!resourceId) return

          const existing = recordMap.get(resourceId)
          if (!existing) {
            recordMap.set(resourceId, record)
            return
          }

          if (!isDw30CurrentStatRecord(existing) && isDw30CurrentStatRecord(record)) {
            recordMap.set(resourceId, record)
          }
        })
        return recordMap
      })
      .finally(() => {
        latestResourceStatMapPromise = null
      })
  }

  latestResourceStatMapCache = await latestResourceStatMapPromise
  return latestResourceStatMapCache
}

/** Internal: fetch fresh data from network, persist to caches, skip memory cache */
async function fetchCurrentOverviewStatsFresh(): Promise<CurrentOverviewStats> {
  if (currentOverviewStatsPromise) return currentOverviewStatsPromise

  currentOverviewStatsPromise = fetchCurrentStatRows({
    sort: '-id',
    pageSize: CURRENT_OVERVIEW_PAGE_SIZE,
    fields: CURRENT_OVERVIEW_STAT_ROW_FIELDS,
  })
    .then(async (rows) => {
      const mappedRecords = (rows ?? []).map((row) => mapStatRecord(row))
      const dw30Records = mappedRecords.filter((record) => isDw30CurrentStatRecord(record))
      const records = dw30Records.length > 0 ? dw30Records : mappedRecords
      let payload = buildCurrentOverviewStats(records)

      if (payload.trendPoints.length < CURRENT_OVERVIEW_TREND_POINT_LIMIT) {
        const fallbackRecords = await fetchCurrentOverviewTrendFallbackRecords(records)
        if (fallbackRecords.length > 0) {
          payload = buildCurrentOverviewStats(records, fallbackRecords)
        }
      }

      writeStorageCache(LS_CACHE_OVERVIEW, payload)
      currentOverviewStatsCache = payload
      return payload
    })
    .finally(() => {
      currentOverviewStatsPromise = null
    })

  return currentOverviewStatsPromise
}

async function fetchCurrentOverviewStats(): Promise<CurrentOverviewStats> {
  // Memory cache hit (populated from localStorage restore on module load)
  if (isCurrentOverviewStatsCacheUsable(currentOverviewStatsCache)) return currentOverviewStatsCache!

  // Check localStorage for today's cached data before network fetch
  const cached = readStorageCache<CurrentOverviewStats>(LS_CACHE_OVERVIEW)
  if (cached?.data && isCacheFresh(cached.cachedAt) && isCurrentOverviewStatsCacheUsable(cached.data)) {
    currentOverviewStatsCache = cached.data
    return currentOverviewStatsCache
  }

  return fetchCurrentOverviewStatsFresh()
}

/** Internal: fetch fresh snapshot from network, persist to caches, skip memory cache */
async function fetchCurrentRunStatsSnapshotFresh(): Promise<CurrentRunStatsSnapshot> {
  if (currentRunStatsSnapshotPromise) return currentRunStatsSnapshotPromise

  currentRunStatsSnapshotPromise = Promise.all([
    loadStatTaskCatalog(),
    fetchRecentStatJobRows(),
  ])
    .then(([taskCatalog, jobRows]) => {
      const taskData = buildRunStatsTaskLookup(taskCatalog, jobRows)
      const snapshot = {
        data: EMPTY_DATA,
        taskData,
        defaultQuery: buildCurrentRunStatsQueryDefaultsFromJobRows(jobRows),
      } satisfies CurrentRunStatsSnapshot
      currentRunStatsSnapshotCache = snapshot
      writeStorageCache(LS_CACHE_RUN_SNAPSHOT, snapshot)
      return snapshot
    })
    .finally(() => {
      currentRunStatsSnapshotPromise = null
    })

  return currentRunStatsSnapshotPromise
}

async function fetchCurrentRunStatsSnapshot(): Promise<CurrentRunStatsSnapshot> {
  if (currentRunStatsSnapshotCache) return currentRunStatsSnapshotCache

  const cached = readStorageCache<CurrentRunStatsSnapshot>(LS_CACHE_RUN_SNAPSHOT)
  if (cached?.data && isCacheFresh(cached.cachedAt)) {
    currentRunStatsSnapshotCache = cached.data
    return currentRunStatsSnapshotCache
  }

  return fetchCurrentRunStatsSnapshotFresh()
}

async function fetchLatestResourceBatchStat(resourceId: string): Promise<LatestResourceBatchStat> {
  const normalizedResourceId = resourceId.trim()
  if (!normalizedResourceId) return EMPTY_LATEST_RESOURCE_BATCH_STAT
  if (normalizedResourceId.startsWith('grid-')) return EMPTY_LATEST_RESOURCE_BATCH_STAT

  const idFilter = normalizeResourceIdFilter(normalizedResourceId)

  const currentRows = await fetchCurrentStatRows({
    filter: {
      data_resource_id: idFilter,
    },
    sort: '-id',
    pageSize: 20,
    compact: false,
  })

  const dw30CurrentRow = currentRows.find((item) => {
    if (!matchStatRowFilter(item, { data_resource_id: idFilter })) return false
    return isDw30CurrentStatRecord(mapStatRecord(item))
  }) ?? null
  const currentRow = dw30CurrentRow
    ?? currentRows.find((item) => matchStatRowFilter(item, { data_resource_id: idFilter })) ?? null

  if (currentRow) {
    return {
      latestPeriodCode: getRawStatPeriodCode(currentRow),
      record: mapStatRecord(currentRow),
    }
  }

  return EMPTY_LATEST_RESOURCE_BATCH_STAT
}

function useRunStatsTasksState(enabled: boolean, fallbackPeriodCodes: string[] = []) {
  const fallbackPeriodCodesRef = useRef(fallbackPeriodCodes)
  const fallbackPeriodCodesKey = fallbackPeriodCodes.join('|')
  const currentExecutionDateRef = useRef('')
  const taskCatalogRef = useRef<RunStatsTaskCatalogEntry[]>([])
  const [taskCatalog, setTaskCatalog] = useState<RunStatsTaskCatalogEntry[]>([])
  const [data, setData] = useState<RunStatsTaskData>(EMPTY_RUN_STATS_TASK_DATA)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingExecutionDate, setLoadingExecutionDate] = useState('')
  const executionDateRequestIdRef = useRef(0)

  useEffect(() => {
    fallbackPeriodCodesRef.current = fallbackPeriodCodes
    if (!currentExecutionDateRef.current) {
      setData(buildRunStatsTaskCatalogData(taskCatalogRef.current))
      return
    }
    setData(buildCachedRunStatsTaskLookup(currentExecutionDateRef.current, taskCatalogRef.current, fallbackPeriodCodes))
  }, [fallbackPeriodCodesKey])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    void loadStatTaskCatalog().then((catalog) => {
      if (cancelled) return
      taskCatalogRef.current = catalog
      setTaskCatalog(catalog)
      setData(
        currentExecutionDateRef.current
          ? buildCachedRunStatsTaskLookup(currentExecutionDateRef.current, catalog, fallbackPeriodCodesRef.current)
          : buildRunStatsTaskCatalogData(catalog),
      )
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    taskCatalogRef.current = taskCatalog
  }, [taskCatalog])

  const ensureExecutionDateLoadedForState = useCallback(async (dateKey: string) => {
    const normalizedDateKey = extractExecutionDateKey(dateKey)
    if (!normalizedDateKey) {
      currentExecutionDateRef.current = ''
      const payload = buildRunStatsTaskCatalogData(taskCatalogRef.current)
      setData(payload)
      setIsLoading(false)
      setLoadingExecutionDate('')
      return payload
    }

    currentExecutionDateRef.current = normalizedDateKey
    if (statTaskJobRowsByExecutionDateCache.has(normalizedDateKey) && taskCatalogRef.current.length > 0) {
      const payload = buildCachedRunStatsTaskLookup(normalizedDateKey, taskCatalogRef.current, fallbackPeriodCodesRef.current)
      setData(payload)
      setIsLoading(false)
      setLoadingExecutionDate('')
      return payload
    }

    const requestId = executionDateRequestIdRef.current + 1
    executionDateRequestIdRef.current = requestId
    setIsLoading(true)
    setLoadingExecutionDate(normalizedDateKey)
    try {
      const payload = await ensureRunStatsTaskExecutionDateLoaded(normalizedDateKey, fallbackPeriodCodesRef.current)
      if (executionDateRequestIdRef.current === requestId) {
        taskCatalogRef.current = statTaskCatalogCache ?? taskCatalogRef.current
        setTaskCatalog(taskCatalogRef.current)
        setData(payload)
      }
      return payload
    } finally {
      if (executionDateRequestIdRef.current === requestId) {
        setLoadingExecutionDate('')
        setIsLoading(false)
      }
    }
  }, [])

  return {
    taskOptions: data.taskOptions,
    periodTaskMap: data.periodTaskMap,
    isLoading,
    loadingExecutionDate,
    ensureExecutionDateLoaded: ensureExecutionDateLoadedForState,
  }
}

function useRunStatsDataState(enabled: boolean, options?: RunStatsHookOptions) {
  const lazyByDate = Boolean(options?.lazyByDate)
  const [data, setData] = useState<RunStatsData>(statCache ?? EMPTY_DATA)
  const [isLoading, setIsLoading] = useState(() => enabled && !statCache)
  const [isHydratingHistory, setIsHydratingHistory] = useState(() => enabled && !lazyByDate && !statCacheComplete)
  const [loadingExecutionDate, setLoadingExecutionDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const executionDateRequestIdRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const hydrateHistory = () => {
      if (statCacheComplete) {
        if (!cancelled) {
          setIsHydratingHistory(false)
        }
        return
      }

      setIsHydratingHistory(true)
      void ensureFullRunStatsData()
        .then((payload) => {
          if (cancelled) return
          markPeriodDetailsLoaded(payload)
          setData(payload)
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) {
            setIsHydratingHistory(false)
          }
        })
    }

    if (statCache) {
      setData(statCache)
      setError(null)
      setIsLoading(false)
      if (lazyByDate) {
        if (!statCacheComplete && statLoadedExecutionDates.size === 0) {
          setIsLoading(true)
        } else {
          setIsHydratingHistory(false)
          return () => {
            cancelled = true
          }
        }
      } else {
        hydrateHistory()
        return () => {
          cancelled = true
        }
      }
    }

    if (statCache && lazyByDate && !statCacheComplete && statLoadedExecutionDates.size > 0) {
      return () => {
        cancelled = true
      }
    }

    setIsLoading(true)
    setIsHydratingHistory(!lazyByDate)

    const run = async () => {
      if (!statPromise) {
        statPromise = (lazyByDate ? fetchRunStatsInitialDateData() : fetchRunStatsInitialData()).finally(() => {
          statPromise = null
        })
      }
      try {
        const payload = await statPromise
        if (cancelled) return
        statCache = statCache ? mergeRunStatsData(statCache, payload) : payload
        statCacheComplete = false
        markPeriodDetailsLoaded(payload)
        setData(statCache)
        setError(null)
        setIsHydratingHistory(false)
        setLoadingExecutionDate('')
        if (!lazyByDate) {
          hydrateHistory()
        }
      } catch (err) {
        if (!cancelled) {
          setError(toErrorMessage(err, '无法读取数据运行统计信息'))
          setIsHydratingHistory(false)
          setLoadingExecutionDate('')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [enabled, lazyByDate])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setIsHydratingHistory(!lazyByDate)
    setLoadingExecutionDate('')
    statCache = null
    statCacheComplete = false
    statPromise = null
    statHydrationPromise = null
    statLoadedExecutionDates.clear()
    statDatePromises.clear()
    statLoadedDetailPeriods.clear()
    statPeriodPromises.clear()
    statTaskJobRowsByExecutionDateCache.clear()
    statTaskDatePromises.clear()
    recentStatJobRowsCache = null
    recentStatJobRowsPromise = null
    currentOverviewStatsCache = null
    currentOverviewStatsPromise = null
    latestResourceStatMapCache = null
    latestResourceStatMapPromise = null
    latestResourceBatchCache.clear()
    latestResourceBatchPromises.clear()
    try {
      const initialPayload = await (lazyByDate ? fetchRunStatsInitialDateData() : fetchRunStatsInitialData())
      statCache = initialPayload
      markPeriodDetailsLoaded(initialPayload)
      setData(initialPayload)
      setError(null)
      if (lazyByDate) {
        setIsHydratingHistory(false)
      } else {
        void ensureFullRunStatsData()
          .then((payload) => {
            markPeriodDetailsLoaded(payload)
            setData(payload)
          })
          .catch(() => undefined)
          .finally(() => {
            setIsHydratingHistory(false)
          })
      }
    } catch (err) {
      setError(toErrorMessage(err, '刷新统计信息失败'))
      setIsHydratingHistory(false)
    } finally {
      setIsLoading(false)
    }
  }, [lazyByDate])

  const ensureExecutionDateLoadedForState = useCallback(async (dateKey: string) => {
    if (!lazyByDate) {
      return statCache ?? EMPTY_DATA
    }

    const normalizedDateKey = extractExecutionDateKey(dateKey)
    if (!normalizedDateKey) {
      return statCache ?? EMPTY_DATA
    }

    if (statCacheComplete || statLoadedExecutionDates.has(normalizedDateKey)) {
      return statCache ?? EMPTY_DATA
    }

    const requestId = executionDateRequestIdRef.current + 1
    executionDateRequestIdRef.current = requestId
    setLoadingExecutionDate(normalizedDateKey)
    setIsHydratingHistory(true)
    try {
      const payload = await ensureExecutionDateLoaded(normalizedDateKey)
      markExecutionDatesLoaded(payload)
      setData(payload)
      setError(null)
      return payload
    } catch (err) {
      setError(toErrorMessage(err, '按日期加载统计信息失败'))
      throw err
    } finally {
      if (executionDateRequestIdRef.current === requestId) {
        setLoadingExecutionDate('')
      }
      setIsHydratingHistory(false)
    }
  }, [lazyByDate])

  const ensurePeriodLoadedForState = useCallback(async (periodCode: string) => {
    const normalizedPeriodCode = String(periodCode ?? '').trim()
    if (!normalizedPeriodCode) {
      return statCache ?? EMPTY_DATA
    }

    setIsHydratingHistory(true)
    try {
      const payload = await ensurePeriodLoaded(normalizedPeriodCode)
      markPeriodDetailsLoaded(payload)
      setData(payload)
      setError(null)
      return payload
    } catch (err) {
      setError(toErrorMessage(err, '按周期加载统计明细失败'))
      throw err
    } finally {
      setIsHydratingHistory(false)
    }
  }, [])

  return {
    data,
    isLoading,
    isHydratingHistory,
    loadingExecutionDate,
    error,
    refresh,
    ensureExecutionDateLoaded: ensureExecutionDateLoadedForState,
    ensurePeriodLoaded: ensurePeriodLoadedForState,
  }
}

function useCurrentRunStatsState(enabled: boolean) {
  const [data, setData] = useState<CurrentRunStatsSnapshot>(currentRunStatsSnapshotCache ?? EMPTY_CURRENT_RUN_STATS_SNAPSHOT)
  const [isLoading, setIsLoading] = useState(() => enabled && !currentRunStatsSnapshotCache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const cachedData = currentRunStatsSnapshotCache
    if (cachedData) {
      // Show cached data immediately (restored from localStorage on module load)
      setData(cachedData)
      setError(null)
      setIsLoading(false)

      // Background refresh if cache is stale (TTL: 30 minutes)
      const cached = readStorageCache<CurrentRunStatsSnapshot>(LS_CACHE_RUN_SNAPSHOT)
      if (!cached || !isCacheFresh(cached.cachedAt)) {
        fetchCurrentRunStatsSnapshotFresh()
          .then((payload) => {
            if (!cancelled) setData(payload)
          })
          .catch(() => { /* keep stale data on error */ })
      }
      return
    }

    setIsLoading(true)
    const run = async () => {
      try {
        const payload = await fetchCurrentRunStatsSnapshot()
        if (cancelled) return
        currentRunStatsSnapshotCache = payload
        setData(payload)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(toErrorMessage(err, '无法读取当前统计快照'))
          setData(EMPTY_CURRENT_RUN_STATS_SNAPSHOT)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { ...data, isLoading, error }
}

function useCurrentOverviewStatsState(enabled: boolean) {
  const [data, setData] = useState<CurrentOverviewStats>(currentOverviewStatsCache ?? EMPTY_CURRENT_OVERVIEW_STATS)
  const [isLoading, setIsLoading] = useState(() => enabled && !currentOverviewStatsCache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const cachedData = currentOverviewStatsCache
    if (isCurrentOverviewStatsCacheUsable(cachedData)) {
      // Show cached data immediately (restored from localStorage on module load)
      setData(cachedData!)
      setError(null)
      setIsLoading(false)

      // Background refresh if cache is stale (TTL: 30 minutes)
      const cached = readStorageCache<CurrentOverviewStats>(LS_CACHE_OVERVIEW)
      if (!cached || !isCacheFresh(cached.cachedAt) || !isCurrentOverviewStatsCacheUsable(cached.data)) {
        fetchCurrentOverviewStatsFresh()
          .then((payload) => {
            if (!cancelled) setData(payload)
          })
          .catch(() => { /* keep stale data on error */ })
      }
      return
    }

    setIsLoading(true)
    const run = async () => {
      try {
        const payload = await fetchCurrentOverviewStats()
        if (cancelled) return
        currentOverviewStatsCache = payload
        setData(payload)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(toErrorMessage(err, '无法读取当前概览统计'))
          setData(EMPTY_CURRENT_OVERVIEW_STATS)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { data, isLoading, error }
}

function useLatestResourceStatMapState(enabled: boolean) {
  const [data, setData] = useState<Map<string, StatRecord>>(latestResourceStatMapCache ?? new Map())
  const [isLoading, setIsLoading] = useState(() => enabled && !latestResourceStatMapCache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const cachedData = latestResourceStatMapCache
    if (cachedData) {
      setData(cachedData)
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const run = async () => {
      try {
        const payload = await fetchLatestResourceStatMap()
        if (cancelled) return
        latestResourceStatMapCache = payload
        setData(payload)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(toErrorMessage(err, '无法读取当前资源统计'))
          setData(new Map())
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { data, isLoading, error }
}

function useLatestResourceBatchStatState(resourceId: string | undefined, enabled: boolean) {
  const normalizedResourceId = (resourceId ?? '').trim()
  const cached = normalizedResourceId ? latestResourceBatchCache.get(normalizedResourceId) : undefined
  const [data, setData] = useState<LatestResourceBatchStat>(cached ?? EMPTY_LATEST_RESOURCE_BATCH_STAT)
  const [isLoading, setIsLoading] = useState(() => enabled && normalizedResourceId.length > 0 && !cached)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !normalizedResourceId) return

    let cancelled = false
    const cachedData = latestResourceBatchCache.get(normalizedResourceId)
    if (cachedData) {
      setData(cachedData)
      setError(null)
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }

    const run = async () => {
      try {
        let requestPromise = latestResourceBatchPromises.get(normalizedResourceId)
        if (!requestPromise) {
          requestPromise = fetchLatestResourceBatchStat(normalizedResourceId).finally(() => {
            latestResourceBatchPromises.delete(normalizedResourceId)
          })
          latestResourceBatchPromises.set(normalizedResourceId, requestPromise)
        }

        const payload = await requestPromise
        if (cancelled) return
        latestResourceBatchCache.set(normalizedResourceId, payload)
        setData(payload)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(toErrorMessage(err, '无法读取最新批次统计信息'))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [enabled, normalizedResourceId])

  return { data, isLoading, error }
}

export function useRunStatsData(enabled: boolean, options?: RunStatsHookOptions) {
  return useRunStatsDataState(enabled, options)
}

export function useCurrentRunStats(enabled: boolean) {
  return useCurrentRunStatsState(enabled)
}

export function useRunStatsTasks(enabled: boolean, fallbackPeriodCodes: string[] = []) {
  return useRunStatsTasksState(enabled, fallbackPeriodCodes)
}

export function useCurrentOverviewStats(enabled: boolean) {
  return useCurrentOverviewStatsState(enabled)
}

export function useLatestResourceStatMap(enabled: boolean) {
  return useLatestResourceStatMapState(enabled)
}

export function useLatestResourceBatchStat(resourceId: string | undefined, enabled: boolean) {
  return useLatestResourceBatchStatState(resourceId, enabled)
}

export function clearRunStatsCache() {
  statCache = null
  statPromise = null
  statHydrationPromise = null
  statCacheComplete = false
  statLoadedExecutionDates.clear()
  statDatePromises.clear()
  statLoadedDetailPeriods.clear()
  statPeriodPromises.clear()
  statTaskSourceDescriptorCache = undefined
  statTaskSourceDescriptorPromise = null
  statSourceResourceMapCache = null
  statTaskCatalogCache = null
  statTaskCatalogPromise = null
  statTaskJobRowsByExecutionDateCache.clear()
  statTaskDatePromises.clear()
  recentStatJobRowsCache = null
  recentStatJobRowsPromise = null
  statSourceErrorLogCache.clear()
  currentOverviewStatsCache = null
  currentOverviewStatsPromise = null
  latestResourceStatMapCache = null
  latestResourceStatMapPromise = null
  currentRunStatsSnapshotCache = null
  currentRunStatsSnapshotPromise = null
  latestResourceBatchCache.clear()
  latestResourceBatchPromises.clear()
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_CACHE_OVERVIEW)
      localStorage.removeItem(LS_CACHE_RUN_SNAPSHOT)
    }
  } catch { /* ignore */ }
}

export function connectStatusMeta(code: ConnectStatusCode): ConnectStatusMeta {
  switch (code) {
    case '01':
      return { label: '连通正常', toneClass: 'bg-[var(--status-success-bg)] text-[var(--status-success-text)] border-[var(--status-success-border)]' }
    case '02':
      return { label: '读取失败', toneClass: 'bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border-[var(--status-danger-border)]' }
    case '04':
      return { label: '访问较慢', toneClass: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] border-[var(--status-warning-border)]' }
    case '99':
      return { label: '未配置表', toneClass: 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)] border-[var(--status-neutral-border)]' }
    default:
      return { label: `状态${code}`, toneClass: 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)] border-[var(--status-neutral-border)]' }
  }
}

export function formatNumber(value: number) {
  return value.toLocaleString('zh-CN')
}

export function formatMB(bytes: number) {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(2)} MB`
}
