import { apiClient } from './client'
import type { Notification } from './types'

/**
 * Lista las notificaciones del usuario autenticado.
 * GET /notifications?unread_only=true
 */
export async function getNotifications(params?: {
  unread_only?: boolean
}): Promise<Notification[]> {
  const response = await apiClient.get<Notification[]>('/notifications', { params })
  return Array.isArray(response.data) ? response.data : []
}

/**
 * Marca una notificación como leída.
 * PATCH /notifications/{id}/read
 */
export async function markNotificationRead(id: number): Promise<Notification> {
  const response = await apiClient.patch<Notification>(`/notifications/${id}/read`, {})
  return response.data
}
