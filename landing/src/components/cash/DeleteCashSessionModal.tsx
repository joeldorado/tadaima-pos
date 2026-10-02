import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { deleteCashSession, getCashSessionDeletePreview, type CashSessionDeletePreview } from '@tadaima/api'
import { invalidateAfterSale } from '@/lib/optimisticSale'
import { BUSINESS_TZ } from '@/lib/date'

const CONFIRM_WORD = 'BORRAR'
const RED = '#ef4444'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0)

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: BUSINESS_TZ }) : '—'

interface DeleteCashSessionModalProps {
  sessionId: number
  onClose: () => void
  onDeleted?: () => void
}

/**
 * "Borrar corte" (solo admin, 2026-10-01): enseña TODO lo que se borra antes de
 * confirmar — ventas, stock que regresa, folios de preventa, movimientos e
 * insumos — y exige escribir BORRAR. Definitivo: el respaldo queda en el log.
 */
export function DeleteCashSessionModal({ sessionId, onClose, onDeleted }: DeleteCashSessionModalProps) {
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState('')
  const [ackCross, setAckCross] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const preview = useQuery({
    queryKey: ['cash-session-delete-preview', sessionId],
    queryFn: () => getCashSessionDeletePreview(sessionId),
    staleTime: 0,
    gcTime: 0,
  })
  const data = preview.data
  const blocked = (data?.blockers.length ?? 0) > 0
  const needsAck = (data?.cross.length ?? 0) > 0
  const canDelete = !!data && !blocked && confirm.trim() === CONFIRM_WORD && (!needsAck || ackCross) && !deleting

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !deleting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleting, onClose])

  const handleDelete = async () => {
    if (!canDelete || !data) return
    setDeleting(true)
    try {
      await deleteCashSession(sessionId, {
        confirm: CONFIRM_WORD,
        expected: data.counts,
        acknowledge_cross: ackCross,
      })
      toast.success(`Corte #${sessionId} borrado`)
      invalidateAfterSale(queryClient, { presale: true })
      queryClient.removeQueries({ queryKey: ['cash-session-detail', sessionId] })
      void queryClient.invalidateQueries({ queryKey: ['cash'] })
      void queryClient.invalidateQueries({ queryKey: ['supplies'] })
      onDeleted?.()
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo borrar el corte'
      toast.error(msg)
      // Si cambió el corte, refrescar lo que se ve para que coincida.
      void preview.refetch()
    } finally {
      setDeleting(false)
    }
  }

  // Portal a <body>: el panel de Cortes usa backdrop-filter, que vuelve
  // "contenedor" a los position:fixed de adentro y recortaría este modal.
  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => { if (!deleting) onClose() }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-session-title"
        className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-[28px] flex flex-col"
        style={{ background: 'var(--td-popup-bg)', border: `1px solid ${RED}66`, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ background: 'rgba(239,68,68,0.14)', borderBottom: `1px solid ${RED}55` }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} style={{ color: RED }} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: RED }}>Borrado definitivo</p>
              <h2 id="delete-session-title" className="text-base font-black" style={{ color: 'var(--td-text-hi)' }}>
                Borrar corte #{sessionId}{data ? ` · ${data.session.cashier ?? '—'} · ${data.session.store ?? '—'}` : ''}
              </h2>
            </div>
          </div>
          <button onClick={() => { if (!deleting) onClose() }} aria-label="Cerrar" className="p-2 rounded-xl hover:bg-white/10">
            <X size={18} style={{ color: 'var(--td-text-lo)' }} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          <p className="font-bold" style={{ color: '#fca5a5' }}>
            Se borra el corte y TODO lo que conecta: sus ventas, los cobros de preventa, los movimientos de caja y los insumos pagados de esa caja.
            No se puede deshacer: queda el registro completo en el log del sistema (para auditoría, no se restaura). El stock vendido regresa al inventario.
          </p>

          {preview.isLoading && <p className="flex items-center gap-2" style={{ color: 'var(--td-text-lo)' }}><Loader2 size={14} className="animate-spin" /> Revisando qué se borraría…</p>}
          {preview.isError && <p style={{ color: RED }}>No se pudo cargar la vista previa.</p>}

          {data && (
            <>
              <Summary data={data} />

              {data.blockers.length > 0 && (
                <Box tone="block" title="No se puede borrar todavía">
                  {data.blockers.map((b, i) => <li key={i}>{b}</li>)}
                </Box>
              )}
              {data.cross.length > 0 && (
                <Box tone="block" title="Esto mueve OTROS cortes">
                  {data.cross.map((c, i) => <li key={i}>{c}</li>)}
                </Box>
              )}
              {data.warnings.length > 0 && (
                <Box tone="warn" title="Avisos">
                  {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </Box>
              )}

              <Table title={`Ventas que se borran (${data.sales.length})`} empty="Sin ventas"
                head={['#', 'Hora', 'Cajero', 'Estado', 'Art.', 'Total']}
                rows={data.sales.map(s => [`#${s.id}`, fmtDate(s.sold_at), s.cashier ?? '—', s.status, String(s.items), fmt(s.total)])} />
              <Table title={`Stock que regresa al inventario (${data.stock.length})`} empty="Nada que regresar"
                head={['Venta', 'Producto', 'Cantidad', 'Almacén']}
                rows={data.stock.map(r => [`#${r.sale_id}`, r.product ?? `#${r.product_id}`, String(r.quantity), r.warehouse ?? '—'])} />
              <Table title={`Folios de preventa que se borran (${data.presales.length})`} empty="Sin preventas"
                head={['Folio', 'Cliente', 'Estado', 'Cobrado en este corte']}
                rows={data.presales.map(p => [p.code, p.customer ?? '—', p.status, fmt(p.paid)])} />
              <Table title={`Movimientos de caja (${data.movements.length})`} empty="Sin movimientos"
                head={['Tipo', 'Descripción', 'Monto']}
                rows={data.movements.map(m => [m.type, m.description ?? '—', fmt(m.amount)])} />
              <Table title={`Insumos pagados de esta caja (${data.supplies.length})`} empty="Sin insumos"
                head={['Insumo', 'Cantidad', 'Monto']}
                rows={data.supplies.map(s => [s.supply ?? '—', String(s.quantity), fmt(s.amount)])} />

              {!blocked && needsAck && (
                <label className="flex items-start gap-2 text-xs font-bold" style={{ color: '#fca5a5' }}>
                  <input type="checkbox" checked={ackCross} onChange={e => setAckCross(e.target.checked)} className="mt-0.5 accent-red-500" />
                  Entiendo que este borrado cambia otros cortes.
                </label>
              )}
              {!blocked && (
                <label className="block pt-2">
                  <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: RED }}>
                    Escribe {CONFIRM_WORD} para confirmar
                  </span>
                  <input
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder={CONFIRM_WORD}
                    autoComplete="off"
                    autoFocus
                    className="mt-1 w-full rounded-xl px-3 py-2 text-sm font-black tracking-widest"
                    style={{ background: 'var(--td-input-bg)', border: `1px solid ${RED}66`, color: 'var(--td-input-text)' }}
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
              disabled={!canDelete}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: RED, color: '#fff', border: `1px solid ${RED}` }}
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Borrar corte definitivamente
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Summary({ data }: { data: CashSessionDeletePreview }) {
  const s = data.session
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      <Cell label="Estado" value={s.status === 'open' ? 'Abierto' : 'Cerrado'} />
      <Cell label="Abrió" value={fmtDate(s.opened_at)} />
      <Cell label="Abrió con" value={fmt(s.opening_cash)} />
      <Cell label="Cerró con" value={s.closing_cash != null ? fmt(s.closing_cash) : '—'} />
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)' }}>
      <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--td-text-lo)' }}>{label}</p>
      <p className="font-black truncate" style={{ color: 'var(--td-text-hi)' }}>{value}</p>
    </div>
  )
}

function Box({ tone, title, children }: { tone: 'warn' | 'block'; title: string; children: ReactNode }) {
  const color = tone === 'block' ? RED : '#f59e0b'
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: `${color}14`, border: `1px solid ${color}55` }}>
      <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color }}>{title}</p>
      <ul className="list-disc pl-4 space-y-1 text-xs" style={{ color: 'var(--td-text-md)' }}>{children}</ul>
    </div>
  )
}

function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: string[][]; empty: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--td-text-lo)' }}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--td-text-ghost)' }}>{empty}</p>
      ) : (
        <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--td-card-border)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--td-card-bg)' }}>
                {head.map(h => <th key={h} className="text-left px-3 py-2 font-black uppercase tracking-wider text-[9px]" style={{ color: 'var(--td-text-lo)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--td-divider)' }}>
                  {r.map((c, j) => <td key={j} className="px-3 py-1.5" style={{ color: 'var(--td-text-md)' }}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
