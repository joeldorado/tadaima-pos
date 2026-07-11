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
            <ShoppingBag size={18} className="text-amber-300" />
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
                    <span className="ml-auto text-xs font-black text-amber-300">{fmt(groupTotal(group))}</span>
                  )}
                </div>

                {group.items.map((it) => {
                  const img = it.image ? storageUrl(it.image) : ""
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
                          <p className="text-[11px] font-bold text-amber-300 mt-0.5">{fmt(it.price)}</p>
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

                        {/* Selector de sucursal (si el producto está en más de una) */}
                        {it.stores.length > 1 && (
                          <select
                            value={it.selectedStoreId ?? ""}
                            onChange={(e) => onSetStore(it.productId, Number(e.target.value))}
                            className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] font-bold text-white/80 outline-none focus:border-white/20"
                          >
                            {it.stores.map((s) => (
                              <option key={s.store_id} value={s.store_id}>
                                {s.store_name} ({s.qty} disp.)
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  )
                })}

                {!group.whatsapp && (
                  <p className="text-[10px] text-amber-300/80">
                    Esta sucursal no tiene WhatsApp configurado; se abrirá sin destinatario.
                  </p>
                )}
                <button
                  onClick={() => sendGroup(group)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/25 transition-colors"
                >
                  <MessageCircle size={14} />
                  Enviar a {group.storeName}
                </button>
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
      </aside>
    </div>
  )
}
