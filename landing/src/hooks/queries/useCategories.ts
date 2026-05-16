import { useQuery } from '@tanstack/react-query'
import { getCategories } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function useCategoriesQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => getCategories(),
    enabled: options?.enabled ?? true,
  })
}
