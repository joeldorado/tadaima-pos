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
