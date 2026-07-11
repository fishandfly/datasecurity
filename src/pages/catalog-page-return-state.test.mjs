import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const catalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/catalog-page.tsx'), 'utf8')

test('目录列表进入详情页时会携带当前筛选 URL 作为返回目标', () => {
  assert.match(catalogPageSource, /const detailReturnTo = `\$\{location\.pathname\}\$\{location\.search\}`/)
  assert.match(catalogPageSource, /state=\{\{ returnTo: detailReturnTo \}\}/)
})
