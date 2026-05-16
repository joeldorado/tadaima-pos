import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, DollarSign, ShoppingBag, Users, BarChart3, Loader2,
  CreditCard, CalendarDays, ChevronDown, X, ChevronRight,
  Package, Receipt, PackageX, ChevronUp, ImageOff, RotateCcw, AlertTriangle,
  Store, Printer,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { returnSale } from "@tadaima/api";
import { useQueryClient } from "@tanstack/react-query";
import { useSalesQuery } from "@/hooks/queries/useSales";
import { usePreSaleOrdersQuery } from "@/hooks/queries/usePreSales";
import { useProductsQuery } from "@/hooks/queries/useProducts";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { queryKeys } from "@/lib/queryKeys";
import type { SaleDetail, PreSaleOrder, Product, Store as StoreType } from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { toast } from "sonner";

const T = {
  bgGrad: "var(--td-page-bg)",
  glass: {
    background: "var(--td-panel-bg)",
    backdropFilter: "blur(28px) saturate(160%)",
    WebkitBackdropFilter: "blur(28px) saturate(160%)",
    border: "1px solid var(--td-panel-border)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
  } as React.CSSProperties,
  glassDim: {
    background: "var(--td-panel-bg)",
    backdropFilter: "blur(20px) saturate(140%)",
    WebkitBackdropFilter: "blur(20px) saturate(140%)",
    border: "1px solid var(--td-panel-border)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
  } as React.CSSProperties,
  redBright: "#FF4422",
  btnRed: {
    background: "linear-gradient(135deg, #CC2200 0%, #FF4422 100%)",
    borderRadius: "9999px",
    border: "1px solid rgba(255,120,90,0.3)",
    boxShadow: "0 0 28px rgba(204,34,0,0.45), 0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,180,160,0.25)",
    color: "#ffffff",
  } as React.CSSProperties,
};

interface ProductInfo {
  name: string;
  sku: string;
  imagen: string;
}

function getPaymentMethodName(sale: SaleDetail): string {
  const first = sale.payments?.[0];
  if (!first) return "Efectivo";
  return first.payment_method?.name ?? "Efectivo";
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);

const fmtDate = (dateStr: string) => {
  if (!dateStr) return "DD/MM/YYYY";
  return new Date(dateStr + "T12:00:00")
    .toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
    .replace(".", "");
};

const fmtDateTime = (dateStr: string) =>
  dateStr ? new Date(dateStr).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";

const methodBg = (m: string) => {
  const lm = (m || "").toLowerCase();
  if (lm.includes("tarjeta"))  return "bg-blue-500/10 border-blue-500/25 text-blue-400";
  if (lm.includes("dólar") || lm.includes("dolar")) return "bg-amber-500/10 border-amber-500/25 text-amber-400";
  if (lm.includes("transfer")) return "bg-purple-500/10 border-purple-500/25 text-purple-400";
  return "bg-emerald-500/10 border-emerald-500/25 text-emerald-400";
};

function printTicket(sale: SaleDetail) {
  const win = window.open("", "_blank", "width=340,height=600");
  if (!win) return;
  const payName = getPaymentMethodName(sale);
  const items = (sale.items || [])
    .map(i => {
      const name = i.product?.name || String(i.product_id);
      return `<tr>
        <td style="padding:2px 0;font-size:10px;">${name}</td>
        <td style="text-align:center;padding:2px 4px;font-size:10px;">×${i.quantity}</td>
        <td style="text-align:right;font-size:10px;">${fmt(i.price * i.quantity)}</td>
      </tr>`;
    })
    .join("");

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Ticket #${sale.id}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',monospace;font-size:11px;width:280px;padding:12px 8px}
    h2{font-size:16px;text-align:center;font-weight:900;margin-bottom:4px}
    .sub{font-size:9px;text-align:center;color:#555;margin-bottom:8px}
    .divider{border-top:1px dashed #000;margin:8px 0}
    table{width:100%;border-collapse:collapse}
    .total-row td{font-weight:900;font-size:13px;border-top:1px solid #000;padding-top:6px}
    .footer{text-align:center;font-size:9px;color:#555;margin-top:10px}
    @media print{@page{margin:0;size:58mm auto}body{width:58mm}}
  </style></head><body>
  <h2>TADAIMA</h2>
  <div class="sub">Manga & Hobby Store</div>
  <div class="divider"></div>
  <div style="font-size:9px;margin-bottom:6px">
    <div>Ticket #${sale.id}</div>
    <div>${fmtDateTime(sale.sold_at || sale.created_at)}</div>
    ${sale.customer?.name ? `<div>Cliente: ${sale.customer.name}</div>` : ""}
    <div>Pago: ${payName}</div>
  </div>
  <div class="divider"></div>
  <table>
    <thead><tr>
      <th style="text-align:left;font-size:9px">Artículo</th>
      <th style="text-align:center;font-size:9px">Cant</th>
      <th style="text-align:right;font-size:9px">Total</th>
    </tr></thead>
    <tbody>${items}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td style="text-align:right">${fmt(sale.total)}</td>
    </tr></tfoot>
  </table>
  <div class="divider"></div>
  <div class="footer">¡Gracias por tu compra!</div>
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 300);
}

// ─── Thumbnail de producto ────────────────────────────────────────────────────
function ProductThumb({ src, name, size = 44, rounded = "rounded-xl" }: { src?: string; name?: string; size?: number; rounded?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div
        className={`flex-shrink-0 ${rounded} flex items-center justify-center`}
        style={{ width: size, height: size, background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}
      >
        <ImageOff size={size * 0.35} style={{ color: "var(--td-text-lo)" }} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name || ""}
      onError={() => setErr(true)}
      className={`flex-shrink-0 ${rounded} object-cover`}
      style={{ width: size, height: size, border: "1px solid var(--td-panel-border)" }}
    />
  );
}

// ─── SaleRow expandible ───────────────────────────────────────────────────────
function SaleRow({
  sale, productMap, rank, onReturn,
}: {
  sale: SaleDetail;
  productMap: Record<string, ProductInfo>;
  rank: number;
  onReturn: (id: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [returning, setReturning] = useState(false);
  const itemCount = sale.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const paymentName = getPaymentMethodName(sale);

  const previewItems = (sale.items || []).slice(0, 3);

  return (
    <div className="rounded-2xl overflow-hidden transition-all group" style={{ border: "1px solid var(--td-panel-border)" }}>
      {/* ── Fila principal ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-[9px] font-black w-5 text-center flex-shrink-0" style={{ color: "var(--td-text-lo)" }}>{rank}</span>

        <ChevronRight
          size={12}
          className={`transition-transform flex-shrink-0 group-hover:opacity-60 ${open ? "rotate-90 !text-red-400" : ""}`}
          style={{ color: "var(--td-text-lo)" }}
        />

        <div className="flex items-center -space-x-2 flex-shrink-0">
          {previewItems.map((item, i) => {
            const info = productMap[String(item.product_id)];
            return (
              <div key={i} className="rounded-lg border-2 overflow-hidden" style={{ width: 32, height: 32, borderColor: "var(--td-page-bg)" }}>
                <ProductThumb src={info?.imagen} name={info?.name || item.product?.name} size={32} rounded="rounded-none" />
              </div>
            );
          })}
          {(sale.items || []).length > 3 && (
            <div className="w-8 h-8 rounded-lg border-2 flex items-center justify-center text-[8px] font-black flex-shrink-0"
              style={{ borderColor: "var(--td-page-bg)", background: "var(--td-panel-bg)", color: "var(--td-text-lo)" }}>
              +{sale.items.length - 3}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 w-[115px]">
          <p className="text-xs font-bold" style={{ color: "var(--td-text-hi)" }}>{fmtDateTime(sale.sold_at || sale.created_at)}</p>
        </div>

        <div className="flex-1 min-w-0 hidden lg:block">
          <p className="text-[9px] font-black uppercase tracking-widest truncate" style={{ color: "var(--td-text-lo)" }}>#{sale.id}</p>
          {sale.customer?.name && (
            <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--td-text-md)" }}>{sale.customer.name}</p>
          )}
        </div>

        <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border flex-shrink-0 ${methodBg(paymentName)}`}>
          {paymentName}
        </span>

        <div className="flex-shrink-0 text-center w-10 hidden sm:block">
          <p className="text-xs font-bold" style={{ color: "var(--td-text-md)" }}>{itemCount}</p>
          <p className="text-[7px] uppercase" style={{ color: "var(--td-text-lo)" }}>arts.</p>
        </div>

        <p className="ml-auto text-sm font-black flex-shrink-0" style={{ color: "var(--td-text-hi)" }}>{fmt(sale.total)}</p>
      </button>

      {/* ── Detalle expandido ── */}
      {open && (
        <div className="px-5 py-4 space-y-2" style={{ borderTop: "1px solid var(--td-panel-border)", background: "rgba(0,0,0,0.15)" }}>
          {(sale.items || []).length === 0 && (
            <p className="text-[10px] text-center py-3" style={{ color: "var(--td-text-lo)" }}>Sin detalle de artículos</p>
          )}
          {(sale.items || []).map((item, idx) => {
            const info = productMap[String(item.product_id)];
            const name = item.product?.name || info?.name || String(item.product_id);
            const sku  = item.product?.sku  || info?.sku  || "";
            const img  = info?.imagen;
            return (
              <div
                key={idx}
                className="flex items-center gap-3 py-2 last:border-0"
                style={{ borderBottom: "1px solid var(--td-panel-border)" }}
              >
                <ProductThumb src={img} name={name} size={44} rounded="rounded-xl" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: "var(--td-text-hi)" }}>{name}</p>
                  {sku && <p className="text-[9px] uppercase tracking-widest mt-0.5 truncate" style={{ color: "var(--td-text-lo)" }}>{sku}</p>}
                </div>

                <div className="flex items-center gap-5 flex-shrink-0 text-right">
                  <div className="text-center">
                    <p className="text-xs font-black" style={{ color: "var(--td-text-md)" }}>×{item.quantity}</p>
                    <p className="text-[8px] uppercase" style={{ color: "var(--td-text-lo)" }}>cant.</p>
                  </div>
                  <div className="text-right w-[58px]">
                    <p className="text-xs font-bold" style={{ color: "var(--td-text-md)" }}>{fmt(item.price)}</p>
                    <p className="text-[8px] uppercase" style={{ color: "var(--td-text-lo)" }}>unit.</p>
                  </div>
                  <div className="text-right w-[70px]">
                    <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(item.price * item.quantity)}</p>
                    <p className="text-[8px] uppercase" style={{ color: "var(--td-text-lo)" }}>subtotal</p>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex justify-between items-center pt-2" style={{ borderTop: "1px solid var(--td-panel-border)" }}>
            <div className="flex items-center gap-3">
              {/* Reimprimir ticket */}
              <button
                onClick={() => printTicket(sale)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all hover:scale-105"
                style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: "var(--td-text-md)" }}
              >
                <Printer size={10} />
                Ticket
              </button>

              {/* Devolver */}
              {sale.status === "completed" && (
                confirmReturn ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                      <AlertTriangle size={11} /> ¿Confirmar?
                    </span>
                    <button
                      onClick={async () => {
                        setReturning(true);
                        try { await onReturn(sale.id); }
                        finally { setReturning(false); setConfirmReturn(false); }
                      }}
                      disabled={returning}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                    >
                      {returning ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                      Devolver
                    </button>
                    <button
                      onClick={() => setConfirmReturn(false)}
                      className="text-[8px] font-bold uppercase tracking-widest px-2 py-1 hover:opacity-70"
                      style={{ color: "var(--td-text-lo)" }}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmReturn(true)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all hover:border-amber-500/30"
                    style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: "var(--td-text-lo)" }}
                  >
                    <RotateCcw size={10} />
                    Devolver
                  </button>
                )
              )}
              {sale.status === "returned" && (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 text-amber-500">
                  <RotateCcw size={10} /> Devuelta
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Total:</span>
              <span className="text-base font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(sale.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function SalesPage() {
  const { user } = useAuth();

  const isAdmin   = user?.roles?.some(r => ["admin","super_admin","owner","dueño"].includes(r.toLowerCase())) ?? false;
  const isGerente = user?.roles?.some(r => r.toLowerCase() === "gerente") ?? false;
  const canPickStore = isAdmin;

  const [chartOpen, setChartOpen] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const effectiveStoreId: number | null = canPickStore ? selectedStoreId : (user?.store_id ?? null);

  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate]     = useState("");
  const [filterMethod, setFilterMethod]       = useState("all");
  const [isMethodOpen, setIsMethodOpen]       = useState(false);
  const [activeTab, setActiveTab]             = useState<"ventas" | "productos">("ventas");
  const [searchSale, setSearchSale]           = useState("");
  const [searchProduct, setSearchProduct]     = useState("");

  // Preset date shortcuts
  const setPreset = (preset: "today" | "week" | "month") => {
    const now = new Date();
    const today = now.toISOString().split("T")[0]!;
    if (preset === "today") {
      setFilterStartDate(today);
      setFilterEndDate(today);
    } else if (preset === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      setFilterStartDate(d.toISOString().split("T")[0]!);
      setFilterEndDate(today);
    } else {
      setFilterStartDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
      setFilterEndDate(today);
    }
  };

  const methodOptions = [
    { value: "all",      label: "Todos los pagos" },
    { value: "efectivo", label: "Efectivo" },
    { value: "tarjeta",  label: "Tarjeta" },
    { value: "dólares",  label: "Dólares" },
    { value: "varios",   label: "Varios / Preventas" },
  ];

  const gradientId = useMemo(() => `grad-${Math.random().toString(36).slice(2, 8)}`, []);

  const queryClient = useQueryClient();
  const storesQuery = useStoresQuery({ active: true, enabled: canPickStore });
  const stores: StoreType[] = storesQuery.data ?? [];

  const salesParams: Record<string, unknown> = { per_page: 500 };
  if (effectiveStoreId) salesParams.store_id = effectiveStoreId;
  if (filterStartDate) salesParams.from = filterStartDate;
  if (filterEndDate)   salesParams.to   = filterEndDate;

  const preSaleOrdersParams: Record<string, unknown> = { per_page: 500, status: 'pending,ready' };
  if (effectiveStoreId) preSaleOrdersParams.store_id = effectiveStoreId;
  if (filterStartDate) preSaleOrdersParams.from = filterStartDate;
  if (filterEndDate)   preSaleOrdersParams.to   = filterEndDate;

  const salesQuery = useSalesQuery(salesParams as Parameters<typeof useSalesQuery>[0]);
  const preSaleOrdersQuery = usePreSaleOrdersQuery(preSaleOrdersParams as Parameters<typeof usePreSaleOrdersQuery>[0]);
  const productsQuery = useProductsQuery();

  const sales: SaleDetail[] = salesQuery.data?.data ?? [];
  const preSaleOrders: PreSaleOrder[] = preSaleOrdersQuery.data?.data ?? [];
  const productMap: Record<string, ProductInfo> = useMemo(() => {
    const map: Record<string, ProductInfo> = {};
    (productsQuery.data?.data ?? []).forEach((p: Product) => {
      if (p.id) {
        map[String(p.id)] = { name: p.name || "", sku: p.sku || "", imagen: "" };
      }
    });
    return map;
  }, [productsQuery.data]);
  const loading = salesQuery.isPending || preSaleOrdersQuery.isPending || productsQuery.isPending;

  useEffect(() => {
    if (salesQuery.error || preSaleOrdersQuery.error || productsQuery.error) {
      toast.error("Error al cargar datos financieros");
    }
  }, [salesQuery.error, preSaleOrdersQuery.error, productsQuery.error]);

  const handleReturn = async (saleId: number) => {
    try {
      await returnSale(saleId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      toast.success("Devolución registrada. Inventario restaurado.");
    } catch {
      toast.error("Error al procesar la devolución");
    }
  };

  // ── Filtrado (method only, dates now server-side) ─────────────────────────
  const filteredSales = useMemo(() => {
    if (filterMethod === "all") return sales;
    return sales.filter(s => getPaymentMethodName(s).toLowerCase().includes(filterMethod.toLowerCase()));
  }, [sales, filterMethod]);

  const filteredPreSales = useMemo(() => {
    if (filterMethod !== "all" && filterMethod !== "varios") return [];
    return preSaleOrders.filter(p => p.status === 'pending' || p.status === 'ready');
  }, [preSaleOrders, filterMethod]);

  // ── Métricas ──────────────────────────────────────────────────────────────
  const totalSalesRevenue = useMemo(() => filteredSales.reduce((a, s) => a + s.total, 0), [filteredSales]);
  const totalPreRevenue   = useMemo(() => filteredPreSales.reduce((a, p) => a + (p.paid_amount ?? 0), 0), [filteredPreSales]);
  const totalRevenue = totalSalesRevenue + totalPreRevenue;

  const todayRevenue = useMemo(() => {
    if (filterStartDate || filterEndDate) return totalRevenue;
    const today = new Date().toISOString().split("T")[0]!;
    return (
      sales.filter(s => (s.sold_at || s.created_at).startsWith(today)).reduce((a, s) => a + s.total, 0) +
      preSaleOrders
        .filter(p => (p.status === 'pending' || p.status === 'ready') && p.created_at.startsWith(today))
        .reduce((a, p) => a + (p.paid_amount ?? 0), 0)
    );
  }, [sales, preSaleOrders, filterStartDate, filterEndDate, totalRevenue]);

  const pendingPreSales = useMemo(
    () => filteredPreSales.reduce((a, p) => a + (p.balance ?? 0), 0),
    [filteredPreSales]
  );

  const methodsBreakdown = useMemo(() => {
    const map: Record<string, number> = { Efectivo: 0, Tarjeta: 0, Dólares: 0, Transferencia: 0 };
    filteredSales.forEach(s => {
      const m = getPaymentMethodName(s);
      map[m] = (map[m] || 0) + s.total;
    });
    return map;
  }, [filteredSales]);

  const salesByDay = useMemo(() => {
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const map: Record<string, number> = {};
    filteredSales.forEach(s => {
      const d = days[new Date(s.sold_at || s.created_at).getDay()];
      if (d) map[d] = (map[d] || 0) + s.total;
    });
    filteredPreSales.forEach(p => {
      const d = days[new Date(p.created_at).getDay()];
      if (d) map[d] = (map[d] || 0) + (p.paid_amount ?? 0);
    });
    return days.map(d => ({ day: d, revenue: map[d] || 0 }));
  }, [filteredSales, filteredPreSales]);

  // ── Lista de ventas ────────────────────────────────────────────────────────
  const sortedSales = useMemo(
    () => [...filteredSales].sort((a, b) =>
      new Date(b.sold_at || b.created_at).getTime() - new Date(a.sold_at || a.created_at).getTime()
    ),
    [filteredSales]
  );

  const displayedSales = useMemo(() => {
    if (!searchSale.trim()) return sortedSales;
    const q = searchSale.toLowerCase();
    return sortedSales.filter(s =>
      String(s.id).includes(q) ||
      (s.customer?.name || "").toLowerCase().includes(q) ||
      getPaymentMethodName(s).toLowerCase().includes(q) ||
      (s.items || []).some(i => {
        const info = productMap[String(i.product_id)];
        return (i.product?.name || info?.name || "").toLowerCase().includes(q) ||
               (i.product?.sku  || info?.sku  || "").toLowerCase().includes(q);
      })
    );
  }, [sortedSales, searchSale, productMap]);

  // ── Agregado por producto ──────────────────────────────────────────────────
  interface ProductStat {
    product_id: string; name: string; sku: string; imagen: string;
    timesAppeared: number; totalUnits: number; totalRevenue: number;
    avgPrice: number;
  }

  const productStats = useMemo((): ProductStat[] => {
    const map = new Map<string, ProductStat>();
    filteredSales.forEach(sale => {
      const seen = new Set<string>();
      (sale.items || []).forEach(item => {
        const pid  = String(item.product_id);
        const info = productMap[pid];
        const name = item.product?.name || info?.name || pid;
        const sku  = item.product?.sku  || info?.sku  || "";
        const img  = info?.imagen || "";
        if (!map.has(pid)) map.set(pid, { product_id: pid, name, sku, imagen: img, timesAppeared: 0, totalUnits: 0, totalRevenue: 0, avgPrice: 0 });
        const st = map.get(pid)!;
        if (!st.imagen && img) st.imagen = img;
        if (!seen.has(pid)) { st.timesAppeared++; seen.add(pid); }
        st.totalUnits   += item.quantity;
        st.totalRevenue += item.price * item.quantity;
      });
    });
    map.forEach(st => { st.avgPrice = st.totalUnits > 0 ? st.totalRevenue / st.totalUnits : 0; });
    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filteredSales, productMap]);

  const displayedProducts = useMemo(() => {
    if (!searchProduct.trim()) return productStats;
    const q = searchProduct.toLowerCase();
    return productStats.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [productStats, searchProduct]);

  const topRevenue = displayedProducts[0]?.totalRevenue || 1;

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4" style={{ background: T.bgGrad }}>
        <Loader2 size={40} className="animate-spin text-red-500" />
        <p className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: "var(--td-text-lo)" }}>Cargando Ventas...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: T.bgGrad }}>

      {/* ── Header ── */}
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
            <BarChart3 size={24} style={{ color: T.redBright }} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter" style={{ color: "var(--td-text-hi)" }}>
              REPORTE DE <span style={{ color: T.redBright }}>VENTAS</span>
            </h1>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] mt-0.5" style={{ color: "var(--td-text-lo)" }}>Control Financiero Tadaima</p>
          </div>
        </div>

        {/* ── Controles ── */}
        <div className="flex flex-col gap-2">

          {/* Fila 1: Tienda + Método + Actualizar */}
          <div className="flex flex-wrap items-center gap-2">

            {/* Store picker (admin) */}
            {canPickStore && (
              <div className="flex items-center gap-2 rounded-full px-3 py-1.5 h-[36px]"
                style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
                <Store size={12} style={{ color: "var(--td-text-lo)" }} />
                <select
                  value={selectedStoreId ?? ""}
                  onChange={e => setSelectedStoreId(e.target.value ? Number(e.target.value) : null)}
                  className="bg-transparent outline-none text-[10px] font-bold uppercase tracking-widest cursor-pointer"
                  style={{ color: "var(--td-text-hi)" }}
                >
                  <option value="">Todas las tiendas</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Store badge for non-admin */}
            {!canPickStore && user?.store_id && (
              <div className="flex items-center gap-2 rounded-full px-3 py-1.5 h-[36px]"
                style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
                <Store size={12} style={{ color: "var(--td-text-lo)" }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--td-text-md)" }}>
                  {isGerente ? "Gerente" : "Mi tienda"}
                </span>
              </div>
            )}

            {/* Método de pago */}
            <div className="relative">
              <button onClick={() => setIsMethodOpen(v => !v)}
                className="flex items-center gap-2 rounded-full px-4 py-2 h-[36px] transition-colors"
                style={{ background: "var(--td-panel-bg)", border: `1px solid ${filterMethod !== "all" ? "rgba(255,68,34,0.4)" : "var(--td-panel-border)"}` }}>
                <CreditCard size={12} style={{ color: filterMethod !== "all" ? T.redBright : "var(--td-text-lo)" }} />
                <span className="text-[9px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: "var(--td-text-hi)" }}>
                  {methodOptions.find(o => o.value === filterMethod)?.label}
                </span>
                <ChevronDown size={10} style={{ color: "var(--td-text-lo)" }} className="ml-1" />
              </button>
              {isMethodOpen && (
                <div className="absolute top-[calc(100%+6px)] right-0 w-48 rounded-2xl overflow-hidden shadow-2xl z-50"
                  style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}>
                  {methodOptions.map(opt => (
                    <button key={opt.value} onClick={() => { setFilterMethod(opt.value); setIsMethodOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest transition-colors"
                      style={{
                        color: filterMethod === opt.value ? T.redBright : "var(--td-text-md)",
                        background: filterMethod === opt.value ? "rgba(255,68,34,0.08)" : "transparent",
                      }}
                      onMouseEnter={e => { if (filterMethod !== opt.value) (e.target as HTMLElement).style.background = "var(--td-panel-border)"; }}
                      onMouseLeave={e => { if (filterMethod !== opt.value) (e.target as HTMLElement).style.background = "transparent"; }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => { void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all }); void queryClient.invalidateQueries({ queryKey: queryKeys.preSaleOrders.all }); }}
              className="flex items-center justify-center gap-2 px-5 h-[36px] font-black text-[9px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
              style={T.btnRed}>
              <TrendingUp size={13} strokeWidth={3} />
              Actualizar
            </button>
          </div>

          {/* Fila 2: Fecha */}
          <div className="flex items-center gap-2">
            {/* Preset chips */}
            {(["today", "week", "month"] as const).map(p => (
              <button key={p} onClick={() => setPreset(p)}
                className="h-[30px] px-3 rounded-full text-[8px] font-black uppercase tracking-widest transition-all hover:scale-105"
                style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: "var(--td-text-md)" }}>
                {p === "today" ? "Hoy" : p === "week" ? "7 días" : "Este mes"}
              </button>
            ))}

            {/* Date range picker */}
            <div className="flex items-center gap-1 rounded-full px-3 py-1.5 h-[30px]"
              style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
              <CalendarDays size={11} style={{ color: "var(--td-text-lo)" }} />
              <div className="flex items-center gap-1 ml-1">
                <div className="relative flex items-center justify-center min-w-[72px]">
                  <span className="text-[9px] font-bold tracking-widest uppercase pointer-events-none select-none"
                    style={{ color: filterStartDate ? "var(--td-text-hi)" : "var(--td-text-lo)" }}>
                    {fmtDate(filterStartDate)}
                  </span>
                  <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
                <span className="text-[9px]" style={{ color: "var(--td-text-lo)" }}>→</span>
                <div className="relative flex items-center justify-center min-w-[72px]">
                  <span className="text-[9px] font-bold tracking-widest uppercase pointer-events-none select-none"
                    style={{ color: filterEndDate ? "var(--td-text-hi)" : "var(--td-text-lo)" }}>
                    {fmtDate(filterEndDate)}
                  </span>
                  <input type="date" value={filterEndDate} min={filterStartDate} onChange={e => setFilterEndDate(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>
              {(filterStartDate || filterEndDate) && (
                <button onClick={() => { setFilterStartDate(""); setFilterEndDate(""); }}
                  className="ml-1 w-4 h-4 rounded-full flex items-center justify-center transition-colors z-10 hover:opacity-70"
                  style={{ background: "var(--td-panel-border)", color: "var(--td-text-md)" }}>
                  <X size={8} />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: (filterStartDate || filterEndDate) ? "Ingresos Período" : "Ingresos Totales", value: fmt(totalRevenue), icon: DollarSign, color: T.redBright },
          { label: "Ingresos Hoy",           value: fmt(todayRevenue),    icon: TrendingUp,  color: "#00CC66" },
          { label: "Por Cobrar (Preventas)",  value: fmt(pendingPreSales), icon: CreditCard,  color: "#facc15" },
          { label: "Ventas Totales",          value: String(filteredSales.length + filteredPreSales.length), icon: ShoppingBag, color: "#4488FF" },
          { label: "Artículos Vendidos",      value: String(filteredSales.reduce((a, s) => a + (s.items?.reduce((b, i) => b + i.quantity, 0) ?? 0), 0)), icon: Package, color: "#FFAA00" },
        ].map((stat, i) => (
          <div key={i} className="p-4 rounded-[24px] flex items-center gap-3" style={T.glass}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
              <stat.icon size={16} style={{ color: stat.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-widest truncate" style={{ color: "var(--td-text-lo)" }}>{stat.label}</p>
              <p className="text-lg font-black italic leading-tight" style={{ color: "var(--td-text-hi)" }}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ══════════ LISTAS ══════════ */}
      <div className="rounded-[36px] overflow-hidden" style={T.glass}>

        {/* Tab bar */}
        <div className="flex items-center justify-between px-8 pt-7 pb-0" style={{ borderBottom: "1px solid var(--td-panel-border)" }}>
          <div className="flex items-end gap-1">
            {(["ventas", "productos"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2.5 px-6 py-3.5 rounded-t-2xl text-[10px] font-black uppercase tracking-widest transition-all border-b-2 -mb-px ${
                  activeTab === tab
                    ? "border-red-500 bg-gradient-to-b from-red-500/10 to-transparent"
                    : "border-transparent hover:bg-white/[0.02]"
                }`}
                style={{ color: activeTab === tab ? "var(--td-text-hi)" : "var(--td-text-lo)" }}
              >
                {tab === "ventas" ? <Receipt size={14} /> : <Package size={14} />}
                {tab === "ventas" ? "Lista de Ventas" : "Por Producto"}
                <span className="px-2 py-0.5 rounded-full text-[8px] font-black"
                  style={{ background: activeTab === tab ? "rgba(255,68,34,0.2)" : "var(--td-panel-bg)", color: activeTab === tab ? "#FF8866" : "var(--td-text-lo)" }}>
                  {tab === "ventas" ? displayedSales.length : displayedProducts.length}
                </span>
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-6 pb-1">
            {activeTab === "ventas" ? (
              <>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Artículos vendidos</p>
                  <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>
                    {displayedSales.reduce((a, s) => a + (s.items?.reduce((b, i) => b + i.quantity, 0) ?? 0), 0)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Total recibido</p>
                  <p className="text-sm font-black" style={{ color: T.redBright }}>{fmt(displayedSales.reduce((a, s) => a + s.total, 0))}</p>
                </div>
              </>
            ) : (
              <>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Productos únicos</p>
                  <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{displayedProducts.length}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Total ingresado</p>
                  <p className="text-sm font-black" style={{ color: T.redBright }}>{fmt(displayedProducts.reduce((a, p) => a + p.totalRevenue, 0))}</p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">

          {/* ══ Tab: Lista de Ventas ══ */}
          {activeTab === "ventas" && (
            <>
              <div className="flex items-center gap-3 rounded-2xl px-4 py-2.5"
                style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--td-panel-border)" }}>
                <Receipt size={13} style={{ color: "var(--td-text-lo)" }} className="flex-shrink-0" />
                <input value={searchSale} onChange={e => setSearchSale(e.target.value)}
                  placeholder="Buscar por ID, cliente, método de pago, producto…"
                  className="flex-1 bg-transparent outline-none text-xs"
                  style={{ color: "var(--td-text-hi)" }} />
                {searchSale && <button onClick={() => setSearchSale("")} className="hover:opacity-70 transition-opacity" style={{ color: "var(--td-text-lo)" }}><X size={12} /></button>}
              </div>

              <div className="flex items-center gap-4 px-4 py-1.5 text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)", borderBottom: "1px solid var(--td-panel-border)" }}>
                <span className="w-5">#</span>
                <span className="w-3" />
                <span style={{ width: 80 }} />
                <span className="w-[115px]">Fecha</span>
                <span className="flex-1 hidden lg:block">ID / Cliente</span>
                <span>Método</span>
                <span className="w-10 text-center hidden sm:block">Arts.</span>
                <span className="ml-auto">Total</span>
              </div>

              <div className="space-y-1.5">
                {displayedSales.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20" style={{ opacity: 0.15 }}>
                    <Receipt size={40} className="mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Sin ventas en este período</p>
                  </div>
                ) : (
                  displayedSales.map((sale, idx) => (
                    <SaleRow key={`${sale.id}-${idx}`} sale={sale} productMap={productMap} rank={idx + 1} onReturn={handleReturn} />
                  ))
                )}
              </div>
            </>
          )}

          {/* ══ Tab: Por Producto ══ */}
          {activeTab === "productos" && (
            <>
              <div className="flex items-center gap-3 rounded-2xl px-4 py-2.5"
                style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--td-panel-border)" }}>
                <Package size={13} style={{ color: "var(--td-text-lo)" }} className="flex-shrink-0" />
                <input value={searchProduct} onChange={e => setSearchProduct(e.target.value)}
                  placeholder="Buscar producto por nombre o SKU…"
                  className="flex-1 bg-transparent outline-none text-xs"
                  style={{ color: "var(--td-text-hi)" }} />
                {searchProduct && <button onClick={() => setSearchProduct("")} className="hover:opacity-70 transition-opacity" style={{ color: "var(--td-text-lo)" }}><X size={12} /></button>}
              </div>

              <div className="grid grid-cols-[56px_1fr_72px_72px_96px_112px] gap-3 px-4 py-1.5 text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)", borderBottom: "1px solid var(--td-panel-border)" }}>
                <span />
                <span>Producto</span>
                <span className="text-center"># Ventas</span>
                <span className="text-center">Unidades</span>
                <span className="text-right">Prom. precio</span>
                <span className="text-right">Total recibido</span>
              </div>

              <div className="space-y-2">
                {displayedProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20" style={{ opacity: 0.15 }}>
                    <Package size={40} className="mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Sin productos vendidos en este período</p>
                  </div>
                ) : (
                  displayedProducts.map((p, idx) => {
                    const barPct = Math.round((p.totalRevenue / topRevenue) * 100);
                    const rankCls =
                      idx === 0 ? "bg-amber-400/20 text-amber-400 border-amber-400/30" :
                      idx === 1 ? "bg-white/10 text-white/50 border-white/10" :
                      idx === 2 ? "bg-orange-700/20 text-orange-500 border-orange-700/30" :
                      "bg-white/5 text-white/20 border-white/5";

                    return (
                      <div key={p.product_id} className="rounded-2xl overflow-hidden transition-all" style={{ border: "1px solid var(--td-panel-border)" }}>
                        <div className="grid grid-cols-[56px_1fr_72px_72px_96px_112px] gap-3 items-center px-4 py-3.5">
                          <div className="flex flex-col items-center gap-1.5">
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center text-[8px] font-black ${rankCls}`}>
                              {idx + 1}
                            </div>
                            <ProductThumb src={p.imagen} name={p.name} size={36} rounded="rounded-xl" />
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: "var(--td-text-hi)" }}>{p.name}</p>
                            {p.sku && <p className="text-[8px] uppercase tracking-widest mt-0.5 truncate" style={{ color: "var(--td-text-lo)" }}>{p.sku}</p>}
                          </div>

                          <div className="text-center">
                            <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{p.timesAppeared}</p>
                            <p className="text-[7px] uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>ventas</p>
                          </div>

                          <div className="text-center">
                            <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{p.totalUnits}</p>
                            <p className="text-[7px] uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>uds.</p>
                          </div>

                          <div className="text-right">
                            <p className="text-xs font-bold" style={{ color: "var(--td-text-md)" }}>{fmt(p.avgPrice)}</p>
                            <p className="text-[7px] uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>promedio</p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(p.totalRevenue)}</p>
                            <p className="text-[7px] uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>ingresado</p>
                          </div>
                        </div>

                        <div className="h-[2px]" style={{ background: "var(--td-panel-border)" }}>
                          <div className="h-full bg-gradient-to-r from-red-700 to-red-400 transition-all duration-700" style={{ width: `${barPct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Gráfico (colapsable) ── */}
      <div className="rounded-[28px] overflow-hidden" style={T.glassDim}>
        <button onClick={() => setChartOpen(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors">
          <div className="flex items-center gap-3">
            <BarChart3 size={15} style={{ color: "var(--td-text-lo)" }} />
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Flujo de Caja Semanal</span>
            <span className="text-[8px] uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>— {chartOpen ? "ocultar" : "ver gráfico"}</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-5">
              {[
                { l: "Efectivo", v: methodsBreakdown["Efectivo"] || 0, c: "#34d399" },
                { l: "Tarjeta",  v: methodsBreakdown["Tarjeta"]  || 0, c: "#60a5fa" },
                { l: "Dólares",  v: methodsBreakdown["Dólares"]  || 0, c: "#fbbf24" },
              ].map((m, i) => (
                <div key={i} className="text-right">
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: m.c }}>{m.l}</p>
                  <p className="text-xs font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(m.v)}</p>
                </div>
              ))}
            </div>
            {chartOpen ? <ChevronUp size={14} style={{ color: "var(--td-text-lo)" }} /> : <ChevronDown size={14} style={{ color: "var(--td-text-lo)" }} />}
          </div>
        </button>

        {chartOpen && (
          <div className="px-6 pb-6 pt-4" style={{ borderTop: "1px solid var(--td-panel-border)" }}>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesByDay}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#FF4422" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#FF4422" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: "var(--td-text-lo)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--td-text-lo)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", borderRadius: "10px" }} itemStyle={{ color: "#FF4422", fontWeight: 900, fontSize: 11 }} />
                  <Area type="monotone" dataKey="revenue" stroke="#FF4422" strokeWidth={2.5} fill={`url(#${gradientId})`} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
