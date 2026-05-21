import { useQuery } from '@tanstack/react-query'
import { getUsers, getOnlineUsers, type GetUsersParams } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function useUsersQuery(params?: GetUsersParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...queryKeys.users.list(), params ?? {}] as const,
    queryFn: () => getUsers(params),
    enabled: options?.enabled ?? true,
  })
}

/**
 * Lista de usuarios conectados (last_seen_at < 2 min). Refresca cada 30s para
 * reflejar logins/logouts recientes. Admin sin storeId ve todos; gerente/cajero
 * quedan scoped a su tienda en backend.
 */
export function useOnlineUsersQuery(storeId?: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['users', 'online', storeId ?? null],
    queryFn: () => getOnlineUsers(storeId ?? undefined),
    enabled: options?.enabled ?? true,
    refetchInterval: 30_000,
  })
}
