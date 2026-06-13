import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { PreSaleOrder, SaleDetail } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { toLocalYmd } from "@/lib/date";

/**
 * Escritura optimista del checkout en los caches de React Query.
 *
 * El refetch contra Cloud Run tarda 1–3s; aunque las invalidaciones con
 * refetchType:'all' pre-calientan las listas, si el cajero navega de Caja a
 * Ventas "luego luego" ve el cache viejo mientras el refetch viaja. Aquí
 * insertamos el resultado del POST directo al cache (la respuesta del backend
 * ES la fila que la lista va a traer) y el refetch posterior reconcilia con
 * la verdad del servidor. Si el POST falló nunca se llega aquí — no hay
 * rollback que manejar.
 */

type ListCache<T> = { data: T[] } & Record<string, unknown>;

/** Tercer elemento de ['sales','list',params] / ['preSaleOrders','list',params]. */
function listParamsFromKey(key: QueryKey): Record<string, unknown> {
  const params = key[2];
  return params && typeof params === "object" ? (params as Record<string, unknown>) : {};
}

/** ¿La fecha del movimiento cae dentro del rango from/to (YYYY-MM-DD, TZ negocio) del filtro? */
function dateWithinRange(iso: string | undefined, from: unknown, to: unknown): boolean {
  if (!iso) return true;
  const ymd = toLocalYmd(new Date(iso));
  if (typeof from === "string" && from && ymd < from) return false;
  if (typeof to === "string" && to && ymd > to) return false;
  return true;
}

/**
 * Inserta la venta recién cobrada al inicio de TODAS las listas de ventas
 * cacheadas cuyos filtros la incluirían (tienda, cajero, rango de fechas).
 * Llamar ANTES de invalidateQueries — la invalidación refetchea y reemplaza
 * con data real del servidor.
 */
export function prependSaleToSalesCaches(queryClient: QueryClient, sale: SaleDetail): void {
  const entries = queryClient.getQueriesData<ListCache<SaleDetail>>({
    queryKey: [...queryKeys.sales.all, "list"],
  });
  for (const [key, cached] of entries) {
    if (!cached?.data || !Array.isArray(cached.data)) continue;
    const params = listParamsFromKey(key);
    if (params.store_id != null && Number(params.store_id) !== sale.store_id) continue;
    if (params.user_id != null && Number(params.user_id) !== sale.user_id) continue;
    if (!dateWithinRange(sale.sold_at ?? sale.created_at, params.from, params.to)) continue;
    if (cached.data.some(s => s.id === sale.id)) continue;
    queryClient.setQueryData<ListCache<SaleDetail>>(key, { ...cached, data: [sale, ...cached.data] });
  }
}

/**
 * Inserta un folio de preventa recién creado (anticipo) en las listas de
 * folios cacheadas que lo incluirían. `storeId` viene del caller porque la
 * respuesta puede no traer la relación store cargada.
 */
export function prependPreSaleOrderToCaches(
  queryClient: QueryClient,
  order: PreSaleOrder,
  storeId?: number,
): void {
  const orderStoreId = order.store?.id ?? storeId;
  const entries = queryClient.getQueriesData<ListCache<PreSaleOrder>>({
    queryKey: [...queryKeys.preSaleOrders.all, "list"],
  });
  for (const [key, cached] of entries) {
    if (!cached?.data || !Array.isArray(cached.data)) continue;
    const params = listParamsFromKey(key);
    if (params.store_id != null && orderStoreId != null && Number(params.store_id) !== orderStoreId) continue;
    if (typeof params.status === "string" && params.status
      && !params.status.split(",").map(s => s.trim()).includes(order.status)) continue;
    if (!dateWithinRange(order.created_at, params.from, params.to)) continue;
    if (cached.data.some(o => o.id === order.id)) continue;
    queryClient.setQueryData<ListCache<PreSaleOrder>>(key, { ...cached, data: [order, ...cached.data] });
  }
}

/**
 * Parcha un folio existente en todas las listas cacheadas (p.ej. liquidación:
 * status 'delivered', balance 0). No mueve el folio entre listas filtradas
 * por status — eso lo reconcilia el refetch de la invalidación.
 */
export function patchPreSaleOrderInCaches(
  queryClient: QueryClient,
  orderId: number,
  patch: Partial<PreSaleOrder>,
): void {
  const entries = queryClient.getQueriesData<ListCache<PreSaleOrder>>({
    queryKey: [...queryKeys.preSaleOrders.all, "list"],
  });
  for (const [key, cached] of entries) {
    if (!cached?.data?.some?.(o => o.id === orderId)) continue;
    queryClient.setQueryData<ListCache<PreSaleOrder>>(key, {
      ...cached,
      data: cached.data.map(o => (o.id === orderId ? { ...o, ...patch } : o)),
    });
  }
}

/**
 * KPIs del Dashboard (ventas del día, apartados, stock bajo, corte del
 * gerente, mis cortes). Sus queryKeys viven inline en DashboardPage y NUNCA
 * se invalidaban tras vender/cancelar/devolver (gap auditoría 2026-06-12):
 * un gerente con el Dashboard abierto veía los contadores congelados hasta
 * cambiar de tab. refetchType default ('active') — solo refetchea si el
 * Dashboard está montado en alguna tab del mismo browser.
 */
export function invalidateDashboardKpis(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["gerente-daily-cash"] });
  void queryClient.invalidateQueries({ queryKey: ["my-cuts"] });
}

/**
 * Invalidación centralizada post-venta/cancelación/devolución. Antes cada
 * rama del checkout (×3), la cancelación y la devolución tenían su propia
 * copia de esta lista — divergían y era fácil olvidar una query (así pasó
 * con inventory en QA 2026-06-11 y con los KPIs del Dashboard). La escritura
 * optimista ya pintó el resultado; esto reconcilia con el servidor en bg.
 */
export function invalidateAfterSale(
  queryClient: QueryClient,
  opts?: { presale?: boolean },
): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.historial.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
  // El tab Productos→Tomos lee ['mangas'] (query distinta de ['products']);
  // sin esto el stock del tomo vendido queda viejo aunque Existencias
  // (['inventory']) sí refresque (QA Ruben 2026-06-13).
  void queryClient.invalidateQueries({ queryKey: queryKeys.mangas.all });
  // Desglose por tienda (Existencias / detalle de producto) lee
  // ['inventory', 'by-product'] — sin esto muestra stock viejo.
  void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.salesDrafts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.preSaleCatalogs.all });
  // refetchType:'all' refetchea también queries INACTIVAS (SalesPage está
  // desmontada mientras el cajero cobra en Caja) → la lista de Ventas se
  // pre-calienta en background y al navegar ya está fresca.
  void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all, refetchType: "all" });
  if (opts?.presale) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.preSaleOrders.all, refetchType: "all" });
  }
  invalidateDashboardKpis(queryClient);
}

/**
 * Descuenta stock vendido en TODOS los caches bajo ['products'] Y ['mangas']
 * (catálogo completo, light top, search, infinite, detail; los tomos son
 * products unificados con su propia query ['mangas'] en el tab Tomos) sin
 * esperar el refetch. Camina recursivamente las formas conocidas
 * (data/pages/items) y a cualquier objeto con `id` vendido le resta quantity
 * de `stock_total` (light) y/o `stock` (full). Inmutable: solo clona las ramas
 * que cambian.
 */
export function decrementProductStockInCaches(
  queryClient: QueryClient,
  soldItems: Array<{ product_id: number; quantity: number }>,
): void {
  const dec = new Map<number, number>();
  for (const item of soldItems) {
    if (!Number.isFinite(item.product_id) || item.quantity <= 0) continue;
    dec.set(item.product_id, (dec.get(item.product_id) ?? 0) + item.quantity);
  }
  if (dec.size === 0) return;

  // El id del tomo en ['mangas'] == product_id vendido (unificado en products),
  // así que el mismo decrementDeep aplica a ambos caches.
  const entries = queryClient.getQueriesData<unknown>({ queryKey: queryKeys.products.all });
  for (const [key, cached] of [
    ...entries,
    ...queryClient.getQueriesData<unknown>({ queryKey: queryKeys.mangas.all }),
  ]) {
    if (!cached) continue;
    const next = decrementDeep(cached, dec);
    if (next !== cached) queryClient.setQueryData(key, next);
  }
}

/** Contenedores que vale la pena recorrer dentro de los caches de productos. */
const WALK_KEYS = ["data", "pages", "items"] as const;

function decrementDeep(value: unknown, dec: Map<number, number>): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map(v => {
      const r = decrementDeep(v, dec);
      if (r !== v) changed = true;
      return r;
    });
    return changed ? next : value;
  }
  if (!value || typeof value !== "object") return value;

  const obj = value as Record<string, unknown>;
  let result = obj;

  const qty = typeof obj.id === "number" ? dec.get(obj.id) : undefined;
  if (qty) {
    if (typeof obj.stock_total === "number" || typeof obj.stock === "number") {
      result = { ...obj };
      if (typeof obj.stock_total === "number") result.stock_total = Math.max(0, obj.stock_total - qty);
      if (typeof obj.stock === "number") result.stock = Math.max(0, (obj.stock as number) - qty);
    }
  }

  for (const k of WALK_KEYS) {
    const child = obj[k];
    if (child && typeof child === "object") {
      const r = decrementDeep(child, dec);
      if (r !== child) {
        if (result === obj) result = { ...obj };
        result[k] = r;
      }
    }
  }
  return result;
}
