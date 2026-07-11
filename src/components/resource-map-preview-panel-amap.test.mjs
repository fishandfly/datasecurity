import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const previewPanelSource = readFileSync(resolve(process.cwd(), 'src/components/resource-map-preview-panel.tsx'), 'utf8')
const portalDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-data.ts'), 'utf8')

test('地图预览支持高德 AMap iframe 分支，并等待 SDK onload 后初始化', () => {
  assert.match(portalDataSource, /normalized === 'amap'[\s\S]*return 'amap'/)
  assert.match(previewPanelSource, /const AMAP_JS_API_KEY = 'ade0dd87c4733b88c995aebe25e5ba0c'/)
  assert.match(previewPanelSource, /function isAmapPreview\(preview: CatalogMapPreview\)[\s\S]*serviceType\.trim\(\)\.toLowerCase\(\) === 'amap'/)
  assert.match(previewPanelSource, /sdk\.onload = initAmapPreview/)
  assert.match(previewPanelSource, /new AMap\.Map\('map'/)
  assert.match(previewPanelSource, /<iframe[\s\S]*srcDoc=\{amapIframeHtml\}/)
})

test('高德 iframe 预览保留固定高度并用 textContent 写入错误消息', () => {
  assert.match(previewPanelSource, /className="block h-full w-full border-0"/)
  assert.match(previewPanelSource, /#map \{ width: 100%; height: 100%; \}/)
  assert.match(previewPanelSource, /const message = e && e\.message \? e\.message : String\(e\);/)
  assert.match(previewPanelSource, /errorElement\.textContent = '高德地图预览加载失败：' \+ message/)
  assert.doesNotMatch(previewPanelSource, /insertAdjacentHTML/)
})
