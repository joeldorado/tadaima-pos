import { apiClient } from './client'
import type { Store } from './types'

export interface GetStoresParams {
  company_id?: number
  active?: boolean
}

export interface CreateStoreInput {
  company_id: number
  name: string
  address?: string
  phone?: string
  email?: string
  manager_id?: number
  active?: boolean
}

export interface UpdateStoreInput {
  name?: string
  address?: string
  phone?: string
  email?: string
  manager_id?: number
  active?: boolean
}

export async function getStores(params?: GetStoresParams): Promise<Store[]> {
  const response = await apiClient.get<Store[]>('/stores', { params })
  return response.data
}

export async function createStore(input: CreateStoreInput): Promise<Store> {
  const response = await apiClient.post<Store>('/stores', input)
  return response.data
}

export async function updateStore(id: number, input: UpdateStoreInput): Promise<Store> {
  const response = await apiClient.put<Store>(`/stores/${id}`, input)
  return response.data
}
