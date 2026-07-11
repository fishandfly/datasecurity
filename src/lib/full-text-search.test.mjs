import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

async function loadSearchModule() {
  const sourcePath = resolve(process.cwd(), 'src/lib/full-text-search.ts')
  const source = readFileSync(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  return import(moduleUrl)
}

test('全文搜索会归一化大小写、分隔符并支持多词命中', async () => {
  const { normalizeFullTextSearch, matchesFullTextSearch } = await loadSearchModule()

  assert.equal(normalizeFullTextSearch(' 数据服务/API '), '数据服务 api')
  assert.equal(matchesFullTextSearch('吉林省 生态环境 地图 服务 API', '地图 API'), true)
  assert.equal(matchesFullTextSearch('监测 预警 应用', '监测 应用'), true)
  assert.equal(matchesFullTextSearch('数据源目录管理', '服务 API'), false)
})

test('全文搜索支持中文连续关键词的顺序弱匹配兜底', async () => {
  const { matchesFullTextSearch } = await loadSearchModule()

  assert.equal(matchesFullTextSearch('监测预警应用', '监测应用'), true)
  assert.equal(matchesFullTextSearch('断面超标预警驾驶舱', '断面驾驶舱'), true)
  assert.equal(matchesFullTextSearch('断面超标预警驾驶舱', '驾驶舱断面'), false)
})

test('全文搜索排序优先精确短命中，再退化到较弱匹配', async () => {
  const { compareFullTextSearch } = await loadSearchModule()

  const ranked = ['生态监测应用', '监测应用', '监测预警应用'].sort((left, right) =>
    compareFullTextSearch(left, right, '监测应用', left, right),
  )

  assert.deepEqual(ranked, ['监测应用', '生态监测应用', '监测预警应用'])
})
