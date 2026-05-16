import { useQuery } from '@tanstack/react-query'
import { getPaymentMethods } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function usePaymentMethodsQuery(options?: { active?: boolean; enabled?: boolean }) {
  const params = options?.active !== undefined ? { active: options.active } : undefined
  return useQuery({
    queryKey: [...queryKeys.paymentMethods.list(), params ?? {}],
    queryFn: () => getPaymentMethods(params),
    enabled: options?.enabled ?? true,
  })
}
