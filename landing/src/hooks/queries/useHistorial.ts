import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getPreSaleOrders, type SaleDetail, type PreSaleOrder } from '@tadaima/api'
import { fetchAllSales } from '@/lib/fetchAllPages'
import { queryKeys } from '@/lib/queryKeys'
import { useTodayLocal } from '@/lib/date'

export type HistorialEntry =
  | { type: 'sale'; data: SaleDetail }
  | { type: 'presale'; data: PreSaleOrder }

/**
 * ADR-016 Fase 4+ — Historial del día (sales + preventas) cacheado y persistido.
 *
 * - Cache persistente en IndexedDB (vía queryClient persister) → apertura del
 *   modal instantánea con la última versión.
 * - `staleTime: 30s` para que después de un checkout/cancelación el background
 *   refetch traiga el cambio.
 * - Invalidar con `queryClient.invalidateQueries({ queryKey: queryKeys.historial.all })`
 *   en los success handlers de checkout/cancelación → la lista se actualiza sola.
 * - Ventas de TODA la tienda del día (2026-09-30, `whole_store`): el cajero
 *   corrige/cancela también las de otros cajeros. Todas las páginas: con la
 *   tienda completa 50 se quedaba corto en un día movido.
 */
export function useTodayHistorialQuery(storeId?: number | null, options?: { enabled?: boolean }) {
  // Fecha local reactiva: el hook detecta el cambio de día (setInterval 60s) y
  // re-renderiza con la nueva fecha → la queryKey cambia y refetchea sola.
  const today = useTodayLocal()
  return useQuery<HistorialEntry[]>({
    queryKey: queryKeys.historial.today(storeId, today),
    queryFn: async () => {
      const [salesRes, ordersRes] = await Promise.all([
        fetchAllSales({ ...(storeId ? { store_id: storeId } : {}), from: today, to: today, whole_store: true }),
        getPreSaleOrders({ ...(storeId ? { store_id: storeId } : {}), from: today, to: today, per_page: 50 }),
      ])

      const entries: HistorialEntry[] = [
        ...salesRes.data.map(d => ({ type: 'sale' as const, data: d })),
        ...ordersRes.data.map(d => ({ type: 'presale' as const, data: d })),
      ]
      entries.sort((a, b) => {
        const dateA = a.type === 'sale' ? (a.data.sold_at || a.data.created_at) : a.data.created_at
        const dateB = b.type === 'sale' ? (b.data.sold_at || b.data.created_at) : b.data.created_at
        return new Date(dateB).getTime() - new Date(dateA).getTime()
      })
      return entries
    },
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    // Al cambiar la key (cambio de tienda o de día) NO blankear: mantener los
    // datos anteriores en pantalla mientras refetchea en background. Así el
    // modal abre instantáneo con lo último y solo muestra el indicador sutil
    // de "actualizando" abajo en vez de un spinner que tapa todo.
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  })
}
