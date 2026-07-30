import { useEffect, useRef } from "react";
import { Banknote, ChevronDown, ChevronRight } from "lucide-react";
import type { PayLogEntry } from "@/lib/payLog";

interface PayLogPanelProps {
  /** Log de la mesa ACTIVA — cambiar de mesa cambia el contenido solo. */
  entries: PayLogEntry[];
  visible: boolean;
  onToggle: () => void;
  mesaName: string;
}

/**
 * Histórico de pagos de la venta actual (Joel 2026-07-30): registro de lo que
 * el cliente fue entregando ("Billete +$200", "Dólares US$15"), como el POS
 * viejo — para que el cajero no pierda la cuenta. Vive PEGADO abajo del
 * resumen de cobro en el panel derecho (segunda iteración: Joel lo movió aquí
 * desde la ventanita flotante al ensanchar el panel). Es POR VENTA/mesa — se
 * limpia al cobrar; no es un histórico global (ese es "Historial"). El
 * colapsado se recuerda por dispositivo. Letra grande a propósito: el público
 * objetivo son cajeros con poca soltura tecnológica.
 */
export function PayLogPanel({ entries, visible, onToggle, mesaName }: PayLogPanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll al fondo: la entrada más nueva siempre visible.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length, visible]);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--td-card-border)", background: "var(--td-card-bg)" }}
      data-testid="paylog-panel"
    >
      {/* Header — siempre visible; click = colapsar/expandir */}
      <button
        onClick={onToggle}
        data-testid="paylog-toggle"
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 transition-colors hover:bg-white/5"
        style={{ cursor: "pointer" }}
        title="Registro de lo que el cliente ha entregado en ESTA venta"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Banknote size={15} style={{ color: "#34d399", flexShrink: 0 }} />
          <span className="truncate text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-hi)" }}>
            Pagos de esta venta{entries.length > 0 ? ` (${entries.length})` : ""}
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: "var(--td-text-ghost)" }}>
            {mesaName}
          </span>
          {visible
            ? <ChevronDown size={14} style={{ color: "var(--td-text-lo)" }} />
            : <ChevronRight size={14} style={{ color: "var(--td-text-lo)" }} />}
        </span>
      </button>

      {/* Entradas */}
      {visible && (
        <div
          ref={listRef}
          className="overflow-y-auto px-3.5 pb-2.5 flex flex-col gap-1.5"
          style={{ maxHeight: 170, borderTop: "1px solid var(--td-card-border)", paddingTop: 8 }}
        >
          {entries.length === 0 ? (
            <p className="py-2 text-center text-[11px] font-bold" style={{ color: "var(--td-text-lo)" }}>
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
      )}
    </div>
  );
}
