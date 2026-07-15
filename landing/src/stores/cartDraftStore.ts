import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { newLineId } from '@/lib/saleCalc'

// Tracks the server-side draft ID and draft item IDs for each mesa (cart tab).
// Persisted to localStorage so draft references survive page reloads.
// On mount, SellPage validates persisted draftIds against the server and clears
// stale entries (completed/cancelled/not-found drafts).

interface CartDraftState {
  /** Map from mesa ID to server-assigned draft ID */
  draftIds: Record<string, number>

  /** Map from mesa ID → product ID (string) → server-assigned draft item ID */
  draftItemIds: Record<string, Record<string, number>>

  /**
   * Snapshot serializable de las mesas (carrito completo) para sobrevivir
   * navegación entre pantallas dentro del SPA. SellPage hidrata desde aquí
   * en mount y sincroniza en cada cambio.
   */
  mesasSnapshot: unknown[] | null
  activeMesaIdSnapshot: string | null

  setDraftId(mesaId: string, draftId: number): void
  clearDraft(mesaId: string): void
  getDraftId(mesaId: string): number | undefined

  setDraftItemId(mesaId: string, productId: string, itemId: number): void
  getDraftItemId(mesaId: string, productId: string): number | undefined
  clearDraftItem(mesaId: string, productId: string): void
  /** Clears all item ID entries for a mesa (call after sale completes) */
  clearDraftItems(mesaId: string): void

  setMesasSnapshot(mesas: unknown[], activeId: string): void
  clearMesasSnapshot(): void
}

export const useCartDraftStore = create<CartDraftState>()(
  persist(
    (set, get) => ({
      draftIds: {},
      draftItemIds: {},
      mesasSnapshot: null,
      activeMesaIdSnapshot: null,

      setMesasSnapshot: (mesas, activeId) =>
        set({ mesasSnapshot: mesas, activeMesaIdSnapshot: activeId }),

      clearMesasSnapshot: () =>
        set({ mesasSnapshot: null, activeMesaIdSnapshot: null }),

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
      // v1 (Descuentos v2, 2026-07-14): cada item del carrito lleva lineId.
      // migrate asigna lineId a snapshots persistidos antes del cambio para
      // que un carrito abierto sobreviva el deploy sin romper mutadores.
      version: 1,
      migrate: (persisted: unknown): CartDraftState => {
        const state = persisted as {
          mesasSnapshot?: Array<{ items?: Array<{ lineId?: string }> }> | null
        } & Record<string, unknown>
        const snap = state?.mesasSnapshot
        const migrated = Array.isArray(snap)
          ? {
              ...state,
              mesasSnapshot: snap.map(m => ({
                ...m,
                items: (m.items ?? []).map(i => (i.lineId ? i : { ...i, lineId: newLineId() })),
              })),
            }
          : state
        return migrated as unknown as CartDraftState
      },
      // Only persist the data fields — functions are recreated by Zustand
      partialize: (state) => ({
        draftIds: state.draftIds,
        draftItemIds: state.draftItemIds,
        mesasSnapshot: state.mesasSnapshot,
        activeMesaIdSnapshot: state.activeMesaIdSnapshot,
      }),
    },
  ),
)
