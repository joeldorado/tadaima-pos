import { apiClient } from './client'
import type { CreateProductInput, UpdateProductInput, PaginatedResponse, Product } from './types'

export interface GetProductsParams {
  page?: number
  per_page?: number
  search?: string
  category_id?: number
  active?: boolean
  store_id?: number
}

/**
 * Obtiene la lista de productos.
 * GET /products — todos los params son opcionales.
 *
 * El backend devuelve un array plano (usa .items() en el controlador, descartando
 * la metadata de paginación). Se normaliza aquí para que los consumidores siempre
 * reciban PaginatedResponse<Product> independientemente del formato del servidor.
 */
export async function getProducts(
  params?: GetProductsParams
): Promise<PaginatedResponse<Product>> {
  const response = await apiClient.get<PaginatedResponse<Product> | Product[]>('/products', { params })
  const raw = response.data

  // Backend returns a flat array — wrap it in a PaginatedResponse shape
  if (Array.isArray(raw)) {
    return {
      data: raw,
      current_page: 1,
      last_page: 1,
      per_page: raw.length,
      total: raw.length,
    }
  }

  return raw
}

/**
 * Reads price_N from a Product's prices object.
 * Always returns a valid number — 0 if the level is null/undefined.
 *
 * @param product  API Product
 * @param level    Price level 1–5 (default 1 = "Precio A")
 */
export function getPrice(product: Product, level: 1 | 2 | 3 | 4 | 5 = 1): number {
  const key = `price_${level}` as keyof Product['prices']
  return Number(product.prices?.[key] ?? 0) || 0
}

/**
 * Obtiene un producto por ID con precios e inventario.
 * GET /products/{id}
 */
export async function getProduct(id: number): Promise<Product> {
  const response = await apiClient.get<Product>(`/products/${id}`)
  return response.data
}

/**
 * Crea un producto nuevo.
 * POST /products
 */
export async function createProduct(input: CreateProductInput): Promise<Product> {
  const response = await apiClient.post<Product>('/products', input)
  return response.data
}

/**
 * Actualiza un producto existente.
 * PUT /products/{id}
 */
export async function updateProduct(id: number, input: UpdateProductInput): Promise<Product> {
  const response = await apiClient.put<Product>(`/products/${id}`, input)
  return response.data
}

// ─── Store Prices ─────────────────────────────────────────────────────────────

export interface StorePriceRow {
  store_id: number
  store_name: string
  prices: Record<string, number | null>   // "price_1" | "price_2" | "price_3"
}

export async function getStorePrices(productId: number): Promise<StorePriceRow[]> {
  const response = await apiClient.get<StorePriceRow[]>(`/products/${productId}/store-prices`)
  return response.data
}

export async function updateStorePrices(
  productId: number,
  storeId: number,
  prices: { price_1?: number | null; price_2?: number | null; price_3?: number | null }
): Promise<StorePriceRow> {
  const response = await apiClient.put<StorePriceRow>(
    `/products/${productId}/store-prices/${storeId}`,
    prices
  )
  return response.data
}

/**
 * Sube una imagen de producto y la asocia al mismo.
 * POST /products/{id}/images/upload (multipart/form-data)
 */
export async function deleteProduct(id: number): Promise<void> {
  await apiClient.delete(`/products/${id}`)
}

export async function removeProductImage(productId: number, imageId: number): Promise<void> {
  await apiClient.delete(`/products/${productId}/images/${imageId}`)
}

export async function uploadProductImage(
  productId: number,
  file: File
): Promise<{ id: number; image_path: string; url: string }> {
  const form = new FormData()
  form.append('image', file)
  // No explicit Content-Type — the request interceptor deletes it for FormData
  // so the browser sets multipart/form-data with the correct boundary automatically.
  const response = await apiClient.post<{ id: number; image_path: string; url: string }>(
    `/products/${productId}/images/upload`,
    form
  )
  return response.data
}
