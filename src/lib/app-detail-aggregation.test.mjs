import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

async function loadBuildDemandApplicationDetailData() {
  const sourcePath = resolve(process.cwd(), 'src/lib/app-detail-aggregation.ts')
  const source = readFileSync(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  const mod = await import(moduleUrl)
  return mod.buildDemandApplicationDetailData
}

function makeApp(overrides = {}) {
  return {
    id: overrides.id ?? 'app-root',
    parentId: overrides.parentId ?? null,
    seqId: overrides.seqId ?? '',
    name: overrides.name ?? '生态治理应用',
    tags: overrides.tags ?? [],
    contact: overrides.contact ?? '',
    description: overrides.description ?? '',
    createdAt: overrides.createdAt ?? '',
    updatedAt: overrides.updatedAt ?? '',
    domainCategoryId: overrides.domainCategoryId ?? '',
    domainCategoryName: overrides.domainCategoryName ?? '生态环境',
    depth: overrides.depth ?? 0,
    pathLabel: overrides.pathLabel ?? '生态治理应用',
    ancestorIds: overrides.ancestorIds ?? ['app-root'],
    childCount: overrides.childCount ?? 0,
    descendantCount: overrides.descendantCount ?? 0,
    displayCount: overrides.displayCount ?? 1,
    hasChildren: overrides.hasChildren ?? false,
    screenshotUrl: overrides.screenshotUrl ?? '',
    searchText: overrides.searchText ?? '生态治理应用',
    children: overrides.children ?? [],
  }
}

function makeSupplyDemand(overrides = {}) {
  return {
    id: overrides.id ?? 'sd-1',
    createdById: overrides.createdById ?? '',
    updatedById: overrides.updatedById ?? '',
    sceneName: overrides.sceneName ?? '断面治理场景',
    requiredDataResourceName: overrides.requiredDataResourceName ?? '断面水质数据',
    mainDataItems: overrides.mainDataItems ?? '',
    demandDescription: overrides.demandDescription ?? '',
    isRequired: overrides.isRequired ?? true,
    dataStatusDescription: overrides.dataStatusDescription ?? '',
    dataSourceSystem: overrides.dataSourceSystem ?? '',
    dataContactPerson: overrides.dataContactPerson ?? '',
    dataConnectionDescription: overrides.dataConnectionDescription ?? '',
    distributionDate: overrides.distributionDate ?? '',
    dataCategoryId: overrides.dataCategoryId ?? '',
    dataCategoryName: overrides.dataCategoryName ?? '',
    dataSourceUnitId: overrides.dataSourceUnitId ?? '',
    dataSourceUnitName: overrides.dataSourceUnitName ?? '',
    dataSupplyMethodId: overrides.dataSupplyMethodId ?? '',
    dataSupplyMethodName: overrides.dataSupplyMethodName ?? '',
    domainCategoryId: overrides.domainCategoryId ?? '',
    domainCategoryName: overrides.domainCategoryName ?? '生态环境',
    externalDataCategoryId: overrides.externalDataCategoryId ?? '',
    externalDataCategoryName: overrides.externalDataCategoryName ?? '',
    listSourceId: overrides.listSourceId ?? '',
    listSourceName: overrides.listSourceName ?? '',
    satisfactionStatusId: overrides.satisfactionStatusId ?? '',
    satisfactionStatusName: overrides.satisfactionStatusName ?? '',
    dataFrequencyDemandId: overrides.dataFrequencyDemandId ?? '',
    dataFrequencyDemandName: overrides.dataFrequencyDemandName ?? '',
    dataSyncFrequencyId: overrides.dataSyncFrequencyId ?? '',
    dataSyncFrequencyName: overrides.dataSyncFrequencyName ?? '',
    businessDomainCategoryIds: overrides.businessDomainCategoryIds ?? [],
    businessDomainCategoryNames: overrides.businessDomainCategoryNames ?? [],
    linkedResourceIds: overrides.linkedResourceIds ?? [],
    linkedResourceNames: overrides.linkedResourceNames ?? [],
    relatedAppIds: overrides.relatedAppIds ?? [],
    relatedAppNames: overrides.relatedAppNames ?? [],
    relatedApps: overrides.relatedApps ?? [],
    createdAt: overrides.createdAt ?? '',
    updatedAt: overrides.updatedAt ?? '',
  }
}

function makeCatalogItem(overrides = {}) {
  return {
    id: overrides.id ?? 'res-1',
    code: overrides.code ?? '',
    name: overrides.name ?? '断面水质数据',
    categoryId: overrides.categoryId ?? '',
    category: overrides.category ?? '生态监测',
    categoryAncestorIds: overrides.categoryAncestorIds ?? [],
    businessAttributeId: overrides.businessAttributeId ?? '',
    businessAttribute: overrides.businessAttribute ?? '',
    businessAttributePath: overrides.businessAttributePath ?? '',
    businessAttributeAncestorIds: overrides.businessAttributeAncestorIds ?? [],
    industryCategory: overrides.industryCategory ?? '',
    businessCategoryId: overrides.businessCategoryId ?? '',
    businessCategory: overrides.businessCategory ?? '',
    businessCategoryPath: overrides.businessCategoryPath ?? '',
    informationCategoryId: overrides.informationCategoryId ?? '',
    informationCategoryAncestorIds: overrides.informationCategoryAncestorIds ?? [],
    informationCategory: overrides.informationCategory ?? '',
    informationCategoryPath: overrides.informationCategoryPath ?? '',
    openTypeId: overrides.openTypeId ?? '',
    openType: overrides.openType ?? '',
    serviceTypeId: overrides.serviceTypeId ?? '',
    serviceType: overrides.serviceType ?? '数据资源',
    supplyMethod: overrides.supplyMethod ?? '',
    sharingAttribute: overrides.sharingAttribute ?? '',
    departmentId: overrides.departmentId ?? '',
    department: overrides.department ?? '生态环境厅',
    departmentAncestorIds: overrides.departmentAncestorIds ?? [],
    regionId: overrides.regionId ?? '',
    regionAncestorIds: overrides.regionAncestorIds ?? [],
    contact: overrides.contact ?? '',
    tags: overrides.tags ?? [],
    description: overrides.description ?? '',
    summary: overrides.summary ?? '',
    updateCycleId: overrides.updateCycleId ?? '',
    updateCycle: overrides.updateCycle ?? '日更',
    format: overrides.format ?? [],
    timeScope: overrides.timeScope ?? '',
    publishDate: overrides.publishDate ?? '',
    updateTime: overrides.updateTime ?? '',
    areaScope: overrides.areaScope ?? '',
    count: overrides.count ?? '',
    countValue: overrides.countValue ?? 0,
    fieldCount: overrides.fieldCount ?? 0,
    usageCount: overrides.usageCount ?? 0,
    apiCount: overrides.apiCount ?? 0,
    fieldRows: overrides.fieldRows ?? [],
    dataLineage: overrides.dataLineage ?? null,
    sourceSystem: overrides.sourceSystem ?? '',
    sourceTable: overrides.sourceTable ?? '',
    physicalTables: overrides.physicalTables ?? {
      baseline: '',
      businessTimeField: '',
      tables: [],
      sourceSystems: [],
      rows: [],
    },
    mapPreview: overrides.mapPreview ?? null,
    remarks: overrides.remarks ?? '',
    searchText: overrides.searchText ?? '断面水质数据',
  }
}

test('buildDemandApplicationDetailData 聚合当前应用、下级应用、供需对接与数据资源', async () => {
  const buildDemandApplicationDetailData = await loadBuildDemandApplicationDetailData()

  const leafApp = makeApp({
    id: 'app-leaf',
    parentId: 'app-child',
    name: '断面预警处置',
    pathLabel: '生态治理应用 / 监测预警 / 断面预警处置',
    ancestorIds: ['app-root', 'app-child', 'app-leaf'],
  })

  const childApp = makeApp({
    id: 'app-child',
    parentId: 'app-root',
    name: '监测预警',
    pathLabel: '生态治理应用 / 监测预警',
    ancestorIds: ['app-root', 'app-child'],
    childCount: 1,
    descendantCount: 1,
    hasChildren: true,
    children: [leafApp],
  })

  const rootApp = makeApp({
    id: 'app-root',
    name: '生态治理应用',
    childCount: 1,
    descendantCount: 2,
    hasChildren: true,
    children: [childApp],
  })

  const detail = buildDemandApplicationDetailData(
    'app-root',
    [rootApp, childApp, leafApp],
    [
      makeSupplyDemand({
        id: 'sd-direct',
        sceneName: '综合治理驾驶舱',
        satisfactionStatusName: '已接入',
        distributionDate: '2026-05-01',
        linkedResourceIds: ['res-1'],
        linkedResourceNames: ['断面水质数据'],
        relatedApps: [
          {
            id: 'app-root',
            name: '生态治理应用',
            tags: [],
            contact: '',
            description: '',
            domainCategoryId: '',
            domainCategoryName: '',
            screenshotUrl: '',
          },
        ],
      }),
      makeSupplyDemand({
        id: 'sd-child',
        sceneName: '断面超标预警',
        dataStatusDescription: '待补充分析模型',
        distributionDate: '2026-05-03',
        linkedResourceIds: ['res-2'],
        linkedResourceNames: ['断面告警数据'],
        relatedApps: [
          {
            id: 'app-leaf',
            name: '断面预警处置',
            tags: [],
            contact: '',
            description: '',
            domainCategoryId: '',
            domainCategoryName: '',
            screenshotUrl: '',
          },
        ],
      }),
      makeSupplyDemand({
        id: 'sd-other',
        sceneName: '无关应用',
        distributionDate: '2026-05-05',
        linkedResourceIds: ['res-9'],
        linkedResourceNames: ['无关资源'],
        relatedApps: [
          {
            id: 'app-other',
            name: '外部应用',
            tags: [],
            contact: '',
            description: '',
            domainCategoryId: '',
            domainCategoryName: '',
            screenshotUrl: '',
          },
        ],
      }),
    ],
    [
      makeCatalogItem({
        id: 'res-1',
        name: '断面水质数据',
        summary: '用于综合治理驾驶舱展示断面现状。',
      }),
      makeCatalogItem({
        id: 'res-2',
        name: '断面告警数据',
        summary: '用于预警处置。',
      }),
    ],
  )

  assert.ok(detail)
  assert.equal(detail.currentApp.id, 'app-root')
  assert.deepEqual(detail.breadcrumbApps.map((item) => item.id), ['app-root'])
  assert.equal(detail.currentSection.directRecordCount, 1)
  assert.equal(detail.currentSection.aggregateRecordCount, 2)
  assert.equal(detail.currentSection.aggregateResourceCount, 2)
  assert.equal(detail.currentSection.records[0].sceneName, '断面超标预警')
  assert.equal(detail.currentSection.records[0].isDirectMatch, false)
  assert.deepEqual(detail.currentSection.records[0].matchedAppNames, ['断面预警处置'])
  assert.equal(detail.childSections.length, 1)
  assert.equal(detail.childSections[0].app.id, 'app-child')
  assert.equal(detail.childSections[0].aggregateRecordCount, 1)
  assert.equal(detail.childSections[0].aggregateResourceCount, 1)
  assert.equal(detail.childSections[0].records[0].linkedResources[0].name, '断面告警数据')
  assert.equal(detail.childTreeSections.length, 1)
  assert.equal(detail.childTreeSections[0].app.id, 'app-child')
  assert.equal(detail.childTreeSections[0].children.length, 1)
  assert.equal(detail.childTreeSections[0].children[0].app.id, 'app-leaf')
})
