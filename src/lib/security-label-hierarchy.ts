export type SecurityLabelGroup = {
  name: string
  labels: string[]
}

const dataTypeLabels = new Set(['量测数据', '已有量测 API'])
const protectionLabels = new Set(['仅聚合', '明细受控', '仅密态'])
const controlLabels = new Set(['需脱敏', '需审批', '禁止导出', '可受控输出'])
const sensitivityLabels = new Set(['公开数据', '内部数据', '敏感数据', '重要数据', '核心数据', '重要', '敏感', '核心'])
const securityLabels = new Set(['安全管控', '分类分级', '核心管控'])

export function groupSecurityLabels(labels: string[]): SecurityLabelGroup[] {
  const groups: SecurityLabelGroup[] = [
    { name: '数据类型分类', labels: [] },
    { name: '安全分类', labels: [] },
    { name: '业务域分类', labels: [] },
    { name: '敏感度分类', labels: [] },
    { name: '防护层分类', labels: [] },
    { name: '控制要求', labels: [] },
    { name: '其他标签', labels: [] },
  ]
  const seen = new Set<string>()
  for (const label of labels) {
    const value = label.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    const group = dataTypeLabels.has(value)
      ? groups[0]
      : securityLabels.has(value)
        ? groups[1]
        : protectionLabels.has(value)
          ? groups[4]
          : controlLabels.has(value)
            ? groups[5]
            : sensitivityLabels.has(value)
              ? groups[3]
              : value.includes('量测') || value.includes('用户') || value.includes('电能') || value.includes('主网') || value.includes('区域')
                ? groups[2]
                : groups[6]
    group.labels.push(value)
  }
  return groups.filter((group) => group.labels.length)
}
