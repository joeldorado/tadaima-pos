import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Clock, Lock, RefreshCw } from "lucide-react";
import { getCashReport } from "@tadaima/api";
import type { CashSessionReport } from "@tadaima/api";
import { getTodayLocal } from "@/lib/date";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { CashCloseSummaryModal } from "./CashCloseSummaryModal";

interface CortesModalProps {
  open: boolean;
  onClose: () => void;
  /** Tienda activa. El backend además acota por rol (cajero→propios, gerente→tienda, admin→todo). */
  storeId?: number;
}

const fmt = (n: number): string =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";

/**
 * Ventana de Cortes de Caja — vista rápida desde la Caja (SellPage).
 * Lista las sesiones (cortes) del rango elegido y abre el resumen detallado
 * (CashCloseSummaryModal) al hacer click en una. No requiere caja abierta:
 * lee el historial vía GET /reports/cash. El backend acota por rol:
 *   - cajero → solo sus cortes
 *   - gerente → cortes de su tienda
 *   - admin → todos
 */
export function CortesModal({ open, onClose, storeId }: CortesModalProps) {
  const [from, setFrom] = useState(getTodayLocal());
  const [to, setTo] = useState(getTodayLocal());
  const [selected, setSelected] = useState<CashSessionReport | null>(null);

  const query = useQuery({
    queryKey: ["cortes", from, to, storeId ?? null],
    queryFn: () => getCashReport({ from, to, ...(storeId ? { store_id: storeId } : {}) }),
    enabled: open,
    staleTime: 30_000,
  });

  if (!open) return null;

  const sessions = query.data?.sessions ?? [];
  const totalVentas = sessions.reduce((a, s) => a + s.total_sales, 0);

  return (
    <>
      <div
        className="fixed inset-0 z-[450] flex items-start justify-center p-4 md:p-8"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      >
        <div
          className="w-full max-w-2xl mt-6 rounded-3xl overflow-hidden flex flex-col max-h-[85vh]"
          style={{ background: "var(--td-popup-bg, #18181b)", border: "1px solid var(--td-panel-border, rgba(255,255,255,0.08))" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--td-panel-border)" }}>
            <Clock size={18} style={{ color: "var(--td-text-hi)" }} />
            <h3 className="flex-1" style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "var(--td-text-hi)" }}>
              Cortes de Caja
            </h3>
            <button
              onClick={() => query.refetch()}
              className="p-2 rounded-xl hover:bg-white/5 transition-colors"
              title="Actualizar"
            >
              <RefreshCw size={15} style={{ color: "var(--td-text-lo)" }} className={query.isFetching ? "animate-spin" : ""} />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 transition-colors" title="Cerrar">
              <X size={16} style={{ color: "var(--td-text-lo)" }} />
            </button>
          </div>

          {/* Rango de fechas */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b" style={{ borderColor: "var(--td-panel-border)" }}>
            <DateRangePicker
              from={from}
              to={to}
              maxValue={getTodayLocal()}
              ariaLabel="Rango de fechas de cortes"
              onChange={(f, t) => { setFrom(f); setTo(t); }}
            />
            <div className="ml-auto text-right">
              <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                {sessions.length} corte{sessions.length === 1 ? "" : "s"}
              </div>
              <div className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(totalVentas)}</div>
            </div>
          </div>

          {/* Lista de cortes */}
          <div className="flex-1 overflow-y-auto">
            {query.isLoading ? (
              <p className="text-xs py-10 text-center" style={{ color: "var(--td-text-lo)" }}>Cargando cortes…</p>
            ) : query.isError ? (
              <p className="text-xs py-10 text-center" style={{ color: "#DC2626" }}>No se pudieron cargar los cortes.</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs py-10 text-center" style={{ color: "var(--td-text-lo)" }}>Sin cortes en el periodo.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-widest sticky top-0" style={{ color: "var(--td-text-lo)", background: "var(--td-popup-bg, #18181b)" }}>
                    <th className="text-left py-2 px-4">Cajero · Caja</th>
                    <th className="text-left py-2 px-3">Apertura</th>
                    <th className="text-right py-2 px-3">Ventas</th>
                    <th className="text-right py-2 px-3">Descuadre</th>
                    <th className="text-right py-2 px-4">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const diff = s.difference ?? 0;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setSelected(s)}
                        className="border-t cursor-pointer hover:bg-white/5 transition-colors"
                        style={{ borderColor: "var(--td-panel-border)" }}
                      >
                        <td className="py-2.5 px-4">
                          <div className="font-bold" style={{ color: "var(--td-text-hi)" }}>{s.user.name}</div>
                          <div className="text-[10px]" style={{ color: "var(--td-text-lo)" }}>{s.register.name}</div>
                        </td>
                        <td className="py-2.5 px-3" style={{ color: "var(--td-text-md)" }}>{fmtDateTime(s.opened_at)}</td>
                        <td className="py-2.5 px-3 text-right font-black" style={{ color: "var(--td-text-hi)" }}>
                          {fmt(s.total_sales)}
                          <span className="text-[10px] font-normal ml-1" style={{ color: "var(--td-text-lo)" }}>· {s.sales_count}</span>
                          <span className="block text-[10px] font-normal" style={{ color: "var(--td-text-lo)" }}>
                            Caja {fmt(s.cash_collected)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold" style={{
                          color: s.status === "open" ? "var(--td-text-lo)" : (Math.abs(diff) < 0.01 ? "var(--td-text-lo)" : (diff < 0 ? "#DC2626" : "#10b981")),
                        }}>
                          {s.status === "open" ? "—" : (Math.abs(diff) < 0.01 ? "Cuadra" : `${diff >= 0 ? "+" : ""}${fmt(diff)}`)}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {s.status === "open" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest" style={{ color: "#FFAA00" }}>
                              <Clock size={11} /> Abierta
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                              <Lock size={11} /> Cerrada
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-5 py-3 border-t text-[10px]" style={{ borderColor: "var(--td-panel-border)", color: "var(--td-text-lo)" }}>
            Toca un corte para ver el detalle completo e imprimir.
          </div>
        </div>
      </div>

      {/* Detalle del corte seleccionado (reutiliza el modal del cierre, z-index 500 > 450) */}
      {selected && (
        <CashCloseSummaryModal session={selected} open onClose={() => setSelected(null)} />
      )}
    </>
  );
}
