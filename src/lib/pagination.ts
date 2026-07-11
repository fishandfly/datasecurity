export type PaginationItem = number | 'ellipsis'

export function buildPaginationItems(currentPage: number, totalPages: number, siblingCount = 1): PaginationItem[] {
  const safeTotalPages = Math.max(1, Math.floor(totalPages))
  const safeCurrentPage = Math.min(Math.max(1, Math.floor(currentPage)), safeTotalPages)
  const safeSiblingCount = Math.max(0, Math.floor(siblingCount))
  const totalPageNumbers = safeSiblingCount * 2 + 5

  if (safeTotalPages <= totalPageNumbers) {
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1)
  }

  const leftSiblingIndex = Math.max(safeCurrentPage - safeSiblingCount, 1)
  const rightSiblingIndex = Math.min(safeCurrentPage + safeSiblingCount, safeTotalPages)
  const shouldShowLeftEllipsis = leftSiblingIndex > 2
  const shouldShowRightEllipsis = rightSiblingIndex < safeTotalPages - 1

  if (!shouldShowLeftEllipsis) {
    const leftItemCount = 3 + safeSiblingCount * 2
    const leftRange = Array.from({ length: leftItemCount }, (_, index) => index + 1)
    return [...leftRange, 'ellipsis', safeTotalPages]
  }

  if (!shouldShowRightEllipsis) {
    const rightItemCount = 3 + safeSiblingCount * 2
    const startPage = safeTotalPages - rightItemCount + 1
    const rightRange = Array.from({ length: rightItemCount }, (_, index) => startPage + index)
    return [1, 'ellipsis', ...rightRange]
  }

  const middleRange = Array.from(
    { length: rightSiblingIndex - leftSiblingIndex + 1 },
    (_, index) => leftSiblingIndex + index,
  )

  return [1, 'ellipsis', ...middleRange, 'ellipsis', safeTotalPages]
}
