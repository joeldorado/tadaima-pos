import { useState } from "react";
import {
  Calendar, ChevronDown, ChevronRight, RefreshCw, Wallet,
  CheckCircle2, AlertTriangle, Clock, Store, Printer, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@tadaima/auth";
import { getCashReport, getCashSessionDetail } from "@tadaima/api";
import type { CashReport, CashSessionReport, Store as StoreType } from "@tadaima/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { printCashCut } from "@/components/cash/CashCloseSummaryModal";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { getTodayLocal, daysAgoLocal, BUSINESS_TZ } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";

// ─── Design tokens (mismos de ReportsPage) ──────────────────────────────────
const BG  = "var(--td-page-bg)";
const RED = "#FF4422";
const GLASS: React.CSSProperties = {
  background: "var(--td-panel-bg)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
};
const INPUT: React.CSSProperties = {
  background: "var(--td-input-bg)",
  border: "1px solid var(--td-input-border)",
  color: "var(--td-input-text)",
};
const TP  = "var(--td-text-hi)";
const TS  = "var(--td-text-md)";
const TM  = "var(--td-text-lo)";
const DIV = "1px solid var(--td-divider)";
const SURFACE_SOFT = "var(--td-surface-soft)";
const SURFACE_MUTED = "var(--td-surface-muted)";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(n ?? 0);

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: BUSINESS_TZ }) : "—";

function KpiInline({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-right">
      <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: TS }}>{label}</p>
      <p className="text-sm font-black" style={{ color }}>{value}</p>
    </div>
  );
}

/** Celda de resumen monetario dentro del detalle expandido. */
function SummaryCell({ label, value, color, tag }: { label: string; value: string; color?: string | undefined; tag?: string | undefined }) {
  return (
    <div className="px-4 py-3 rounded-xl" style={{ background: SURFACE_MUTED, border: "1px solid var(--td-card-border)" }}>
      <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: TM }}>{label}</p>
      <p className="text-sm font-black flex items-center gap-2" style={{ color: color ?? TP }}>
        {value}
        {tag && (
          <span style={{
            fontSize: 8, fontWeight: 900, padding: "1px 6px", borderRadius: 6,
            background: `${color}22`, color, border: `1px solid ${color}40`,
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>{tag}</span>
        )}
      </p>
    </div>
  );
}

/**
 * Detalle expandido de un corte: resumen (abrió/cerró/descuadre) + tabla de
 * TODOS los tickets con fecha, items y pagos + preventa + movimientos.
 * Reemplaza al modal (Joel 2026-06-12: "que empuje y salga la tabla").
 */
function CorteDetail({ session: s }: { session: CashSessionReport }) {
  const detailQuery = useQuery({
    // Misma key que CashCloseSummaryModal → comparten cache.
    queryKey: ["cash-session-detail", s.id],
    queryFn: () => getCashSessionDetail(s.id),
    staleTime: 60_000,
  });
  const detail = detailQuery.data ?? null;

  const diff = s.difference ?? 0;
  const isClosed = s.closing_cash != null;
  const isMatch = isClosed && Math.abs(diff) < 0.01;
  const isShort = isClosed && diff < -0.01;
  const diffColor = !isClosed ? "#FFAA00" : isMatch ? "#10b981" : isShort ? "#DC2626" : "#f59e0b";
  const diffTag = !isClosed ? "Abierta" : isMatch ? "✓ Cuadra" : isShort ? "Falta" : "Sobra";

  const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: TM, textAlign: "left" };
  const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 11, color: TS, verticalAlign: "top" };

  return (
    <div className="px-6 pb-6 pt-2" style={{ background: SURFACE_SOFT }}>

      {/* ── Resumen del corte ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: TM }}>
          Resumen del corte · {fmtDateTime(s.opened_at)}{s.closed_at ? ` → ${fmtDateTime(s.closed_at)}` : " · sigue abierta"}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); printCashCut(s, detail); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95"
          style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: TP }}
          title="Imprimir corte 58mm con desglose"
        >
          <Printer size={12} />
          Imprimir
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2 mb-4">
        <SummaryCell label="Abrió con" value={fmt(s.opening_cash)} />
        <SummaryCell label={`Ventas totales (${s.sales_count})`} value={fmt(s.total_sales)} />
        <SummaryCell label="Cobrado en caja" value={`+${fmt(s.cash_collected)}`} color="#10b981" />
        <SummaryCell label="Preventas cobradas" value={fmt(s.total_pre_sale_payments)} color={s.total_pre_sale_payments > 0 ? "#F59E0B" : undefined} />
        <SummaryCell label="Entradas" value={`+${fmt(s.total_entradas)}`} color={s.total_entradas > 0 ? "#10b981" : undefined} />
        <SummaryCell label="Salidas de caja" value={`-${fmt(s.total_salidas)}`} color={s.total_salidas > 0 ? "#DC2626" : undefined} />
        <SummaryCell label="Ajustes" value={`${s.total_ajustes > 0 ? "+" : ""}${fmt(s.total_ajustes)}`} />
        <SummaryCell label="Esperado en caja" value={fmt(s.expected_cash)} />
        <SummaryCell label="Cerró con" value={isClosed ? fmt(s.closing_cash!) : "—"} />
        <SummaryCell
          label="Diferencia"
          value={isClosed ? `${diff >= 0 ? "+" : ""}${fmt(diff)}` : "—"}
          color={diffColor}
          tag={diffTag}
        />
      </div>

      {/* ── Tickets detallados ────────────────────────────────────────────── */}
      {detailQuery.isPending ? (
        <div className="flex items-center gap-2 py-6 justify-center" style={{ color: TM, fontSize: 11 }}>
          <Loader2 size={14} className="animate-spin" /> Cargando desglose del corte…
        </div>
      ) : !detail ? (
        <p className="py-6 text-center" style={{ color: "#DC2626", fontSize: 11 }}>No se pudo cargar el desglose.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--td-card-border)" }}>
            <div className="px-4 py-2.5" style={{ background: SURFACE_MUTED, borderBottom: DIV }}>
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: TM }}>
                Ventas del corte · {detail.tickets.length} ticket{detail.tickets.length === 1 ? "" : "s"}
              </p>
            </div>
            {detail.tickets.length === 0 ? (
              <p className="py-8 text-center" style={{ color: TM, fontSize: 11 }}>Sin ventas en esta sesión.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: DIV }}>
                    <th style={thStyle}>Ticket</th>
                    <th style={thStyle}>Fecha</th>
                    <th style={thStyle}>Cliente</th>
                    <th style={thStyle}>Artículos</th>
                    <th style={thStyle}>Pago</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.tickets.map(t => {
                    const cancelled = t.status === "returned" || t.cancellation_status === "full";
                    const partial = t.cancellation_status === "partial";
                    return (
                      <tr key={t.id} style={{ borderBottom: DIV, opacity: cancelled ? 0.55 : 1 }}>
                        <td style={{ ...tdStyle, fontWeight: 900, color: TP, whiteSpace: "nowrap" }}>
                          #{t.id}
                          {cancelled && <span className="block text-[8px] font-black uppercase" style={{ color: "#DC2626" }}>Cancelado</span>}
                          {partial && <span className="block text-[8px] font-black uppercase" style={{ color: "#F59E0B" }}>Canc. parcial</span>}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{fmtDateTime(t.sold_at)}</td>
                        <td style={tdStyle}>{t.customer ?? "—"}</td>
                        <td style={tdStyle}>
                          {t.items.map((i, idx) => (
                            <div key={idx} className="flex justify-between gap-3" style={{ padding: "1px 0" }}>
                              <span>{i.quantity} × {i.name}</span>
                              <span style={{ flexShrink: 0, color: TM }}>{fmt(i.total)}</span>
                            </div>
                          ))}
                          {t.discount > 0 && (
                            <div style={{ color: "#F59E0B", fontSize: 10 }}>Descuento −{fmt(t.discount)}</div>
                          )}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                          {t.payments.map((p, idx) => (
                            <div key={idx}>{p.method} {fmt(p.amount)}</div>
                          ))}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900, color: TP, whiteSpace: "nowrap" }}>{fmt(t.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Cobros de preventa dentro de la ventana del corte */}
          {detail.pre_sale_payments.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--td-card-border)" }}>
              <div className="px-4 py-2.5" style={{ background: "rgba(245,158,11,0.08)", borderBottom: DIV }}>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#F59E0B" }}>
                  Preventa · anticipos y liquidaciones
                </p>
              </div>
              <table className="w-full">
                <tbody>
                  {detail.pre_sale_payments.map(p => (
                    <tr key={p.id} style={{ borderBottom: DIV }}>
                      <td style={{ ...tdStyle, fontWeight: 900, color: TP }}>{p.folio}</td>
                      <td style={tdStyle}>{fmtDateTime(p.created_at)}</td>
                      <td style={tdStyle}>{p.method}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900, color: "#F59E0B" }}>+{fmt(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Movimientos de caja (entradas/salidas/ajustes) */}
          {detail.movements.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--td-card-border)" }}>
              <div className="px-4 py-2.5" style={{ background: SURFACE_MUTED, borderBottom: DIV }}>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: TM }}>
                  Movimientos de caja
                </p>
              </div>
              <table className="w-full">
                <tbody>
                  {detail.movements.map(m => (
                    <tr key={m.id} style={{ borderBottom: DIV }}>
                      <td style={{ ...tdStyle, textTransform: "capitalize" }}>{m.type}</td>
                      <td style={tdStyle}>{m.description ?? "—"}</td>
                      <td style={tdStyle}>{fmtDateTime(m.created_at)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900, color: m.type === "salida" ? "#DC2626" : "#10b981" }}>
                        {m.type === "salida" ? "-" : "+"}{fmt(m.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Página "Cortes" — cortes de caja con detalle inline, para los 3 roles.
 * Movida desde la pestaña "Cortes de Caja" de Reportes (solo-admin) para que
 * cajero y gerente tengan entrada en el menú (Joel 2026-06-12). El backend
 * acota GET /reports/cash por rol: cajero → sus cortes, gerente → su tienda,
 * admin → todo (con filtro de tienda opcional).
 */
export function CashCutsPage() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.some(r => ["admin", "super_admin", "owner", "dueño"].includes(r.toLowerCase())) ?? false;

  const queryClient = useQueryClient();
  const today = getTodayLocal();

  const [from, setFrom] = useState(today);
  const [to, setTo]     = useState(today);

  // Solo admin filtra por tienda; gerente/cajero quedan acotados por el backend.
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const storesQuery = useStoresQuery({ active: true, enabled: isAdmin });
  const stores: StoreType[] = storesQuery.data ?? [];

  const params = { from, to, ...(isAdmin && selectedStoreId ? { store_id: selectedStoreId } : {}) };
  const cashQuery = useQuery({
    queryKey: queryKeys.reports.cash(params),
    queryFn: () => getCashReport(params),
    staleTime: 30_000,
  });
  const cashReport: CashReport | null = cashQuery.data ?? null;
  const sessions = cashReport?.sessions ?? [];

  // Detalle inline: el corte expandido empuja la lista (sin modal).
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const presets: { label: string; from: string; to: string }[] = [
    { label: "Hoy",      from: today,           to: today },
    { label: "Ayer",     from: daysAgoLocal(1), to: daysAgoLocal(1) },
    { label: "7 días",   from: daysAgoLocal(6), to: today },
    { label: "Este mes", from: `${today.slice(0, 7)}-01`, to: today },
  ];

  return (
    <div className="min-h-screen" style={{ background: BG, color: TP }}>
      <div className="max-w-screen-xl mx-auto p-8 space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight mb-1" style={{ color: TP }}>
              Cortes de <span style={{ color: RED }}>Caja</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: TM }}>
              {isAdmin ? "Todas las tiendas" : "Según tu rol"} · Tadaima
              {!isAdmin && user?.store && (
                <span className="ml-2" style={{ color: RED }}>· {user.store.name}</span>
              )}
            </p>
          </div>
          <button
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: queryKeys.reports.cash() });
              void queryClient.invalidateQueries({ queryKey: ["cash-session-detail"] });
              toast.success("Actualizando cortes…");
            }}
            disabled={cashQuery.isFetching}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            style={{ background: SURFACE_SOFT, border: "1px solid var(--td-card-border)", color: TM }}
            title="Forzar refresh de los cortes"
          >
            <RefreshCw size={13} className={cashQuery.isFetching ? "animate-spin" : ""} />
            {cashQuery.isFetching && cashReport ? "Actualizando…" : "Actualizar"}
          </button>
        </div>

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap p-4 rounded-2xl" style={GLASS}>
          <Calendar size={15} style={{ color: RED }} />

          {presets.map(p => {
            const active = from === p.from && to === p.to;
            return (
              <button
                key={p.label}
                onClick={() => { setFrom(p.from); setTo(p.to); setExpandedId(null); }}
                className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                style={active
                  ? { background: "linear-gradient(135deg,#CC2200,#FF4422)", color: "#fff" }
                  : { background: SURFACE_SOFT, border: "1px solid var(--td-panel-border)", color: TM }}
              >
                {p.label}
              </button>
            );
          })}

          <div className="ml-2">
            <DateRangePicker
              from={from}
              to={to}
              maxValue={today}
              ariaLabel="Rango de fechas de cortes"
              onChange={(f, t) => { setFrom(f); setTo(t); setExpandedId(null); }}
            />
          </div>

          {isAdmin && stores.length > 0 && (
            <label className="flex items-center gap-2 ml-auto">
              <Store size={14} style={{ color: TM }} />
              <select
                value={selectedStoreId ?? ""}
                onChange={(e) => { setSelectedStoreId(e.target.value ? Number(e.target.value) : null); setExpandedId(null); }}
                className="px-3 py-2 rounded-xl text-xs"
                style={INPUT}
              >
                <option value="">Todas las tiendas</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
        </div>

        {/* ── Lista de cortes ─────────────────────────────────────────────── */}
        {cashQuery.isLoading ? (
          <div className="py-24 text-center" style={{ color: TM, fontSize: 12 }}>Cargando cortes…</div>
        ) : cashQuery.isError ? (
          <div className="py-24 text-center" style={{ color: "#DC2626", fontSize: 12 }}>No se pudieron cargar los cortes.</div>
        ) : cashReport && (
          <div style={{ ...GLASS, borderRadius: 24, overflow: "hidden" }}>
            <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: DIV }}>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TM }}>
                {cashReport.summary.total_sessions} sesiones · {cashReport.period.from} → {cashReport.period.to}
              </p>
              <div className="flex gap-4 items-center">
                <KpiInline label="Ventas total" value={fmt(cashReport.summary.total_sales)} color="#00CC66" />
                <KpiInline label="Cobrado en caja" value={fmt(cashReport.summary.total_cash_collected)} color="#10b981" />
                <KpiInline label="Entradas" value={fmt(cashReport.summary.total_entradas)} color="#FFAA00" />
                <KpiInline label="Salidas" value={fmt(cashReport.summary.total_salidas)} color={RED} />
              </div>
            </div>
            {sessions.length === 0 ? (
              <div className="py-20 text-center" style={{ color: TM, fontSize: 12 }}>
                Sin cortes en este período
              </div>
            ) : (
              <div>
                {sessions.map(s => {
                  const diff = s.difference ?? 0;
                  const isClosed = s.status === "closed";
                  const isMatch = isClosed && Math.abs(diff) < 0.01;
                  const isShort = isClosed && diff < -0.01;
                  const statusColor = !isClosed ? "#FFAA00" : isMatch ? "#10b981" : isShort ? "#DC2626" : "#f59e0b";
                  const statusBg    = !isClosed ? "rgba(255,170,0,0.1)" : isMatch ? "rgba(16,185,129,0.1)" : isShort ? "rgba(220,38,38,0.1)" : "rgba(245,158,11,0.1)";
                  const statusLabel = !isClosed ? "Abierta" : isMatch ? "Cuadra ✓" : isShort ? `Falta ${fmt(Math.abs(diff))}` : `Sobra ${fmt(diff)}`;
                  const expanded = expandedId === s.id;
                  return (
                    <div key={s.id} style={{ background: expanded ? SURFACE_MUTED : "transparent", borderTop: "1px solid var(--td-divider)" }}>
                      <button
                        onClick={() => setExpandedId(expanded ? null : s.id)}
                        className="w-full px-6 py-4 flex items-center gap-4 text-left transition-colors"
                        style={{ background: "transparent", border: "none", cursor: "pointer" }}
                      >
                        <div style={{
                          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                          background: statusBg, border: `1px solid ${statusColor}33`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {!isClosed ? <Clock size={18} color={statusColor} />
                            : isMatch ? <CheckCircle2 size={18} color={statusColor} />
                            : <AlertTriangle size={18} color={statusColor} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span style={{ fontSize: 13, fontWeight: 900, color: TP }}>#{s.id} · {s.register.name}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: TM }}>{s.user.name}</span>
                            {s.store?.name && <span style={{ fontSize: 9, fontWeight: 700, color: TM, opacity: 0.7 }}>· {s.store.name}</span>}
                          </div>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: TM }}>
                            {fmtDateTime(s.opened_at)}
                            {s.closed_at && ` → ${fmtDateTime(s.closed_at)}`}
                            {" · "}
                            {s.sales_count} ventas
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: TP }}>
                            {fmt(s.total_sales)}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 9, fontWeight: 800, color: TM }}>
                            Caja {fmt(s.cash_collected)}
                          </p>
                          <span style={{
                            display: "inline-block", marginTop: 2,
                            padding: "2px 8px", borderRadius: 6,
                            fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
                            background: statusBg, color: statusColor, border: `1px solid ${statusColor}40`,
                          }}>
                            {statusLabel}
                          </span>
                        </div>
                        {expanded
                          ? <ChevronDown size={16} style={{ color: TP }} />
                          : <ChevronRight size={16} style={{ color: TM, opacity: 0.4 }} />}
                      </button>
                      {expanded && <CorteDetail session={s} />}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-6 py-3 text-[10px]" style={{ borderTop: DIV, color: TM }}>
              <Wallet size={11} className="inline mr-1.5" style={{ verticalAlign: "-1px" }} />
              Toca un corte para desplegar el resumen y todas sus ventas detalladas.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
