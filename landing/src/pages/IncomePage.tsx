import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Loader2, Wallet, AlertTriangle, Trash2, Banknote, CreditCard, Landmark,
} from "lucide-react";
import {
  registerIncome, deleteIncomeMovement,
  type IncomeType, type IncomePaymentMethod,
} from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { queryKeys } from "@/lib/queryKeys";
import { useIncomeMovementsQuery } from "@/hooks/queries/useIncome";
import { useActiveSessionQuery } from "@/hooks/queries/useCashSession";
import { isAdmin as isAdminRole } from "@/lib/permisos";
import { getTodayLocal } from "@/lib/date";
import { DateRangePicker } from "@/components/ui/DateRangePicker";

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

type Tab = "registrar" | "historial";

const INCOME_TYPES: Array<{ key: IncomeType; label: string }> = [
  { key: "service_fee",      label: "Comisión/Servicio" },
  { key: "equipment_sale",   label: "Venta de Equipo" },
  { key: "vendor_refund",    label: "Dev. Proveedor" },
  { key: "other",            label: "Otro" },
];

const TYPE_COLORS: Record<IncomeType, { color: string; bg: string; border: string }> = {
  service_fee:    { color: "#34d399", bg: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.35)" },
  equipment_sale: { color: "#60a5fa", bg: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.35)" },
  vendor_refund:  { color: "#fbbf24", bg: "rgba(251,191,36,0.10)",  border: "1px solid rgba(251,191,36,0.35)" },
  other:          { color: TMD,       bg: SOFT,                     border: CARD_B },
};

const typeLabel = (type: IncomeType): string => {
  const found = INCOME_TYPES.find(t => t.key === type);
  return found?.label || type;
};

const PAYMENT_METHODS: Array<{ key: IncomePaymentMethod; label: string; icon: typeof Banknote }> = [
  { key: "cash",     label: "Efectivo",  icon: Banknote },
  { key: "card",     label: "Tarjeta",   icon: CreditCard },
  { key: "transfer", label: "Depósito",  icon: Landmark },
];

const paymentMethodLabel = (pm: IncomePaymentMethod): string =>
  PAYMENT_METHODS.find(p => p.key === pm)?.label || pm;

export function IncomePage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.roles);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("registrar");
  // El rango viaja al servidor: el historial nunca filtra sobre lo que ya cargó.
  const [from, setFrom] = useState(getTodayLocal());
  const [to, setTo] = useState(getTodayLocal());
  const movementsQuery = useIncomeMovementsQuery({ from, to });
  const sessionQuery = useActiveSessionQuery();
  const hasOpenSession = !!sessionQuery.data;

  // ── Registrar ingreso ────────────────────────────────────────────────────
  const [type, setType] = useState<IncomeType>("service_fee");
  const [paymentMethod, setPaymentMethod] = useState<IncomePaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submitIncome = async () => {
    const a = parseFloat(amount) || 0;
    if (a <= 0) { toast.error("El monto debe ser mayor a 0."); return; }
    if (!type) { toast.error("Elige el tipo de ingreso."); return; }

    setSaving(true);
    try {
      await registerIncome({
        type,
        amount: a,
        payment_method: paymentMethod,
        ...(description.trim() ? { description: description.trim().slice(0, 255) } : {}),
      });
      toast.success(`+${fmt(a)} registrado`);
      setAmount(""); setDescription(""); setType("service_fee"); setPaymentMethod("cash");
      void queryClient.invalidateQueries({ queryKey: queryKeys.income.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.cash() });
      void queryClient.invalidateQueries({ queryKey: ["cash"] });
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo registrar");
    } finally {
      setSaving(false);
    }
  };

  // ── Borrar ingreso ──────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const handleDelete = async (id: number) => {
    if (!window.confirm("¿Borrar este ingreso? Es definitivo.")) return;
    setDeletingId(id);
    try {
      await deleteIncomeMovement(id);
      toast.success("Ingreso borrado");
      void queryClient.invalidateQueries({ queryKey: queryKeys.income.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.cash() });
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo borrar");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredMovements = movementsQuery.data ?? [];

  const tabs: Array<{ key: Tab; label: string; icon: typeof Wallet }> = [
    { key: "registrar",   label: "Registrar ingreso", icon: Wallet },
    { key: "historial",   label: "Historial",        icon: Wallet },
  ];

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <div className="rounded-2xl p-2.5" style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}>
          <Wallet size={20} style={{ color: "#34d399" }} />
        </div>
        <div>
          <h1 className="text-xl font-black uppercase tracking-wide" style={{ color: THI }}>Ingresos</h1>
          <p className="text-[11px] font-bold" style={{ color: TMD }}>
            Registra dinero que entra a tu caja: comisiones, ventas de equipo, devoluciones, etc.
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
              ? { background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.45)", color: "#34d399" }
              : { background: SOFT, border: CARD_B, color: TLO }}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Registrar ingreso */}
      {tab === "registrar" && (
        <div className="rounded-3xl p-6" style={{ background: PANEL, border: BORDER }}>
          {!hasOpenSession && !sessionQuery.isLoading && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl p-3"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
              <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "#F59E0B" }} />
              <p className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>
                Necesitas una caja abierta para registrar ingresos.
              </p>
            </div>
          )}

          <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Tipo de ingreso</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {INCOME_TYPES.map(t => {
              const active = type === t.key;
              const c = TYPE_COLORS[t.key];
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className="rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors"
                  style={active
                    ? { background: c.bg, border: c.border, color: c.color, boxShadow: "inset 0 0 0 1px currentColor" }
                    : { background: SOFT, border: CARD_B, color: TLO, cursor: "pointer" }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <label className="mt-4 block text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>¿Cómo entró el dinero?</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(pm => {
              const active = paymentMethod === pm.key;
              return (
                <button
                  key={pm.key}
                  type="button"
                  onClick={() => setPaymentMethod(pm.key)}
                  className="flex flex-col items-center gap-1 rounded-2xl px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors"
                  style={active
                    ? { background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.45)", color: "#34d399" }
                    : { background: SOFT, border: CARD_B, color: TLO, cursor: "pointer" }}
                >
                  <pm.icon size={15} />
                  {pm.label}
                </button>
              );
            })}
          </div>
          {paymentMethod !== "cash" && (
            <p className="mt-1.5 text-[10px] font-bold" style={{ color: TLO }}>
              No afecta el conteo de efectivo de tu corte — solo queda registrado.
            </p>
          )}

          <label className="mt-4 block text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Monto ($)</label>
          <input type="number" min={0.01} step={0.5} value={amount} onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void submitIncome(); }}
            placeholder="500" style={{ ...inputStyle, marginTop: 6 }} />

          <label className="mt-4 block text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Descripción (opcional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} maxLength={255}
            placeholder="Detalles del ingreso" style={{ ...inputStyle, marginTop: 6 }} />

          <button
            onClick={() => void submitIncome()}
            disabled={saving || !hasOpenSession}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-black uppercase tracking-widest disabled:opacity-40"
            style={{ background: "#34d399", color: "#0d3b2f", border: "none", cursor: saving || !hasOpenSession ? "not-allowed" : "pointer" }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Registrar ingreso
          </button>
        </div>
      )}

      {/* TAB: Historial */}
      {tab === "historial" && (
        <div className="rounded-3xl p-6" style={{ background: PANEL, border: BORDER }}>
          <div className="mb-4">
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Rango</label>
            <DateRangePicker
              from={from}
              to={to}
              onChange={(f, t) => { setFrom(f); setTo(t); }}
              maxValue={getTodayLocal()}
              ariaLabel="Rango del historial"
            />
          </div>

          {movementsQuery.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: TLO }} /></div>
          ) : filteredMovements.length === 0 ? (
            <p className="py-8 text-center text-[11px] font-bold" style={{ color: TLO }}>Sin ingresos en el rango.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredMovements.map(m => (
                <div key={m.id} className="flex items-center gap-3 rounded-2xl px-4 py-2.5" style={{ background: CARD, border: CARD_B }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black" style={{ color: THI }}>
                      {typeLabel(m.type)} <span style={{ color: TLO, fontWeight: 700 }}>· {paymentMethodLabel(m.payment_method)}</span>
                    </p>
                    <p className="text-[10px] font-bold" style={{ color: TLO }}>
                      {new Date(m.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                      {m.user?.name ? ` · ${m.user.name}` : ""}
                      {m.description ? ` · ${m.description}` : ""}
                    </p>
                  </div>
                  <span className="text-[13px] font-black" style={{ color: "#34d399" }}>+{fmt(m.amount)}</span>
                  {isAdmin && (
                    <button
                      onClick={() => void handleDelete(m.id)}
                      disabled={deletingId === m.id}
                      title="Borrar"
                      className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-white/10 disabled:opacity-40"
                    >
                      {deletingId === m.id
                        ? <Loader2 size={13} className="animate-spin" style={{ color: TLO }} />
                        : <Trash2 size={13} style={{ color: "#34d399" }} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
