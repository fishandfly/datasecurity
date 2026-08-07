import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const serviceLayoutSource = readFileSync(resolve(process.cwd(), 'src/layouts/service-layout.tsx'), 'utf8')
const navigationSource = readFileSync(resolve(process.cwd(), 'src/lib/nocobase-portal-navigation.ts'), 'utf8')
const componentSidebarSource = readFileSync(resolve(process.cwd(), 'src/components/security-component-sidebar.tsx'), 'utf8')
const securityRoutesSource = readFileSync(resolve(process.cwd(), 'src/modules/SecurityGovernance/routes.tsx'), 'utf8')
const defaultPrimaryNavSource = navigationSource.match(/const DEFAULT_PRIMARY_NAVIGATIONS:[\s\S]*?\n\]/)?.[0] ?? ''

test('顶部导航移除独立数据服务入口并保持安全管控模块顺序', () => {
  assert.match(serviceLayoutSource, /primaryNavigations\.map\(\(item\) => \(/)
  assert.match(
    defaultPrimaryNavSource,
    /const DEFAULT_PRIMARY_NAVIGATIONS:[\s\S]*title: '安全态势'[\s\S]*title: '数据资源'[\s\S]*title: '风险事件'[\s\S]*title: '组件配置'/,
  )
  assert.doesNotMatch(defaultPrimaryNavSource, /title: '(接入校验|访问策略|同态加密|分类标签)'/)
  assert.doesNotMatch(defaultPrimaryNavSource, /title: '数据服务'/)
  assert.match(navigationSource, /EXCLUDED_PRIMARY_NAV_TARGETS = new Set\(\[[\s\S]*'\/security-governance\/resources\/apis'/)
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

test('组件配置在左侧按指定顺序展示二级导航', () => {
  assert.match(
    componentSidebarSource,
    /label: '接入校验'[\s\S]*label: '访问策略'[\s\S]*label: '同态加密'[\s\S]*label: '分类标签'/,
  )
  assert.match(componentSidebarSource, /aria-label="组件配置二级导航"/)
  assert.match(serviceLayoutSource, /lg:grid-cols-\[14rem_minmax\(0,1fr\)\]/)
  assert.match(serviceLayoutSource, /<SecurityComponentSidebar \/>/)
  assert.match(securityRoutesSource, /path="\/security-governance\/components" element=\{<Navigate to="\/security-governance\/ingest\/sources" replace \/>\}/)
})
