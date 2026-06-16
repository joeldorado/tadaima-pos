import { useState, useEffect, useRef } from 'react'
import { Search, PackageSearch, Loader2, ChevronRight, X, Scan } from 'lucide-react'
import { useAuth } from '@tadaima/auth'
import type { ProductLight } from '@tadaima/api'
import { useProductsSearchQuery } from '@/hooks/queries/useProducts'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { StoreStockBreakdown } from '@/components/inventory/StoreStockBreakdown'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n)

const STOCK_ACCENT = {
  redBg: 'rgba(224,34,26,0.12)',
  redBorder: 'rgba(224,34,26,0.22)',
  greenBg: 'rgba(16,185,129,0.10)',
  greenBorder: 'rgba(16,185,129,0.22)',
  greenText: '#059669',
  blueBg: 'rgba(59,130,246,0.12)',
  blueBorder: 'rgba(59,130,246,0.24)',
  blueText: '#2563eb',
} as const

/**
 * "Buscar en Tiendas" — buscador de existencias cross-sucursal.
 *
 * Gerente y cajero pueden localizar dónde hay stock de un producto sin ver
 * datos financieros de otras tiendas (solo cantidades + contacto de la sucursal).
 * Búsqueda por nombre / SKU / código de barras (un scanner USB escribe + Enter).
 */
export function StockSearchPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<ProductLight | null>(null)
  // Marca el último código que vino del scanner para auto-seleccionar el match
  // sin afectar la búsqueda manual (donde varios resultados es lo normal).
  const lastScanRef = useRef<string | null>(null)

  // Debounce 250ms — evita disparar la búsqueda server-side en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  // Sin store_id → búsqueda global (queremos ver todas las sucursales).
  const { data: results, isFetching } = useProductsSearchQuery(debounced, undefined)
  const products = results?.data ?? []

  // Scanner USB HID: detecta ráfaga rápida → setea la búsqueda con el código
  // escaneado y marca el ref para que el efecto de abajo auto-seleccione el match.
  useBarcodeScanner({
    onScan: (code) => {
      lastScanRef.current = code
      setSearch(code)
      setDebounced(code) // sin debounce — escaneo = intención inmediata
    },
  })

  // Auto-select: cuando viene de scanner y hay match exacto por sku/barcode,
  // selecciona ese producto. Si no hay scanner pero hay UN solo resultado,
  // también auto-selecciona — escribir un SKU completo abre el detalle solo.
  useEffect(() => {
    if (products.length === 0) return
    const scanned = lastScanRef.current
    if (scanned) {
      const exact = products.find(p => p.sku === scanned || p.barcode === scanned)
      if (exact) {
        setSelected(exact)
        lastScanRef.current = null
        return
      }
    }
    if (products.length === 1) setSelected(products[0])
  }, [products])

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: STOCK_ACCENT.redBg, border: `1px solid ${STOCK_ACCENT.redBorder}` }}
        >
          <PackageSearch size={20} style={{ color: 'var(--td-red)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black" style={{ color: 'var(--td-text-hi)' }}>Existencias por Tienda</h1>
          <p className="text-xs" style={{ color: 'var(--td-text-lo)' }}>
            Escanea o escribe — te mostramos en qué sucursal hay disponible
          </p>
        </div>
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl shrink-0"
          style={{ background: STOCK_ACCENT.greenBg, border: `1px solid ${STOCK_ACCENT.greenBorder}` }}
          title="Scanner USB activo — escanea un código y el producto se selecciona solo"
        >
          <Scan size={12} style={{ color: STOCK_ACCENT.greenText }} />
          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: STOCK_ACCENT.greenText }}>Scanner listo</span>
        </div>
      </div>

      {/* Search input */}
      <div className="relative mb-5">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--td-text-lo)' }} />
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Escanea código de barras, o escribe nombre / SKU…"
          className="w-full rounded-2xl pl-12 pr-12 py-3.5 text-sm outline-none"
          style={{ background: 'var(--td-input-bg)', border: '1px solid var(--td-input-border)', color: 'var(--td-input-text)' }}
        />
        {search && (
          <button
            onClick={() => { setSearch(''); setSelected(null); lastScanRef.current = null }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-[var(--td-hover-bg)] transition-colors"
            title="Limpiar"
          >
            <X size={16} style={{ color: 'var(--td-text-lo)' }} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Results list */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--td-text-lo)' }}>
            Resultados {isFetching && <Loader2 size={11} className="inline animate-spin ml-1" />}
          </p>

          {debounced.length < 2 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--td-text-lo)' }}>
              Escribe al menos 2 caracteres para buscar.
            </p>
          ) : products.length === 0 && !isFetching ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--td-text-lo)' }}>
              Sin resultados para "{debounced}".
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {products.map(p => {
                const isSel = selected?.id === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors"
                    style={{
                      background: isSel ? 'var(--td-red-dim)' : 'var(--td-card-bg)',
                      border: `1px solid ${isSel ? 'var(--td-red-brd)' : 'var(--td-card-border)'}`,
                    }}
                  >
                    <div
                      className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                      style={{ background: 'var(--td-surface-muted)', border: '1px solid var(--td-panel-border)' }}
                    >
                      {p.image
                        ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                        : <PackageSearch size={18} style={{ color: 'var(--td-text-lo)' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--td-text-hi)' }}>
                        {p.name}
                        {p.volume_number != null && (
                          <span
                            className="ml-2 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider align-middle"
                            style={{ color: STOCK_ACCENT.blueText, background: STOCK_ACCENT.blueBg, border: `1px solid ${STOCK_ACCENT.blueBorder}` }}
                          >
                            Tomo {p.volume_number}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] font-mono truncate" style={{ color: 'var(--td-text-lo)' }}>
                        {p.sku || 'Sin SKU'} · {p.prices.price_1 ? fmt(p.prices.price_1) : '—'}
                      </p>
                    </div>
                    <ChevronRight size={16} style={{ color: isSel ? 'var(--td-red)' : 'var(--td-text-lo)' }} className="shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected product breakdown */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--td-text-lo)' }}>
            Existencias por tienda
          </p>
          {selected ? (
            <div
              className="rounded-3xl p-4"
              style={{ background: 'var(--td-panel-bg)', border: '1px solid var(--td-panel-border)' }}
            >
              <p className="text-sm font-black mb-1" style={{ color: 'var(--td-text-hi)' }}>{selected.name}</p>
              <p className="text-[11px] font-mono mb-4" style={{ color: 'var(--td-text-lo)' }}>{selected.sku || 'Sin SKU'}</p>
              <StoreStockBreakdown productId={selected.id} showContact highlightStoreId={user?.store_id} />
            </div>
          ) : (
            <div
              className="rounded-3xl flex flex-col items-center justify-center gap-2 py-12 px-4 text-center"
              style={{ background: 'var(--td-panel-bg)', border: '1px solid var(--td-panel-border)' }}
            >
              <PackageSearch size={32} style={{ color: 'var(--td-divider)' }} />
              <p className="text-sm" style={{ color: 'var(--td-text-lo)' }}>
                Selecciona un producto para ver dónde hay stock.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
