// Tipos compartidos por los generadores de reporte (Excel y PDF), extraídos de
// ReportsPage.tsx para poder separar la lógica de exportación en archivos aparte.
import type { InventoryReport, TopProductsReport, CustomersReport, Store as StoreType, SupplyMovementRecord } from "@tadaima/api";

export type TabId = "ventas" | "inventario" | "productos" | "clientes";

export interface GroupedProduct {
  /** number = product_id vivo; "del:{nombre}" = producto eliminado del catálogo (agrupa por snapshot). */
  id: number | string;
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
  /** Split por costo: costo unitario de ESTE renglón (para etiquetar en Excel/PDF). */
  cost_tag?: number;
  /** true si el producto base tiene >1 costo distinto en el rango. */
  show_cost_tag?: boolean;
  pre_sale_apartado?: number;
  pre_sale_deuda?: number;
  /** Costo real (snapshot) de los items de preventa del rango, incluye anticipos.
   *  Informativo: NO entra a total_cost/total_profit (la utilidad se reconoce al entregar). */
  pre_sale_costo_real?: number;
  /** Costo a mostrar en Preventas: entregada → costo real; en abono → costo real − abono. */
  pre_sale_costo_neto?: number;
  /** Utilidad a mostrar en Preventas: entregada → pactado − costo; en abono → el abono. */
  pre_sale_utilidad?: number;
  commission_amount?: number;
  product_type?: 'product' | 'manga';
  /** Descuentos v2: total descontado por PROMO (NxM/mayoreo) del producto en el rango. */
  promo_total?: number;
  /** Descuentos v2: total descontado por DESCUENTO MANUAL del producto en el rango. */
  manual_total?: number;
  /** Monto descontado POR CADA promo, separado por método real ({ efectivo, tarjeta }). */
  promo_breakdown?: Record<string, { cash: number; card: number }>;
  /** Ídem descuento manual por motivo. */
  discount_breakdown?: Record<string, { cash: number; card: number }>;
}

export interface ReportPaymentBreakdown {
  total: number;
  card: number;
  cash: number;
  deposits: number;
  usd: number;
  transactionCount: number;
}

/** Un renglón de la tabla de Preventas: un producto agrupado por ESTADO
 *  (liquidada = entregada, o apartada = en abono). Cada producto puede generar
 *  hasta 2 renglones (uno por estado). */
export interface PresaleRow {
  productId: number;
  /** Nombre con sufijo " (Liquidada)" / " (Apartada)". */
  name: string;
  entregado: boolean;
  qty: number;
  apartado: number;
  deuda: number;
  pactado: number;
  costoReal: number;
  /** Costo a mostrar (modelo dueño): liquidada → costo real − abonos previos;
   *  apartada → = la venta del mes (netea, para que la utilidad sea $0). */
  costoNeto: number;
  /** Utilidad (modelo dueño): apartada → $0 (el abono no es utilidad);
   *  liquidada → Venta − Costo (= margen real reconocido al entregar). */
  utilidad: number;
}

/** Todo lo que los generadores de Excel/PDF necesitan del componente ReportsPage. */
export interface ReportExportParams {
  presaleRows: PresaleRow[];
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
