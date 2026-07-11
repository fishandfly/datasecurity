import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const navSource = readFileSync(resolve(process.cwd(), 'src/components/run-stats-secondary-nav.tsx'), 'utf8')
const operationSupervisionRoutesSource = readFileSync(resolve(process.cwd(), 'src/modules/OperationSupervision/routes.tsx'), 'utf8')

test('数据运行统计二级导航包含分析、报告、运维三个 tab', () => {
  assert.match(navSource, /运行统计分析/)
  assert.match(navSource, /运行分析报告/)
  assert.match(navSource, /数据运维信息/)
  assert.match(navSource, /to: '\/run-stats'/)
  assert.match(navSource, /to: '\/run-stats\/report'/)
  assert.match(navSource, /to: '\/run-stats\/operations'/)
})

test('/operations 旧地址重定向到新的运行统计运维页', () => {
  assert.match(operationSupervisionRoutesSource, /path="\/run-stats\/operations" element=\{<OperationsPage \/>\}/)
  assert.match(operationSupervisionRoutesSource, /path="\/operations" element=\{<EmbedAwareNavigate to="\/run-stats\/operations" \/>\}/)
})
