import { useQuery } from '@tanstack/react-query'
import { getSales } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Lista de ventas con filtros opcionales.
 *
 * - staleTime 30s: datos válidos medio minuto antes de refetch automático
 *   al volver a la página/tab
 * - refetchOnWindowFocus default true: admin que tiene reportes abierto
 *   en otra tab y vuelve, ve ventas nuevas hechas por cajeros en otras tiendas
 *
 * Sin polling activo — el caso "ver venta en vivo" lo cubre la propia Caja
 * que invalida queryKeys.sales.all tras cada cobro (mismo browser) y el
 * focus refetch para máquinas distintas.
 */
export function useSalesQuery(
  params?: Parameters<typeof getSales>[0],
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.sales.list(params as Record<string, unknown> | undefined),
    queryFn: () => getSales(params),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}
