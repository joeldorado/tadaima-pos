import { apiClient } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SalesReport {
  period: { from: string; to: string }
  summary: {
    total_count: number
    total_revenue: number
    total_discount: number
    total_commission: number
  }
  pre_sale_summary: { total_count: number; total_amount: number }
  by_payment_method: Array<{ payment_method: string; count: number; amount: number }>
  by_day: Array<{ date: string; count: number; amount: number }>
  pre_sale_by_day: Array<{ date: string; count: number; amount: number }>
  by_store: Array<{ store_id: number; store: string; count: number; amount: number }> | null
}

export interface InventoryReportItem {
  product: { id: number; name: string; sku: string }
  warehouse: { id: number; name: string; store: string | null }
  quantity: number
}

export interface InventoryReport {
  filters: {
    warehouse_id: number | null
    store_id: number | null
    low_stock: boolean
    threshold: number
  }
  summary: { total_skus: number; total_quantity: number }
  data: InventoryReportItem[]
}

export interface TopProductsReportItem {
  id: number
  name: string
  sku: string
  type: 'product' | 'manga'
  times_sold: number
  total_quantity: number
  total_revenue: number
}

export interface TopProductsReport {
  period: { from: string; to: string }
  data: TopProductsReportItem[]
}

export interface CustomersReportItem {
  id: number
  name: string
  phone: string | null
  total_purchases: number
  total_spent: number
  credit_balance: number
}

export interface CustomersReport {
  period: { from: string; to: string }
  data: CustomersReportItem[]
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

export interface ReportDateParams {
  from?: string
  to?: string
  store_id?: number
}

export async function getSalesReport(params?: ReportDateParams & { user_id?: number }): Promise<SalesReport> {
  const response = await apiClient.get<SalesReport>('/reports/sales', { params })
  return response.data
}

export async function getInventoryReport(params?: {
  warehouse_id?: number
  store_id?: number
  low_stock?: boolean
  threshold?: number
}): Promise<InventoryReport> {
  const response = await apiClient.get<InventoryReport>('/reports/inventory', { params })
  return response.data
}

export async function getTopProductsReport(params?: ReportDateParams & { limit?: number }): Promise<TopProductsReport> {
  const response = await apiClient.get<TopProductsReport>('/reports/top-products', { params })
  return response.data
}

export async function getCustomersReport(params?: ReportDateParams & { limit?: number }): Promise<CustomersReport> {
  const response = await apiClient.get<CustomersReport>('/reports/customers', { params })
  return response.data
}

// ─── Corte de Caja ────────────────────────────────────────────────────────────

export interface CashSessionReport {
  id: number
  register: { id: number; name: string }
  store: { id: number; name: string } | null
  user: { id: number; name: string }
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
  opening_cash: number
  closing_cash: number | null
  total_entradas: number
  total_salidas: number
  total_ajustes: number
  /** Ventas del turno sin filtrar por método: efectivo, tarjeta, etc. */
  total_sales: number
  /** Parte de las ventas que sí entró físicamente a caja (no tarjeta). */
  total_cash_sales: number
  /** Anticipos/liquidaciones de preventa cobrados en la ventana del corte. */
  total_pre_sale_payments: number
  /** Parte de las preventas cobradas que sí entró a caja (no tarjeta). */
  total_cash_pre_sale_payments: number
  /** Dinero físico esperado por cobros (ventas + preventas no-tarjeta). */
  cash_collected: number
  sales_count: number
  expected_cash: number
  /** closing_cash - expected_cash. null si caja aún abierta. */
  difference: number | null
}

export interface CashReport {
  period: { from: string; to: string }
  summary: {
    total_sessions: number
    total_sales: number
    total_cash_collected: number
    total_pre_sale_payments: number
    total_entradas: number
    total_salidas: number
  }
  sessions: CashSessionReport[]
}

export async function getCashReport(params?: ReportDateParams & { register_id?: number; user_id?: number }): Promise<CashReport> {
  const response = await apiClient.get<CashReport>('/reports/cash', { params })
  return response.data
}

// ─── Desglose de un corte (tickets + preventa + movimientos) ────────────────

export interface CashTicketItem {
  name: string
  sku: string | null
  quantity: number
  price: number
  total: number
}

export interface CashTicket {
  id: number
  sold_at: string | null
  cashier: string | null
  customer: string | null
  status: string
  cancellation_status: string | null
  subtotal: number
  discount: number
  total: number
  items: CashTicketItem[]
  payments: { method: string; amount: number }[]
}

export interface CashSessionDetail {
  session: {
    id: number
    register: string | null
    store: string | null
    user: string | null
    status: string
    opened_at: string | null
    closed_at: string | null
    opening_cash: number
    closing_cash: number | null
  }
  tickets: CashTicket[]
  pre_sale_payments: { id: number; folio: string; status: string; method: string; amount: number; created_at: string }[]
  movements: { id: number; type: string; amount: number; description: string | null; created_at: string }[]
}

/** GET /reports/cash/{sessionId}/detail — desglose completo del corte. */
export async function getCashSessionDetail(sessionId: number): Promise<CashSessionDetail> {
  const response = await apiClient.get<CashSessionDetail>(`/reports/cash/${sessionId}/detail`)
  return response.data
}
