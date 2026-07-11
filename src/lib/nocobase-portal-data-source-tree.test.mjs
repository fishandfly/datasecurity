import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const portalDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-data.ts'), 'utf8')

test('来源单位筛选树基于完整来源单位分类构建，而不是仅保留有资源命中的节点', () => {
  assert.match(
    portalDataSource,
    /const allProviderUnitNodes = normalizedNodes\.filter\(\(node\) => node\.typeCode === 'eco_provider_units'\)/,
  )
  assert.match(
    portalDataSource,
    /const providerUnits =\s*allProviderUnitNodes\.length > 0\s*\? buildTreeSubsetBySeedIds\(allProviderUnitNodes, allProviderUnitNodes\.map\(\(node\) => node\.id\)\)\s*:\s*buildTreeSubsetBySeedIds\(normalizedNodes, providerUnitSeedIds\)/,
  )
  assert.equal(
    portalDataSource.includes('const providerUnits = buildTreeSubsetBySeedIds(normalizedNodes, providerUnitSeedIds)'),
    false,
  )
})
