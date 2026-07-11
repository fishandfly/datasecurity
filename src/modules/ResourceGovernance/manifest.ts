import { Database } from 'lucide-react'
import type { AppModuleManifest } from '../types'

export const ResourceGovernanceManifest: AppModuleManifest = {
  id: 'resource-governance',
  title: '数据资源管控',
  shortTitle: '资源管控',
  description: '围绕数据资源、文档资源、空间资源和数据源形成统一编目、检索、详情查看和资源维护能力。',
  primaryPath: '/catalog',
  icon: Database,
  routePrefixes: ['/', '/catalog', '/documents', '/data-source-catalog', '/search', '/lineage-node-popup', '/personal-center'],
  navTargets: ['/', '/catalog', '/documents', '/data-source-catalog', '/personal-center'],
  homeSectionKeys: ['catalog-overview', 'browse-panels', 'catalog-updates', 'catalog-recommendations'],
}
