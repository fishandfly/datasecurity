type PagedResponse<T> = {
  data: T[]
  meta?: {
    totalPage?: number
  }
}

export async function loadAllPages<T>(
  fetchPage: (params: { page: number; pageSize: number }) => Promise<PagedResponse<T>>,
  pageSize: number,
) {
  const records: T[] = []
  let page = 1
  let totalPage = 1

  while (page <= totalPage) {
    const payload = await fetchPage({ page, pageSize })
    records.push(...payload.data)
    totalPage = payload.meta?.totalPage ?? 1
    page += 1
  }

  return records
}

export async function loadAllPagesParallel<T>(
  fetchPage: (params: { page: number; pageSize: number }) => Promise<PagedResponse<T>>,
  pageSize: number,
) {
  const firstPage = await fetchPage({ page: 1, pageSize })
  const records: T[] = [...firstPage.data]
  const totalPage = firstPage.meta?.totalPage ?? 1

  if (totalPage <= 1) {
    return records
  }

  const remainingPages = Array.from({ length: totalPage - 1 }, (_, index) => index + 2)
  const remainingPayloads = await Promise.all(
    remainingPages.map((page) => fetchPage({ page, pageSize })),
  )

  remainingPayloads.forEach((payload) => {
    records.push(...payload.data)
  })

  return records
}
