import { useQuery } from '@tanstack/react-query'
import { getNotifications, type Notification } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Lista de notificaciones del usuario autenticado.
 *
 * - refetchInterval condicional: 15s cuando el popup del bell está abierto
 *   (usuario mirando activamente), 60s cuando está cerrado (solo refresca el
 *   contador del badge). Reduce ~75% de requests cuando nadie mira el bell.
 * - refetchOnWindowFocus — al volver al tab, refetcha
 * - Sincronización multi-tab vía BroadcastChannel del QueryClient global
 * - Backend devuelve 304 Not Modified si no hubo cambios → respuesta de 0 bytes
 *   y CPU mínimo en Cloud Run
 */
export function useNotificationsQuery(options?: { unreadOnly?: boolean; enabled?: boolean; popupOpen?: boolean }) {
  const params = { unread_only: options?.unreadOnly ?? false }
  return useQuery<Notification[]>({
    queryKey: queryKeys.notifications.list(params),
    queryFn: () => getNotifications(params),
    refetchInterval: options?.popupOpen ? 15_000 : 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled ?? true,
  })
}
