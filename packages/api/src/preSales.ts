import { apiClient } from './client'
import type {
  PreSale,
  PreSalePayment,
  CreatePreSaleInput,
  AddPreSalePaymentInput,
  UpdatePreSaleStatusInput,
  GetPreSalesParams,
  PaginatedResponse,
} from './types'

/**
 * Lista de preventas/apartados.
 * GET /pre-sales
 */
export async function getPreSales(
  params?: GetPreSalesParams
): Promise<PaginatedResponse<PreSale>> {
  const response = await apiClient.get<PaginatedResponse<PreSale> | PreSale[]>(
    '/pre-sales',
    { params }
  )
  const raw = response.data

  if (Array.isArray(raw)) {
    return { data: raw, current_page: 1, last_page: 1, per_page: raw.length, total: raw.length }
  }
  return raw
}

/**
 * Detalle de una preventa con items, pagos y logs.
 * GET /pre-sales/{id}
 */
export async function getPreSale(id: number): Promise<PreSale> {
  const response = await apiClient.get<PreSale>(`/pre-sales/${id}`)
  return response.data
}

/**
 * Crea una nueva preventa y reserva el inventario.
 * POST /pre-sales
 */
export async function createPreSale(input: CreatePreSaleInput): Promise<PreSale> {
  const response = await apiClient.post<PreSale>('/pre-sales', input)
  return response.data
}

/**
 * Elimina una preventa (solo en estado live o cancelled).
 * DELETE /pre-sales/{id}
 */
export async function deletePreSale(id: number): Promise<void> {
  await apiClient.delete(`/pre-sales/${id}`)
}

/**
 * Actualiza datos de una preventa (producto, fechas, montos).
 * PUT /pre-sales/{id}
 */
export async function updatePreSale(
  id: number,
  input: Partial<CreatePreSaleInput>
): Promise<PreSale> {
  const response = await apiClient.put<PreSale>(`/pre-sales/${id}`, input)
  return response.data
}

/**
 * Cambia el status de una preventa.
 * PATCH /pre-sales/{id}/status
 *
 * Transiciones válidas:
 *  live → ready | completed | cancelled
 *  ready → completed | cancelled
 */
export async function updatePreSaleStatus(
  id: number,
  input: UpdatePreSaleStatusInput
): Promise<PreSale> {
  const response = await apiClient.patch<PreSale>(`/pre-sales/${id}/status`, input)
  return response.data
}

/**
 * Registra un abono a una preventa.
 * POST /pre-sales/{id}/payments
 *
 * El backend aplica el pago, recalcula paid_amount y balance,
 * y si balance <= 0 cambia el status a 'ready' automáticamente.
 */
export async function addPreSalePayment(
  id: number,
  input: AddPreSalePaymentInput
): Promise<PreSale> {
  const response = await apiClient.post<PreSale>(`/pre-sales/${id}/payments`, input)
  return response.data
}

/**
 * Lista los pagos registrados de una preventa.
 * GET /pre-sales/{id}/payments
 */
export async function getPreSalePayments(id: number): Promise<PreSalePayment[]> {
  const response = await apiClient.get<PreSalePayment[]>(`/pre-sales/${id}/payments`)
  const raw = response.data
  return Array.isArray(raw) ? raw : []
}

/**
 * Admin: marca llegada del producto, asigna cantidades por tienda, activa deadline.
 * PATCH /pre-sales/{id}/assign-inventory
 */
export async function assignPreSaleInventory(
  id: number,
  input: import('./types').AssignInventoryInput
): Promise<PreSale> {
  const response = await apiClient.patch<PreSale>(`/pre-sales/${id}/assign-inventory`, input)
  return response.data
}

/**
 * Admin: crea producto real desde datos de la preventa + campos adicionales.
 * POST /pre-sales/{id}/create-product
 */
export async function createProductFromPreSale(
  id: number,
  input: import('./types').CreateProductFromPreSaleInput
): Promise<{ pre_sale: PreSale; product_id: number }> {
  const response = await apiClient.post<{ pre_sale: PreSale; product_id: number }>(
    `/pre-sales/${id}/create-product`,
    input
  )
  return response.data
}

/**
 * Sube o reemplaza la imagen de portada de una preventa sin producto asociado.
 * POST /pre-sales/{id}/image/upload (multipart/form-data)
 */
export async function uploadPreSaleImage(
  id: number,
  file: File
): Promise<{ image_path: string; url: string }> {
  const form = new FormData()
  form.append('image', file)
  const response = await apiClient.post<{ image_path: string; url: string }>(
    `/pre-sales/${id}/image/upload`,
    form
  )
  return response.data
}

/**
 * Admin: expira una preventa no reclamada y mueve el stock a inventario real.
 * PATCH /pre-sales/{id}/expire-to-inventory
 */
export async function expirePreSaleToInventory(
  id: number,
  input: import('./types').ExpireToInventoryInput
): Promise<PreSale> {
  const response = await apiClient.patch<PreSale>(`/pre-sales/${id}/expire-to-inventory`, input)
  return response.data
}

/**
 * Marca un item de preventa como entregado o pendiente.
 * PATCH /pre-sales/{preSaleId}/items/{itemId}/deliver
 */
export async function markPreSaleItemDelivered(
  preSaleId: number,
  itemId: number,
  status: 'pending' | 'delivered'
): Promise<{ id: number; status: 'pending' | 'delivered' }> {
  const response = await apiClient.patch<{ id: number; status: 'pending' | 'delivered' }>(
    `/pre-sales/${preSaleId}/items/${itemId}/deliver`,
    { status }
  )
  return response.data
}
