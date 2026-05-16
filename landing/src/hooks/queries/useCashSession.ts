import { useQuery } from '@tanstack/react-query'
import { getActiveSession, getCashRegisters } from '@tadaima/api'

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
