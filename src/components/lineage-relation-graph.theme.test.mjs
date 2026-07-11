import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const componentSource = readFileSync(resolve(process.cwd(), 'src/components/lineage-relation-graph.tsx'), 'utf8')
const indexCssSource = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

test('血缘关系组件接入专用主题变量以支持暗色模式', () => {
  assert.match(componentSource, /var\(--lineage-panel-bg-start\)/)
  assert.match(componentSource, /var\(--lineage-canvas-bg-start\)/)
  assert.match(componentSource, /var\(--lineage-node-title\)/)
  assert.match(componentSource, /var\(--lineage-chip-bg-start\)/)
})

test('全局主题为血缘关系组件提供暗色模式变量覆盖', () => {
  assert.match(indexCssSource, /--lineage-panel-bg-start:/)
  assert.match(indexCssSource, /--lineage-canvas-bg-start:/)
  assert.match(indexCssSource, /:root\[data-theme='dark'\][\s\S]*--lineage-panel-bg-start:/)
  assert.match(indexCssSource, /:root\[data-theme='dark'\][\s\S]*--lineage-node-title:/)
})
