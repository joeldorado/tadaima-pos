import { apiClient } from './client'
import type { AddDraftItemInput, Draft, DraftItem, UpdateDraftItemInput } from './types'

/**
 * Fetches a single draft by ID.
 * GET /sales-drafts/:draftId
 */
export async function getDraft(draftId: number): Promise<Draft> {
  const response = await apiClient.get<Draft>(`/sales-drafts/${draftId}`)
  return response.data
}

/**
 * Creates a new open draft.
 * POST /sales-drafts — requires store_id, optionally links to a cash session.
 */
export async function createDraft(storeId: number, registerSessionId?: number): Promise<Draft> {
  const response = await apiClient.post<Draft>('/sales-drafts', {
    store_id: storeId,
    ...(registerSessionId !== undefined ? { register_session_id: registerSessionId } : {}),
  })
  return response.data
}

/**
 * Adds a product line to an existing draft.
 * POST /sales-drafts/:draftId/items
 */
export async function addDraftItem(
  draftId: number,
  input: AddDraftItemInput,
): Promise<DraftItem> {
  const response = await apiClient.post<DraftItem>(`/sales-drafts/${draftId}/items`, input)
  return response.data
}

/**
 * Updates quantity/price of an existing draft item.
 * PUT /sales-drafts/:draftId/items/:itemId
 */
export async function updateDraftItem(
  draftId: number,
  itemId: number,
  input: UpdateDraftItemInput,
): Promise<DraftItem> {
  const response = await apiClient.put<DraftItem>(`/sales-drafts/${draftId}/items/${itemId}`, input)
  return response.data
}

/**
 * Removes a line from a draft.
 * DELETE /sales-drafts/:draftId/items/:itemId
 */
export async function removeDraftItem(draftId: number, itemId: number): Promise<void> {
  await apiClient.delete(`/sales-drafts/${draftId}/items/${itemId}`)
}

/**
 * Soft-cancels a draft (status → cancelled). Used by "Vaciar carrito" so the
 * server doesn't keep accumulating items from prior sessions on the same draftId.
 * DELETE /sales-drafts/:draftId
 */
export async function cancelDraft(draftId: number): Promise<void> {
  await apiClient.delete(`/sales-drafts/${draftId}`)
}

/**
 * Reservas de stock por producto en una tienda. Suma quantities de todos los
 * drafts open (de todos los cajeros) agrupado por product_id.
 * GET /sales-drafts/reserved-stock?store_id=X
 */
export interface ReservedStockResponse {
  reservations: Record<string | number, number>
  as_of: string
}
export async function getReservedStock(storeId: number): Promise<ReservedStockResponse> {
  const response = await apiClient.get<ReservedStockResponse>('/sales-drafts/reserved-stock', {
    params: { store_id: storeId },
  })
  return response.data
}

/**
 * Drafts del usuario actual que el job marcó como "por vencer". El frontend
 * muestra un modal top-priority cuando esta lista no está vacía.
 * GET /sales-drafts/expiring
 */
export interface ExpiringDraft {
  id: number
  store_id: number
  store_name: string | null
  customer_name: string | null
  subtotal: number
  item_count: number
  warned_at: string
  cancels_at: string
  seconds_remaining: number
}
export async function getExpiringDrafts(): Promise<ExpiringDraft[]> {
  const response = await apiClient.get<ExpiringDraft[]>('/sales-drafts/expiring')
  return response.data
}

/**
 * Resetea el reloj del draft: expires_at = now + 5min, warned_at = null.
 * Llamado desde el modal "Mantener carrito".
 * POST /sales-drafts/:draftId/extend
 */
export async function extendDraft(draftId: number): Promise<{ id: number; expires_at: string }> {
  const response = await apiClient.post<{ id: number; expires_at: string }>(`/sales-drafts/${draftId}/extend`)
  return response.data
}
