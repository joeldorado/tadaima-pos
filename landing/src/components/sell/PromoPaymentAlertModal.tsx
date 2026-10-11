import { useEffect, useRef } from "react";
import { AlertTriangle, Banknote, CreditCard, X } from "lucide-react";
import { motion as Motion } from "motion/react";
import type { PromoPaymentAlert } from "@/lib/promoPaymentAlert";

interface Props {
  info: PromoPaymentAlert;
  /** Por qué NO se puede cambiar al método que conserva la promo (otro
   *  artículo no lo acepta, o la venta trae preventa). Sin valor = sí se puede. */
  keepBlockedReason?: string | undefined;
  formatMoney: (n: number) => string;
  /** Cambiar al método que sí acepta la promo. */
  onKeepPromo: () => void;
  /** Seguir con el método actual y cobrar sin la promo. */
  onSkipPromo: () => void;
  /** "Decidir después": el cobro sigue trabado y el aviso rojo se queda. */
  onClose: () => void;
}

const TP = "var(--td-text-hi)";
const TS = "var(--td-text-md)";
const TM = "var(--td-text-lo)";
const AMBER = "#F59E0B";
const GREEN = "#10b981";
/** Ventana en la que un segundo clic se considera parte de un doble clic. */
const DOUBLE_CLICK_MS = 400;

/**
 * Aviso de Caja: la promo aplicada no se cobra con el método actual (Joel
 * 2026-10-10). No decide nada solo — el cajero elige entre conservar la promo
 * cambiando el método o seguir con el método y cobrar sin la promo.
 *
 * No roba el foco ni pone un botón por defecto: el campo de código sigue
 * activo para el lector, y un Enter no puede elegir por el cajero. Esc cierra.
 *
 * Va dentro de un `AnimatePresence`: al decidir, el fondo se queda un instante
 * mientras se desvanece y se traga el segundo clic de un doble clic (si no,
 * caería en el carrito o en el modal de terminales que se abre debajo).
 */
export function PromoPaymentAlertModal({ info, keepBlockedReason, formatMoney, onKeepPromo, onSkipPromo, onClose }: Props) {
  // Una sola decisión por aviso: mientras se desvanece ya no acepta clics. Se
  // suelta sola por si la acción no cerró el aviso (nunca debe quedar muerto).
  const decided = useRef(false);
  const once = (action: () => void) => () => {
    if (decided.current) return;
    decided.current = true;
    window.setTimeout(() => { decided.current = false; }, DOUBLE_CLICK_MS);
    action();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !decided.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const soloEfectivo = info.keepMethod === "Efectivo";
  const KeepIcon = soloEfectivo ? Banknote : CreditCard;
  const SkipIcon = soloEfectivo ? CreditCard : Banknote;
  const promo = info.promoName ? `La promo "${info.promoName}"` : "La promo de este artículo";
  const extra = info.extraLines > 0
    ? ` y ${info.extraLines} artículo${info.extraLines === 1 ? "" : "s"} más`
    : "";
  const variasPromos = info.promoIds.length > 1;
  const canKeep = !keepBlockedReason;

  return (
    <Motion.div
      className="fixed inset-0 z-[160] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={once(onClose)} />
      <Motion.div
        initial={{ scale: 0.95, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="promo-pay-alert-title"
        aria-describedby="promo-pay-alert-body"
        data-testid="promo-payment-alert"
        className="relative w-full max-w-md rounded-3xl p-6 flex flex-col gap-4"
        style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-2xl p-2.5 shrink-0" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
              <AlertTriangle size={20} style={{ color: AMBER }} />
            </div>
            <div className="min-w-0">
              <h3 id="promo-pay-alert-title" className="text-sm font-black uppercase tracking-wide" style={{ color: TP }}>
                Promo solo {soloEfectivo ? "en efectivo" : "con tarjeta"}
              </h3>
              <p className="text-[11px] font-bold mt-0.5 truncate" style={{ color: TS }}>
                {info.productName}{extra}
              </p>
            </div>
          </div>
          <button onClick={once(onClose)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Decidir después">
            <X size={16} style={{ color: TM }} />
          </button>
        </div>

        <div id="promo-pay-alert-body" className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold leading-snug" style={{ color: TS }}>
            {promo} no se cobra con <b style={{ color: TP }}>{info.currentMethod}</b>. ¿Cómo va a pagar el cliente?
          </p>
          {info.savings > 0 && (
            <p className="text-[12px] font-bold" style={{ color: TM }}>
              {variasPromos ? "Las promos descuentan" : "La promo descuenta"}{" "}
              <span className="tabular-nums" style={{ color: GREEN }}>{formatMoney(info.savings)}</span> en esta venta.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            data-testid="promo-alert-keep"
            onClick={once(onKeepPromo)}
            disabled={!canKeep}
            className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-transform active:scale-[0.99] disabled:opacity-40"
            style={{ background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.45)", cursor: canKeep ? "pointer" : "not-allowed" }}
          >
            <KeepIcon size={20} className="shrink-0" style={{ color: GREEN }} />
            <span className="min-w-0">
              <span className="block text-xs font-black uppercase tracking-wide" style={{ color: TP }}>
                Cambiar a {info.keepMethod}
              </span>
              <span className="block text-[11px] font-bold mt-0.5" style={{ color: TS }}>
                {canKeep
                  ? (variasPromos ? "Se conservan las promos" : "Se conserva la promo")
                  : `No disponible: ${keepBlockedReason}`}
              </span>
            </span>
          </button>

          <button
            data-testid="promo-alert-skip"
            onClick={once(onSkipPromo)}
            className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-transform active:scale-[0.99]"
            style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.40)", cursor: "pointer" }}
          >
            <SkipIcon size={20} className="shrink-0" style={{ color: AMBER }} />
            <span className="min-w-0">
              <span className="block text-xs font-black uppercase tracking-wide" style={{ color: TP }}>
                Seguir con {info.currentMethod}
              </span>
              <span className="block text-[11px] font-bold mt-0.5" style={{ color: TS }}>
                {variasPromos ? "Se cobra sin esas promos" : "Se cobra sin la promo"}
              </span>
            </span>
          </button>

          <button
            data-testid="promo-alert-later"
            onClick={once(onClose)}
            className="rounded-xl px-4 py-2.5 text-xs font-black uppercase"
            style={{ border: "1px solid var(--td-input-border)", color: TS, background: "transparent" }}
          >
            Decidir después
          </button>
        </div>
      </Motion.div>
    </Motion.div>
  );
}
