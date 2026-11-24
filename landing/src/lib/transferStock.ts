/**
 * Stock de los artículos de un traslado (2026-11-24). Antes Traslados pedía el stock de TODA la
 * lista, con 2 consultas por artículo, cada vez que se elegía o agregaba uno: un traslado de ~76
 * productos hizo ~18,900 consultas en 2 h, el servidor respondió 429 y agotó las conexiones de
 * Supabase (pool_size 15), y «Agregar» fallaba con error de stock. Ahora 1 consulta por artículo
 * (`getInventory({ product_id })`) y de a pocas a la vez.
 */

/** Lo mínimo de una fila de `GET /inventory` que se usa aquí. */
export interface InventoryRowLike {
  warehouse_id: number;
  quantity: number;
  warehouse: { store: { id: number } | null } | null;
}

export interface TransferStockSnapshot {
  /** Piezas en la tienda origen (Exhibición + Bodega). */
  fromAvailable: number;
  /** Piezas en el almacén destino (0 si no hay fila o el usuario no ve esa tienda). */
  toAvailable: number;
}

/** Consultas de stock al mismo tiempo: suficiente para que sea rápido sin ráfagas. */
export const TRANSFER_STOCK_CONCURRENCY = 3;

/**
 * Arma el stock de un artículo con UNA respuesta de `getInventory({ product_id })`.
 * - Origen: suma de las filas de la tienda origen. Sin tienda origen conocida, suma todo (lo de
 *   antes). Gerente y cajero solo reciben filas de su tienda, así que para ellos no cambia; el admin
 *   recibe todas y antes se le sumaban todas las tiendas.
 * - Destino: la fila de ese almacén. Para gerente/cajero el backend no manda otras tiendas → 0, igual
 *   que la consulta aparte con `warehouse_id` que se hacía antes (y que siempre llegaba vacía).
 */
export function transferStockSnapshot(
  rows: readonly InventoryRowLike[],
  originStoreId: number | null | undefined,
  destinationWarehouseId: number | null | undefined,
): TransferStockSnapshot {
  const originRows = originStoreId == null
    ? rows
    : rows.filter(row => row.warehouse?.store?.id === originStoreId);
  const fromAvailable = originRows.reduce((sum, row) => sum + row.quantity, 0);
  const toAvailable = destinationWarehouseId == null
    ? 0
    : rows.find(row => row.warehouse_id === destinationWarehouseId)?.quantity ?? 0;
  return { fromAvailable, toAvailable };
}

/**
 * Corre `fn` sobre cada elemento con a lo más `limit` promesas a la vez y regresa los resultados
 * en el mismo orden. Un error en un elemento no detiene a los demás (`PromiseSettledResult`).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index] as T) };
      } catch (reason: unknown) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
