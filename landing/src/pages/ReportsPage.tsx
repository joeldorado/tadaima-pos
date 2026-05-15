import { useState, useEffect, useMemo } from "react";
import {
  FileText, TrendingUp, Package, Users, BarChart3,
  Loader2, DollarSign, ArrowUpRight,
  ShoppingBag, Star, Calendar, Printer, Store,
  ChevronDown, ChevronRight, Receipt, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@tadaima/auth";
import {
  getSalesReport, getInventoryReport, getTopProductsReport, getCustomersReport,
} from "@tadaima/api";
import { getSales, getStores } from "@tadaima/api";
import type { SalesReport, InventoryReport, TopProductsReport, CustomersReport } from "@tadaima/api";
import type { SaleDetail, Store as StoreType } from "@tadaima/api";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const BG   = "var(--td-page-bg)";
const RED  = "#FF4422";
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

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n ?? 0);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

type TabId = "ventas" | "inventario" | "productos" | "clientes";

// ─── Ticket print helper ───────────────────────────────────────────────────────
function printTicket(sale: SaleDetail) {
  const lines = sale.items.map(it =>
    `<tr>
      <td style="padding:2px 4px;font-size:11px">${it.product?.name ?? "Artículo"}</td>
      <td style="padding:2px 4px;font-size:11px;text-align:center">×${it.quantity}</td>
      <td style="padding:2px 4px;font-size:11px;text-align:right">${fmt(it.total)}</td>
    </tr>`
  ).join("");

  const paymentRows = sale.payments.map(p =>
    `<tr>
      <td style="font-size:11px;padding:2px 4px">${p.payment_method?.name ?? "Pago"}</td>
      <td style="font-size:11px;padding:2px 4px;text-align:right;font-weight:bold">${fmt(p.amount)}</td>
    </tr>`
  ).join("");

  const html = `<!DOCTYPE html><html><head><title>Ticket #${sale.id}</title>
  <style>
    body{font-family:'Courier New',monospace;width:72mm;margin:0 auto;padding:8px}
    hr{border:none;border-top:1px dashed #000;margin:6px 0}
    table{width:100%;border-collapse:collapse}
    .bold{font-weight:bold}
    @media print{@page{margin:0;size:72mm auto}body{width:72mm}}
  </style></head>
  <body>
    <div style="text-align:center;margin-bottom:6px">
      <div style="font-size:15px;font-weight:900">TADAIMA</div>
      <div style="font-size:9px;color:#555">Manga &amp; Hobby Store</div>
    </div>
    <hr>
    <div style="font-size:9px;margin-bottom:6px">
      <div class="bold">Ticket #${sale.id}</div>
      <div>${fmtDate(sale.sold_at)} · ${fmtTime(sale.sold_at)}</div>
      ${sale.customer ? `<div>Cliente: ${sale.customer.name}</div>` : ""}
    </div>
    <hr>
    <table>
      <thead><tr>
        <th style="text-align:left;font-size:9px;padding:2px 4px">Artículo</th>
        <th style="text-align:center;font-size:9px;padding:2px 4px">Qty</th>
        <th style="text-align:right;font-size:9px;padding:2px 4px">Monto</th>
      </tr></thead>
      <tbody>${lines}</tbody>
    </table>
    <hr>
    <table>
      ${sale.discount > 0 ? `<tr><td style="font-size:10px;padding:1px 4px">Subtotal</td><td style="text-align:right;font-size:10px;padding:1px 4px">${fmt(sale.subtotal)}</td></tr>` : ""}
      ${sale.discount > 0 ? `<tr><td style="font-size:10px;padding:1px 4px">Descuento</td><td style="text-align:right;font-size:10px;padding:1px 4px;color:#c00">-${fmt(sale.discount)}</td></tr>` : ""}
      <tr><td style="font-size:13px;font-weight:900;padding:4px 4px 2px">TOTAL</td><td style="text-align:right;font-size:13px;font-weight:900;padding:4px 4px 2px">${fmt(sale.total)}</td></tr>
    </table>
    <hr>
    <div style="font-size:9px;margin-bottom:4px;font-weight:900;text-transform:uppercase;letter-spacing:0.05em">Forma de pago</div>
    <table>${paymentRows}</table>
    <hr>
    <div style="text-align:center;font-size:9px;color:#555;margin-top:6px">¡Gracias por tu compra!</div>
  </body></html>`;

  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) { toast.error("Permite ventanas emergentes para imprimir"); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ReportsPage() {
  const { user } = useAuth();
  const isAdmin   = user?.roles?.some(r => ["admin","super_admin","owner","dueño"].includes(r.toLowerCase())) ?? false;
  const isGerente = user?.roles?.some(r => r.toLowerCase() === "gerente") ?? false;
  const canManage = isAdmin || isGerente;
  // Ganancia / costo real: admin siempre, otros solo si admin les activó el permiso.
  const canViewCost = isAdmin || !!user?.can_view_cost;

  const [activeTab, setActiveTab] = useState<TabId>("ventas");
  const [loading, setLoading]     = useState(false);

  const today         = new Date().toISOString().split("T")[0]!;
  const firstOfMonth  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]!;

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo]     = useState(today);

  // Store filter — admin can pick, others are locked to their store
  const [stores, setStores]               = useState<StoreType[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const effectiveStoreId = isAdmin ? selectedStoreId : (user?.store_id ?? null);

  // Report data
  const [salesReport,  setSalesReport]  = useState<SalesReport | null>(null);
  const [sales,        setSales]        = useState<SaleDetail[]>([]);
  const [invReport,    setInvReport]    = useState<InventoryReport | null>(null);
  const [topReport,    setTopReport]    = useState<TopProductsReport | null>(null);
  const [custReport,   setCustReport]   = useState<CustomersReport | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [expandedId,   setExpandedId]   = useState<number | null>(null);
  const [expandedDay,  setExpandedDay]  = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      void getStores({ active: true }).then(setStores).catch(() => {});
    }
  }, [isAdmin]);

  // ─── Loaders ────────────────────────────────────────────────────────────────
  const loadSales = async () => {
    setLoading(true);
    try {
      const params = { from, to, ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}) };
      const [r, sl] = await Promise.all([
        getSalesReport(params),
        getSales({ ...params, per_page: 100, status: "completed" }),
      ]);
      setSalesReport(r);
      setSales(sl.data);
    } catch {
      toast.error("Error al cargar reporte de ventas");
    } finally {
      setLoading(false);
    }
  };

  const loadInventory = async () => {
    setLoading(true);
    try {
      const r = await getInventoryReport({
        low_stock: lowStockOnly,
        ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}),
      });
      setInvReport(r);
    } catch {
      toast.error("Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  };

  const loadTop = async () => {
    setLoading(true);
    try {
      const r = await getTopProductsReport({
        from, to, limit: 25,
        ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}),
      });
      setTopReport(r);
    } catch {
      toast.error("Error al cargar top productos");
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const r = await getCustomersReport({
        from, to, limit: 25,
        ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}),
      });
      setCustReport(r);
    } catch {
      toast.error("Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "ventas")     void loadSales();
    if (activeTab === "inventario") void loadInventory();
    if (activeTab === "productos")  void loadTop();
    if (activeTab === "clientes")   void loadCustomers();
  }, [activeTab, from, to, lowStockOnly, effectiveStoreId]);

  // Merge by_day + pre_sale_by_day for the daily breakdown table
  const mergedByDay = useMemo(() => {
    if (!salesReport) return [];
    const map = new Map<string, { date: string; sales_count: number; sales_amount: number; ps_count: number; ps_amount: number }>();
    for (const r of salesReport.by_day) {
      map.set(r.date, { date: r.date, sales_count: r.count, sales_amount: r.amount, ps_count: 0, ps_amount: 0 });
    }
    for (const r of salesReport.pre_sale_by_day) {
      const existing = map.get(r.date);
      if (existing) { existing.ps_count = r.count; existing.ps_amount = r.amount; }
      else map.set(r.date, { date: r.date, sales_count: 0, sales_amount: 0, ps_count: r.count, ps_amount: r.amount });
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [salesReport]);

  // Ganancia bruta = ingresos ventas + anticipos preventa − descuentos − comisiones
  const gananciaBruta = useMemo(() => {
    if (!salesReport) return 0;
    return salesReport.summary.total_revenue
      + salesReport.pre_sale_summary.total_amount
      - salesReport.summary.total_discount
      - salesReport.summary.total_commission;
  }, [salesReport]);

  // Sales grouped by date — for expandable daily rows
  const salesByDate = useMemo(() => {
    const map = new Map<string, SaleDetail[]>();
    for (const sale of sales) {
      const date = (sale.sold_at || sale.created_at)?.split("T")[0] ?? "";
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(sale);
    }
    return map;
  }, [sales]);

  // ─── Shared UI ───────────────────────────────────────────────────────────────
  const thStyle: React.CSSProperties = { padding: "10px 16px", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM, textAlign: "left" };
  const tdStyle: React.CSSProperties = { padding: "10px 16px", fontSize: 12, color: TS, borderBottom: DIV };

  return (
    <div className="min-h-screen" style={{ background: BG, color: TP }}>
      <div className="max-w-screen-xl mx-auto p-8 space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-1" style={{ color: TP }}>
            Centro de <span style={{ color: RED }}>Reportes</span>
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: TM }}>
            Auditoría y Análisis · Tadaima
            {!isAdmin && user?.store && (
              <span className="ml-2" style={{ color: RED }}>· {user.store.name}</span>
            )}
          </p>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex gap-2 p-1.5 rounded-2xl bg-white/5 border border-white/5 w-fit">
          {([
            { id: "ventas",     label: "Ventas",        icon: TrendingUp },
            { id: "inventario", label: "Inventario",    icon: Package    },
            { id: "productos",  label: "Top Productos", icon: Star       },
            { id: "clientes",   label: "Top Clientes",  icon: Users      },
          ] as { id: TabId; label: string; icon: React.ElementType }[]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              style={activeTab === tab.id
                ? { background: "linear-gradient(135deg,#CC2200,#FF4422)", color: "#fff" }
                : { color: TM }}
            >
              <tab.icon size={13} />{tab.label}
            </button>
          ))}
        </div>

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        {["ventas", "productos", "clientes"].includes(activeTab) && (
          <div className="flex items-center gap-3 flex-wrap p-4 rounded-2xl" style={GLASS}>
            <Calendar size={15} style={{ color: RED }} />

            {/* Quick presets */}
            {[
              { label: "Hoy",    fn: () => { setFrom(today); setTo(today); } },
              { label: "7 días", fn: () => { setFrom(new Date(Date.now()-6*86400000).toISOString().split("T")[0]!); setTo(today); } },
              { label: "Este mes", fn: () => { setFrom(firstOfMonth); setTo(today); } },
            ].map(p => {
              const active = p.label === "Hoy" && from === today && to === today;
              return (
                <button key={p.label} onClick={p.fn}
                  className="px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
                  style={active
                    ? { background: "linear-gradient(135deg,#CC2200,#FF4422)", color: "#fff", border: "1px solid rgba(255,120,90,0.3)" }
                    : { background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: TS }
                  }>
                  {p.label}
                </button>
              );
            })}

            <div className="w-px h-5 mx-1" style={{ background: "var(--td-divider)" }} />

            {/* Date inputs */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="text-sm font-bold outline-none bg-transparent"
                style={{ color: TP, minWidth: 130 }} />
            </div>
            <span className="text-xs font-black" style={{ color: TM }}>→</span>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="text-sm font-bold outline-none bg-transparent"
                style={{ color: TP, minWidth: 130 }} />
            </div>

            {/* Store select — admin only */}
            {isAdmin && stores.length > 0 && (
              <>
                <div className="w-px h-5 mx-1" style={{ background: "var(--td-divider)" }} />
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
                  <Store size={13} style={{ color: TM }} />
                  <select
                    value={selectedStoreId ?? ""}
                    onChange={e => setSelectedStoreId(e.target.value ? Number(e.target.value) : null)}
                    className="text-sm font-bold outline-none bg-transparent"
                    style={{ color: TP, minWidth: 140, border: "none" }}
                  >
                    <option value="">Todas las tiendas</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </>
            )}

            {/* Active range indicator */}
            <span className="ml-auto text-[10px] font-black" style={{ color: TM }}>
              {from === to ? fmtDate(from) : `${fmtDate(from)} → ${fmtDate(to)}`}
            </span>
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center p-24">
            <Loader2 size={32} className="animate-spin" style={{ color: RED }} />
          </div>
        ) : (
          <>
            {/* ── VENTAS ── */}
            {activeTab === "ventas" && salesReport && (
              <div className="space-y-6">

                {/* ── KPI Cards ── */}
                {/* Row 1: Ganancia bruta (prominent) + Ingresos + Anticipos */}
                <div className={`grid grid-cols-1 ${canViewCost ? "md:grid-cols-3" : "md:grid-cols-2"} gap-4`}>
                  {/* Ganancia bruta — solo visible para usuarios con permiso de ver costos */}
                  {canViewCost && (
                    <div style={{ ...GLASS, borderRadius: 24, padding: "22px 26px", border: `1px solid ${gananciaBruta >= 0 ? "rgba(0,204,102,0.25)" : "rgba(255,68,34,0.25)"}` }}>
                      <div className="flex items-center justify-between mb-3">
                        <TrendingUp size={20} style={{ color: gananciaBruta >= 0 ? "#00CC66" : RED }} />
                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(0,204,102,0.1)", color: "#00CC66" }}>
                          Ventas + Anticipos − Desc. − Com.
                        </span>
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: TM }}>Ganancia bruta del período</p>
                      <p className="text-3xl font-black italic" style={{ color: gananciaBruta >= 0 ? "#00CC66" : RED }}>{fmt(gananciaBruta)}</p>
                    </div>
                  )}

                  {/* Ingresos ventas regulares */}
                  <div style={{ ...GLASS, borderRadius: 24, padding: "22px 26px" }}>
                    <div className="flex items-center justify-between mb-3">
                      <DollarSign size={18} style={{ color: "#4499FF" }} />
                      <ArrowUpRight size={12} style={{ color: TM }} />
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: TM }}>Ingresos ventas</p>
                    <p className="text-2xl font-black italic" style={{ color: "#4499FF" }}>{fmt(salesReport.summary.total_revenue)}</p>
                    <p className="text-[9px] mt-1" style={{ color: TM }}>{salesReport.summary.total_count} ticket{salesReport.summary.total_count !== 1 ? "s" : ""}</p>
                  </div>

                  {/* Anticipos preventa */}
                  <div style={{ ...GLASS, borderRadius: 24, padding: "22px 26px", border: salesReport.pre_sale_summary.total_count > 0 ? "1px solid rgba(170,102,255,0.2)" : undefined }}>
                    <div className="flex items-center justify-between mb-3">
                      <Clock size={18} style={{ color: "#BB77FF" }} />
                      <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(170,102,255,0.1)", color: "#BB77FF" }}>Preventa</span>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: TM }}>Anticipos cobrados</p>
                    <p className="text-2xl font-black italic" style={{ color: salesReport.pre_sale_summary.total_count > 0 ? "#BB77FF" : TM }}>
                      {salesReport.pre_sale_summary.total_count > 0 ? fmt(salesReport.pre_sale_summary.total_amount) : "—"}
                    </p>
                    {salesReport.pre_sale_summary.total_count > 0 && (
                      <p className="text-[9px] mt-1" style={{ color: TM }}>{salesReport.pre_sale_summary.total_count} folio{salesReport.pre_sale_summary.total_count !== 1 ? "s" : ""}</p>
                    )}
                  </div>
                </div>

                {/* Row 2: Transacciones + Descuentos + Comisiones */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Transacciones",  val: String(salesReport.summary.total_count),           color: "#00CC66", icon: ShoppingBag, sub: "ventas regulares" },
                    { label: "Descuentos",      val: fmt(salesReport.summary.total_discount),           color: "#FFAA00", icon: BarChart3,   sub: salesReport.summary.total_discount > 0 ? "aplicados al período" : "sin descuentos" },
                    { label: "Comisiones TPV",  val: fmt(salesReport.summary.total_commission),         color: "#FF8866", icon: Store,       sub: salesReport.summary.total_commission > 0 ? "cargos de terminal" : "sin comisiones" },
                  ].map((kpi, i) => (
                    <div key={i} style={{ ...GLASS, borderRadius: 20, padding: "16px 20px" }}>
                      <div className="flex items-center justify-between mb-2">
                        <kpi.icon size={15} style={{ color: kpi.color }} />
                        <ArrowUpRight size={11} style={{ color: TM }} />
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: TM }}>{kpi.label}</p>
                      <p className="text-xl font-black italic" style={{ color: kpi.color }}>{kpi.val}</p>
                      <p className="text-[8px] mt-0.5" style={{ color: TM }}>{kpi.sub}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* By payment method */}
                  <div style={{ ...GLASS, borderRadius: 24, overflow: "hidden" }}>
                    <div className="px-6 py-4" style={{ borderBottom: DIV }}>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TM }}>Por método de pago</p>
                    </div>
                    <table className="w-full">
                      <thead><tr style={{ borderBottom: DIV }}>
                        {["Método", "Tickets", "Monto"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {salesReport.by_payment_method.map((r, i) => (
                          <tr key={i}>
                            <td style={tdStyle}><span className="font-bold" style={{ color: TP }}>{r.payment_method}</span></td>
                            <td style={tdStyle}>{r.count}</td>
                            <td style={{ ...tdStyle, color: "#00CC66", fontWeight: 900 }}>{fmt(r.amount)}</td>
                          </tr>
                        ))}
                        {salesReport.by_payment_method.length === 0 && (
                          <tr><td colSpan={3} style={{ ...tdStyle, textAlign: "center", padding: 32 }}>Sin datos</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Daily breakdown — expandable corte por día */}
                  <div style={{ ...GLASS, borderRadius: 24, overflow: "hidden" }}>
                    <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: DIV }}>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TM }}>Corte por día</p>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(0,204,102,0.1)", color: "#00CC66" }}>{mergedByDay.length} día{mergedByDay.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
                      {mergedByDay.length === 0 && (
                        <p style={{ ...tdStyle, textAlign: "center", padding: 32 }}>Sin ventas en el período</p>
                      )}
                      {mergedByDay.map((r) => {
                        const isOpen = expandedDay === r.date;
                        const daySales = salesByDate.get(r.date) ?? [];
                        // Payment method breakdown for this day from individual sales
                        const pmMap = new Map<string, number>();
                        for (const sale of daySales) {
                          for (const pay of (sale.payments ?? [])) {
                            const pm = pay.payment_method?.name ?? "Otro";
                            pmMap.set(pm, (pmMap.get(pm) ?? 0) + pay.amount);
                          }
                        }
                        const dayTotal = r.sales_amount + r.ps_amount;
                        const dayLabel = new Date(r.date + "T12:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short" });
                        return (
                          <div key={r.date} style={{ borderBottom: DIV }}>
                            {/* Collapsed row */}
                            <button
                              onClick={() => setExpandedDay(isOpen ? null : r.date)}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                            >
                              {isOpen
                                ? <ChevronDown size={12} style={{ flexShrink: 0, color: "#00CC66" }} />
                                : <ChevronRight size={12} style={{ flexShrink: 0, color: TM }} />}
                              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: TP, textTransform: "capitalize" }}>{dayLabel}</span>
                              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                                {r.sales_count > 0 && (
                                  <span style={{ fontSize: 11, color: "#4499FF", fontWeight: 700 }}>{fmt(r.sales_amount)} <span style={{ fontSize: 9, color: TM }}>ventas</span></span>
                                )}
                                {r.ps_count > 0 && (
                                  <span style={{ fontSize: 11, color: "#BB77FF", fontWeight: 700 }}>{fmt(r.ps_amount)} <span style={{ fontSize: 9, color: TM }}>prev.</span></span>
                                )}
                                <span style={{ fontSize: 13, fontWeight: 900, color: "#00CC66", minWidth: 80, textAlign: "right" }}>{fmt(dayTotal)}</span>
                              </div>
                            </button>

                            {/* Expanded detail */}
                            {isOpen && (
                              <div style={{ background: "rgba(0,0,0,0.12)", padding: "12px 20px 16px", borderTop: DIV }}>

                                {/* Payment method breakdown */}
                                {pmMap.size > 0 && (
                                  <div style={{ marginBottom: 14 }}>
                                    <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM, marginBottom: 8 }}>Desglose por método de pago</p>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      {Array.from(pmMap.entries()).map(([pm, amt]) => (
                                        <div key={pm} style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 10, padding: "6px 12px" }}>
                                          <p style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM, marginBottom: 2 }}>{pm}</p>
                                          <p style={{ fontSize: 13, fontWeight: 900, color: "#00CC66" }}>{fmt(amt)}</p>
                                        </div>
                                      ))}
                                      {r.ps_amount > 0 && (
                                        <div style={{ background: "rgba(170,102,255,0.06)", border: "1px solid rgba(170,102,255,0.2)", borderRadius: 10, padding: "6px 12px" }}>
                                          <p style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#BB77FF", marginBottom: 2 }}>Anticipo preventa</p>
                                          <p style={{ fontSize: 13, fontWeight: 900, color: "#BB77FF" }}>{fmt(r.ps_amount)}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Individual tickets for this day */}
                                {daySales.length > 0 && (
                                  <div>
                                    <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM, marginBottom: 8 }}>
                                      Tickets del día ({daySales.length})
                                    </p>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                      {daySales.map(sale => {
                                        const method = sale.payments?.[0]?.payment_method?.name ?? "—";
                                        const time = new Date(sale.sold_at || sale.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
                                        const itemCount = sale.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
                                        return (
                                          <div key={sale.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 9 }}>
                                            <span style={{ fontSize: 9, fontWeight: 900, color: TM, minWidth: 28 }}>#{sale.id}</span>
                                            <span style={{ fontSize: 10, color: TM, minWidth: 40 }}>{time}</span>
                                            <span style={{ flex: 1, fontSize: 10, color: TS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sale.customer?.name ?? "—"}</span>
                                            <span style={{ fontSize: 9, color: TM }}>{itemCount} art.</span>
                                            <span style={{ fontSize: 9, color: TM, minWidth: 52, textAlign: "right" }}>{method}</span>
                                            <span style={{ fontSize: 11, fontWeight: 900, color: "#00CC66", minWidth: 60, textAlign: "right" }}>{fmt(sale.total)}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Day total summary */}
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 12, paddingTop: 10, borderTop: DIV }}>
                                  {r.sales_count > 0 && <div style={{ textAlign: "right" }}><p style={{ fontSize: 8, fontWeight: 900, color: TM, textTransform: "uppercase" }}>Ventas</p><p style={{ fontSize: 12, fontWeight: 900, color: "#4499FF" }}>{fmt(r.sales_amount)}</p></div>}
                                  {r.ps_count > 0 && <div style={{ textAlign: "right" }}><p style={{ fontSize: 8, fontWeight: 900, color: TM, textTransform: "uppercase" }}>Anticipos</p><p style={{ fontSize: 12, fontWeight: 900, color: "#BB77FF" }}>{fmt(r.ps_amount)}</p></div>}
                                  <div style={{ textAlign: "right" }}><p style={{ fontSize: 8, fontWeight: 900, color: TM, textTransform: "uppercase" }}>Total del día</p><p style={{ fontSize: 14, fontWeight: 900, color: "#00CC66" }}>{fmt(dayTotal)}</p></div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* By store — admin only, no filter active */}
                {isAdmin && !effectiveStoreId && salesReport.by_store && salesReport.by_store.length > 0 && (
                  <div style={{ ...GLASS, borderRadius: 24, overflow: "hidden" }}>
                    <div className="px-6 py-4" style={{ borderBottom: DIV }}>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TM }}>Por tienda</p>
                    </div>
                    <table className="w-full">
                      <thead><tr style={{ borderBottom: DIV }}>
                        {["Tienda", "Tickets", "Total"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {salesReport.by_store.map((r, i) => (
                          <tr key={i}>
                            <td style={{ ...tdStyle, fontWeight: 700, color: TP }}>{r.store}</td>
                            <td style={tdStyle}>{r.count}</td>
                            <td style={{ ...tdStyle, color: "#00CC66", fontWeight: 900 }}>{fmt(r.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Sales history — expandable + reprint */}
                <div style={{ ...GLASS, borderRadius: 24, overflow: "hidden" }}>
                  <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: DIV }}>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TM }}>
                      Historial de ventas
                    </p>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(68,153,255,0.12)", color: "#4499FF" }}>
                      {sales.length} tickets
                    </span>
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
                    <table className="w-full">
                      <thead><tr style={{ borderBottom: DIV }}>
                        {["Ticket", "Fecha", "Cliente", "Items", "Total", "Acciones"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {sales.map(sale => (
                          <>
                            <tr key={sale.id} style={{ borderBottom: expandedId === sale.id ? "none" : DIV, cursor: "pointer" }}
                              onClick={() => setExpandedId(prev => prev === sale.id ? null : sale.id)}>
                              <td style={{ ...tdStyle, fontWeight: 900, color: TP }}>
                                <div className="flex items-center gap-1.5">
                                  {expandedId === sale.id ? <ChevronDown size={12} style={{ color: TM }} /> : <ChevronRight size={12} style={{ color: TM }} />}
                                  #{sale.id}
                                </div>
                              </td>
                              <td style={tdStyle}>
                                <div style={{ fontSize: 11 }}>{fmtDate(sale.sold_at)}</div>
                                <div style={{ fontSize: 10, color: TM }}>{fmtTime(sale.sold_at)}</div>
                              </td>
                              <td style={tdStyle}>{sale.customer?.name ?? <span style={{ color: TM }}>Público general</span>}</td>
                              <td style={tdStyle}>{sale.items.length}</td>
                              <td style={{ ...tdStyle, color: "#00CC66", fontWeight: 900 }}>{fmt(sale.total)}</td>
                              <td style={tdStyle}>
                                <button
                                  onClick={e => { e.stopPropagation(); printTicket(sale); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all hover:scale-105 active:scale-95"
                                  style={{ background: "rgba(68,153,255,0.12)", color: "#4499FF", border: "1px solid rgba(68,153,255,0.2)" }}
                                >
                                  <Printer size={11} /> Ticket
                                </button>
                              </td>
                            </tr>
                            {expandedId === sale.id && (
                              <tr key={`${sale.id}-detail`}>
                                <td colSpan={6} style={{ padding: "0 16px 12px", borderBottom: DIV, background: "rgba(255,255,255,0.02)" }}>
                                  <div className="space-y-1 pt-2">
                                    {sale.items.map(it => (
                                      <div key={it.id} className="flex items-center justify-between text-xs py-1">
                                        <span style={{ color: TS }}>{it.product?.name ?? "Artículo"}</span>
                                        <span style={{ color: TM }}>x{it.quantity}</span>
                                        <span style={{ color: TP, fontWeight: 700 }}>{fmt(it.total)}</span>
                                      </div>
                                    ))}
                                    <div className="flex items-center gap-3 pt-1 flex-wrap">
                                      {sale.payments.map(p => (
                                        <span key={p.id} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                          style={{ background: "rgba(0,204,102,0.1)", color: "#00CC66" }}>
                                          {p.payment_method?.name ?? "Pago"}: {fmt(p.amount)}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                        {sales.length === 0 && (
                          <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", padding: 32 }}>Sin ventas en el período</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* ── INVENTARIO ── */}
            {activeTab === "inventario" && invReport && (
              <div className="space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex gap-4">
                    <div style={{ ...GLASS, borderRadius: 20, padding: "14px 20px" }}>
                      <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: TM }}>SKUs</p>
                      <p className="text-xl font-black italic" style={{ color: "#4499FF" }}>{invReport.summary.total_skus}</p>
                    </div>
                    <div style={{ ...GLASS, borderRadius: 20, padding: "14px 20px" }}>
                      <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: TM }}>Unidades</p>
                      <p className="text-xl font-black italic" style={{ color: "#00CC66" }}>{invReport.summary.total_quantity}</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={lowStockOnly} onChange={e => setLowStockOnly(e.target.checked)}
                      className="w-4 h-4 accent-red-600 rounded" />
                    <span className="text-xs font-bold" style={{ color: TS }}>Solo bajo stock (≤5)</span>
                  </label>
                </div>

                <div style={{ ...GLASS, borderRadius: 24, overflow: "hidden" }}>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr style={{ borderBottom: DIV }}>
                        {["Producto", "SKU", "Bodega", "Tienda", "Cantidad"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {invReport.data.map((r, i) => (
                          <tr key={i} style={{ borderBottom: DIV }}>
                            <td style={{ ...tdStyle, color: TP, fontWeight: 700 }}>{r.product.name}</td>
                            <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 10 }}>{r.product.sku}</td>
                            <td style={tdStyle}>{r.warehouse.name}</td>
                            <td style={tdStyle}>{r.warehouse.store ?? "—"}</td>
                            <td style={{ ...tdStyle, fontWeight: 900, color: r.quantity <= 5 ? "#FF4422" : r.quantity <= 10 ? "#FFAA00" : "#00CC66" }}>
                              {r.quantity}
                            </td>
                          </tr>
                        ))}
                        {invReport.data.length === 0 && (
                          <tr><td colSpan={5} style={{ ...tdStyle, textAlign: "center", padding: 40 }}>Sin registros</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── TOP PRODUCTOS ── */}
            {activeTab === "productos" && topReport && (
              <div style={{ ...GLASS, borderRadius: 24, overflow: "hidden" }}>
                <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: DIV }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TM }}>Top productos vendidos</p>
                  <p className="text-[9px]" style={{ color: TM }}>{topReport.period.from} → {topReport.period.to}</p>
                </div>
                <table className="w-full">
                  <thead><tr style={{ borderBottom: DIV }}>
                    {["#", "Nombre", "SKU", "Tipo", "Veces", "Unidades", "Ingresos"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {topReport.data.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: DIV, background: i === 0 ? "rgba(255,170,0,0.04)" : "transparent" }}>
                        <td style={{ ...tdStyle, fontWeight: 900, color: i < 3 ? "#FFAA00" : TM }}>{i + 1}</td>
                        <td style={{ ...tdStyle, color: TP, fontWeight: 700 }}>{r.name}</td>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 10 }}>{r.sku}</td>
                        <td style={tdStyle}>
                          <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 9, fontWeight: 900, background: r.type === "product" ? "rgba(68,153,255,0.12)" : "rgba(187,119,255,0.12)", color: r.type === "product" ? "#4499FF" : "#BB77FF" }}>
                            {r.type}
                          </span>
                        </td>
                        <td style={tdStyle}>{r.times_sold}</td>
                        <td style={{ ...tdStyle, fontWeight: 900, color: TP }}>{r.total_quantity}</td>
                        <td style={{ ...tdStyle, fontWeight: 900, color: "#00CC66" }}>{fmt(r.total_revenue)}</td>
                      </tr>
                    ))}
                    {topReport.data.length === 0 && (
                      <tr><td colSpan={7} style={{ ...tdStyle, textAlign: "center", padding: 40 }}>Sin ventas en el período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── TOP CLIENTES ── */}
            {activeTab === "clientes" && custReport && (
              <div style={{ ...GLASS, borderRadius: 24, overflow: "hidden" }}>
                <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: DIV }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TM }}>Clientes por compras</p>
                  <p className="text-[9px]" style={{ color: TM }}>{custReport.period.from} → {custReport.period.to}</p>
                </div>
                <table className="w-full">
                  <thead><tr style={{ borderBottom: DIV }}>
                    {["#", "Cliente", "Teléfono", "Compras", "Total gastado", "Crédito"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {custReport.data.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: DIV, background: i === 0 ? "rgba(255,170,0,0.04)" : "transparent" }}>
                        <td style={{ ...tdStyle, fontWeight: 900, color: i < 3 ? "#FFAA00" : TM }}>{i + 1}</td>
                        <td style={{ ...tdStyle, color: TP, fontWeight: 700 }}>{r.name}</td>
                        <td style={tdStyle}>{r.phone ?? "—"}</td>
                        <td style={tdStyle}>{r.total_purchases}</td>
                        <td style={{ ...tdStyle, fontWeight: 900, color: "#00CC66" }}>{fmt(r.total_spent)}</td>
                        <td style={{ ...tdStyle, fontWeight: 900, color: r.credit_balance > 0 ? "#FFAA00" : TM }}>{fmt(r.credit_balance)}</td>
                      </tr>
                    ))}
                    {custReport.data.length === 0 && (
                      <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", padding: 40 }}>Sin datos en el período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
