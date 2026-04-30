import { apiClient } from './client'
import type {
  Layaway,
  LayawayPayment,
  LayawayListResponse,
  CreateLayawayPayload,
  AddLayawayPaymentPayload,
  UpdateLayawayPayload,
  LayawayPaymentResponse,
} from './types'

export async function getLayaways(params?: {
  store_id?: number
  customer_id?: number
  product_id?: number
  status?: 'active' | 'paid' | 'delivered' | 'cancelled' | 'expired' | 'open'
  code?: string
  from?: string
  to?: string
  per_page?: number
  page?: number
}): Promise<LayawayListResponse> {
  const response = await apiClient.get<LayawayListResponse>('/layaways', { params })
  return response.data
}

export async function getLayaway(id: number): Promise<Layaway> {
  const response = await apiClient.get<Layaway>(`/layaways/${id}`)
  return response.data
}

export async function getLayawaysByProduct(
  productId: number,
  params?: { store_id?: number }
): Promise<Layaway[]> {
  const response = await apiClient.get<Layaway[]>(`/layaways/by-product/${productId}`, { params })
  return response.data
}

export async function createLayaway(payload: CreateLayawayPayload): Promise<Layaway> {
  const response = await apiClient.post<Layaway>('/layaways', payload)
  return response.data
}

export async function updateLayaway(id: number, payload: UpdateLayawayPayload): Promise<Layaway> {
  const response = await apiClient.patch<Layaway>(`/layaways/${id}`, payload)
  return response.data
}

export async function deliverLayaway(id: number): Promise<unknown> {
  const response = await apiClient.patch(`/layaways/${id}/status`, { status: 'delivered' })
  return response.data
}

export async function cancelLayaway(id: number, notes?: string): Promise<Layaway> {
  const response = await apiClient.patch<Layaway>(`/layaways/${id}/status`, {
    status: 'cancelled',
    notes,
  })
  return response.data
}

export async function addLayawayPayment(
  layawayId: number,
  payload: AddLayawayPaymentPayload
): Promise<LayawayPaymentResponse> {
  const response = await apiClient.post<LayawayPaymentResponse>(
    `/layaways/${layawayId}/payments`,
    payload
  )
  return response.data
}

export async function getLayawayPayments(layawayId: number): Promise<{
  payments: LayawayPayment[]
  total: number
  paid_amount: number
  balance: number
}> {
  const response = await apiClient.get(`/layaways/${layawayId}/payments`)
  return response.data
}
