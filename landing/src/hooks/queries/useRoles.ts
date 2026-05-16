import { useQuery } from '@tanstack/react-query'
import { getRoles } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function useRolesQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: () => getRoles(),
    enabled: options?.enabled ?? true,
  })
}
