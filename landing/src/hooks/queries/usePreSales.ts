import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getPreSaleCatalogs, getPreSaleOrders } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

const ONE_DAY_MS = 24 * 60 * 60_000

/**
 * Catálogos de preventa.
 *
 * QA 2026-06-11: el staleTime de 24h era para "el catálogo es data estática
 * del admin", pero el payload trae CONTADORES vivos (reserved_count,
 * reserved_by_store, sold_count) que cambian con cada folio vendido — el
 * admin no veía ventas hechas en otra máquina hasta el día siguiente.
 * Ahora: stale a los 2min + refetch al volver al tab. El cache persistido
 * (gcTime 24h + IndexedDB) sigue pintando instantáneo; el refetch corre en
 * background con keepPreviousData (no blankea).
 */
export function usePreSaleCatalogsQuery(
  params?: Parameters<typeof getPreSaleCatalogs>[0],
  options?: { enabled?: boolean; refetchIntervalMs?: number | false }
) {
  return useQuery({
    queryKey: queryKeys.preSaleCatalogs.list(params as Record<string, unknown> | undefined),
    queryFn: () => getPreSaleCatalogs(params),
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60_000,
    gcTime: ONE_DAY_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
    // Polling casi-live opcional (Joel 2026-06-12): el caller lo prende SOLO
    // mientras la ventana relevante está visible (p.ej. modal de Preventas en
    // Caja). Corre únicamente con la query montada y la tab enfocada.
    refetchInterval: options?.refetchIntervalMs || false,
  })
}

/**
 * Folios de preventa. Patrón "cache + invalidate" (sin polling) decisión
 * 2026-05-28 — Joel pidió quitar el refetchInterval para acotar llamados.
 *
 *  - Cache 5min persistido en IndexedDB → render instantáneo al navegar.
 *  - `refetchOnWindowFocus: true` → vuelves al tab y refetch en bg si stale.
 *  - Mutaciones (createPreSaleOrder, addPayment, updateStatus, cancel) invalidan
 *    automáticamente → feedback instantáneo en el mismo browser.
 *  - Multi-tab: BroadcastChannel propaga las invalidaciones.
 *
 * Trade-off vs polling 60s: cross-máquina (admin marca ready en su PC →
 * cajero en otra) ya no se ve en tiempo real. Cajero necesita focus en tab
 * o presionar "Actualizar" para ver el cambio.
 */
export function usePreSaleOrdersQuery(
  params?: Parameters<typeof getPreSaleOrders>[0],
  options?: { enabled?: boolean; refetchIntervalMs?: number | false }
) {
  return useQuery({
    queryKey: queryKeys.preSaleOrders.list(params as Record<string, unknown> | undefined),
    queryFn: () => getPreSaleOrders(params),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
    // Polling casi-live opcional (Joel 2026-06-12) — solo montada + tab
    // enfocada y solo donde el caller lo pide. Cubre el caso cross-máquina
    // que el trade-off de 2026-05-28 dejó fuera (admin marca ready en su PC
    // → el cajero lo ve sin necesitar focus ni "Actualizar").
    refetchInterval: options?.refetchIntervalMs || false,
  })
}
