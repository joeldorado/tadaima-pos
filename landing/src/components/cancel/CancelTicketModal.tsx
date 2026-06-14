import { useState, useMemo } from 'react'
import { X, AlertTriangle, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  cancelSale, cancelPreSaleOrder,
  type SaleDetail, type PreSaleOrder,
  type CancellationReason,
} from '@tadaima/api'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n || 0)

const REASON_OPTIONS: Array<{ code: CancellationReason; label: string }> = [
  { code: 'cliente_devuelve', label: 'Cliente devuelve / cambia de opinión' },
  { code: 'error_cajero',     label: 'Error del cajero' },
  { code: 'dañado',           label: 'Producto dañado' },
  { code: 'no_llego',         label: 'Mercancía no llegó (preventa)' },
  { code: 'otro',             label: 'Otro motivo' },
]

interface BaseProps {
  onClose: () => void
  onSuccess: () => void
  /** Sesión activa donde se registra la salida de caja. */
  cashSessionId?: number
}

interface SaleProps extends BaseProps { kind: 'sale'; sale: SaleDetail }
interface PreSaleProps extends BaseProps { kind: 'presale'; order: PreSaleOrder }
type Props = SaleProps | PreSaleProps

/**
 * ADR-016 Fase 3 — Modal para cancelar venta o preventa.
 *
 * Sale: checkbox por item + qty editable + motivo + confirma.
 * Preventa: acción única determinística por estado (liquidada → rollback de la
 * liquidación; solo anticipo → cancelación completa) + motivo. Sin elección.
 */
export function CancelTicketModal(props: Props) {
  const [reasonCode, setReasonCode] = useState<CancellationReason>('cliente_devuelve')
  const [reasonText, setReasonText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (props.kind === 'sale') {
    return <SaleCancelBody {...props} reasonCode={reasonCode} setReasonCode={setReasonCode} reasonText={reasonText} setReasonText={setReasonText} submitting={submitting} setSubmitting={setSubmitting} />
  }
  return <PreSaleCancelBody {...props} reasonCode={reasonCode} setReasonCode={setReasonCode} reasonText={reasonText} setReasonText={setReasonText} submitting={submitting} setSubmitting={setSubmitting} />
}

interface SaleBodyProps extends SaleProps {
  reasonCode: CancellationReason
  setReasonCode: (r: CancellationReason) => void
  reasonText: string
  setReasonText: (t: string) => void
  submitting: boolean
  setSubmitting: (s: boolean) => void
}

function SaleCancelBody({ sale, onClose, onSuccess, cashSessionId, reasonCode, setReasonCode, reasonText, setReasonText, submitting, setSubmitting }: SaleBodyProps) {
  // Mapa de qty seleccionada por sale_item_id. Default: full qty original.
  const initial: Record<number, number> = useMemo(() => {
    const map: Record<number, number> = {}
    ;(sale.items ?? []).forEach(it => { map[it.id!] = it.quantity })
    return map
  }, [sale.items])
  const [qtyMap, setQtyMap] = useState<Record<number, number>>(initial)
  // selección: si la qty del item == 0, queda excluido. Track checkboxes.
  const [selected, setSelected] = useState<Record<number, boolean>>(() => {
    const s: Record<number, boolean> = {}
    ;(sale.items ?? []).forEach(it => { s[it.id!] = true })
    return s
  })

  const toCancel = useMemo(() =>
    (sale.items ?? []).filter(it => selected[it.id!] && (qtyMap[it.id!] ?? 0) > 0),
    [sale.items, selected, qtyMap]
  )
  const refundEstimate = useMemo(() =>
    toCancel.reduce((s, it) => s + (qtyMap[it.id!] ?? 0) * it.price, 0),
    [toCancel, qtyMap]
  )
  const isFullCancel = useMemo(() =>
    toCancel.length === (sale.items ?? []).length &&
    toCancel.every(it => (qtyMap[it.id!] ?? 0) >= it.quantity),
    [toCancel, sale.items, qtyMap]
  )

  const handleSubmit = async () => {
    if (toCancel.length === 0) { toast.error('Selecciona al menos un artículo a cancelar.'); return }
    setSubmitting(true)
    try {
      await cancelSale(sale.id!, {
        items: isFullCancel ? undefined : toCancel.map(it => ({ sale_item_id: it.id!, quantity: qtyMap[it.id!]! })),
        reason_code: reasonCode,
        ...(reasonText.trim() ? { reason_text: reasonText.trim() } : {}),
        ...(cashSessionId ? { cash_session_id: cashSessionId } : {}),
      })
      toast.success(`Cancelación registrada · ${fmt(refundEstimate)} reversados`)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message) : 'Error al cancelar'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Shell title={`Cancelar Venta #${sale.id}`} onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: 'var(--td-text-lo)' }}>
        Selecciona los artículos a cancelar. El stock regresa al inventario y se genera una <strong>salida de caja</strong> en la sesión actual.
      </p>

      {/* Items */}
      <div className="rounded-2xl overflow-hidden mb-4" style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)' }}>
        {(sale.items ?? []).map((it, idx) => {
          const isSel = !!selected[it.id!]
          const qty = qtyMap[it.id!] ?? 0
          return (
            <div key={it.id} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: idx > 0 ? '1px solid var(--td-divider)' : 'none' }}>
              <input
                type="checkbox"
                checked={isSel}
                onChange={e => setSelected(s => ({ ...s, [it.id!]: e.target.checked }))}
                className="w-4 h-4 accent-red-500"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: 'var(--td-text-hi)' }}>{it.product?.name ?? `#${it.product_id}`}</p>
                <p className="text-[10px]" style={{ color: 'var(--td-text-lo)' }}>SKU {it.product?.sku ?? '—'} · {fmt(it.price)} c/u · original ×{it.quantity}</p>
              </div>
              {isSel && (
                <input
                  type="number" min="0" step="1" max={it.quantity}
                  value={qty}
                  onChange={e => {
                    const v = Math.min(it.quantity, Math.max(0, parseFloat(e.target.value) || 0))
                    setQtyMap(m => ({ ...m, [it.id!]: v }))
                  }}
                  className="w-16 text-center rounded-lg py-1 text-sm font-bold"
                  style={{ background: 'var(--td-input-bg)', border: '1px solid var(--td-input-border)', color: 'var(--td-input-text)' }}
                />
              )}
              <span className="text-sm font-black tabular-nums w-20 text-right" style={{ color: isSel && qty > 0 ? '#f87171' : 'var(--td-text-lo)' }}>
                {fmt((qtyMap[it.id!] ?? 0) * it.price)}
              </span>
            </div>
          )
        })}
      </div>

      <ReasonPicker code={reasonCode} setCode={setReasonCode} text={reasonText} setText={setReasonText} />

      {/* Footer */}
      <Footer
        refundEstimate={refundEstimate}
        isFullCancel={isFullCancel}
        submitting={submitting}
        onClose={onClose}
        onSubmit={handleSubmit}
        disabled={toCancel.length === 0}
      />
    </Shell>
  )
}

interface PreSaleBodyProps extends PreSaleProps {
  reasonCode: CancellationReason
  setReasonCode: (r: CancellationReason) => void
  reasonText: string
  setReasonText: (t: string) => void
  submitting: boolean
  setSubmitting: (s: boolean) => void
}

function PreSaleCancelBody({ order, onClose, onSuccess, cashSessionId, reasonCode, setReasonCode, reasonText, setReasonText, submitting, setSubmitting }: PreSaleBodyProps) {
  const isDelivered = order.status === 'delivered'
  // Modo determinístico (Joel 2026-06-13): ya NO se le da a elegir al cajero.
  //  - Liquidada (delivered) → SOLO rollback: el folio vuelve a "Listo ·
  //    Liquidar", el stock entregado regresa y se reversa SOLO el cobro de la
  //    liquidación (la venta de ese día). El anticipo se mantiene.
  //  - Solo anticipo (no delivered) → cancelación completa (regresa anticipo +
  //    stock), que ya funcionaba bien.
  const mode: 'full' | 'liquidation_rollback' = isDelivered ? 'liquidation_rollback' : 'full'

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const result = await cancelPreSaleOrder(order.id, {
        mode,
        reason_code: reasonCode,
        ...(reasonText.trim() ? { reason_text: reasonText.trim() } : {}),
        ...(cashSessionId ? { cash_session_id: cashSessionId } : {}),
      })
      toast.success(`Cancelación registrada · ${fmt(result.cancellation.amount_refunded)} reversados`)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message) : 'Error al cancelar'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const refundEstimate = mode === 'full'
    ? (order.paid_amount ?? 0)
    : (order.payments?.[order.payments.length - 1]?.amount ?? 0)

  return (
    <Shell title={`Cancelar Preventa ${order.code}`} onClose={onClose}>
      {/* Explicación de la acción única (sin elección de modo). */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-2xl mb-4"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)' }}
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.16)', color: '#f87171' }}>
          {isDelivered ? <RotateCcw size={16} /> : <XCircle size={18} />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-black" style={{ color: '#f87171' }}>
            {isDelivered ? 'Revertir liquidación' : 'Cancelar folio completo'}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--td-text-lo)' }}>
            {isDelivered
              ? 'Se cancela SOLO la venta de hoy: el folio vuelve a "Listo · Liquidar", el stock entregado regresa al inventario y se reversa el cobro de la liquidación. El anticipo se mantiene.'
              : 'El folio queda CANCELADO. El anticipo se reversa como salida de caja y el stock regresa al inventario.'}
          </p>
        </div>
      </div>

      <ReasonPicker code={reasonCode} setCode={setReasonCode} text={reasonText} setText={setReasonText} />

      <Footer
        refundEstimate={refundEstimate}
        isFullCancel={mode === 'full'}
        submitting={submitting}
        onClose={onClose}
        onSubmit={handleSubmit}
        disabled={false}
      />
    </Shell>
  )
}

// ── shared sub-components ────────────────────────────────────────────────────

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-hidden rounded-[28px] flex flex-col"
        style={{ background: 'var(--td-popup-bg)', border: '1px solid var(--td-popup-border)', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b" style={{ borderColor: 'var(--td-divider)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.30)' }}>
              <AlertTriangle size={16} style={{ color: '#f87171' }} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#f87171' }}>Cancelación</p>
              <h2 className="text-base font-black" style={{ color: 'var(--td-text-hi)' }}>{title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
            <X size={18} style={{ color: 'var(--td-text-lo)' }} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function ReasonPicker({ code, setCode, text, setText }: { code: CancellationReason; setCode: (r: CancellationReason) => void; text: string; setText: (t: string) => void }) {
  return (
    <>
      <label className="block mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--td-text-lo)' }}>Motivo</span>
        <select
          value={code}
          onChange={e => setCode(e.target.value as CancellationReason)}
          className="mt-1 w-full rounded-xl px-3 py-2 text-sm font-bold"
          style={{ background: 'var(--td-input-bg)', border: '1px solid var(--td-input-border)', color: 'var(--td-input-text)' }}
        >
          {REASON_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
        </select>
      </label>
      <label className="block mb-4">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--td-text-lo)' }}>Notas (opcional)</span>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Detalle adicional…"
          className="mt-1 w-full rounded-xl px-3 py-2 text-sm resize-none"
          style={{ background: 'var(--td-input-bg)', border: '1px solid var(--td-input-border)', color: 'var(--td-input-text)' }}
        />
      </label>
    </>
  )
}

function Footer({ refundEstimate, isFullCancel, submitting, onClose, onSubmit, disabled }: { refundEstimate: number; isFullCancel: boolean; submitting: boolean; onClose: () => void; onSubmit: () => void; disabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: 'var(--td-divider)' }}>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--td-text-lo)' }}>Salida estimada</p>
        <p className="text-xl font-black" style={{ color: '#f87171' }}>{fmt(refundEstimate)}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-sm font-bold"
          style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)', color: 'var(--td-text-md)' }}
        >Volver</button>
        <button
          onClick={onSubmit}
          disabled={submitting || disabled}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: '#ef4444', color: '#fff', border: '1px solid rgba(239,68,68,0.6)' }}
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={15} />}
          {isFullCancel ? 'Cancelar todo' : 'Confirmar cancelación'}
        </button>
      </div>
    </div>
  )
}
