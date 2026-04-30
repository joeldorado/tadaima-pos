import { apiClient } from './client'

export interface Supplier {
  id: number
  name: string
  active: boolean
  created_at: string
  updated_at: string
}

export async function getSuppliers(params?: { active?: boolean }): Promise<Supplier[]> {
  const response = await apiClient.get<Supplier[]>('/suppliers', { params })
  return response.data
}

export async function createSupplier(payload: { name: string; active?: boolean }): Promise<Supplier> {
  const response = await apiClient.post<Supplier>('/suppliers', payload)
  return response.data
}

export async function updateSupplier(id: number, payload: { name?: string; active?: boolean }): Promise<Supplier> {
  const response = await apiClient.put<Supplier>(`/suppliers/${id}`, payload)
  return response.data
}

export async function deleteSupplier(id: number): Promise<void> {
  await apiClient.delete(`/suppliers/${id}`)
}
