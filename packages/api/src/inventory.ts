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

/**
 * Existencias cross-tienda de un producto (solo cantidades + contacto).
 * Exclusivo de la pantalla "Existencias por Tienda" — cualquier rol autenticado,
 * sin filtro de tienda del usuario, sin costos ni datos financieros.
 */
export async function getProductStockByStore(productId: number): Promise<InventoryItem[]> {
  const response = await apiClient.get<InventoryItem[]>(`/inventory/by-product/${productId}`)
  return response.data
}

export interface ProductStockStore {
  store_id: number
  store_name: string
  phone: string | null
  exhibicion: number
  bodega: number
}

export interface ProductStockItem {
  id: number
  name: string
  sku: string | null
  image: string | null
  stock: ProductStockStore[]
}

export interface ProductsStockParams {
  search?: string
  page?: number
  per_page?: number
}

export interface ProductsStockResponse {
  data: ProductStockItem[]
  pagination: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

/**
 * Lista paginada de productos con sus existencias por tienda embebidas.
 * Cualquier rol autenticado, sin filtro de tienda, sin costos.
 * Usado por la pantalla "Existencias por Tienda" para mostrar el listado
 * completo sin necesidad de seleccionar un producto primero.
 */
export async function getProductsStock(params?: ProductsStockParams): Promise<ProductsStockResponse> {
  const response = await apiClient.get<ProductsStockResponse>('/inventory/products-stock', { params })
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
