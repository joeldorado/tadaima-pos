import { useQuery } from '@tanstack/react-query'
import { getCustomers } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function useCustomersQuery(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.customers.list(params),
    queryFn: () => getCustomers(params),
  })
}
