import { useQuery } from '@tanstack/react-query'
import { getTransfers } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Transferencias de stock entre tiendas.
 *
 * Cuando otra tienda crea/completa una transferencia hacia la mía, mi stock
 * cambia y debo enterarme:
 *  - staleTime 30s: datos válidos medio minuto antes de refetch
 *  - refetchInterval 60s: poll moderado para detectar transferencias nuevas
 *    creadas en otra máquina (gerente Centro crea hacia Macroplaza)
 *  - refetchOnWindowFocus default true: al volver al tab refetcha
 * Las mutations (create/complete/cancel) invalidan automáticamente.
 */
export function useTransfersQuery(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.transfers.list(params),
    queryFn: () => getTransfers(params),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
