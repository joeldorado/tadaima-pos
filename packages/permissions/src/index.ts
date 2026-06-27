export const PERMISSIONS_VERSION = '0.1.0'

const ADMIN_ROLES = ['admin', 'super_admin', 'owner', 'dueño']
const MANAGER_ROLES = ['manager', 'gerente', ...ADMIN_ROLES]
const CASHIER_ROLES = ['cashier', 'cajero', ...MANAGER_ROLES]

export function hasRole(userRoles: string[], role: string): boolean {
  return userRoles.some(r => r.toLowerCase() === role.toLowerCase())
}

export function hasAnyRole(userRoles: string[], roles: string[]): boolean {
  return roles.some(r => hasRole(userRoles, r))
}

export function isAdmin(userRoles: string[]): boolean {
  return hasAnyRole(userRoles, ADMIN_ROLES)
}

export function isManager(userRoles: string[]): boolean {
  return hasAnyRole(userRoles, MANAGER_ROLES)
}

export function isCashier(userRoles: string[]): boolean {
  return hasAnyRole(userRoles, CASHIER_ROLES)
}

/** Admin page and user management */
export function canAccessAdmin(userRoles: string[]): boolean {
  return isAdmin(userRoles)
}

/** Inventory adjustments and transfers */
export function canManageInventory(userRoles: string[]): boolean {
  return isManager(userRoles)
}

/** See product cost prices */
export function canViewCosts(userRoles: string[]): boolean {
  return isManager(userRoles)
}

/** Process sales and pre-sales */
export function canSell(userRoles: string[]): boolean {
  return isCashier(userRoles)
}

/** View all stores (vs only assigned store) */
export function canViewAllStores(userRoles: string[]): boolean {
  return isAdmin(userRoles)
}
