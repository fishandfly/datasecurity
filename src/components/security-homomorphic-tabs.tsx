import type { ReactNode } from 'react'
import { SecurityModuleTabs } from './security-module-tabs'

export function HomomorphicSecondaryTabs({ actions }: { actions?: ReactNode }) {
  return <SecurityModuleTabs module="homomorphic" actions={actions} />
}
