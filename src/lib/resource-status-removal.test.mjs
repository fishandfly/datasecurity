import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

const portalDataSource = readSource('src/lib/nocobase-portal-data.ts')
const resourceEditSource = readSource('src/lib/nocobase-resource-edit.ts')
const dashboardSource = readSource('src/lib/security-dashboard-v3-data.ts')
const detailPageSource = readSource('src/pages/security-governance-detail-page.tsx')
const runtimeServiceSource = readSource('security-runtime-service/app/main.py')

test('数据资源不再读写或展示启停状态', () => {
  assert.doesNotMatch(portalDataSource, /resource_status|resourceStatus/)
  assert.doesNotMatch(resourceEditSource, /resource_status|resourceStatus/)
  assert.doesNotMatch(detailPageSource, /资源状态|resourceStatus/)
})

test('目录、看板和数据源统计包含所有数据资源', () => {
  assert.match(portalDataSource, /allResources = allResourcesResult/)
  assert.match(dashboardSource, /const resources = allResources/)
  assert.doesNotMatch(dashboardSource, /resource_status/)
  assert.match(runtimeServiceSource, /FROM eco_data_resources WHERE data_source_id=%\(id\)s/)
  assert.doesNotMatch(runtimeServiceSource, /resource_status/)
})
