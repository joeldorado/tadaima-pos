import { useQuery } from '@tanstack/react-query'
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
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/**
 * Folios de preventa. Cambian más seguido (cobros, status, items entregados)
 * así que mantenemos staleTime corto (60s) — admin/gerente quiere ver lo nuevo.
 * Las mutations en Caja (createPreSaleOrder, addPayment, updateStatus) invalidan
 * automáticamente.
 */
export function usePreSaleOrdersQuery(
  params?: Parameters<typeof getPreSaleOrders>[0],
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.preSaleOrders.list(params as Record<string, unknown> | undefined),
    queryFn: () => getPreSaleOrders(params),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  })
}
