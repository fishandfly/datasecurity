import { ArrowLeft, FileText } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Button, TopicPill } from '../components/ui'
import { appendEmbedToPath, readEmbedMode } from '../lib/embed-mode'

const featureMeta = {
  'source-config': {
    title: '数据接入管理',
    plan: 'S0201_数据源配置.md',
    summary: '用于统一维护用采2.0、调控云等数据源接入规则、完整性校验和加密传输配置。',
  },
  'data-labels': {
    title: '数据标签管理',
    plan: 'S0501_数据标签管理.md',
    summary: '用于维护数据安全标签、分类分级标签和字段标签模板。',
  },
  'policy-engine': {
    title: '策略引擎',
    plan: 'S0302_策略引擎配置.md',
    summary: '用于基于分类分级结果编排动态访问控制规则和异常识别策略。',
  },
  trace: {
    title: '操作链路追溯',
    plan: 'S0402_操作链路追溯.md',
    summary: '用于追溯安全事件、访问路径、血缘链路和责任主体。',
  },
  'log-query': {
    title: '日志链路审计',
    plan: 'S0401_审计日志查询.md',
    summary: '用于查询数据接入、访问请求、策略变更和同态加密审计日志。',
  },
  report: {
    title: '审计报告生成',
    plan: 'S0403_审计报告生成.md',
    summary: '用于汇总审计日志、操作链路和安全事件分析结论，生成面向合规审查的审计报告。',
  },
  'system-params': {
    title: '系统参数配置',
    plan: 'S0502_系统参数配置.md',
    summary: '用于集中维护系统运行参数、告警阈值、接入网关参数和审计留存策略。',
  },
  version: {
    title: '配置版本管理',
    plan: 'S0503_配置版本管理.md',
    summary: '用于跟踪配置变更版本、审批记录和回滚操作，降低策略与参数变更风险。',
  },
} as const

type FeatureKey = keyof typeof featureMeta

function resolveFeatureKey(pathname: string): FeatureKey {
  const key = pathname.split('/').filter(Boolean).pop()
  return key && key in featureMeta ? key as FeatureKey : 'source-config'
}

export function SecurityFeaturePlaceholderPage() {
  const location = useLocation()
  const isEmbedMode = readEmbedMode(location.search)
  const withEmbed = (path: string) => appendEmbedToPath(path, isEmbedMode)
  const feature = featureMeta[resolveFeatureKey(location.pathname)]

  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-8 shadow-[var(--shadow-soft)]">
      <TopicPill>待按 Feature Plan 实现</TopicPill>
      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold text-[var(--text-main)]">{feature.title}</h1>
          <p className="mt-3 max-w-3xl text-[0.875rem] leading-7 text-[var(--text-secondary)]">{feature.summary}</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[0.8125rem] text-[var(--text-secondary)]">
            <FileText className="h-4 w-4 text-[var(--primary)]" />
            设计文档：docs/design/paraflow/Feature Plan/{feature.plan}
          </div>
        </div>
        <Link to={withEmbed('/security-governance/dashboard')}>
          <Button variant="secondary" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            返回安全态势看板
          </Button>
        </Link>
      </div>
    </div>
  )
}
