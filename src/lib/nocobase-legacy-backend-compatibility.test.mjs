import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const favoritesSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-favorites.ts'), 'utf8')
const supplyDemandSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-supply-demand-data.ts'), 'utf8')
const dockerInitSource = readFileSync(resolve(process.cwd(), 'scripts/docker-init-v31.sh'), 'utf8')
const auditRepairSource = readFileSync(resolve(process.cwd(), 'scripts/repair-streaming-audit-columns.mjs'), 'utf8')

test('收藏扩展缺失时将 404 降级为空列表', () => {
  assert.match(favoritesSource, /favoritesEndpointAvailable === false/)
  assert.match(favoritesSource, /getErrorStatus\(error\) === 404/)
  assert.match(favoritesSource, /return \[\] as FavoriteItem\[\]/)
  assert.match(favoritesSource, /当前环境未启用收藏服务/)
})

test('供需列表按关联字段兼容性回退请求', () => {
  assert.match(supplyDemandSource, /function getSupplyDemandAppendCandidates/)
  assert.match(supplyDemandSource, /function getSupplyDemandSortCandidates/)
  assert.match(supplyDemandSource, /\[sort, '-id'\]/)
  assert.match(supplyDemandSource, /candidates\.push\(\[\]\)/)
  assert.match(supplyDemandSource, /getErrorStatus\(error\) !== 400/)
  assert.match(supplyDemandSource, /listSupplyDemandCollection<RawSupplyDemandInfoRecord>/)
})

test('无损初始化会补齐供需集合的审计配置和物理列', () => {
  assert.doesNotMatch(dockerInitSource, /已存在初始化与 schema 标记，跳过初始化/)
  assert.match(dockerInitSource, /repair-supply-demand-audit\.mjs/)
  assert.match(auditRepairSource, /'eco_supply_demand_infos'/)
})
