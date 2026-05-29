import { apiClient } from './client'
import type { CreateSaleInput, Sale, SaleDetail, GetSalesParams, PaginatedResponse } from './types'

/**
 * Lista de ventas con filtros opcionales.
 * GET /sales
 */
export async function getSales(
  params?: GetSalesParams
): Promise<PaginatedResponse<SaleDetail>> {
  const response = await apiClient.get<PaginatedResponse<SaleDetail> | SaleDetail[]>(
    '/sales',
    { params }
  )
  const raw = response.data

  if (Array.isArray(raw)) {
    return { data: raw, current_page: 1, last_page: 1, per_page: raw.length, total: raw.length }
  }
  return raw
}

/**
 * Detalle de una venta con items y pagos.
 * GET /sales/{id}
 */
export async function getSale(id: number): Promise<SaleDetail> {
  const response = await apiClient.get<SaleDetail>(`/sales/${id}`)
  return response.data
}

/**
 * Convierte un draft en venta real (checkout).
 * POST /sales
 */
export async function createSale(input: CreateSaleInput): Promise<Sale> {
  const response = await apiClient.post<Sale>('/sales', input)
  return response.data
}

/**
 * Marca una venta como devuelta y restaura el inventario.
 * POST /sales/{id}/return
 */
export async function returnSale(id: number): Promise<SaleDetail> {
  const response = await apiClient.post<SaleDetail>(`/sales/${id}/return`)
  return response.data
}

// ─── ADR-016: cancelación ────────────────────────────────────────────────────

export type CancellationReason =
  | 'cliente_devuelve'
  | 'error_cajero'
  | 'dañado'
  | 'no_llego'
  | 'otro'

export interface CancelSaleInput {
  /** Items específicos a cancelar. Vacío/omitido = cancelación total. */
  items?: Array<{ sale_item_id: number; quantity: number }>
  reason_code: CancellationReason
  reason_text?: string
  /** Sesión activa donde se registra la salida de caja. */
  cash_session_id?: number
}

export interface CancellationResult {
  sale?: SaleDetail
  cancellation: {
    id: number
    mode: 'full' | 'partial_items' | 'liquidation_rollback'
    amount_refunded: number
    cash_movement_id: number | null
  }
}

/**
 * POST /sales/{id}/cancel — ADR-016. Cancela toda la venta o items específicos.
 * Restaura stock, crea cash_movement salida, registra log con motivo.
 */
export async function cancelSale(id: number, input: CancelSaleInput): Promise<CancellationResult> {
  const response = await apiClient.post<CancellationResult>(`/sales/${id}/cancel`, input)
  return response.data
}
