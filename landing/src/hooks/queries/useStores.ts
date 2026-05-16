import { useQuery } from '@tanstack/react-query'
import { getStores } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function useStoresQuery(options?: { active?: boolean; enabled?: boolean }) {
  const params = options?.active !== undefined ? { active: options.active } : undefined
  return useQuery({
    queryKey: [...queryKeys.stores.list(), params ?? {}],
    queryFn: () => getStores(params),
    enabled: options?.enabled ?? true,
  })
}
