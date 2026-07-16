// @ts-nocheck
import { useState, useMemo } from "react";
import {
  Search, Trash2, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight,
  Loader2, Filter,
} from "lucide-react";
import { useSaleCancellationsQuery } from "@/hooks/queries/useSaleCancellations";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { useUsersQuery } from "@/hooks/queries/useUsers";
import { daysAgoLocal, getTodayLocal } from "@/lib/date";
import { DateRangePicker } from "@/components/ui/DateRangePicker";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n || 0);

const REASON_LABELS: Record<string, string> = {
  cliente_devuelve: "Cliente devuelve",
  error_cajero:     "Error cajero",
  "dañado":         "Producto dañado",
  no_llego:         "No llegó",
  otro:             "Otro",
};

const MODE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  full:                  { label: "Total",                color: "#f87171", bg: "rgba(239,68,68,0.12)" },
  partial_items:         { label: "Parcial",              color: "#fbbf24", bg: "rgba(245,158,11,0.12)" },
  liquidation_rollback:  { label: "Rollback liquidación", color: "#a78bfa", bg: "rgba(139,92,246,0.12)" },
};

/**
 * ADR-016 Fase 4 — Vista admin del log de cancelaciones.
 * Tabla full-screen con filtros (rango, motivo, cajero, tienda) y expand
 * por fila para ver items_snapshot detallado.
 */
export function TabCancelaciones() {
  const [from, setFrom]               = useState(daysAgoLocal(30));
  const [to, setTo]                   = useState(getTodayLocal());
  const [reasonCode, setReasonCode]   = useState<string>("");
  const [cancelledBy, setCancelledBy] = useState<number | "">("");
  const [storeId, setStoreId]         = useState<number | "">("");
  const [search, setSearch]           = useState("");
  const [page, setPage]               = useState(1);
  const [expanded, setExpanded]       = useState<number | null>(null);

  const storesQuery = useStoresQuery({ active: true });
  const usersQuery  = useUsersQuery();

  const cancellationsQuery = useSaleCancellationsQuery({
    from, to,
    ...(reasonCode ? { reason_code: reasonCode as any } : {}),
    ...(cancelledBy ? { cancelled_by: cancelledBy } : {}),
    ...(storeId ? { store_id: storeId } : {}),
    per_page: 50,
    page,
  });

  const cancellations = cancellationsQuery.data?.data ?? [];
  const pagination    = cancellationsQuery.data?.pagination;

  const filtered = useMemo(() => {
    if (!search.trim()) return cancellations;
    const q = search.toLowerCase();
    return cancellations.filter(c =>
      String(c.sale_id ?? "").includes(q) ||
      c.pre_sale_order?.code?.toLowerCase().includes(q) ||
      c.cancelled_by?.name?.toLowerCase().includes(q) ||
      c.reason_text?.toLowerCase().includes(q)
    );
  }, [cancellations, search]);

  const totalRefunded = cancellations.reduce((s, c) => s + c.amount_refunded, 0);

  return (
    <div className="h-full flex flex-col" style={{ padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.30)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Trash2 size={18} color="#f87171" />
        </div>
        <div>
          <h2 style={{ color: "var(--td-text-hi)", fontSize: 16, fontWeight: 900, margin: 0 }}>Log de Cancelaciones</h2>
          <p style={{ color: "var(--td-text-lo)", fontSize: 10, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            SALE_CANCELLATIONS · {pagination?.total ?? 0} eventos · {fmt(totalRefunded)} reversado
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl p-3 mb-4 flex flex-wrap gap-2 items-end" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
        {/* Rango con el picker compartido (estándar del proyecto para rangos).
            Div (no <label> Field): un label envolviendo el AriaButton duplica el press. */}
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Rango</span>
          <DateRangePicker
            from={from}
            to={to}
            onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }}
            maxValue={getTodayLocal()}
            ariaLabel="Rango de cancelaciones"
          />
        </div>
        <Field label="Motivo">
          <select value={reasonCode} onChange={e => { setReasonCode(e.target.value); setPage(1); }} style={inputStyle}>
            <option value="">Todos</option>
            {Object.entries(REASON_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </Field>
        <Field label="Cajero">
          <select value={cancelledBy} onChange={e => { setCancelledBy(e.target.value === "" ? "" : Number(e.target.value)); setPage(1); }} style={inputStyle}>
            <option value="">Todos</option>
            {(usersQuery.data ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Tienda">
          <select value={storeId} onChange={e => { setStoreId(e.target.value === "" ? "" : Number(e.target.value)); setPage(1); }} style={inputStyle}>
            <option value="">Todas</option>
            {(storesQuery.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Buscar">
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--td-text-lo)", pointerEvents: "none" }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ID / folio / cajero…"
              style={{ ...inputStyle, paddingLeft: 24, minWidth: 180 }}
            />
          </div>
        </Field>
        <button
          onClick={() => { setReasonCode(""); setCancelledBy(""); setStoreId(""); setSearch(""); setPage(1); }}
          className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest"
          style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-text-lo)" }}
        >
          <Filter size={12} className="inline mr-1" /> Reset
        </button>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto rounded-2xl" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
        {cancellationsQuery.isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin" style={{ color: "#f87171" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 opacity-40 gap-2">
            <Trash2 size={28} />
            <p className="text-xs font-bold uppercase tracking-widest">Sin cancelaciones en el filtro</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead style={{ background: "rgba(0,0,0,0.2)", position: "sticky", top: 0 }}>
              <tr className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                <th className="text-left py-2 px-3 w-8"></th>
                <th className="text-left py-2 px-3">Fecha</th>
                <th className="text-left py-2 px-3">Tipo</th>
                <th className="text-left py-2 px-3">Referencia</th>
                <th className="text-left py-2 px-3">Modo</th>
                <th className="text-left py-2 px-3">Motivo</th>
                <th className="text-left py-2 px-3">Cajero</th>
                <th className="text-right py-2 px-3">Monto reversado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const isOpen = expanded === c.id;
                const ref = c.sale_id ? `Venta #${c.sale_id}` : c.pre_sale_order?.code ?? "—";
                const tipo = c.sale_id ? "Venta" : "Preventa";
                const mode = MODE_LABELS[c.mode] ?? { label: c.mode, color: "#aaa", bg: "transparent" };
                return (
                  <>
                    <tr
                      key={c.id}
                      onClick={() => setExpanded(isOpen ? null : c.id)}
                      className="border-t cursor-pointer hover:bg-white/[0.02]"
                      style={{ borderColor: "var(--td-divider)" }}
                    >
                      <td className="py-2 px-3"><ChevronRight size={12} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", color: isOpen ? "#f87171" : "var(--td-text-lo)" }} /></td>
                      <td className="py-2 px-3" style={{ color: "var(--td-text-md)" }}>{new Date(c.cancelled_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="py-2 px-3" style={{ color: "var(--td-text-md)" }}>{tipo}</td>
                      <td className="py-2 px-3 font-black" style={{ color: "var(--td-text-hi)" }}>{ref}</td>
                      <td className="py-2 px-3">
                        <span className="text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5" style={{ background: mode.bg, color: mode.color, border: `1px solid ${mode.color}33` }}>
                          {mode.label}
                        </span>
                      </td>
                      <td className="py-2 px-3" style={{ color: "var(--td-text-md)" }}>{REASON_LABELS[c.reason_code] ?? c.reason_code}</td>
                      <td className="py-2 px-3" style={{ color: "var(--td-text-md)" }}>{c.cancelled_by?.name ?? "—"}</td>
                      <td className="py-2 px-3 text-right font-black" style={{ color: "#f87171" }}>{fmt(c.amount_refunded)}</td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: "rgba(0,0,0,0.18)" }}>
                        <td colSpan={8} className="px-6 py-3">
                          {c.reason_text && (
                            <p className="text-xs mb-3" style={{ color: "var(--td-text-md)" }}>
                              <span className="font-black uppercase tracking-widest text-[9px] mr-2" style={{ color: "var(--td-text-lo)" }}>Notas</span>
                              {c.reason_text}
                            </p>
                          )}
                          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--td-text-lo)" }}>Items cancelados (snapshot)</p>
                          <div className="rounded-xl overflow-hidden" style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-divider)" }}>
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr style={{ color: "var(--td-text-lo)" }}>
                                  <th className="text-left py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Producto</th>
                                  <th className="text-left py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">SKU</th>
                                  <th className="text-right py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Qty</th>
                                  <th className="text-right py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Precio</th>
                                  <th className="text-right py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Costo</th>
                                  <th className="text-right py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.items_snapshot.map((it, idx) => (
                                  <tr key={idx} className="border-t" style={{ borderColor: "var(--td-divider)" }}>
                                    <td className="py-1.5 px-3" style={{ color: "var(--td-text-hi)" }}>{it.name}</td>
                                    <td className="py-1.5 px-3 font-mono text-[10px]" style={{ color: "var(--td-text-lo)" }}>{it.sku ?? "—"}</td>
                                    <td className="py-1.5 px-3 text-right" style={{ color: "var(--td-text-md)" }}>{it.qty_cancelled}</td>
                                    <td className="py-1.5 px-3 text-right" style={{ color: "var(--td-text-md)" }}>{fmt(it.price)}</td>
                                    <td className="py-1.5 px-3 text-right" style={{ color: it.cost != null ? "#fbbf24" : "var(--td-text-lo)" }}>{it.cost != null ? fmt(it.cost) : "—"}</td>
                                    <td className="py-1.5 px-3 text-right font-black" style={{ color: "#f87171" }}>{fmt(it.line_total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {c.cash_movement_id && (
                            <p className="text-[10px] mt-2" style={{ color: "var(--td-text-lo)" }}>
                              Salida de caja: <span className="font-black" style={{ color: "var(--td-text-md)" }}>cash_movement #{c.cash_movement_id}</span>
                              {c.cash_session_id && <> · sesión #{c.cash_session_id}</>}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {pagination && pagination.last_page > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button onClick={() => setPage(1)} disabled={page <= 1} style={pageBtnStyle}><ChevronsLeft size={12} /></button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={pageBtnStyle}><ChevronLeft size={12} /></button>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
            {pagination.current_page} / {pagination.last_page}
          </span>
          <button onClick={() => setPage(p => Math.min(pagination.last_page, p + 1))} disabled={page >= pagination.last_page} style={pageBtnStyle}><ChevronRight size={12} /></button>
          <button onClick={() => setPage(pagination.last_page)} disabled={page >= pagination.last_page} style={pageBtnStyle}><ChevronsRight size={12} /></button>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--td-input-bg)",
  border: "1px solid var(--td-input-border)",
  borderRadius: 8,
  color: "var(--td-input-text)",
  outline: "none",
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 700,
};

const pageBtnStyle: React.CSSProperties = {
  background: "var(--td-card-bg)",
  border: "1px solid var(--td-card-border)",
  borderRadius: 8,
  padding: "6px 8px",
  cursor: "pointer",
  color: "var(--td-text-md)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>{label}</span>
      {children}
    </label>
  );
}
