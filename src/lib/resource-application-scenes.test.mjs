import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

async function loadBuildResourceRelatedApplications() {
  const sourcePath = resolve(process.cwd(), 'src/lib/resource-application-scenes.ts')
  const source = readFileSync(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  const mod = await import(moduleUrl)
  return mod.buildResourceRelatedApplications
}

function makeSupplyDemandInfo(overrides = {}) {
  return {
    id: overrides.id ?? 'row-1',
    createdById: overrides.createdById ?? '',
    updatedById: overrides.updatedById ?? '',
    sceneName: overrides.sceneName ?? '生态监测场景',
    requiredDataResourceName: overrides.requiredDataResourceName ?? '',
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
    domainCategoryName: overrides.domainCategoryName ?? '未标注',
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

function makeAppNode(overrides = {}) {
  return {
    id: overrides.id ?? 'app-1',
    parentId: overrides.parentId ?? null,
    seqId: overrides.seqId ?? '',
    name: overrides.name ?? '应用一',
    tags: overrides.tags ?? [],
    contact: overrides.contact ?? '',
    description: overrides.description ?? '',
    createdAt: overrides.createdAt ?? '',
    updatedAt: overrides.updatedAt ?? '',
    domainCategoryId: overrides.domainCategoryId ?? '',
    domainCategoryName: overrides.domainCategoryName ?? '',
    depth: overrides.depth ?? 0,
    pathLabel: overrides.pathLabel ?? '应用一',
    ancestorIds: overrides.ancestorIds ?? ['app-1'],
    childCount: overrides.childCount ?? 0,
    descendantCount: overrides.descendantCount ?? 0,
    displayCount: overrides.displayCount ?? 1,
    hasChildren: overrides.hasChildren ?? false,
    screenshotUrl: overrides.screenshotUrl ?? '',
    searchText: overrides.searchText ?? '应用一',
    children: overrides.children ?? [],
  }
}

test('buildResourceRelatedApplications 按 related_app 聚合当前资源关联应用，并优先补齐 eco_app 元数据', async () => {
  const buildResourceRelatedApplications = await loadBuildResourceRelatedApplications()
  const resourceId = '33000000000002'
  const appById = new Map([
    [
      'app-1',
      makeAppNode({
        id: 'app-1',
        name: '水环境驾驶舱',
        description: '展示断面监测、水质排名和污染溯源。',
        contact: '王工',
        tags: ['驾驶舱', '水环境'],
        domainCategoryName: '水生态环境',
        screenshotUrl: 'https://example.com/app-1.png',
      }),
    ],
  ])

  const applications = buildResourceRelatedApplications(
    resourceId,
    [
      makeSupplyDemandInfo({
        id: 'scene-a-1',
        sceneName: '断面治理会商',
        satisfactionStatusName: '已接入',
        distributionDate: '2026-04-18T08:00:00.000Z',
        domainCategoryName: '水生态环境',
        linkedResourceIds: [resourceId, '33000000000003'],
        relatedAppIds: ['app-1'],
        relatedAppNames: ['水环境驾驶舱'],
        relatedApps: [
          {
            id: 'app-1',
            name: '水环境驾驶舱',
            description: '',
            contact: '',
            tags: ['监测'],
            domainCategoryId: '',
            domainCategoryName: '',
            screenshotUrl: '',
          },
        ],
      }),
      makeSupplyDemandInfo({
        id: 'scene-a-2',
        sceneName: '断面治理会商',
        dataStatusDescription: '待补充上游水文数据',
        distributionDate: '2026-04-22',
        domainCategoryName: '水生态环境',
        linkedResourceIds: [resourceId],
        relatedAppIds: ['app-1', 'app-2'],
        relatedAppNames: ['水环境驾驶舱', '指挥调度应用'],
        relatedApps: [
          {
            id: 'app-1',
            name: '水环境驾驶舱',
            description: '',
            contact: '',
            tags: [],
            domainCategoryId: '',
            domainCategoryName: '',
            screenshotUrl: '',
          },
          {
            id: 'app-2',
            name: '指挥调度应用',
            description: '',
            contact: '李工',
            tags: ['调度'],
            domainCategoryId: '',
            domainCategoryName: '',
            screenshotUrl: '',
          },
        ],
      }),
      makeSupplyDemandInfo({
        id: 'scene-b-1',
        sceneName: '无关场景',
        linkedResourceIds: ['33000000009999'],
        relatedAppIds: ['app-3'],
        relatedAppNames: ['无关应用'],
        relatedApps: [
          {
            id: 'app-3',
            name: '无关应用',
            description: '',
            contact: '',
            tags: [],
            domainCategoryId: '',
            domainCategoryName: '',
            screenshotUrl: '',
          },
        ],
      }),
    ],
    appById,
  )

  assert.deepEqual(applications, [
    {
      appId: 'app-1',
      appName: '水环境驾驶舱',
      description: '展示断面监测、水质排名和污染溯源。',
      contact: '王工',
      tags: ['驾驶舱', '水环境', '监测'],
      screenshotUrl: 'https://example.com/app-1.png',
      domainCategoryName: '水生态环境',
      sceneNames: ['断面治理会商'],
      sourceDomainLabels: ['水生态环境'],
      recordCount: 2,
      linkedResourceCount: 2,
      connectedCount: 1,
      pendingCount: 1,
      latestDistributionDate: '2026-04-22',
    },
    {
      appId: 'app-2',
      appName: '指挥调度应用',
      description: '通过“断面治理会商”场景建立供需对接关联。',
      contact: '李工',
      tags: ['调度'],
      screenshotUrl: '',
      domainCategoryName: '',
      sceneNames: ['断面治理会商'],
      sourceDomainLabels: ['水生态环境'],
      recordCount: 1,
      linkedResourceCount: 1,
      connectedCount: 0,
      pendingCount: 1,
      latestDistributionDate: '2026-04-22',
    },
  ])
})
