// Client-authoritative cart: lives entirely in the browser (localStorage),
// gets sent whole to POST /us/orders at checkout. Server recomputes prices.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { UsListing } from '../lib/api'
import {
  addListing,
  cartCount,
  cartSubtotal,
  changeQuantity,
  parseStoredCart,
  removeListing,
  type CartLine,
} from '../lib/cart'
import { CART_STORAGE_KEY } from '../lib/constants'

interface CartContextValue {
  readonly lines: readonly CartLine[]
  readonly count: number
  readonly subtotal: number
  readonly isDrawerOpen: boolean
  readonly addItem: (listing: UsListing, quantity?: number) => void
  readonly setQuantity: (listingId: number, quantity: number) => void
  readonly removeItem: (listingId: number) => void
  readonly clearCart: () => void
  readonly openDrawer: () => void
  readonly closeDrawer: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function readStoredCart(): readonly CartLine[] {
  try {
    return parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY))
  } catch {
    // Storage blocked (private mode, permissions) — start with an empty cart.
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<readonly CartLine[]>(readStoredCart)
  const [isDrawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines))
    } catch {
      // Persistence is best-effort; the in-memory cart keeps working.
    }
  }, [lines])

  const addItem = useCallback((listing: UsListing, quantity = 1) => {
    setLines((prev) => addListing(prev, listing, quantity))
    setDrawerOpen(true)
  }, [])

  const setQuantity = useCallback((listingId: number, quantity: number) => {
    setLines((prev) => changeQuantity(prev, listingId, quantity))
  }, [])

  const removeItem = useCallback((listingId: number) => {
    setLines((prev) => removeListing(prev, listingId))
  }, [])

  const clearCart = useCallback(() => {
    setLines([])
  }, [])

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: cartCount(lines),
      subtotal: cartSubtotal(lines),
      isDrawerOpen,
      addItem,
      setQuantity,
      removeItem,
      clearCart,
      openDrawer,
      closeDrawer,
    }),
    [
      lines,
      isDrawerOpen,
      addItem,
      setQuantity,
      removeItem,
      clearCart,
      openDrawer,
      closeDrawer,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (context === null) {
    throw new Error('useCart must be used inside <CartProvider>')
  }
  return context
}
