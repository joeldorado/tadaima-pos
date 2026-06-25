import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getMangas } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

const ONE_DAY_MS = 24 * 60 * 60_000
// 5min: un tomo creado por el gerente en OTRA máquina no aparecía para el
// cajero hasta 24h o refresh manual — cross-máquina no hay invalidación
// (QA 2026-06-11). El render sigue instantáneo (gcTime 24h + IndexedDB).
const CATALOG_STALE_MS = 5 * 60_000

/**
 * Catálogo de tomos/librería. Mismo patrón que useProductsQuery:
 *  - Fresh 5min, persistido 24h en IndexedDB → render instantáneo al navegar.
 *  - `refetchOnMount: true` (default) → si una mutación invalidó el cache
 *    (alta/edición/borrado de tomo) al volver a esta vista refetch en bg.
 *  - `refetchOnWindowFocus: true` → vuelves al tab y se actualiza solo.
 *
 * Invalidaciones automáticas en ProductsPage (`invalidateMangas`) tras
 * crear/editar/borrar — propagan vía BroadcastChannel entre Caja 1/2/3.
 */
export function useMangasQuery(
  storeId?: number | null,
  options?: { enabled?: boolean; refetchIntervalMs?: number | false }
) {
  // include_unassigned: trae también tomos sin inventario en la tienda
  // ("No asignado") para que la sucursal les agregue stock.
  const params = storeId ? { store_id: storeId, include_unassigned: true } : undefined
  return useQuery({
    queryKey: queryKeys.mangas.list(params),
    queryFn: () => getMangas(params),
    enabled: options?.enabled ?? true,
    staleTime: CATALOG_STALE_MS,
    gcTime: ONE_DAY_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
    // Polling casi-live opcional (Joel 2026-06-12) — solo montada + tab enfocada.
    refetchInterval: options?.refetchIntervalMs || false,
  })
}
