/** Roles que tienen acceso total y no aparecen en la lista de permisos */
export const MASTER_ROLES = ["super_admin", "owner", "dueño"];
const ADMIN_ROLES = ["admin", ...MASTER_ROLES];
const MANAGER_ROLES = ["gerente", "manager"];
const CASHIER_ROLES = ["cajero", "cashier"];

export type Role = "admin" | "gerente" | "cajero" | "unknown";

/** Devuelve true si el usuario es el admin maestro (acceso total, no configurable) */
export function isMasterAdmin(roles: string[]): boolean {
  return roles.some(r => MASTER_ROLES.includes(r.toLowerCase()));
}

/** Devuelve true si el usuario tiene rol admin (incluye admin, super_admin, owner, dueño) */
export function isAdmin(roles: string[] | undefined): boolean {
  if (!roles) return false;
  return roles.some(r => ADMIN_ROLES.includes(r.toLowerCase()));
}

/** Devuelve true si el usuario tiene rol gerente */
export function isManager(roles: string[] | undefined): boolean {
  if (!roles) return false;
  return roles.some(r => MANAGER_ROLES.includes(r.toLowerCase()));
}

/** Devuelve true si el usuario tiene rol cajero */
export function isCashier(roles: string[] | undefined): boolean {
  if (!roles) return false;
  return roles.some(r => CASHIER_ROLES.includes(r.toLowerCase()));
}

/** Rol principal del usuario, en orden de precedencia admin > gerente > cajero */
export function primaryRole(roles: string[] | undefined): Role {
  if (isAdmin(roles)) return "admin";
  if (isManager(roles)) return "gerente";
  if (isCashier(roles)) return "cajero";
  return "unknown";
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

// ─── RBAC: acceso a pantallas ───────────────────────────────────────────────
export type PageKey =
  | "inicio"
  | "stores"      // Tab "Tiendas" — para no-admin es donde se abre la caja
  | "products"
  | "stock_search" // "Buscar en Tiendas" — existencias de un producto por sucursal
  | "sales"       // Tickets pasados
  | "cash_cuts"   // "Cortes" — cortes de caja con detalle (RBAC en backend)
  | "clients"     // Tab dedicado de clientes
  | "presales"
  | "transfers"
  | "reports"
  | "settings"
  | "admin";      // AdminPage (sucursales, usuarios, permisos…)

const PAGE_ACCESS: Record<Role, PageKey[]> = {
  admin:   ["inicio", "products", "stock_search", "sales", "cash_cuts", "clients", "presales", "transfers", "reports", "settings", "admin"],
  // Gerente: NO ve "Tiendas" — gestiona solo la suya, el switcher del header
  // basta para alternar entre las que tiene asignadas. La página /stores es
  // CRUD de tiendas (solo admin). Reportes ahora habilitado para gerente (restringido en backend).
  // SÍ ve "Buscar en Tiendas" (existencias por sucursal, sin datos financieros).
  // "Cajas" (cortes de caja) visible a los 3 roles — el backend acota:
  // cajero → solo sus cortes, gerente → su tienda, admin → todo.
  gerente: ["inicio", "products", "stock_search", "sales", "cash_cuts", "clients", "presales", "transfers", "reports"],
  // Cajero: NO ve Tiendas (lo confunde — su tienda es fija). En su lugar
  // ve Preventas con un panel adicional de catálogos disponibles + vencidos
  // de su sucursal. SÍ ve "Buscar en Tiendas" para localizar stock.
  cajero:  ["inicio", "products", "stock_search", "sales", "cash_cuts", "presales"],
  unknown: ["inicio"],
};

export function canAccessPage(roles: string[] | undefined, page: PageKey): boolean {
  const role = primaryRole(roles);
  return PAGE_ACCESS[role].includes(page);
}

/** Acciones específicas dentro de pantallas */
export function canEditProducts(roles: string[] | undefined): boolean {
  // Solo admin y gerente editan; cajero solo da de alta rápida
  return isAdmin(roles) || isManager(roles);
}

export function canCreateProducts(roles: string[] | undefined): boolean {
  return isAdmin(roles) || isManager(roles) || isCashier(roles);
}

export function canDeleteProducts(roles: string[] | undefined): boolean {
  return isAdmin(roles);
}

/** Reportes de ganancia bruta (con costo) — solo quien vea costo real */
export function canSeeGrossProfit(roles: string[] | undefined, canViewCost: boolean): boolean {
  return isAdmin(roles) || canViewCost;
}
