import type { LucideIcon } from 'lucide-react'

export type AppModuleId = 'security-governance'

export type AppModuleManifest = {
  id: AppModuleId
  title: string
  shortTitle: string
  description: string
  primaryPath: string
  icon: LucideIcon
  routePrefixes: string[]
  navTargets: string[]
  homeSectionKeys: string[]
}

export type AppModule = {
  manifest: AppModuleManifest
  Routes: () => React.ReactNode
}
