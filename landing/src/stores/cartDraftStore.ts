import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Tracks the server-side draft ID and draft item IDs for each mesa (cart tab).
// Persisted to localStorage so draft references survive page reloads.
// On mount, SellPage validates persisted draftIds against the server and clears
// stale entries (completed/cancelled/not-found drafts).

interface CartDraftState {
  /** Map from mesa ID to server-assigned draft ID */
  draftIds: Record<string, number>

  /** Map from mesa ID → product ID (string) → server-assigned draft item ID */
  draftItemIds: Record<string, Record<string, number>>

  setDraftId(mesaId: string, draftId: number): void
  clearDraft(mesaId: string): void
  getDraftId(mesaId: string): number | undefined

  setDraftItemId(mesaId: string, productId: string, itemId: number): void
  getDraftItemId(mesaId: string, productId: string): number | undefined
  clearDraftItem(mesaId: string, productId: string): void
  /** Clears all item ID entries for a mesa (call after sale completes) */
  clearDraftItems(mesaId: string): void
}

export const useCartDraftStore = create<CartDraftState>()(
  persist(
    (set, get) => ({
      draftIds: {},
      draftItemIds: {},

      setDraftId: (mesaId, draftId) =>
        set(state => ({ draftIds: { ...state.draftIds, [mesaId]: draftId } })),

      clearDraft: (mesaId) =>
        set(state => {
          const nextDraftIds = { ...state.draftIds }
          delete nextDraftIds[mesaId]
          const nextItemIds = { ...state.draftItemIds }
          delete nextItemIds[mesaId]
          return { draftIds: nextDraftIds, draftItemIds: nextItemIds }
        }),

      getDraftId: (mesaId) => get().draftIds[mesaId],

      setDraftItemId: (mesaId, productId, itemId) =>
        set(state => ({
          draftItemIds: {
            ...state.draftItemIds,
            [mesaId]: { ...(state.draftItemIds[mesaId] ?? {}), [productId]: itemId },
          },
        })),

      getDraftItemId: (mesaId, productId) => get().draftItemIds[mesaId]?.[productId],

      clearDraftItem: (mesaId, productId) =>
        set(state => {
          const mesaItems = { ...(state.draftItemIds[mesaId] ?? {}) }
          delete mesaItems[productId]
          return { draftItemIds: { ...state.draftItemIds, [mesaId]: mesaItems } }
        }),

      clearDraftItems: (mesaId) =>
        set(state => {
          const next = { ...state.draftItemIds }
          delete next[mesaId]
          return { draftItemIds: next }
        }),
    }),
    {
      name: 'tadaima-cart-draft',
      // Only persist the data fields — functions are recreated by Zustand
      partialize: (state) => ({
        draftIds: state.draftIds,
        draftItemIds: state.draftItemIds,
      }),
    },
  ),
)
