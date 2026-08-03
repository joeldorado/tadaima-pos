import { useState } from "react"
import { Minus, MessageCircle, Plus, ShoppingBag, Store, Trash2, X } from "lucide-react"
import { storageUrl } from "@tadaima/api"
import type { CartLine, StoreOrderGroup } from "@/lib/catalogWhatsApp"
import { buildOrderMessage, buildWhatsAppLink, groupByStore } from "@/lib/catalogWhatsApp"

const DISPLAY = "'Space Grotesk', system-ui, sans-serif"
const BODY = "'Inter', system-ui, -apple-system, sans-serif"

const fmt = (n: number): string =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0)

interface CartDrawerProps {
  open: boolean
  onClose: () => void
  items: CartLine[]
  showPrice: boolean
  onSetQty: (productId: number, qty: number) => void
  onSetStore: (productId: number, storeId: number) => void
  onRemove: (productId: number) => void
  onClear: () => void
}

const groupTotal = (group: StoreOrderGroup): number =>
  group.items.reduce((sum, it) => sum + (typeof it.price === "number" ? it.price * it.qty : 0), 0)

// v5: colores por vars (--td-… y --cat-…, antes text-white hardcodeado) para
// que el drawer funcione igual en los temas oscuros y en el corporativo claro.
const surface = { background: "var(--td-surface-muted)", border: "1px solid var(--td-divider)" }
const goodChip = {
  background: "var(--cat-good-dim, rgba(16,185,129,0.15))",
  border: "1px solid var(--cat-good-brd, rgba(16,185,129,0.3))",
  color: "var(--cat-good, #34D399)",
}

export function CartDrawer({
  open,
  onClose,
  items,
  showPrice,
  onSetQty,
  onSetStore,
  onRemove,
  onClear,
}: CartDrawerProps) {
  const [customerName, setCustomerName] = useState("")
  const [notes, setNotes] = useState("")

  if (!open) return null

  const empty = items.length === 0
  const groups = groupByStore(items)

  const sendGroup = (group: StoreOrderGroup) => {
    const message = buildOrderMessage(group.storeName, group.items, { customerName, notes, showPrice })
    const link = buildWhatsAppLink(group.whatsapp, message)
    window.open(link, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ fontFamily: BODY }}>
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose} />

      <aside
        className="relative w-full max-w-md h-full flex flex-col shadow-2xl"
        style={{ background: "var(--td-popup-bg)", borderLeft: "1px solid var(--td-panel-border)" }}
      >
        <header className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--td-divider)" }}>
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} style={{ color: "var(--cat-price, #FCD34D)" }} />
            <h2 className="text-sm font-black uppercase tracking-widest" style={{ fontFamily: DISPLAY, color: "var(--td-text-hi)" }}>Tu pedido</h2>
          </div>
          <button onClick={onClose} className="transition-colors cursor-pointer hover:brightness-150" style={{ color: "var(--td-text-lo)" }}>
            <X size={18} />
          </button>
        </header>

        {empty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: "var(--td-text-ghost)" }}>
            <ShoppingBag size={40} />
            <p className="text-xs font-bold uppercase tracking-widest">Tu carrito está vacío</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--td-text-lo)" }}>
              {groups.length > 1
                ? `Armaste ${groups.length} pedidos — uno por sucursal. Se envía un WhatsApp a cada tienda con sus productos.`
                : "Tu pedido se separa por sucursal. Se envía un WhatsApp a cada tienda con sus productos."}
            </p>

            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Tu nombre (opcional)"
              className="w-full rounded-xl px-3 py-2.5 text-xs font-bold outline-none"
              style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-input-text)" }}
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas (opcional)"
              rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-xs font-bold outline-none resize-none"
              style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-input-text)" }}
            />

            {/* Un bloque por sucursal destino = un pedido (v5: numerados) */}
            {groups.map((group, gi) => (
              <div
                key={group.storeId ?? "none"}
                className="rounded-2xl p-3 space-y-3"
                style={surface}
              >
                <div className="flex items-center gap-2">
                  <Store size={14} style={{ color: "var(--cat-good, #34D399)" }} />
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--td-text-hi)" }}>
                    {groups.length > 1 ? `Pedido ${gi + 1} · ` : ""}Recoger en {group.storeName}
                  </p>
                  {showPrice && (
                    <span className="ml-auto text-xs font-black" style={{ color: "var(--cat-price, #FCD34D)" }}>{fmt(groupTotal(group))}</span>
                  )}
                </div>

                {group.items.map((it) => {
                  // it.image puede ser URL absoluta (GCS) o path legacy de carritos viejos.
                  const img = it.image ? (it.image.startsWith("http") ? it.image : storageUrl(it.image)) : ""
                  return (
                    <div key={it.productId} className="flex gap-3">
                      <div
                        className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                        style={{ background: "var(--td-surface-strong)", border: "1px solid var(--td-divider)" }}
                      >
                        {img ? (
                          <img src={img} alt={it.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <ShoppingBag size={16} style={{ color: "var(--td-text-ghost)" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black leading-tight" style={{ color: "var(--td-text-hi)" }}>{it.name}</p>
                        {showPrice && typeof it.price === "number" && (
                          <p className="text-[11px] font-bold mt-0.5" style={{ color: "var(--cat-price, #FCD34D)" }}>{fmt(it.price)}</p>
                        )}

                        <div className="flex items-center gap-2 mt-1.5">
                          <button
                            onClick={() => onSetQty(it.productId, it.qty - 1)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:brightness-125"
                            style={{ ...surface, color: "var(--td-text-md)" }}
                          >
                            <Minus size={11} />
                          </button>
                          <span className="text-xs font-black w-5 text-center" style={{ color: "var(--td-text-hi)" }}>{it.qty}</span>
                          <button
                            onClick={() => onSetQty(it.productId, it.qty + 1)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:brightness-125"
                            style={{ ...surface, color: "var(--td-text-md)" }}
                          >
                            <Plus size={11} />
                          </button>
                          <button
                            onClick={() => onRemove(it.productId)}
                            className="ml-auto transition-colors cursor-pointer hover:brightness-150"
                            style={{ color: "var(--td-text-ghost)" }}
                            aria-label="Quitar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Selector de sucursal PROMINENTE (v2.3): visible siempre
                            que el producto esté en más de una tienda pedible.
                            Solo tiendas CON WhatsApp (sin número no reciben
                            pedidos); guard `?? []` para carritos legacy. */}
                        {(() => {
                          const stores = it.stores ?? []
                          const orderable = stores.filter((s) => !!s.whatsapp)
                          const options = orderable.length ? orderable : stores
                          if (options.length <= 1) return null
                          return (
                            <label className="mt-2 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5" style={goodChip}>
                              <Store size={12} className="shrink-0" />
                              <span className="text-[9px] font-black uppercase tracking-widest shrink-0" style={{ opacity: 0.8 }}>Recoger en</span>
                              <select
                                value={it.selectedStoreId ?? ""}
                                onChange={(e) => onSetStore(it.productId, Number(e.target.value))}
                                className="flex-1 min-w-0 bg-transparent text-[11px] font-black outline-none cursor-pointer"
                                style={{ color: "var(--td-text-hi)" }}
                              >
                                {options.map((s) => (
                                  <option key={s.store_id} value={s.store_id}>
                                    {s.store_name} ({s.qty} disp.)
                                  </option>
                                ))}
                              </select>
                            </label>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })}

                {!group.whatsapp && (
                  <p className="text-[10px]" style={{ color: "#D97706" }}>
                    Esta sucursal no tiene WhatsApp configurado; se abrirá sin destinatario.
                  </p>
                )}
                {/* Con UNA sola sucursal, el envío vive en el footer sticky (v2.0). */}
                {groups.length > 1 && (
                  <button
                    onClick={() => sendGroup(group)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors cursor-pointer hover:brightness-110"
                    style={goodChip}
                  >
                    <MessageCircle size={14} />
                    Enviar pedido {gi + 1} · {group.storeName}
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={onClear}
              className="w-full rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer hover:brightness-125"
              style={{ ...surface, color: "var(--td-text-lo)" }}
            >
              Vaciar carrito
            </button>
          </div>
        )}

        {/* Footer sticky (v2.0): CTA siempre visible en móvil + safe-area. */}
        {!empty && groups.length === 1 && (
          <footer
            className="p-4"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))", background: "var(--td-popup-bg)", borderTop: "1px solid var(--td-divider)" }}
          >
            <button
              onClick={() => sendGroup(groups[0]!)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-widest transition-colors cursor-pointer hover:brightness-110"
              style={{ ...goodChip, minHeight: 48, fontFamily: DISPLAY }}
            >
              <MessageCircle size={15} />
              Enviar a {groups[0]!.storeName}
              {showPrice && groupTotal(groups[0]!) > 0 && (
                <span style={{ color: "var(--cat-price, #FCD34D)" }}>· {fmt(groupTotal(groups[0]!))}</span>
              )}
            </button>
          </footer>
        )}
      </aside>
    </div>
  )
}
