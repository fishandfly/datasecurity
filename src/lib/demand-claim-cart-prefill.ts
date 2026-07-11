export type ClaimCartDemandPrefillRow = {
  claimCartItemId?: string
  linkedResourceId?: string | number
  resourceId?: string | number
  resourceName?: string
  title?: string
  description?: string
  useCase?: string
}

export type MergedClaimCartDemandPrefill = {
  claimCartItemIds: string[]
  linkedResourceIds: string[]
  resourceNames: string[]
  resourceName: string
  title: string
  description: string
  useCase: string
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeId(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function mergeClaimCartDemandPrefillRows(
  rows: ClaimCartDemandPrefillRow[],
): MergedClaimCartDemandPrefill {
  const normalizedRows = rows.map((row) => {
    const resourceName = normalizeText(row.resourceName) || normalizeText(row.title)
    return {
      claimCartItemId: normalizeText(row.claimCartItemId),
      linkedResourceId: normalizeId(row.linkedResourceId ?? row.resourceId),
      resourceName,
      description: normalizeText(row.description),
      useCase: normalizeText(row.useCase),
    }
  }).filter((row) => row.claimCartItemId || row.linkedResourceId || row.resourceName || row.description)

  const claimCartItemIds = normalizedRows.map((row) => row.claimCartItemId).filter(Boolean)
  const linkedResourceIds = Array.from(new Set(normalizedRows.map((row) => row.linkedResourceId).filter(Boolean)))
  const resourceNames = normalizedRows.map((row) => row.resourceName).filter(Boolean)

  return {
    claimCartItemIds,
    linkedResourceIds,
    resourceNames,
    resourceName: resourceNames.join('；'),
    title: resourceNames.join('；'),
    description: normalizedRows.map((row, index) => `${index + 1}. ${row.resourceName || `资源${index + 1}`}：${row.description || '未填写'}`).join('\n'),
    useCase: normalizedRows.find((row) => row.useCase)?.useCase ?? '',
  }
}
