import type { StatRecord } from './nocobase-stat-data'

export type DomainStatsRow = {
  domain: string
  resources: number
  stockCount: number
  changeCount: number
}

export function buildDomainStatsRows(
  records: StatRecord[],
  getDomainLabel: (item: StatRecord) => string,
) {
  const bucket = new Map<string, DomainStatsRow>()

  records.forEach((item) => {
    const domain = getDomainLabel(item)
    const stock = Number(item.metainfo.record_count ?? 0)
    const change = Number(item.dayOnDay.record_count?.delta ?? 0)
    const current = bucket.get(domain) ?? { domain, resources: 0, stockCount: 0, changeCount: 0 }

    current.resources += 1
    current.stockCount += Number.isFinite(stock) ? stock : 0
    current.changeCount += Number.isFinite(change) ? change : 0
    bucket.set(domain, current)
  })

  return Array.from(bucket.values())
    .sort((a, b) => b.stockCount - a.stockCount || b.changeCount - a.changeCount || a.domain.localeCompare(b.domain, 'zh-CN'))
    .slice(0, 12)
}
