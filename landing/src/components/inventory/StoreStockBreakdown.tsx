import { useMemo } from 'react'
import { Loader2, Store, Phone, MessageCircle, PackageX } from 'lucide-react'
import { useProductInventoryQuery } from '@/hooks/queries/useInventory'

// ─── Helpers de teléfono (MX) ──────────────────────────────────────────────────
/** Normaliza a dígitos para tel:. Antepone 52 si parece número local de 10 dígitos. */
function toDialDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `52${digits}`
  return digits
}

interface StoreRow {
  storeId: number | null
  storeName: string
  phone: string | null
  quantity: number
}

const STOCK_THEME = {
  mineBg: 'rgba(16,185,129,0.08)',
  mineBorder: 'rgba(16,185,129,0.22)',
  mineText: '#059669',
  warnText: '#D97706',
  okText: '#059669',
  whatsappBg: 'rgba(37,211,102,0.12)',
  whatsappBorder: 'rgba(37,211,102,0.28)',
  whatsappText: '#16A34A',
} as const

/**
 * Desglose de existencias de un producto por tienda/sucursal.
 *
 * - Modal de detalle de producto/tomo → `showContact={false}` (solo cantidades).
 * - Página "Buscar en Tiendas" → `showContact` (botones Llamar / WhatsApp por tienda).
 *
 * `highlightStoreId` resalta la sucursal del usuario actual.
 */
export function StoreStockBreakdown({
  productId,
  showContact = false,
  highlightStoreId,
  enabled = true,
}: {
  productId: number | null | undefined
  showContact?: boolean
  highlightStoreId?: number | null
  enabled?: boolean
}) {
  const { data: items, isLoading, isError } = useProductInventoryQuery(productId, enabled)

  const rows = useMemo<StoreRow[]>(() => {
    if (!items) return []
    // Agrupa por tienda (puede haber varias bodegas por tienda → sumamos).
    const byStore = new Map<string, StoreRow>()
    for (const it of items) {
      const wh = it.warehouse
      const store = wh?.store ?? null
      const key = store ? `s${store.id}` : `w${wh?.id ?? 'x'}`
      const name = store?.name ?? wh?.name ?? 'Sin ubicación'
      const existing = byStore.get(key)
      if (existing) {
        existing.quantity += it.quantity
      } else {
        byStore.set(key, {
          storeId: store?.id ?? null,
          storeName: name,
          phone: store?.phone ?? null,
          quantity: it.quantity,
        })
      }
    }
    return Array.from(byStore.values()).sort((a, b) => b.quantity - a.quantity)
  }, [items])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm" style={{ color: 'var(--td-text-lo)' }}>
        <Loader2 size={15} className="animate-spin" /> Cargando existencias…
      </div>
    )
  }

  if (isError) {
    return (
      <p className="py-3 text-sm" style={{ color: 'var(--td-text-lo)' }}>
        No se pudo cargar el inventario por tienda.
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm" style={{ color: 'var(--td-text-lo)' }}>
        <PackageX size={15} /> Sin existencias registradas en ninguna tienda.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(row => {
        const qty = row.quantity
        const qtyColor = qty <= 0 ? 'var(--td-red)' : qty <= 10 ? STOCK_THEME.warnText : STOCK_THEME.okText
        const isMine = highlightStoreId != null && row.storeId === highlightStoreId
        const showButtons = showContact && row.phone
        return (
          <div
            key={`${row.storeId ?? row.storeName}`}
            className="rounded-2xl px-4 py-3"
            style={{
              background: isMine ? STOCK_THEME.mineBg : 'var(--td-card-bg)',
              border: `1px solid ${isMine ? STOCK_THEME.mineBorder : 'var(--td-card-border)'}`,
            }}
          >
            {/* Línea principal: tienda · estado · cantidad */}
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--td-surface-muted)', border: '1px solid var(--td-panel-border)' }}
              >
                <Store size={16} style={{ color: isMine ? STOCK_THEME.mineText : 'var(--td-text-md)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: 'var(--td-text-hi)' }}>
                  {row.storeName}
                  {isMine && (
                    <span className="ml-2 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.16)', color: STOCK_THEME.mineText }}>
                      Tu tienda
                    </span>
                  )}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--td-text-lo)' }}>
                  {qty <= 0 ? 'Agotado' : qty <= 10 ? 'Por agotarse' : 'Disponible'}
                </p>
              </div>
              <div className="shrink-0 text-right min-w-[56px]">
                <p className="text-2xl font-black leading-none tabular-nums" style={{ color: qtyColor }}>{qty}</p>
                <p className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: 'var(--td-text-lo)' }}>uds</p>
              </div>
            </div>

            {/* Acciones en segunda línea (cuando hay teléfono) */}
            {showButtons && (
              <div className="flex items-center gap-2 mt-3 pl-12">
                <a
                  href={`tel:${toDialDigits(row.phone!)}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex-1 justify-center"
                  style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)', color: 'var(--td-text-md)' }}
                  title={`Llamar a ${row.storeName}`}
                >
                  <Phone size={13} /> Llamar
                </a>
                <a
                  href={`https://wa.me/${toDialDigits(row.phone!)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex-1 justify-center"
                  style={{ background: STOCK_THEME.whatsappBg, border: `1px solid ${STOCK_THEME.whatsappBorder}`, color: STOCK_THEME.whatsappText }}
                  title={`WhatsApp a ${row.storeName}`}
                >
                  <MessageCircle size={13} /> WhatsApp
                </a>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
