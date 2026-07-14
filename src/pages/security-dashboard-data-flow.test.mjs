import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/security-dashboard-page.tsx'), 'utf8')

test('数据安全运行链路按五个纵向分组展示', () => {
  assert.match(pageSource, /title: '中台数据源'/)
  assert.match(pageSource, /title: '接入校验'/)
  assert.match(pageSource, /title: '数据管控'/)
  assert.match(pageSource, /title: '访问控制'/)
  assert.match(pageSource, /title: '访问主体'/)
  assert.match(pageSource, /groups\.map\(\(group\) =>/)
  assert.match(pageSource, /height="370"/)
})

test('中台数据源和访问主体包含研究文档要求的节点', () => {
  assert.match(pageSource, /title: '量测数据'/)
  assert.match(pageSource, /title: '网上电网'/)
  assert.match(pageSource, /title: '数智吉电'/)
  assert.match(pageSource, /title: '其他业务应用'/)
  assert.match(pageSource, /title: '跨域访问应用'/)
  assert.match(pageSource, /y: 70[^\n]*title: '跨域访问应用'/)
})

test('各分组的业务节点在相同 x 坐标上纵向排列', () => {
  assert.match(pageSource, /x: 295, y: 80[\s\S]*x: 295, y: 180[\s\S]*x: 295, y: 280/)
  assert.match(pageSource, /x: 575, y: 80[\s\S]*x: 575, y: 180[\s\S]*x: 575, y: 280/)
  assert.match(pageSource, /x: 865, y: 80[\s\S]*x: 865, y: 180[\s\S]*x: 865, y: 280/)
  assert.match(pageSource, /x: 1195, y: 70[\s\S]*x: 1195, y: 150[\s\S]*x: 1195, y: 230[\s\S]*x: 1195, y: 310/)
})

test('数据安全运行链路使用指定的跨分组连接关系', () => {
  assert.match(pageSource, /id: 'flow-sampling-classification'/)
  assert.doesNotMatch(pageSource, /id: 'flow-integrity-archive'/)
  assert.match(pageSource, /id: 'flow-archive-homomorphic'/)
  assert.match(pageSource, /id: 'flow-policy-access'/)
  assert.doesNotMatch(pageSource, /id: 'flow-transport-classification'/)
  assert.doesNotMatch(pageSource, /id: 'flow-policy-homomorphic'/)
})
