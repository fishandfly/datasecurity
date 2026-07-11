import { Link2 } from 'lucide-react'
import type { AppModuleManifest } from '../types'

export const SharingGovernanceManifest: AppModuleManifest = {
  id: 'sharing-governance',
  title: '数据共享管控',
  shortTitle: '共享管控',
  description: '围绕 API 服务、外部需求、共享范围和服务发布形成可控共享能力。',
  primaryPath: '/service-catalog',
  icon: Link2,
  routePrefixes: ['/service-catalog', '/demand'],
  navTargets: ['/service-catalog', '/demand'],
  homeSectionKeys: ['sharing-governance'],
}
