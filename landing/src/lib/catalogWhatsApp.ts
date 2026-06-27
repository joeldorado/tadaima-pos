// Utilidades puras de la Tienda Online: normalización del número para wa.me y
// armado del mensaje de pedido del carrito. Sin React → testeable con vitest.

/** Sucursal con stock de un producto + su WhatsApp de pedidos. */
export interface CartStoreOption {
  store_id: number
  store_name: string
  qty: number
  whatsapp: string | null
}

export interface CartLine {
  productId: number
  name: string
  price?: number | undefined
  qty: number
  /** Path de la imagen en storage (no URL absoluta). */
  image?: string | undefined
  /** Sucursales donde hay stock (para elegir en el checkout). */
  stores: CartStoreOption[]
  /** Sucursal elegida; default la de más stock. null si el producto no tiene sucursales. */
  selectedStoreId: number | null
}

/** Forma mínima que necesita el armado del mensaje (independiente del carrito). */
export type OrderLine = { name: string; price?: number | undefined; qty: number }

/** Pedido agrupado por sucursal destino (un WhatsApp por grupo). */
export interface StoreOrderGroup {
  storeId: number | null
  storeName: string
  whatsapp: string | null
  items: CartLine[]
}

const MX_LADA = "52"

/**
 * Normaliza un número a dígitos aptos para wa.me (sin +, espacios ni signos).
 * - 10 dígitos (local MX) → antepone 52.
 * - Ya internacional (52…, 521…, u otro país) → se respeta tal cual.
 * - Vacío / null → "".
 * wa.me moderno ya no exige el "1" tras 52 para celulares; no lo agregamos.
 */
export function normalizeWaNumber(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length === 10) return MX_LADA + digits
  return digits
}

const fmtMoney = (n: number): string =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0)

export interface OrderMessageOptions {
  customerName?: string
  notes?: string
  showPrice: boolean
}

/**
 * Arma el texto del pedido para WhatsApp. Incluye subtotales y total solo si
 * showPrice; si no, omite precios ("precio a confirmar" por chat). Devuelve
 * texto plano — el caller hace el encode al construir el link.
 */
export function buildOrderMessage(
  storeName: string,
  items: OrderLine[],
  opts: OrderMessageOptions
): string {
  const lines: string[] = [`Hola, quiero hacer este pedido en ${storeName}:`, ""]

  items.forEach((it, i) => {
    const base = `${i + 1}. ${it.name} x${it.qty}`
    lines.push(
      opts.showPrice && typeof it.price === "number"
        ? `${base} — ${fmtMoney(it.price * it.qty)}`
        : base
    )
  })

  if (opts.showPrice) {
    const total = items.reduce(
      (sum, it) => sum + (typeof it.price === "number" ? it.price * it.qty : 0),
      0
    )
    lines.push("", `Total: ${fmtMoney(total)}`)
  }

  if (opts.customerName?.trim()) {
    lines.push("", `Nombre: ${opts.customerName.trim()}`)
  }
  if (opts.notes?.trim()) {
    lines.push(`Notas: ${opts.notes.trim()}`)
  }

  return lines.join("\n")
}

/**
 * Construye el link wa.me con el mensaje codificado. Sin número (vacío) abre
 * WhatsApp sin destinatario para que el cliente elija el contacto — degradado
 * aceptable cuando la tienda no configuró número ni teléfono.
 */
export function buildWhatsAppLink(
  waNumber: string | null | undefined,
  message: string
): string {
  const num = normalizeWaNumber(waNumber)
  const text = encodeURIComponent(message)
  return num ? `https://wa.me/${num}?text=${text}` : `https://wa.me/?text=${text}`
}

/**
 * Agrupa los ítems del carrito por la sucursal elegida (`selectedStoreId`).
 * Cada grupo se manda como un pedido independiente por WhatsApp a su tienda.
 */
export function groupByStore(items: CartLine[]): StoreOrderGroup[] {
  const map = new Map<number | null, StoreOrderGroup>()
  for (const it of items) {
    const sid = it.selectedStoreId
    const store = it.stores.find((s) => s.store_id === sid) ?? null
    const existing = map.get(sid)
    if (existing) {
      existing.items.push(it)
    } else {
      map.set(sid, {
        storeId: sid,
        storeName: store?.store_name ?? "Sin asignar",
        whatsapp: store?.whatsapp ?? null,
        items: [it],
      })
    }
  }
  return Array.from(map.values())
}

