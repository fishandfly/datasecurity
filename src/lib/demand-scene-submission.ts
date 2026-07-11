export type SupplyDemandSceneEntryDraft = {
  requiredDataResourceName: string
  mainDataItems: string
  demandDescription: string
  dataFrequencyDemandId: string
  dataFrequencyDemandName?: string
  linkedResourceIds?: string[]
}

export type MergedSupplyDemandSceneEntry = {
  requiredDataResourceName: string
  mainDataItems: string
  demandDescription: string
  dataFrequencyDemandId: string
  linkedResourceIds: string[]
  resourceCount: number
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildNumberedLine(index: number, resourceName: string, content: string) {
  return `${index + 1}. ${resourceName}：${content || '未填写'}`
}

function buildDemandDescriptionLine(
  index: number,
  resourceName: string,
  frequencyName: string,
  description: string,
) {
  const frequencySegment = frequencyName ? `（期望频次：${frequencyName}）` : ''
  return `${index + 1}. ${resourceName}${frequencySegment}：${description || '未填写'}`
}

export function mergeSupplyDemandSceneEntries(
  entries: SupplyDemandSceneEntryDraft[],
): MergedSupplyDemandSceneEntry {
  const normalizedEntries = entries.map((entry) => ({
    requiredDataResourceName: normalizeText(entry.requiredDataResourceName),
    mainDataItems: normalizeText(entry.mainDataItems),
    demandDescription: normalizeText(entry.demandDescription),
    dataFrequencyDemandId: normalizeText(entry.dataFrequencyDemandId),
    dataFrequencyDemandName: normalizeText(entry.dataFrequencyDemandName),
    linkedResourceIds: (entry.linkedResourceIds ?? []).map((item) => normalizeText(item)).filter(Boolean),
  })).filter((entry) => entry.requiredDataResourceName || entry.mainDataItems || entry.demandDescription)

  if (normalizedEntries.length === 0) {
    return {
      requiredDataResourceName: '',
      mainDataItems: '',
      demandDescription: '',
      dataFrequencyDemandId: '',
      linkedResourceIds: [],
      resourceCount: 0,
    }
  }

  const deduplicatedLinkedResourceIds = Array.from(new Set(
    normalizedEntries.flatMap((entry) => entry.linkedResourceIds),
  ))
  const uniqueFrequencyIds = Array.from(new Set(
    normalizedEntries.map((entry) => entry.dataFrequencyDemandId).filter(Boolean),
  ))

  if (normalizedEntries.length === 1) {
    const [entry] = normalizedEntries
    return {
      requiredDataResourceName: entry.requiredDataResourceName,
      mainDataItems: entry.mainDataItems,
      demandDescription: entry.demandDescription,
      dataFrequencyDemandId: uniqueFrequencyIds.length === 1 ? uniqueFrequencyIds[0] : '',
      linkedResourceIds: deduplicatedLinkedResourceIds,
      resourceCount: 1,
    }
  }

  return {
    requiredDataResourceName: normalizedEntries.map((entry) => entry.requiredDataResourceName).join('；'),
    mainDataItems: normalizedEntries
      .map((entry, index) => buildNumberedLine(index, entry.requiredDataResourceName, entry.mainDataItems))
      .join('\n'),
    demandDescription: normalizedEntries
      .map((entry, index) =>
        buildDemandDescriptionLine(
          index,
          entry.requiredDataResourceName,
          entry.dataFrequencyDemandName,
          entry.demandDescription,
        ))
      .join('\n'),
    dataFrequencyDemandId: uniqueFrequencyIds.length === 1 ? uniqueFrequencyIds[0] : '',
    linkedResourceIds: deduplicatedLinkedResourceIds,
    resourceCount: normalizedEntries.length,
  }
}
