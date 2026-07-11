export type PersonalCenterSectionKey = 'favorites' | 'demands' | 'linked' | 'apps'

export type AuthorizedResourceItem = {
  resourceId: string
  resourceName: string
  sceneNames: string[]
  sceneCount: number
}

export type PersonalCenterCardPresentation = {
  shouldScrollIntoView: boolean
  cardClassName: string
  titleClassName: string
  iconClassName: string
  valueClassName: string
}

export type PersonalCenterGridPresentation = {
  pageSize: number
  gridClassName: string
  actionButtonClassName: string
}

export const PERSONAL_CENTER_SECTION_PAGE_SIZE = 12
export const PERSONAL_CENTER_CARD_ORDER: PersonalCenterSectionKey[] = ['demands', 'favorites', 'linked', 'apps']

export function getPersonalCenterSectionTitle(section: PersonalCenterSectionKey) {
  switch (section) {
    case 'favorites':
      return '我的收藏'
    case 'demands':
      return '我的供需对接'
    case 'linked':
      return '授权给我的数据资源'
    case 'apps':
      return '我的应用'
    default:
      return '个人中心'
  }
}

export function getDefaultPersonalCenterSection({
  demandCount,
  favoriteCount,
  linkedCount,
}: {
  demandCount: number
  favoriteCount: number
  linkedCount: number
}): PersonalCenterSectionKey {
  if (demandCount > 0) return 'demands'
  if (favoriteCount > 0) return 'favorites'
  if (linkedCount > 0) return 'linked'
  return 'apps'
}

export function resolvePersonalCenterSection({
  currentSection,
  demandCount,
  favoriteCount,
  linkedCount,
  hasManualSelection,
}: {
  currentSection: PersonalCenterSectionKey
  demandCount: number
  favoriteCount: number
  linkedCount: number
  hasManualSelection: boolean
}): PersonalCenterSectionKey {
  if (hasManualSelection) {
    return currentSection
  }

  return getDefaultPersonalCenterSection({
    demandCount,
    favoriteCount,
    linkedCount,
  })
}

export function getPersonalCenterCardPresentation(isActive: boolean): PersonalCenterCardPresentation {
  if (isActive) {
    return {
      shouldScrollIntoView: false,
      cardClassName:
        'border-[var(--status-info-border)] bg-[linear-gradient(180deg,var(--surface-raised-strong),color-mix(in_srgb,var(--status-info-bg)_72%,var(--surface-raised)))] shadow-[0_20px_40px_rgba(var(--theme-soft-rgb),0.16)] ring-2 ring-[rgba(var(--theme-soft-rgb),0.18)]',
      titleClassName: 'text-[var(--primary)]',
      iconClassName: 'text-[var(--primary)]',
      valueClassName: 'text-[var(--primary)]',
    }
  }

  return {
    shouldScrollIntoView: false,
    cardClassName: 'border-[var(--surface-outline)] bg-[var(--surface-raised)] hover:border-[rgba(var(--theme-soft-rgb),0.24)] hover:bg-[var(--surface-raised-strong)]',
    titleClassName: 'text-[var(--text-muted)]',
    iconClassName: 'text-[var(--text-muted)]',
    valueClassName: 'text-[var(--text-main)]',
  }
}

export function getPersonalCenterGridPresentation(): PersonalCenterGridPresentation {
  return {
    pageSize: PERSONAL_CENTER_SECTION_PAGE_SIZE,
    gridClassName: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4',
    actionButtonClassName:
      'inline-flex h-9 items-center justify-center rounded-[999px] border border-[var(--surface-outline)] bg-[var(--surface-raised)] px-4 text-[0.75rem] font-medium text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-raised-strong)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60',
  }
}

export function paginatePersonalCenterSectionItems<T>(items: T[], currentPage: number, pageSize = PERSONAL_CENTER_SECTION_PAGE_SIZE) {
  const safePageSize = Math.max(1, pageSize)
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize))
  const safePage = Math.min(Math.max(currentPage, 1), totalPages)
  const startIndex = (safePage - 1) * safePageSize

  return {
    pageSize: safePageSize,
    totalPages,
    safePage,
    items: items.slice(startIndex, startIndex + safePageSize),
  }
}

export function getLinkedDemandItems<T extends { linkedResourceIds: string[] }>(items: T[]) {
  return items.filter((item) => item.linkedResourceIds.length > 0)
}

export function buildAuthorizedResourceItems<
  T extends {
    sceneName: string
    linkedResourceIds: string[]
    linkedResourceNames: string[]
  },
>(items: T[]): AuthorizedResourceItem[] {
  const resourceMap = new Map<string, AuthorizedResourceItem>()

  items.forEach((item) => {
    item.linkedResourceIds.forEach((resourceId, index) => {
      const normalizedResourceId = resourceId.trim()
      if (!normalizedResourceId) return

      const resourceName = item.linkedResourceNames[index]?.trim() || normalizedResourceId
      const existing = resourceMap.get(normalizedResourceId)

      if (existing) {
        if (!existing.sceneNames.includes(item.sceneName)) {
          existing.sceneNames.push(item.sceneName)
          existing.sceneCount += 1
        }
        return
      }

      resourceMap.set(normalizedResourceId, {
        resourceId: normalizedResourceId,
        resourceName,
        sceneNames: [item.sceneName],
        sceneCount: 1,
      })
    })
  })

  return Array.from(resourceMap.values()).sort((left, right) => {
    if (right.sceneCount !== left.sceneCount) return right.sceneCount - left.sceneCount
    return left.resourceName.localeCompare(right.resourceName, 'zh-CN')
  })
}
