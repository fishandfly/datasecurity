const HEADER_SEARCH_PATHS = new Set(['/security-governance', '/security-governance/dashboard', '/security-governance/resources'])

export function buildGlobalSearchPath(keyword: string) {
  const normalized = keyword.trim()

  if (!normalized) {
    return '/security-governance/resources'
  }

  const searchParams = new URLSearchParams()
  searchParams.set('keyword', normalized)
  return `/security-governance/resources?${searchParams.toString()}`
}

export function readGlobalSearchKeyword(pathname: string, search: string) {
  if (!HEADER_SEARCH_PATHS.has(pathname)) {
    return ''
  }

  const searchParams = new URLSearchParams(search)
  return searchParams.get('keyword')?.trim() ?? ''
}
