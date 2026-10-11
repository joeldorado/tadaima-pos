import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Ban, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { getPreSaleCatalogCancelPreview, updatePreSaleCatalogStatus, type PreSaleCatalog } from '@tadaima/api'
import { Box, Cell, DELETE_RED, Table, type TableRow } from '@/components/common/DeletePreviewParts'
import { errorMessage, fmtMoney } from '@/lib/deletePreviewFormat'

const RED = DELETE_RED
const CONFIRM_WORD = 'CANCELAR'

interface CancelCatalogModalProps {
  catalog: PreSaleCatalog
  onClose: () => void
  /** El padre invalida catálogos y folios. */
  onCancelled: () => void
}

/**
 * "Cancelar catálogo" con vista previa (Joel 2026-10-09). Cancelar un
 * catálogo cancela TODOS sus folios abiertos; antes pasaba a ciegas. Ahora se
 * ve cuántos folios, cuánto dinero de anticipos hay (que NO se devuelve solo:
 * para devolverlo se cancela el folio desde Caja) y de qué tiendas son. Con
 * folios a cancelar hay que escribir CANCELAR; el PATCH lleva `expected` para
 * que no cancele si entraron folios o cobros mientras se revisaba.
 * Este modal ignora a propósito el "No mostrar de nuevo" del confirm viejo.
 */
export function CancelCatalogModal({ catalog, onClose, onCancelled }: CancelCatalogModalProps) {
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const preview = useQuery({
    queryKey: ['catalog-cancel-preview', catalog.id],
    queryFn: () => getPreSaleCatalogCancelPreview(catalog.id),
    staleTime: 0,
    gcTime: 0,
  })
  const data = preview.data
  const blocked = (data?.blockers.length ?? 0) > 0
  const toCancel = data?.folios.to_cancel ?? 0
  const needsWord = toCancel > 0
  const hasMoney = (data?.money.anticipos_cobrados ?? 0) > 0
  const canSubmit = !!data && !blocked && (!needsWord || confirm.trim().toUpperCase() === CONFIRM_WORD) && !busy

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const handleCancel = async () => {
    if (!canSubmit || !data) return
    setBusy(true)
    try {
      await updatePreSaleCatalogStatus(catalog.id, { status: 'cancelled', expected: data.counts })
      toast.success(toCancel > 0
        ? `"${catalog.product_name}" cancelado · ${toCancel} folio(s) cancelado(s)`
        : `"${catalog.product_name}" cancelado`)
      onCancelled()
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'No se pudo cancelar el catálogo.'))
      void preview.refetch()
    } finally {
      setBusy(false)
    }
  }

  const statusRows: string[][] = data
    ? [
        ['Pendientes', String(data.folios.by_status.pending), 'Se cancelan'],
        ['Listos para liquidar', String(data.folios.by_status.ready), 'Se cancelan'],
        ['Entregados', String(data.folios.by_status.delivered), 'No se tocan'],
        ['Vencidos', String(data.folios.by_status.expired), 'No se tocan'],
        ['Ya cancelados', String(data.folios.by_status.cancelled), '—'],
      ].filter(r => r[1] !== '0')
    : []
  const storeRows: TableRow[] = data
    ? data.stores.map(s => ({
        cells: [s.is_mine ? `${s.store_name} · tu tienda` : s.store_name, String(s.folios_to_cancel), fmtMoney(s.anticipos)],
        highlight: s.is_mine,
      }))
    : []

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => { if (!busy) onClose() }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-catalog-title"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-[28px] flex flex-col"
        style={{ background: 'var(--td-popup-bg)', border: `1px solid ${RED}66`, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ background: 'rgba(239,68,68,0.14)', borderBottom: `1px solid ${RED}55` }}>
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle size={22} style={{ color: RED }} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: RED }}>Cancelar catálogo · no se puede deshacer</p>
              <h2 id="cancel-catalog-title" className="text-base font-black truncate" style={{ color: 'var(--td-text-hi)' }}>{catalog.product_name}</h2>
            </div>
          </div>
          <button onClick={() => { if (!busy) onClose() }} aria-label="Cerrar" className="p-2 rounded-xl hover:bg-white/10">
            <X size={18} style={{ color: 'var(--td-text-lo)' }} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          <p className="font-bold" style={{ color: '#fca5a5' }}>
            Al cancelar el catálogo se cancelan TODOS sus folios pendientes y listos, de todas las tiendas. Los folios ya entregados no se tocan.
            {hasMoney && <> El dinero de anticipos <span style={{ color: RED }}>NO se devuelve solo</span>: para devolverlo, cancela cada folio desde Caja.</>}
          </p>

          {preview.isLoading && <p className="flex items-center gap-2" style={{ color: 'var(--td-text-lo)' }}><Loader2 size={14} className="animate-spin" /> Revisando folios y anticipos…</p>}
          {preview.isError && <p style={{ color: RED }}>No se pudo cargar la vista previa. Cierra e intenta de nuevo.</p>}

          {data && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Cell label="Folios que se cancelan" value={String(data.folios.to_cancel)} tone={data.folios.to_cancel > 0 ? 'danger' : 'muted'} />
                <Cell label="Anticipos cobrados" value={fmtMoney(data.money.anticipos_cobrados)} tone={hasMoney ? 'danger' : 'muted'} />
                <Cell label="Por cobrar (se pierde)" value={fmtMoney(data.money.por_cobrar)} tone="muted" />
                <Cell label="Unidades reservadas" value={String(data.units.reserved)} />
              </div>

              {data.blockers.length > 0 && (
                <Box tone="block" title="No se puede cancelar">
                  {data.blockers.map((b, i) => <li key={i}>{b}</li>)}
                </Box>
              )}
              {data.warnings.length > 0 && (
                <Box tone="warn" title="Antes de cancelar, toma en cuenta">
                  {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </Box>
              )}

              <Table title={`Folios por estado (${data.folios.total})`} head={['Estado', 'Folios', 'Qué pasa']} rows={statusRows} empty="Este catálogo no tiene folios." />
              <Table title="Folios que se cancelan, por tienda" head={['Tienda', 'Folios', 'Anticipos cobrados']} rows={storeRows} empty="Nada que cancelar." />

              {!blocked && needsWord && (
                <label className="block pt-1">
                  <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: RED }}>Escribe {CONFIRM_WORD} para confirmar</span>
                  <input
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder={CONFIRM_WORD}
                    autoComplete="off"
                    autoFocus
                    disabled={busy}
                    className="mt-1 w-full rounded-xl px-3 py-2 text-sm font-black tracking-widest"
                    style={{ background: 'var(--td-input-bg)', border: `1px solid ${RED}66`, color: 'var(--td-input-text)' }}
                  />
                </label>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { if (!busy) onClose() }} className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)', color: 'var(--td-text-md)' }}>
              No, regresar
            </button>
            <button
              onClick={() => void handleCancel()}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: RED, color: '#fff', border: `1px solid ${RED}` }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              {toCancel > 0 ? `Cancelar catálogo y ${toCancel} folio(s)` : 'Cancelar catálogo'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
