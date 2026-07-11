import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const resourceEditDialogSource = readFileSync(resolve(process.cwd(), 'src/components/resource-edit-dialog.tsx'), 'utf8')
const resourceLinkEditDialogSource = readFileSync(resolve(process.cwd(), 'src/components/resource-link-edit-dialog.tsx'), 'utf8')
const structureEditDialogSource = readFileSync(resolve(process.cwd(), 'src/components/resource-structure-edit-dialog.tsx'), 'utf8')
const indexCssSource = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

test('资源编辑类弹窗接入专用对话框主题变量', () => {
  const mergedDialogSource = `${resourceEditDialogSource}\n${resourceLinkEditDialogSource}\n${structureEditDialogSource}`

  assert.match(mergedDialogSource, /var\(--dialog-surface\)/)
  assert.match(mergedDialogSource, /var\(--dialog-input-bg\)/)
  assert.match(mergedDialogSource, /var\(--dialog-table-header-bg\)/)
  assert.match(mergedDialogSource, /var\(--dialog-danger-text\)/)
})

test('资源编辑类弹窗移除关键浅色硬编码以支持暗色模式', () => {
  const mergedDialogSource = `${resourceEditDialogSource}\n${resourceLinkEditDialogSource}\n${structureEditDialogSource}`

  assert.doesNotMatch(mergedDialogSource, /bg-white/)
  assert.doesNotMatch(mergedDialogSource, /#f3f7fc/)
  assert.doesNotMatch(mergedDialogSource, /#f7fbff/)
  assert.doesNotMatch(mergedDialogSource, /#304255/)
  assert.doesNotMatch(mergedDialogSource, /#2e5371/)
  assert.doesNotMatch(mergedDialogSource, /#cfe1f0/)
  assert.doesNotMatch(mergedDialogSource, /#d7e4f0/)
  assert.doesNotMatch(mergedDialogSource, /#e6d4d4/)
  assert.doesNotMatch(mergedDialogSource, /#fff7f7/)
})

test('暗色主题为资源编辑类弹窗提供专用变量覆盖', () => {
  assert.match(indexCssSource, /--dialog-surface:/)
  assert.match(indexCssSource, /--dialog-input-bg:/)
  assert.match(indexCssSource, /--dialog-table-header-bg:/)
  assert.match(indexCssSource, /:root\[data-theme='dark'\][\s\S]*--dialog-surface:/)
  assert.match(indexCssSource, /:root\[data-theme='dark'\][\s\S]*--dialog-danger-text:/)
})
