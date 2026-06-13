import { useState, useEffect, useMemo, Fragment } from "react";
import {
  TrendingUp, Package, Users,
  DollarSign,
  ShoppingBag, Star, Calendar, Store,
  ChevronDown, ChevronRight, Clock, RefreshCw, ChevronLeft,
  FileSpreadsheet, FileDown,
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
import { getTodayLocal, daysAgoLocal, BUSINESS_TZ } from "@/lib/date";
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
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
  return d.toISOString().split('T')[0];
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
  payment_breakdown: { [method: string]: number };
  price_breakdown: { [price: number]: number };
  pre_sale_apartado?: number;
  pre_sale_deuda?: number;
  commission_amount?: number;
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
  const [expandedIds,  setExpandedIds]  = useState<number[]>([]);
  const [selectedFilters, setSelectedFilters] = useState<SalesHistoryFilter[]>(["all"]);

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
  const salesListParams = { ...baseParams, per_page: 100 };
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
        || (sale.status ?? "").toLowerCase().includes("cancel");
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
        || (sale.status ?? "").toLowerCase().includes("cancel");

      // 1. Regular items
      for (const item of sale.items) {
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
        const itemTotal = item.total;
        const unitPrice = item.price;

        if (!map.has(prodId)) {
          map.set(prodId, {
            id: prodId,
            name: prodName,
            sku: prodSku,
            sales_count: 0,
            total_quantity: 0,
            total_revenue: 0,
            payment_breakdown: {},
            price_breakdown: {},
            commission_amount: 0,
          });
        }

        const pGroup = map.get(prodId)!;
        pGroup.sales_count += 1;
        pGroup.total_quantity += qty;
        pGroup.total_revenue += itemTotal;

        pGroup.payment_breakdown[payMethodName] = (pGroup.payment_breakdown[payMethodName] ?? 0) + qty;
        pGroup.price_breakdown[unitPrice] = (pGroup.price_breakdown[unitPrice] ?? 0) + qty;

        // Proportional commission allocation based on item total compared to sale total
        if (isCardMethod(payMethodName.toLowerCase()) && sale.total > 0) {
          const ratio = itemTotal / sale.total;
          const comm = (sale.commission_amount || 0) * ratio;
          pGroup.commission_amount = (pGroup.commission_amount ?? 0) + comm;
        }
      }

      // 2. Pre-sale items (Preventas)
      if (sale.pre_sale_orders) {
        for (const order of sale.pre_sale_orders) {
          const orderStatus = (order.status ?? "").toLowerCase();
          const orderIsCancelled = orderStatus.includes("cancel");
          const orderIsNotPicked = orderStatus.includes("expired") || orderStatus.includes("vencid") || orderStatus.includes("no recog");

          const matchesPreSaleFilter = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.some(filter => {
            if (filter === "cash") return methods.some(m => isCashMethod(m) || isDollarMethod(m));
            if (filter === "dollar") return methods.some(m => isDollarMethod(m));
            if (filter === "card") return methods.some(m => isCardMethod(m));
            if (filter === "transfer") return methods.some(m => isTransferMethod(m));
            if (filter === "preSales") return true;
            if (filter === "cancelled") return hasCancelled || orderIsCancelled;
            if (filter === "notPicked") return orderIsNotPicked;
            return false;
          });

          if (!matchesPreSaleFilter) continue;

          const orderItemsTotal = order.items.reduce((sum, it) => sum + (it.unit_price * it.quantity), 0);

          for (const item of order.items) {
            // If product_id is null, generate a unique negative ID based on catalog ID to avoid collisions
            const prodId = item.product_id ?? (item.catalog ? item.catalog.id * -1 : -999);
            const prodName = item.catalog?.product_name ?? `Preventa #${item.id}`;
            const prodSku = "PREVENTA";
            const qty = item.quantity;
            const itemTotal = item.unit_price * item.quantity;
            const unitPrice = item.unit_price;

            // Proportional allocation of paid_amount and balance based on item's total value vs order items total
            const ratio = orderItemsTotal > 0 ? (itemTotal / orderItemsTotal) : (1 / order.items.length);
            const itemApartado = (order.paid_amount || 0) * ratio;
            const itemDeuda = (order.balance || 0) * ratio;

            if (!map.has(prodId)) {
              map.set(prodId, {
                id: prodId,
                name: prodName,
                sku: prodSku,
                sales_count: 0,
                total_quantity: 0,
                total_revenue: 0,
                payment_breakdown: {},
                price_breakdown: {},
                pre_sale_apartado: 0,
                pre_sale_deuda: 0,
              });
            }

            const pGroup = map.get(prodId)!;
            pGroup.sales_count += 1;
            pGroup.total_quantity += qty;
            pGroup.total_revenue += itemTotal;

            pGroup.payment_breakdown[payMethodName] = (pGroup.payment_breakdown[payMethodName] ?? 0) + qty;
            pGroup.price_breakdown[unitPrice] = (pGroup.price_breakdown[unitPrice] ?? 0) + qty;

            pGroup.pre_sale_apartado = (pGroup.pre_sale_apartado ?? 0) + itemApartado;
            pGroup.pre_sale_deuda = (pGroup.pre_sale_deuda ?? 0) + itemDeuda;
          }
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.total_quantity - a.total_quantity);
  }, [filteredSales]);
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


    const activeTabMeta = (REPORT_TABS.find(tab => tab.id === activeTab) ?? REPORT_TABS[0]) as { id: TabId; label: string; icon: React.ElementType };
  const hiddenTabs = REPORT_TABS.filter(tab => tab.id !== activeTab);

  const handleExportExcel = async () => {
    try {
      toast.info("Generando archivo de Excel...");
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      
      workbook.creator = "Tadaima POS";
      workbook.lastModifiedBy = "Tadaima POS";
      workbook.created = new Date();
      workbook.modified = new Date();
      
      if (activeTab === "ventas") {
        const sheet = workbook.addWorksheet("Reporte de Ventas");
        
        sheet.mergeCells("A1:I1");
        const titleCell = sheet.getCell("A1");
        titleCell.value = "TADAIMA - REPORTE DE VENTAS";
        titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        titleCell.alignment = { vertical: "middle", horizontal: "center" };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF4422" } };
        sheet.getRow(1).height = 35;
        
        sheet.mergeCells("A2:I2");
        const subtitleCell = sheet.getCell("A2");
        subtitleCell.value = `Periodo: ${fmtDate(from)} al ${fmtDate(to)}  |  Exportado: ${fmtDate(today)} ${new Date().toLocaleTimeString()}`;
        subtitleCell.font = { name: "Arial", size: 10, italic: true };
        subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
        sheet.getRow(2).height = 20;

        sheet.addRow([]);

        sheet.addRow(["RESUMEN DE COBROS"]).font = { bold: true, size: 11 };
        sheet.addRow(["Total Cobrado", paymentBreakdown.total]);
        sheet.addRow(["Pago con Tarjeta", paymentBreakdown.card]);
        sheet.addRow(["Pago en Efectivo", paymentBreakdown.cash]);
        sheet.addRow(["Depósitos", paymentBreakdown.deposits]);
        
        const summaryRows = [5, 6, 7, 8];
        summaryRows.forEach((r, idx) => {
          sheet.getCell(`B${r}`).numFmt = "$#,##0.00";
          sheet.getCell(`B${r}`).alignment = { horizontal: "right" };
          if (idx === 0) {
            sheet.getCell(`A${r}`).font = { bold: true };
            sheet.getCell(`B${r}`).font = { bold: true, color: { argb: "FF009944" } };
          }
        });

        sheet.addRow([]);
        sheet.addRow([]);

        const headerRow = sheet.addRow([
          "Producto",
          "SKU",
          "Nº Ventas (Tickets)",
          "Cantidad Vendida",
          "Ingresos Totales",
          "Desglose de Precios",
          "Desglose de Pagos",
          "Apartado Preventa",
          "Deuda Preventa"
        ]);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF333333" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });
        sheet.getRow(headerRow.number).height = 25;

        groupedProducts.forEach((prod) => {
          const pricesStr = Object.entries(prod.price_breakdown)
            .map(([price, qty]) => `${qty} ud. a ${price}`)
            .join(" | ");
          const paymentsStr = Object.entries(prod.payment_breakdown)
            .map(([method, qty]) => `${qty} ud. con ${method}`)
            .join(" | ");

          const r = sheet.addRow([
            prod.name,
            prod.sku,
            prod.sales_count,
            prod.total_quantity,
            prod.total_revenue,
            pricesStr,
            paymentsStr,
            prod.pre_sale_apartado || 0,
            prod.pre_sale_deuda || 0
          ]);
          
          r.getCell(2).alignment = { horizontal: "center" };
          r.getCell(3).alignment = { horizontal: "center" };
          r.getCell(4).alignment = { horizontal: "center" };
          r.getCell(5).numFmt = "$#,##0.00";
          r.getCell(5).font = { bold: true, color: { argb: "FF009944" } };
          r.getCell(8).numFmt = "$#,##0.00";
          r.getCell(9).numFmt = "$#,##0.00";
        });

        sheet.columns.forEach((column) => {
          if (column.values) {
            let maxLength = 0;
            column.values.forEach((v) => {
              if (v) {
                const strLen = String(v).length;
                if (strLen > maxLength) maxLength = strLen;
              }
            });
            column.width = Math.min(Math.max(maxLength + 3, 10), 40);
          }
        });
      } else if (activeTab === "inventario") {
        const sheet = workbook.addWorksheet("Inventario");
        sheet.mergeCells("A1:E1");
        const titleCell = sheet.getCell("A1");
        titleCell.value = "TADAIMA - REPORTE DE INVENTARIO";
        titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        titleCell.alignment = { vertical: "middle", horizontal: "center" };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF4422" } };
        sheet.getRow(1).height = 35;

        sheet.mergeCells("A2:E2");
        const subtitleCell = sheet.getCell("A2");
        subtitleCell.value = `Exportado: ${fmtDate(today)} ${new Date().toLocaleTimeString()}`;
        subtitleCell.font = { name: "Arial", size: 10, italic: true };
        subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
        sheet.getRow(2).height = 20;

        sheet.addRow([]);

        const headerRow = sheet.addRow(["Producto", "SKU", "Bodega", "Tienda", "Cantidad"]);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF333333" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });

        invReport?.data.forEach((r) => {
          const row = sheet.addRow([
            r.product.name,
            r.product.sku,
            r.warehouse.name,
            r.warehouse.store ?? "—",
            r.quantity
          ]);
          row.getCell(2).alignment = { horizontal: "center" };
          row.getCell(5).alignment = { horizontal: "center" };
          if (r.quantity <= 5) {
            row.getCell(5).font = { bold: true, color: { argb: "FFFF2200" } };
          } else if (r.quantity <= 10) {
            row.getCell(5).font = { bold: true, color: { argb: "FFFFAA00" } };
          } else {
            row.getCell(5).font = { bold: true, color: { argb: "FF009944" } };
          }
        });

        sheet.columns.forEach((column) => {
          if (column.values) {
            let maxLength = 0;
            column.values.forEach((v) => {
              if (v) {
                const strLen = String(v).length;
                if (strLen > maxLength) maxLength = strLen;
              }
            });
            column.width = Math.min(Math.max(maxLength + 3, 10), 40);
          }
        });
      } else if (activeTab === "productos") {
        const sheet = workbook.addWorksheet("Top Productos");
        sheet.mergeCells("A1:G1");
        const titleCell = sheet.getCell("A1");
        titleCell.value = "TADAIMA - TOP PRODUCTOS VENDIDOS";
        titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        titleCell.alignment = { vertical: "middle", horizontal: "center" };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF4422" } };
        sheet.getRow(1).height = 35;

        sheet.mergeCells("A2:G2");
        const subtitleCell = sheet.getCell("A2");
        subtitleCell.value = `Periodo: ${fmtDate(from)} al ${fmtDate(to)}  |  Exportado: ${fmtDate(today)} ${new Date().toLocaleTimeString()}`;
        subtitleCell.font = { name: "Arial", size: 10, italic: true };
        subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
        sheet.getRow(2).height = 20;

        sheet.addRow([]);

        const headerRow = sheet.addRow(["Lugar", "Nombre", "SKU", "Tipo", "Veces Vendido", "Unidades Vendidas", "Ingresos Totales"]);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF333333" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });

        topReport?.data.forEach((r, idx) => {
          const row = sheet.addRow([
            idx + 1,
            r.name,
            r.sku,
            r.type,
            r.times_sold,
            r.total_quantity,
            r.total_revenue
          ]);
          row.getCell(1).alignment = { horizontal: "center" };
          row.getCell(3).alignment = { horizontal: "center" };
          row.getCell(4).alignment = { horizontal: "center" };
          row.getCell(5).alignment = { horizontal: "center" };
          row.getCell(6).alignment = { horizontal: "center" };
          row.getCell(7).numFmt = "$#,##0.00";
          row.getCell(7).font = { bold: true, color: { argb: "FF009944" } };
        });

        sheet.columns.forEach((column) => {
          if (column.values) {
            let maxLength = 0;
            column.values.forEach((v) => {
              if (v) {
                const strLen = String(v).length;
                if (strLen > maxLength) maxLength = strLen;
              }
            });
            column.width = Math.min(Math.max(maxLength + 3, 10), 40);
          }
        });
      } else if (activeTab === "clientes") {
        const sheet = workbook.addWorksheet("Top Clientes");
        sheet.mergeCells("A1:F1");
        const titleCell = sheet.getCell("A1");
        titleCell.value = "TADAIMA - TOP CLIENTES";
        titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        titleCell.alignment = { vertical: "middle", horizontal: "center" };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF4422" } };
        sheet.getRow(1).height = 35;

        sheet.mergeCells("A2:F2");
        const subtitleCell = sheet.getCell("A2");
        subtitleCell.value = `Periodo: ${fmtDate(from)} al ${fmtDate(to)}  |  Exportado: ${fmtDate(today)} ${new Date().toLocaleTimeString()}`;
        subtitleCell.font = { name: "Arial", size: 10, italic: true };
        subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
        sheet.getRow(2).height = 20;

        sheet.addRow([]);

        const headerRow = sheet.addRow(["Lugar", "Cliente", "Teléfono", "Compras", "Total Gastado", "Crédito"]);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF333333" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });

        custReport?.data.forEach((r, idx) => {
          const row = sheet.addRow([
            idx + 1,
            r.name,
            r.phone ?? "—",
            r.total_purchases,
            r.total_spent,
            r.credit_balance
          ]);
          row.getCell(1).alignment = { horizontal: "center" };
          row.getCell(3).alignment = { horizontal: "center" };
          row.getCell(4).alignment = { horizontal: "center" };
          row.getCell(5).numFmt = "$#,##0.00";
          row.getCell(5).font = { bold: true, color: { argb: "FF009944" } };
          row.getCell(6).numFmt = "$#,##0.00";
        });

        sheet.columns.forEach((column) => {
          if (column.values) {
            let maxLength = 0;
            column.values.forEach((v) => {
              if (v) {
                const strLen = String(v).length;
                if (strLen > maxLength) maxLength = strLen;
              }
            });
            column.width = Math.min(Math.max(maxLength + 3, 10), 40);
          }
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tadaima_reporte_${activeTab}_${from}_${to}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Excel descargado correctamente");
    } catch (error) {
      console.error(error);
      toast.error("Error al exportar a Excel");
    }
  };

  const handleExportPDF = async () => {
    try {
      toast.info("Generando archivo PDF...");
      const { jsPDF } = await import("jspdf");
      await import("jspdf-autotable");
      
      const doc = new jsPDF(activeTab === "ventas" ? "landscape" : "portrait", "pt", "letter");
      const pageWidth = doc.internal.pageSize.getWidth();
      const darkColor = [30, 30, 30];
      
      doc.setFillColor(255, 68, 34);
      doc.rect(0, 0, pageWidth, 60, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("TADAIMA - CENTRO DE REPORTES", 40, 36);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`PERIODO: ${fmtDate(from).toUpperCase()} AL ${fmtDate(to).toUpperCase()}`, pageWidth - 40, 26, { align: "right" });
      doc.text(`SECCIÓN: ${activeTabMeta.label.toUpperCase()}  |  EXPORTADO: ${fmtDate(today).toUpperCase()} ${new Date().toLocaleTimeString()}`, pageWidth - 40, 42, { align: "right" });
      
      let currentY = 90;

      if (activeTab === "ventas") {
        doc.setFillColor(245, 245, 247);
        doc.rect(40, currentY, pageWidth - 80, 50, "F");
        
        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        
        const colWidth = (pageWidth - 80) / 4;
        
        doc.text("TOTAL COBRADO", 40 + 15, currentY + 18);
        doc.setFontSize(13);
        doc.setTextColor(0, 153, 68);
        doc.text(fmt(paymentBreakdown.total), 40 + 15, currentY + 38);
        
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(8);
        doc.text("PAGO TARJETA", 40 + colWidth + 15, currentY + 18);
        doc.setFontSize(13);
        doc.setTextColor(68, 153, 255);
        doc.text(fmt(paymentBreakdown.card), 40 + colWidth + 15, currentY + 38);

        doc.setTextColor(50, 50, 50);
        doc.setFontSize(8);
        doc.text("PAGO EFECTIVO", 40 + colWidth * 2 + 15, currentY + 18);
        doc.setFontSize(13);
        doc.setTextColor(51, 204, 136);
        doc.text(fmt(paymentBreakdown.cash), 40 + colWidth * 2 + 15, currentY + 38);

        doc.setTextColor(50, 50, 50);
        doc.setFontSize(8);
        doc.text("DEPÓSITOS", 40 + colWidth * 3 + 15, currentY + 18);
        doc.setFontSize(13);
        doc.setTextColor(187, 119, 255);
        doc.text(fmt(paymentBreakdown.deposits), 40 + colWidth * 3 + 15, currentY + 38);
        
        currentY += 80;

        const tableHeaders = [["Producto", "SKU", "Nº Ventas", "Cant. Vendida", "Total Ingresos", "Desglose Precios / Pagos"]];
        const tableRows = groupedProducts.map(prod => {
          const pricesStr = Object.entries(prod.price_breakdown)
            .map(([price, qty]) => `${qty} ud. a ${fmt(parseFloat(price))}`)
            .join("\n");
          const paymentsStr = Object.entries(prod.payment_breakdown)
            .map(([method, qty]) => `${qty} ud. con ${method}`)
            .join("\n");

          let breakdownText = `PRECIOS:\n${pricesStr}\n\nPAGOS:\n${paymentsStr}`;
          if ((prod.pre_sale_apartado && prod.pre_sale_apartado > 0) || (prod.pre_sale_deuda && prod.pre_sale_deuda > 0)) {
            breakdownText += `\n\nPREVENTA:\n`;
            if (prod.pre_sale_apartado && prod.pre_sale_apartado > 0) {
              breakdownText += `Abonado/Apartado: ${fmt(prod.pre_sale_apartado)}\n`;
            }
            if (prod.pre_sale_deuda && prod.pre_sale_deuda > 0) {
              breakdownText += `Pendiente/Deuda: ${fmt(prod.pre_sale_deuda)}\n`;
            }
          }

          return [
            prod.name,
            prod.sku,
            prod.sales_count,
            prod.total_quantity,
            fmt(prod.total_revenue),
            breakdownText
          ];
        });

        (doc as any).autoTable({
          startY: currentY,
          head: tableHeaders,
          body: tableRows,
          theme: "striped",
          headStyles: { fillColor: darkColor },
          styles: { fontSize: 8, cellPadding: 6 },
          columnStyles: {
            0: { cellWidth: 150 },
            1: { cellWidth: 80, halign: "center" },
            2: { cellWidth: 60, halign: "center" },
            3: { cellWidth: 60, halign: "center", fontStyle: "bold" },
            4: { cellWidth: 80, halign: "right", fontStyle: "bold", textColor: [0, 153, 68] },
            5: { cellWidth: 200 }
          },
          margin: { left: 40, right: 40 }
        });
      } else if (activeTab === "inventario") {
        const tableHeaders = [["Producto", "SKU", "Bodega", "Tienda", "Cantidad"]];
        const tableRows = (invReport?.data ?? []).map(r => [
          r.product.name,
          r.product.sku,
          r.warehouse.name,
          r.warehouse.store ?? "—",
          r.quantity
        ]);

        (doc as any).autoTable({
          startY: currentY,
          head: tableHeaders,
          body: tableRows,
          theme: "striped",
          headStyles: { fillColor: darkColor },
          styles: { fontSize: 9, cellPadding: 8 },
          columnStyles: {
            0: { cellWidth: 200 },
            1: { cellWidth: 100, halign: "center" },
            2: { cellWidth: 110 },
            3: { cellWidth: 70 },
            4: { cellWidth: 50, halign: "center", fontStyle: "bold" }
          },
          margin: { left: 40, right: 40 }
        });
      } else if (activeTab === "productos") {
        const tableHeaders = [["#", "Nombre del Producto", "SKU", "Tipo", "Veces Vendido", "Unidades", "Ingresos"]];
        const tableRows = (topReport?.data ?? []).map((r, i) => [
          i + 1,
          r.name,
          r.sku,
          r.type,
          r.times_sold,
          r.total_quantity,
          fmt(r.total_revenue)
        ]);

        (doc as any).autoTable({
          startY: currentY,
          head: tableHeaders,
          body: tableRows,
          theme: "striped",
          headStyles: { fillColor: darkColor },
          styles: { fontSize: 9, cellPadding: 8 },
          columnStyles: {
            0: { cellWidth: 30, halign: "center" },
            1: { cellWidth: 200 },
            2: { cellWidth: 90, halign: "center" },
            3: { cellWidth: 50, halign: "center" },
            4: { cellWidth: 50, halign: "center" },
            5: { cellWidth: 50, halign: "center" },
            6: { cellWidth: 70, halign: "right", fontStyle: "bold" }
          },
          margin: { left: 40, right: 40 }
        });
      } else if (activeTab === "clientes") {
        const tableHeaders = [["#", "Cliente", "Teléfono", "Compras Realizadas", "Total Gastado", "Saldo Crédito"]];
        const tableRows = (custReport?.data ?? []).map((r, i) => [
          i + 1,
          r.name,
          r.phone ?? "—",
          r.total_purchases,
          fmt(r.total_spent),
          fmt(r.credit_balance)
        ]);

        (doc as any).autoTable({
          startY: currentY,
          head: tableHeaders,
          body: tableRows,
          theme: "striped",
          headStyles: { fillColor: darkColor },
          styles: { fontSize: 9, cellPadding: 8 },
          columnStyles: {
            0: { cellWidth: 30, halign: "center" },
            1: { cellWidth: 180 },
            2: { cellWidth: 90, halign: "center" },
            3: { cellWidth: 80, halign: "center" },
            4: { cellWidth: 80, halign: "right", fontStyle: "bold" },
            5: { cellWidth: 80, halign: "right" }
          },
          margin: { left: 40, right: 40 }
        });
      }

      doc.save(`tadaima_reporte_${activeTab}_${from}_${to}.pdf`);
      toast.success("PDF descargado correctamente");
    } catch (error) {
      console.error(error);
      toast.error("Error al exportar a PDF");
    }
  };



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
              style={{ background: "rgba(68,153,255,0.1)", border: "1px solid rgba(68,153,255,0.2)", color: "#4499FF" }}
              title="Exportar reporte actual a PDF"
            >
              <FileDown size={13} />
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
                  <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: DIV }}>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: TM }}>
                      Ventas por Producto
                    </p>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(68,153,255,0.12)", color: "#4499FF" }}>
                      {groupedProducts.length} productos
                    </span>
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
                    <table className="w-full">
                      <thead><tr style={{ borderBottom: DIV }}>
                        {["Producto", "SKU", "Nº Ventas (Tickets)", "Cant. Vendida", "Ingresos Totales"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {groupedProducts.map(prod => {
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
                                <td style={{ ...tdStyle, fontWeight: 900, color: TP }}>
                                  <div className="flex items-center gap-1.5">
                                    {isExpanded ? <ChevronDown size={12} style={{ color: TM }} /> : <ChevronRight size={12} style={{ color: TM }} />}
                                    {prod.name}
                                  </div>
                                </td>
                                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>{prod.sku}</td>
                                <td style={tdStyle}>{prod.sales_count}</td>
                                <td style={{ ...tdStyle, fontWeight: 700, color: TP }}>{prod.total_quantity}</td>
                                <td style={{ ...tdStyle, verticalAlign: "middle" }}>
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                                    <span style={{ color: "#00CC66", fontWeight: 900 }}>{fmt(prod.total_revenue)}</span>
                                    {prod.commission_amount && prod.commission_amount > 0 ? (
                                      <span style={{ fontSize: 9, color: TM, fontWeight: 500 }}>
                                        {fmt(prod.total_revenue)} - {fmt(prod.commission_amount)} = <span style={{ color: "#00CC66", fontWeight: 800 }}>{fmt(prod.total_revenue - prod.commission_amount)}</span>
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr key={`${prod.id}-detail`}>
                                  <td colSpan={5} style={{ padding: "0 16px 12px", borderBottom: DIV, background: "rgba(255,255,255,0.02)" }}>
                                    <div className={`grid grid-cols-1 ${((prod.pre_sale_apartado && prod.pre_sale_apartado > 0) || (prod.pre_sale_deuda && prod.pre_sale_deuda > 0)) ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6 pt-3 pb-2`}>
                                      {/* Métodos de Pago */}
                                      <div>
                                        <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM, marginBottom: 8 }}>
                                          Desglose por método de pago
                                        </p>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                          {Object.entries(prod.payment_breakdown).map(([method, qty]) => {
                                            const isCard = method.toLowerCase().includes("tarjeta") || method.toLowerCase().includes("credit") || method.toLowerCase().includes("debito") || method.toLowerCase().includes("tpv") || method.toLowerCase().includes("terminal");
                                            return (
                                              <div key={method} className="flex flex-col gap-1 py-1.5 px-3" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 9 }}>
                                                <div className="flex items-center justify-between text-xs">
                                                  <span style={{ color: TS, fontWeight: 700 }}>{method}</span>
                                                  <span style={{ color: TP, fontWeight: 900 }}>{qty} {qty === 1 ? "unidad" : "unidades"}</span>
                                                </div>
                                                {isCard && prod.commission_amount && prod.commission_amount > 0 && (
                                                  <div className="flex items-center justify-between text-[10px] mt-0.5 pt-0.5 border-t border-dashed" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                                                    <span style={{ color: TM }}>Comisión de terminal absorbida:</span>
                                                    <span style={{ color: "#FF4422", fontWeight: 700 }}>{fmt(prod.commission_amount)}</span>
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
                        })}
                        {groupedProducts.length === 0 && (
                          <tr><td colSpan={5} style={{ ...tdStyle, textAlign: "center", padding: 32 }}>Sin ventas en el período</td></tr>
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
