import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const demandPageSource = readFileSync(resolve(process.cwd(), 'src/pages/demand-page-internal.tsx'), 'utf8')
const externalTabSource = readFileSync(resolve(process.cwd(), 'src/components/demand-external-tab-view.tsx'), 'utf8')

test('外部需求 tab 不再提供场景应用创建入口', () => {
  assert.doesNotMatch(demandPageSource, /isApplicationCreateDialogOpen/)
  assert.doesNotMatch(demandPageSource, /openApplicationCreateDialog/)
  assert.doesNotMatch(demandPageSource, /submitApplicationCreate/)
  assert.doesNotMatch(demandPageSource, /新建场景应用/)
  assert.match(demandPageSource, /activeDemandTab === 'external'/)
})

test('外部需求卡片直接链接供需对接详情页，并保留返回地址', () => {
  assert.match(demandPageSource, /buildDetailPath=\{\(id\) => withEmbed\(`\/demand\/\$\{id\}`\)\}/)
  assert.match(demandPageSource, /returnTo=\{`\$\{location\.pathname\}\$\{location\.search\}`\}/)
  assert.match(externalTabSource, /state=\{\{ returnTo \}\}/)
})

test('外部需求表格继续基于描述解析结构化属性字段', () => {
  assert.match(externalTabSource, /function parseExternalDemandMeta\(item: SupplyDemandInfo\)/)
  assert.match(externalTabSource, /sequence: values\.get\('序号'\) \?\? ''/)
  assert.match(externalTabSource, /dataCategory: values\.get\('数据类别'\) \?\? ''/)
  assert.match(externalTabSource, /businessCategory: values\.get\('业务分类'\) \?\? ''/)
  assert.match(externalTabSource, /shareMode: values\.get\('共享方式'\) \?\? ''/)
  assert.match(externalTabSource, /updateFrequency: values\.get\('更新频率'\) \?\? ''/)
  assert.match(externalTabSource, /<th className=\{TABLE_HEAD_CELL_CLASS\}>数据类别<\/th>/)
  assert.match(externalTabSource, /<th className=\{TABLE_HEAD_CELL_CLASS\}>共享方式<\/th>/)
  assert.match(externalTabSource, /<th className=\{TABLE_HEAD_CELL_CLASS\}>更新频率<\/th>/)
  assert.match(externalTabSource, /meta\.dataCategory \|\| '未标注'/)
  assert.match(externalTabSource, /meta\.businessCategory \|\| '未标注'/)
  assert.match(externalTabSource, /meta\.shareMode \|\| '未标注'/)
  assert.match(externalTabSource, /meta\.updateFrequency \|\| '未标注'/)
})
