export type DemandOptionLike = {
  id: number
  code: string
  name: string
  color: string
  description: string
}

export type ResourceSearchItem = {
  id: string
  name: string
  code: string
  department: string
  category: string
}

export const DEFAULT_DEMAND_TYPES: DemandOptionLike[] = []

export const DEFAULT_DEMAND_PRIORITIES: DemandOptionLike[] = []

export const DEFAULT_DEMAND_STATUSES: DemandOptionLike[] = []

export const DEFAULT_DEMAND_RESULT_TYPES: DemandOptionLike[] = []

export function withFallbackOptions<T>(items: T[], fallbackItems: T[]) {
  return items.length > 0 ? items : fallbackItems
}

export function filterResourceOptions<T extends ResourceSearchItem>(items: T[], keyword: string, limit = 10) {
  const normalizedKeyword = keyword.trim().toLowerCase()

  if (!normalizedKeyword) {
    return [] as T[]
  }

  const terms = normalizedKeyword.split(/\s+/).filter(Boolean)

  return items
    .map((item) => {
      const name = item.name.toLowerCase()
      const code = item.code.toLowerCase()
      const department = item.department.toLowerCase()
      const category = item.category.toLowerCase()
      const haystack = [name, code, department, category].join(' ')

      if (!terms.every((term) => haystack.includes(term))) {
        return null
      }

      let score = 0
      if (name === normalizedKeyword) score += 120
      if (name.startsWith(normalizedKeyword)) score += 80
      if (name.includes(normalizedKeyword)) score += 56
      if (code.startsWith(normalizedKeyword)) score += 48
      if (code.includes(normalizedKeyword)) score += 32
      if (department.includes(normalizedKeyword)) score += 20
      if (category.includes(normalizedKeyword)) score += 14
      score += Math.max(0, 12 - Math.min(name.length, 12))

      return { item, score }
    })
    .filter((entry): entry is { item: T; score: number } => Boolean(entry))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.item.name.localeCompare(right.item.name, 'zh-CN')
    })
    .map((entry) => entry.item)
    .slice(0, limit)
}
