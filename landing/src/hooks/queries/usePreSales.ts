import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getPreSaleCatalogs, getPreSaleOrders } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

const ONE_DAY_MS = 24 * 60 * 60_000

/**
 * Catálogos de preventa. Admin los publica raramente; cajero los lee como
 * referencia estática durante el día. Cache 24h, refresh manual desde el
 * botón "Actualizar" en Caja o al abrir caja (handleOpenCash invalida).
 *
 * `refetchOnMount: true` (default RQ) — solo refetch si está stale. Como
 * staleTime es 24h, navegar entre pantallas no dispara fetch, pero cuando admin
 * actualiza imagen / status / etc. y llama `invalidateQueries`, el SellPage en
 * otra tab/montaje sí refetcha al volver. Sin esto, la imagen recién subida no
 * aparece en Caja hasta recargar la página.
 */
export function usePreSaleCatalogsQuery(
  params?: Parameters<typeof getPreSaleCatalogs>[0],
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.preSaleCatalogs.list(params as Record<string, unknown> | undefined),
    queryFn: () => getPreSaleCatalogs(params),
    enabled: options?.enabled ?? true,
    staleTime: ONE_DAY_MS,
    gcTime: ONE_DAY_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
  options?: { enabled?: boolean }
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
  })
}
