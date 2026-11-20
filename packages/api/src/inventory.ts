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
  /** Ordena por el stock de exhibición de esta tienda. */
  primary_store_id?: number
  /** Segunda tienda para ordenar por diferencia (primary − compare). */
  compare_store_id?: number
  /** desc = primary tiene más primero (default), asc = compare tiene más primero. */
  sort_dir?: 'asc' | 'desc'
  /** Filtra por categoría de producto. */
  category_id?: number
  /** Operador para filtrar stock de la tienda primaria: '<' | '=' | '>'. */
  primary_stock_op?: '<' | '=' | '>'
  /** Cantidad a comparar para la tienda primaria (entero ≥ 0). */
  primary_stock_qty?: number
  /** Operador para filtrar stock de la tienda de comparación: '<' | '=' | '>'. */
  compare_stock_op?: '<' | '=' | '>'
  /** Cantidad a comparar para la tienda de comparación (entero ≥ 0). */
  compare_stock_qty?: number
  /** Filtrar por tipo de producto: 'product' | 'manga' | 'bundle'. Sin valor = todos. */
  product_type?: 'product' | 'manga' | 'bundle'
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

// ─── Historial de stock (2026-11-19) ─────────────────────────────────────────
// Módulo propio: GET /products/{id}/stock-history. GET /inventory/movements no
// cambia (lo usa la app móvil).

/** Tipos que escribe el sistema en `inventory_movements`. */
export type InventoryMovementType =
  | 'entrada' | 'venta' | 'ajuste' | 'transferencia' | 'devolucion'
  | 'preventa' | 'preventa_cancelada' | 'apartado' | 'apartado_cancelado'

export interface StockHistoryMovement {
  id: number
  /** Tipo crudo; puede venir uno que el front aún no conoce. */
  type: InventoryMovementType | (string & {})
  /** Cantidad tal como se guardó (en ventas y apartados viene positiva). */
  quantity: number
  /** Cambio REAL al stock, con signo (InventoryMovement::stockDelta del backend). */
  stock_delta: number
  reference: string | null
  notes: string | null
  warehouse_id: number | null
  warehouse: {
    id: number
    name: string
    type: 'central' | 'store' | 'bodega' | (string & {})
    store_id: number | null
    store_name: string | null
  } | null
  user: { id: number; name: string } | null
  /** ISO UTC. */
  created_at: string | null
}

/** Stock actual de un almacén (punto de partida del saldo hacia atrás). */
export interface WarehouseCurrentStock {
  warehouse_id: number
  warehouse_name: string | null
  warehouse_type: string | null
  store_id: number | null
  store_name: string | null
  quantity: number
}

export interface ProductStockHistoryParams {
  /** Solo el admin elige; gerente y cajero quedan en su tienda (otra → 403). */
  store_id?: number
  warehouse_id?: number
  /** YYYY-MM-DD, día de negocio (America/Tijuana). */
  from?: string
  to?: string
  page?: number
  /** Máx. 500. */
  per_page?: number
}

export interface ProductStockHistoryPage {
  data: StockHistoryMovement[]
  pagination: { total: number; per_page: number; current_page: number; last_page: number }
  /** Stock actual por almacén, con los mismos filtros de tienda y almacén. */
  current_stock: WarehouseCurrentStock[]
}

/**
 * GET /products/{productId}/stock-history: movimientos de stock del producto o
 * tomo (el más nuevo primero), paginados, más el stock actual por almacén.
 */
export async function getProductStockHistory(
  productId: number,
  params: ProductStockHistoryParams,
): Promise<ProductStockHistoryPage> {
  const response = await apiClient.get<ProductStockHistoryPage>(`/products/${productId}/stock-history`, { params })
  return response.data
}
