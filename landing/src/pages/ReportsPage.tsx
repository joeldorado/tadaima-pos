import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, Package, Users, BarChart3,
  DollarSign,
  ShoppingBag, Star, Calendar, Printer, Store,
  ChevronDown, ChevronRight, Clock, RefreshCw, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@tadaima/auth";
import {
  getSalesReport, getInventoryReport, getTopProductsReport, getCustomersReport,
} from "@tadaima/api";
import { ReportsSkeleton } from "@/components/reports/ReportsSkeleton";
import { getSales } from "@tadaima/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { getTodayLocal, daysAgoLocal, toLocalYmd, BUSINESS_TZ } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesReport, InventoryReport, TopProductsReport, CustomersReport } from "@tadaima/api";
import type { SaleDetail, Store as StoreType } from "@tadaima/api";
import {
  Button as AriaButton,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarHeading,
  Dialog,
  DialogTrigger,
  Popover,
  RangeCalendar,
} from "react-aria-components";
import { parseDate } from "@internationalized/date";

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
const TP  = "var(--td-text-hi)";
const TS  = "var(--td-text-md)";
const TM  = "var(--td-text-lo)";
const DIV = "1px solid var(--td-divider)";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n ?? 0);

// Formato anclado a la zona del NEGOCIO (México), no la del dispositivo: una
// Mac/tablet en otra zona (Tijuana) mostraría la hora corrida ~1h y el día
// equivocado cerca de medianoche.
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const safeUtcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return safeUtcNoon.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: BUSINESS_TZ });
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: BUSINESS_TZ });

// ─── Date conversion helpers ──────────────────────────────────────────────────
const parseYmd = (iso: string) => parseDate(iso);
const toYmdFromDateValue = (value: ReturnType<typeof parseDate>) =>
  `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;

// Suma 1 día para hacer el end date inclusivo (RangeCalendar lo trata como exclusivo)
const addDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  utc.setUTCDate(utc.getUTCDate() + days);
  const ny = utc.getUTCFullYear();
  const nm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(utc.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
};

// "cortes" se movió a la página /cajas (visible a los 3 roles) — Joel 2026-06-12.
// Calcula el lunes de la semana actual (en la zona del negocio)
const getMondayThisWeek = (today: string): string => {
  const d = new Date(today + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Ajusta para lunes
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0];
};

type TabId = "ventas" | "inventario" | "productos" | "clientes";

const REPORT_TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "ventas", label: "Ventas", icon: TrendingUp },
  { id: "inventario", label: "Inventario", icon: Package },
  { id: "productos", label: "Top Productos", icon: Star },
  { id: "clientes", label: "Top Clientes", icon: Users },
];

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

  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("ventas");
  const [isTabSelectorOpen, setIsTabSelectorOpen] = useState(false);

  // Fechas en la zona del NEGOCIO (México), no la del dispositivo (ver
  // lib/date.ts). El primer día del mes se deriva del "hoy" del negocio para
  // no depender del mes del dispositivo (que en otra zona puede diferir).
  const today         = getTodayLocal();
  const firstOfMonth  = `${today.slice(0, 7)}-01`;

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo]     = useState(today);

  // Store filter — admin can pick, others are locked to their store
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const effectiveStoreId = isAdmin ? selectedStoreId : (user?.store_id ?? null);

  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [expandedId,   setExpandedId]   = useState<number | null>(null);
  const [expandedDay,  setExpandedDay]  = useState<string | null>(null);

  const storesQuery = useStoresQuery({ active: true, enabled: isAdmin });
  const stores: StoreType[] = storesQuery.data ?? [];

  const baseParams = { from, to, ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}) };

  // staleTime 30s: navegar entre tabs / volver a Reportes dentro de ese rango
  // sirve del cache (instantáneo) en vez de refetch. El skeleton solo sale
  // cuando de verdad no hay datos para el filtro/tab actual.
  const REPORTS_STALE = 30_000;
  const salesReportQuery = useQuery({
    queryKey: queryKeys.reports.sales(baseParams),
    queryFn: () => getSalesReport(baseParams),
    enabled: activeTab === "ventas",
    staleTime: REPORTS_STALE,
  });
  const salesListParams = { ...baseParams, per_page: 100, status: "completed" as const };
  const salesListQuery = useQuery({
    queryKey: queryKeys.sales.list(salesListParams),
    queryFn: () => getSales(salesListParams),
    enabled: activeTab === "ventas",
    staleTime: REPORTS_STALE,
  });
  const invParams = { low_stock: lowStockOnly, ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}) };
  const invQuery = useQuery({
    queryKey: queryKeys.reports.inventory(invParams),
    queryFn: () => getInventoryReport(invParams),
    enabled: activeTab === "inventario",
    staleTime: REPORTS_STALE,
  });
  const topParams = { from, to, limit: 25, ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}) };
  const topQuery = useQuery({
    queryKey: queryKeys.reports.topProducts(topParams),
    queryFn: () => getTopProductsReport(topParams),
    enabled: activeTab === "productos",
    staleTime: REPORTS_STALE,
  });
  const custQuery = useQuery({
    queryKey: queryKeys.reports.customers(topParams),
    queryFn: () => getCustomersReport(topParams),
    enabled: activeTab === "clientes",
    staleTime: REPORTS_STALE,
  });
  const salesReport: SalesReport | null = salesReportQuery.data ?? null;
  const sales: SaleDetail[] = salesListQuery.data?.data ?? [];
  const invReport: InventoryReport | null = invQuery.data ?? null;
  const topReport: TopProductsReport | null = topQuery.data ?? null;
  const custReport: CustomersReport | null = custQuery.data ?? null;
  // ¿La tab activa está fetcheando? ¿Ya tiene datos para mostrar?
  const isFetchingActive =
    (activeTab === "ventas"     && (salesReportQuery.isFetching || salesListQuery.isFetching)) ||
    (activeTab === "inventario" && invQuery.isFetching) ||
    (activeTab === "productos"  && topQuery.isFetching) ||
    (activeTab === "clientes"   && custQuery.isFetching);
  const activeHasData =
    (activeTab === "ventas"     && salesReport !== null) ||
    (activeTab === "inventario" && invReport !== null) ||
    (activeTab === "productos"  && topReport !== null) ||
    (activeTab === "clientes"   && custReport !== null);
  // Skeleton SOLO cuando no hay datos que mostrar (primera carga / cambio de
  // filtro o tab). El refetch de fondo (con datos en pantalla) muestra el
  // indicador sutil "Actualizando…", no tapa el contenido.
  const loading    = isFetchingActive && !activeHasData;
  const refreshing = isFetchingActive && activeHasData;

  useEffect(() => {
    if (salesReportQuery.error || salesListQuery.error) toast.error("Error al cargar reporte de ventas");
  }, [salesReportQuery.error, salesListQuery.error]);
  useEffect(() => {
    if (invQuery.error) toast.error("Error al cargar inventario");
  }, [invQuery.error]);
  useEffect(() => {
    if (topQuery.error) toast.error("Error al cargar top productos");
  }, [topQuery.error]);
  useEffect(() => {
    if (custQuery.error) toast.error("Error al cargar clientes");
  }, [custQuery.error]);

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

  const paymentBreakdown = useMemo(() => {
    if (!salesReport) {
      return {
        total: 0,
        card: 0,
        cash: 0,
        deposits: 0,
      };
    }

    let card = 0;
    let cash = 0;
    let deposits = 0;

    for (const row of salesReport.by_payment_method) {
      const name = (row.payment_method ?? "").toLowerCase();
      if (name.includes("tarjeta") || name.includes("credit") || name.includes("debito") || name.includes("tpv") || name.includes("terminal")) {
        card += row.amount;
      } else if (name.includes("deposit") || name.includes("transfer") || name.includes("spei")) {
        deposits += row.amount;
      } else if (name.includes("efectivo") || name.includes("cash")) {
        cash += row.amount;
      } else if (name.includes("dolar") || name.includes("dólar") || name.includes("usd")) {
        // USD se suma al bucket de efectivo por operación de caja.
        cash += row.amount;
      } else {
        // Métodos no mapeados se consolidan en efectivo para evitar ruido visual.
        cash += row.amount;
      }
    }

    return {
      total: salesReport.summary.total_revenue,
      card,
      cash,
      deposits,
    };
  }, [salesReport]);

  // Sales grouped by date — for expandable daily rows
  const salesByDate = useMemo(() => {
    const map = new Map<string, SaleDetail[]>();
    for (const sale of sales) {
      // Agrupar por día del NEGOCIO (MX), no por la fecha UTC del timestamp:
      // `.split("T")[0]` daba el día UTC y metía ventas de la madrugada MX en
      // el día siguiente del gráfico.
      const ts = sale.sold_at || sale.created_at;
      const date = ts ? toLocalYmd(new Date(ts)) : "";
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(sale);
    }
    return map;
  }, [sales]);

  const activeTabMeta = REPORT_TABS.find(tab => tab.id === activeTab) ?? REPORT_TABS[0];
  const hiddenTabs = REPORT_TABS.filter(tab => tab.id !== activeTab);

  // ─── Shared UI ───────────────────────────────────────────────────────────────
  const thStyle: React.CSSProperties = { padding: "10px 16px", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM, textAlign: "left" };
  const tdStyle: React.CSSProperties = { padding: "10px 16px", fontSize: 12, color: TS, borderBottom: DIV };

  return (
    <div className="min-h-screen" style={{ background: BG, color: TP }}>
      <div className="max-w-screen-xl mx-auto p-8 space-y-8">

        {/* ── Header + tabs ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
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

          {/* ── Selector de tab colapsable + refresh ─────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap xl:justify-end">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsTabSelectorOpen(prev => !prev)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                style={{ 
                  background: "linear-gradient(135deg,#CC2200,#FF4422)", 
                  color: "#fff",
                  transform: isTabSelectorOpen ? "translateY(4px)" : "translateY(0px)"
                }}
                aria-expanded={isTabSelectorOpen}
                aria-label="Abrir selector de sección de reportes"
              >
                <activeTabMeta.icon size={13} />
                {activeTabMeta.label}
                <ChevronDown size={13} className={`transition-transform ${isTabSelectorOpen ? "rotate-180" : "rotate-0"}`} />
              </button>

              <div
                className={`flex items-center gap-2 overflow-hidden transition-all duration-700 ease-out ${isTabSelectorOpen ? "max-w-[780px] opacity-100 translate-x-0" : "max-w-0 opacity-0 -translate-x-3 pointer-events-none"}`}
              >
                {hiddenTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setIsTabSelectorOpen(false);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: TM }}
                  >
                    <tab.icon size={13} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Botón refresh manual — invalida el dominio del tab activo.
                No hay polling: admin entra → fresh; vuelve al tab → fresh
                (refetchOnWindowFocus). Si quiere ver lo último mientras está
                en la pantalla, click acá. */}
            <button
              onClick={() => {
                if (activeTab === "ventas") {
                  void queryClient.invalidateQueries({ queryKey: queryKeys.reports.sales() });
                  void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
                } else if (activeTab === "inventario") {
                  void queryClient.invalidateQueries({ queryKey: queryKeys.reports.inventory() });
                } else if (activeTab === "productos") {
                  void queryClient.invalidateQueries({ queryKey: queryKeys.reports.topProducts() });
                } else if (activeTab === "clientes") {
                  void queryClient.invalidateQueries({ queryKey: queryKeys.reports.customers() });
                }
                toast.success("Actualizando reporte…");
              }}
              disabled={isFetchingActive}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: TM }}
              title="Forzar refresh del reporte actual"
            >
              <RefreshCw size={13} className={isFetchingActive ? "animate-spin" : ""} />
              {refreshing ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        </div>

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        {["ventas", "productos", "clientes"].includes(activeTab) && (
          <div className="flex items-center gap-3 flex-wrap p-4 rounded-2xl" style={GLASS}>
            <Calendar size={15} style={{ color: RED }} />

            {/* Quick presets */}
            {(() => {
              // Todos los presets se calculan en la zona del NEGOCIO (México),
              // no la del dispositivo (ver lib/date.ts). El mes/año se derivan
              // del "hoy" del negocio para no depender del calendario local.
              const [yy, mm] = today.split("-").map(Number) as [number, number, number]; // mm 1-based
              const pmY = mm === 1 ? yy - 1 : yy;
              const pm  = mm === 1 ? 12 : mm - 1;
              const lastDayPrev = new Date(Date.UTC(yy, mm - 1, 0)).getUTCDate();
              const yesterday        = daysAgoLocal(1);
              const mondayThisWeek   = getMondayThisWeek(today);
              const firstOfMonth     = `${yy}-${String(mm).padStart(2, "0")}-01`;
              const firstOfLastMonth = `${pmY}-${String(pm).padStart(2, "0")}-01`;
              const lastOfLastMonth  = `${pmY}-${String(pm).padStart(2, "0")}-${String(lastDayPrev).padStart(2, "0")}`;
              const presets = [
                { label: "Hoy",         from: today,            to: today },
                { label: "Ayer",        from: yesterday,        to: yesterday },
                { label: "Semana actual", from: mondayThisWeek, to: today },
                { label: "Este mes",    from: firstOfMonth,     to: today },
                { label: "Mes pasado",  from: firstOfLastMonth, to: lastOfLastMonth },
              ];
              return presets.map(p => {
                const active = from === p.from && to === p.to;
                return (
                  <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to); }}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
                    style={active
                      ? { background: "linear-gradient(135deg,#CC2200,#FF4422)", color: "#fff", border: "1px solid rgba(255,120,90,0.3)" }
                      : { background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: TS }
                    }>
                    {p.label}
                  </button>
                );
              });
            })()}

            <div className="w-px h-5 mx-1" style={{ background: "var(--td-divider)" }} />

            {/* Date range picker — Bonito con Popover */}
            <DialogTrigger>
              <AriaButton
                className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all outline-none"
                style={{
                  background: "var(--td-panel-bg)",
                  border: "1px solid var(--td-panel-border)",
                  color: TP,
                }}
              >
                <Calendar size={12} style={{ color: TM }} />
                <span style={{ color: TM }}>{fmtDate(from)}</span>
                <span style={{ color: TM }}>→</span>
                <span style={{ color: TM }}>{fmtDate(to)}</span>
              </AriaButton>

              <Popover
                placement="bottom start"
                offset={8}
                shouldCloseOnBlur={true}
                className="rounded-2xl p-0 outline-none"
                style={{
                  background: "var(--td-popup-bg)",
                  border: "1px solid var(--td-panel-border)",
                  boxShadow: "0 24px 80px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <Dialog className="outline-none">
                  <div className="w-[660px] max-w-[calc(100vw-32px)] p-4">
                    <RangeCalendar
                      aria-label="Rango de fechas de reporte"
                      value={{ start: parseYmd(from), end: parseYmd(to) }}
                      onChange={(range) => {
                        if (!range?.start || !range?.end) return;
                        const startStr = toYmdFromDateValue(range.start);
                        const endStr = toYmdFromDateValue(range.end);
                        if (startStr <= endStr) {
                          setFrom(startStr);
                          setTo(endStr);
                        }
                      }}
                      maxValue={parseYmd(today)}
                      minValue={parseYmd(daysAgoLocal(365))}
                      visibleDuration={{ months: 2 }}
                      pageBehavior="single"
                      className="w-full"
                    >
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <AriaButton
                          slot="previous"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-white/60 transition-colors hover:border-white/20 hover:text-white"
                        >
                          <ChevronLeft size={14} />
                        </AriaButton>

                        <div className="grid flex-1 grid-cols-2 gap-3">
                          <CalendarHeading className="text-center text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: TP }} />
                          <CalendarHeading offset={{ months: 1 }} className="text-center text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: TP }} />
                        </div>

                        <AriaButton
                          slot="next"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-white/60 transition-colors hover:border-white/20 hover:text-white"
                        >
                          <ChevronRight size={14} />
                        </AriaButton>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <CalendarGrid weekdayStyle="short" className="w-full border-separate border-spacing-y-1">
                          <CalendarGridHeader>
                            {(day) => (
                              <CalendarHeaderCell className="pb-2 text-center text-[9px] font-black uppercase tracking-widest" style={{ color: TM }}>
                                {day}
                              </CalendarHeaderCell>
                            )}
                          </CalendarGridHeader>
                          <CalendarGridBody>
                            {(date) => (
                              <CalendarCell
                                date={date}
                                className={({ isSelected, isSelectionStart, isSelectionEnd, isFocusVisible, isOutsideMonth, isDisabled }) =>
                                  [
                                    "flex h-8 w-8 items-center justify-center rounded-lg text-[9px] font-bold transition-all outline-none",
                                    "data-[hovered]:bg-white/8",
                                    isOutsideMonth ? "text-white/20" : "text-white/80",
                                    isDisabled ? "opacity-25" : "",
                                    isSelected ? "text-white bg-[#FF4422]" : "bg-black/10",
                                    isSelectionStart || isSelectionEnd ? "ring-1 ring-[#FF7A59]" : "",
                                    isFocusVisible ? "ring-1 ring-white/70" : "",
                                  ].join(" ")
                                }
                              />
                            )}
                          </CalendarGridBody>
                        </CalendarGrid>

                        <CalendarGrid offset={{ months: 1 }} weekdayStyle="short" className="w-full border-separate border-spacing-y-1">
                          <CalendarGridHeader>
                            {(day) => (
                              <CalendarHeaderCell className="pb-2 text-center text-[9px] font-black uppercase tracking-widest" style={{ color: TM }}>
                                {day}
                              </CalendarHeaderCell>
                            )}
                          </CalendarGridHeader>
                          <CalendarGridBody>
                            {(date) => (
                              <CalendarCell
                                date={date}
                                className={({ isSelected, isSelectionStart, isSelectionEnd, isFocusVisible, isOutsideMonth, isDisabled }) =>
                                  [
                                    "flex h-8 w-8 items-center justify-center rounded-lg text-[9px] font-bold transition-all outline-none",
                                    "data-[hovered]:bg-white/8",
                                    isOutsideMonth ? "text-white/20" : "text-white/80",
                                    isDisabled ? "opacity-25" : "",
                                    isSelected ? "text-white bg-[#FF4422]" : "bg-black/10",
                                    isSelectionStart || isSelectionEnd ? "ring-1 ring-[#FF7A59]" : "",
                                    isFocusVisible ? "ring-1 ring-white/70" : "",
                                  ].join(" ")
                                }
                              />
                            )}
                          </CalendarGridBody>
                        </CalendarGrid>
                      </div>
                    </RangeCalendar>

                    <div
                      className="mt-4 flex items-center justify-between rounded-lg px-3 py-2 text-[9px]"
                      style={{ background: "rgba(0,0,0,0.16)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div className="font-black uppercase tracking-[0.12em]" style={{ color: TM }}>
                        <span style={{ color: TP }}>Desde</span>
                        <span className="mx-1.5">{fmtDate(from)}</span>
                        <span style={{ color: TM }}>•</span>
                        <span className="mx-1.5"><span style={{ color: TP }}>Hasta</span> {fmtDate(to)}</span>
                      </div>
                    </div>
                  </div>
                </Dialog>
              </Popover>
            </DialogTrigger>

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
          <ReportsSkeleton />
        ) : (
          <>
            {/* ── VENTAS ── */}
            {activeTab === "ventas" && salesReport && (
              <div className="space-y-6">

                {/* ── KPI Cards ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {[
                    { label: "Total cobrado", val: fmt(paymentBreakdown.total), color: "#00CC66", icon: DollarSign, sub: `${salesReport.summary.total_count} transacciones` },
                    { label: "Pago con tarjeta", val: fmt(paymentBreakdown.card), color: "#4499FF", icon: Store, sub: paymentBreakdown.card > 0 ? "TPV / débito / crédito" : "sin movimientos" },
                    { label: "Pago en efectivo", val: fmt(paymentBreakdown.cash), color: "#33CC88", icon: ShoppingBag, sub: paymentBreakdown.cash > 0 ? "incluye cobro en USD" : "sin movimientos" },
                    { label: "Depósitos", val: fmt(paymentBreakdown.deposits), color: "#BB77FF", icon: Clock, sub: paymentBreakdown.deposits > 0 ? "transferencias / SPEI" : "sin depósitos" },
                  ].map((kpi, i) => (
                    <div key={i} className="min-h-[124px] flex flex-col" style={{ ...GLASS, borderRadius: 20, padding: "12px 20px" }}>
                      <div className="flex items-center gap-2">
                        <kpi.icon size={15} style={{ color: kpi.color, flexShrink: 0 }} />
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: TM }}>{kpi.label}</p>
                      </div>

                      <div className="flex-1 flex items-center justify-center">
                        <p className="text-5xl font-black italic leading-none text-center" style={{ color: kpi.color }}>{kpi.val}</p>
                      </div>

                      <p className="text-[9px] text-center" style={{ color: TM }}>{kpi.sub}</p>
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
                                        const time = new Date(sale.sold_at || sale.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: BUSINESS_TZ });
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
