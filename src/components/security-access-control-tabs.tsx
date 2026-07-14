import type { ReactNode } from 'react'
import { SecurityModuleTabs } from './security-module-tabs'

export function AccessControlSecondaryTabs({ actions }: { actions?: ReactNode }) {
  return <SecurityModuleTabs module="access" actions={actions} />
}
