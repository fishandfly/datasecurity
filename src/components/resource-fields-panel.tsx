import { useMemo } from 'react'
import { SecurityV3CollectionPage, type SecurityV3CollectionPageConfig } from './security-v3-collection-page'

export function ResourceFieldsPanel({
  resourceId,
  homomorphicFieldCodes = new Set(),
}: {
  resourceId: string
  homomorphicFieldCodes?: Set<string>
}) {
  const config = useMemo<SecurityV3CollectionPageConfig>(() => ({
    module: 'resources',
    title: '资源字段',
    collection: 'eco_resource_security_fields',
    filter: { resource_id: resourceId },
    sort: ['seq', 'field_code'],
    createLabel: '新建资源字段',
    emptyLabel: '当前数据资源尚未登记字段。',
    columns: [
      { key: 'seq', label: '序号', width: '72px' },
      { key: 'field_code', label: '字段编码' },
      { key: 'field_name', label: '字段名称' },
      { key: 'data_type', label: '数据类型' },
      { key: 'description', label: '字段说明' },
      {
        key: 'homomorphic_usage',
        label: '同态计算',
        tone: 'status',
        value: (record) => homomorphicFieldCodes.has(String(record.field_code || '').toUpperCase()) ? '已用于密态任务' : '未引用',
      },
    ],
    fields: [
      { name: 'resource_id', label: '数据资源', hidden: true, defaultValue: resourceId },
      { name: 'seq', label: '序号', type: 'number', defaultValue: 1 },
      { name: 'field_code', label: '字段编码', required: true },
      { name: 'field_name', label: '字段名称', required: true },
      { name: 'data_type', label: '数据类型', required: true },
      { name: 'description', label: '字段说明', type: 'textarea' },
    ],
    transformSaveValues: (values) => ({ ...values, resource_id: resourceId }),
  }), [homomorphicFieldCodes, resourceId])

  return <SecurityV3CollectionPage config={config} embedded />
}
