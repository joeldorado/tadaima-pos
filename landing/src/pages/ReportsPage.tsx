import { useState, useEffect, useMemo, Fragment } from "react";
import {
  TrendingUp, Package, Users,
  DollarSign,
  ShoppingBag, Star, Calendar, Store,
  ChevronDown, ChevronRight, Clock, RefreshCw, ChevronLeft,
  FileSpreadsheet,
  Maximize2, X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@tadaima/auth";
import {
  getSalesReport, getInventoryReport, getTopProductsReport, getCustomersReport,
  getPreSaleOrders,
} from "@tadaima/api";
import { ReportsSkeleton } from "@/components/reports/ReportsSkeleton";
import { exportReportPdf } from "./reports/exportPdf";
import { exportReportExcel } from "./reports/exportExcel";
import type { ReportExportParams } from "./reports/reportTypes";
import { getSales } from "@tadaima/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { useUsersQuery } from "@/hooks/queries/useUsers";
import { getTodayLocal, daysAgoLocal, BUSINESS_TZ, toLocalYmd } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesReport, InventoryReport, TopProductsReport, CustomersReport } from "@tadaima/api";
import type { SaleDetail, Store as StoreType, PreSaleOrder, PreSaleOrderPayment } from "@tadaima/api";
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

// IVA sobre la comisión TPV. Se lee de la MISMA llave que configura SalesPage
// (`tadaima:iva-comision-pct`) para que reportes y ventas usen la misma tasa.
// Antes estaba hardcodeado a 0.16 en ~10 sitios de este archivo.
const DEFAULT_IVA_COMISION_PCT = 16;
const IVA_PCT_STORAGE_KEY = "tadaima:iva-comision-pct";
const readIvaRate = (): number => {
  try {
    const raw = localStorage.getItem(IVA_PCT_STORAGE_KEY);
    if (raw === null || raw.trim() === "") return DEFAULT_IVA_COMISION_PCT / 100;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 && v <= 100 ? v / 100 : DEFAULT_IVA_COMISION_PCT / 100;
  } catch {
    return DEFAULT_IVA_COMISION_PCT / 100;
  }
};

// Formato anclado a la zona del NEGOCIO (México), no la del dispositivo: una
// Mac/tablet en otra zona (Tijuana) mostraría la hora corrida ~1h y el día
// equivocado cerca de medianoche.
const fmtDate = (iso: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const parts = iso.split("-").map(Number);
    const y = parts[0] ?? 2000;
    const m = parts[1] ?? 1;
    const d = parts[2] ?? 1;
    const safeUtcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return safeUtcNoon.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: BUSINESS_TZ });
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Fecha inválida";
  return parsed.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: BUSINESS_TZ });
};

// const fmtTime = (iso: string) =>
//   new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: BUSINESS_TZ });

// ─── Date conversion helpers ──────────────────────────────────────────────────
const parseYmd = (iso: string) => parseDate(iso);
const toYmdFromDateValue = (value: ReturnType<typeof parseDate>) =>
  `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;


// "cortes" se movió a la página /cajas (visible a los 3 roles) — Joel 2026-06-12.
// Calcula el lunes de la semana actual (en la zona del negocio)
const getMondayThisWeek = (today: string): string => {
  const d = new Date(today + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Ajusta para lunes
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0] ?? "";
};

type TabId = "ventas" | "inventario" | "productos" | "clientes";
type SalesHistoryFilter = "all" | "cash" | "dollar" | "card" | "transfer" | "preSales" | "cancelled" | "notPicked";

interface GroupedProduct {
  id: number;
  name: string;
  sku: string;
  sales_count: number;
  total_quantity: number;
  total_revenue: number;
  returned_quantity?: number;
  returned_revenue?: number;
  payment_breakdown: { [method: string]: { qty: number; revenue: number } };
  price_breakdown: { [price: number]: number };
  total_cost: number;
  total_profit: number;
  pre_sale_apartado?: number;
  pre_sale_deuda?: number;
  commission_amount?: number;
  product_type?: 'product' | 'manga';
}

const REPORT_TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "ventas", label: "Ventas", icon: TrendingUp },
  { id: "inventario", label: "Inventario", icon: Package },
  { id: "productos", label: "Top Productos", icon: Star },
  { id: "clientes", label: "Top Clientes", icon: Users },
];

const SALES_HISTORY_FILTERS: Array<{ id: SalesHistoryFilter; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "cash", label: "Efectivo" },
  { id: "dollar", label: "Dólar" },
  { id: "card", label: "Tarjeta" },
  { id: "transfer", label: "Transferencia" },
  { id: "preSales", label: "Preventas" },
  { id: "cancelled", label: "Cancelados" },
  { id: "notPicked", label: "No recogidas" },
];

/**
 * Pagos de un folio de preventa cuya FECHA DE PAGO cae dentro del rango [from, to]
 * (zona del negocio). Reportamos la preventa por fecha de pago, no de creación: así
 * la liquidación del día cuenta aunque el folio se haya creado antes (y el anticipo
 * cuenta su propio día). Espejea el filtro backend payment_from/payment_to.
 */
function presalePaymentsInRange(
  payments: PreSaleOrderPayment[] | null | undefined,
  from: string,
  to: string,
): PreSaleOrderPayment[] {
  return (payments ?? []).filter((p) => {
    const ymd = toLocalYmd(new Date(p.created_at));
    return ymd >= from && ymd <= to;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ReportsPage() {
  const { user } = useAuth();
  const isAdmin   = user?.roles?.some(r => ["admin","super_admin","owner","dueño"].includes(r.toLowerCase())) ?? false;
  const canViewCost = isAdmin || !!(user as any)?.can_view_cost;
  // Tasa de IVA sobre comisión, compartida con SalesPage vía localStorage.
  const ivaRate = readIvaRate();

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
  const [activePreset, setActivePreset] = useState<string>("Este mes");

  // Store filter — admin can pick, others are locked to their store
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const effectiveStoreId = isAdmin ? selectedStoreId : (user?.store_id ?? null);

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const [lowStockOnly, setLowStockOnly] = useState(false);
  // Expansión por id de producto en el PADRE (no dentro de la fila): a propósito,
  // así las filas abiertas NO colapsan cuando los 6 polls live (20s) refrescan la
  // data. Si en el futuro se nota reflujo de la tabla al refrescar, anclar el
  // scroll del contenedor como en SalesPage (Ventas).
  const [expandedIds,  setExpandedIds]  = useState<number[]>([]);
  const [selectedFilters, setSelectedFilters] = useState<SalesHistoryFilter[]>(["all"]);
  const [isTableMaximized, setIsTableMaximized] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsTableMaximized(false);
      }
    };
    if (isTableMaximized) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isTableMaximized]);

  const storesQuery = useStoresQuery({ active: true, enabled: isAdmin });
  const stores: StoreType[] = storesQuery.data ?? [];

  const usersQuery = useUsersQuery({ store_id: effectiveStoreId ?? undefined, per_page: 500 } as any);
  const users = usersQuery.data ?? [];

  const baseParams = { 
    from, 
    to, 
    ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}),
    ...(selectedUserId ? { user_id: selectedUserId } : {})
  };

  // staleTime 30s: navegar entre tabs / volver a Reportes dentro de ese rango
  // sirve del cache (instantáneo) en vez de refetch. El skeleton solo sale
  // cuando de verdad no hay datos para el filtro/tab actual.
  const REPORTS_STALE = 30_000;
  // Polling live mientras se está EN esta pantalla: cada query solo refetchea
  // cuando su tab está activo (gate `enabled`) y la pestaña en foco
  // (refetchIntervalInBackground default false) → al salir de Reportes o pasar
  // a otra pestaña el poll se detiene solo. 20s = mismo ritmo que Ventas/Caja.
  const LIVE_POLL_MS = 20_000;
  const salesReportQuery = useQuery({
    queryKey: queryKeys.reports.sales(baseParams),
    queryFn: () => getSalesReport(baseParams),
    enabled: activeTab === "ventas",
    staleTime: REPORTS_STALE,
    refetchInterval: LIVE_POLL_MS,
  });
  const salesListParams = { ...baseParams, per_page: 100 };
  const salesListQuery = useQuery({
    queryKey: queryKeys.sales.list(salesListParams),
    queryFn: () => getSales(salesListParams),
    enabled: activeTab === "ventas",
    staleTime: REPORTS_STALE,
    refetchInterval: LIVE_POLL_MS,
  });

  // Preventa POR FECHA DE PAGO (payment_from/to), no de creación: trae los folios
  // con al menos un cobro (anticipo/liquidación) en el rango, aunque el folio se
  // haya creado antes. Los montos se acotan a los pagos del rango más abajo.
  const preSaleOrdersParams = {
    payment_from: from,
    payment_to: to,
    status: "pending,ready,delivered,expired,cancelled",
    ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}),
    ...(selectedUserId ? { user_id: selectedUserId } : {}),
    per_page: 500,
  };
  const preSaleOrdersQuery = useQuery({
    queryKey: ["reports-presale-orders", preSaleOrdersParams],
    queryFn: () => getPreSaleOrders(preSaleOrdersParams),
    enabled: activeTab === "ventas",
    staleTime: REPORTS_STALE,
    refetchInterval: LIVE_POLL_MS,
  });
  const preSaleOrders: PreSaleOrder[] = preSaleOrdersQuery.data?.data ?? [];

  const filteredPreSaleOrders = useMemo(() => {
    const isCardMethod = (name: string) =>
      name.includes("tarjeta") || name.includes("credit") || name.includes("debito") || name.includes("tpv") || name.includes("terminal");
    const isCashMethod = (name: string) =>
      name.includes("efectivo") || name.includes("cash");
    const isDollarMethod = (name: string) =>
      name.includes("dolar") || name.includes("dólar") || name.includes("usd");
    const isTransferMethod = (name: string) =>
      name.includes("transfer") || name.includes("deposit") || name.includes("spei");

    return preSaleOrders.filter((order) => {
      const orderStatus = (order.status ?? "").toLowerCase();
      const orderIsCancelled = orderStatus.includes("cancel");
      const orderIsNotPicked = orderStatus.includes("expired") || orderStatus.includes("vencid") || orderStatus.includes("no recog");

      const methods = (order.payments ?? [])
        .map((p) => (p.payment_method?.name ?? "").toLowerCase())
        .filter(Boolean);

      if (selectedFilters.includes("all") || selectedFilters.length === 0) return true;

      return selectedFilters.some((filter) => {
        if (filter === "cash") return methods.some((m) => isCashMethod(m) || isDollarMethod(m)) || (methods.length === 0);
        if (filter === "dollar") return methods.some((m) => isDollarMethod(m));
        if (filter === "card") return methods.some((m) => isCardMethod(m));
        if (filter === "transfer") return methods.some((m) => isTransferMethod(m));
        if (filter === "preSales") return true;
        if (filter === "cancelled") return orderIsCancelled;
        if (filter === "notPicked") return orderIsNotPicked;
        return false;
      });
    });
  }, [preSaleOrders, selectedFilters]);
  const invParams = { low_stock: lowStockOnly, ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}) };
  const invQuery = useQuery({
    queryKey: queryKeys.reports.inventory(invParams),
    queryFn: () => getInventoryReport(invParams),
    enabled: activeTab === "inventario",
    staleTime: REPORTS_STALE,
    refetchInterval: LIVE_POLL_MS,
  });
  const topParams = { from, to, limit: 25, ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}) };
  const topQuery = useQuery({
    queryKey: queryKeys.reports.topProducts(topParams),
    queryFn: () => getTopProductsReport(topParams),
    enabled: activeTab === "productos",
    staleTime: REPORTS_STALE,
    refetchInterval: LIVE_POLL_MS,
  });
  const custQuery = useQuery({
    queryKey: queryKeys.reports.customers(topParams),
    queryFn: () => getCustomersReport(topParams),
    enabled: activeTab === "clientes",
    staleTime: REPORTS_STALE,
    refetchInterval: LIVE_POLL_MS,
  });
  const salesReport: SalesReport | null = salesReportQuery.data ?? null;
  const sales: SaleDetail[] = salesListQuery.data?.data ?? [];
  const filteredSales = useMemo(() => {
    const isCardMethod = (name: string) =>
      name.includes("tarjeta") || name.includes("credit") || name.includes("debito") || name.includes("tpv") || name.includes("terminal");
    const isCashMethod = (name: string) =>
      name.includes("efectivo") || name.includes("cash");
    const isDollarMethod = (name: string) =>
      name.includes("dolar") || name.includes("dólar") || name.includes("usd");
    const isTransferMethod = (name: string) =>
      name.includes("transfer") || name.includes("deposit") || name.includes("spei");

    return sales.filter((sale) => {
      const methods = (sale.payments ?? [])
        .map((p) => (p.payment_method?.name ?? "").toLowerCase())
        .filter(Boolean);
      const hasPreSales = (sale.pre_sale_orders?.length ?? 0) > 0;
      const hasCancelled = (sale.cancellation_status && sale.cancellation_status !== "none")
        || (sale.status ?? "").toLowerCase().includes("cancel")
        || (sale.status ?? "").toLowerCase().includes("return");
      const hasNotPicked = (sale.pre_sale_orders ?? []).some((o) => {
        const status = (o.status ?? "").toLowerCase();
        return status.includes("expired") || status.includes("vencid") || status.includes("no recog");
      });

      if (selectedFilters.includes("all") || selectedFilters.length === 0) return true;

      return selectedFilters.some((filter) => {
        if (filter === "cash") return methods.some((m) => isCashMethod(m) || isDollarMethod(m));
        if (filter === "dollar") return methods.some((m) => isDollarMethod(m));
        if (filter === "card") return methods.some((m) => isCardMethod(m));
        if (filter === "transfer") return methods.some((m) => isTransferMethod(m));
        if (filter === "preSales") return hasPreSales;
        if (filter === "cancelled") return hasCancelled;
        if (filter === "notPicked") return hasNotPicked;
        return false;
      });
    });
  }, [sales, selectedFilters]);

  const groupedProducts = useMemo(() => {
    const map = new Map<number, GroupedProduct>();

    const isCardMethod = (name: string) =>
      name.includes("tarjeta") || name.includes("credit") || name.includes("debito") || name.includes("tpv") || name.includes("terminal");
    const isCashMethod = (name: string) =>
      name.includes("efectivo") || name.includes("cash");
    const isDollarMethod = (name: string) =>
      name.includes("dolar") || name.includes("dólar") || name.includes("usd");
    const isTransferMethod = (name: string) =>
      name.includes("transfer") || name.includes("deposit") || name.includes("spei");

    for (const sale of filteredSales) {
      let payMethodName = "Otro";
      if (sale.payments && sale.payments.length > 0) {
        let mainPayment = sale.payments[0];
        if (mainPayment) {
          for (const p of sale.payments) {
            if (p && p.amount > mainPayment.amount) {
              mainPayment = p;
            }
          }
          payMethodName = mainPayment.payment_method?.name ?? "Otro";
        }
      }

      const methods = (sale.payments ?? [])
        .map((p) => (p.payment_method?.name ?? "").toLowerCase())
        .filter(Boolean);
      const hasCancelled = (sale.cancellation_status && sale.cancellation_status !== "none")
        || (sale.status ?? "").toLowerCase().includes("cancel")
        || (sale.status ?? "").toLowerCase().includes("return");

      // 1. Regular items
      const isFullCancel = sale.status === "returned" || sale.cancellation_status === "full";
      for (const item of sale.items) {
        if (isFullCancel) continue;
        // Filter regular items using OR matching: must match at least one selected filter criteria
        const matchesRegularFilter = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.some(filter => {
          if (filter === "cash") return methods.some(m => isCashMethod(m) || isDollarMethod(m));
          if (filter === "dollar") return methods.some(m => isDollarMethod(m));
          if (filter === "card") return methods.some(m => isCardMethod(m));
          if (filter === "transfer") return methods.some(m => isTransferMethod(m));
          if (filter === "cancelled") return hasCancelled;
          return false;
        });

        if (!matchesRegularFilter) continue;

        const prodId = item.product_id;
        const prodName = item.product?.name ?? "Artículo Desconocido";
        const prodSku = item.product?.sku ?? "—";
        const qty = item.quantity;
        // Prorratea la promo/descuento de la venta a este item (Joel 2026-06-29): el
        // descuento vive a nivel venta (sales.discount) y NO baja sale_items.total, así
        // que sin esto el Bruto/Utilidad por producto se inflaría con las promos. Solo
        // se aplica en ventas COMPLETADAS con descuento real; las que tienen
        // cancelación/devolución conservan el comportamiento crudo (la sección de
        // cancelados resta el line_total crudo y debe netear igual). Sin descuento el
        // ratio = 1 (no cambia nada). El costo NO se prorratea (es el mismo con/ sin promo).
        const saleHasReversal = (sale.cancelled_items?.length ?? 0) > 0 || sale.status === "returned";
        const discRatio = (!saleHasReversal && (sale.discount ?? 0) > 0 && sale.subtotal > 0)
          ? sale.total / sale.subtotal
          : 1;
        const itemTotal = item.total * discRatio;
        const unitPrice = item.price;

        if (!map.has(prodId)) {
          map.set(prodId, {
            id: prodId,
            name: prodName,
            sku: prodSku,
            sales_count: 0,
            total_quantity: 0,
            total_revenue: 0,
            total_cost: 0,
            total_profit: 0,
            returned_quantity: 0,
            returned_revenue: 0,
            payment_breakdown: {},
            price_breakdown: {},
            commission_amount: 0,
            product_type: item.product?.product_type ?? 'product',
          });
        }

        const unitCost = item.cost ?? item.product?.cost ?? 0;
        const itemCostTotal = unitCost * qty;

        const pGroup = map.get(prodId)!;
        pGroup.sales_count += 1;
        pGroup.total_quantity += qty;
        pGroup.total_revenue += itemTotal;
        pGroup.total_cost += itemCostTotal;
        pGroup.total_profit += (itemTotal - itemCostTotal);

        if (!pGroup.payment_breakdown[payMethodName]) {
          pGroup.payment_breakdown[payMethodName] = { qty: 0, revenue: 0 };
        }
        const pBreakdown = pGroup.payment_breakdown[payMethodName]!;
        pBreakdown.qty += qty;
        pBreakdown.revenue += itemTotal;

        pGroup.price_breakdown[unitPrice] = (pGroup.price_breakdown[unitPrice] ?? 0) + qty;

        // Proportional commission allocation based on item total compared to sale total
        if (isCardMethod(payMethodName.toLowerCase()) && sale.total > 0) {
          const ratio = itemTotal / sale.total;
          const comm = (sale.commission_amount || 0) * ratio;
          pGroup.commission_amount = (pGroup.commission_amount ?? 0) + comm;
        }
      }

      // 1.2 Cancelled/Returned items (ADR-016 & Legacy Returns)
      const hasCancellations = sale.cancelled_items && sale.cancelled_items.length > 0;
      const isLegacyReturn = sale.status === "returned" && !hasCancellations;

      if (hasCancellations || isLegacyReturn) {
        const matchesCancelledFilter = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.includes("cancelled");
        if (matchesCancelledFilter) {
          const itemsToProcess = hasCancellations 
            ? (sale.cancelled_items ?? []).map((ci: any) => ({
                product_id: ci.product_id,
                name: ci.name,
                sku: ci.sku,
                qty_cancelled: Number(ci.qty_cancelled || ci.quantity || 0),
                line_total: Number(ci.line_total || 0),
                price: Number(ci.price || 0),
                cost: Number(ci.cost ?? 0),
                product_type: ci.product_type ?? 'product'
              }))
            : (sale.items || []).map((item: any) => ({
                product_id: item.product_id,
                name: item.product?.name ?? "Artículo Devuelto",
                sku: item.product?.sku ?? "—",
                qty_cancelled: Number(item.quantity || 0),
                line_total: Number(item.total || 0),
                price: Number(item.price || 0),
                cost: Number(item.cost ?? item.product?.cost ?? 0),
                product_type: item.product?.product_type ?? 'product'
              }));

          for (const cItem of itemsToProcess) {
            const prodId = cItem.product_id;
            if (!prodId) continue;

            const prodName = cItem.name ?? "Artículo Cancelado";
            const prodSku = cItem.sku ?? "—";
            // Return/cancellation means negative volume/income to represent withdrawal/refund
            const cancelQty = cItem.qty_cancelled;
            const cancelTotal = cItem.line_total;
            const qty = -cancelQty;
            const itemTotal = -cancelTotal;
            const unitPrice = cItem.price;

            if (!map.has(prodId)) {
              map.set(prodId, {
                id: prodId,
                name: prodName,
                sku: prodSku,
                sales_count: 0,
                total_quantity: 0,
                total_revenue: 0,
                total_cost: 0,
                total_profit: 0,
                returned_quantity: 0,
                returned_revenue: 0,
                payment_breakdown: {},
                price_breakdown: {},
                commission_amount: 0,
                product_type: cItem.product_type,
              });
            }

            const unitCost = cItem.cost || 0;
            const itemCostTotal = unitCost * qty; // qty is negative

            const pGroup = map.get(prodId)!;
            // Solo reducimos el sales_count (tickets) 1 vez por venta devuelta, no por cada item
            // Si es un ticket legacy completo, restarlo por item daría un número de tickets negativo extremo.
            // Lo omitimos aquí para los items y lo sumamos a nivel de ticket si hiciera falta, pero
            // por ahora conservamos el comportamiento anterior de contar -1 por item para no romper nada grave, 
            // aunque idealmente se cuenta a nivel venta.
            pGroup.sales_count -= 1; 
            pGroup.total_quantity += qty; // Adds negative quantity
            pGroup.total_revenue += itemTotal; // Adds negative revenue
            pGroup.total_cost += itemCostTotal;
            pGroup.total_profit += (itemTotal - itemCostTotal);

            pGroup.returned_quantity = (pGroup.returned_quantity || 0) + cancelQty;
            pGroup.returned_revenue = (pGroup.returned_revenue || 0) + cancelTotal;

            const payMethodCancelled = payMethodName + " (Devuelto)";
            if (!pGroup.payment_breakdown[payMethodCancelled]) {
              pGroup.payment_breakdown[payMethodCancelled] = { qty: 0, revenue: 0 };
            }
            const pBreakdown = pGroup.payment_breakdown[payMethodCancelled]!;
            pBreakdown.qty += qty;
            pBreakdown.revenue += itemTotal;

            pGroup.price_breakdown[unitPrice] = (pGroup.price_breakdown[unitPrice] ?? 0) + qty;
          }
        }
      }
    }

    // 2. Pre-sale items (Preventas)
    for (const order of filteredPreSaleOrders) {
      // Solo los pagos cuya fecha cae en el rango (anticipo y/o liquidación del
      // período). El monto reportado = lo COBRADO en el rango, no el acumulado.
      const paymentsInRange = presalePaymentsInRange(order.payments, from, to);
      const paidInRange = paymentsInRange.reduce((sum, p) => sum + (p.amount || 0), 0);

      let payMethodName = "Efectivo";
      let mainPayment = paymentsInRange[0] || null;
      if (paymentsInRange.length > 0 && mainPayment) {
        for (const p of paymentsInRange) {
          if (p && p.amount > mainPayment.amount) {
            mainPayment = p;
          }
        }
        payMethodName = mainPayment.payment_method?.name ?? "Efectivo";
      }

      const orderItemsTotal = order.items ? order.items.reduce((sum, it) => sum + (it.unit_price * it.quantity), 0) : 0;

      if (order.items) {
        for (const item of order.items) {
          // If product_id is null, generate a unique negative ID based on catalog ID to avoid collisions
          const prodId = item.product_id ?? (item.catalog ? item.catalog.id * -1 : -999);
          const prodName = item.catalog?.product_name ?? `Preventa #${item.id}`;
          const prodSku = "PREVENTA";
          const qty = item.quantity;
          const itemTotal = item.unit_price * item.quantity;
          const unitPrice = item.unit_price;

          // Proportional allocation of paid-in-range and balance based on item's total value vs order items total
          const ratio = orderItemsTotal > 0 ? (itemTotal / orderItemsTotal) : (1 / order.items.length);
          const itemApartado = paidInRange * ratio;
          const itemDeuda = (order.balance || 0) * ratio;

          if (!map.has(prodId)) {
            map.set(prodId, {
              id: prodId,
              name: prodName,
              sku: prodSku,
              sales_count: 0,
              total_quantity: 0,
              total_revenue: 0,
              total_cost: 0,
              total_profit: 0,
              returned_quantity: 0,
              returned_revenue: 0,
              payment_breakdown: {},
              price_breakdown: {},
              pre_sale_apartado: 0,
              pre_sale_deuda: 0,
              product_type: item.product_type ?? 'product',
            });
          }

          // Costo de preventa (Opción B: solo descontamos el costo el día de la entrega/liquidación)
          let itemCostTotal = 0;
          if (item.status === 'delivered' && item.delivered_at) {
            const deliveredYmd = toLocalYmd(new Date(item.delivered_at));
            if (deliveredYmd >= from && deliveredYmd <= to) {
              const unitCost = item.cost ?? 0;
              itemCostTotal = unitCost * qty;
            }
          }

          const pGroup = map.get(prodId)!;
          pGroup.sales_count += 1;
          pGroup.total_quantity += qty;
          pGroup.total_revenue += itemApartado;
          pGroup.total_cost += itemCostTotal;
          pGroup.total_profit += (itemApartado - itemCostTotal);

          if (!pGroup.payment_breakdown[payMethodName]) {
            pGroup.payment_breakdown[payMethodName] = { qty: 0, revenue: 0 };
          }
          const preBreakdown = pGroup.payment_breakdown[payMethodName]!;
          preBreakdown.qty += qty;
          preBreakdown.revenue += itemApartado;

          pGroup.price_breakdown[unitPrice] = (pGroup.price_breakdown[unitPrice] ?? 0) + qty;

          pGroup.pre_sale_apartado = (pGroup.pre_sale_apartado ?? 0) + itemApartado;
          pGroup.pre_sale_deuda = (pGroup.pre_sale_deuda ?? 0) + itemDeuda;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const aIsManga = a.product_type === "manga";
      const bIsManga = b.product_type === "manga";
      if (aIsManga && !bIsManga) return 1;  // Mangas go to the bottom
      if (!aIsManga && bIsManga) return -1; // Non-mangas stay at the top
      return b.total_quantity - a.total_quantity; // Sort same-type products by volume
    });
  }, [filteredSales, filteredPreSaleOrders, from, to]);

  const uiTotals = useMemo(() => {
    let bruto = 0;
    let comision = 0;
    let iva = 0;
    let neto = 0;
    let profit = 0;
    let costo = 0;
    let cantidad = 0;
    groupedProducts.forEach(prod => {
      bruto += prod.total_revenue || 0;
      costo += prod.total_cost || 0;
      cantidad += prod.total_quantity || 0;
      const comm = prod.commission_amount || 0;
      comision += comm;
      iva += comm * ivaRate;
      neto += (prod.total_revenue - comm - (comm * ivaRate));
      profit += prod.total_profit || 0;
    });
    profit = profit - comision - iva;
    return { bruto, comision, iva, neto, profit, costo, cantidad };
  }, [groupedProducts]);

  const regularProducts = useMemo(() => groupedProducts.filter(p => p.product_type !== 'manga'), [groupedProducts]);
  const tomoProducts = useMemo(() => groupedProducts.filter(p => p.product_type === 'manga'), [groupedProducts]);

  // Tomo nacional vs importado statistics summary (any tomo is a manga)
  const tomoSummary = useMemo(() => {
    let totalQty = 0;
    let totalRevenue = 0;
    tomoProducts.forEach(p => {
      totalQty += p.total_quantity || 0;
      totalRevenue += p.total_revenue || 0;
    });
    return { qty: totalQty, revenue: totalRevenue };
  }, [tomoProducts]);
  const invReport: InventoryReport | null = invQuery.data ?? null;
  const topReport: TopProductsReport | null = topQuery.data ?? null;
  const custReport: CustomersReport | null = custQuery.data ?? null;
  // ¿La tab activa está fetcheando? ¿Ya tiene datos para mostrar?
  const isFetchingActive =
    (activeTab === "ventas"     && (salesReportQuery.isFetching || salesListQuery.isFetching || preSaleOrdersQuery.isFetching)) ||
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
    if (salesReportQuery.error || salesListQuery.error || preSaleOrdersQuery.error) toast.error("Error al cargar reporte de ventas");
  }, [salesReportQuery.error, salesListQuery.error, preSaleOrdersQuery.error]);
  useEffect(() => {
    if (invQuery.error) toast.error("Error al cargar inventario");
  }, [invQuery.error]);
  useEffect(() => {
    if (topQuery.error) toast.error("Error al cargar top productos");
  }, [topQuery.error]);
  useEffect(() => {
    if (custQuery.error) toast.error("Error al cargar clientes");
  }, [custQuery.error]);


  const paymentBreakdown = useMemo(() => {
    let total = 0;
    let card = 0;
    let cash = 0;
    let deposits = 0;
    let usd = 0; // dólares físicos recibidos (informativo; el MXN ya está en cash)
    const contributingSales = new Set<number>();

    const isCard = (name: string) =>
      name.includes("tarjeta") || name.includes("credit") || name.includes("debito") || name.includes("tpv") || name.includes("terminal");
    const isTransfer = (name: string) =>
      name.includes("transfer") || name.includes("deposit") || name.includes("spei");

    // Dynamic show controls based on active filters
    const showActive = selectedFilters.includes("all") || selectedFilters.length === 0 || !selectedFilters.includes("cancelled") || selectedFilters.length > 1;
    const showCancelled = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.includes("cancelled");

    for (const sale of filteredSales) {
      const isFullCancel = sale.status === "returned" || sale.cancellation_status === "full";
      let contributed = false;

      // 1. Process standard checkout payments (positive active sales)
      if (showActive && !isFullCancel && sale.items && sale.items.length > 0) {
        const methods = (sale.payments ?? []).map(p => (p.payment_method?.name ?? "").toLowerCase()).filter(Boolean);
        const hasCancelled = (sale.cancellation_status && sale.cancellation_status !== "none") || (sale.status ?? "").toLowerCase().includes("cancel") || (sale.status ?? "").toLowerCase().includes("return");

        const matchesRegularFilter = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.some(filter => {
          if (filter === "cash") return methods.some(m => m.includes("efectivo") || m.includes("cash") || m.includes("dolar") || m.includes("dólar") || m.includes("usd"));
          if (filter === "dollar") return methods.some(m => m.includes("dolar") || m.includes("dólar") || m.includes("usd"));
          if (filter === "card") return methods.some(m => isCard(m));
          if (filter === "transfer") return methods.some(m => isTransfer(m));
          if (filter === "cancelled") return hasCancelled;
          return false;
        });

        if (matchesRegularFilter) {
          contributed = true;
          if (sale.payments) {
            for (const p of sale.payments) {
              if (!p) continue;
              const name = (p.payment_method?.name ?? "").toLowerCase();
              const amount = p.amount || 0;

              total += amount;
              if (isCard(name)) {
                card += amount;
              } else if (isTransfer(name)) {
                deposits += amount;
              } else {
                cash += amount;
              }
            }
          }
          usd += sale.cash_received_usd || 0;
        }
      }

      // 2. Process cancelled/negative parts (returns)
      if (showCancelled && (isFullCancel || (sale.cancellation_status && sale.cancellation_status !== "none")) && sale.cancelled_amount && sale.cancelled_amount > 0) {
        contributed = true;
        const cancelledAmount = sale.cancelled_amount;
        const originalTotal = sale.total + cancelledAmount;
        
        if (originalTotal > 0 && sale.payments && sale.payments.length > 0) {
          for (const p of sale.payments) {
            if (!p) continue;
            const name = (p.payment_method?.name ?? "").toLowerCase();
            const ratio = (p.amount || 0) / originalTotal;
            const pCancelledAmount = cancelledAmount * ratio;

            total -= pCancelledAmount;
            if (isCard(name)) {
              card -= pCancelledAmount;
            } else if (isTransfer(name)) {
              deposits -= pCancelledAmount;
            } else {
              cash -= pCancelledAmount;
            }
          }
        } else {
          total -= cancelledAmount;
          cash -= cancelledAmount;
        }
      }

      if (contributed) {
        contributingSales.add(sale.id);
      }
    }

    // 3. Pagos de preventa (anticipos) cobrados en el rango. Se cuentan TODAS las
    // preventas —igual que la tabla de productos (groupedProducts)— para que el
    // efectivo del anticipo del periodo sí sume a "Efectivo cobrado". Antes se
    // saltaban las preventas ligadas a una venta, lo que dejaba fuera anticipos
    // reales y descuadraba el resumen contra la tabla.
    const showPreSales = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.some(f => ["preSales", "notPicked", "cash", "dollar", "card", "transfer", "cancelled"].includes(f));

    if (showPreSales) {
      for (const order of filteredPreSaleOrders) {
        const paymentsInRange = presalePaymentsInRange(order.payments, from, to);
        if (paymentsInRange.length > 0) {
          let orderContributed = false;
          for (const p of paymentsInRange) {
            if (!p) continue;
            const amount = p.amount || 0;
            if (amount > 0) {
              orderContributed = true;
              total += amount;
              const name = (p.payment_method?.name ?? "").toLowerCase();
              if (isCard(name)) {
                card += amount;
              } else if (isTransfer(name)) {
                deposits += amount;
              } else {
                cash += amount;
              }
            }
          }
          if (orderContributed) {
            contributingSales.add(order.id * -1); // negative ID to avoid collision
          }
        }
      }
    }

    return {
      total,
      card,
      cash,
      deposits,
      usd,
      transactionCount: contributingSales.size,
    };
  }, [filteredSales, filteredPreSaleOrders, selectedFilters, from, to]);


    const activeTabMeta = (REPORT_TABS.find(tab => tab.id === activeTab) ?? REPORT_TABS[0]) as { id: TabId; label: string; icon: React.ElementType };
  const hiddenTabs = REPORT_TABS.filter(tab => tab.id !== activeTab);

  // Los generadores de Excel y PDF viven en ./reports/exportExcel|exportPdf.
  // Aquí solo empaquetamos el estado actual y delegamos.
  const buildExportParams = (): ReportExportParams => ({
    groupedProducts, regularProducts, tomoProducts, paymentBreakdown,
    invReport, topReport, custReport, from, to, today, activeTab,
    canViewCost, ivaRate, effectiveStoreId, selectedUserId, stores, users,
  });

  const handleExportPDF = () => exportReportPdf(buildExportParams());
  const handleExportExcel = () => { void exportReportExcel(buildExportParams()); };



  // ─── Shared UI ───────────────────────────────────────────────────────────────
  const thStyle: React.CSSProperties = { padding: "10px 16px", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM, textAlign: "left" };
  const tdStyle: React.CSSProperties = { padding: "10px 16px", fontSize: 12, color: TS, borderBottom: DIV };

  // Reusable row renderer for products and mangas to ensure unified design and clean separation!
  const renderProductRow = (prod: GroupedProduct, padX = 16, padY = 12, fontS = 12) => {
    const isExpanded = expandedIds.includes(prod.id);
    return (
      <Fragment key={prod.id}>
        <tr style={{ borderBottom: isExpanded ? "none" : DIV, cursor: "pointer" }}
          onClick={() => {
            setExpandedIds(prev =>
              prev.includes(prod.id)
                ? prev.filter(x => x !== prod.id)
                : [...prev, prod.id]
            );
          }}>
          <td style={{ ...tdStyle, padding: `${padY}px ${padX}px`, fontSize: fontS, fontWeight: 900, color: TP }}>
            <div className="flex items-center gap-1.5">
              {isExpanded ? <ChevronDown size={fontS + 1} style={{ color: TM }} /> : <ChevronRight size={fontS + 1} style={{ color: TM }} />}
              <div className="flex flex-col">
                <span>{prod.name}</span>
                {prod.sku && prod.sku !== "PREVENTA" ? (
                  <span style={{ fontSize: 9, color: TM, fontWeight: 600, letterSpacing: "0.04em" }}>SKU: {prod.sku}</span>
                ) : null}
              </div>
            </div>
          </td>
          <td style={{ ...tdStyle, padding: `${padY}px ${padX}px`, fontSize: fontS, fontWeight: 700, color: TP }}>
            <div className="flex flex-col gap-0.5">
              <span>{prod.total_quantity}</span>
              {prod.returned_quantity && prod.returned_quantity > 0 ? (
                <span style={{ fontSize: 9, color: "#FF4422", fontWeight: 800 }}>(-{prod.returned_quantity} devueltos)</span>
              ) : null}
            </div>
          </td>
          <td style={{ ...tdStyle, padding: `${padY}px ${padX}px`, fontSize: fontS, verticalAlign: "middle" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <span style={{ color: prod.total_revenue < 0 ? "#FF4422" : "#00CC66", fontWeight: 900 }}>{fmt(prod.total_revenue)}</span>
              {prod.returned_revenue && prod.returned_revenue > 0 ? (
                <span style={{ fontSize: 9, color: "#FF4422", fontWeight: 800 }}>(-{fmt(prod.returned_revenue)} devueltos)</span>
              ) : null}
              {prod.commission_amount && prod.commission_amount > 0 ? (
                <span style={{ fontSize: 9, color: TM, fontWeight: 500 }}>
                  {fmt(prod.total_revenue)} - <span style={{ color: "#FF4422", fontWeight: 700 }} title="Comisión TPV">{fmt(prod.commission_amount)}</span> - <span style={{ color: "#F59E0B", fontWeight: 700 }} title="IVA s/Comisión (16%)">{fmt(prod.commission_amount * ivaRate)}</span> = <span style={{ color: "#00CC66", fontWeight: 800 }}>{fmt(prod.total_revenue - prod.commission_amount - (prod.commission_amount * ivaRate))}</span>
                </span>
              ) : null}
            </div>
          </td>
          {canViewCost && (
            <td style={{ ...tdStyle, padding: `${padY}px ${padX}px`, fontSize: fontS, verticalAlign: "middle" }}>
              <span style={{ color: TS, fontWeight: 700 }}>{fmt(prod.total_cost)}</span>
            </td>
          )}
          {canViewCost && (
            <td style={{ ...tdStyle, padding: `${padY}px ${padX}px`, fontSize: fontS, verticalAlign: "middle" }}>
              <span style={{ color: (prod.total_profit - (prod.commission_amount || 0) - ((prod.commission_amount || 0) * ivaRate)) < 0 ? "#FF4422" : "#00CC66", fontWeight: 900 }}>
                {fmt(prod.total_profit - (prod.commission_amount || 0) - ((prod.commission_amount || 0) * ivaRate))}
              </span>
            </td>
          )}
        </tr>
        {isExpanded && (
          <tr key={`${prod.id}-detail`}>
            <td colSpan={6} style={{ padding: `0 ${padX}px ${padY}px`, borderBottom: DIV, background: "rgba(255,255,255,0.02)" }}>
              <div className={`grid grid-cols-1 ${((prod.pre_sale_apartado && prod.pre_sale_apartado > 0) || (prod.pre_sale_deuda && prod.pre_sale_deuda > 0)) ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6 pt-3 pb-2`}>
                {/* Métodos de Pago */}
                <div>
                  <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM, marginBottom: 8 }}>
                    Desglose por método de pago
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(prod.payment_breakdown).map(([method, data]) => {
                      const isCard = method.toLowerCase().includes("tarjeta") || method.toLowerCase().includes("credit") || method.toLowerCase().includes("debito") || method.toLowerCase().includes("tpv") || method.toLowerCase().includes("terminal");
                      return (
                        <div key={method} className="flex flex-col gap-1 py-1.5 px-3" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 9 }}>
                          <div className="flex items-center justify-between text-xs">
                            <span style={{ color: TS, fontWeight: 700 }}>{method}</span>
                            <div className="flex items-center gap-2">
                              <span style={{ color: data.revenue < 0 ? "#FF4422" : "#00CC66", fontWeight: 900 }}>{fmt(data.revenue)}</span>
                              <span style={{ color: TP, fontWeight: 700, fontSize: 11 }}>({data.qty} {data.qty === 1 ? "unidad" : "unidades"})</span>
                            </div>
                          </div>
                          {isCard && prod.commission_amount && prod.commission_amount > 0 && (
                            <div className="flex flex-col gap-1 mt-0.5 pt-0.5 border-t border-dashed" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                              <div className="flex items-center justify-between text-[10px]">
                                <span style={{ color: TM }}>Comisión de terminal absorbida:</span>
                                <span style={{ color: "#FF4422", fontWeight: 700 }}>-{fmt(prod.commission_amount)}</span>
                              </div>
                              <div className="flex items-center justify-between text-[10px]">
                                <span style={{ color: TM }}>IVA sobre comisión (16%):</span>
                                <span style={{ color: "#F59E0B", fontWeight: 700 }}>-{fmt(prod.commission_amount * ivaRate)}</span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] pt-0.5 border-t border-dotted" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                                <span style={{ color: TM, fontWeight: 700 }}>Neto real para la tienda:</span>
                                <span style={{ color: "#00CC66", fontWeight: 800 }}>{fmt(data.revenue - prod.commission_amount - (prod.commission_amount * ivaRate))}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Desglose por Precios de Venta */}
                <div>
                  <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM, marginBottom: 8 }}>
                    Desglose por precios de venta
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(prod.price_breakdown).map(([priceStr, qty]) => {
                      const priceVal = parseFloat(priceStr);
                      return (
                        <div key={priceStr} className="flex items-center justify-between text-xs py-1.5 px-3" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 9 }}>
                          <span style={{ color: TS }}>Precio unitario: <span className="font-black" style={{ color: TP }}>{fmt(priceVal)}</span></span>
                          <span style={{ color: "#00CC66", fontWeight: 900 }}>{qty} {qty === 1 ? "unidad" : "unidades"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Control de Preventa: Apartado y Deuda */}
                {((prod.pre_sale_apartado && prod.pre_sale_apartado > 0) || (prod.pre_sale_deuda && prod.pre_sale_deuda > 0)) && (
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM, marginBottom: 8 }}>
                      Información de Preventa
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(prod.pre_sale_apartado && prod.pre_sale_apartado > 0) && (
                        <div className="flex items-center justify-between text-xs py-1.5 px-3" style={{ background: "rgba(0, 204, 102, 0.08)", border: "1px solid rgba(0, 204, 102, 0.15)", borderRadius: 9 }}>
                          <span style={{ color: TS, fontWeight: 700 }}>Total Abonado (Apartado)</span>
                          <span style={{ color: "#00CC66", fontWeight: 900 }}>{fmt(prod.pre_sale_apartado)}</span>
                        </div>
                      )}
                      {(prod.pre_sale_deuda && prod.pre_sale_deuda > 0) && (
                        <div className="flex items-center justify-between text-xs py-1.5 px-3" style={{ background: "rgba(255, 68, 34, 0.08)", border: "1px solid rgba(255, 68, 34, 0.15)", borderRadius: 9 }}>
                          <span style={{ color: TS, fontWeight: 700 }}>Total Deuda (Pendiente)</span>
                          <span style={{ color: "#FF4422", fontWeight: 900 }}>{fmt(prod.pre_sale_deuda)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

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

            {/* Excel button */}
            <button
              onClick={handleExportExcel}
              disabled={isFetchingActive}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              style={{ background: "rgba(0,204,102,0.1)", border: "1px solid rgba(0,204,102,0.2)", color: "#00CC66" }}
              title="Exportar reporte actual a Excel"
            >
              <FileSpreadsheet size={13} />
              Excel
            </button>

            {/* PDF button */}
            <button
              onClick={handleExportPDF}
              disabled={isFetchingActive}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              style={{ background: "rgba(224,34,26,0.1)", border: "1px solid rgba(224,34,26,0.2)", color: "var(--td-red)" }}
              title="Exportar reporte actual a PDF"
            >
              <FileSpreadsheet size={13} />
              PDF
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
                const active = activePreset === p.label;
                return (
                  <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to); setActivePreset(p.label); }}
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
                          setActivePreset(""); // Clear selected preset on manual calendar selection
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
                <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: "var(--td-divider)" }} />
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl flex-shrink shrink-0" style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
                  <Store size={13} style={{ color: TM, flexShrink: 0 }} />
                  <select
                    value={selectedStoreId ?? ""}
                    onChange={e => setSelectedStoreId(e.target.value ? Number(e.target.value) : null)}
                    className="text-sm font-bold outline-none bg-transparent overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ color: TP, maxWidth: 160, border: "none" }}
                  >
                    <option value="">Todas las tiendas</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </>
            )}

            {/* User select */}
            {["ventas"].includes(activeTab) && users.length > 0 && (
              <>
                <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: "var(--td-divider)" }} />
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl flex-shrink shrink-0" style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
                  <Users size={13} style={{ color: TM, flexShrink: 0 }} />
                  <select
                    value={selectedUserId ?? ""}
                    onChange={e => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
                    className="text-sm font-bold outline-none bg-transparent overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ color: TP, maxWidth: 160, border: "none" }}
                  >
                    <option value="">Todos los usuarios</option>
                    {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
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
                    { label: "Total cobrado", val: fmt(paymentBreakdown.total), color: "#00CC66", icon: DollarSign, sub: `${paymentBreakdown.transactionCount} ${paymentBreakdown.transactionCount === 1 ? 'transacción' : 'transacciones'}` },
                    { label: "Pago con tarjeta", val: fmt(paymentBreakdown.card), color: "#4499FF", icon: Store, sub: paymentBreakdown.card > 0 ? "TPV / débito / crédito" : "sin movimientos" },
                    { label: "Pago en efectivo", val: fmt(paymentBreakdown.cash), color: "#33CC88", icon: ShoppingBag, sub: paymentBreakdown.usd > 0 ? `incluye ${paymentBreakdown.usd} USD recibidos` : (paymentBreakdown.cash > 0 ? "cobro en MXN" : "sin movimientos") },
                    { label: "Depósitos", val: fmt(paymentBreakdown.deposits), color: "#BB77FF", icon: Clock, sub: paymentBreakdown.deposits > 0 ? "transferencias / SPEI" : "sin depósitos" },
                  ].map((kpi, i) => (
                    <div key={i} className="min-h-[124px] flex flex-col" style={{ ...GLASS, borderRadius: 20, padding: "12px 20px" }}>
                      <div className="flex items-center gap-2">
                        <kpi.icon size={15} style={{ color: kpi.color, flexShrink: 0 }} />
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: TM }}>{kpi.label}</p>
                      </div>

                      <div className="flex-1 flex items-center justify-center">
                        <p className="text-5xl font-black italic leading-none text-center" style={{ color: kpi.val.startsWith("-") ? "#FF4422" : kpi.color }}>{kpi.val}</p>
                      </div>

                      <p className="text-[9px] text-center" style={{ color: TM }}>{kpi.sub}</p>
                    </div>
                  ))}
                </div>




                {/* Filtros fuera de la tarjeta y centrados en la parte superior */}
                <div className="flex flex-col items-center justify-center gap-3 pt-4">
                  <div className="flex items-center justify-center gap-2 flex-wrap p-2.5 rounded-2xl" style={{ ...GLASS, width: "fit-content" }}>
                    {SALES_HISTORY_FILTERS.map((f) => {
                      const active = selectedFilters.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => {
                            setExpandedIds([]);
                            if (f.id === "all") {
                              setSelectedFilters(["all"]);
                            } else {
                              setSelectedFilters((prev) => {
                                const withoutAll = prev.filter((x) => x !== "all") as SalesHistoryFilter[];
                                if (withoutAll.includes(f.id)) {
                                  const next = withoutAll.filter((x) => x !== f.id);
                                  return next.length === 0 ? ["all"] : next;
                                } else {
                                  return [...withoutAll, f.id];
                                }
                              });
                            }
                          }}
                          className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
                          style={active
                            ? { background: "linear-gradient(135deg,#CC2200,#FF4422)", color: "#fff", border: "1px solid rgba(255,120,90,0.3)", boxShadow: "0 4px 12px rgba(255,68,34,0.25)" }
                            : { background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: TS }}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Ventas por Producto — expandable details */}
                <div style={{ ...GLASS, borderRadius: 24, overflow: "hidden" }}>
                  <div className="px-6 py-4 flex items-center justify-between gap-4" style={{ borderBottom: DIV }}>
                    <div className="flex items-center gap-3">
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TM }}>
                        Ventas por Producto
                      </p>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(68,153,255,0.12)", color: "#4499FF" }}>
                        {groupedProducts.length} productos
                      </span>
                    </div>
                    <button
                      onClick={() => setIsTableMaximized(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all hover:scale-105 active:scale-95 text-white/60 hover:text-white"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                      title="Expandir tabla a pantalla completa"
                    >
                      <Maximize2 size={11} />
                      Ampliar
                    </button>
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
                    <table className="w-full">
                      <thead><tr style={{ borderBottom: DIV }}>
                        {(canViewCost ? ["Producto", "Cant. Vendida", "Ingresos Totales", "Costo", "Utilidad Neta"] : ["Producto", "Cant. Vendida", "Ingresos Totales"]).map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr></thead>                      <tbody>
                        {/* 1) Render regular products */}
                        {regularProducts.map(prod => renderProductRow(prod, 16, 10, 12))}

                        {/* 2) Separator row for Tomos (mangas) */}
                        {regularProducts.length > 0 && tomoProducts.length > 0 && (
                          <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                            <td colSpan={6} style={{ 
                              padding: "6px 16px", 
                              fontSize: 9, 
                              fontWeight: 900, 
                              letterSpacing: "0.15em", 
                              color: TM, 
                              background: "rgba(255,255,255,0.05)",
                              borderTop: "1px solid rgba(255,255,255,0.1)",
                              borderBottom: "1px solid rgba(255,255,255,0.1)",
                              textTransform: "uppercase"
                            }}>
                              <div className="flex items-center justify-between">
                                <span>📚 Manga Nacional</span>
                                <span style={{ color: "#4499FF" }}>
                                  Resumen Manga Nacional: {tomoSummary.qty} uds. vendidos ({fmt(tomoSummary.revenue)})
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* 3) Render tomo products */}
                        {tomoProducts.map(prod => renderProductRow(prod, 16, 10, 12))}

                        {/* Empty state fallback */}
                        {groupedProducts.length === 0 && (
                          <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", padding: 32 }}>Sin ventas en el período</td></tr>
                        )}

                        {/* Totals row */}
                        {groupedProducts.length > 0 && (
                          <tr style={{ background: "rgba(255,255,255,0.03)", borderTop: "2px solid rgba(255,255,255,0.1)" }}>
                            <td style={{ ...tdStyle, fontWeight: 900, color: TP }}>TOTAL GENERAL</td>
                            <td style={{ ...tdStyle, fontWeight: 700, color: TP }}>{uiTotals.cantidad}</td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                                <span style={{ color: uiTotals.bruto < 0 ? "#FF4422" : "#00CC66", fontWeight: 900 }}>{fmt(uiTotals.bruto)}</span>
                                {uiTotals.comision > 0 ? (
                                  <span style={{ fontSize: 9, color: TM, fontWeight: 500 }}>
                                    {fmt(uiTotals.bruto)} - <span style={{ color: "#FF4422", fontWeight: 700 }} title="Comisión TPV Total">{fmt(uiTotals.comision)}</span> - <span style={{ color: "#F59E0B", fontWeight: 700 }} title="IVA s/Comisión Total">{fmt(uiTotals.iva)}</span> = <span style={{ color: "#00CC66", fontWeight: 800 }}>{fmt(uiTotals.neto)}</span>
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            {canViewCost && (
                              <td style={{ ...tdStyle, fontWeight: 700, color: TS }}>{fmt(uiTotals.costo)}</td>
                            )}
                            {canViewCost && (
                              <td style={{ ...tdStyle, fontWeight: 900, color: uiTotals.profit < 0 ? "#FF4422" : "#00CC66" }}>
                                {fmt(uiTotals.profit)}
                              </td>
                            )}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section summary card below the table */}
                {groupedProducts.length > 0 && (
                  <div className={`grid grid-cols-1 ${canViewCost ? "md:grid-cols-6" : "md:grid-cols-5"} gap-4 mt-1`}>
                    <div className="p-4 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>Venta Bruta Total</p>
                      <p className="text-xl font-black mt-1" style={{ color: uiTotals.bruto < 0 ? "#FF4422" : TP }}>{fmt(uiTotals.bruto)}</p>
                    </div>
                    <div className="p-4 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>Manga Nacional</p>
                      <p className="text-xl font-black mt-1" style={{ color: "#38bdf8" }}>{fmt(tomoSummary.revenue)} <span className="text-xs font-bold" style={{ color: "rgba(56,189,248,0.8)" }}>({tomoSummary.qty} uds)</span></p>
                    </div>
                    <div className="p-4 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>Comisión TPV Total</p>
                      <p className="text-xl font-black mt-1" style={{ color: "#FF4422" }}>{fmt(uiTotals.comision)}</p>
                    </div>
                    <div className="p-4 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>IVA s/Comisión (16%)</p>
                      <p className="text-xl font-black mt-1" style={{ color: "#F59E0B" }}>{fmt(uiTotals.iva)}</p>
                    </div>
                    <div className="p-4 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)", background: uiTotals.neto < 0 ? "linear-gradient(135deg, rgba(255,68,34,0.1), rgba(200,30,10,0.1))" : "linear-gradient(135deg, rgba(0,204,102,0.1), rgba(0,153,70,0.1))" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#00CC66" }}>Neto Real para la Tienda</p>
                      <p className="text-xl font-black mt-1" style={{ color: uiTotals.neto < 0 ? "#FF4422" : "#00CC66" }}>{fmt(uiTotals.neto)}</p>
                    </div>
                    {canViewCost && (
                      <div className="p-4 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(0,204,102,0.2)", background: "rgba(0,204,102,0.05)" }}>
                        <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#00CC66" }}>Utilidad Neta</p>
                        <p className="text-xl font-black mt-1" style={{ color: uiTotals.profit < 0 ? "#FF4422" : "#00CC66" }}>{fmt(uiTotals.profit)}</p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* Vista Ampliada / Pantalla Completa Modal para Ventas por Producto */}
            {activeTab === "ventas" && isTableMaximized && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md transition-all duration-300">
                <div 
                  className="w-full max-w-7xl h-[90vh] bg-neutral-900 border border-neutral-800 rounded-3xl p-6 flex flex-col gap-5 shadow-[0_32px_96px_rgba(0,0,0,0.85)]"
                  style={{ background: "#0c0c0c", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {/* Modal Header */}
                  <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-black tracking-tight text-white uppercase tracking-wider">
                          Ventas por Producto · <span className="text-red-500">Vista Ampliada</span>
                        </h2>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full" style={{ background: "rgba(68,153,255,0.12)", color: "#4499FF" }}>
                          {groupedProducts.length} productos
                        </span>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: TM }}>
                        Periodo: {fmtDate(from)} al {fmtDate(to)}
                      </p>
                    </div>

                    <button
                      onClick={() => setIsTableMaximized(false)}
                      className="flex items-center justify-center w-9 h-9 rounded-xl transition-all hover:scale-105 active:scale-95 text-white/50 hover:text-white"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                      title="Cerrar vista ampliada"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Scrollable Table Area */}
                  <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                    <table className="w-full">
                      <thead>
                        <tr style={{ borderBottom: DIV }}>
                          {(canViewCost ? ["Producto", "Cant. Vendida", "Ingresos Totales", "Costo", "Utilidad Neta"] : ["Producto", "Cant. Vendida", "Ingresos Totales"]).map(h => (
                            <th key={h} style={{ ...thStyle, fontSize: 10, padding: "12px 18px" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>                      <tbody>
                        {/* 1) Render regular products */}
                        {regularProducts.map(prod => renderProductRow(prod, 18, 14, 13))}

                        {/* 2) Separator row for Tomos (mangas) */}
                        {regularProducts.length > 0 && tomoProducts.length > 0 && (
                          <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                            <td colSpan={6} style={{ 
                              padding: "10px 18px", 
                              fontSize: 10, 
                              fontWeight: 900, 
                              letterSpacing: "0.15em", 
                              color: TM, 
                              background: "rgba(255,255,255,0.05)",
                              borderTop: "1px solid rgba(255,255,255,0.1)",
                              borderBottom: "1px solid rgba(255,255,255,0.1)",
                              textTransform: "uppercase"
                            }}>
                              <div className="flex items-center justify-between">
                                <span>📚 Manga Nacional</span>
                                <span style={{ color: "#4499FF" }}>
                                  Resumen Manga Nacional: {tomoSummary.qty} uds. vendidos ({fmt(tomoSummary.revenue)})
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* 3) Render tomo products */}
                        {tomoProducts.map(prod => renderProductRow(prod, 18, 14, 13))}

                        {/* Empty state fallback */}
                        {groupedProducts.length === 0 && (
                          <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", padding: 32 }}>Sin ventas en el período</td></tr>
                        )}

                        {/* Totals row */}
                        {groupedProducts.length > 0 && (
                          <tr style={{ background: "rgba(255,255,255,0.03)", borderTop: "2px solid rgba(255,255,255,0.1)" }}>
                            <td style={{ ...tdStyle, fontWeight: 900, color: TP }}>TOTAL GENERAL</td>
                            <td style={{ ...tdStyle, fontWeight: 700, color: TP }}>{uiTotals.cantidad}</td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                                <span style={{ color: uiTotals.bruto < 0 ? "#FF4422" : "#00CC66", fontWeight: 900 }}>{fmt(uiTotals.bruto)}</span>
                                {uiTotals.comision > 0 ? (
                                  <span style={{ fontSize: 9, color: TM, fontWeight: 500 }}>
                                    {fmt(uiTotals.bruto)} - <span style={{ color: "#FF4422", fontWeight: 700 }} title="Comisión TPV Total">{fmt(uiTotals.comision)}</span> - <span style={{ color: "#F59E0B", fontWeight: 700 }} title="IVA s/Comisión Total">{fmt(uiTotals.iva)}</span> = <span style={{ color: "#00CC66", fontWeight: 800 }}>{fmt(uiTotals.neto)}</span>
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            {canViewCost && <td style={{ ...tdStyle, fontWeight: 700, color: TS }}>{fmt(uiTotals.costo)}</td>}
                            {canViewCost && <td style={{ ...tdStyle, fontWeight: 900, color: uiTotals.profit < 0 ? "#FF4422" : "#00CC66" }}>
                              {fmt(uiTotals.profit)}
                            </td>}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Cards Row inside Modal */}
                  {groupedProducts.length > 0 && (
                    <div className={`grid grid-cols-1 ${canViewCost ? "md:grid-cols-6" : "md:grid-cols-5"} gap-4 pt-4 border-t`} style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                      <div className="p-3.5 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)" }}>
                        <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>Venta Bruta Total</p>
                        <p className="text-lg font-black mt-0.5" style={{ color: TP }}>{fmt(uiTotals.bruto)}</p>
                      </div>
                      <div className="p-3.5 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)" }}>
                        <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>Manga Nacional</p>
                        <p className="text-lg font-black mt-0.5" style={{ color: "#38bdf8" }}>{fmt(tomoSummary.revenue)} <span className="text-xs font-bold" style={{ color: "rgba(56,189,248,0.8)" }}>({tomoSummary.qty} uds)</span></p>
                      </div>
                      <div className="p-3.5 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)" }}>
                        <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>Comisión TPV Total</p>
                        <p className="text-lg font-black mt-0.5" style={{ color: "#FF4422" }}>{fmt(uiTotals.comision)}</p>
                      </div>
                      <div className="p-3.5 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)" }}>
                        <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>IVA s/Comisión (16%)</p>
                        <p className="text-lg font-black mt-0.5" style={{ color: "#F59E0B" }}>{fmt(uiTotals.iva)}</p>
                      </div>
                      <div className="p-3.5 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)", background: uiTotals.neto < 0 ? "linear-gradient(135deg, rgba(255,68,34,0.1), rgba(200,30,10,0.1))" : "linear-gradient(135deg, rgba(0,204,102,0.1), rgba(0,153,70,0.1))" }}>
                        <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#00CC66" }}>Neto Real para la Tienda</p>
                        <p className="text-lg font-black mt-0.5" style={{ color: "#00CC66" }}>{fmt(uiTotals.neto)}</p>
                      </div>
                      {canViewCost && (
                        <div className="p-3.5 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(0,204,102,0.2)", background: "rgba(0,204,102,0.05)" }}>
                          <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#00CC66" }}>Utilidad Neta</p>
                          <p className="text-lg font-black mt-0.5" style={{ color: uiTotals.profit < 0 ? "#FF4422" : "#00CC66" }}>{fmt(uiTotals.profit)}</p>
                        </div>
                      )}
                    </div>
                  )}
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
                        {["Producto", "Bodega", "Tienda", "Cantidad"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {invReport.data.map((r, i) => (
                          <tr key={i} style={{ borderBottom: DIV }}>
                            <td style={{ ...tdStyle, color: TP, fontWeight: 700 }}>{r.product.name}</td>

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
                    {["#", "Nombre", "Tipo", "Veces", "Unidades", "Ingresos"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {topReport.data.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: DIV, background: i === 0 ? "rgba(255,170,0,0.04)" : "transparent" }}>
                        <td style={{ ...tdStyle, fontWeight: 900, color: i < 3 ? "#FFAA00" : TM }}>{i + 1}</td>
                        <td style={{ ...tdStyle, color: TP, fontWeight: 700 }}>{r.name}</td>

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
