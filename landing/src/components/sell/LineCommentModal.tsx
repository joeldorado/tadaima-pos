import { useState } from "react";
import { MessageSquare, Trash2, X } from "lucide-react";
import { motion as Motion } from "motion/react";
import { LINE_COMMENT_MAX, normalizeLineComment } from "@/lib/lineComment";

interface Props {
  productName: string;
  /** Comentario actual de la línea (modo edición: precarga y permite quitar). */
  existing?: string | undefined;
  /** Texto ya limpio; "" = quitar el comentario. */
  onConfirm: (comment: string) => void;
  onClose: () => void;
}

const TP = "var(--td-text-hi)";
const TS = "var(--td-text-md)";
const TM = "var(--td-text-lo)";
const BLUE = "#60A5FA";

/**
 * Comentario corto de una línea del carrito (Joel 2026-10-03): recordatorio del
 * cajero que se ve junto al nombre y se guarda con la venta. Mismo cascarón que
 * el modal de descuento. Enter guarda, Esc cierra.
 */
export function LineCommentModal({ productName, existing, onConfirm, onClose }: Props) {
  const [text, setText] = useState(existing ?? "");
  const clean = normalizeLineComment(text);
  // Sin texto y sin comentario previo no hay nada que guardar.
  const canConfirm = clean !== "" || Boolean(existing);

  const confirm = () => {
    if (canConfirm) onConfirm(clean);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <Motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="Comentario de la línea"
        data-testid="line-comment-modal"
        className="relative w-full max-w-md rounded-3xl p-6 flex flex-col gap-4"
        style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)" }}
        onKeyDown={e => { if (e.key === "Escape") onClose(); }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-xl p-2 shrink-0" style={{ background: "rgba(96,165,250,0.14)" }}>
              <MessageSquare size={18} style={{ color: BLUE }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: TP }}>Comentario</h3>
              <p className="text-[11px] font-bold mt-0.5 truncate" style={{ color: TS }}>{productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Cerrar">
            <X size={16} style={{ color: TM }} />
          </button>
        </div>

        <div>
          <input
            data-testid="lc-input"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm(); }}
            maxLength={LINE_COMMENT_MAX}
            placeholder="ej. para la promo, regalo, lo recoge Juan"
            aria-label="Comentario de la línea"
            autoFocus
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 14,
              border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)",
              color: TP, fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box",
            }}
          />
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <p className="text-[11px] font-bold" style={{ color: TS }}>
              Es un recordatorio para ustedes: se ve junto al nombre y <b>no se imprime en el ticket</b>.
            </p>
            <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: TM }}>
              {text.length}/{LINE_COMMENT_MAX}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {existing && (
            <button
              data-testid="lc-remove"
              onClick={() => onConfirm("")}
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
            data-testid="lc-confirm"
            onClick={confirm}
            disabled={!canConfirm}
            className="flex-1 rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:opacity-40"
            style={{ background: "#10b981", color: "#04120c", border: "none", cursor: canConfirm ? "pointer" : "not-allowed" }}
          >
            Guardar
          </button>
        </div>
      </Motion.div>
    </div>
  );
}
