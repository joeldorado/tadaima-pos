// Genera el MISMO reporte de Ventas que la pantalla de Reportes, pero acotado a
// un corte de caja: el día del corte, la tienda de la sesión y el usuario dueño
// de la caja.
//
// Reusa las funciones puras de buildReportData (extraídas de ReportsPage) para
// que las reglas —neteo de cancelaciones, split por costo, prorrateo de
// preventas, descuentos v2— sean literalmente las mismas. Aquí NO se recalcula
// nada: solo se traen los datos y se delega.
//
// A diferencia de ReportsPage, que mantiene los datos vivos con TanStack Query,
// esto hace un fetch de una sola vez al presionar el botón: el corte se descarga
// y se cierra, no necesita polling.
import {
  getSales, getPreSaleOrders, getSupplyMovements,
  type SaleDetail, type PreSaleOrder, type SupplyMovementRecord,
} from "@tadaima/api";
import {
  filterSales, filterPreSaleOrders, buildGroupedProducts, buildPresaleRows,
  buildPaymentBreakdown,
} from "./buildReportData";
import type { ReportExportParams } from "./reportTypes";

export interface CashCloseReportInput {
  /** Día del corte (YYYY-MM-DD local). Se usa como rango completo from = to. */
  day: string;
  /** Tienda de la sesión de caja. null = todas (admin sin tienda asignada). */
  storeId: number | null;
  /** Dueño de la caja: el reporte se acota a SUS movimientos. */
  userId: number;
  /** Nombre del cajero, para el encabezado del archivo. */
  userName: string;
  /** Nombre de la tienda, para el encabezado del archivo. */
  storeName: string;
  /** Si el usuario puede ver costos; si no, el Excel omite esas columnas. */
  canViewCost: boolean;
  /** Tasa de IVA sobre comisión (misma que Reportes lee de localStorage). */
  ivaRate: number;
}

/**
 * Trae ventas, preventas e insumos del día y los arma en el shape que consumen
 * exportReportExcel / exportReportPdf.
 *
 * Sin filtros de la barra de Ventas: el corte siempre reporta TODO el día
 * ("all"), porque su propósito es cuadrar el turno completo.
 */
export async function buildCashCloseReportParams(
  input: CashCloseReportInput,
): Promise<ReportExportParams> {
  const { day, storeId, userId, userName, storeName, canViewCost, ivaRate } = input;

  const baseParams = {
    from: day,
    to: day,
    ...(storeId ? { store_id: storeId } : {}),
    user_id: userId,
  };

  // Preventas por FECHA DE PAGO, igual que Reportes: un folio creado antes puede
  // haber cobrado un anticipo hoy y ese dinero sí es de este turno.
  const preSaleParams = {
    payment_from: day,
    payment_to: day,
    status: "pending,ready,delivered,expired,cancelled",
    ...(storeId ? { store_id: storeId } : {}),
    user_id: userId,
    per_page: 500,
  };

  const [salesRes, preSaleRes, suppliesRes] = await Promise.all([
    getSales({ ...baseParams, per_page: 100 }),
    getPreSaleOrders(preSaleParams),
    getSupplyMovements(baseParams).catch(() => [] as SupplyMovementRecord[]),
  ]);

  const sales: SaleDetail[] = salesRes?.data ?? [];
  const preSaleOrders: PreSaleOrder[] = preSaleRes?.data ?? [];
  const supplyMovements: SupplyMovementRecord[] = suppliesRes ?? [];

  const ALL = ["all"] as const;
  const filteredSales = filterSales(sales, [...ALL]);
  const filteredPreSaleOrders = filterPreSaleOrders(preSaleOrders, [...ALL]);

  const groupedProducts = buildGroupedProducts(
    filteredSales, filteredPreSaleOrders, [...ALL], day, day, canViewCost,
  );

  return {
    groupedProducts,
    regularProducts: groupedProducts.filter(p => p.product_type !== "manga"),
    tomoProducts:    groupedProducts.filter(p => p.product_type === "manga"),
    presaleRows:     buildPresaleRows(filteredPreSaleOrders, day, day),
    paymentBreakdown: buildPaymentBreakdown(filteredSales, filteredPreSaleOrders, [...ALL], day, day),
    // El corte solo reporta ventas — inventario, top productos y clientes son
    // otras pestañas de Reportes y no aplican a un turno.
    invReport: null,
    topReport: null,
    custReport: null,
    from: day,
    to: day,
    today: day,
    activeTab: "ventas",
    canViewCost,
    ivaRate,
    effectiveStoreId: storeId,
    selectedUserId: userId,
    stores: storeId ? [{ id: storeId, name: storeName }] as ReportExportParams["stores"] : [],
    users: [{ id: userId, name: userName }],
    supplyMovements,
  };
}
