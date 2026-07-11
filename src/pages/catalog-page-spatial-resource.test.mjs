import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const catalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/catalog-page.tsx'), 'utf8')

test('空间资源视图提供专业检索条件，并保留数据源在目录 tab 的最后位置', () => {
  assert.match(catalogPageSource, /type CatalogViewId = 'data-resource' \| 'data-source' \| 'document' \| 'spatial-resource' \| 'service'/)
  assert.match(catalogPageSource, /normalized === 'data-source' \|\| normalized === 'document' \|\| normalized === 'spatial-resource' \|\| normalized === 'service'/)
  assert.match(catalogPageSource, /const activeSpatialLayerKind = searchParams\.get\('spatialLayerKind'\) \?\? ''/)
  assert.match(catalogPageSource, /const activeSpatialAuthMode = searchParams\.get\('spatialAuthMode'\) \?\? ''/)
  assert.match(catalogPageSource, /const activeSpatialReference = searchParams\.get\('spatialReference'\) \?\? ''/)
  assert.match(catalogPageSource, /const activeSpatialCacheMode = searchParams\.get\('spatialCacheMode'\) \?\? ''/)
  assert.match(catalogPageSource, /title="图层模式"/)
  assert.match(catalogPageSource, /title="鉴权方式"/)
  assert.match(catalogPageSource, /title="坐标系"/)
  assert.match(catalogPageSource, /title="服务模式"/)
  assert.match(catalogPageSource, /图层模式：\{activeSpatialLayerKindLabel\}/)
  assert.match(catalogPageSource, /鉴权方式：\{activeSpatialAuthModeLabel\}/)
  assert.match(catalogPageSource, /坐标系：\{activeSpatialReferenceLabel\}/)
  assert.match(catalogPageSource, /服务模式：\{activeSpatialCacheModeLabel\}/)
  assert.match(catalogPageSource, /id: 'spatial-resource'[\s\S]*?id: 'data-source'/)
})
