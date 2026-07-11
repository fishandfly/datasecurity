function toCompactText(value: string) {
  return value.replace(/\s+/g, '')
}

function uniqueTokens(tokens: string[]) {
  return Array.from(new Set(tokens.filter(Boolean)))
}

function isOrderedSubsequence(source: string, keyword: string) {
  if (!keyword) return true
  if (!source) return false

  let cursor = 0
  for (const char of keyword) {
    const nextIndex = source.indexOf(char, cursor)
    if (nextIndex < 0) {
      return false
    }
    cursor = nextIndex + 1
  }

  return true
}

type FullTextMetrics = {
  level: number
  firstIndex: number
  span: number
  length: number
}

export function normalizeFullTextSearch(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenizeFullTextSearch(value: string) {
  const normalized = normalizeFullTextSearch(value)
  if (!normalized) return [] as string[]
  return uniqueTokens(normalized.split(' '))
}

function getFullTextMetrics(source: string, keyword: string): FullTextMetrics {
  const normalizedSource = normalizeFullTextSearch(source)
  const normalizedKeyword = normalizeFullTextSearch(keyword)

  if (!normalizedKeyword) {
    return {
      level: 0,
      firstIndex: 0,
      span: 0,
      length: normalizedSource.length,
    }
  }

  if (normalizedSource.startsWith(normalizedKeyword)) {
    return {
      level: 0,
      firstIndex: 0,
      span: normalizedKeyword.length,
      length: normalizedSource.length,
    }
  }

  const phraseIndex = normalizedSource.indexOf(normalizedKeyword)
  if (phraseIndex >= 0) {
    return {
      level: 1,
      firstIndex: phraseIndex,
      span: normalizedKeyword.length,
      length: normalizedSource.length,
    }
  }

  const tokens = tokenizeFullTextSearch(normalizedKeyword)
  if (tokens.length > 1) {
    const tokenIndexes = tokens.map((token) => normalizedSource.indexOf(token))
    if (tokenIndexes.every((index) => index >= 0)) {
      const firstIndex = Math.min(...tokenIndexes)
      const lastIndex = Math.max(...tokenIndexes.map((index, tokenIndex) => index + tokens[tokenIndex].length))
      return {
        level: 2,
        firstIndex,
        span: lastIndex - firstIndex,
        length: normalizedSource.length,
      }
    }
  }

  const compactSource = toCompactText(normalizedSource)
  const compactKeyword = toCompactText(normalizedKeyword)
  if (compactKeyword && isOrderedSubsequence(compactSource, compactKeyword)) {
    const firstIndex = compactSource.indexOf(compactKeyword[0] ?? '')
    return {
      level: 3,
      firstIndex: firstIndex >= 0 ? firstIndex : Number.MAX_SAFE_INTEGER,
      span: compactSource.length,
      length: compactSource.length,
    }
  }

  return {
    level: 4,
    firstIndex: Number.MAX_SAFE_INTEGER,
    span: Number.MAX_SAFE_INTEGER,
    length: normalizedSource.length,
  }
}

export function matchesFullTextSearch(source: string, keyword: string) {
  return getFullTextMetrics(source, keyword).level < 4
}

export function compareFullTextSearch(sourceA: string, sourceB: string, keyword: string, labelA: string, labelB: string) {
  const metricsA = getFullTextMetrics(sourceA, keyword)
  const metricsB = getFullTextMetrics(sourceB, keyword)

  if (metricsA.level !== metricsB.level) {
    return metricsA.level - metricsB.level
  }

  if (metricsA.firstIndex !== metricsB.firstIndex) {
    return metricsA.firstIndex - metricsB.firstIndex
  }

  if (metricsA.span !== metricsB.span) {
    return metricsA.span - metricsB.span
  }

  if (metricsA.length !== metricsB.length) {
    return metricsA.length - metricsB.length
  }

  return labelA.localeCompare(labelB, 'zh-CN')
}
