import { LayoutDashboard } from 'lucide-react'
import type { AppModuleManifest } from '../types'

export const CockpitManifest: AppModuleManifest = {
  id: 'cockpit',
  title: '驾驶舱',
  shortTitle: '驾驶舱',
  description: '以深色全屏大屏方式展示资源、应用、安全、共享和运行监督的综合态势。',
  primaryPath: '/cockpit',
  icon: LayoutDashboard,
  routePrefixes: ['/cockpit', '/dashboard'],
  navTargets: ['/cockpit'],
  homeSectionKeys: ['cockpit'],
}
