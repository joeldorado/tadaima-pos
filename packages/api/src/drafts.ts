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
