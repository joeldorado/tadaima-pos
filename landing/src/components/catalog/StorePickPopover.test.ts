import { beforeEach, describe, expect, it } from "vitest"
import type { GlobalCatalogItem } from "@tadaima/api"
import { orderableStores, readStorePref, saveStorePref } from "./StorePickPopover"

// vitest corre en env node: se stubbea window.localStorage con un Map (mismo
// patrón que ticketPrint.test.ts).
const storage = new Map<string, string>()
beforeEach(() => {
  storage.clear()
  ;(globalThis as Record<string, unknown>)["window"] = {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
  }
})

const item = (stores: GlobalCatalogItem["stores"]): GlobalCatalogItem =>
  ({
    id: 1,
    name: "Figura Goku",
    product_type: "product",
    description: null,
    category: null,
    images: [],
    stores,
    total: stores.reduce((s, x) => s + x.qty, 0),
  }) as GlobalCatalogItem

describe("orderableStores", () => {
  it("solo tiendas con WhatsApp cuando al menos una tiene número", () => {
    const result = orderableStores(item([
      { store_id: 1, store_name: "Centro", qty: 3, whatsapp: "6641112233" },
      { store_id: 3, store_name: "Macro", qty: 5, whatsapp: null },
    ]))
    expect(result.map((s) => s.store_id)).toEqual([1])
  })

  it("sin ningún WhatsApp degrada a todas (wa.me sin destinatario)", () => {
    const result = orderableStores(item([
      { store_id: 1, store_name: "Centro", qty: 3, whatsapp: null },
      { store_id: 3, store_name: "Macro", qty: 5, whatsapp: null },
    ]))
    expect(result).toHaveLength(2)
  })

  it("dos tiendas con WhatsApp = las dos son elegibles (popup)", () => {
    const result = orderableStores(item([
      { store_id: 1, store_name: "Centro", qty: 3, whatsapp: "6641112233" },
      { store_id: 3, store_name: "Macro", qty: 5, whatsapp: "6649998877" },
    ]))
    expect(result).toHaveLength(2)
  })
})

describe("preferencia de tienda", () => {
  it("guarda y lee la última tienda elegida", () => {
    expect(readStorePref()).toBeNull()
    saveStorePref(3)
    expect(readStorePref()).toBe(3)
    saveStorePref(1)
    expect(readStorePref()).toBe(1)
  })

  it("valor basura en storage devuelve null", () => {
    storage.set("tadaima_store_pref", "no-numero")
    expect(readStorePref()).toBeNull()
  })
})
