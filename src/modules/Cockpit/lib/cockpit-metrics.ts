import type { CatalogItem } from '../../../lib/nocobase-portal-data'

export type CockpitMetric = {
  label: string
  value: string
  hint: string
}

export type CockpitCategoryMetric = {
  label: string
  value: number
}

function formatNumber(value: number) {
  return value.toLocaleString('zh-Hans-CN')
}

function countBy<T>(items: T[], resolveKey: (item: T) => string) {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    const key = resolveKey(item).trim() || '未标注'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'zh-Hans-CN'))
}

export function buildCockpitMetrics(catalogItems: CatalogItem[]): CockpitMetric[] {
  const dataSourceCount = catalogItems.filter((item) => item.serviceTypeId === '32' || item.serviceType === '数据源').length
  const apiServiceCount = catalogItems.filter((item) => item.serviceTypeId === '33' || /api|接口|服务/i.test(item.serviceType || item.name)).length
  const departments = new Set(catalogItems.map((item) => item.department).filter(Boolean))

  return [
    {
      label: '资源目录',
      value: formatNumber(catalogItems.length),
      hint: '统一编目资源总量',
    },
    {
      label: '数据源',
      value: formatNumber(dataSourceCount),
      hint: '已纳入管控的数据源',
    },
    {
      label: '共享服务',
      value: formatNumber(apiServiceCount),
      hint: 'API 与服务化资源',
    },
    {
      label: '责任单位',
      value: formatNumber(departments.size),
      hint: '资源归属单位覆盖',
    },
  ]
}

export function buildCockpitCategoryMetrics(catalogItems: CatalogItem[], limit = 7): CockpitCategoryMetric[] {
  return countBy(catalogItems, (item) => item.category || item.businessCategoryPath || '未标注')
    .filter((item) => item.label !== '未标注')
    .slice(0, limit)
}

export function buildCockpitDepartmentMetrics(catalogItems: CatalogItem[], limit = 8): CockpitCategoryMetric[] {
  return countBy(catalogItems, (item) => item.department || '未标注')
    .filter((item) => item.label !== '未标注')
    .slice(0, limit)
}
