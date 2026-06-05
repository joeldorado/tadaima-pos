import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getMangas } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

const ONE_DAY_MS = 24 * 60 * 60_000

/**
 * Catálogo de tomos/librería. Mismo patrón que useProductsQuery:
 *  - Cache 24h persistido en IndexedDB → render instantáneo al navegar.
 *  - `refetchOnMount: true` (default) → si una mutación invalidó el cache
 *    (alta/edición/borrado de tomo) al volver a esta vista refetch en bg.
 *  - `refetchOnWindowFocus: true` → vuelves al tab y se actualiza solo.
 *
 * Invalidaciones automáticas en ProductsPage (`invalidateMangas`) tras
 * crear/editar/borrar — propagan vía BroadcastChannel entre Caja 1/2/3.
 */
export function useMangasQuery(storeId?: number | null, options?: { enabled?: boolean }) {
  const params = storeId ? { store_id: storeId } : undefined
  return useQuery({
    queryKey: queryKeys.mangas.list(params),
    queryFn: () => getMangas(params),
    enabled: options?.enabled ?? true,
    staleTime: ONE_DAY_MS,
    gcTime: ONE_DAY_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
  })
}
