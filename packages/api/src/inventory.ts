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

export interface MoveInventoryInput {
  product_id: number
  /** Almacén origen (ej. Bodega). */
  from_warehouse_id: number
  /** Almacén destino (ej. Exhibición). Debe ser de la MISMA tienda. */
  to_warehouse_id: number
  quantity: number
  notes?: string
}

/**
 * Mueve stock de un producto entre dos almacenes de la misma tienda
 * (Exhibición ↔ Bodega). Para mover entre tiendas distintas usar Traslados.
 */
export async function moveInventory(input: MoveInventoryInput): Promise<InventoryItem> {
  const response = await apiClient.post<InventoryItem>('/inventory/move', input)
  return response.data
}
