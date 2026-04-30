/** Roles que tienen acceso total y no aparecen en la lista de permisos */
export const MASTER_ROLES = ["super_admin", "owner", "dueño"];

/** Devuelve true si el usuario es el admin maestro (acceso total, no configurable) */
export function isMasterAdmin(roles: string[]): boolean {
  return roles.some(r => MASTER_ROLES.includes(r.toLowerCase()));
}

/** Devuelve true si el usuario puede ver el costo real de productos */
export function canSeeCost(canViewCost: boolean): boolean {
  return canViewCost;
}

/**
 * Decide si un usuario debe aparecer en la lista de gestión de permisos.
 * El admin maestro no aparece — tiene acceso total implícito.
 */
export function isEligibleForPermManagement(roles: string[]): boolean {
  return !isMasterAdmin(roles);
}
