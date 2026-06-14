import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, PackageSearch, Loader2, ChevronRight, X, Scan, Store, Phone, MessageCircle } from 'lucide-react'
import { useAuth } from '@tadaima/auth'
import type { ProductLight, PreSaleCatalog } from '@tadaima/api'
import { useProductsSearchQuery } from '@/hooks/queries/useProducts'
import { usePreSaleCatalogsQuery } from '@/hooks/queries/usePreSales'
import { useStoresQuery } from '@/hooks/queries/useStores'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { StoreStockBreakdown } from '@/components/inventory/StoreStockBreakdown'

// ─── Helpers de teléfono (MX) ──────────────────────────────────────────────────
/** Normaliza a dígitos para tel:. Antepone 52 si parece número local de 10 dígitos. */
function toDialDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `52${digits}`
  return digits
}

function StorePreSaleStockBreakdown({
  catalog,
  highlightStoreId,
}: {
  catalog: PreSaleCatalog
  highlightStoreId?: number | null
}) {
  const { data: stores = [], isLoading, isError } = useStoresQuery({ active: true })

  const rows = useMemo(() => {
    return stores.map(store => {
      const sl = catalog.store_limits?.find(x => x.store_id === store.id)
      const limit = sl?.limit_qty ?? 0
      const reserved = catalog.reserved_by_store?.[String(store.id)] ?? 0
      const remaining = Math.max(0, limit - reserved)
      return {
        storeId: store.id,
        storeName: store.name,
        phone: store.phone,
        limit,
        reserved,
        remaining,
      }
    }).sort((a, b) => b.remaining - a.remaining)
  }, [stores, catalog])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm" style={{ color: 'var(--td-text-lo)' }}>
        <Loader2 size={15} className="animate-spin" /> Cargando tiendas…
      </div>
    )
  }

  if (isError) {
    return (
      <p className="py-3 text-sm" style={{ color: 'var(--td-text-lo)' }}>
        No se pudo cargar la información de las tiendas.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(row => {
        const qty = row.remaining
        const limit = row.limit
        const reserved = row.reserved
        const qtyColor = limit === 0 ? 'var(--td-text-lo)' : qty <= 0 ? 'var(--td-red)' : qty <= 5 ? '#FFAA00' : '#00CC66'
        const isMine = highlightStoreId != null && row.storeId === highlightStoreId
        const showButtons = row.phone

        return (
          <div
            key={row.storeId}
            className="rounded-2xl px-4 py-3"
            style={{
              background: isMine ? 'rgba(0,200,100,0.07)' : 'var(--td-card-bg)',
              border: `1px solid ${isMine ? 'rgba(0,200,100,0.22)' : 'var(--td-card-border)'}`,
            }}
          >
            {/* Línea principal: tienda · estado · cantidad */}
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <Store size={16} style={{ color: isMine ? '#00CC66' : 'var(--td-text-md)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: 'var(--td-text-hi)' }}>
                  {row.storeName}
                  {isMine && (
                    <span className="ml-2 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,200,100,0.18)', color: '#00CC66' }}>
                      Tu tienda
                    </span>
                  )}
                </p>
                {limit > 0 ? (
                  <>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--td-text-lo)' }}>
                      Límite: {limit} · Reservados: {reserved}
                    </p>
                    <p className="text-[10px] mt-0.5 font-bold" style={{ color: qtyColor }}>
                      {qty <= 0 ? 'Cupo agotado' : qty <= 5 ? 'Por agotarse' : 'Cupo disponible'}
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--td-text-lo)' }}>
                    Sin cupo asignado para esta tienda
                  </p>
                )}
              </div>
              {limit > 0 && (
                <div className="shrink-0 text-right min-w-[56px]">
                  <p className="text-2xl font-black leading-none tabular-nums" style={{ color: qtyColor }}>{qty}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: 'var(--td-text-lo)' }}>uds</p>
                </div>
              )}
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
                  style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366' }}
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

const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n)

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
  const [selected, setSelected] = useState<ProductLight | PreSaleCatalog | null>(null)
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

  // Carga también los catálogos de preventa para búsqueda cross-tienda.
  const { data: catalogsData, isFetching: isFetchingCatalogs } = usePreSaleCatalogsQuery({ per_page: 200 })
  const catalogs = catalogsData?.data ?? []

  // Filtra los catálogos de preventa por el término de búsqueda
  const matchedCatalogs = useMemo(() => {
    if (debounced.length < 2) return []
    const q = debounced.toLowerCase()
    return catalogs.filter(c => {
      if (c.status === 'draft' || c.status === 'cancelled') return false
      return (
        c.product_name.toLowerCase().includes(q) ||
        (c.category?.name ?? '').toLowerCase().includes(q) ||
        (c.supplier?.name ?? '').toLowerCase().includes(q)
      )
    })
  }, [catalogs, debounced])

  // Combina productos y preventas ordenados alfabéticamente
  const combinedResults = useMemo(() => {
    const list: (ProductLight | PreSaleCatalog)[] = [...products]
    list.push(...matchedCatalogs)
    return list.sort((a, b) => {
      const nameA = 'product_name' in a ? a.product_name : a.name
      const nameB = 'product_name' in b ? b.product_name : b.name
      return nameA.localeCompare(nameB)
    })
  }, [products, matchedCatalogs])

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
    if (combinedResults.length === 0) return
    const scanned = lastScanRef.current
    if (scanned) {
      const exact = combinedResults.find(p => !('product_name' in p) && (p.sku === scanned || p.barcode === scanned))
      if (exact) {
        setSelected(exact)
        lastScanRef.current = null
        return
      }
    }
    if (combinedResults.length === 1) setSelected(combinedResults[0])
  }, [combinedResults])

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(224,34,26,0.12)', border: '1px solid rgba(224,34,26,0.22)' }}
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
          style={{ background: 'rgba(0,200,100,0.10)', border: '1px solid rgba(0,200,100,0.22)' }}
          title="Scanner USB activo — escanea un código y el producto se selecciona solo"
        >
          <Scan size={12} style={{ color: '#00CC66' }} />
          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#00CC66' }}>Scanner listo</span>
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
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
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
            Resultados {(isFetching || isFetchingCatalogs) && <Loader2 size={11} className="inline animate-spin ml-1" />}
          </p>

          {debounced.length < 2 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--td-text-lo)' }}>
              Escribe al menos 2 caracteres para buscar.
            </p>
          ) : combinedResults.length === 0 && !isFetching && !isFetchingCatalogs ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--td-text-lo)' }}>
              Sin resultados para "{debounced}".
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {combinedResults.map(item => {
                const isPreSale = 'product_name' in item
                const isSel = selected?.id === item.id && ('product_name' in selected) === isPreSale
                const name = isPreSale ? item.product_name : item.name
                const image = isPreSale ? item.image_url : item.image
                const price = isPreSale ? item.price_1 : item.prices.price_1

                return (
                  <button
                    key={isPreSale ? `presale-${item.id}` : `product-${item.id}`}
                    onClick={() => setSelected(item)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors"
                    style={{
                      background: isSel ? 'rgba(224,34,26,0.10)' : 'var(--td-card-bg)',
                      border: `1px solid ${isSel ? 'rgba(224,34,26,0.25)' : 'var(--td-card-border)'}`,
                    }}
                  >
                    <div
                      className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      {image
                        ? <img src={image} alt={name} className="w-full h-full object-cover" loading="lazy" />
                        : <PackageSearch size={18} style={{ color: 'var(--td-text-lo)' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--td-text-hi)' }}>
                        {name}
                        {!isPreSale && item.volume_number != null && (
                          <span
                            className="ml-2 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider align-middle"
                            style={{ color: '#60A5FA', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)' }}
                          >
                            Tomo {item.volume_number}
                          </span>
                        )}
                        {isPreSale && (
                          <span
                            className="ml-2 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider align-middle"
                            style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}
                          >
                            Preventa
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] font-mono truncate" style={{ color: 'var(--td-text-lo)' }}>
                        {isPreSale ? 'Preventa' : (item.sku || 'Sin SKU')} · {price ? fmt(price) : '—'}
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
              {'product_name' in selected ? (
                <>
                  <p className="text-sm font-black mb-1" style={{ color: 'var(--td-text-hi)' }}>{selected.product_name}</p>
                  <p className="text-[11px] font-mono mb-4" style={{ color: 'var(--td-text-lo)' }}>
                    Preventa · Anticipo: {selected.advance_payment ? fmt(selected.advance_payment) : '—'} · Total: {selected.price_1 ? fmt(selected.price_1) : '—'}
                  </p>
                  <StorePreSaleStockBreakdown catalog={selected} highlightStoreId={user?.store_id} />
                </>
              ) : (
                <>
                  <p className="text-sm font-black mb-1" style={{ color: 'var(--td-text-hi)' }}>{selected.name}</p>
                  <p className="text-[11px] font-mono mb-4" style={{ color: 'var(--td-text-lo)' }}>{selected.sku || 'Sin SKU'}</p>
                  <StoreStockBreakdown productId={selected.id} showContact highlightStoreId={user?.store_id} />
                </>
              )}
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
