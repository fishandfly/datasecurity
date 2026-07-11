import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCatalogResourceTypeOptions,
  filterCatalogItemsByResourceType,
  getCatalogResourceTypeFilterId,
} from './catalog-resource-type.ts'

type TestItem = {
  id: string
  serviceTypeId: string
  serviceType: string
  mapPreview?: Record<string, unknown> | null
}

const FIXTURES: TestItem[] = [
  { id: 'resource', serviceTypeId: '33', serviceType: '数据资源' },
  { id: 'data-api', serviceTypeId: '34', serviceType: '数据服务API' },
  { id: 'map-api', serviceTypeId: '35', serviceType: '地图API', mapPreview: {} },
  { id: 'geo-map', serviceTypeId: '33', serviceType: '数据资源', mapPreview: {} },
  { id: 'file-api', serviceTypeId: '36', serviceType: '文件服务API' },
  { id: 'base-api', serviceTypeId: '37', serviceType: '基础服务API' },
  { id: 'source', serviceTypeId: '32', serviceType: '数据来源' },
]

test('getCatalogResourceTypeFilterId maps supported resource groups and ignores unsupported types', () => {
  assert.equal(getCatalogResourceTypeFilterId(FIXTURES[0]), 'data-resource')
  assert.equal(getCatalogResourceTypeFilterId(FIXTURES[1]), 'data-api')
  assert.equal(getCatalogResourceTypeFilterId(FIXTURES[2]), 'spatial-resource')
  assert.equal(getCatalogResourceTypeFilterId(FIXTURES[3]), 'spatial-resource')
  assert.equal(getCatalogResourceTypeFilterId(FIXTURES[4]), 'data-api')
  assert.equal(getCatalogResourceTypeFilterId(FIXTURES[5]), 'data-api')
  assert.equal(getCatalogResourceTypeFilterId(FIXTURES[6]), 'data-source')
  assert.equal(getCatalogResourceTypeFilterId({ serviceTypeId: '', serviceType: '地图API' }), 'spatial-resource')
  assert.equal(getCatalogResourceTypeFilterId({ serviceTypeId: '', serviceType: '数据API' }), 'data-api')
  assert.equal(getCatalogResourceTypeFilterId({ serviceTypeId: '', serviceType: '数据源' }), 'data-source')
})

test('buildCatalogResourceTypeOptions returns fixed four groups with aggregated counts', () => {
  assert.deepEqual(buildCatalogResourceTypeOptions(FIXTURES), [
    { id: '', label: '全部', count: 7 },
    { id: 'data-resource', label: '数据资源', count: 1 },
    { id: 'spatial-resource', label: '空间资源', count: 2 },
    { id: 'data-api', label: '数据API', count: 3 },
    { id: 'data-source', label: '数据源', count: 1 },
  ])
})

test('filterCatalogItemsByResourceType keeps all supported resources by default and supports spatial and service views', () => {
  assert.deepEqual(
    filterCatalogItemsByResourceType(FIXTURES, '').map((item) => item.id),
    ['resource', 'data-api', 'map-api', 'geo-map', 'file-api', 'base-api', 'source'],
  )

  assert.deepEqual(
    filterCatalogItemsByResourceType(FIXTURES, 'data-api').map((item) => item.id),
    ['data-api', 'file-api', 'base-api'],
  )

  assert.deepEqual(
    filterCatalogItemsByResourceType(FIXTURES, 'data-resource').map((item) => item.id),
    ['resource'],
  )

  assert.deepEqual(
    filterCatalogItemsByResourceType(FIXTURES, 'spatial-resource').map((item) => item.id),
    ['map-api', 'geo-map'],
  )

  assert.deepEqual(
    filterCatalogItemsByResourceType(FIXTURES, 'data-source').map((item) => item.id),
    ['source'],
  )

  assert.deepEqual(
    filterCatalogItemsByResourceType(FIXTURES, 'service').map((item) => item.id),
    ['data-api', 'file-api', 'base-api'],
  )
})
