export function normalizeAuthorizedApiCodes(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(new Map(
      value
        .map((item) => String(item).trim())
        .filter(Boolean)
        .map((item) => [item.toUpperCase(), item]),
    ).values())
  }
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    return normalizeAuthorizedApiCodes(JSON.parse(value))
  } catch {
    return normalizeAuthorizedApiCodes(value.split(/[、,，;；]/))
  }
}

export function hasApiAuthorization(value: unknown, apiCode: string) {
  const target = apiCode.trim().toUpperCase()
  if (!target) return false
  const codes = normalizeAuthorizedApiCodes(value).map((item) => item.toUpperCase())
  return codes.includes('*') || codes.includes(target)
}

export function hasGlobalApiAuthorization(value: unknown) {
  return normalizeAuthorizedApiCodes(value).some((item) => item === '*')
}

export function grantApiAuthorization(value: unknown, apiCode: string) {
  const codes = normalizeAuthorizedApiCodes(value)
  const normalizedApiCode = apiCode.trim()
  if (!normalizedApiCode || hasApiAuthorization(codes, normalizedApiCode)) return codes
  return [...codes, normalizedApiCode]
}

export function revokeApiAuthorization(value: unknown, apiCode: string) {
  const target = apiCode.trim().toUpperCase()
  if (!target || hasGlobalApiAuthorization(value)) return normalizeAuthorizedApiCodes(value)
  return normalizeAuthorizedApiCodes(value).filter((item) => item.toUpperCase() !== target)
}
