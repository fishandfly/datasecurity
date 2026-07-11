import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const statDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-stat-data.ts'), 'utf8')

test('统计概览与当前快照模块加载时只恢复 30 分钟内的新缓存', () => {
  assert.match(statDataSource, /const CACHE_TTL_MINUTES = 30/)
  assert.match(statDataSource, /if \(overview\?\.data && isCacheFresh\(overview\.cachedAt\) && isCurrentOverviewStatsCacheUsable\(overview\.data\)\)/)
  assert.match(statDataSource, /if \(snapshot\?\.data && isCacheFresh\(snapshot\.cachedAt\)\)/)
})
