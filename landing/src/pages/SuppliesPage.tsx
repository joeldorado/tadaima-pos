import { useMemo, useState } from "react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBasket, Plus, Pencil, Loader2, Wallet, AlertTriangle, BarChart2, X,
} from "lucide-react";
import {
  createSupply, updateSupply, registerSupplyPurchase,
  type Supply,
} from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { queryKeys } from "@/lib/queryKeys";
import { useSuppliesQuery, useSupplyMovementsQuery, useSupplyReportQuery } from "@/hooks/queries/useSupplies";
import { useActiveSessionQuery } from "@/hooks/queries/useCashSession";
import { isAdmin as isAdminRole, isManager as isManagerRole } from "@/lib/permisos";
import { getTodayLocal, daysAgoLocal } from "@/lib/date";

// ─── Tokens visuales (convención de páginas glass) ────────────────────────────
const PANEL  = "var(--td-panel-bg)";
const BORDER = "1px solid var(--td-panel-border)";
const CARD   = "var(--td-card-bg)";
const CARD_B = "1px solid var(--td-card-border)";
const SOFT   = "var(--td-surface-soft)";
const THI    = "var(--td-text-hi)";
const TMD    = "var(--td-text-md)";
const TLO    = "var(--td-text-lo)";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN",
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(n || 0);

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 14,
  border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)",
  color: THI, fontSize: 13, fontWeight: 700, outline: "none", boxSizing: "border-box",
};

type Tab = "comprar" | "catalogo" | "reporte";

/**
 * Insumos (Fase 2): compras de operación (cinta, bolsas…) pagadas con efectivo
 * de la caja. La compra crea la salida de caja linkeada en una transacción —
 * el corte del día la refleja solo. Catálogo administrable por admin/gerente;
 * reporte de gasto por categoría por rango.
 */
export function SuppliesPage() {
  const { user } = useAuth();
  const canManageCatalog = isAdminRole(user?.roles) || isManagerRole(user?.roles);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("comprar");

  const suppliesQuery = useSuppliesQuery(canManageCatalog ? { all: true } : undefined);
  const supplies = useMemo(() => suppliesQuery.data ?? [], [suppliesQuery.data]);
  const activeSupplies = useMemo(() => supplies.filter(s => s.is_active), [supplies]);
  const movementsQuery = useSupplyMovementsQuery({ type: "purchase" });
  const sessionQuery = useActiveSessionQuery();
  const hasOpenSession = !!sessionQuery.data;

  // ── Registrar compra ─────────────────────────────────────────────────────
  const [supplyId, setSupplyId] = useState<string>("");
  const [qty, setQty] = useState("1");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submitPurchase = async () => {
    const sid = Number(supplyId);
    const q = parseFloat(qty) || 0;
    const a = parseFloat(amount) || 0;
    if (!sid) { toast.error("Elige un insumo."); return; }
    if (q <= 0) { toast.error("La cantidad debe ser mayor a 0."); return; }
    if (a <= 0) { toast.error("Captura cuánto efectivo salió de la caja."); return; }
    setSaving(true);
    try {
      await registerSupplyPurchase({
        supply_id: sid, quantity: q, amount: a,
        ...(note.trim() ? { note: note.trim().slice(0, 255) } : {}),
      });
      toast.success(`Compra registrada · salió ${fmt(a)} de tu caja`);
      setQty("1"); setAmount(""); setNote("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.supplies.all });
      // El corte también cambia (salida nueva): invalidar el reporte de cortes
      // y el drill-down del corte abierto (keys reales — ["cash"] a secas no
      // prefixea ['reports','cash'] y dejaba números stale en Cortes).
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.cash() });
      void queryClient.invalidateQueries({ queryKey: ["cash-session-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["cash"] });
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo registrar la compra");
    } finally {
      setSaving(false);
    }
  };

  // ── Catálogo (modal alta/edición) ────────────────────────────────────────
  const [editing, setEditing] = useState<Supply | "new" | null>(null);

  // ── Reporte ──────────────────────────────────────────────────────────────
  const [from, setFrom] = useState(daysAgoLocal(30));
  const [to, setTo] = useState(getTodayLocal());
  const reportQuery = useSupplyReportQuery({ from, to }, tab === "reporte");

  const tabs: Array<{ key: Tab; label: string; icon: typeof Wallet }> = [
    { key: "comprar",  label: "Registrar compra", icon: Wallet },
    { key: "catalogo", label: "Catálogo",         icon: ShoppingBasket },
    { key: "reporte",  label: "Reporte",          icon: BarChart2 },
  ];

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <div className="rounded-2xl p-2.5" style={{ background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.3)" }}>
          <ShoppingBasket size={20} style={{ color: "var(--td-red)" }} />
        </div>
        <div>
          <h1 className="text-xl font-black uppercase tracking-wide" style={{ color: THI }}>Insumos</h1>
          <p className="text-[11px] font-bold" style={{ color: TMD }}>
            Compras de operación pagadas con efectivo de tu caja — aparecen solas en el corte.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mt-5 mb-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors"
            style={tab === t.key
              ? { background: "rgba(224,34,26,0.14)", border: "1px solid rgba(224,34,26,0.45)", color: "var(--td-red)" }
              : { background: SOFT, border: CARD_B, color: TLO }}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Registrar compra ── */}
      {tab === "comprar" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <Motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-6" style={{ background: PANEL, border: BORDER }}>
            {!hasOpenSession && !sessionQuery.isLoading && (
              <div className="mb-4 flex items-start gap-2 rounded-2xl p-3"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
                <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "#F59E0B" }} />
                <p className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>
                  Necesitas una <b>caja abierta</b> para registrar una compra — el efectivo sale de tu cajón y queda en tu corte.
                </p>
              </div>
            )}

            <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Insumo</label>
            <select value={supplyId} onChange={e => setSupplyId(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}>
              <option value="">— Elegir insumo —</option>
              {activeSupplies.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.category ? ` · ${s.category}` : ""}{s.unit ? ` (${s.unit})` : ""}
                </option>
              ))}
            </select>
            {activeSupplies.length === 0 && !suppliesQuery.isLoading && (
              <p className="mt-1 text-[10px] font-bold" style={{ color: TLO }}>
                No hay insumos en el catálogo{canManageCatalog ? " — créalos en la pestaña Catálogo." : " — pide a tu gerente que los dé de alta."}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Cantidad</label>
                <input type="number" min={0.01} step={1} value={qty} onChange={e => setQty(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Efectivo que salió ($)</label>
                <input type="number" min={0.01} step={0.5} value={amount} onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") void submitPurchase(); }}
                  placeholder="80" style={{ ...inputStyle, marginTop: 6 }} />
              </div>
            </div>

            <label className="mt-4 block text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Nota (opcional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={255} placeholder="ej. OXXO de enfrente" style={{ ...inputStyle, marginTop: 6 }} />

            <button
              onClick={() => void submitPurchase()}
              disabled={saving || !hasOpenSession}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-black uppercase tracking-widest disabled:opacity-40"
              style={{ background: "#10b981", color: "#04120c", border: "none", cursor: saving || !hasOpenSession ? "not-allowed" : "pointer" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />}
              Registrar compra
            </button>
          </Motion.div>

          {/* Compras recientes */}
          <div className="rounded-3xl p-6" style={{ background: PANEL, border: BORDER }}>
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest" style={{ color: TLO }}>Compras recientes</p>
            {(movementsQuery.data ?? []).length === 0 ? (
              <p className="py-8 text-center text-[11px] font-bold" style={{ color: TLO }}>Sin compras registradas todavía.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
                {(movementsQuery.data ?? []).map(m => (
                  <div key={m.id} className="flex items-center gap-3 rounded-2xl px-4 py-2.5" style={{ background: CARD, border: CARD_B }}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-black" style={{ color: THI }}>{m.supply?.name ?? `#${m.supply_id}`}</p>
                      <p className="text-[10px] font-bold" style={{ color: TLO }}>
                        {new Date(m.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                        {m.user?.name ? ` · ${m.user.name}` : ""}{m.note ? ` · ${m.note}` : ""}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold" style={{ color: TLO }}>×{m.quantity}</span>
                    <span className="text-[13px] font-black" style={{ color: "var(--td-red)" }}>−{fmt(m.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Catálogo ── */}
      {tab === "catalogo" && (
        <div className="rounded-3xl p-6" style={{ background: PANEL, border: BORDER }}>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TLO }}>
              {supplies.length} insumo{supplies.length !== 1 ? "s" : ""}
            </p>
            {canManageCatalog && (
              <button onClick={() => setEditing("new")}
                className="flex items-center gap-1.5 rounded-2xl px-4 py-2 text-[11px] font-black uppercase tracking-widest"
                style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399" }}>
                <Plus size={13} /> Nuevo insumo
              </button>
            )}
          </div>
          {suppliesQuery.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: TLO }} /></div>
          ) : supplies.length === 0 ? (
            <p className="py-8 text-center text-[11px] font-bold" style={{ color: TLO }}>
              Catálogo vacío{canManageCatalog ? ' — da de alta el primero con "Nuevo insumo".' : "."}
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {supplies.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: CARD, border: CARD_B, opacity: s.is_active ? 1 : 0.5 }}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-black" style={{ color: THI }}>{s.name}</p>
                    <p className="text-[10px] font-bold" style={{ color: TLO }}>
                      {s.category ?? "Sin categoría"}{s.unit ? ` · ${s.unit}` : ""}{!s.is_active ? " · inactivo" : ""}
                    </p>
                  </div>
                  {canManageCatalog && (
                    <button onClick={() => setEditing(s)} className="rounded-lg p-1.5 hover:bg-white/10" title="Editar">
                      <Pencil size={13} style={{ color: TMD }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Reporte ── */}
      {tab === "reporte" && (
        <div className="rounded-3xl p-6" style={{ background: PANEL, border: BORDER }}>
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Desde</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, marginTop: 6, width: 170 }} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Hasta</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, marginTop: 6, width: 170 }} />
            </div>
            <div className="ml-auto text-right">
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TLO }}>Gasto total</p>
              <p className="text-2xl font-black" style={{ color: "var(--td-red)" }}>
                {reportQuery.isLoading ? "…" : fmt(reportQuery.data?.total ?? 0)}
              </p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest" style={{ color: TLO }}>Por categoría</p>
              {(reportQuery.data?.by_category ?? []).length === 0 ? (
                <p className="py-6 text-center text-[11px] font-bold" style={{ color: TLO }}>Sin compras en el rango.</p>
              ) : (reportQuery.data?.by_category ?? []).map(c => (
                <div key={c.category} className="mb-2 flex items-center justify-between rounded-2xl px-4 py-2.5" style={{ background: CARD, border: CARD_B }}>
                  <div>
                    <p className="text-[12px] font-black" style={{ color: THI }}>{c.category}</p>
                    <p className="text-[10px] font-bold" style={{ color: TLO }}>{c.purchases} compra{c.purchases !== 1 ? "s" : ""}</p>
                  </div>
                  <span className="text-[14px] font-black" style={{ color: THI }}>{fmt(c.total)}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest" style={{ color: TLO }}>Top insumos</p>
              {(reportQuery.data?.top_supplies ?? []).map(t => (
                <div key={t.id} className="mb-2 flex items-center justify-between rounded-2xl px-4 py-2.5" style={{ background: CARD, border: CARD_B }}>
                  <div>
                    <p className="text-[12px] font-black" style={{ color: THI }}>{t.name}</p>
                    <p className="text-[10px] font-bold" style={{ color: TLO }}>{t.purchases} compra{t.purchases !== 1 ? "s" : ""} · {t.quantity} uds</p>
                  </div>
                  <span className="text-[14px] font-black" style={{ color: THI }}>{fmt(t.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal alta/edición de insumo */}
      {editing !== null && (
        <SupplyFormModal
          key={editing === "new" ? "new" : editing.id}
          supply={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.supplies.all });
          }}
        />
      )}
    </div>
  );
}

// ─── Modal de alta/edición del catálogo ───────────────────────────────────────
function SupplyFormModal({ supply, onClose, onSaved }: {
  supply: Supply | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(supply?.name ?? "");
  const [category, setCategory] = useState(supply?.category ?? "");
  const [unit, setUnit] = useState(supply?.unit ?? "");
  const [isActive, setIsActive] = useState(supply?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("El nombre es obligatorio."); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(unit.trim() ? { unit: unit.trim() } : {}),
        is_active: isActive,
      };
      if (supply) await updateSupply(supply.id, payload);
      else await createSupply(payload);
      toast.success(supply ? "Insumo actualizado" : "Insumo creado");
      onSaved();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo guardar el insumo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <Motion.div initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-sm rounded-3xl p-6 flex flex-col gap-4"
        style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: THI }}>
            {supply ? "Editar insumo" : "Nuevo insumo"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Cerrar">
            <X size={16} style={{ color: TLO }} />
          </button>
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Cinta canela" style={{ ...inputStyle, marginTop: 6 }} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Categoría</label>
            <input value={category} onChange={e => setCategory(e.target.value)} maxLength={50} placeholder="Empaque" style={{ ...inputStyle, marginTop: 6 }} />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Unidad</label>
            <input value={unit} onChange={e => setUnit(e.target.value)} maxLength={20} placeholder="rollo" style={{ ...inputStyle, marginTop: 6 }} />
          </div>
        </div>
        {supply && (
          <label className="flex items-center gap-2 text-[11px] font-bold" style={{ color: TMD }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Activo (aparece en el selector de compras)
          </label>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-xl px-4 py-2.5 text-xs font-black uppercase"
            style={{ border: "1px solid var(--td-input-border)", color: TMD, background: "transparent" }}>
            Cancelar
          </button>
          <button onClick={() => void save()} disabled={saving}
            className="flex-1 rounded-xl px-4 py-2.5 text-xs font-black uppercase disabled:opacity-40"
            style={{ background: "#10b981", color: "#04120c", border: "none" }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </Motion.div>
    </div>
  );
}
