import { useQuery } from '@tanstack/react-query'
import { getActiveSession, getCashRegisters, getActiveSessions } from '@tadaima/api'

export function useActiveSessionQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['cash', 'activeSession'],
    queryFn: () => getActiveSession(),
    enabled: options?.enabled ?? true,
  })
}

export function useCashRegistersQuery(storeId?: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['cash', 'registers', storeId ?? null],
    queryFn: () => getCashRegisters(storeId ?? undefined),
    enabled: options?.enabled ?? true,
  })
}

/** Sesiones abiertas en una tienda (admin las usa para ver quién está activo). */
export function useActiveSessionsQuery(storeId?: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['cash', 'activeSessions', storeId ?? null],
    queryFn: () => getActiveSessions(storeId ?? undefined),
    enabled: options?.enabled ?? true,
    refetchInterval: 30_000, // poll cada 30s para reflejar nuevas aperturas/cierres
  })
}
