import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const portalDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-data.ts'), 'utf8')

test('轻量目录模式提高分页尺寸以减少首页请求轮次', () => {
  assert.match(portalDataSource, /const PORTAL_TREE_NODE_PAGE_SIZE = 1000/)
  assert.match(portalDataSource, /const PORTAL_DICTIONARY_PAGE_SIZE = 1000/)
  assert.match(portalDataSource, /const PORTAL_LIST_RESOURCE_PAGE_SIZE = 1000/)
  assert.match(portalDataSource, /const PORTAL_FULL_RESOURCE_PAGE_SIZE = 200/)
  assert.match(portalDataSource, /}, PORTAL_TREE_NODE_PAGE_SIZE\)/)
  assert.match(portalDataSource, /}, PORTAL_DICTIONARY_PAGE_SIZE\)/)
  assert.match(portalDataSource, /}, getPortalResourcePageSize\(mode\)\)/)
})
