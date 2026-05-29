import { apiClient } from './client'
import type {
  PreSaleOrder,
  PreSaleOrderItem,
  PreSaleOrderPayment,
  PreSaleOrderListResponse,
  GetPreSaleOrdersParams,
  CreatePreSaleOrderInput,
  AddPreSaleOrderPaymentInput,
  UpdatePreSaleOrderStatusInput,
} from './types'

/**
 * Lista de folios de preventa.
 * GET /pre-sale-orders
 *
 * Filtros: store_id, customer_id, status, code, from, to, per_page
 */
export async function getPreSaleOrders(
  params?: GetPreSaleOrdersParams
): Promise<PreSaleOrderListResponse> {
  const response = await apiClient.get<PreSaleOrderListResponse>(
    '/pre-sale-orders',
    { params }
  )
  return response.data
}

/**
 * Detalle completo de un folio con ítems, pagos y logs.
 * GET /pre-sale-orders/{id}
 */
export async function getPreSaleOrder(id: number): Promise<PreSaleOrder> {
  const response = await apiClient.get<PreSaleOrder>(`/pre-sale-orders/${id}`)
  return response.data
}

/**
 * Crea un nuevo folio de preventa.
 * POST /pre-sale-orders
 *
 * customer_id es requerido por diseño — no existe folio sin cliente.
 * Valida preorder_limit por catálogo y congela unit_price al precio elegido.
 */
export async function createPreSaleOrder(
  input: CreatePreSaleOrderInput
): Promise<PreSaleOrder> {
  const response = await apiClient.post<PreSaleOrder>('/pre-sale-orders', input)
  return response.data
}

/**
 * Registra un abono o anticipo adicional en el folio.
 * POST /pre-sale-orders/{id}/payments
 */
export async function addPreSaleOrderPayment(
  id: number,
  input: AddPreSaleOrderPaymentInput
): Promise<PreSaleOrderPayment> {
  const response = await apiClient.post<PreSaleOrderPayment>(
    `/pre-sale-orders/${id}/payments`,
    input
  )
  return response.data
}

/**
 * Transiciona el status del folio.
 * PATCH /pre-sale-orders/{id}/status
 *
 * Transiciones válidas:
 *   pending → ready     (admin: mercancía llegó)
 *   ready   → delivered (cajero: liquidación y entrega)
 *   pending | ready → expired   (vencimiento de fecha límite)
 *   pending | ready → cancelled (cancelación manual)
 */
export async function updatePreSaleOrderStatus(
  id: number,
  input: UpdatePreSaleOrderStatusInput
): Promise<PreSaleOrder> {
  const response = await apiClient.patch<PreSaleOrder>(
    `/pre-sale-orders/${id}/status`,
    input
  )
  return response.data
}

/**
 * Toggles a single item's delivery status (pending ↔ delivered).
 * PATCH /pre-sale-orders/{id}/items/{itemId}/deliver
 */
export async function markPreSaleOrderItemDelivered(
  orderId: number,
  itemId: number,
  status: 'pending' | 'delivered'
): Promise<PreSaleOrderItem> {
  const response = await apiClient.patch<PreSaleOrderItem>(
    `/pre-sale-orders/${orderId}/items/${itemId}/deliver`,
    { status }
  )
  return response.data
}

// ─── ADR-016: cancelación de preventa ────────────────────────────────────────

export interface CancelPreSaleOrderInput {
  mode: 'full' | 'liquidation_rollback'
  reason_code: 'cliente_devuelve' | 'error_cajero' | 'dañado' | 'no_llego' | 'otro'
  reason_text?: string
  cash_session_id?: number
}

export interface CancelPreSaleOrderResult {
  order: PreSaleOrder
  cancellation: {
    id: number
    mode: 'full' | 'liquidation_rollback'
    amount_refunded: number
    cash_movement_id: number | null
  }
}

/**
 * POST /pre-sale-orders/{id}/cancel — ADR-016.
 * - mode='full' → cancela todo el folio, reversa todos los pagos.
 * - mode='liquidation_rollback' → delivered → ready, reversa solo último pago.
 */
export async function cancelPreSaleOrder(
  id: number,
  input: CancelPreSaleOrderInput
): Promise<CancelPreSaleOrderResult> {
  const response = await apiClient.post<CancelPreSaleOrderResult>(
    `/pre-sale-orders/${id}/cancel`,
    input
  )
  return response.data
}
