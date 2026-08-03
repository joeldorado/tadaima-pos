import { Store, X } from "lucide-react"
import type { CatalogStoreStock, GlobalCatalogItem } from "@tadaima/api"

const DISPLAY = "'Space Grotesk', system-ui, sans-serif"

const PREF_KEY = "tadaima_store_pref"

/** Última sucursal elegida por este cliente (se preselecciona en el popup). */
export function readStorePref(): number | null {
  try {
    const raw = window.localStorage.getItem(PREF_KEY)
    return raw ? Number(raw) || null : null
  } catch {
    return null
  }
}

export function saveStorePref(storeId: number): void {
  try {
    window.localStorage.setItem(PREF_KEY, String(storeId))
  } catch {
    // modo privado / storage lleno — la preferencia es solo comodidad
  }
}

/**
 * Sucursales donde este producto se puede PEDIR: con WhatsApp configurado;
 * si ninguna tiene número, todas (degradado wa.me sin destinatario — mismo
 * criterio que useCart/CartDrawer).
 */
export function orderableStores(item: GlobalCatalogItem): CatalogStoreStock[] {
  const stores = item.stores ?? []
  const orderable = stores.filter((s) => !!s.whatsapp)
  return orderable.length ? orderable : stores
}

interface StorePickPopoverProps {
  item: GlobalCatalogItem
  onPick: (storeId: number) => void
  onClose: () => void
}

/**
 * Popup "¿Dónde lo recoges?" (Tienda v5): cuando un producto está en más de
 * una sucursal, el cliente elige la tienda AL AGREGAR — así arma un carrito
 * por tienda desde el inicio (p.ej. un pedido Macro y otro Centro). La última
 * elección queda de preferencia y se resalta la siguiente vez.
 */
export function StorePickPopover({ item, onPick, onClose }: StorePickPopoverProps) {
  const options = orderableStores(item)
  const pref = readStorePref()

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-3xl p-5"
        style={{
          background: "var(--td-popup-bg)",
          border: "1px solid var(--td-panel-border)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: "var(--cat-accent-text, #FF8A80)", fontFamily: DISPLAY }}>
              ¿Dónde lo recoges?
            </p>
            <p className="text-sm font-bold mt-1 line-clamp-2" style={{ color: "var(--td-text-hi)" }}>
              {item.name}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 p-1.5 rounded-lg cursor-pointer transition hover:brightness-150"
            style={{ color: "var(--td-text-lo)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {options.map((s) => {
            const isPref = s.store_id === pref
            return (
              <button
                key={s.store_id}
                onClick={() => onPick(s.store_id)}
                className="w-full flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left cursor-pointer transition hover:brightness-110"
                style={
                  isPref
                    ? { background: "var(--cat-accent-dim, var(--td-red-dim))", border: "1px solid var(--cat-accent-brd, var(--td-red-brd))" }
                    : { background: "var(--td-surface-muted)", border: "1px solid var(--td-divider)" }
                }
              >
                <Store size={16} className="shrink-0" style={{ color: isPref ? "var(--cat-accent-text, #FF8A80)" : "var(--td-text-lo)" }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-black truncate" style={{ color: "var(--td-text-hi)", fontFamily: DISPLAY }}>
                    {s.store_name}
                  </span>
                  <span className="block text-[10px] font-bold" style={{ color: "var(--cat-good, #34D399)" }}>
                    {s.qty} disponibles
                  </span>
                </span>
                {isPref && (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md" style={{ background: "var(--cat-badge-bg, rgba(0,0,0,0.45))", color: "var(--td-text-md)" }}>
                    La usual
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <p className="mt-3.5 text-[10px] leading-relaxed" style={{ color: "var(--td-text-lo)" }}>
          Puedes armar un pedido por tienda — el carrito los separa y manda un
          WhatsApp a cada sucursal.
        </p>
      </div>
    </div>
  )
}
