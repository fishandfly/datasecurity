const EMBED_PARAM_KEY = 'embed'
const EMBED_FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

export function hasEmbedModeParam(search: string) {
  const searchParams = new URLSearchParams(search)
  return searchParams.has(EMBED_PARAM_KEY)
}

export function readEmbedMode(search: string) {
  const searchParams = new URLSearchParams(search)

  if (!searchParams.has(EMBED_PARAM_KEY)) {
    return false
  }

  const value = searchParams.get(EMBED_PARAM_KEY)

  if (value === null) {
    return true
  }

  const normalized = value.trim().toLowerCase()

  if (normalized.length === 0) {
    return true
  }

  return !EMBED_FALSE_VALUES.has(normalized)
}

export function mergeSearchWithEmbed(search: string, enabled: boolean) {
  const searchParams = new URLSearchParams(search)

  if (enabled) {
    searchParams.set(EMBED_PARAM_KEY, '1')
  } else {
    searchParams.delete(EMBED_PARAM_KEY)
  }

  const nextSearch = searchParams.toString()
  return nextSearch ? `?${nextSearch}` : ''
}

export function appendEmbedToPath(path: string, enabled: boolean) {
  if (!enabled) {
    return path
  }

  const hashIndex = path.indexOf('#')
  const pathWithSearch = hashIndex >= 0 ? path.slice(0, hashIndex) : path
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : ''

  const searchIndex = pathWithSearch.indexOf('?')
  const pathname = searchIndex >= 0 ? pathWithSearch.slice(0, searchIndex) : pathWithSearch
  const search = searchIndex >= 0 ? pathWithSearch.slice(searchIndex) : ''

  return `${pathname}${mergeSearchWithEmbed(search, true)}${hash}`
}
