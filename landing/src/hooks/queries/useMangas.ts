import { useQuery } from '@tanstack/react-query'
import { getMangas } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function useMangasQuery(storeId?: number | null, options?: { enabled?: boolean }) {
  const params = storeId ? { store_id: storeId } : undefined
  return useQuery({
    queryKey: queryKeys.mangas.list(params),
    queryFn: () => getMangas(params),
    enabled: options?.enabled ?? true,
  })
}
