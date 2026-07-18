import { useMemo, useState } from "react";
import { X, Tag, Trash2 } from "lucide-react";
import { motion as Motion } from "motion/react";
import {
  computeLineDiscountAmount,
  type DiscountReason,
  type LineDiscount,
} from "@/lib/saleCalc";
import { DISCOUNT_REASON_LABELS, DISCOUNT_REASONS } from "@/lib/discountReasons";

interface Props {
  productName: string;
  /** Cantidad total de la línea (el cajero puede descontar menos → split). */
  lineQty: number;
  unitPrice: number;
  /** Monto de la promo NxM que ya aplica en la línea (stacking 2026-07-17):
   *  el descuento manual se calcula sobre el neto DESPUÉS de la promo. */
  promoAmount?: number;
  /** Descuento ya aplicado (modo edición: precarga y permite quitar). */
  existing?: LineDiscount | undefined;
  onConfirm: (unitsToDiscount: number, discount: LineDiscount) => void;
  onRemove?: (() => void) | undefined;
  onClose: () => void;
}

const TP = "var(--td-text-hi)";
const TS = "var(--td-text-md)";
const TM = "var(--td-text-lo)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 14,
  border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)",
  color: TP, fontSize: 13, fontWeight: 700, outline: "none", boxSizing: "border-box",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN",
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(n || 0);

/**
 * Modal de descuento POR LÍNEA (Descuentos v2, reemplaza al "Promo" global).
 *
 * El cajero elige cuántas unidades descontar (menos que la línea → split),
 * tipo $/%, base por unidad/por línea, motivo y nota. El preview usa el MISMO
 * `computeLineDiscountAmount` que el checkout — lo que ves es lo que se cobra
 * (y el backend lo recomputa de todos modos: nunca viaja un monto).
 */
export function LineDiscountModal({ productName, lineQty, unitPrice, promoAmount = 0, existing, onConfirm, onRemove, onClose }: Props) {
  const [units, setUnits] = useState<string>(String(lineQty));
  const [kind, setKind] = useState<"fixed" | "percent">(existing?.kind ?? "fixed");
  const [basis, setBasis] = useState<"unit" | "line">(existing?.basis ?? "unit");
  const [value, setValue] = useState<string>(existing ? String(existing.value) : "");
  const [reason, setReason] = useState<DiscountReason>(existing?.reason ?? "danado");
  const [note, setNote] = useState<string>(existing?.note ?? "");

  const unitsNum = Math.max(1, Math.min(Math.floor(parseFloat(units) || 0), lineQty));
  const valueNum = parseFloat(value) || 0;

  const preview = useMemo(() => {
    if (valueNum <= 0) return null;
    const draft: LineDiscount = { kind, basis, value: valueNum, reason };
    // Stacking: si se descuenta la línea COMPLETA y trae promo, la base es el
    // neto-promo. Al descontar menos unidades (split) la promo se re-evalúa
    // en las líneas resultantes — el preview usa el bruto de esa parte.
    const promoOnBase = unitsNum === lineQty ? promoAmount : 0;
    const base = Math.max(0, unitPrice * unitsNum - promoOnBase);
    const amount = computeLineDiscountAmount(draft, { unitPrice, qty: unitsNum }, base);
    return { amount, net: Math.max(0, base - amount), base, promoOnBase };
  }, [kind, basis, valueNum, reason, unitPrice, unitsNum, lineQty, promoAmount]);

  const invalidPct = kind === "percent" && valueNum > 100;
  const canConfirm = valueNum > 0 && !invalidPct && unitsNum >= 1;

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm(unitsNum, {
      kind, basis, value: Math.round(valueNum * 100) / 100, reason,
      ...(note.trim() ? { note: note.trim().slice(0, 255) } : {}),
    });
    onClose();
  };

  const segBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "9px 0", borderRadius: 12, fontSize: 12, fontWeight: 800,
    cursor: "pointer", transition: "all .15s",
    border: active ? "1px solid rgba(224,34,26,0.55)" : "1px solid var(--td-input-border)",
    background: active ? "rgba(224,34,26,0.14)" : "var(--td-input-bg)",
    color: active ? "var(--td-red)" : TS,
  });

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <Motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-md rounded-3xl p-6 flex flex-col gap-4"
        style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2" style={{ background: "rgba(224,34,26,0.14)" }}>
              <Tag size={18} style={{ color: "var(--td-red)" }} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: TP }}>
                Descuento en línea
              </h3>
              <p className="text-[11px] font-bold mt-0.5" style={{ color: TS }}>
                {productName} · {fmt(unitPrice)} c/u
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Cerrar">
            <X size={16} style={{ color: TM }} />
          </button>
        </div>

        {/* Unidades a descontar (menos que la línea → split automático) */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TM }}>
            Unidades a descontar (de {lineQty})
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              data-testid="ld-units"
              type="number" min={1} max={lineQty} step={1} value={units}
              onChange={e => setUnits(e.target.value)}
              style={{ ...inputStyle, width: 90, textAlign: "center" }}
            />
            {unitsNum < lineQty && (
              <span className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>
                Se separará en 2 líneas: {lineQty - unitsNum} a precio normal + {unitsNum} con descuento.
              </span>
            )}
          </div>
        </div>

        {/* Tipo $ / % */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TM }}>Tipo</label>
          <div className="flex gap-2 mt-1.5">
            <button style={segBtn(kind === "fixed")} onClick={() => setKind("fixed")}>Monto ($)</button>
            <button style={segBtn(kind === "percent")} onClick={() => setKind("percent")}>Porcentaje (%)</button>
          </div>
        </div>

        {/* Base (solo aplica a $; % siempre es sobre la línea) */}
        {kind === "fixed" && (
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TM }}>Aplicar</label>
            <div className="flex gap-2 mt-1.5">
              <button style={segBtn(basis === "unit")} onClick={() => setBasis("unit")}>Por unidad</button>
              <button style={segBtn(basis === "line")} onClick={() => setBasis("line")}>Por línea (total)</button>
            </div>
          </div>
        )}

        {/* Valor */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TM }}>
            {kind === "percent" ? "Porcentaje de descuento" : basis === "unit" ? "Pesos de descuento por unidad" : "Pesos de descuento (total de la línea)"}
          </label>
          <input
            data-testid="ld-value"
            type="number" min={0} step={kind === "percent" ? 1 : 0.5} value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm(); }}
            placeholder={kind === "percent" ? "10" : "20"}
            style={{ ...inputStyle, marginTop: 6 }}
            autoFocus
          />
          {invalidPct && (
            <p className="text-[11px] font-bold mt-1" style={{ color: "var(--td-red)" }}>
              El porcentaje no puede exceder 100.
            </p>
          )}
        </div>

        {/* Motivo + nota */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TM }}>Motivo</label>
            <select value={reason} onChange={e => setReason(e.target.value as DiscountReason)} style={{ ...inputStyle, marginTop: 6 }}>
              {DISCOUNT_REASONS.map(r => (
                <option key={r} value={r}>{DISCOUNT_REASON_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TM }}>Nota (opcional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={255} placeholder="ej. caja golpeada" style={{ ...inputStyle, marginTop: 6 }} />
          </div>
        </div>

        {/* Preview en vivo — mismo cálculo que el cobro */}
        {preview && !invalidPct && (
          <div className="rounded-2xl p-3 text-center" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
            <p className="text-[11px] font-bold" style={{ color: TS }}>
              {unitsNum} ud{unitsNum !== 1 ? "s" : ""} × {fmt(unitPrice)} − {fmt(preview.amount)}
            </p>
            <p className="text-lg font-black" style={{ color: "#10b981" }}>= {fmt(preview.net)}</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {existing && onRemove && (
            <button
              onClick={() => { onRemove(); onClose(); }}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black uppercase"
              style={{ border: "1px solid rgba(224,34,26,0.4)", color: "var(--td-red)", background: "transparent" }}
            >
              <Trash2 size={14} /> Quitar
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-xs font-black uppercase"
            style={{ border: "1px solid var(--td-input-border)", color: TS, background: "transparent" }}
          >
            Cancelar
          </button>
          <button
            data-testid="ld-confirm"
            onClick={confirm}
            disabled={!canConfirm}
            className="flex-1 rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:opacity-40"
            style={{ background: "#10b981", color: "#04120c", border: "none", cursor: canConfirm ? "pointer" : "not-allowed" }}
          >
            Aplicar
          </button>
        </div>
      </Motion.div>
    </div>
  );
}
