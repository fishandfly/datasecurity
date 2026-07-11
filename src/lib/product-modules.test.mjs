import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/lib/product-modules.ts'), 'utf8')
const portalContextSource = readFileSync(resolve(process.cwd(), 'src/lib/portal-context.tsx'), 'utf8')
const navigationSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-navigation.ts'), 'utf8')
const routesSource = readFileSync(resolve(process.cwd(), 'src/modules/DataCatalog/routes.tsx'), 'utf8')
const homePageSource = readFileSync(resolve(process.cwd(), 'src/pages/home-page.tsx'), 'utf8')
const registrySource = readFileSync(resolve(process.cwd(), 'src/modules/registry.ts'), 'utf8')
const typesSource = readFileSync(resolve(process.cwd(), 'src/modules/types.ts'), 'utf8')
const securityManifestSource = readFileSync(resolve(process.cwd(), 'src/modules/SecurityGovernance/manifest.ts'), 'utf8')

const removedModuleIds = [
  'resource-governance',
  'data-product',
  'application-governance',
  'sharing-governance',
  'operation-supervision',
  'cockpit',
]

const removedModuleNames = [
  'ResourceGovernance',
  'DataProduct',
  'ApplicationGovernance',
  'SharingGovernance',
  'OperationSupervision',
  'Cockpit',
]

test('活动产品模块只保留数据安全管控', () => {
  assert.match(securityManifestSource, /id: 'security-governance'[\s\S]*title: '数据安全管控'[\s\S]*primaryPath: '\/security-governance\/dashboard'/)
  assert.match(typesSource, /export type AppModuleId = 'security-governance'/)
  assert.match(source, /export const PRODUCT_MODULES: ProductModuleDefinition\[] = APP_MODULE_MANIFESTS/)
  assert.match(registrySource, /export const APP_MODULES = \[[\s\S]*SecurityGovernanceModule,[\s\S]*\] satisfies AppModule\[]/)
  removedModuleNames.forEach((moduleName) => {
    assert.doesNotMatch(registrySource, new RegExp(`${moduleName}Module`))
    assert.equal(existsSync(resolve(process.cwd(), `src/modules/${moduleName}`)), false)
  })
  removedModuleIds.forEach((moduleId) => {
    assert.doesNotMatch(typesSource, new RegExp(`'${moduleId}'`))
    assert.doesNotMatch(homePageSource, new RegExp(`moduleId: '${moduleId}'`))
  })
})

test('客户方案参数兼容保留，但运行模块统一收敛到数据安全管控', () => {
  assert.match(source, /id: 'full'[\s\S]*customerLabel: '电网客户'[\s\S]*moduleIds: \['security-governance'\]/)
  assert.match(source, /id: 'ecology'[\s\S]*customerLabel: '基础客户'[\s\S]*moduleIds: \['security-governance'\]/)
  assert.match(source, /id: 'government-data'[\s\S]*customerLabel: '监督客户'[\s\S]*moduleIds: \['security-governance'\]/)
  assert.match(source, /id: 'power'[\s\S]*customerLabel: '电力客户'[\s\S]*moduleIds: \['security-governance'\]/)
  assert.match(source, /id: 'court'[\s\S]*customerLabel: '共享客户'[\s\S]*moduleIds: \['security-governance'\]/)
  assert.match(source, /storedSolution \?\? 'power'/)
})

test('门户上下文、导航和路由由安全管控产品方案驱动', () => {
  assert.match(portalContextSource, /const productConfig = useProductSolution\(location\.search\)/)
  assert.match(navigationSource, /isProductNavTargetEnabled\(item\.target, enabledModuleIds\)/)
  assert.match(routesSource, /function ProductModuleGate\(\)/)
  assert.match(routesSource, /isProductPathEnabled\(location\.pathname, solution\.moduleIds\)/)
  assert.match(registrySource, /SecurityGovernanceModule/)
  assert.match(registrySource, /export const PORTAL_APP_MODULES = \[[\s\S]*SecurityGovernanceModule,[\s\S]*\] satisfies AppModule\[]/)
  assert.match(routesSource, /PORTAL_APP_MODULES\.map\(\(module\) => \(/)
  assert.match(routesSource, /<Route index element={<EmbedAwareNavigate to="\/security-governance" \/>} \/>/)
  assert.match(homePageSource, /moduleId: 'security-governance'/)
  assert.match(homePageSource, /quickAccessCards\.filter\(\(item\) => isProductModuleEnabled\(item\.moduleId, enabledModuleIds\)\)/)
})
