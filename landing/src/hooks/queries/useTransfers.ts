import { useQuery } from '@tanstack/react-query'
import { getTransfers } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function useTransfersQuery(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.transfers.list(params),
    queryFn: () => getTransfers(params),
  })
}
