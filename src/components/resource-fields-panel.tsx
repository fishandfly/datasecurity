import { useMemo } from 'react'
import { SecurityV3CollectionPage, type SecurityV3CollectionPageConfig } from './security-v3-collection-page'
import type { SecurityV3Record } from '../lib/nocobase-security-v3'

export function ResourceFieldsPanel({
  resourceId,
  homomorphicFieldCodes = new Set(),
  onFieldsChange,
}: {
  resourceId: string
  homomorphicFieldCodes?: Set<string>
  onFieldsChange?: (records: SecurityV3Record[]) => void
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
      { key: 'information_category', label: '信息分类' },
      { key: 'classification_level', label: '分类层级' },
      {
        key: 'homomorphic_usage',
        label: '同态计算',
        tone: 'status',
        value: (record) => homomorphicFieldCodes.has(String(record.field_code || '').toUpperCase()) ? '已用于密态任务' : '未引用',
      },
      { key: 'important_field_flag', label: '重要字段', tone: 'status', value: (record) => Boolean(record.important_field_flag) ? '是' : '否' },
      { key: 'security_level', label: '安全等级' },
      { key: 'field_tags', label: '字段标签', value: (record) => Array.isArray(record.field_tags) ? record.field_tags.join('、') : String(record.field_tags || '') },
      { key: 'required_desensitization', label: '脱敏要求', tone: 'status', value: (record) => Boolean(record.required_desensitization) ? '需要脱敏' : '无需脱敏' },
      { key: 'output_allowed', label: '允许 API 返回', tone: 'status', value: (record) => record.output_allowed === false ? '禁止' : '允许' },
    ],
    fields: [
      { name: 'resource_id', label: '数据资源', hidden: true, defaultValue: resourceId },
      { name: 'seq', label: '序号', type: 'number', defaultValue: 1 },
      { name: 'field_code', label: '字段编码', required: true },
      { name: 'field_name', label: '字段名称', required: true },
      { name: 'data_type', label: '数据类型', required: true },
      { name: 'description', label: '字段说明', type: 'textarea' },
      { name: 'information_category', label: '信息分类' },
      { name: 'classification_level', label: '分类层级' },
      { name: 'security_level', label: '字段安全等级' },
      { name: 'field_tags', label: '字段标签（JSON 数组）', type: 'json', defaultValue: [] },
      { name: 'important_field_flag', label: '重要字段', type: 'boolean', defaultValue: false },
      { name: 'required_desensitization', label: '要求脱敏', type: 'boolean', defaultValue: false },
      { name: 'output_allowed', label: '允许 API 返回', type: 'boolean', defaultValue: true },
    ],
    transformSaveValues: (values) => ({ ...values, resource_id: resourceId }),
    onRecordsChange: (records) => onFieldsChange?.(records),
  }), [homomorphicFieldCodes, onFieldsChange, resourceId])

  return <SecurityV3CollectionPage config={config} embedded />
}
