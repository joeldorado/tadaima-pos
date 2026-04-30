import { apiClient } from './client'

export interface PaymentMethod {
  id: number
  name: string
  active: boolean
  created_at: string
  updated_at: string | null
}

export interface CreatePaymentMethodPayload {
  name: string
  active?: boolean
}

export interface UpdatePaymentMethodPayload {
  name?: string
  active?: boolean
}

export async function getPaymentMethods(params?: { active?: boolean }): Promise<PaymentMethod[]> {
  const response = await apiClient.get<PaymentMethod[]>('/payment-methods', { params })
  return response.data
}

export async function createPaymentMethod(payload: CreatePaymentMethodPayload): Promise<PaymentMethod> {
  const response = await apiClient.post<PaymentMethod>('/payment-methods', payload)
  return response.data
}

export async function updatePaymentMethod(id: number, payload: UpdatePaymentMethodPayload): Promise<PaymentMethod> {
  const response = await apiClient.put<PaymentMethod>(`/payment-methods/${id}`, payload)
  return response.data
}
