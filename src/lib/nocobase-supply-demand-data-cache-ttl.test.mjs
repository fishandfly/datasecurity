import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-supply-demand-data.ts'), 'utf8')

test('供需摘要缓存支持 3 小时 TTL 和 localStorage 恢复', () => {
  assert.match(source, /const LS_CACHE_SUPPLY_DEMAND_SUMMARY = 'eco_supply_demand_summary_v1'/)
  assert.match(source, /const SUMMARY_CACHE_TTL_MINUTES = 180/)
  assert.match(source, /const summary = readStorageCache<SupplyDemandInfo\[]>\(LS_CACHE_SUPPLY_DEMAND_SUMMARY\)/)
  assert.match(source, /if \(summary\?\.data && isCacheFresh\(summary\.cachedAt, SUMMARY_CACHE_TTL_MINUTES\)\)/)
  assert.match(source, /writeStorageCache\(LS_CACHE_SUPPLY_DEMAND_SUMMARY, payload\)/)
  assert.match(source, /localStorage\.removeItem\(LS_CACHE_SUPPLY_DEMAND_SUMMARY\)/)
})
