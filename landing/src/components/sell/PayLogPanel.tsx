import { useEffect, useRef } from "react";
import { Banknote, EyeOff } from "lucide-react";
import type { PayLogEntry } from "@/lib/payLog";

const fmtMoney = (n: number): string =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface PayLogPanelProps {
  /** Log de la mesa ACTIVA — cambiar de mesa cambia el contenido solo. */
  entries: PayLogEntry[];
  visible: boolean;
  onToggle: () => void;
  /** Total a pagar de la mesa (para el pie Cambio/Faltan en vivo). */
  totalAPagar: number;
  /** Recibido total en MXN (pesos + dólares aplicados ya convertidos). */
  receivedMxn: number;
  mesaName: string;
}

/**
 * Ventanita flotante "Pagos" (Joel 2026-07-30): registro visible de lo que el
 * cliente fue entregando en la venta actual ("Billete +$200", "Dólares US$15"),
 * como el POS viejo — para que el cajero no pierda la cuenta. Vive flotando
 * arriba-derecha del carrito (tapa un poco los items, decisión de Joel) con
 * toggle esconder/mostrar persistido por dispositivo. Letra grande a propósito:
 * el público objetivo son cajeros con poca soltura tecnológica.
 */
export function PayLogPanel({ entries, visible, onToggle, totalAPagar, receivedMxn, mesaName }: PayLogPanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll al fondo: la entrada más nueva siempre visible.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length, visible]);

  if (!visible) {
    return (
      <button
        onClick={onToggle}
        data-testid="paylog-toggle"
        className="absolute top-14 right-3 z-40 flex items-center gap-2 rounded-full px-4 py-2.5"
        style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", backdropFilter: "blur(14px)", color: "var(--td-text-hi)", cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
        title="Mostrar el registro de pagos de esta venta"
      >
        <Banknote size={15} style={{ color: "#34d399" }} />
        <span className="text-[12px] font-black uppercase tracking-wider">
          Pagos{entries.length > 0 ? ` (${entries.length})` : ""}
        </span>
      </button>
    );
  }

  const cambio = receivedMxn - totalAPagar;

  return (
    <div
      className="absolute top-14 right-3 z-40 w-[280px] rounded-2xl overflow-hidden flex flex-col"
      data-testid="paylog-panel"
      style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", backdropFilter: "blur(14px)", boxShadow: "0 12px 32px rgba(0,0,0,0.4)", maxHeight: "48vh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5" style={{ borderBottom: "1px solid var(--td-popup-border)" }}>
        <span className="flex items-center gap-2 min-w-0">
          <Banknote size={15} style={{ color: "#34d399", flexShrink: 0 }} />
          <span className="truncate text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-hi)" }}>
            Pagos · {mesaName}
          </span>
        </span>
        <button
          onClick={onToggle}
          data-testid="paylog-hide"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider"
          style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: "var(--td-text-lo)", cursor: "pointer" }}
        >
          <EyeOff size={11} /> Ocultar
        </button>
      </div>

      {/* Entradas */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3.5 py-2 flex flex-col gap-1.5">
        {entries.length === 0 ? (
          <p className="py-3 text-center text-[11px] font-bold" style={{ color: "var(--td-text-lo)" }}>
            Aquí verás lo que el cliente va entregando (billetes, dólares).
          </p>
        ) : entries.map(e => (
          <div key={e.id} className="flex items-baseline justify-between gap-2">
            <span
              className="text-[13px] font-black leading-tight"
              style={{ color: e.kind === "usd" ? "#34d399" : e.kind === "info" ? "var(--td-text-lo)" : "var(--td-text-hi)" }}
            >
              {e.label}
            </span>
            <span className="shrink-0 text-[9px] font-bold tabular-nums" style={{ color: "var(--td-text-ghost)" }}>
              {new Date(e.at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>

      {/* Pie: recibido + cambio/faltan EN VIVO */}
      <div className="px-3.5 py-2.5 flex flex-col gap-0.5" style={{ borderTop: "1px solid var(--td-popup-border)", background: "rgba(0,0,0,0.18)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Recibido</span>
          <span className="text-[15px] font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{fmtMoney(receivedMxn)}</span>
        </div>
        {totalAPagar > 0 && receivedMxn > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: cambio >= 0 ? "#34d399" : "var(--td-red)" }}>
              {cambio >= 0 ? "Cambio" : "Faltan"}
            </span>
            <span className="text-[15px] font-black tabular-nums" style={{ color: cambio >= 0 ? "#34d399" : "var(--td-red)" }}>
              {fmtMoney(Math.abs(cambio))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
