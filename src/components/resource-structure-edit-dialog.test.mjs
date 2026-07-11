import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dialogSource = readFileSync(resolve(process.cwd(), 'src/components/resource-structure-edit-dialog.tsx'), 'utf8')
const structureSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-resource-structure-edit.ts'), 'utf8')

test('物理表编辑弹窗将基准表和业务时间字段改为表格行内维护', () => {
  assert.doesNotMatch(dialogSource, /placeholder="选择或输入基准表名"/)
  assert.doesNotMatch(dialogSource, />基准层级<\/div>/)
  assert.doesNotMatch(dialogSource, />基准 LDM<\/div>/)
  assert.match(dialogSource, /<th className=\{`\$\{DIALOG_TABLE_HEAD_CLASS\} min-w-\[140px\]`\}>基准表<\/th>/)
  assert.match(dialogSource, /<th className=\{`\$\{DIALOG_TABLE_HEAD_CLASS\} min-w-\[220px\]`\}>业务时间字段<\/th>/)
  assert.match(dialogSource, /value=\{row\.isBaseline \? 'yes' : 'no'\}/)
  assert.match(dialogSource, /updateRow\(row\.id, 'isBaseline', event\.target\.value === 'yes'\)/)
  assert.match(dialogSource, /value=\{row\.freshFieldName\}/)
  assert.match(dialogSource, /共 \{form\.rows\.length\} 行，基准表与业务时间字段请直接在表清单中维护。/)
})

test('物理表配置按行内基准标记和业务时间字段回写 source_tablelist 与 stat_base', () => {
  assert.doesNotMatch(structureSource, /baselineLdm:/)
  assert.match(structureSource, /isBaseline: normalizeBooleanLike\(item\.is_baseline \?\? item\.isBaseline \?\? item\.baseline\)/)
  assert.match(structureSource, /freshFieldName: normalizeText\(item\.fresh_field_name \?\? item\.freshFieldName\)/)
  assert.match(structureSource, /fresh_field_name: row\.freshFieldName\.trim\(\)/)
  assert.match(structureSource, /is_baseline: row\.isBaseline/)
  assert.match(structureSource, /is_baseline: row\.table_name === effectiveBaselineTable/)
  assert.doesNotMatch(structureSource, /baseline_ldm: /)
  assert.match(dialogSource, /const baselineRow = form\.rows\.find\(\(row\) => row\.isBaseline\) \?\? null/)
  assert.match(dialogSource, /saveResourceStatBaseConfig\(resourceId, \{\s*baselineTable: baselineRow\?\.tableName \?\? form\.baselineTable,\s*freshFieldName: baselineRow\?\.freshFieldName \?\? form\.freshFieldName,\s*\}\)/s)
})
