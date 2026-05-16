import { useQuery } from '@tanstack/react-query'
import { getTerminals } from '@tadaima/api'

export function useTerminalsQuery(
  params?: { store_id?: number; active?: boolean },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['terminals', 'list', params ?? {}],
    queryFn: () => getTerminals(params),
    enabled: options?.enabled ?? true,
  })
}
