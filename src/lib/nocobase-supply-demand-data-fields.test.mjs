import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-supply-demand-data.ts'), 'utf8')

test('SupplyDemandInfo 映射补齐 eco_supply_demand_infos 的新增字段', () => {
  assert.match(source, /updatedById:\s*normalizeId\(item\.updatedById \?\? item\.updated_by_id \?\? item\.updatedBy\?\.id\)/)
  assert.match(source, /dataSourceUnitId:\s*normalizeId\(item\.data_source_unit_id \?\? item\.data_source_unit\?\.id\)/)
  assert.match(source, /dataSourceUnitName:\s*normalizeRelationName\(item\.data_source_unit, ''\)/)
  assert.match(source, /dataSupplyMethodId:\s*normalizeId\(item\.data_supply_method_id \?\? item\.data_supply_method\?\.id\)/)
  assert.match(source, /dataSupplyMethodName:\s*normalizeRelationName\(item\.data_supply_method, ''\)/)
  assert.match(source, /externalDataCategoryId:\s*normalizeId\(item\.external_data_category_id \?\? item\.external_data_category\?\.id\)/)
  assert.match(source, /externalDataCategoryName:\s*normalizeRelationName\(item\.external_data_category, ''\)/)
  assert.match(source, /businessDomainCategoryIds:\s*normalizeRelationIds\(businessDomainCategories\)/)
  assert.match(source, /businessDomainCategoryNames:\s*normalizeRelationNames\(businessDomainCategories\)/)
  assert.match(source, /relatedAppIds:\s*relatedApps\.map\(\(app\) => normalizeId\(app\.id\)\)\.filter\(Boolean\)/)
  assert.match(source, /relatedAppNames:\s*relatedApps\.map\(\(app\) => normalizeText\(app\.name, ''\)\)\.filter\(Boolean\)/)
  assert.match(source, /relatedApps:\s*relatedApps/)
})
