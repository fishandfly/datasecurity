import test from 'node:test'
import assert from 'node:assert/strict'
import type { CatalogCategoryTreeNode } from './catalog-category-tree.ts'
import { buildHomeOverviewSnapshotFromCurrentRecords, buildRecommendedGroups, buildThemeDistributionGroups } from './home-page-insights.ts'

function makeNode(
  id: string,
  label: string,
  count: number,
  children: CatalogCategoryTreeNode[] = [],
): CatalogCategoryTreeNode {
  return {
    id,
    label,
    count,
    children,
    depth: 0,
    pathLabel: label,
  }
}

test('buildThemeDistributionGroups builds top-level groups with second-level stats', () => {
  const tree: CatalogCategoryTreeNode[] = [
    makeNode('business', '业务数据', 609, [
      makeNode('air', '气', 450),
      makeNode('monitor', '监测', 159),
      makeNode('empty-child', '未标注', 0),
    ]),
    makeNode('manage', '管理数据', 141, [
      makeNode('enterprise', '企业', 90),
      makeNode('approval', '审批许可', 51),
    ]),
    makeNode('base', '基础数据', 17, [
      makeNode('base-info', '基础信息', 10),
      makeNode('geo', '地理信息', 7),
    ]),
    makeNode('other', '其他', 18),
    makeNode('unlabeled', '未标注', 0, [
      makeNode('unused', '无效', 0),
    ]),
  ]

  const groups = buildThemeDistributionGroups(tree)

  assert.deepEqual(
    groups.map((group) => ({
      id: group.id,
      label: group.label,
      count: group.count,
      share: group.share,
      children: group.children.map((child) => ({
        id: child.id,
        label: child.label,
        count: child.count,
      })),
    })),
    [
      {
        id: 'business',
        label: '业务数据',
        count: 609,
        share: 77.6,
        children: [
          { id: 'air', label: '气', count: 450 },
          { id: 'monitor', label: '监测', count: 159 },
        ],
      },
      {
        id: 'manage',
        label: '管理数据',
        count: 141,
        share: 18,
        children: [
          { id: 'enterprise', label: '企业', count: 90 },
          { id: 'approval', label: '审批许可', count: 51 },
        ],
      },
      {
        id: 'other',
        label: '其他',
        count: 18,
        share: 2.3,
        children: [],
      },
      {
        id: 'base',
        label: '基础数据',
        count: 17,
        share: 2.2,
        children: [
          { id: 'base-info', label: '基础信息', count: 10 },
          { id: 'geo', label: '地理信息', count: 7 },
        ],
      },
    ],
  )
})

test('buildRecommendedGroups groups items by primary business domain and preserves recommendation order within each group', () => {
  const groups = buildRecommendedGroups([
    {
      id: 'resource-a',
      name: '资源A',
      summary: '',
      updateTime: '2026-04-28 09:00:00',
      countValue: 100,
      category: '生态环境',
      description: 'A',
      serviceType: '数据接口',
      openType: '无条件开放',
      businessCategoryPath: '生态保护/自然保护地',
      businessCategory: '生态保护',
    },
    {
      id: 'resource-b',
      name: '资源B',
      summary: '',
      updateTime: '2026-04-28 08:00:00',
      countValue: 90,
      category: '生态环境',
      description: 'B',
      serviceType: '数据接口',
      openType: '无条件开放',
      businessCategoryPath: '水生态环境/饮用水源',
      businessCategory: '水生态环境',
    },
    {
      id: 'resource-c',
      name: '资源C',
      summary: '',
      updateTime: '2026-04-28 07:00:00',
      countValue: 80,
      category: '生态环境',
      description: 'C',
      serviceType: '数据接口',
      openType: '无条件开放',
      businessCategoryPath: '生态保护/生物多样性',
      businessCategory: '生态保护',
    },
    {
      id: 'resource-d',
      name: '资源D',
      summary: '',
      updateTime: '2026-04-28 06:00:00',
      countValue: 70,
      category: '基础数据',
      description: 'D',
      serviceType: '数据接口',
      openType: '无条件开放',
      businessCategoryPath: '未标注',
      businessCategory: '未标注',
    },
  ])

  assert.deepEqual(
    groups.map((group) => ({
      label: group.label,
      ids: group.items.map((item) => item.id),
    })),
    [
      { label: '生态保护', ids: ['resource-a', 'resource-c'] },
      { label: '水生态环境', ids: ['resource-b'] },
      { label: '基础数据', ids: ['resource-d'] },
    ],
  )
})

test('buildHomeOverviewSnapshotFromCurrentRecords aggregates current trend points by latest resource snapshot', () => {
  const snapshot = buildHomeOverviewSnapshotFromCurrentRecords([
    {
      id: '302',
      periodCode: '20260429_008',
      executedAt: '2026-04-29 10:00:00',
      resourceId: '1001',
      resourceTypeId: '33',
      resourceCode: 'RES001',
      resourceName: '资源A',
      domainCategoryId: '19',
      domainCategoryName: '污染源监管/重点排污单位',
      dataLayerCode: 'DWD',
      dataLayerName: 'DWD',
      connectStatus: '01',
      metainfo: {
        field_count: 6,
        record_count: 100,
      },
      dayOnDay: {
        trend_30d: {
          points: [
            {
              date: '2026-04-28',
              execute_time: '2026-04-28 10:00:00',
              stat_period_code: '20260428_008',
              field_count: 5,
              record_count: 90,
            },
            {
              date: '2026-04-29',
              execute_time: '2026-04-29 10:00:00',
              stat_period_code: '20260429_008',
              field_count: 6,
              record_count: 100,
            },
          ],
        },
      },
      quality: {},
      latestPreviewData: null,
      errorList: [],
    },
    {
      id: '402',
      periodCode: '20260429_008',
      executedAt: '2026-04-29 10:00:00',
      resourceId: '1002',
      resourceTypeId: '33',
      resourceCode: 'RES002',
      resourceName: '资源B',
      domainCategoryId: '20',
      domainCategoryName: '水环境管理/饮用水',
      dataLayerCode: 'DWD',
      dataLayerName: 'DWD',
      connectStatus: '01',
      metainfo: {
        field_count: 4,
        record_count: 60,
      },
      dayOnDay: {
        trend_30d: {
          points: [
            {
              date: '2026-04-28',
              execute_time: '2026-04-28 10:00:00',
              stat_period_code: '20260428_008',
              field_count: 3,
              record_count: 50,
            },
            {
              date: '2026-04-29',
              execute_time: '2026-04-29 10:00:00',
              stat_period_code: '20260429_008',
              field_count: 4,
              record_count: 60,
            },
          ],
        },
      },
      quality: {},
      latestPreviewData: null,
      errorList: [],
    },
  ])

  assert.equal(snapshot.latestPeriodCode, '20260429_008')
  assert.equal(snapshot.latestExecutedAt, '2026-04-29 10:00:00')
  assert.deepEqual(
    snapshot.trendPoints.map((point) => ({
      periodCode: point.periodCode,
      themeCount: point.themeCount,
      resourceCount: point.resourceCount,
      fieldCount: point.fieldCount,
      recordCount: point.recordCount,
    })),
    [
      {
        periodCode: '20260428_008',
        themeCount: 2,
        resourceCount: 2,
        fieldCount: 8,
        recordCount: 140,
      },
      {
        periodCode: '20260429_008',
        themeCount: 2,
        resourceCount: 2,
        fieldCount: 10,
        recordCount: 160,
      },
    ],
  )
  assert.deepEqual(
    snapshot.metrics.map((metric) => ({
      key: metric.key,
      value: metric.value,
      delta: metric.delta,
    })),
    [
      { key: 'theme', value: 2, delta: 0 },
      { key: 'resource', value: 2, delta: 0 },
      { key: 'field', value: 10, delta: 2 },
      { key: 'record', value: 160, delta: 20 },
    ],
  )
})
