import { SecurityGovernanceModule } from './SecurityGovernance'
import type { AppModule, AppModuleId } from './types'

export const APP_MODULES = [
  SecurityGovernanceModule,
] satisfies AppModule[]

export const APP_MODULE_MANIFESTS = APP_MODULES.map((module) => module.manifest)

export const ALL_APP_MODULE_IDS = APP_MODULE_MANIFESTS.map((manifest) => manifest.id)

export const PORTAL_APP_MODULES = [
  SecurityGovernanceModule,
] satisfies AppModule[]

const moduleById = new Map<AppModuleId, AppModule>(
  APP_MODULES.map((module) => [module.manifest.id, module]),
)

export function getAppModule(moduleId: AppModuleId) {
  return moduleById.get(moduleId)
}

export function getAppModules(moduleIds: readonly AppModuleId[]) {
  return moduleIds.map((id) => moduleById.get(id)).filter(Boolean) as AppModule[]
}
