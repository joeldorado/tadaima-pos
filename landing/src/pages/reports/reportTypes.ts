// Tipos compartidos por los generadores de reporte (Excel y PDF), extraídos de
// ReportsPage.tsx para poder separar la lógica de exportación en archivos aparte.
import type { InventoryReport, TopProductsReport, CustomersReport, Store as StoreType, SupplyMovementRecord } from "@tadaima/api";

export type TabId = "ventas" | "inventario" | "productos" | "clientes";

export interface GroupedProduct {
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
  /** Costo real (snapshot) de los items de preventa del rango, incluye anticipos.
   *  Informativo: NO entra a total_cost/total_profit (la utilidad se reconoce al entregar). */
  pre_sale_costo_real?: number;
  commission_amount?: number;
  product_type?: 'product' | 'manga';
  /** Descuentos v2: total descontado por PROMO (NxM/mayoreo) del producto en el rango. */
  promo_total?: number;
  /** Descuentos v2: total descontado por DESCUENTO MANUAL del producto en el rango. */
  manual_total?: number;
  /** Monto descontado POR CADA promo (nombre → monto). */
  promo_breakdown?: Record<string, number>;
  /** Monto descontado POR CADA motivo de descuento manual. */
  discount_breakdown?: Record<string, number>;
}

export interface ReportPaymentBreakdown {
  total: number;
  card: number;
  cash: number;
  deposits: number;
  usd: number;
  transactionCount: number;
}

/** Todo lo que los generadores de Excel/PDF necesitan del componente ReportsPage. */
export interface ReportExportParams {
  groupedProducts: GroupedProduct[];
  regularProducts: GroupedProduct[];
  tomoProducts: GroupedProduct[];
  paymentBreakdown: ReportPaymentBreakdown;
  invReport: InventoryReport | null;
  topReport: TopProductsReport | null;
  custReport: CustomersReport | null;
  from: string;
  to: string;
  today: string;
  activeTab: TabId;
  canViewCost: boolean;
  ivaRate: number;
  effectiveStoreId: number | null;
  selectedUserId: number | null;
  stores: StoreType[];
  users: { id: number; name: string }[];
  /** Compras de insumos del rango (egresos) para la tabla 5. EGRESOS. */
  supplyMovements: SupplyMovementRecord[];
}
