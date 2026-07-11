import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-data.ts'), 'utf8')

test('portal data loads business attribute categorization tree and resource fields', () => {
  assert.match(source, /businessAttributeTree: CatalogCategoryTreeNode\[\]/)
  assert.match(source, /business_attribute_categorization_id\?: number \| string \| null/)
  assert.match(source, /business_attribute_categorization_id/)
  assert.match(source, /const allBusinessAttributeNodes = normalizedNodes\.filter\(\(node\) => node\.typeCode === 'business_attribute_categorization'\)/)
  assert.match(source, /const businessAttributeSeedIds = allResources/)
  assert.match(source, /const businessAttributeCategories =/)
  assert.match(source, /const businessAttributeLookup = createCategoryLookup\(businessAttributeCategories\)/)
  assert.match(source, /const businessAttributeId = String\(resource\.business_attribute_categorization_id \?\? ''\)/)
  assert.match(source, /const businessAttributeMeta = businessAttributeLookup\.byId\.get\(businessAttributeId\)/)
  assert.match(source, /businessAttributeTree: buildCatalogCategoryTree|const businessAttributeTree = buildCatalogCategoryTree/)
})
