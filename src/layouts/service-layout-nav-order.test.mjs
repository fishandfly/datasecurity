import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const serviceLayoutSource = readFileSync(resolve(process.cwd(), 'src/layouts/service-layout.tsx'), 'utf8')
const navigationSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-navigation.ts'), 'utf8')
const defaultPrimaryNavSource = navigationSource.match(/const DEFAULT_PRIMARY_NAVIGATIONS:[\s\S]*?\n\]/)?.[0] ?? ''

test('顶部导航默认按 Feature Plan 收敛为安全管控 feature，并由配置中心导航驱动', () => {
  assert.match(serviceLayoutSource, /primaryNavigations\.map\(\(item\) => \(/)
  assert.match(
    defaultPrimaryNavSource,
    /const DEFAULT_PRIMARY_NAVIGATIONS:[\s\S]*title: '安全态势看板'[\s\S]*target: '\/security-governance\/dashboard'[\s\S]*title: '数据接入管理'[\s\S]*target: '\/security-governance\/data-access\/source-config'[\s\S]*title: '数据资源管控'[\s\S]*target: '\/security-governance\/resources'[\s\S]*title: '访问控制管理'[\s\S]*target: '\/security-governance\/access-control\/classification'[\s\S]*title: '数据同态加密'[\s\S]*target: '\/security-governance\/homomorphic-encryption'/,
  )
  assert.doesNotMatch(defaultPrimaryNavSource, /key: 'nav_audit'/)
  assert.match(navigationSource, /EXCLUDED_PRIMARY_NAV_TARGETS = new Set\(\[[\s\S]*'\/security-governance\/audit\/log-query'[\s\S]*\]\)/)
  assert.doesNotMatch(defaultPrimaryNavSource, /title: '数据标签管理'[\s\S]*target: '\/security-governance\/config\/data-labels'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /nav_confidential_computing/)
  assert.match(navigationSource, /function ensureDefaultPrimaryNavigations\(items: PortalPrimaryNavigationItem\[\]\)/)
  assert.doesNotMatch(navigationSource, /target === '\/personal-center'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /title: '数据资源目录'[\s\S]*target: '\/catalog'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /title: '数据API服务'[\s\S]*target: '\/service-catalog'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /title: '供需对接信息'[\s\S]*target: '\/demand'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /title: '数据运行统计'[\s\S]*target: '\/run-stats'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /nav_dashboard/)
  assert.doesNotMatch(defaultPrimaryNavSource, /nav_data_labels/)
  assert.doesNotMatch(defaultPrimaryNavSource, /nav_policy_engine/)
  assert.doesNotMatch(defaultPrimaryNavSource, /nav_trace/)
  assert.doesNotMatch(defaultPrimaryNavSource, /nav_log_query/)
  assert.doesNotMatch(defaultPrimaryNavSource, /title: '驾驶舱'[\s\S]*target: '\/dashboard'/)
})
