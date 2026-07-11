import { Activity } from 'lucide-react'
import type { AppModuleManifest } from '../types'

export const OperationSupervisionManifest: AppModuleManifest = {
  id: 'operation-supervision',
  title: '数据运行监督',
  shortTitle: '运行监督',
  description: '展示统计任务、运行分析、运维事项和监督报告，支撑数据流转运行可观测。',
  primaryPath: '/run-stats',
  icon: Activity,
  routePrefixes: ['/run-stats', '/operations'],
  navTargets: ['/run-stats', '/operations'],
  homeSectionKeys: ['operation-supervision'],
}
