import { useEffect, useRef, useState } from "react";
import { DollarSign, Eraser, X } from "lucide-react";

/**
 * Calculadora de dólares de Caja (pedido Joel 2026-07-24).
 *
 * Reemplaza al flujo USD inline del panel de cobro, que amontonaba toggle +
 * presets + panel de simulación + chips en letra chica. El caso de uso real es
 * una PREGUNTA del cliente: "si te doy 20 dólares, ¿cuánto faltaría?" — así
 * que esto es una calculadora en grande: un número, la respuesta en vivo con
 * tipografía enorme, y nada se aplica hasta apretar "Sí paga con dólares".
 *
 * Diseñado para cajeros con poca soltura tecnológica: un concepto por
 * pantalla, botones grandes, cero jerga. El modal NO cobra — cobrar sigue
 * siendo el botón grande de la Caja.
 */

interface UsdCalculatorModalProps {
  open: boolean;
  /** Tipo de cambio USD→MXN vigente. */
  tc: number;
  /** Total a pagar de la venta (MXN). */
  totalAPagar: number;
  /** Pesos ya tecleados como recibidos (entran al cálculo del faltante). */
  pesosRecibidos: number;
  /** Valor inicial (para "Editar" unos dólares ya aplicados). */
  usdInicial: string;
  /** Confirmación: estos dólares SÍ se recibieron. */
  onApply: (usd: string) => void;
  /** Cerrar sin aplicar nada (solo era pregunta). */
  onClose: () => void;
}

const fmtMx = (n: number): string =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const PRESETS = [1, 5, 10, 20, 50, 100];

export function UsdCalculatorModal({ open, tc, totalAPagar, pesosRecibidos, usdInicial, onApply, onClose }: UsdCalculatorModalProps) {
  const [value, setValue] = useState<string>(usdInicial);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cada apertura arranca del valor vigente (editar) o vacío (nuevo).
  useEffect(() => {
    if (open) {
      setValue(usdInicial);
      // El autoFocus de un modal recién montado a veces pierde contra el
      // re-render de la Caja — un tick después es confiable.
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open, usdInicial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const usd = parseFloat(value) || 0;
  const usdEnPesos = usd * tc;
  const totalRecibido = pesosRecibidos + usdEnPesos;
  const diferencia = totalRecibido - totalAPagar;
  const alcanza = diferencia >= 0;
  const cambioUsd = tc > 0 ? Math.abs(diferencia) / tc : 0;
  const hayAlgo = usd > 0;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Click afuera = solo era pregunta: no se aplica nada. */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-[600px] rounded-3xl p-6 sm:p-8"
        style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)" }}
        data-testid="usd-calculator-modal"
      >
        {/* Header: qué es + el TC bien visible */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl p-3" style={{ background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.35)" }}>
              <DollarSign size={26} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-wide" style={{ color: "var(--td-text-hi)" }}>
                Dólares del cliente
              </h2>
              <p className="text-sm font-black text-emerald-400 tabular-nums">
                Tipo de cambio: ${tc.toFixed(2)} pesos por dólar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2.5"
            style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: "var(--td-text-hi)", cursor: "pointer" }}
            title="Cerrar sin aplicar"
          >
            <X size={22} />
          </button>
        </div>

        {/* Contexto: cuánto es la venta (y pesos ya recibidos si hay) */}
        <div className="rounded-2xl px-5 py-4 mb-5 flex items-center justify-between flex-wrap gap-2"
          style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
          <span className="text-base font-black uppercase tracking-wider" style={{ color: "var(--td-text-md)" }}>
            Total a pagar
          </span>
          <span className="text-3xl font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>
            {fmtMx(totalAPagar)} <span className="text-base">MXN</span>
          </span>
          {pesosRecibidos > 0 && (
            <span className="w-full text-sm font-bold" style={{ color: "var(--td-text-lo)" }}>
              Ya recibiste {fmtMx(pesosRecibidos)} en pesos — se toman en cuenta.
            </span>
          )}
        </div>

        {/* El número: input gigante + BORRAR siempre visible */}
        <div className="flex items-stretch gap-3 mb-4">
          <div className="relative flex-1">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-3xl font-black text-emerald-500/80 pointer-events-none">
              US$
            </span>
            <input
              ref={inputRef}
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && hayAlgo) onApply(value); }}
              placeholder="0"
              data-testid="usd-calc-input"
              className="w-full text-center rounded-2xl py-4 pl-20 pr-4 font-black focus:outline-none tabular-nums"
              style={{
                fontSize: 56,
                lineHeight: 1.1,
                background: "var(--td-input-bg)",
                border: "3px solid rgba(16,185,129,0.5)",
                color: "var(--td-input-text)",
              }}
            />
          </div>
          <button
            onClick={() => { setValue(""); inputRef.current?.focus(); }}
            data-testid="usd-calc-clear"
            className="shrink-0 rounded-2xl px-5 flex flex-col items-center justify-center gap-1 font-black uppercase tracking-wider"
            style={{ background: "rgba(224,34,26,0.10)", border: "2px solid rgba(224,34,26,0.4)", color: "var(--td-red)", cursor: "pointer", fontSize: 14 }}
          >
            <Eraser size={22} />
            Borrar
          </button>
        </div>

        {/* Billetes: suman al valor (como contar los billetes que da el cliente) */}
        <div className="grid grid-cols-6 gap-2 mb-5">
          {PRESETS.map(amt => (
            <button
              key={amt}
              onClick={() => { setValue(prev => String((parseFloat(prev) || 0) + amt)); inputRef.current?.focus(); }}
              className="rounded-xl py-3 font-black tabular-nums"
              style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.3)", color: "#34d399", cursor: "pointer", fontSize: 20 }}
            >
              {amt}
            </button>
          ))}
        </div>

        {/* LA RESPUESTA — en vivo, enorme, un solo mensaje */}
        <div
          className="rounded-2xl px-5 py-5 mb-6 text-center"
          data-testid="usd-calc-result"
          style={hayAlgo
            ? alcanza
              ? { background: "rgba(16,185,129,0.10)", border: "2px solid rgba(16,185,129,0.45)" }
              : { background: "rgba(224,34,26,0.08)", border: "2px solid rgba(224,34,26,0.45)" }
            : { background: "var(--td-card-bg)", border: "1px dashed var(--td-card-border)" }}
        >
          {!hayAlgo ? (
            <p className="text-xl font-black" style={{ color: "var(--td-text-lo)" }}>
              Teclea los dólares que trae el cliente
            </p>
          ) : (
            <>
              <p className="text-2xl font-black tabular-nums mb-2" style={{ color: "var(--td-text-md)" }}>
                US${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} son {fmtMx(usdEnPesos)} MXN
              </p>
              {alcanza ? (
                <>
                  <p className="font-black text-emerald-400 tabular-nums" style={{ fontSize: 40, lineHeight: 1.15 }}>
                    ✓ LE ALCANZA{diferencia > 0.009 ? ` — CAMBIO ${fmtMx(diferencia)}` : " — PAGO EXACTO"}
                  </p>
                  {diferencia > 0.009 && (
                    <p className="text-lg font-bold text-emerald-400/70 tabular-nums mt-1">
                      (US${cambioUsd.toFixed(2)} si el cambio se da en dólares)
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-black text-red-400 tabular-nums" style={{ fontSize: 40, lineHeight: 1.15 }}>
                    FALTAN {fmtMx(Math.abs(diferencia))} MXN
                  </p>
                  <p className="text-lg font-bold text-red-400/70 tabular-nums mt-1">
                    (≈ US${cambioUsd.toFixed(2)} más en dólares)
                  </p>
                </>
              )}
            </>
          )}
        </div>

        {/* Dos salidas, sin letra chica */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onApply(value)}
            disabled={!hayAlgo}
            data-testid="usd-calc-apply"
            className="rounded-2xl py-4 font-black uppercase tracking-wider disabled:opacity-35"
            style={{ background: "linear-gradient(135deg, #047857, #10B981)", border: "none", color: "#fff", cursor: hayAlgo ? "pointer" : "not-allowed", fontSize: 17 }}
          >
            ✓ Sí paga con dólares
          </button>
          <button
            onClick={onClose}
            data-testid="usd-calc-cancel"
            className="rounded-2xl py-4 font-black uppercase tracking-wider"
            style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: "var(--td-text-hi)", cursor: "pointer", fontSize: 17 }}
          >
            ✗ Solo era pregunta
          </button>
        </div>
      </div>
    </div>
  );
}
