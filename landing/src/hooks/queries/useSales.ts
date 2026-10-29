import { useQuery, keepPreviousData } from '@tanstack/react-query'
import type { getSales } from '@tadaima/api'
import { fetchAllSales } from '@/lib/fetchAllPages'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Lista de ventas con filtros opcionales.
 *
 * - TODAS las páginas (2026-10-29): GET /sales topa en 100 por página y la
 *   pantalla Ventas pedía solo la primera, así que con un rango de más de un
 *   par de días la tienda veía únicamente las 100 ventas más recientes y el
 *   buscador "no encontraba" las anteriores (ni por nombre ni por código).
 *   `fetchAllSales` devuelve la misma forma de una página, así los parches
 *   optimistas de `lib/optimisticSale.ts` siguen funcionando igual.
 * - staleTime 5min: las mutaciones (checkout/cancelación en Caja) invalidan
 *   queryKeys.sales.all explícitamente, así que no necesitamos un staleTime
 *   corto para "ver lo nuevo" — solo generaba refetches al navegar de regreso.
 * - placeholderData keepPreviousData: al cambiar filtro (fecha/tienda/cajero)
 *   la queryKey cambia; sin esto la tabla blankeaba a skeleton en cada cambio.
 *   Ahora se queda la lista anterior mientras llega la nueva (mismo patrón
 *   que Preventas #126 y Historial #116).
 * - Sin refetch al volver a la ventana (`refetchOnWindowFocus: false` global,
 *   Joel 2026-10-02): los datos se recargan al entrar y con «Actualizar».
 */
export function useSalesQuery(
  params?: Parameters<typeof getSales>[0],
  options?: { enabled?: boolean; refetchIntervalMs?: number | false }
) {
  return useQuery({
    queryKey: queryKeys.sales.list(params as Record<string, unknown> | undefined),
    queryFn: () => fetchAllSales(params ?? {}),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    // Polling casi-live opcional (decisión Joel 2026-06-12): SOLO corre
    // mientras la query está montada Y la tab enfocada
    // (refetchIntervalInBackground default false) — al salir de la pantalla
    // se apaga solo. Cubre cross-máquina: gerente/admin ven ventas hechas
    // en otras cajas sin tocar nada.
    refetchInterval: options?.refetchIntervalMs || false,
  })
}
