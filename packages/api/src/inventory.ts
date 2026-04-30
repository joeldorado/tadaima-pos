import { apiClient } from './client'
import type { InventoryItem, UpdateInventoryInput } from './types'

export interface GetInventoryParams {
  product_id?: number
  warehouse_id?: number
}

export async function getInventory(params?: GetInventoryParams): Promise<InventoryItem[]> {
  const response = await apiClient.get<InventoryItem[]>('/inventory', { params })
  return response.data
}

export async function updateInventory(
  productId: number,
  warehouseId: number,
  input: UpdateInventoryInput,
): Promise<InventoryItem> {
  const response = await apiClient.put<InventoryItem>(`/inventory/${productId}/${warehouseId}`, input)
  return response.data
}
