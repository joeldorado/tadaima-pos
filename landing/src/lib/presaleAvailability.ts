import type { PreSaleCatalog } from "@tadaima/api";

/**
 * Cupo de una preventa en UNA tienda, para la tarjeta de Caja.
 *
 * Fuente única: `store_limits` (decisión Joel 2026-05-20). Sin entrada para la
 * tienda = no se vende ahí ("Sin asignar"). `preorder_limit` es el tope global
 * viejo: el backend ya no lo aplica y NO debe usarse como cupo ni como límite por
 * cliente (2026-10-09: un catálogo con preorder_limit=1 y 12+12 por tienda salía
 * "Reservados 24 / 1").
 */
export interface StoreAvailability {
  /** La tienda no tiene entrada en store_limits. */
  unassigned: boolean;
  /** Cupo de la tienda (limit_qty). 0 si sin asignar. */
  limit: number;
  /** Reservados pending+ready en esta tienda. */
  reserved: number;
  /** limit − reserved, nunca negativo. */
  remaining: number;
}

type CatalogStock = Pick<PreSaleCatalog, "store_limits" | "reserved_by_store">;

export function storeAvailability(catalog: CatalogStock, storeId: number | null | undefined): StoreAvailability {
  const row = storeId != null ? catalog.store_limits?.find(sl => sl.store_id === storeId) : undefined;
  if (row === undefined) return { unassigned: true, limit: 0, reserved: 0, remaining: 0 };
  const limit = row.limit_qty;
  const reserved = catalog.reserved_by_store?.[String(storeId)] ?? 0;
  return { unassigned: false, limit, reserved, remaining: Math.max(0, limit - reserved) };
}

/**
 * Tope de unidades de una preventa dentro de UN carrito: el límite por cliente.
 * El server además valida el tope de por vida del cliente y el cupo de la tienda.
 */
export function cartUnitLimit(catalog: Pick<PreSaleCatalog, "limit_per_customer">): number | undefined {
  return catalog.limit_per_customer ?? undefined;
}
