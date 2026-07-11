import { nocobaseClient } from './nocobase-client'

function normalizeRoleName(roleName: string) {
  return roleName.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

export function isAdminRole(roleName: string | null | undefined) {
  if (!roleName) {
    return false
  }

  const trimmedRoleName = roleName.trim()

  if (!trimmedRoleName) {
    return false
  }

  if (trimmedRoleName.includes('管理员')) {
    return true
  }

  const normalizedRoleName = normalizeRoleName(trimmedRoleName)
  return normalizedRoleName.includes('admin') || normalizedRoleName.includes('administrator') || normalizedRoleName === 'root'
}

export function canManageCatalogResources(roleNames: string[] | null | undefined) {
  return (roleNames ?? []).some((roleName) => isAdminRole(roleName))
}

type AuthCheckPayload = {
  data?: {
    roles?: Array<{ name?: string | null }> | null
  } | null
}

export async function assertCanManageCatalogResources() {
  if (!nocobaseClient.auth.token) {
    throw new Error('未登录或当前账号不是管理员，不能执行该操作')
  }

  const response = await nocobaseClient.request<AuthCheckPayload>({
    method: 'get',
    url: 'auth:check',
  })

  const roles = response.data?.data?.roles ?? []
  const roleNames = roles.map((role) => role.name ?? '').filter(Boolean)

  if (!canManageCatalogResources(roleNames)) {
    throw new Error('未登录或当前账号不是管理员，不能执行该操作')
  }
}
