export function buildCatalogSearchPath(keyword: string, currentSearch = '') {
  const normalized = keyword.trim()
  const searchParams = new URLSearchParams(currentSearch)

  if (normalized) {
    searchParams.set('keyword', normalized)
  } else {
    searchParams.delete('keyword')
  }

  searchParams.delete('page')

  return searchParams.toString() ? `/catalog?${searchParams.toString()}` : '/catalog'
}

export function readCatalogSearchKeyword(pathname: string, search: string) {
  if (pathname !== '/catalog') {
    return ''
  }

  const searchParams = new URLSearchParams(search)
  return searchParams.get('keyword')?.trim() ?? ''
}
