import { useState, useEffect, useMemo, useRef } from "react";
import {
  Archive, Plus, Search, X, CheckCircle2, Clock, Truck,
  XCircle, Loader2, CreditCard, User, Package, Calendar,
  DollarSign, AlertCircle, ChevronRight, Banknote,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  getLayaways, getLayaway, addLayawayPayment, cancelLayaway, deliverLayaway,
  getPaymentMethods, getProducts, getCustomers,
} from "@tadaima/api";
import type { Layaway, LayawayStatus, PaymentMethod, Product, Customer } from "@tadaima/api";
import { useActiveStore } from "@/contexts/StoreContext";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const BG   = "var(--td-page-bg)";
const RED  = "#FF4422";
const T = {
  glass: {
    background: "var(--td-panel-bg)",
    backdropFilter: "blur(28px) saturate(160%)",
    WebkitBackdropFilter: "blur(28px) saturate(160%)",
    border: "1px solid var(--td-panel-border)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
  } as React.CSSProperties,
  glassMd: {
    background: "var(--td-card-bg)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid var(--td-card-border)",
  } as React.CSSProperties,
  btnRed: {
    background: "linear-gradient(135deg, #CC2200 0%, #FF4422 100%)",
    borderRadius: "9999px",
    border: "1px solid rgba(255,120,90,0.3)",
    boxShadow: "0 0 28px rgba(204,34,0,0.4), 0 6px 18px rgba(0,0,0,0.4)",
    color: "#fff",
  } as React.CSSProperties,
  input: {
    background: "var(--td-input-bg)",
    border: "1px solid var(--td-input-border)",
    borderRadius: 14,
    color: "var(--td-input-text)",
    outline: "none",
    padding: "10px 14px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  TP: "var(--td-text-hi)",
  TS: "var(--td-text-md)",
  TM: "var(--td-text-lo)",
  DIV: "1px solid var(--td-divider)",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n || 0);

// ─── Status config ─────────────────────────────────────────────────────────────
function statusInfo(s: LayawayStatus) {
  switch (s) {
    case "active":    return { color: "#FFAA00", bg: "rgba(255,170,0,0.12)",    icon: Clock,        label: "Activo"     };
    case "paid":      return { color: "#00CC66", bg: "rgba(0,204,102,0.12)",    icon: CheckCircle2, label: "Liquidado"  };
    case "delivered": return { color: "#4499FF", bg: "rgba(68,153,255,0.12)",   icon: Truck,        label: "Entregado"  };
    case "cancelled": return { color: "#FF4422", bg: "rgba(255,68,34,0.12)",    icon: XCircle,      label: "Cancelado"  };
    case "expired":   return { color: "#888",    bg: "rgba(136,136,136,0.12)",  icon: AlertCircle,  label: "Expirado"   };
  }
}

// ─── Shared mini-components ────────────────────────────────────────────────────
function StatusBadge({ status }: { status: LayawayStatus }) {
  const si = statusInfo(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 999, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", background: si.bg, color: si.color }}>
      <si.icon size={10} />
      {si.label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function LayawaysPage() {
  const { activeStore } = useActiveStore();

  const [layaways, setLayaways]         = useState<Layaway[]>([]);
  const [selected, setSelected]         = useState<Layaway | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [filterStatus, setFilterStatus] = useState<LayawayStatus | "all">("all");
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

  // Payment modal
  const [payModal, setPayModal]       = useState(false);
  const [payAmount, setPayAmount]     = useState("");
  const [payMethodId, setPayMethodId] = useState<string>("");
  const [payNote, setPayNote]         = useState("");
  const [paying, setPaying]           = useState(false);
  const [payMethods, setPayMethods]   = useState<PaymentMethod[]>([]);

  // New layaway modal
  const [newModal, setNewModal]     = useState(false);
  const [newForm, setNewForm]       = useState({
    customer_id: "",
    product_id: "",
    down_payment: "",
    payment_method_id: "",
    expires_at: "",
    notes: "",
  });
  const [newSaving, setNewSaving]   = useState(false);
  const [custSearch, setCustSearch] = useState("");
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [prodSearch, setProdSearch] = useState("");
  const [prodResults, setProdResults] = useState<Array<{ id: number; name: string; sku: string }>>([]);
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [selectedProd, setSelectedProd] = useState<{ id: number; name: string; sku: string } | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load ────────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [res, pms] = await Promise.all([
        getLayaways({ store_id: activeStore?.id, per_page: 100 }),
        getPaymentMethods({ active: true }),
      ]);
      setLayaways(res.data);
      setPayMethods(pms);
      if (pms.length > 0) setPayMethodId(String(pms[0]!.id));
    } catch {
      toast.error("Error al cargar apartados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [activeStore?.id]);

  // ─── Select layaway (fetch full detail) ───────────────────────────────────
  const selectLayaway = async (l: Layaway) => {
    setSelected(l);
    setDetailLoading(true);
    try {
      const full = await getLayaway(l.id);
      setSelected(full);
    } catch {
      // keep partial data
    } finally {
      setDetailLoading(false);
    }
  };

  // ─── Product / customer search ─────────────────────────────────────────────
  const handleProdSearch = (val: string) => {
    setProdSearch(val);
    setSelectedProd(null);
    setNewForm(f => ({ ...f, product_id: "" }));
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!val.trim()) { setProdResults([]); return; }
    searchTimeout.current = setTimeout(() => {
      getProducts({ search: val, per_page: 8 })
        .then(r => setProdResults(r.data.map(p => ({ id: p.id, name: p.name, sku: p.sku }))))
        .catch(() => { /* silently ignore */ });
    }, 300);
  };

  const handleCustSearch = (val: string) => {
    setCustSearch(val);
    setSelectedCust(null);
    setNewForm(f => ({ ...f, customer_id: "" }));
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!val.trim()) { setCustResults([]); return; }
    searchTimeout.current = setTimeout(() => {
      getCustomers({ search: val })
        .then(r => setCustResults(r))
        .catch(() => { /* silently ignore */ });
    }, 300);
  };

  // ─── Actions ──────────────────────────────────────────────────────────────────
  const handleAddPayment = async () => {
    if (!selected) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error("Monto inválido"); return; }
    setPaying(true);
    try {
      const result = await addLayawayPayment(selected.id, {
        amount,
        payment_method_id: payMethodId ? Number(payMethodId) : undefined,
        notes: payNote || undefined,
      });
      toast.success(`Abono registrado · Balance: ${fmt(result.balance)}`);
      setPayModal(false);
      setPayAmount("");
      setPayNote("");
      // Refresh detail + list
      const full = await getLayaway(selected.id);
      setSelected(full);
      setLayaways(prev => prev.map(l => l.id === full.id ? full : l));
    } catch {
      toast.error("Error al registrar abono");
    } finally {
      setPaying(false);
    }
  };

  const handleCancel = async (id: number) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      const updated = await cancelLayaway(id, "Cancelado desde panel");
      toast.success("Apartado cancelado — inventario restaurado");
      setLayaways(prev => prev.map(l => l.id === id ? updated : l));
      if (selected?.id === id) setSelected(updated);
    } catch {
      toast.error("Error al cancelar apartado");
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleDeliver = async (id: number) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await deliverLayaway(id);
      toast.success("¡Apartado entregado! Se generó la venta");
      await load();
      setSelected(null);
    } catch {
      toast.error("Error al marcar como entregado");
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleCreateLayaway = async () => {
    if (!activeStore) { toast.error("Selecciona una tienda"); return; }
    if (!newForm.customer_id) { toast.error("Selecciona un cliente"); return; }
    if (!newForm.product_id)  { toast.error("Selecciona un producto"); return; }
    const dp = parseFloat(newForm.down_payment);
    if (!dp || dp <= 0) { toast.error("El anticipo debe ser mayor a $0"); return; }
    setNewSaving(true);
    try {
      const created = await (await import("@tadaima/api")).createLayaway({
        store_id: activeStore.id,
        customer_id: Number(newForm.customer_id),
        product_id: Number(newForm.product_id),
        down_payment: dp,
        payment_method_id: newForm.payment_method_id ? Number(newForm.payment_method_id) : undefined,
        expires_at: newForm.expires_at || undefined,
        notes: newForm.notes || undefined,
      });
      toast.success(`Apartado ${created.code} creado`);
      setLayaways(prev => [created, ...prev]);
      setNewModal(false);
      setNewForm({ customer_id: "", product_id: "", down_payment: "", payment_method_id: "", expires_at: "", notes: "" });
      setCustSearch(""); setProdSearch(""); setSelectedCust(null); setSelectedProd(null);
    } catch {
      toast.error("Error al crear apartado");
    } finally {
      setNewSaving(false);
    }
  };

  // ─── Derived ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => layaways.filter(l => {
    const matchStatus = filterStatus === "all" || l.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q || l.code.toLowerCase().includes(q) ||
      (l.customer?.name ?? "").toLowerCase().includes(q) ||
      (l.product?.name ?? "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  }), [layaways, filterStatus, search]);

  const openCount   = layaways.filter(l => l.status === "active").length;
  const paidCount   = layaways.filter(l => l.status === "paid").length;
  const totalBalAmt = layaways.filter(l => ["active","paid"].includes(l.status))
    .reduce((s, l) => s + (l.balance ?? 0), 0);

  const isOpen = (l: Layaway) => l.status === "active" || l.status === "paid";

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: BG, color: T.TP }}>

      {/* Header */}
      <header className="h-20 shrink-0 flex items-center justify-between px-8" style={{ borderBottom: T.DIV }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
            <Archive size={22} style={{ color: RED }} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight" style={{ color: T.TP }}>
              APARTADOS <span style={{ color: RED }}>/ LAYAWAYS</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.TM }}>Reservas con anticipo · Tadaima</p>
          </div>
        </div>
        <button
          onClick={() => setNewModal(true)}
          className="flex items-center gap-2 px-6 py-3 font-black text-[11px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
          style={T.btnRed}
        >
          <Plus size={15} strokeWidth={3} />
          Nuevo Apartado
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">

        {/* ── List panel ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Activos",    val: openCount,          color: "#FFAA00" },
              { label: "Liquidados", val: paidCount,           color: "#00CC66" },
              { label: "Por cobrar", val: fmt(totalBalAmt),    color: RED       },
            ].map((k, i) => (
              <div key={i} className="px-5 py-4 rounded-2xl border border-white/5 bg-white/[0.03]">
                <p className="text-2xl font-black italic" style={{ color: k.color }}>{k.val}</p>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T.TM }}>{k.label}</p>
              </div>
            ))}
          </div>

          {/* Search + filters */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2" size={16} style={{ color: T.TM }} />
              <input
                type="text"
                placeholder="Buscar por código, cliente o producto…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-2xl outline-none text-sm font-medium"
                style={T.input}
              />
            </div>
            <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-white/5 border border-white/5">
              {(["all", "active", "paid", "delivered", "cancelled"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                    filterStatus === s ? "bg-red-600 text-white" : "text-white/25 hover:bg-white/5"
                  }`}
                >
                  {s === "all" ? "Todos" : statusInfo(s as LayawayStatus).label}
                </button>
              ))}
            </div>
          </div>

          {/* Cards */}
          {loading ? (
            <div className="flex items-center justify-center p-20">
              <Loader2 size={28} className="animate-spin" style={{ color: RED }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-20 gap-3">
              <Archive size={36} className="opacity-10 text-white" />
              <p className="text-xs font-black uppercase tracking-widest text-white/20">Sin apartados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(l => {
                const si = statusInfo(l.status);
                return (
                  <motion.div
                    key={l.id}
                    layout
                    onClick={() => void selectLayaway(l)}
                    className="group flex items-center gap-4 px-5 py-4 rounded-2xl border cursor-pointer transition-all hover:border-white/15"
                    style={{
                      ...T.glass,
                      borderLeft: `3px solid ${si.color}`,
                      background: selected?.id === l.id ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                    }}
                  >
                    {/* Code + status */}
                    <div className="w-36 shrink-0">
                      <p className="text-xs font-black text-white">{l.code}</p>
                      <div className="mt-1"><StatusBadge status={l.status} /></div>
                    </div>

                    {/* Customer + product */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: T.TP }}>{l.customer?.name ?? "—"}</p>
                      <p className="text-xs truncate" style={{ color: T.TS }}>{l.product?.name ?? "—"} · <span className="font-black" style={{ color: T.TM }}>{l.product?.sku}</span></p>
                    </div>

                    {/* Amount */}
                    <div className="w-28 shrink-0 text-right">
                      <p className="text-sm font-black italic text-white">{fmt(l.total)}</p>
                      {l.balance !== null && (
                        <p className="text-[10px] font-bold" style={{ color: l.balance > 0 ? "#FFAA00" : "#00CC66" }}>
                          {l.balance > 0 ? `Saldo: ${fmt(l.balance)}` : "Sin saldo"}
                        </p>
                      )}
                    </div>

                    <ChevronRight size={14} className="shrink-0 text-white/20 group-hover:text-white/50 transition-colors" />
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Detail panel ────────────────────────────────────────────────── */}
        <AnimatePresence>
          {selected && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 overflow-y-auto custom-scrollbar border-l border-white/5 bg-white/[0.02]"
            >
              <div className="p-6 space-y-6" style={{ minWidth: 380 }}>

                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: RED }}>Apartado</p>
                    <h3 className="text-xl font-black text-white mt-0.5">{selected.code}</h3>
                    <div className="mt-2"><StatusBadge status={selected.status} /></div>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-white/20 hover:text-white/60 transition-colors">
                    <X size={18} />
                  </button>
                </div>

                {detailLoading && (
                  <div className="flex items-center gap-2 text-white/20">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">Cargando…</span>
                  </div>
                )}

                {/* Info blocks */}
                <div className="space-y-3">
                  {/* Customer */}
                  <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.03] flex items-center gap-3">
                    <User size={16} style={{ color: T.TM }} />
                    <div>
                      <p className="text-xs font-black text-white">{selected.customer?.name ?? "—"}</p>
                      {selected.customer?.phone && <p className="text-[10px]" style={{ color: T.TS }}>{selected.customer.phone}</p>}
                    </div>
                  </div>

                  {/* Product */}
                  <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.03] flex items-center gap-3">
                    <Package size={16} style={{ color: T.TM }} />
                    <div>
                      <p className="text-xs font-black text-white">{selected.product?.name ?? "—"}</p>
                      <p className="text-[10px] font-black" style={{ color: T.TM }}>{selected.product?.sku} · Qty: {selected.quantity}</p>
                    </div>
                  </div>

                  {/* Dates */}
                  {selected.expires_at && (
                    <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.03] flex items-center gap-3">
                      <Calendar size={16} style={{ color: T.TM }} />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: T.TM }}>Vence</p>
                        <p className="text-xs font-bold text-white">{selected.expires_at.split("T")[0]}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Totals */}
                <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.03] space-y-3">
                  {[
                    { label: "Total",     val: fmt(selected.total),                        color: T.TP     },
                    { label: "Anticipo",  val: fmt(selected.down_payment),                 color: T.TS     },
                    { label: "Abonado",   val: fmt(selected.paid_amount ?? selected.down_payment), color: "#00CC66" },
                    { label: "Balance",   val: fmt(selected.balance ?? (selected.total - selected.down_payment)), color: (selected.balance ?? 1) > 0 ? "#FFAA00" : "#00CC66" },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.TM }}>{row.label}</span>
                      <span className="text-sm font-black" style={{ color: row.color }}>{row.val}</span>
                    </div>
                  ))}
                </div>

                {/* Payment history */}
                {selected.payments && selected.payments.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: T.TM }}>Historial de abonos</p>
                    <div className="space-y-2">
                      {selected.payments.map(p => (
                        <div key={p.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5">
                          <div>
                            <p className="text-[10px] font-black text-white">{fmt(p.amount)}</p>
                            <p className="text-[9px]" style={{ color: T.TM }}>{p.payment_method?.name ?? "—"}</p>
                          </div>
                          <p className="text-[9px]" style={{ color: T.TM }}>{p.created_at?.split("T")[0] ?? ""}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {isOpen(selected) && (
                  <div className="space-y-3">
                    {(selected.balance ?? 0) > 0 && (
                      <button
                        onClick={() => { setPayAmount(""); setPayNote(""); setPayModal(true); }}
                        className="w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                        style={T.btnRed}
                      >
                        <Banknote size={15} />
                        Registrar Abono
                      </button>
                    )}
                    {selected.status === "paid" && (
                      <button
                        onClick={() => void handleDeliver(selected.id)}
                        disabled={actionLoading[selected.id]}
                        className="w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                        style={{ background: "rgba(0,204,102,0.15)", border: "1px solid rgba(0,204,102,0.3)", color: "#00CC66" }}
                      >
                        {actionLoading[selected.id] ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                        Marcar como Entregado
                      </button>
                    )}
                    <button
                      onClick={() => void handleCancel(selected.id)}
                      disabled={actionLoading[selected.id]}
                      className="w-full py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 border hover:bg-white/5"
                      style={{ borderColor: "rgba(255,68,34,0.25)", color: "#FF4422" }}
                    >
                      {actionLoading[selected.id] ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                      Cancelar Apartado
                    </button>
                  </div>
                )}

                {selected.notes && (
                  <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: T.TM }}>Notas</p>
                    <p className="text-xs" style={{ color: T.TS }}>{selected.notes}</p>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ── Modal: Registrar Abono ──────────────────────────────────────────── */}
      {payModal && selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            onClick={() => setPayModal(false)} />
          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-md rounded-[36px] p-8 space-y-6"
            style={T.glass}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: RED }}>Abono</p>
                <h3 className="text-lg font-black text-white">{selected.code}</h3>
                <p className="text-xs mt-0.5" style={{ color: T.TS }}>Saldo: {fmt(selected.balance ?? 0)}</p>
              </div>
              <button onClick={() => setPayModal(false)} className="text-white/20 hover:text-white/60"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest mb-2 block" style={{ color: T.TM }}>Monto *</label>
                <input
                  type="number" min={0.01} step={0.01}
                  value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  style={T.input} autoFocus
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest mb-2 block" style={{ color: T.TM }}>Método de pago</label>
                <select value={payMethodId} onChange={e => setPayMethodId(e.target.value)} style={{ ...T.input, appearance: "none" as const }}>
                  {payMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest mb-2 block" style={{ color: T.TM }}>Notas (opcional)</label>
                <input type="text" value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Observación…" style={T.input} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setPayModal(false)} className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase border border-white/10 text-white/30">
                Cancelar
              </button>
              <button
                onClick={() => void handleAddPayment()}
                disabled={paying}
                className="flex-[1.5] py-4 rounded-2xl text-[11px] font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:scale-[1.02]"
                style={T.btnRed}
              >
                {paying ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
                Confirmar Abono
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Modal: Nuevo Apartado ───────────────────────────────────────────── */}
      {newModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            onClick={() => setNewModal(false)} />
          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-2xl rounded-[40px] flex flex-col max-h-[90vh] overflow-hidden"
            style={T.glass}
          >
            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Nuevo Apartado</h3>
              <button onClick={() => setNewModal(false)} className="text-white/20 hover:text-white/60"><X size={18} /></button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar space-y-5">

              {/* Customer search */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest mb-2 block" style={{ color: T.TM }}>Cliente *</label>
                {selectedCust ? (
                  <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 border border-white/10">
                    <div>
                      <p className="text-sm font-black text-white">{selectedCust.name}</p>
                      {selectedCust.phone && <p className="text-xs" style={{ color: T.TS }}>{selectedCust.phone}</p>}
                    </div>
                    <button onClick={() => { setSelectedCust(null); setNewForm(f => ({ ...f, customer_id: "" })); setCustSearch(""); }} className="text-white/20 hover:text-red-400"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <input type="text" value={custSearch} onChange={e => handleCustSearch(e.target.value)} placeholder="Buscar cliente…" style={T.input} />
                    {custResults.length > 0 && (
                      <div className="absolute top-full mt-1 w-full rounded-2xl border border-white/10 overflow-hidden z-10" style={T.glassMd}>
                        {custResults.slice(0, 6).map(c => (
                          <button key={c.id} onClick={() => { setSelectedCust(c); setNewForm(f => ({ ...f, customer_id: String(c.id) })); setCustResults([]); setCustSearch(c.name); }}
                            className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors">
                            <p className="text-xs font-bold text-white">{c.name}</p>
                            <p className="text-[9px]" style={{ color: T.TM }}>{c.phone ?? c.email ?? ""}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Product search */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest mb-2 block" style={{ color: T.TM }}>Producto *</label>
                {selectedProd ? (
                  <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 border border-white/10">
                    <div>
                      <p className="text-sm font-black text-white">{selectedProd.name}</p>
                      <p className="text-[10px] font-black" style={{ color: T.TM }}>{selectedProd.sku}</p>
                    </div>
                    <button onClick={() => { setSelectedProd(null); setNewForm(f => ({ ...f, product_id: "" })); setProdSearch(""); }} className="text-white/20 hover:text-red-400"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <input type="text" value={prodSearch} onChange={e => handleProdSearch(e.target.value)} placeholder="Buscar producto…" style={T.input} />
                    {prodResults.length > 0 && (
                      <div className="absolute top-full mt-1 w-full rounded-2xl border border-white/10 overflow-hidden z-10" style={T.glassMd}>
                        {prodResults.map(p => (
                          <button key={p.id} onClick={() => { setSelectedProd(p); setNewForm(f => ({ ...f, product_id: String(p.id) })); setProdResults([]); setProdSearch(p.name); }}
                            className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors">
                            <p className="text-xs font-bold text-white">{p.name}</p>
                            <p className="text-[9px] font-black" style={{ color: T.TM }}>{p.sku}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Down payment */}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest mb-2 block" style={{ color: T.TM }}>Anticipo *</label>
                  <input type="number" min={0.01} step={0.01} value={newForm.down_payment}
                    onChange={e => setNewForm(f => ({ ...f, down_payment: e.target.value }))}
                    placeholder="0.00" style={T.input} />
                </div>

                {/* Payment method */}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest mb-2 block" style={{ color: T.TM }}>Método de pago</label>
                  <select value={newForm.payment_method_id} onChange={e => setNewForm(f => ({ ...f, payment_method_id: e.target.value }))}
                    style={{ ...T.input, appearance: "none" as const }}>
                    <option value="">Sin especificar</option>
                    {payMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Expires at */}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest mb-2 block" style={{ color: T.TM }}>Fecha de vencimiento</label>
                  <input type="date" value={newForm.expires_at} onChange={e => setNewForm(f => ({ ...f, expires_at: e.target.value }))} style={T.input} />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest mb-2 block" style={{ color: T.TM }}>Notas</label>
                  <input type="text" value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observaciones…" style={T.input} />
                </div>
              </div>
            </div>

            <div className="px-8 py-6 border-t border-white/5 flex gap-4 bg-white/[0.02] shrink-0">
              <button onClick={() => setNewModal(false)} className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase border border-white/10 text-white/30">
                Cancelar
              </button>
              <button
                onClick={() => void handleCreateLayaway()}
                disabled={newSaving}
                className="flex-[1.5] py-4 rounded-2xl text-[11px] font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:scale-[1.02]"
                style={T.btnRed}
              >
                {newSaving ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                Crear Apartado
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
