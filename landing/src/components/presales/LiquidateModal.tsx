import { useState } from "react";
import { X, Loader2, Check, Wallet, PackageOpen, AlertCircle } from "lucide-react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { addPreSalePayment, updatePreSaleStatus } from "@tadaima/api";
import type { PreSale as ApiPreSale } from "@tadaima/api";

interface Props {
  preSale: ApiPreSale;
  onClose: () => void;
  onSuccess: (completed: ApiPreSale) => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

const METHODS = ["Efectivo", "Dólares", "Tarjeta", "Transferencia"] as const;
const METHOD_IDS: Record<string, number> = {
  Efectivo: 1,
  Dólares: 2,
  Tarjeta: 3,
  Transferencia: 4,
};

export function LiquidateModal({ preSale, onClose, onSuccess }: Props) {
  const balance = preSale.balance ?? 0;
  const total   = preSale.total ?? 0;

  const [payAmount, setPayAmount] = useState<number | "">(balance > 0 ? balance : "");
  const [method, setMethod] = useState<string>("Efectivo");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const needsPayment = balance > 0;
  const canProceed   = !needsPayment || (Number(payAmount) >= balance);

  const handleLiquidate = async () => {
    if (needsPayment && (!payAmount || Number(payAmount) <= 0)) {
      toast.error("Ingresa el monto del pago final");
      return;
    }

    setSaving(true);
    try {
      if (needsPayment) {
        await addPreSalePayment(preSale.id, {
          amount: Number(payAmount),
          payment_method_id: METHOD_IDS[method] ?? 1,
          notes: notes.trim() || undefined,
        });
      }

      const completed = await updatePreSaleStatus(preSale.id, {
        status: "completed",
        notes: "Entrega confirmada en caja",
      });

      toast.success(`Preventa liquidada — Venta generada`);
      onSuccess(completed);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Error al liquidar la preventa");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/85 backdrop-blur-xl"
        onClick={onClose}
      />

      <Motion.div
        initial={{ scale: 0.93, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        className="relative w-full max-w-md rounded-[36px] border overflow-hidden flex flex-col shadow-2xl"
        style={{ background: "var(--td-popup-bg)", backdropFilter: "blur(40px)", borderColor: "var(--td-popup-border)" }}
      >
        {/* Header */}
        <div className="px-7 py-5 border-b border-white/5 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <PackageOpen size={18} className="text-green-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-tight">Liquidar preventa</h2>
              <p className="text-[10px] font-bold text-white/30 mt-0.5">
                {preSale.customer?.name ?? "Sin cliente"} — #{String(preSale.id).padStart(6, "0")}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-7 py-5 space-y-5">

          {/* Resumen de la preventa */}
          <div className="rounded-[24px] border border-white/5 overflow-hidden" style={{ background: "var(--td-card-bg)" }}>
            <div className="px-5 py-3 flex justify-between items-center border-b border-white/5">
              <span className="text-xs font-bold text-white/40">Total del apartado</span>
              <span className="text-sm font-black text-white">{fmt(total)}</span>
            </div>
            <div className="px-5 py-3 flex justify-between items-center border-b border-white/5">
              <span className="text-xs font-bold text-white/40">Ya abonado</span>
              <span className="text-sm font-black text-green-400">{fmt(preSale.paid_amount ?? 0)}</span>
            </div>
            <div className="px-5 py-3 flex justify-between items-center">
              <span className="text-xs font-black text-white/40 uppercase tracking-widest">Saldo pendiente</span>
              <span className={`text-xl font-black italic ${balance > 0 ? "text-red-400" : "text-green-400"}`}>
                {balance > 0 ? fmt(balance) : "✓ Pagado"}
              </span>
            </div>
          </div>

          {/* Pago final */}
          {needsPayment ? (
            <section className="space-y-4">
              <h3 className="text-[9px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                <Wallet size={10} className="text-red-400" />Pago final
              </h3>

              {/* Monto */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-white/25 uppercase tracking-widest">Monto *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-green-400/50 text-lg">$</span>
                  <input
                    type="number"
                    min={balance}
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    className="w-full pl-8 pr-4 py-3 rounded-2xl bg-green-500/5 border border-green-500/20 font-black text-xl text-green-400 outline-none focus:border-green-500/40"
                  />
                </div>
                {Number(payAmount) > balance && (
                  <p className="text-[9px] font-bold text-amber-400/70 flex items-center gap-1">
                    <AlertCircle size={9} />
                    Cambio a devolver: {fmt(Number(payAmount) - balance)}
                  </p>
                )}
              </div>

              {/* Método */}
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map(m => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${
                      method === m
                        ? "bg-red-600 border-red-500 text-white"
                        : "bg-white/5 border-white/8 text-white/30 hover:text-white/60"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Nota */}
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Nota opcional..."
                className="w-full px-4 py-2.5 rounded-2xl outline-none border border-white/8 bg-white/5 text-sm font-bold text-white placeholder-white/15 focus:border-red-500/20"
              />
            </section>
          ) : (
            <div className="flex items-center gap-3 px-4 py-4 rounded-2xl border border-green-500/20 bg-green-500/5">
              <Check size={18} className="text-green-400 shrink-0" />
              <p className="text-sm font-black text-green-400">Saldo liquidado — listo para entregar</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-white/5 flex gap-3 shrink-0" style={{ background: "var(--td-panel-bg)" }}>
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/8 text-white/25 hover:text-white/50 transition-all">
            Cancelar
          </button>
          <button
            onClick={handleLiquidate}
            disabled={saving || (needsPayment && !canProceed)}
            className="flex-[2] py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-30"
            style={{ background: "linear-gradient(135deg,#059669,#34d399)", color: "#fff", border: "1px solid rgba(52,211,153,0.3)" }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <PackageOpen size={14} />}
            {saving ? "Procesando..." : needsPayment ? "Cobrar y Entregar" : "Confirmar Entrega"}
          </button>
        </div>
      </Motion.div>
    </div>
  );
}
