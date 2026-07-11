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
    '/security-governance/data-access',
    '/security-governance/data-access/source-config',
    '/security-governance/data-access/rule-config',
    '/security-governance/data-access/monitoring',
    '/security-governance/resources',
    '/security-governance/access-control',
    '/security-governance/access-control/classification',
    '/security-governance/access-control/policy-engine',
    '/security-governance/homomorphic-encryption',
    '/security-governance/homomorphic-encryption/logs',
    '/security-governance/homomorphic-logs',
    '/security-governance/access-control/confidential-computing',
    '/security-governance/confidential-computing',
    '/security-governance/audit',
    '/security-governance/audit/log-query',
  ],
  homeSectionKeys: ['security-governance'],
}
