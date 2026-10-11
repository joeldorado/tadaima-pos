import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { deleteManga, deleteProduct, forceDeleteProduct, getProductDeletePreview } from '@tadaima/api'
import { Box, Cell, DELETE_RED, Table, type TableRow } from '@/components/common/DeletePreviewParts'
import { errorMessage, fmtQty } from '@/lib/deletePreviewFormat'
import { resolveDeleteGuards, type DeleteKind, type DeleteMode } from '@/lib/deletePreviewGuards'
import { BUSINESS_TZ } from '@/lib/date'

const RED = DELETE_RED

interface DeleteProductModalProps {
  product: { id: number; name: string; sku: string | null }
  kind: DeleteKind
  /** Solo admin ve "Borrar TODO" (el API también lo exige: adminOnlyError en /force). */
  isAdmin?: boolean
  onClose: () => void
  /** El padre invalida sus queries y muestra el toast. */
  onDeleted: (mode: DeleteMode) => void
}

/** `sold_at` llega como "YYYY-MM-DD HH:MM:SS" en UTC (sin zona). */
const fmtLastSold = (raw: string | null): string => {
  if (!raw) return 'Nunca'
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('es-MX', { dateStyle: 'medium', timeZone: BUSINESS_TZ })
}

/**
 * "Eliminar producto / tomo" con vista previa (Joel 2026-10-09): antes de
 * confirmar enseña el stock por tienda (Exhibición/Bodega, la del usuario
 * primero), ventas, apartados, preventas, traslados, paquetes y promos, con
 * los avisos y bloqueos que calcula el backend. Con stock hay que marcar la
 * casilla; "Borrar TODO" (admin) y los tomos exigen tipear el nombre. El
 * DELETE lleva `expected` para que no borre si el stock cambió mientras tanto.
 */
export function DeleteProductModal({ product, kind, isAdmin = false, onClose, onDeleted }: DeleteProductModalProps) {
  const [mode, setMode] = useState<DeleteMode>('soft')
  const [ackStock, setAckStock] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)

  const preview = useQuery({
    queryKey: ['product-delete-preview', product.id],
    queryFn: () => getProductDeletePreview(product.id),
    staleTime: 0,
    gcTime: 0,
  })
  const data = preview.data
  const isForce = mode === 'force'
  const canForce = kind === 'product' && isAdmin
  const noun = kind === 'manga' ? 'tomo' : 'producto'
  const guards = resolveDeleteGuards({ preview: data, mode, kind, ackStock, typed, name: product.name, busy: deleting })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !deleting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleting, onClose])

  const handleDelete = async () => {
    if (!guards.canSubmit || !data) return
    setDeleting(true)
    try {
      const opts = { expected: data.counts }
      if (kind === 'manga') await deleteManga(product.id, opts)
      else if (isForce) await forceDeleteProduct(product.id, opts)
      else await deleteProduct(product.id, opts)
      onDeleted(mode)
    } catch (err: unknown) {
      // El mensaje del backend (apartados, paquete, "cambió mientras revisabas") llega tal cual.
      toast.error(errorMessage(err, `No se pudo eliminar el ${noun}.`))
      void preview.refetch()
    } finally {
      setDeleting(false)
    }
  }

  const stockRows: TableRow[] = data
    ? [
        ...data.stock.stores.map(s => ({
          cells: [s.is_mine ? `${s.store_name} · tu tienda` : s.store_name, fmtQty(s.exhibicion), fmtQty(s.bodega), fmtQty(s.total)],
          highlight: s.is_mine,
        })),
        ...(data.stock.central > 0 ? [{ cells: ['Almacén central', '—', '—', fmtQty(data.stock.central)] }] : []),
      ]
    : []
  const hasStock = (data?.stock.total ?? 0) > 0
  const showForceHint = !!data && !isForce && canForce && guards.blockers.length > 0 && data.force_blockers.length === 0

  // Portal a <body>: los modales de producto/tomo usan backdrop-filter, que
  // recortaría un position:fixed anidado (mismo motivo que en Cortes).
  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => { if (!deleting) onClose() }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-product-title"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-[28px] flex flex-col"
        style={{ background: 'var(--td-popup-bg)', border: `1px solid ${RED}${isForce ? 'cc' : '66'}`, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ background: 'rgba(239,68,68,0.14)', borderBottom: `1px solid ${RED}55` }}>
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle size={22} style={{ color: RED }} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: RED }}>
                {isForce ? 'Borrado total · no se puede deshacer' : `Eliminar ${noun} · no se puede deshacer`}
              </p>
              <h2 id="delete-product-title" className="text-base font-black truncate" style={{ color: 'var(--td-text-hi)' }}>
                {product.name}
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--td-text-lo)' }}>SKU: {product.sku || '—'}</p>
            </div>
          </div>
          <button onClick={() => { if (!deleting) onClose() }} aria-label="Cerrar" className="p-2 rounded-xl hover:bg-white/10">
            <X size={18} style={{ color: 'var(--td-text-lo)' }} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          {hasStock ? (
            <p className="font-bold" style={{ color: '#fca5a5' }}>
              Este {noun} <span style={{ color: RED }}>TIENE STOCK</span>: {data ? fmtQty(data.stock.total) : ''} pieza(s) que se pierden al eliminarlo, sin movimiento de inventario.
              Revisa en qué tiendas está antes de confirmar.
            </p>
          ) : (
            <p className="font-bold" style={{ color: '#fca5a5' }}>
              Se elimina el {noun} con sus imágenes, inventario y precios. Sus ventas NO se tocan: quedan en historial y reportes con el nombre marcado como “(eliminado)”.
            </p>
          )}

          {preview.isLoading && <p className="flex items-center gap-2" style={{ color: 'var(--td-text-lo)' }}><Loader2 size={14} className="animate-spin" /> Revisando stock, ventas y apartados…</p>}
          {preview.isError && <p style={{ color: RED }}>No se pudo cargar la vista previa. Cierra e intenta de nuevo.</p>}

          {data && (
            <>
              <Table
                title={`Stock por tienda · ${fmtQty(data.stock.total)} pieza(s) en total`}
                head={['Tienda', 'Exhibición', 'Bodega', 'Total']}
                rows={stockRows}
                empty="Sin existencias en ninguna tienda."
              />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <Cell label="Ventas (se conservan)" value={data.sales.count > 0 ? `${data.sales.count} · última ${fmtLastSold(data.sales.last_sold_at)}` : 'Sin ventas'} />
                <Cell label="Apartados" value={data.layaways.total > 0 ? `${data.layaways.total} (${data.layaways.open} abierto(s))` : 'Ninguno'} tone={data.layaways.total > 0 ? 'danger' : 'muted'} />
                <Cell label="Preventas" value={data.presales.catalogs > 0 || data.presales.open_items > 0 ? `${data.presales.catalogs} catálogo(s) · ${data.presales.open_items} artículo(s)` : 'Ninguna'} tone={data.presales.open_items > 0 ? 'danger' : undefined} />
                <Cell label="Traslados pendientes" value={data.transfers.pending > 0 ? String(data.transfers.pending) : 'Ninguno'} tone={data.transfers.pending > 0 ? 'danger' : 'muted'} />
                <Cell label="Promociones" value={data.promos.count > 0 ? String(data.promos.count) : 'Ninguna'} tone={data.promos.count > 0 ? undefined : 'muted'} />
                <Cell label="Movimientos de inventario" value={data.stock.movements_count > 0 ? `${data.stock.movements_count} (se borran)` : 'Ninguno'} tone="muted" />
              </div>

              {guards.blockers.length > 0 && (
                <Box tone="block" title={isForce ? 'No se puede borrar' : 'No se puede eliminar'}>
                  {guards.blockers.map((b, i) => <li key={i}>{b}</li>)}
                  {showForceHint && <li>Si de verdad quieres eliminarlo junto con sus apartados, cambia a «Borrar TODO» (solo admin).</li>}
                </Box>
              )}
              {guards.warnings.length > 0 && (
                <Box tone="warn" title="Antes de eliminar, toma en cuenta">
                  {guards.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </Box>
              )}

              {canForce && (
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer" style={{ background: !isForce ? 'rgba(245,158,11,0.10)' : 'var(--td-card-bg)', border: `1px solid ${!isForce ? 'rgba(245,158,11,0.35)' : 'var(--td-card-border)'}` }}>
                    <input type="radio" name="deleteMode" checked={!isForce} disabled={deleting} onChange={() => { setMode('soft'); setTyped('') }} className="mt-0.5 accent-amber-500" />
                    <div>
                      <p className="font-black text-sm" style={{ color: 'var(--td-text-hi)' }}>Solo el producto</p>
                      <p className="text-[11px]" style={{ color: 'var(--td-text-md)' }}>Elimina el producto, su inventario y precios. Las ventas quedan en historial. Si tiene apartados, no se puede.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer" style={{ background: isForce ? 'rgba(239,68,68,0.10)' : 'var(--td-card-bg)', border: `1px solid ${isForce ? 'rgba(239,68,68,0.45)' : 'var(--td-card-border)'}` }}>
                    <input type="radio" name="deleteMode" checked={isForce} disabled={deleting} onChange={() => setMode('force')} className="mt-0.5 accent-red-500" />
                    <div>
                      <p className="font-black text-sm" style={{ color: 'var(--td-text-hi)' }}>⚠️ Borrar TODO (también apartados)</p>
                      <p className="text-[11px]" style={{ color: 'var(--td-text-md)' }}>Borra el producto Y sus apartados con sus abonos. Las ventas se conservan. Úsalo solo si «Solo el producto» no se puede por apartados.</p>
                    </div>
                  </label>
                </div>
              )}

              {guards.blockers.length === 0 && guards.needsStockAck && (
                <label className="flex items-start gap-2 text-xs font-bold" style={{ color: '#fca5a5' }}>
                  <input type="checkbox" checked={ackStock} disabled={deleting} onChange={e => setAckStock(e.target.checked)} className="mt-0.5 accent-red-500" />
                  Entiendo que se pierden {fmtQty(data.stock.total)} pieza(s) de inventario y que no se puede deshacer.
                </label>
              )}
              {guards.blockers.length === 0 && guards.needsTypedName && (
                <label className="block pt-1">
                  <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: RED }}>Para confirmar, escribe el nombre: {product.name}</span>
                  <input
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    placeholder={product.name}
                    autoComplete="off"
                    disabled={deleting}
                    className="mt-1 w-full rounded-xl px-3 py-2 text-sm font-bold"
                    style={{ background: 'var(--td-input-bg)', border: `1px solid ${guards.typedOk ? '#10b981' : `${RED}66`}`, color: guards.typedOk ? '#10b981' : 'var(--td-input-text)' }}
                  />
                </label>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { if (!deleting) onClose() }} className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)', color: 'var(--td-text-md)' }}>
              Cancelar
            </button>
            <button
              onClick={() => void handleDelete()}
              disabled={!guards.canSubmit}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: isForce ? '#b91c1c' : RED, color: '#fff', border: `1px solid ${RED}` }}
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {isForce ? 'Borrar TODO' : hasStock ? 'Eliminar de todos modos' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
