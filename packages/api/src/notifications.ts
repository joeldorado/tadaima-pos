import { apiClient } from './client'
import type { Notification, SendStockAlertInput, SendStockAlertResult } from './types'

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

/**
 * Borra una notificación del usuario autenticado.
 * DELETE /notifications/{id}
 */
export async function deleteNotification(id: number): Promise<void> {
  await apiClient.delete(`/notifications/${id}`)
}

/**
 * Crea o actualiza un aviso de stock bajo/agotado.
 * POST /notifications/stock-alert
 */
export async function sendStockAlert(input: SendStockAlertInput): Promise<SendStockAlertResult> {
  const response = await apiClient.post<SendStockAlertResult>('/notifications/stock-alert', input)
  return response.data
}
