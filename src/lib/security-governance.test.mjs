import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

function makeTreeNode(
  id,
  label,
  count = 0,
  depth = 0,
  pathLabel = label,
  children = [],
) {
  return { id, label, count, depth, pathLabel, children }
}

async function loadSecurityGovernanceModule() {
  const sourcePath = resolve(process.cwd(), 'src/lib/security-governance.ts')
  const source = readFileSync(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  })

  const tempDir = mkdtempSync(join(tmpdir(), 'security-governance-test-'))
  const outputPath = join(tempDir, 'security-governance.mjs')
  writeFileSync(outputPath, transpiled.outputText, 'utf8')

  try {
    return await import(`${pathToFileURL(outputPath).href}?t=${Date.now()}`)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

const categoryTree = [
  makeTreeNode('air', '大气环境', 0, 0, '大气环境', [
    makeTreeNode('air-monitor', '空气监测', 0, 1, '大气环境 / 空气监测'),
  ]),
  makeTreeNode('water', '水环境', 0, 0, '水环境'),
]

const informationCategoryTree = [
  makeTreeNode('l2-a', '二级敏感', 0, 0, '二级敏感', [
    makeTreeNode('l2-a-1', '企业基础信息', 0, 1, '二级敏感 / 企业基础信息'),
  ]),
  makeTreeNode('l3-b', '三级敏感', 0, 0, '三级敏感'),
]

const items = [
  {
    id: '1',
    policyId: 'p1',
    resourceId: '1',
    name: '空气站点小时值',
    summary: '小时监测摘要',
    department: '省监测中心',
    updateTime: '2026-05-14 09:00:00',
    categoryId: 'air-monitor',
    category: '空气监测',
    categoryAncestorIds: ['air', 'air-monitor'],
    informationCategoryId: 'l2-a-1',
    informationCategory: '企业基础信息',
    informationCategoryPath: '二级敏感 / 企业基础信息',
    informationCategoryAncestorIds: ['l2-a', 'l2-a-1'],
    securityCategoryId: 'sec-monitor',
    securityCategory: '监测监控类',
    securityLevelId: 'level4',
    securityLevel: '4级',
    dataSubjectTypeId: 'subject-region',
    dataSubjectType: '区域',
    securityProfileStatus: 'active',
    securityReviewStatus: 'approved',
    policyStatus: 'active',
    shareScope: 'org',
    accessScope: 'login',
    approvalMode: 'none',
    desensitizationMode: 'none',
    exportScope: 'detail',
    apiAuthMode: 'none',
    importantDataFlag: false,
    coreControlFlag: false,
    openAllowed: false,
    externalShareAllowed: false,
    desensitizationRequired: false,
    approvalRequired: false,
    securityOwnerDept: '省监测中心',
    securityOwnerUserName: '张三',
    assessmentBasis: '自动生成',
    riskNotes: '低风险',
  },
  {
    id: '2',
    policyId: 'p2',
    resourceId: '2',
    name: '地表水断面台账',
    summary: '断面资源台账',
    department: '省水处',
    updateTime: '2026-05-13 18:00:00',
    categoryId: 'water',
    category: '水环境',
    categoryAncestorIds: ['water'],
    informationCategoryId: 'l3-b',
    informationCategory: '三级敏感',
    informationCategoryPath: '三级敏感',
    informationCategoryAncestorIds: ['l3-b'],
    securityCategoryId: 'sec-water',
    securityCategory: '执法监管类',
    securityLevelId: 'level2',
    securityLevel: '2级',
    dataSubjectTypeId: 'subject-enterprise',
    dataSubjectType: '企业',
    securityProfileStatus: 'active',
    securityReviewStatus: 'approved',
    policyStatus: 'active',
    shareScope: 'cross_dept',
    accessScope: 'role',
    approvalMode: 'double',
    desensitizationMode: 'field_mask',
    exportScope: 'masked',
    apiAuthMode: 'none',
    importantDataFlag: true,
    coreControlFlag: true,
    openAllowed: false,
    externalShareAllowed: false,
    desensitizationRequired: true,
    approvalRequired: true,
    securityOwnerDept: '省水处',
    securityOwnerUserName: '李四',
    assessmentBasis: '重点监管',
    riskNotes: '高风险',
  },
  {
    id: '3',
    policyId: 'p3',
    resourceId: '3',
    name: '排污许可核发清单',
    summary: '许可核发资源',
    department: '省审批处',
    updateTime: '2026-05-12 12:00:00',
    categoryId: 'air',
    category: '大气环境',
    categoryAncestorIds: ['air'],
    informationCategoryId: '',
    informationCategory: '未标注',
    informationCategoryPath: '未标注',
    informationCategoryAncestorIds: [],
    securityCategoryId: 'sec-water',
    securityCategory: '执法监管类',
    securityLevelId: 'level2',
    securityLevel: '2级',
    dataSubjectTypeId: 'subject-enterprise',
    dataSubjectType: '企业',
    securityProfileStatus: 'active',
    securityReviewStatus: 'approved',
    policyStatus: 'active',
    shareScope: 'cross_dept',
    accessScope: 'role',
    approvalMode: 'double',
    desensitizationMode: 'field_mask',
    exportScope: 'masked',
    apiAuthMode: 'none',
    importantDataFlag: true,
    coreControlFlag: false,
    openAllowed: false,
    externalShareAllowed: false,
    desensitizationRequired: true,
    approvalRequired: true,
    securityOwnerDept: '省审批处',
    securityOwnerUserName: '王五',
    assessmentBasis: '许可监管',
    riskNotes: '中风险',
  },
]

test('buildSecurityGovernanceSnapshot 基于安全总表视角生成概览和筛选项', async () => {
  const { buildSecurityGovernanceSnapshot } = await loadSecurityGovernanceModule()

  const snapshot = buildSecurityGovernanceSnapshot({
    items,
    categoryTree,
    informationCategoryTree,
    filters: {},
  })

  assert.equal(snapshot.filteredItems.length, 3)
  assert.deepEqual(
    snapshot.overviewMetrics.map((item) => [item.key, item.value]),
    [
      ['total', 3],
      ['securityCategoryCoverage', 2],
      ['securityLevelCoverage', 2],
      ['importantDataCount', 2],
    ],
  )
  assert.deepEqual(
    snapshot.securityCategoryOptions.map((item) => [item.id, item.label, item.count]),
    [
      ['', '全部', 3],
      ['sec-water', '执法监管类', 2],
      ['sec-monitor', '监测监控类', 1],
    ],
  )
  assert.deepEqual(
    snapshot.securityLevelOptions.map((item) => [item.id, item.label, item.count]),
    [
      ['', '全部', 3],
      ['level2', '2级', 2],
      ['level4', '4级', 1],
    ],
  )
})

test('buildSecurityGovernanceSnapshot 支持按分类节点、信息分类节点、安全分类、安全等级和关键词联合筛选', async () => {
  const { buildSecurityGovernanceSnapshot } = await loadSecurityGovernanceModule()

  const snapshot = buildSecurityGovernanceSnapshot({
    items,
    categoryTree,
    informationCategoryTree,
    filters: {
      categoryNodeId: 'air',
      informationCategoryNodeId: 'l2-a',
      securityCategoryId: 'sec-monitor',
      securityLevelId: 'level4',
      keyword: '小时',
    },
  })

  assert.deepEqual(snapshot.filteredItems.map((item) => item.id), ['1'])
  assert.equal(snapshot.filteredItems[0]?.name, '空气站点小时值')
})
