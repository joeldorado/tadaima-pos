import { useCallback, useEffect, useState } from "react"
import type { CartLine } from "@/lib/catalogWhatsApp"

const keyFor = (catalogUrl: string): string => `tadaima_cart_${catalogUrl}`

function readCart(catalogUrl: string): CartLine[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(keyFor(catalogUrl))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CartLine[]) : []
  } catch {
    return []
  }
}

export interface UseCart {
  items: CartLine[]
  add: (line: Omit<CartLine, "qty" | "selectedStoreId">, qty?: number) => void
  remove: (productId: number) => void
  setQty: (productId: number, qty: number) => void
  /** Reasigna la sucursal destino de un producto (checkout). */
  setStore: (productId: number, storeId: number) => void
  clear: () => void
  count: number
  total: number
}

/**
 * Carrito client-authoritative (ADR-014) persistido en localStorage, una clave
 * por catálogo (`tadaima_cart_<catalogUrl>`) → tiendas distintas no se mezclan.
 * Guards SSR + try/catch siguiendo el patrón de trackEvent.
 */
export function useCart(catalogUrl: string | undefined): UseCart {
  const url = catalogUrl ?? ""
  const [items, setItems] = useState<CartLine[]>(() => (url ? readCart(url) : []))

  // Recargar el carrito correcto si cambia el catálogo.
  useEffect(() => {
    setItems(url ? readCart(url) : [])
  }, [url])

  // Persistir en cada cambio.
  useEffect(() => {
    if (typeof window === "undefined" || !url) return
    try {
      window.localStorage.setItem(keyFor(url), JSON.stringify(items))
    } catch {
      // almacenamiento lleno / modo privado — no bloquear la UI
    }
  }, [items, url])

  const add = useCallback((line: Omit<CartLine, "qty" | "selectedStoreId">, qty = 1) => {
    const inc = Math.max(1, Math.floor(qty))
    // Default: la sucursal con más stock de este producto QUE TENGA WhatsApp
    // (una tienda sin número no puede recibir el pedido — Joel 2026-07-20).
    // Si ninguna tiene número, cae a la de más stock (degradado wa.me sin
    // destinatario, con aviso en el drawer).
    const stores = line.stores ?? []
    const orderable = stores.filter((s) => !!s.whatsapp)
    const pool = orderable.length ? orderable : stores
    const defaultStore = pool.length
      ? [...pool].sort((a, b) => b.qty - a.qty)[0]!.store_id
      : null
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === line.productId)
      if (existing) {
        return prev.map((i) =>
          i.productId === line.productId ? { ...i, qty: i.qty + inc } : i
        )
      }
      return [...prev, { ...line, qty: inc, selectedStoreId: defaultStore }]
    })
  }, [])

  const setStore = useCallback((productId: number, storeId: number) => {
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, selectedStoreId: storeId } : i))
    )
  }, [])

  const remove = useCallback((productId: number) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId))
  }, [])

  const setQty = useCallback((productId: number, qty: number) => {
    const next = Math.floor(qty)
    setItems((prev) =>
      next <= 0
        ? prev.filter((i) => i.productId !== productId)
        : prev.map((i) => (i.productId === productId ? { ...i, qty: next } : i))
    )
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const count = items.reduce((sum, i) => sum + i.qty, 0)
  const total = items.reduce(
    (sum, i) => sum + (typeof i.price === "number" ? i.price * i.qty : 0),
    0
  )

  return { items, add, remove, setQty, setStore, clear, count, total }
}
