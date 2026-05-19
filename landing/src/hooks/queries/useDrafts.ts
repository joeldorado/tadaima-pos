import { useQuery } from '@tanstack/react-query'
import { getReservedStock, getExpiringDrafts, type ExpiringDraft, type ReservedStockResponse } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Mapa product_id → cantidad reservada en TODOS los drafts open de la tienda
 * (de todos los cajeros, todas las mesas). Cada caja consulta cada 10s para
 * mantener visibilidad cross-máquina de qué está apartado.
 *
 * `staleTime: 8s` + `refetchInterval: 10s` evita que un volver-a-focus dispare
 * fetch extra si acabamos de refetchar. `refetchOnWindowFocus: false` evita
 * bursts al cambiar de tab que rebasan el free tier de Cloud Run.
 */
export function useReservedStockQuery(storeId?: number | null) {
  return useQuery<ReservedStockResponse>({
    queryKey: queryKeys.salesDrafts.reservedStock(storeId ?? null),
    queryFn: () => getReservedStock(storeId as number),
    enabled: !!storeId,
    staleTime: 8_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  })
}

/**
 * Drafts del usuario actual que el backend marcó como "por vencer". Cuando
 * `data.length > 0`, el Layout monta el modal top-priority. Polling a 20s es
 * suficiente — el cajero tiene un grace period de 60s para responder al modal.
 */
export function useExpiringDraftsQuery() {
  return useQuery<ExpiringDraft[]>({
    queryKey: queryKeys.salesDrafts.expiring(),
    queryFn: () => getExpiringDrafts(),
    staleTime: 15_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}
