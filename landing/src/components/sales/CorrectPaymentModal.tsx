import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { correctSalePayments, type SaleDetail } from '@tadaima/api'
import { useTerminalsQuery } from '@/hooks/queries/useTerminals'
import { invalidateAfterSale } from '@/lib/optimisticSale'
import { buildPaymentSummary } from '@/lib/paymentSummary'
import {
  buildCorrectionPayload,
  canCorrectPayment,
  cashAfter,
  cashPortion,
  currentCorrectionMethod,
  MIN_REASON_LENGTH,
  paymentsTotal,
  type CorrectionMethod,
} from '@/lib/paymentCorrection'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0)

const METHODS: Array<{ id: CorrectionMethod; label: string }> = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'mixto', label: 'Mixto' },
]

interface CorrectPaymentModalProps {
  sale: SaleDetail
  isAdmin: boolean
  /** Caja abierta de quien corrige (para ventas recién cobradas). */
  activeSessionId?: number | null
  onClose: () => void
  onSuccess?: () => void
}

/**
 * "Corregir pago" (2026-09-30): el cajero registró un método y era otro. No
 * cambia montos ni productos. Cualquier rol con la caja de la venta abierta;
 * con el corte cerrado solo admin. El backend valida todo de nuevo.
 */
export function CorrectPaymentModal({ sale, isAdmin, activeSessionId, onClose, onSuccess }: CorrectPaymentModalProps) {
  const queryClient = useQueryClient()
  const summary = buildPaymentSummary(sale)
  const total = paymentsTotal(sale)
  const gate = canCorrectPayment({ sale, isAdmin, activeSessionId: activeSessionId ?? null })

  const [method, setMethod] = useState<CorrectionMethod>(() => {
    const current = currentCorrectionMethod(sale)
    return current === 'tarjeta' ? 'efectivo' : 'tarjeta'
  })
  const [terminalId, setTerminalId] = useState<number | null>(null)
  const [transferStr, setTransferStr] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const terminalsQuery = useTerminalsQuery(
    { ...(sale.store_id != null ? { store_id: sale.store_id } : {}), active: true },
    { enabled: method === 'tarjeta' },
  )
  const terminals = terminalsQuery.data ?? []

  const result = useMemo(() => buildCorrectionPayload({
    method, total, terminalId, transferStr, hasUsd: summary.hasUsd, current: sale,
  }), [method, total, terminalId, transferStr, summary.hasUsd, sale])

  const cashBefore = cashPortion(sale)
  const cashNow = result.ok ? cashAfter(result.payments) : null
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH

  // Escape cierra (salvo a medio guardar).
  const close = () => { if (!submitting) onClose() }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submitting, onClose])

  const handleSubmit = async () => {
    if (!gate.allowed || !result.ok || !reasonOk) return
    setSubmitting(true)
    try {
      await correctSalePayments(sale.id, {
        payments: result.payments,
        reason: reason.trim(),
      })
      toast.success('Método de pago corregido')
      invalidateAfterSale(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['cash-session-detail'] })
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String(err.message) : 'No se pudo corregir el pago'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="correct-payment-title"
        className="relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-[28px] flex flex-col"
        style={{ background: 'var(--td-popup-bg)', border: '1px solid var(--td-popup-border)', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b" style={{ borderColor: 'var(--td-divider)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.30)' }}>
              <ArrowLeftRight size={16} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#60a5fa' }}>Corregir pago</p>
              <h2 id="correct-payment-title" className="text-base font-black" style={{ color: 'var(--td-text-hi)' }}>Venta #{sale.id} · {fmt(total)}</h2>
            </div>
          </div>
          <button onClick={close} aria-label="Cerrar" className="p-2 rounded-xl hover:bg-white/10 transition-colors">
            <X size={18} style={{ color: 'var(--td-text-lo)' }} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--td-text-lo)' }}>Cómo se registró</p>
            {summary.lines.map((l, i) => (
              <div key={i} className="flex justify-between text-sm font-bold" style={{ color: 'var(--td-text-hi)' }}>
                <span>{l.name}</span><span className="tabular-nums">{fmt(l.amount)}</span>
              </div>
            ))}
            {summary.hasUsd && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--td-text-lo)' }}>Se recibieron US${summary.usd.toFixed(2)}.</p>
            )}
          </div>

          {!gate.allowed ? (
            <p className="text-sm font-bold rounded-xl px-3 py-2" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              {gate.reason}
            </p>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--td-text-lo)' }}>Cómo se pagó en realidad</p>
                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Método de pago correcto">
                  {METHODS.map(m => {
                    const active = method === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setMethod(m.id)}
                        className="rounded-xl py-2 text-xs font-black transition-colors"
                        style={{
                          background: active ? 'rgba(59,130,246,0.18)' : 'var(--td-card-bg)',
                          border: `1px solid ${active ? 'rgba(59,130,246,0.6)' : 'var(--td-card-border)'}`,
                          color: active ? '#93c5fd' : 'var(--td-text-md)',
                        }}
                      >{m.label}</button>
                    )
                  })}
                </div>
              </div>

              {method === 'tarjeta' && (
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--td-text-lo)' }}>Terminal</span>
                  <select
                    value={terminalId ?? ''}
                    onChange={e => setTerminalId(e.target.value ? Number(e.target.value) : null)}
                    className="mt-1 w-full rounded-xl px-3 py-2 text-sm font-bold"
                    style={{ background: 'var(--td-input-bg)', border: '1px solid var(--td-input-border)', color: 'var(--td-input-text)' }}
                  >
                    <option value="">{terminalsQuery.isLoading ? 'Cargando…' : 'Elige la terminal'}</option>
                    {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <span className="block text-[11px] mt-1" style={{ color: 'var(--td-text-lo)' }}>La comisión de la terminal la absorbe la tienda.</span>
                </label>
              )}

              {method === 'mixto' && (
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--td-text-lo)' }}>Monto por transferencia</span>
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={transferStr}
                    onChange={e => setTransferStr(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-xl px-3 py-2 text-sm font-bold"
                    style={{ background: 'var(--td-input-bg)', border: '1px solid var(--td-input-border)', color: 'var(--td-input-text)' }}
                  />
                  <span className="block text-[11px] mt-1" style={{ color: 'var(--td-text-lo)' }}>El resto es efectivo.</span>
                </label>
              )}

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--td-text-lo)' }}>Motivo</span>
                <input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  maxLength={255}
                  placeholder="Ej. se marcó efectivo y pagó con tarjeta"
                  className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
                  style={{ background: 'var(--td-input-bg)', border: '1px solid var(--td-input-border)', color: 'var(--td-input-text)' }}
                />
              </label>

              {(sale.pre_sale_orders?.length ?? 0) > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--td-text-lo)' }}>
                  Solo cambia el pago de los productos; los anticipos de preventa de este ticket no cambian.
                </p>
              )}

              <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)' }}>
                <span style={{ color: 'var(--td-text-lo)' }}>Efectivo en el cajón</span>
                <span className="font-black tabular-nums" style={{ color: 'var(--td-text-hi)' }}>
                  {fmt(cashBefore)} → {cashNow == null ? '—' : fmt(cashNow)}
                </span>
              </div>

              {!result.ok && (method !== 'tarjeta' || terminalId != null) && (
                <p className="text-[12px] font-bold" style={{ color: '#f87171' }}>{result.error}</p>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={close}
              className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)', color: 'var(--td-text-md)' }}
            >Volver</button>
            {gate.allowed && (
              <button
                onClick={() => void handleSubmit()}
                disabled={submitting || !result.ok || !reasonOk}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#3b82f6', color: '#fff', border: '1px solid rgba(59,130,246,0.6)' }}
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
                Guardar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
