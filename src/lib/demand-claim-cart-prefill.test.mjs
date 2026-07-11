import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

async function loadMergeClaimCartDemandPrefillRows() {
  const sourcePath = resolve(process.cwd(), 'src/lib/demand-claim-cart-prefill.ts')
  const source = readFileSync(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  const mod = await import(moduleUrl)
  return mod.mergeClaimCartDemandPrefillRows
}

test('申领夹多资源预填会折叠成一条申请表单预填，并保留全部资源标识', async () => {
  const mergeClaimCartDemandPrefillRows = await loadMergeClaimCartDemandPrefillRows()

  assert.deepEqual(
    mergeClaimCartDemandPrefillRows([
      {
        claimCartItemId: 'claim-1',
        linkedResourceId: '3301',
        resourceName: '省控城市小时空气质量监测数据',
        title: '省控城市小时空气质量监测数据',
        description: '省控城市小时空气质量监测数据（区分当前与历史）',
      },
      {
        claimCartItemId: 'claim-2',
        linkedResourceId: '3302',
        resourceName: '省控城市日均空气质量监测数据',
        title: '省控城市日均空气质量监测数据',
        description: '省控城市日均空气质量监测数据（区分当前与历史）',
      },
    ]),
    {
      claimCartItemIds: ['claim-1', 'claim-2'],
      linkedResourceIds: ['3301', '3302'],
      resourceNames: ['省控城市小时空气质量监测数据', '省控城市日均空气质量监测数据'],
      resourceName: '省控城市小时空气质量监测数据；省控城市日均空气质量监测数据',
      title: '省控城市小时空气质量监测数据；省控城市日均空气质量监测数据',
      description: '1. 省控城市小时空气质量监测数据：省控城市小时空气质量监测数据（区分当前与历史）\n2. 省控城市日均空气质量监测数据：省控城市日均空气质量监测数据（区分当前与历史）',
      useCase: '',
    },
  )
})
