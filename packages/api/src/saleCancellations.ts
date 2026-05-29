import { apiClient } from './client'
import type { CancellationReason } from './sales'

export interface SaleCancellationItemSnapshot {
  sale_item_id?: number
  pre_sale_order_item_id?: number
  product_id: number | null
  name: string
  sku?: string | null
  qty_cancelled: number
  price: number
  cost: number | null
  line_total: number
  was_delivered?: boolean
}

export interface SaleCancellation {
  id: number
  sale_id: number | null
  pre_sale_order_id: number | null
  mode: 'full' | 'partial_items' | 'liquidation_rollback'
  reason_code: CancellationReason
  reason_text: string | null
  amount_refunded: number
  cash_movement_id: number | null
  cash_session_id: number | null
  items_snapshot: SaleCancellationItemSnapshot[]
  cancelled_at: string
  cancelled_by?: { id: number; name: string }
  sale?: {
    id: number
    store_id: number | null
    status: string
    cancellation_status: string
    total: number
    sold_at: string | null
  }
  pre_sale_order?: {
    id: number
    code: string
    store_id: number | null
    status: string
    cancellation_status: string
  }
}

export interface GetSaleCancellationsParams {
  from?: string
  to?: string
  store_id?: number
  reason_code?: CancellationReason
  cancelled_by?: number
  per_page?: number
  page?: number
}

export interface SaleCancellationListResponse {
  data: SaleCancellation[]
  pagination: {
    current_page: number
    last_page: number
    total: number
    per_page: number
  }
}

/** GET /sale-cancellations — listado del log de cancelaciones con filtros. */
export async function getSaleCancellations(
  params?: GetSaleCancellationsParams,
): Promise<SaleCancellationListResponse> {
  const response = await apiClient.get<SaleCancellationListResponse>('/sale-cancellations', { params })
  return response.data
}
