import { nocobaseClient } from './nocobase-client'

type ListResponse<T> = {
  data?: T[]
  meta?: { totalPage?: number }
}

export type SecurityV3Record = Record<string, unknown> & { id?: number | string }

const SECURITY_VALUE_LABELS: Record<string, string> = {
  draft: '草稿', enabled: '启用', disabled: '停用', connected: '已连接', unconnected: '未连接', testing: '检查中', exception: '异常',
  unpublished: '未发布', publishing: '发布中', success: '成功', failed: '失败', pending: '待执行', running: '执行中', completed: '已完成', archived: '已归档',
  internal_app: '内部应用', external_party: '外部访问方', direct: '直接纳管', develop: '数据库服务化', orchestrate: '编排增强',
  detail: '明细', masked: '脱敏', aggregate: '聚合', encrypted: '密态', pending_validation: '待校验', expired: '已过期',
  allow: '允许', deny: '拒绝', denied: '拒绝', limit: '限制', deny_alert: '拒绝并告警', processing: '处理中', closed: '已关闭',
  normal: '正常', notice: '提示', medium: '中风险', high: '高风险', critical: '严重',
  signature_invalid: '签名校验失败', replay_detected: '重复请求', policy_not_found: '未命中访问策略',
  connection_test: '连接检查', validation: '数据校验', tagging: '标签执行', partial: '部分成功',
}

export function sanitizeSecurityVisibleText(value: unknown) {
  return String(value ?? '')
    .replace(/NocoBase|NBaaS/gi, '管理服务')
    .replace(/OpenFHE/gi, '密态计算服务')
    .replace(/Apache\s*APISIX|APISIX/gi, '安全网关')
    .replace(/Magic-?API/gi, '数据编排服务')
    .replace(/\bCKKS\b/gi, '浮点近似方案')
    .replace(/\bBFV\b/gi, '历史方案')
}

export function formatSecurityV3Value(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) return value.map(sanitizeSecurityVisibleText).join('、') || '-'
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const label = record.api_name ?? record.subject_name ?? record.resource_name ?? record.source_name ?? record.policy_name ?? record.key_code ?? record.request_id ?? record.nodeName ?? record.dictValueName
    return label ? sanitizeSecurityVisibleText(label) : sanitizeSecurityVisibleText(JSON.stringify(value))
  }
  const normalized = String(value)
  return SECURITY_VALUE_LABELS[normalized] || sanitizeSecurityVisibleText(value)
}

export async function listSecurityV3Records(
  collection: string,
  options: { filter?: Record<string, unknown>; appends?: string[]; sort?: string[] } = {},
) {
  const result: SecurityV3Record[] = []
  let page = 1
  for (;;) {
    const response = await nocobaseClient.resource(collection).list({
      page,
      pageSize: 200,
      ...(options.filter ? { filter: options.filter } : {}),
      ...(options.appends?.length ? { appends: options.appends } : {}),
      ...(options.sort?.length ? { sort: options.sort } : {}),
    })
    const payload = response.data as ListResponse<SecurityV3Record>
    result.push(...(Array.isArray(payload?.data) ? payload.data : []))
    const totalPage = Number(payload?.meta?.totalPage || 0)
    if (!totalPage || page >= totalPage) return result
    page += 1
  }
}

export async function saveSecurityV3Record(collection: string, id: string, values: Record<string, unknown>) {
  if (id) {
    await nocobaseClient.resource(collection).update({ filterByTk: id, values })
    return
  }
  await nocobaseClient.resource(collection).create({ values })
}

export async function updateSecurityV3Record(collection: string, id: string, values: Record<string, unknown>) {
  await nocobaseClient.resource(collection).update({ filterByTk: id, values })
}
