const IMPORTANT_FIELD_DISPLAY_LIMIT = 3

function fieldPriority(value: string) {
  const tags = value.split('：')[1] || value
  if (/(^|、)核心(、|$)/.test(tags)) return 0
  if (/(^|、)重要(、|$)/.test(tags) || /直接标识符|准标识符|需脱敏/.test(tags)) return 1
  return 2
}

function isImportantField(value: string) {
  const tags = value.split('：')[1] || value
  return /(^|、)重要字段(、|$)/.test(tags)
}

export function selectImportantFieldEntries(fields: string[]) {
  return fields
    .filter(Boolean)
    .filter((field, index, values) => values.indexOf(field) === index)
    .filter(isImportantField)
    .map((field, index) => ({ field, index, priority: fieldPriority(field) }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .slice(0, IMPORTANT_FIELD_DISPLAY_LIMIT)
    .map(({ field }) => field)
}
