import { apiClient } from './client'
import type { Warehouse } from './types'

export interface GetWarehousesParams {
  company_id?: number
  store_id?: number
  type?: 'central' | 'store'
  active?: boolean
}

export interface CreateWarehouseInput {
  company_id: number
  store_id?: number
  name: string
  type?: 'central' | 'store'
  description?: string
  active?: boolean
}

export async function getWarehouses(params?: GetWarehousesParams): Promise<Warehouse[]> {
  const response = await apiClient.get<Warehouse[]>('/warehouses', { params })
  return response.data
}

export interface UpdateWarehouseInput {
  name?: string
  type?: 'central' | 'store'
  description?: string
  active?: boolean
}

export async function createWarehouse(input: CreateWarehouseInput): Promise<Warehouse> {
  const response = await apiClient.post<Warehouse>('/warehouses', input)
  return response.data
}

export async function updateWarehouse(id: number, input: UpdateWarehouseInput): Promise<Warehouse> {
  const response = await apiClient.put<Warehouse>(`/warehouses/${id}`, input)
  return response.data
}

export async function deleteWarehouse(id: number): Promise<void> {
  await apiClient.delete(`/warehouses/${id}`)
}
