import { Shield } from 'lucide-react'
import type { AppModuleManifest } from '../types'

export const SecurityGovernanceManifest: AppModuleManifest = {
  id: 'security-governance',
  title: '数据安全管控',
  shortTitle: '安全管控',
  description: '面向电力等高安全要求场景，集中监控安全态势、资源安全档案、字段安全和共享策略。',
  primaryPath: '/security-governance/dashboard',
  icon: Shield,
  routePrefixes: ['/security-governance'],
  navTargets: [
    '/security-governance/dashboard',
    '/security-governance/resources/catalog',
    '/security-governance/logs',
    '/security-governance/components',
  ],
  homeSectionKeys: ['security-governance'],
}
