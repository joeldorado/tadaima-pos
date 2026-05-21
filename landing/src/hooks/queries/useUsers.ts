import { useQuery } from '@tanstack/react-query'
import { getUsers, type GetUsersParams } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function useUsersQuery(params?: GetUsersParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...queryKeys.users.list(), params ?? {}] as const,
    queryFn: () => getUsers(params),
    enabled: options?.enabled ?? true,
  })
}
