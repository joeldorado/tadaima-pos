import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, PackageSearch, Loader2, ChevronRight, X, Scan, Store, Phone, MessageCircle, Package } from 'lucide-react'
import { useAuth } from '@tadaima/auth'
import type { PreSaleCatalog } from '@tadaima/api'
import type { ProductStockItem } from '@tadaima/api'
import { useProductsSearchQuery } from '@/hooks/queries/useProducts'
import { usePreSaleCatalogsQuery } from '@/hooks/queries/usePreSales'
import { useStoresQuery } from '@/hooks/queries/useStores'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { StoreStockBreakdown } from '@/components/inventory/StoreStockBreakdown'
import { useProductsStockQuery } from '@/hooks/queries/useInventory'

// ─── Helpers de teléfono (MX) ──────────────────────────────────────────────────
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
      return { storeId: store.id, storeName: store.name, phone: store.phone, limit, reserved, remaining }
    }).sort((a, b) => b.remaining - a.remaining)
  }, [stores, catalog])

  if (isLoading) return (
    <div className="flex items-center gap-2 py-4 text-sm" style={{ color: 'var(--td-text-lo)' }}>
      <Loader2 size={15} className="animate-spin" /> Cargando tiendas…
    </div>
  )
  if (isError) return <p className="py-3 text-sm" style={{ color: 'var(--td-text-lo)' }}>No se pudo cargar la información de las tiendas.</p>

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(row => {
        const qty = row.remaining
        const limit = row.limit
        const reserved = row.reserved
        const qtyColor = limit === 0 ? 'var(--td-text-lo)' : qty <= 0 ? 'var(--td-red)' : qty <= 5 ? '#FFAA00' : '#00CC66'
        const isMine = highlightStoreId != null && row.storeId === highlightStoreId
        return (
          <div key={row.storeId} className="rounded-2xl px-4 py-3"
            style={{ background: isMine ? 'rgba(0,200,100,0.07)' : 'var(--td-card-bg)', border: `1px solid ${isMine ? 'rgba(0,200,100,0.22)' : 'var(--td-card-border)'}` }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Store size={16} style={{ color: isMine ? '#00CC66' : 'var(--td-text-md)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: 'var(--td-text-hi)' }}>
                  {row.storeName}
                  {isMine && <span className="ml-2 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,200,100,0.18)', color: '#00CC66' }}>Tu tienda</span>}
                </p>
                {limit > 0 ? (
                  <>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--td-text-lo)' }}>Límite: {limit} · Reservados: {reserved}</p>
                    <p className="text-[10px] mt-0.5 font-bold" style={{ color: qtyColor }}>{qty <= 0 ? 'Cupo agotado' : qty <= 5 ? 'Por agotarse' : 'Cupo disponible'}</p>
                  </>
                ) : (
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--td-text-lo)' }}>Sin cupo asignado para esta tienda</p>
                )}
              </div>
              {limit > 0 && (
                <div className="shrink-0 text-right min-w-[56px]">
                  <p className="text-2xl font-black leading-none tabular-nums" style={{ color: qtyColor }}>{qty}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: 'var(--td-text-lo)' }}>uds</p>
                </div>
              )}
            </div>
            {row.phone && (
              <div className="flex items-center gap-2 mt-3 pl-12">
                <a href={`tel:${toDialDigits(row.phone)}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex-1 justify-center"
                  style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)', color: 'var(--td-text-md)' }}>
                  <Phone size={13} /> Llamar
                </a>
                <a href={`https://wa.me/${toDialDigits(row.phone)}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex-1 justify-center"
                  style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366' }}>
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

// ─── Fila de la lista de existencias ──────────────────────────────────────────
function ProductStockRow({
  item,
  highlightStoreId,
  onSelect,
  isSelected,
}: {
  item: ProductStockItem
  highlightStoreId?: number
  onSelect: () => void
  isSelected: boolean
}) {
  const totalStock = item.stock.reduce((a, s) => a + s.exhibicion + s.bodega, 0)
  const stockColor = totalStock <= 0 ? 'var(--td-red)' : totalStock <= 10 ? '#D97706' : '#059669'

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-start gap-3 px-4 py-3 rounded-2xl text-left transition-colors"
      style={{
        background: isSelected ? 'var(--td-red-dim)' : 'var(--td-card-bg)',
        border: `1px solid ${isSelected ? 'var(--td-red-brd)' : 'var(--td-card-border)'}`,
      }}
    >
      {/* Imagen / ícono */}
      <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center mt-0.5"
        style={{ background: 'var(--td-surface-muted)', border: '1px solid var(--td-panel-border)' }}>
        {item.image
          ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
          : <Package size={18} style={{ color: 'var(--td-text-lo)' }} />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate" style={{ color: 'var(--td-text-hi)' }}>{item.name}</p>
        <p className="text-[11px] font-mono truncate mb-2" style={{ color: 'var(--td-text-lo)' }}>{item.sku || 'Sin SKU'}</p>

        {/* Chips de stock por tienda */}
        <div className="flex flex-wrap gap-1.5">
          {item.stock.length === 0 ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(224,34,26,0.1)', color: 'var(--td-red)' }}>Sin existencias</span>
          ) : (
            item.stock.map(s => {
              const total = s.exhibicion + s.bodega
              const isMine = highlightStoreId != null && s.store_id === highlightStoreId
              const bg = total <= 0 ? 'rgba(224,34,26,0.1)' : isMine ? 'rgba(16,185,129,0.12)' : 'var(--td-surface-muted)'
              const color = total <= 0 ? 'var(--td-red)' : isMine ? '#059669' : 'var(--td-text-md)'
              const border = isMine ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--td-panel-border)'
              return (
                <span key={s.store_id} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: bg, color, border }}>
                  {s.store_name}: {total}
                </span>
              )
            })
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-xl font-black tabular-nums leading-none" style={{ color: stockColor }}>{totalStock}</p>
        <p className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: 'var(--td-text-lo)' }}>total</p>
      </div>
    </button>
  )
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n)

const STOCK_ACCENT = {
  redBg: 'rgba(224,34,26,0.12)', redBorder: 'rgba(224,34,26,0.22)',
  greenBg: 'rgba(16,185,129,0.10)', greenBorder: 'rgba(16,185,129,0.22)', greenText: '#059669',
  blueBg: 'rgba(59,130,246,0.12)', blueBorder: 'rgba(59,130,246,0.24)', blueText: '#2563eb',
} as const

const PER_PAGE = 50

/**
 * "Existencias por Tienda" — listado de productos con stock por sucursal.
 *
 * Carga automáticamente todos los productos con sus existencias embebidas.
 * El buscador filtra en tiempo real via el API (server-side).
 * Al seleccionar un producto se muestra el desglose con botones de contacto.
 * Compatible con scanner USB: detecta ráfaga rápida → selecciona el match exacto.
 */
export function StockSearchPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<{ type: 'product' | 'presale'; id: number } | null>(null)
  const lastScanRef = useRef<string | null>(null)

  // Filtros de comparación entre tiendas
  const [primaryStoreId, setPrimaryStoreId] = useState<number | ''>('')
  const [compareStoreId, setCompareStoreId] = useState<number | ''>('')
  const [primaryOp, setPrimaryOp] = useState<'<' | '=' | '>'>('=')
  const [primaryQty, setPrimaryQty] = useState<string>('')
  const [compareOp, setCompareOp] = useState<'<' | '=' | '>'>('=')
  const [compareQty, setCompareQty] = useState<string>('')

  // Debounce 300ms para el API de lista
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Resetear página al cambiar filtros de tienda
  useEffect(() => { setPage(1) }, [primaryStoreId, compareStoreId, primaryOp, primaryQty, compareOp, compareQty])

  const myStoreId = user?.store_id ?? undefined

  // Lista de tiendas para los selectores
  const { data: storesData } = useStoresQuery({ active: true })
  const stores = storesData ?? []

  const primaryStoreName = stores.find(s => s.id === primaryStoreId)?.name ?? ''
  const compareStoreName = stores.find(s => s.id === compareStoreId)?.name ?? ''

  // Lista paginada con stock embebido (endpoint nuevo)
  const stockParams = {
    page,
    per_page: PER_PAGE,
    ...(debounced ? { search: debounced } : {}),
    ...(primaryStoreId ? { primary_store_id: primaryStoreId as number } : {}),
    ...(primaryStoreId && compareStoreId ? { compare_store_id: compareStoreId as number } : {}),
    ...(primaryStoreId && primaryQty !== '' ? { primary_stock_op: primaryOp, primary_stock_qty: Number(primaryQty) } : {}),
    ...(compareStoreId && compareQty !== '' ? { compare_stock_op: compareOp, compare_stock_qty: Number(compareQty) } : {}),
  }
  const { data: listData, isFetching: isFetchingList } = useProductsStockQuery(stockParams)

  const products = listData?.data ?? []
  const pagination = listData?.pagination

  // Búsqueda de preventas (solo cuando hay texto)
  const { data: catalogsData, isFetching: isFetchingCatalogs } = usePreSaleCatalogsQuery({ per_page: 200 })
  const catalogs = catalogsData?.data ?? []
  const matchedCatalogs = useMemo(() => {
    if (debounced.length < 2 && !primaryStoreId) return []
    const q = debounced.toLowerCase()
    return catalogs.filter(c => {
      if (c.status === 'draft' || c.status === 'cancelled') return false
      // Filtro de texto (solo si hay búsqueda)
      if (debounced.length >= 2) {
        const matchText = c.product_name.toLowerCase().includes(q) || (c.category?.name ?? '').toLowerCase().includes(q)
        if (!matchText) return false
      }
      // Filtro de cupo por tienda primaria
      if (primaryStoreId && primaryQty !== '') {
        const sl = c.store_limits?.find((x: { store_id: number }) => x.store_id === primaryStoreId)
        const limit = sl?.limit_qty ?? 0
        const reserved = c.reserved_by_store?.[String(primaryStoreId)] ?? 0
        const remaining = Math.max(0, limit - reserved)
        if (primaryOp === '=' && remaining !== Number(primaryQty)) return false
        if (primaryOp === '>' && remaining <= Number(primaryQty)) return false
        if (primaryOp === '<' && remaining >= Number(primaryQty)) return false
      }
      return true
    })
  }, [catalogs, debounced, primaryStoreId, primaryOp, primaryQty])

  // Para la búsqueda exacta por scanner (necesita acceder al producto completo)
  const { data: scanResults } = useProductsSearchQuery(lastScanRef.current ?? '', undefined)

  // Scanner USB HID
  useBarcodeScanner({
    onScan: (code) => {
      lastScanRef.current = code
      setSearch(code)
      setDebounced(code)
    },
  })

  // Auto-select por scanner
  useEffect(() => {
    const scanned = lastScanRef.current
    if (!scanned || !scanResults?.data?.length) return
    const exact = scanResults.data.find(p => p.sku === scanned || p.barcode === scanned)
    if (exact) { setSelectedId({ type: 'product', id: exact.id }); lastScanRef.current = null }
  }, [scanResults])

  const selectedProduct = selectedId?.type === 'product'
    ? products.find(p => p.id === selectedId.id) ?? null
    : null
  const selectedCatalog = selectedId?.type === 'presale'
    ? matchedCatalogs.find(c => c.id === selectedId.id) ?? null
    : null

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: STOCK_ACCENT.redBg, border: `1px solid ${STOCK_ACCENT.redBorder}` }}>
          <PackageSearch size={20} style={{ color: 'var(--td-red)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black" style={{ color: 'var(--td-text-hi)' }}>Existencias por Tienda</h1>
          <p className="text-xs" style={{ color: 'var(--td-text-lo)' }}>
            Todos los productos con stock de cada sucursal · Escanea o escribe para filtrar
          </p>
        </div>
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl shrink-0"
          style={{ background: STOCK_ACCENT.greenBg, border: `1px solid ${STOCK_ACCENT.greenBorder}` }}
          title="Scanner USB activo">
          <Scan size={12} style={{ color: STOCK_ACCENT.greenText }} />
          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: STOCK_ACCENT.greenText }}>Scanner listo</span>
        </div>
      </div>

      {/* Filtros de comparación entre tiendas */}
      {stores.length > 1 && (
        <div className="rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-2"
          style={{ background: 'var(--td-panel-bg)', border: '1px solid var(--td-panel-border)' }}>

          {/* Tienda primaria */}
          <div className="flex items-center gap-1.5">
            <Store size={13} style={{ color: 'var(--td-text-lo)' }} />
            <select
              value={primaryStoreId}
              onChange={e => { setPrimaryStoreId(e.target.value ? Number(e.target.value) : ''); setCompareStoreId(''); setPrimaryQty(''); setCompareQty('') }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none"
              style={{ background: 'var(--td-input-bg)', border: `1px solid ${primaryStoreId ? STOCK_ACCENT.blueBorder : 'var(--td-input-border)'}`, color: primaryStoreId ? STOCK_ACCENT.blueText : 'var(--td-text-lo)' }}>
              <option value="">Tienda…</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Filtro de cantidad tienda primaria */}
          {primaryStoreId && (
            <div className="flex items-center gap-1 rounded-lg overflow-hidden"
              style={{ border: `1px solid ${primaryQty !== '' ? STOCK_ACCENT.blueBorder : 'var(--td-input-border)'}`, background: 'var(--td-input-bg)' }}>
              <select
                value={primaryOp}
                onChange={e => setPrimaryOp(e.target.value as '<' | '=' | '>')}
                className="px-2 py-1.5 text-xs font-black outline-none border-r"
                style={{ background: 'transparent', borderColor: 'var(--td-input-border)', color: primaryQty !== '' ? STOCK_ACCENT.blueText : 'var(--td-text-md)', minWidth: 36 }}>
                <option value="=">=</option>
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
              </select>
              <input
                type="number"
                min={0}
                value={primaryQty}
                onChange={e => setPrimaryQty(e.target.value)}
                placeholder="cant."
                className="px-2 py-1.5 text-xs outline-none w-14 tabular-nums"
                style={{ background: 'transparent', color: primaryQty !== '' ? STOCK_ACCENT.blueText : 'var(--td-text-lo)' }}
              />
            </div>
          )}

          {/* Separador vs. */}
          {primaryStoreId && (
            <span className="text-[10px] font-black uppercase tracking-wider px-1" style={{ color: 'var(--td-text-lo)' }}>vs.</span>
          )}

          {/* Tienda de comparación */}
          {primaryStoreId && (
            <select
              value={compareStoreId}
              onChange={e => { setCompareStoreId(e.target.value ? Number(e.target.value) : ''); setCompareQty('') }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none"
              style={{ background: 'var(--td-input-bg)', border: `1px solid ${compareStoreId ? 'rgba(245,158,11,0.4)' : 'var(--td-input-border)'}`, color: compareStoreId ? '#D97706' : 'var(--td-text-lo)' }}>
              <option value="">Tienda…</option>
              {stores.filter(s => s.id !== primaryStoreId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          {/* Filtro de cantidad tienda comparación */}
          {compareStoreId && (
            <div className="flex items-center gap-1 rounded-lg overflow-hidden"
              style={{ border: `1px solid ${compareQty !== '' ? 'rgba(245,158,11,0.4)' : 'var(--td-input-border)'}`, background: 'var(--td-input-bg)' }}>
              <select
                value={compareOp}
                onChange={e => setCompareOp(e.target.value as '<' | '=' | '>')}
                className="px-2 py-1.5 text-xs font-black outline-none border-r"
                style={{ background: 'transparent', borderColor: 'var(--td-input-border)', color: compareQty !== '' ? '#D97706' : 'var(--td-text-md)', minWidth: 36 }}>
                <option value="=">=</option>
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
              </select>
              <input
                type="number"
                min={0}
                value={compareQty}
                onChange={e => setCompareQty(e.target.value)}
                placeholder="cant."
                className="px-2 py-1.5 text-xs outline-none w-14 tabular-nums"
                style={{ background: 'transparent', color: compareQty !== '' ? '#D97706' : 'var(--td-text-lo)' }}
              />
            </div>
          )}

          {/* Limpiar */}
          {primaryStoreId && (
            <button onClick={() => { setPrimaryStoreId(''); setCompareStoreId(''); setPrimaryQty(''); setCompareQty('') }}
              className="ml-auto p-1.5 rounded-lg transition-colors hover:bg-[var(--td-hover-bg)]" title="Quitar filtros">
              <X size={13} style={{ color: 'var(--td-text-lo)' }} />
            </button>
          )}
        </div>
      )}

      {/* Buscador */}
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
        {(isFetchingList || isFetchingCatalogs) && (
          <Loader2 size={16} className="absolute right-10 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--td-text-lo)' }} />
        )}
        {search && (
          <button onClick={() => { setSearch(''); setSelectedId(null); lastScanRef.current = null }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-[var(--td-hover-bg)] transition-colors"
            title="Limpiar">
            <X size={16} style={{ color: 'var(--td-text-lo)' }} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Lista de productos */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--td-text-lo)' }}>
              Productos
              {pagination && <span className="ml-1 font-normal">({pagination.total})</span>}
            </p>
            {pagination && pagination.last_page > 1 && (
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="px-2 py-1 rounded-lg text-xs font-bold disabled:opacity-30 transition-colors hover:bg-[var(--td-hover-bg)]"
                  style={{ color: 'var(--td-text-md)' }}>‹ Ant</button>
                <span className="text-[10px]" style={{ color: 'var(--td-text-lo)' }}>{page}/{pagination.last_page}</span>
                <button disabled={page >= pagination.last_page} onClick={() => setPage(p => p + 1)}
                  className="px-2 py-1 rounded-lg text-xs font-bold disabled:opacity-30 transition-colors hover:bg-[var(--td-hover-bg)]"
                  style={{ color: 'var(--td-text-md)' }}>Sig ›</button>
              </div>
            )}
          </div>

          {/* Lista de productos con stock embebido */}
          {products.length === 0 && !isFetchingList ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--td-text-lo)' }}>
              {debounced ? `Sin resultados para "${debounced}".` : 'Sin productos registrados.'}
            </p>
          ) : (
            products.map(item => (
              <ProductStockRow
                key={item.id}
                item={item}
                {...(myStoreId !== undefined ? { highlightStoreId: myStoreId } : {})}
                isSelected={selectedId?.type === 'product' && selectedId.id === item.id}
                onSelect={() => setSelectedId(s => s?.type === 'product' && s.id === item.id ? null : { type: 'product', id: item.id })}
              />
            ))
          )}

          {/* Preventas al final, filtradas por cupo de la tienda seleccionada */}
          {matchedCatalogs.map(cat => {
            const isSel = selectedId?.type === 'presale' && selectedId.id === cat.id
            return (
              <button key={`presale-${cat.id}`} onClick={() => setSelectedId({ type: 'presale', id: cat.id })}
                className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors"
                style={{ background: isSel ? 'var(--td-red-dim)' : 'var(--td-card-bg)', border: `1px solid ${isSel ? 'var(--td-red-brd)' : 'var(--td-card-border)'}` }}>
                <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                  style={{ background: 'var(--td-surface-muted)', border: '1px solid var(--td-panel-border)' }}>
                  {cat.image_url ? <img src={cat.image_url} alt={cat.product_name} className="w-full h-full object-cover" loading="lazy" /> : <PackageSearch size={18} style={{ color: 'var(--td-text-lo)' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--td-text-hi)' }}>
                    {cat.product_name}
                    <span className="ml-2 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider align-middle"
                      style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>Preventa</span>
                  </p>
                  <p className="text-[11px] font-mono truncate" style={{ color: 'var(--td-text-lo)' }}>
                    {cat.price_1 ? fmt(cat.price_1) : '—'}
                  </p>
                </div>
                <ChevronRight size={16} style={{ color: isSel ? 'var(--td-red)' : 'var(--td-text-lo)' }} className="shrink-0" />
              </button>
            )
          })}
        </div>

        {/* Panel de detalle al seleccionar un producto */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--td-text-lo)' }}>
            Detalle · contacto
          </p>
          {selectedProduct ? (
            <div className="rounded-3xl p-4 sticky top-4"
              style={{ background: 'var(--td-panel-bg)', border: '1px solid var(--td-panel-border)' }}>
              <p className="text-sm font-black mb-1" style={{ color: 'var(--td-text-hi)' }}>{selectedProduct.name}</p>
              <p className="text-[11px] font-mono mb-4" style={{ color: 'var(--td-text-lo)' }}>{selectedProduct.sku || 'Sin SKU'}</p>
              <StoreStockBreakdown productId={selectedProduct.id} showContact {...(myStoreId !== undefined ? { highlightStoreId: myStoreId } : {})} />
            </div>
          ) : selectedCatalog ? (
            <div className="rounded-3xl p-4 sticky top-4"
              style={{ background: 'var(--td-panel-bg)', border: '1px solid var(--td-panel-border)' }}>
              <p className="text-sm font-black mb-1" style={{ color: 'var(--td-text-hi)' }}>{selectedCatalog.product_name}</p>
              <p className="text-[11px] font-mono mb-4" style={{ color: 'var(--td-text-lo)' }}>
                Preventa · Anticipo: {selectedCatalog.advance_payment ? fmt(selectedCatalog.advance_payment) : '—'} · Total: {selectedCatalog.price_1 ? fmt(selectedCatalog.price_1) : '—'}
              </p>
              <StorePreSaleStockBreakdown catalog={selectedCatalog} {...(myStoreId !== undefined ? { highlightStoreId: myStoreId } : {})} />
            </div>
          ) : (
            <div className="rounded-3xl flex flex-col items-center justify-center gap-2 py-12 px-4 text-center sticky top-4"
              style={{ background: 'var(--td-panel-bg)', border: '1px solid var(--td-panel-border)' }}>
              <PackageSearch size={32} style={{ color: 'var(--td-divider)' }} />
              <p className="text-sm" style={{ color: 'var(--td-text-lo)' }}>
                Selecciona un producto para ver el desglose con botones de contacto.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
