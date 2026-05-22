import { useQuery } from '@tanstack/react-query'
import { getNotifications, type Notification } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Lista de notificaciones del usuario autenticado.
 *
 * - refetchInterval 15s — el admin ve avisos nuevos sin recargar
 * - refetchOnWindowFocus — al volver al tab, refetcha
 * - Sincronización multi-tab gratis vía el BroadcastChannel del QueryClient
 *   global: si marca leída/borra en un tab, los otros tabs se enteran al
 *   invalidar la queryKey
 */
export function useNotificationsQuery(options?: { unreadOnly?: boolean; enabled?: boolean }) {
  const params = { unread_only: options?.unreadOnly ?? false }
  return useQuery<Notification[]>({
    queryKey: queryKeys.notifications.list(params),
    queryFn: () => getNotifications(params),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled ?? true,
  })
}
