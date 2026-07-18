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
        <header className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} style={{ color: "var(--cat-price, #FCD34D)" }} />
            <h2 className="text-sm font-black uppercase tracking-widest text-white" style={{ fontFamily: DISPLAY }}>Tu pedido</h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </header>

        {empty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/30">
            <ShoppingBag size={40} />
            <p className="text-xs font-bold uppercase tracking-widest">Tu carrito está vacío</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-[11px] text-white/40 leading-relaxed">
              Tu pedido se separa por sucursal. Se envía un WhatsApp a cada tienda con sus productos.
            </p>

            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Tu nombre (opcional)"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-bold text-white placeholder:text-white/25 outline-none focus:border-white/20"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas (opcional)"
              rows={2}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-bold text-white placeholder:text-white/25 outline-none focus:border-white/20 resize-none"
            />

            {/* Un bloque por sucursal destino */}
            {groups.map((group) => (
              <div
                key={group.storeId ?? "none"}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Store size={14} className="text-emerald-300" />
                  <p className="text-xs font-black text-white uppercase tracking-widest">{group.storeName}</p>
                  {showPrice && (
                    <span className="ml-auto text-xs font-black" style={{ color: "var(--cat-price, #FCD34D)" }}>{fmt(groupTotal(group))}</span>
                  )}
                </div>

                {group.items.map((it) => {
                  // it.image puede ser URL absoluta (GCS) o path legacy de carritos viejos.
                  const img = it.image ? (it.image.startsWith("http") ? it.image : storageUrl(it.image)) : ""
                  return (
                    <div key={it.productId} className="flex gap-3">
                      <div className="w-14 h-14 rounded-xl bg-black/50 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                        {img ? (
                          <img src={img} alt={it.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <ShoppingBag size={16} className="text-white/20" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-white leading-tight">{it.name}</p>
                        {showPrice && typeof it.price === "number" && (
                          <p className="text-[11px] font-bold mt-0.5" style={{ color: "var(--cat-price, #FCD34D)" }}>{fmt(it.price)}</p>
                        )}

                        <div className="flex items-center gap-2 mt-1.5">
                          <button
                            onClick={() => onSetQty(it.productId, it.qty - 1)}
                            className="w-6 h-6 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center text-white/70 hover:bg-white/10 transition-colors"
                          >
                            <Minus size={11} />
                          </button>
                          <span className="text-xs font-black text-white w-5 text-center">{it.qty}</span>
                          <button
                            onClick={() => onSetQty(it.productId, it.qty + 1)}
                            className="w-6 h-6 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center text-white/70 hover:bg-white/10 transition-colors"
                          >
                            <Plus size={11} />
                          </button>
                          <button
                            onClick={() => onRemove(it.productId)}
                            className="ml-auto text-white/30 hover:text-red-300 transition-colors"
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
                            <label className="mt-2 flex items-center gap-1.5 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] px-2.5 py-1.5">
                              <Store size={12} className="shrink-0 text-emerald-300" />
                              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-200/80 shrink-0">Recoger en</span>
                              <select
                                value={it.selectedStoreId ?? ""}
                                onChange={(e) => onSetStore(it.productId, Number(e.target.value))}
                                className="flex-1 min-w-0 bg-transparent text-[11px] font-black text-white outline-none cursor-pointer"
                              >
                                {options.map((s) => (
                                  <option key={s.store_id} value={s.store_id} style={{ background: "#16090c" }}>
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
                  <p className="text-[10px] text-amber-300/80">
                    Esta sucursal no tiene WhatsApp configurado; se abrirá sin destinatario.
                  </p>
                )}
                {/* Con UNA sola sucursal, el envío vive en el footer sticky (v2.0). */}
                {groups.length > 1 && (
                  <button
                    onClick={() => sendGroup(group)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/25 transition-colors"
                  >
                    <MessageCircle size={14} />
                    Enviar a {group.storeName}
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={onClear}
              className="w-full rounded-xl border border-white/10 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
            >
              Vaciar carrito
            </button>
          </div>
        )}

        {/* Footer sticky (v2.0): CTA siempre visible en móvil + safe-area. */}
        {!empty && groups.length === 1 && (
          <footer
            className="p-4 border-t border-white/10"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))", background: "var(--td-popup-bg)" }}
          >
            <button
              onClick={() => sendGroup(groups[0]!)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/25 transition-colors"
              style={{ minHeight: 48, fontFamily: DISPLAY }}
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
