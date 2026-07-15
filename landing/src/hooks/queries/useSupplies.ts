import { useQuery } from '@tanstack/react-query'
import { getSupplies, getSupplyMovements, getSupplyReport } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Insumos (Fase 2). El catálogo cambia poco → staleTime alto; los movimientos
 * son la vista operativa del día → poll moderado (mismo criterio que transfers).
 * Las mutations invalidan `queryKeys.supplies.all`.
 */
export function useSuppliesQuery(params?: { all?: boolean }) {
  return useQuery({
    queryKey: queryKeys.supplies.list(params as Record<string, unknown>),
    queryFn: () => getSupplies(params),
    staleTime: 60_000,
  })
}

export function useSupplyMovementsQuery(params?: {
  supply_id?: number
  type?: 'purchase' | 'consumption' | 'adjustment'
}) {
  return useQuery({
    queryKey: queryKeys.supplies.movements(params as Record<string, unknown>),
    queryFn: () => getSupplyMovements(params),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useSupplyReportQuery(params: { from: string; to: string }, enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplies.report(params),
    queryFn: () => getSupplyReport(params),
    staleTime: 30_000,
    enabled,
  })
}
