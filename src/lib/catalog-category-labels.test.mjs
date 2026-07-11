import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const catalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/catalog-page.tsx'), 'utf8')
const demandPageSource = readFileSync(resolve(process.cwd(), 'src/pages/demand-page-internal.tsx'), 'utf8')
const detailPageSource = readFileSync(resolve(process.cwd(), 'src/pages/detail-page.tsx'), 'utf8')
const demandCatalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/demand-catalog-page.tsx'), 'utf8')
const resourceEditDialogSource = readFileSync(resolve(process.cwd(), 'src/components/resource-edit-dialog.tsx'), 'utf8')
const homePageSource = readFileSync(resolve(process.cwd(), 'src/pages/home-page.tsx'), 'utf8')
const homePreviewShellSource = readFileSync(resolve(process.cwd(), 'src/pages/home-preview-shell.tsx'), 'utf8')

test('用户界面中的领域分类统一改名为数据资源分类', () => {
  assert.match(catalogPageSource, /categoryTitle: '数据资源分类'/)
  assert.match(catalogPageSource, /title=\{activeViewMeta\.categoryTitle\}/)
  assert.match(catalogPageSource, /activeViewMeta\.categoryTitle\}：\{categoryTreeFlat\.get\(activeCategoryNodeId\)\?\.pathLabel \?\? activeCategoryNodeId\}/)
  assert.equal(catalogPageSource.includes('领域分类'), false)

  assert.match(demandPageSource, />数据资源分类</)
  assert.match(demandPageSource, /支持按数据资源分类树节点筛选/)
  assert.equal(demandPageSource.includes('支持按领域分类树节点筛选'), false)

  assert.match(detailPageSource, /\['数据资源分类', item\.businessCategoryPath/)
  assert.equal(detailPageSource.includes('领域分类'), false)

  assert.match(demandCatalogPageSource, /title="数据资源分类"/)
  assert.equal(demandCatalogPageSource.includes('领域分类'), false)

  assert.match(resourceEditDialogSource, /label="数据资源分类"/)
  assert.equal(resourceEditDialogSource.includes('领域分类'), false)

  assert.match(homePageSource, /按照数据资源分类查看一级主题与二级细分方向/)
  assert.equal(homePageSource.includes('按照领域分类查看一级主题与二级细分方向'), false)

  assert.match(homePreviewShellSource, /按照数据资源分类查看一级主题与二级细分方向/)
  assert.equal(homePreviewShellSource.includes('按照领域分类查看一级主题与二级细分方向'), false)
})
