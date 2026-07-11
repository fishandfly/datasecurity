import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

async function loadMergeSupplyDemandSceneEntries() {
  const sourcePath = resolve(process.cwd(), 'src/lib/demand-scene-submission.ts')
  const source = readFileSync(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  const mod = await import(moduleUrl)
  return mod.mergeSupplyDemandSceneEntries
}

const supplyDemandSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-supply-demand-data.ts'), 'utf8')

test('多条资源需求会聚合成一条场景申请，并保留逐条资源明细', async () => {
  const mergeSupplyDemandSceneEntries = await loadMergeSupplyDemandSceneEntries()

  assert.deepEqual(
    mergeSupplyDemandSceneEntries([
      {
        requiredDataResourceName: '省控城市小时空气质量监测数据',
        mainDataItems: 'AQI、PM2.5、PM10',
        demandDescription: '用于驾驶舱空气质量趋势分析',
        dataFrequencyDemandId: 'hourly',
        dataFrequencyDemandName: '每小时',
        linkedResourceIds: ['3301'],
      },
      {
        requiredDataResourceName: '重点污染源在线监测数据',
        mainDataItems: '排口浓度、流量、排放量',
        demandDescription: '用于污染源联动研判',
        dataFrequencyDemandId: 'hourly',
        dataFrequencyDemandName: '每小时',
        linkedResourceIds: ['3302', '3301'],
      },
    ]),
    {
      requiredDataResourceName: '省控城市小时空气质量监测数据；重点污染源在线监测数据',
      mainDataItems: '1. 省控城市小时空气质量监测数据：AQI、PM2.5、PM10\n2. 重点污染源在线监测数据：排口浓度、流量、排放量',
      demandDescription: '1. 省控城市小时空气质量监测数据（期望频次：每小时）：用于驾驶舱空气质量趋势分析\n2. 重点污染源在线监测数据（期望频次：每小时）：用于污染源联动研判',
      dataFrequencyDemandId: 'hourly',
      linkedResourceIds: ['3301', '3302'],
      resourceCount: 2,
    },
  )
})

test('供需申请创建按场景只生成一条主记录，并使用聚合后的多资源内容', () => {
  assert.match(supplyDemandSource, /import \{ mergeSupplyDemandSceneEntries \} from '\.\/demand-scene-submission'/)
  assert.match(supplyDemandSource, /const mergedEntry = mergeSupplyDemandSceneEntries\(params\.entries\)/)
  assert.doesNotMatch(supplyDemandSource, /for \(const entry of params\.entries\)/)
  assert.match(supplyDemandSource, /required_data_resource_name: normalizeText\(mergedEntry\.requiredDataResourceName\)/)
  assert.match(supplyDemandSource, /main_data_items: normalizeText\(mergedEntry\.mainDataItems\)/)
  assert.match(supplyDemandSource, /demand_description: normalizeText\(mergedEntry\.demandDescription\)/)
  assert.match(supplyDemandSource, /data_frequency_demand_id: mergedEntry\.dataFrequencyDemandId \? Number\(mergedEntry\.dataFrequencyDemandId\) : null/)
  assert.match(supplyDemandSource, /bindLinkedResources\(\s*supplyDemandCollection,\s*createdId,\s*mergedEntry\.linkedResourceIds,\s*\)/)
})
