import { UploadCloud } from 'lucide-react'
import { useMemo } from 'react'
import { SecurityV3CollectionPage, type SecurityV3CollectionPageConfig } from './security-v3-collection-page'
import { publishSecurityApi } from '../lib/security-runtime-client'

type ResourceApisPanelProps = {
  resourceId: string
  resourceCode: string
  resourceName: string
  dataSourceId?: string
  canManage: boolean
}

function apiToken(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'resource'
}

export function ResourceApisPanel({ resourceId, resourceCode, resourceName, dataSourceId, canManage }: ResourceApisPanelProps) {
  const config = useMemo<SecurityV3CollectionPageConfig>(() => {
    const token = apiToken(resourceCode)
    return {
      module: 'resources',
      title: 'API 信息',
      collection: 'security_api_resources',
      appends: ['data_source'],
      filter: { resource_id: resourceId },
      readOnly: !canManage,
      canCreate: canManage,
      createLabel: '新增 API 信息',
      emptyLabel: canManage ? '当前资源尚未维护 API 信息，请新增并完成发布配置。' : '当前资源尚未维护 API 信息。',
      columns: [
        { key: 'api_code', label: 'API 编码' },
        { key: 'api_name', label: 'API 名称' },
        { key: 'access_mode', label: '发布方式' },
        { key: 'http_method', label: '方法' },
        { key: 'gateway_path', label: '访问路径' },
        { key: 'publish_status', label: '发布状态', tone: 'status' },
        { key: 'publish_version', label: '版本', value: (record) => `V${Number(record.publish_version || 0)}` },
      ],
      fields: [
        { name: 'resource_id', label: '数据资源', hidden: true, defaultValue: resourceId },
        { name: 'data_source_id', label: '数据源', hidden: true, defaultValue: dataSourceId || '' },
        { name: 'api_code', label: 'API 编码', required: true, defaultValue: `API-${token}` },
        { name: 'api_name', label: 'API 名称', required: true, defaultValue: `${resourceName}查询 API` },
        {
          name: 'access_mode', label: '发布方式', type: 'select', required: true, defaultValue: 'develop',
          options: [
            { value: 'develop', label: '数据库服务化（Python）' },
            { value: 'orchestrate', label: '查询编排增强（Python）' },
            { value: 'direct', label: '已有 API 安全纳管' },
          ],
        },
        { name: 'http_method', label: '请求方法', type: 'select', required: true, defaultValue: 'GET', options: [{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }] },
        { name: 'gateway_path', label: 'API 访问路径', required: true, defaultValue: `/data-api/resources/${token.toLowerCase()}` },
        { name: 'upstream_url', label: '已有 API 上游地址（仅安全纳管方式填写）' },
        { name: 'orchestrator_path', label: 'Python 处理器', hidden: true, defaultValue: '/internal/resource-query' },
        {
          name: 'runtime_config_json',
          label: '物理字段映射（高级配置；留空时按资源物理表和字段编码自动生成）',
          type: 'json',
          defaultValue: {},
        },
        { name: 'protection_level', label: '防护层', type: 'select', defaultValue: 'l2', options: [{ value: 'l1', label: '普通共享层' }, { value: 'l2', label: '内部受控层' }, { value: 'l3', label: '跨域密态层' }] },
        { name: 'supports_row_filter', label: '启用行级范围控制', type: 'boolean', defaultValue: true },
        { name: 'supports_field_filter', label: '允许调用方选择输出字段', type: 'boolean', defaultValue: true },
        { name: 'supports_aggregate', label: '支持聚合输出', type: 'boolean' },
        { name: 'supports_homomorphic', label: '支持同态计算', type: 'boolean' },
        { name: 'api_status', label: 'API 状态', hidden: true, defaultValue: 'draft' },
      ],
      transformSaveValues: (values) => ({
        ...values,
        resource_id: resourceId,
        data_source_id: dataSourceId || values.data_source_id || null,
        orchestrator_path: values.access_mode === 'direct' ? '' : '/internal/resource-query',
        publish_status: 'unpublished',
        publish_error: null,
      }),
      rowActions: canManage ? [{
        key: 'publish-api',
        title: '校验并发布',
        icon: UploadCloud,
        execute: async (record) => {
          const result = await publishSecurityApi(String(record.id || ''))
          return `API 已由 Python 运行服务发布，版本 V${result.publishVersion}`
        },
      }] : [],
    }
  }, [canManage, dataSourceId, resourceCode, resourceId, resourceName])

  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-4 py-3 text-[0.8125rem] leading-6 text-[var(--status-info-text)]">
        API 信息直接归属当前数据资源。保存后点击“校验并发布”，Python 运行服务会核对数据源连接、物理表和字段映射，发布成功后统一执行签名认证、访问策略、限流、风险判定与审计记录；没有已发布访问策略时默认拒绝调用。
      </div>
      <SecurityV3CollectionPage config={config} embedded />
    </div>
  )
}
