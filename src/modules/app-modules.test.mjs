import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
const layoutSource = readFileSync(resolve(process.cwd(), 'src/layouts/service-layout.tsx'), 'utf8')
const navigationSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-navigation.ts'), 'utf8')
const defaultPrimaryNavSource = navigationSource.match(/const DEFAULT_PRIMARY_NAVIGATIONS:[\s\S]*?\n\]/)?.[0] ?? ''
const dataCatalogRoutesSource = readFileSync(resolve(process.cwd(), 'src/modules/DataCatalog/routes.tsx'), 'utf8')
const registrySource = readFileSync(resolve(process.cwd(), 'src/modules/registry.ts'), 'utf8')
const securityGovernanceRoutesSource = readFileSync(resolve(process.cwd(), 'src/modules/SecurityGovernance/routes.tsx'), 'utf8')

const removedModuleNames = [
  'ResourceGovernance',
  'DataProduct',
  'ApplicationGovernance',
  'SharingGovernance',
  'OperationSupervision',
  'Cockpit',
]

test('前端应用保留 DataCatalog 门户壳和安全管控模块入口', () => {
  assert.equal(existsSync(resolve(process.cwd(), 'src/modules/DataCatalog/index.ts')), true)
  assert.equal(existsSync(resolve(process.cwd(), 'src/modules/SecurityGovernance/index.ts')), true)
  assert.match(appSource, /import \{ DataCatalogRoutes, EmbedAwareNavigate \} from '\.\/modules\/DataCatalog'/)
  assert.match(appSource, /\{DataCatalogRoutes\(\)\}/)
  assert.doesNotMatch(appSource, /modules\/Dashboard/)
  assert.doesNotMatch(appSource, /Compatibility anchors/)
  assert.doesNotMatch(appSource, /path="\/dashboard"/)
})

test('管理员右上角保留 NBaaS 控制台入口并移除旧驾驶舱入口', () => {
  assert.match(layoutSource, /canManageCatalogResources\(session\?\.user\.roles\)/)
  assert.match(layoutSource, /canOpenAdminApps \? \(/)
  assert.match(layoutSource, /href="\/admin"/)
  assert.doesNotMatch(layoutSource, /to=\{withEmbed\('\/cockpit'\)\}/)
  assert.doesNotMatch(layoutSource, /驾驶舱/)
  assert.match(layoutSource, /控制台/)
  assert.doesNotMatch(appSource, /path="\/dashboard"/)
})

test('数据安全管控门户只注册安全管控业务模块', () => {
  assert.match(dataCatalogRoutesSource, /export function DataCatalogRoutes\(\)/)
  assert.match(dataCatalogRoutesSource, /PORTAL_APP_MODULES\.map\(\(module\) => \(/)
  assert.match(registrySource, /SecurityGovernanceModule/)
  removedModuleNames.forEach((moduleName) => {
    assert.doesNotMatch(registrySource, new RegExp(`${moduleName}Module`))
    assert.equal(existsSync(resolve(process.cwd(), `src/modules/${moduleName}`)), false)
  })
  assert.match(registrySource, /export const PORTAL_APP_MODULES = \[[\s\S]*SecurityGovernanceModule,[\s\S]*\] satisfies AppModule\[]/)
  assert.match(securityGovernanceRoutesSource, /<Route path="\/security-governance\/dashboard" element={<SecurityDashboardPage \/>} \/>/)
  assert.match(securityGovernanceRoutesSource, /<Route path="\/security-governance\/resources" element={<SecurityGovernancePage \/>} \/>/)
  assert.match(securityGovernanceRoutesSource, /<Route path="\/security-governance\/:id" element={<SecurityGovernanceDetailPage \/>} \/>/)
  assert.match(dataCatalogRoutesSource, /<Route path="\/personal-center" element={<PersonalCenterPage \/>} \/>/)
})

test('顶部导航默认项和活动模块保持一致', () => {
  assert.match(layoutSource, /primaryNavigations\.map\(\(item\) => \(/)
  assert.match(navigationSource, /\{ key: 'nav_security_dashboard', title: '安全态势看板', target: '\/security-governance\/dashboard', icon: Shield \}/)
  assert.match(navigationSource, /\{ key: 'nav_data_access', title: '数据接入管理', target: '\/security-governance\/data-access\/source-config', icon: DatabaseZap \}/)
  assert.match(navigationSource, /\{ key: 'nav_resource_control', title: '数据资源管控', target: '\/security-governance\/resources', icon: Database \}/)
  assert.match(navigationSource, /\{ key: 'nav_access_control', title: '访问控制管理', target: '\/security-governance\/access-control\/classification', icon: Workflow \}/)
  assert.match(navigationSource, /\{ key: 'nav_homomorphic_encryption', title: '数据同态加密', target: '\/security-governance\/homomorphic-encryption', icon: LockKeyhole \}/)
  assert.doesNotMatch(defaultPrimaryNavSource, /key: 'nav_audit'/)
  assert.match(navigationSource, /EXCLUDED_PRIMARY_NAV_TARGETS = new Set\(\[[\s\S]*'\/security-governance\/audit\/log-query'[\s\S]*\]\)/)
  assert.doesNotMatch(defaultPrimaryNavSource, /nav_config/)
  assert.doesNotMatch(defaultPrimaryNavSource, /title: '数据标签管理'[\s\S]*target: '\/security-governance\/config\/data-labels'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /target: '\/catalog'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /target: '\/data-products'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /target: '\/demand'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /target: '\/run-stats'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /target: '\/cockpit'/)
})

test('活动业务模块遵循统一目录结构和模块入口', () => {
  const moduleRoot = resolve(process.cwd(), 'src/modules/SecurityGovernance')
  assert.equal(existsSync(resolve(moduleRoot, 'index.ts')), true)
  assert.equal(existsSync(resolve(moduleRoot, 'manifest.ts')), true)
  assert.equal(existsSync(resolve(moduleRoot, 'routes.tsx')), true)
  assert.equal(existsSync(resolve(moduleRoot, 'pages/.gitkeep')), true)
  assert.equal(existsSync(resolve(moduleRoot, 'components/.gitkeep')), true)
  assert.equal(existsSync(resolve(moduleRoot, 'lib/.gitkeep')), true)

  const indexSource = readFileSync(resolve(moduleRoot, 'index.ts'), 'utf8')
  assert.match(indexSource, /manifest:/)
  assert.match(indexSource, /Routes:/)
})

test('DolphinScheduler 任务脚本拆分到 TaskScripts 模块', () => {
  assert.equal(existsSync(resolve(process.cwd(), 'TaskScripts/dolphinscheduler/resource_stat_job.py')), true)
  assert.equal(existsSync(resolve(process.cwd(), 'src/dolphinscheduler')), false)
})
