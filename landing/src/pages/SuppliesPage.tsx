import { useEffect, useMemo, useState } from "react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBasket, Plus, Pencil, Loader2, Wallet, AlertTriangle, BarChart2, X,
} from "lucide-react";
import {
  createSupply, updateSupply, registerSupplyPurchase, getStores,
  type Supply, type Store, type SupplyMoneySource,
} from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { queryKeys } from "@/lib/queryKeys";
import { useSuppliesQuery, useSupplyMovementsQuery, useSupplyReportQuery } from "@/hooks/queries/useSupplies";
import { useActiveSessionQuery } from "@/hooks/queries/useCashSession";
import { isAdmin as isAdminRole, isManager as isManagerRole } from "@/lib/permisos";
import { getTodayLocal, BUSINESS_TZ } from "@/lib/date";
import { DateRangePicker } from "@/components/ui/DateRangePicker";

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

// ─── Origen del dinero de la compra ───────────────────────────────────────────
const MONEY_SOURCES: Array<{ key: SupplyMoneySource; label: string }> = [
  { key: "caja",       label: "Caja" },
  { key: "caja_chica", label: "Caja chica" },
  { key: "propio",     label: "Dinero propio" },
];

const SOURCE_COLORS: Record<SupplyMoneySource, { color: string; bg: string; border: string }> = {
  caja:       { color: "var(--td-text-md)", bg: "var(--td-surface-soft)",    border: "1px solid var(--td-card-border)" },
  caja_chica: { color: "#F59E0B",           bg: "rgba(245,158,11,0.10)",     border: "1px solid rgba(245,158,11,0.35)" },
  propio:     { color: "#60A5FA",           bg: "rgba(96,165,250,0.10)",     border: "1px solid rgba(96,165,250,0.35)" },
};

const sourceLabel = (source: SupplyMoneySource | null, payerName?: string | null): string => {
  if (source === "caja_chica") return "Caja chica";
  if (source === "propio") return payerName ? `Propio · ${payerName}` : "Propio";
  return "Caja";
};

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
  // Origen del dinero: 'caja' (default, sale del cajón y pega al corte) /
  // 'caja_chica' / 'propio' (con nombre de quién lo puso). Los dos últimos NO
  // exigen caja abierta ni tocan el corte — solo queda el registro.
  const [moneySource, setMoneySource] = useState<SupplyMoneySource>("caja");
  const [payerName, setPayerName] = useState("");
  const [saving, setSaving] = useState(false);
  const isCajaSource = moneySource === "caja";

  // Combobox de insumo con alta al vuelo (QA Joel 2026-07-16): teclear el
  // nombre filtra el catálogo; si no existe y eres admin/gerente, "Crear y
  // usarlo" lo da de alta ahí mismo (POST /supplies solo pide name) y lo deja
  // seleccionado — sin brincar a la pestaña Catálogo.
  const [supplyText, setSupplyText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creatingSupply, setCreatingSupply] = useState(false);
  const supplyMatches = useMemo(() => {
    const q = supplyText.trim().toLowerCase();
    if (!q) return activeSupplies.slice(0, 8);
    return activeSupplies
      .filter(s => s.name.toLowerCase().includes(q) || (s.category ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [activeSupplies, supplyText]);
  const exactMatch = useMemo(
    () => activeSupplies.find(s => s.name.trim().toLowerCase() === supplyText.trim().toLowerCase()) ?? null,
    [activeSupplies, supplyText],
  );

  const pickSupply = (s: Supply) => {
    setSupplyId(String(s.id));
    setSupplyText(s.name);
    setPickerOpen(false);
  };

  const createAndPick = async () => {
    const name = supplyText.trim();
    if (!name) return;
    setCreatingSupply(true);
    try {
      const created = await createSupply({ name });
      void queryClient.invalidateQueries({ queryKey: queryKeys.supplies.all });
      pickSupply(created);
      toast.success(`Insumo "${created.name}" creado y seleccionado`);
    } catch {
      toast.error("No se pudo crear el insumo");
    } finally {
      setCreatingSupply(false);
    }
  };

  const submitPurchase = async () => {
    const sid = Number(supplyId);
    const q = parseFloat(qty) || 0;
    const a = parseFloat(amount) || 0;
    if (!sid) { toast.error("Elige un insumo."); return; }
    if (q <= 0) { toast.error("La cantidad debe ser mayor a 0."); return; }
    if (a <= 0) { toast.error(isCajaSource ? "Captura cuánto efectivo salió de la caja." : "Captura cuánto costó."); return; }
    if (moneySource === "propio" && !payerName.trim()) { toast.error("Indica quién puso el dinero."); return; }
    setSaving(true);
    try {
      await registerSupplyPurchase({
        supply_id: sid, quantity: q, amount: a,
        ...(note.trim() ? { note: note.trim().slice(0, 255) } : {}),
        money_source: moneySource,
        ...(moneySource === "propio" ? { payer_name: payerName.trim().slice(0, 100) } : {}),
      });
      toast.success(isCajaSource
        ? `Compra registrada · salió ${fmt(a)} de tu caja`
        : `Compra registrada · ${fmt(a)} de ${sourceLabel(moneySource, payerName.trim())} (no toca tu corte)`);
      setQty("1"); setAmount(""); setNote(""); setPayerName("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.supplies.all });
      if (isCajaSource) {
        // El corte también cambia (salida nueva): invalidar el reporte de cortes
        // y el drill-down del corte abierto (keys reales — ["cash"] a secas no
        // prefixea ['reports','cash'] y dejaba números stale en Cortes).
        void queryClient.invalidateQueries({ queryKey: queryKeys.reports.cash() });
        void queryClient.invalidateQueries({ queryKey: ["cash-session-detail"] });
        void queryClient.invalidateQueries({ queryKey: ["cash"] });
      }
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo registrar la compra");
    } finally {
      setSaving(false);
    }
  };

  // ── Catálogo (modal alta/edición) ────────────────────────────────────────
  const [editing, setEditing] = useState<Supply | "new" | null>(null);

  // ── Reporte ──────────────────────────────────────────────────────────────
  // Rango default HOY→HOY (QA Joel 2026-07-18): el día operativo es lo que se
  // consulta a diario; días atrás se piden moviendo el rango.
  const [from, setFrom] = useState(getTodayLocal());
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
            Compras de operación con su origen: de tu caja (pega al corte), caja chica o dinero propio.
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
            {isCajaSource && !hasOpenSession && !sessionQuery.isLoading && (
              <div className="mb-4 flex items-start gap-2 rounded-2xl p-3"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
                <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "#F59E0B" }} />
                <p className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>
                  Con origen <b>Caja</b> necesitas una caja abierta — el efectivo sale de tu cajón y queda en tu corte.
                  Si el dinero salió de otro lado, cambia el origen abajo.
                </p>
              </div>
            )}

            <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Insumo</label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={supplyText}
                placeholder="Escribe el insumo (cinta, bolsas…)"
                data-testid="supply-combobox"
                onChange={e => { setSupplyText(e.target.value); setSupplyId(""); setPickerOpen(true); }}
                onFocus={() => setPickerOpen(true)}
                onBlur={() => window.setTimeout(() => setPickerOpen(false), 150)}
                onKeyDown={e => {
                  if (e.key === "Escape") { setPickerOpen(false); return; }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (exactMatch) { pickSupply(exactMatch); return; }
                    if (supplyMatches.length > 0) { pickSupply(supplyMatches[0]!); return; }
                    if (canManageCatalog && supplyText.trim()) void createAndPick();
                  }
                }}
                style={{ ...inputStyle, marginTop: 6 }}
              />
              {pickerOpen && (supplyMatches.length > 0 || (canManageCatalog && supplyText.trim() && !exactMatch)) && (
                <div
                  style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30, marginTop: 4, background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}
                >
                  {supplyMatches.map(s => (
                    <button
                      key={s.id}
                      onMouseDown={e => { e.preventDefault(); pickSupply(s); }}
                      className="w-full text-left px-4 py-2.5 text-[12px] font-bold transition-colors"
                      style={{ color: THI, background: String(s.id) === supplyId ? "var(--td-hover-bg)" : "transparent", border: "none", cursor: "pointer", display: "block" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--td-hover-bg)")}
                      onMouseLeave={e => (e.currentTarget.style.background = String(s.id) === supplyId ? "var(--td-hover-bg)" : "transparent")}
                    >
                      {s.name}
                      {(s.category || s.unit) && (
                        <span style={{ color: TLO, fontWeight: 600 }}>{s.category ? ` · ${s.category}` : ""}{s.unit ? ` (${s.unit})` : ""}</span>
                      )}
                    </button>
                  ))}
                  {canManageCatalog && supplyText.trim() && !exactMatch && (
                    <button
                      onMouseDown={e => { e.preventDefault(); void createAndPick(); }}
                      disabled={creatingSupply}
                      data-testid="supply-create-inline"
                      className="w-full text-left px-4 py-2.5 text-[12px] font-black transition-colors flex items-center gap-2"
                      style={{ color: "var(--td-red)", background: "rgba(224,34,26,0.06)", border: "none", borderTop: "1px solid var(--td-divider)", cursor: "pointer" }}
                    >
                      {creatingSupply ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} strokeWidth={3} />}
                      Crear "{supplyText.trim()}" y usarlo
                    </button>
                  )}
                </div>
              )}
            </div>
            {activeSupplies.length === 0 && !suppliesQuery.isLoading && !supplyText.trim() && (
              <p className="mt-1 text-[10px] font-bold" style={{ color: TLO }}>
                {canManageCatalog ? "No hay insumos aún — escribe el nombre y créalo aquí mismo." : "No hay insumos en el catálogo — pide a tu gerente que los dé de alta."}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Cantidad</label>
                <input type="number" min={0.01} step={1} value={qty} onChange={e => setQty(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>
                  {isCajaSource ? "Efectivo que salió ($)" : "Monto ($)"}
                </label>
                <input type="number" min={0.01} step={0.5} value={amount} onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") void submitPurchase(); }}
                  placeholder="80" style={{ ...inputStyle, marginTop: 6 }} />
              </div>
            </div>

            {/* Origen del dinero (QA Joel 2026-07-18): registro de quién pagó. */}
            <label className="mt-4 block text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>¿De dónde salió el dinero?</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {MONEY_SOURCES.map(s => {
                const active = moneySource === s.key;
                const c = SOURCE_COLORS[s.key];
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setMoneySource(s.key)}
                    data-testid={`money-source-${s.key}`}
                    className="rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-colors"
                    style={active
                      ? { background: c.bg, border: c.border, color: c.color === "var(--td-text-md)" ? THI : c.color, boxShadow: "inset 0 0 0 1px currentColor" }
                      : { background: SOFT, border: CARD_B, color: TLO, cursor: "pointer" }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            {moneySource === "propio" && (
              <input
                value={payerName}
                onChange={e => setPayerName(e.target.value)}
                maxLength={100}
                placeholder="¿Quién puso el dinero? ej. Mario"
                data-testid="payer-name-input"
                style={{ ...inputStyle, marginTop: 8 }}
              />
            )}
            {!isCajaSource && (
              <p className="mt-1.5 text-[10px] font-bold" style={{ color: TLO }}>
                Este origen no toca tu caja ni el corte — queda solo como registro del gasto.
              </p>
            )}

            <label className="mt-4 block text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Nota (opcional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={255} placeholder="ej. OXXO de enfrente" style={{ ...inputStyle, marginTop: 6 }} />

            <button
              onClick={() => void submitPurchase()}
              disabled={saving || (isCajaSource && !hasOpenSession)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-black uppercase tracking-widest disabled:opacity-40"
              style={{ background: "#10b981", color: "#04120c", border: "none", cursor: saving || (isCajaSource && !hasOpenSession) ? "not-allowed" : "pointer" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />}
              Registrar compra
            </button>
          </Motion.div>

          {/* Compras de HOY (QA Joel 2026-07-18): días anteriores se consultan
              en el tab Reporte con el rango. */}
          <div className="rounded-3xl p-6" style={{ background: PANEL, border: BORDER }}>
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest" style={{ color: TLO }}>Compras de hoy</p>
            {(() => {
              const today = getTodayLocal();
              const todayMovements = (movementsQuery.data ?? []).filter(m =>
                new Date(m.created_at).toLocaleDateString("en-CA", { timeZone: BUSINESS_TZ }) === today
              );
              return todayMovements.length === 0 ? (
              <p className="py-8 text-center text-[11px] font-bold" style={{ color: TLO }}>
                Sin compras hoy — en el tab Reporte puedes consultar días anteriores con el rango.
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
                {todayMovements.map(m => (
                  <div key={m.id} className="flex items-center gap-3 rounded-2xl px-4 py-2.5" style={{ background: CARD, border: CARD_B }}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-black" style={{ color: THI }}>{m.supply?.name ?? `#${m.supply_id}`}</p>
                      <p className="text-[10px] font-bold" style={{ color: TLO }}>
                        {new Date(m.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                        {m.user?.name ? ` · ${m.user.name}` : ""}{m.note ? ` · ${m.note}` : ""}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider"
                      style={{
                        color: SOURCE_COLORS[m.money_source ?? "caja"].color,
                        background: SOURCE_COLORS[m.money_source ?? "caja"].bg,
                        border: SOURCE_COLORS[m.money_source ?? "caja"].border,
                      }}
                    >
                      {sourceLabel(m.money_source, m.payer_name)}
                    </span>
                    <span className="text-[10px] font-bold" style={{ color: TLO }}>×{m.quantity}</span>
                    <span className="text-[13px] font-black" style={{ color: "var(--td-red)" }}>−{fmt(m.amount)}</span>
                  </div>
                ))}
              </div>
            );
            })()}
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
                      {" · "}
                      <span style={{ color: s.store_id != null ? "#60A5FA" : TLO }}>
                        {s.store_id != null ? "Solo una tienda" : "Toda la empresa"}
                      </span>
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
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Rango</label>
              <DateRangePicker
                from={from}
                to={to}
                onChange={(f, t) => { setFrom(f); setTo(t); }}
                maxValue={getTodayLocal()}
                ariaLabel="Rango del reporte de insumos"
              />
            </div>
            <div className="ml-auto text-right">
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TLO }}>Gasto total</p>
              <p className="text-2xl font-black" style={{ color: "var(--td-red)" }}>
                {reportQuery.isLoading ? "…" : fmt(reportQuery.data?.total ?? 0)}
              </p>
            </div>
          </div>

          {/* Desglose por origen del dinero */}
          {(reportQuery.data?.by_source ?? []).length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest" style={{ color: TLO }}>Por origen del dinero</p>
              <div className="flex flex-wrap gap-2">
                {(reportQuery.data?.by_source ?? []).map(s => (
                  <div key={s.source} className="flex items-center gap-2 rounded-2xl px-4 py-2.5"
                    style={{ background: SOURCE_COLORS[s.source]?.bg ?? CARD, border: SOURCE_COLORS[s.source]?.border ?? CARD_B }}>
                    <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: SOURCE_COLORS[s.source]?.color ?? TMD }}>
                      {sourceLabel(s.source)}
                    </span>
                    <span className="text-[13px] font-black" style={{ color: THI }}>{fmt(s.total)}</span>
                    <span className="text-[10px] font-bold" style={{ color: TLO }}>({s.purchases})</span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] font-bold" style={{ color: TLO }}>
                Solo las compras con origen <b>Caja</b> descuentan del corte; caja chica y dinero propio son gasto registrado fuera del cajón.
              </p>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest" style={{ color: TLO }}>Por categoría</p>
              {/* Scroll interno adaptable (QA Joel 2026-07-18): con muchos
                  insumos la página no crece infinita. */}
              <div className="overflow-y-auto pr-1" style={{ maxHeight: "56vh" }}>
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
            </div>
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest" style={{ color: TLO }}>Top insumos</p>
              <div className="overflow-y-auto pr-1" style={{ maxHeight: "56vh" }}>
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
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.roles);
  const [name, setName] = useState(supply?.name ?? "");
  const [category, setCategory] = useState(supply?.category ?? "");
  const [unit, setUnit] = useState(supply?.unit ?? "");
  const [isActive, setIsActive] = useState(supply?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  // Tienda del insumo: "" = toda la empresa (solo admin elige; gerente queda
  // forzado a la suya en el backend).
  const [storeSel, setStoreSel] = useState<string>(supply?.store_id != null ? String(supply.store_id) : "");
  const [stores, setStores] = useState<Store[]>([]);
  useEffect(() => {
    if (isAdmin) { void getStores().then(setStores).catch(() => {}); }
  }, [isAdmin]);

  const save = async () => {
    if (!name.trim()) { toast.error("El nombre es obligatorio."); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(unit.trim() ? { unit: unit.trim() } : {}),
        is_active: isActive,
        ...(isAdmin ? { store_id: storeSel ? parseInt(storeSel, 10) : null } : {}),
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
        <div>
          <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Tienda</label>
          {isAdmin ? (
            <select value={storeSel} onChange={e => setStoreSel(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} data-testid="supply-store-select">
              <option value="">Toda la empresa (todas las tiendas)</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <p className="text-[11px] font-black mt-2" style={{ color: TMD }}>Tu tienda (fijo para gerente)</p>
          )}
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
