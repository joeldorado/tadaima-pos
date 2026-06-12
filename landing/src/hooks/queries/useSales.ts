import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getSales } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Lista de ventas con filtros opcionales.
 *
 * - staleTime 5min: las mutaciones (checkout/cancelación en Caja) invalidan
 *   queryKeys.sales.all explícitamente, así que no necesitamos un staleTime
 *   corto para "ver lo nuevo" — solo generaba refetches al navegar de regreso.
 * - placeholderData keepPreviousData: al cambiar filtro (fecha/tienda/cajero)
 *   la queryKey cambia; sin esto la tabla blankeaba a skeleton en cada cambio.
 *   Ahora se queda la lista anterior mientras llega la nueva (mismo patrón
 *   que Preventas #126 y Historial #116).
 * - refetchOnWindowFocus default true: admin que tiene reportes abierto
 *   en otra tab y vuelve, ve ventas nuevas hechas por cajeros en otras tiendas
 *
 * Sin polling activo — el caso "ver venta en vivo" lo cubre la propia Caja
 * que invalida queryKeys.sales.all tras cada cobro (mismo browser) y el
 * focus refetch para máquinas distintas.
 */
export function useSalesQuery(
  params?: Parameters<typeof getSales>[0],
  options?: { enabled?: boolean; refetchIntervalMs?: number | false }
) {
  return useQuery({
    queryKey: queryKeys.sales.list(params as Record<string, unknown> | undefined),
    queryFn: () => getSales(params),
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
