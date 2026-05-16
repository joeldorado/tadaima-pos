import { useQuery } from '@tanstack/react-query'
import { getUsers } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function useUsersQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: () => getUsers(),
    enabled: options?.enabled ?? true,
  })
}
