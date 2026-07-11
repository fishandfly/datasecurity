import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const demandPageSource = readFileSync(resolve(process.cwd(), 'src/pages/demand-page-internal.tsx'), 'utf8')
const supplyDemandSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-supply-demand-data.ts'), 'utf8')

test('/demand 列选择器包含 eco_supply_demand_infos 的完整字段列', () => {
  assert.match(demandPageSource, /key: 'createdById'[\s\S]*label: '创建人 ID'/)
  assert.match(demandPageSource, /key: 'updatedById'[\s\S]*label: '更新人 ID'/)
  assert.match(demandPageSource, /key: 'dataStatusDescription'[\s\S]*label: '数据现状说明'/)
  assert.match(demandPageSource, /key: 'dataSourceUnitName'[\s\S]*label: '数据来源单位'/)
  assert.match(demandPageSource, /key: 'dataSupplyMethodName'[\s\S]*label: '数据提供方式'/)
  assert.match(demandPageSource, /key: 'externalDataCategoryName'[\s\S]*label: '数据类别'/)
  assert.match(demandPageSource, /key: 'businessDomainCategoryNames'[\s\S]*label: '业务分类'/)
  assert.match(demandPageSource, /key: 'linkedResourceIds'[\s\S]*label: '关联资源 ID'/)
  assert.match(demandPageSource, /key: 'createdAt'[\s\S]*label: '创建时间'/)
  assert.match(demandPageSource, /key: 'updatedAt'[\s\S]*label: '更新时间'/)
})

test('/demand 默认仍展示核心列，但列选择来源于完整列配置', () => {
  assert.match(demandPageSource, /const DEMAND_TABLE_DEFAULT_VISIBLE_COLUMN_KEYS: DemandTableColumnKey\[] = \[/)
  assert.match(demandPageSource, /'sceneName'/)
  assert.match(demandPageSource, /'requiredDataResourceName'/)
  assert.match(demandPageSource, /'mainDataItems'/)
  assert.match(demandPageSource, /'demandDescription'/)
  assert.match(demandPageSource, /'dataSourceUnitName'/)
  assert.match(demandPageSource, /'dataSupplyMethodName'/)
  assert.match(demandPageSource, /'dataSyncFrequencyName'/)
  assert.match(demandPageSource, /'status'/)
  assert.doesNotMatch(demandPageSource, /'externalDataCategoryName',\s*\n\s*'businessDomainCategoryNames'/)
  assert.match(demandPageSource, /const \[visibleColumnKeys, setVisibleColumnKeys\] = useState<DemandTableColumnKey\[]>\(\s*\(\) => \[\.\.\.DEMAND_TABLE_DEFAULT_VISIBLE_COLUMN_KEYS\],\s*\)/)
  assert.match(demandPageSource, /DEMAND_TABLE_COLUMNS\.map\(\(column\) => column\.key\)/)
  assert.match(demandPageSource, /DEMAND_TABLE_COLUMNS\.map\(\(column\) => \{/)
  assert.match(demandPageSource, /<table className="w-full min-w-full table-auto border-separate border-spacing-0 text-left">/)
  assert.doesNotMatch(demandPageSource, /<table className="min-w-max border-separate border-spacing-0 text-left">/)
})

test('供需对接数据加载会 append 新增的关联字段', () => {
  assert.match(supplyDemandSource, /'data_source_unit'/)
  assert.match(supplyDemandSource, /'data_supply_method'/)
  assert.match(supplyDemandSource, /'external_data_category'/)
  assert.match(supplyDemandSource, /'business_domain_categories'/)
  assert.match(supplyDemandSource, /const SUPPLY_DEMAND_RELATED_APP_ASSOCIATION_CANDIDATES = \['related_apps', 'related_app'\] as const/)
  assert.match(supplyDemandSource, /const SUPPLY_DEMAND_APPLICATION_APPENDS = \[\s*\.\.\.SUPPLY_DEMAND_FULL_APPENDS,\s*\.\.\.SUPPLY_DEMAND_RELATED_APP_ASSOCIATION_CANDIDATES,\s*\] as const/)
})
