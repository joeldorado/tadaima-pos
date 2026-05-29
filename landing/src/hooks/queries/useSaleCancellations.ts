import { useQuery } from '@tanstack/react-query'
import { getSaleCancellations, type GetSaleCancellationsParams } from '@tadaima/api'

/**
 * ADR-016 Fase 4 — Log de cancelaciones.
 * Cache corto (30s): la lista cambia cuando se cancela algo, así que mejor
 * fresca para que el reporte/admin vea el cambio inmediato post-acción.
 */
export function useSaleCancellationsQuery(params?: GetSaleCancellationsParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['saleCancellations', 'list', params ?? {}],
    queryFn: () => getSaleCancellations(params),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  })
}
