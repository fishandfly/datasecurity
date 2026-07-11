import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const detailPageSource = readFileSync(resolve(process.cwd(), 'src/pages/detail-page.tsx'), 'utf8')
const portalDataSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-data.ts'), 'utf8')

test('详情页物理表清单按逐表业务时间字段展示，不再只读取全局基准字段', () => {
  assert.match(portalDataSource, /rows: Array<\{/)
  assert.match(portalDataSource, /businessTimeField: stringifyUnknown\(row\.fresh_field_name \?\? row\.freshFieldName\)\.trim\(\)/)
  assert.match(portalDataSource, /businessTimeField: isBaseline \? \(row\.businessTimeField \|\| businessTimeField\) : row\.businessTimeField/)
  assert.match(detailPageSource, /item\.physicalTables\.rows\.length > 0/)
  assert.match(detailPageSource, /businessTimeField: tableName === baseline \? item\.physicalTables\.businessTimeField\.trim\(\) : ''/)
  assert.match(detailPageSource, /const \{ rows \} = buildPhysicalTableState\(item\)/)
  assert.match(detailPageSource, /共 \{rows\.length\} 张表/)
  assert.match(detailPageSource, /row\.businessTimeField \? \(/)
  assert.match(detailPageSource, /业务时间字段：\{row\.businessTimeField\}/)
  assert.doesNotMatch(detailPageSource, /const businessTimeField = item\.physicalTables\.businessTimeField\.trim\(\)/)
  assert.doesNotMatch(detailPageSource, /来源系统：\{sourceSystem\}/)
})
