import { useQuery } from '@tanstack/react-query'
import { getSales } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function useSalesQuery(
  params?: Parameters<typeof getSales>[0],
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.sales.list(params as Record<string, unknown> | undefined),
    queryFn: () => getSales(params),
    enabled: options?.enabled ?? true,
  })
}
