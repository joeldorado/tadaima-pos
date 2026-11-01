import { useState } from "react";
import { Gift, Trash2, X } from "lucide-react";
import { motion as Motion } from "motion/react";
import type { LineAdjustment } from "@/lib/lineAdjustments";
import { GIFT_COLOR, GIFT_NOTE_MAX } from "@/lib/giftLine";

interface Props {
  productName: string;
  lineQty: number;
  /** Precio de catálogo por pieza (lo que se regala). */
  unitPrice: number;
  /** La línea ya es regalo: precarga la nota y permite quitarlo. */
  isGift: boolean;
  existingNote?: string | undefined;
  onConfirm: (units: number, adjustment: LineAdjustment) => void;
  onRemove: () => void;
  onClose: () => void;
}

const TP = "var(--td-text-hi)";
const TS = "var(--td-text-md)";
const TM = "var(--td-text-lo)";

const fmt = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inputStyle = {
  width: "100%", padding: "12px 14px", borderRadius: 14,
  border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)",
  color: TP, fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box",
} as const;

/**
 * Regalo por línea en Caja (2026-10-31, pedido del cliente): las piezas elegidas
 * se cobran en $0 y su costo en esa venta queda en 0 (el del inventario no
 * cambia), así no meten ruido en reportes. Menos piezas que la línea la separa
 * en 2, igual que el descuento. Enter guarda, Esc cierra.
 */
export function LineGiftModal({ productName, lineQty, unitPrice, isGift, existingNote, onConfirm, onRemove, onClose }: Props) {
  const [units, setUnits] = useState<string>(String(lineQty));
  const [note, setNote] = useState(existingNote ?? "");
  const unitsNum = Math.max(1, Math.min(Math.floor(parseFloat(units) || 0), lineQty));

  const confirm = () => {
    const clean = note.trim();
    onConfirm(isGift ? lineQty : unitsNum, clean ? { direction: "gift", note: clean } : { direction: "gift" });
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <Motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="Regalo"
        data-testid="line-gift-modal"
        className="relative w-full max-w-md rounded-3xl p-6 flex flex-col gap-4"
        style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)" }}
        onKeyDown={e => { if (e.key === "Escape") onClose(); }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-xl p-2 shrink-0" style={{ background: "rgba(236,72,153,0.14)" }}>
              <Gift size={18} style={{ color: GIFT_COLOR }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: TP }}>Regalo</h3>
              <p className="text-[11px] font-bold mt-0.5 truncate" style={{ color: TS }}>{productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Cerrar">
            <X size={16} style={{ color: TM }} />
          </button>
        </div>

        {!isGift && lineQty > 1 && (
          <div>
            <label className="text-[11px] font-black uppercase tracking-wide" style={{ color: TS }}>
              Piezas de regalo (de {lineQty})
            </label>
            <input
              data-testid="lg-units"
              type="number" min={1} max={lineQty} step={1} value={units}
              onChange={e => setUnits(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") confirm(); }}
              style={{ ...inputStyle, marginTop: 6 }}
            />
            {unitsNum < lineQty && (
              <p className="mt-1.5 text-[11px] font-bold" style={{ color: TS }}>
                Se separará en 2 líneas: {lineQty - unitsNum} cobradas + {unitsNum} de regalo.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="text-[11px] font-black uppercase tracking-wide" style={{ color: TS }}>
            Nota (opcional)
          </label>
          <input
            data-testid="lg-note"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm(); }}
            maxLength={GIFT_NOTE_MAX}
            placeholder="ej. cliente frecuente, promo de aniversario"
            aria-label="Nota del regalo"
            autoFocus={isGift || lineQty <= 1}
            style={{ ...inputStyle, marginTop: 6 }}
          />
        </div>

        <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: "rgba(236,72,153,0.08)", border: "1px solid rgba(236,72,153,0.25)" }}>
          <p className="text-[11px] font-bold" style={{ color: TS }}>
            Se cobra <b style={{ color: TP }}>$0</b> y en reportes cuenta con <b style={{ color: TP }}>costo $0</b>.
            El stock sí se descuenta.
          </p>
          <span className="shrink-0 text-xs font-black tabular-nums line-through" style={{ color: TM }}>
            {fmt(unitPrice * (isGift ? lineQty : unitsNum))}
          </span>
        </div>

        <div className="flex gap-2">
          {isGift && (
            <button
              data-testid="lg-remove"
              onClick={onRemove}
              className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black uppercase"
              style={{ border: "1px solid rgba(224,34,26,0.4)", color: "var(--td-red)", background: "rgba(224,34,26,0.10)" }}
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
            data-testid="lg-confirm"
            onClick={confirm}
            className="flex-1 rounded-xl px-4 py-2.5 text-xs font-black uppercase"
            style={{ background: GIFT_COLOR, color: "#1a0410", border: "none" }}
          >
            {isGift ? "Guardar" : "Regalar"}
          </button>
        </div>
      </Motion.div>
    </div>
  );
}
