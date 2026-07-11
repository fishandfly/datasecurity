import { ClipboardList } from 'lucide-react'
import type { AppModuleManifest } from '../types'

export const ApplicationGovernanceManifest: AppModuleManifest = {
  id: 'application-governance',
  title: '数据应用管控',
  shortTitle: '应用管控',
  description: '围绕场景需求、场景应用和应用访问关系形成应用牵引的数据使用管控能力。',
  primaryPath: '/demand',
  icon: ClipboardList,
  routePrefixes: ['/demand', '/demand-catalog'],
  navTargets: ['/demand', '/demand-catalog'],
  homeSectionKeys: ['application-governance'],
}
