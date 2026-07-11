import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const catalogPageSource = readFileSync(resolve(process.cwd(), 'src/pages/catalog-page.tsx'), 'utf8')
const demandPageSource = readFileSync(resolve(process.cwd(), 'src/pages/demand-page-internal.tsx'), 'utf8')
const claimCartSource = readFileSync(resolve(process.cwd(), 'src/lib/catalog-claim-cart.ts'), 'utf8')
const documentsPageSource = readFileSync(resolve(process.cwd(), 'src/pages/knowledge-documents-page.tsx'), 'utf8')

test('数据资源目录右侧提供本地数据申领夹，并支持从资源卡片加入和统一提交', () => {
  assert.match(catalogPageSource, /数据申领夹/)
  assert.match(catalogPageSource, /加入申领夹/)
  assert.match(catalogPageSource, /统一提交供需对接申请单/)
  assert.match(catalogPageSource, /buildDemandPagePrefillRowsFromClaimCart\(claimCartItems\)/)
  assert.match(catalogPageSource, /navigate\(withEmbed\('\/demand'\), \{[\s\S]*openCreateDialog: true[\s\S]*clearClaimCartOnSuccess: true/s)
  assert.match(catalogPageSource, /const supportsClaimCart = activeCatalogView !== 'document'/)
  assert.match(catalogPageSource, /supportsClaimCart && !isClaimCartCollapsed/)
})

test('数据申领夹默认收起到搜索按钮右侧，并可再次展开', () => {
  assert.match(catalogPageSource, /const \[isClaimCartCollapsed, setIsClaimCartCollapsed\] = useState\(true\)/)
  assert.match(catalogPageSource, /setIsClaimCartCollapsed\(true\)/)
  assert.match(catalogPageSource, /setIsClaimCartCollapsed\(false\)/)
  assert.match(catalogPageSource, /supportsClaimCart && isClaimCartCollapsed/)
})

test('文档资源页复用同一套申领夹交互，支持加入、展开和统一提交', () => {
  assert.match(catalogPageSource, /<KnowledgeDocumentsPage[\s\S]*claimCartItems=\{claimCartItems\}/)
  assert.match(documentsPageSource, /加入申领夹/)
  assert.match(documentsPageSource, /展开数据申领夹/)
  assert.match(documentsPageSource, /统一提交供需对接申请单/)
})

test('数据申领夹通过 localStorage 本地缓存，并按 resourceId 去重维护', () => {
  assert.match(claimCartSource, /const LS_CATALOG_CLAIM_CART = 'eco_catalog_claim_cart_v1'/)
  assert.match(claimCartSource, /if \(typeof localStorage === 'undefined'\) return \[\]/)
  assert.match(claimCartSource, /const deduplicated = new Map<string, CatalogClaimCartItem>\(\)/)
  assert.match(claimCartSource, /localStorage\.setItem\(LS_CATALOG_CLAIM_CART, JSON\.stringify\(items\)\)/)
  assert.match(claimCartSource, /deduplicated\.set\(normalized\.resourceId, normalized\)/)
})

test('供需页支持从申领夹批量预填多行，并在提交成功后清理已提交的申领夹资源', () => {
  assert.match(demandPageSource, /prefillRows\?: DemandPagePrefill\[\]/)
  assert.match(demandPageSource, /openCreateDialog\?: boolean/)
  assert.match(demandPageSource, /clearClaimCartOnSuccess\?: boolean/)
  assert.match(demandPageSource, /function buildCreateDialogPrefillRows\(/)
  assert.match(demandPageSource, /setFormRows\(buildCreateDialogPrefillRows\(prefillRows, prefill\)\)/)
  assert.match(demandPageSource, /setIsCreateDialogOpen\(true\)/)
  assert.match(demandPageSource, /removeCatalogClaimCartItems\(submittedClaimCartItemIds\)/)
})
