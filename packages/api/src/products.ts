import { apiClient } from './client'
import type { CreateProductInput, UpdateProductInput, PaginatedResponse, Product } from './types'

export interface GetProductsParams {
  page?: number
  per_page?: number
  search?: string
  category_id?: number
  active?: boolean
  store_id?: number
  /**
   * 'top' ordena por count de sale_items en los últimos 30 días (desc).
   * Útil para pre-cargar el cache con los productos que el cajero más usa.
   */
  sort?: 'top'
  /**
   * Con store_id: incluye también productos "no asignados" (sin inventario en
   * la tienda) con stock 0 + is_assigned=false, para que la sucursal les
   * agregue stock. Sin esta bandera el listado solo trae los asignados.
   */
  include_unassigned?: boolean
  /**
   * Lista de ids separados por coma ("12,45,7"). La Caja la usa para refrescar
   * promos/precios de los productos que ya tiene en el carrito, incluso si
   * caen fuera del pool ?sort=top. Tope de 100 ids en el backend.
   */
  ids?: string
  /** Filtra por tipo — la página Productos separa productos de tomos. */
  type?: 'product' | 'manga'
  /** Sin costo real (cost NULL o <= 0) — chip "Productos sin Costo". */
  no_cost?: boolean
  /** Stock 0 (con store_id: en esa tienda; sin él: global). */
  out_of_stock?: boolean
  /** Stock 1..threshold — chip "Por agotarse". */
  low_stock?: boolean
  /** Umbral de low_stock (default backend: 10). */
  threshold?: number
  /** Con promo vigente (scoped a store_id si viene). */
  has_promo?: boolean
  /**
   * Respuesta { items, pagination } con el TOTAL real del catálogo — para
   * paginación server-side. Opt-in: sin el flag el backend sigue devolviendo
   * el array plano histórico (getProducts normaliza ambos shapes).
   */
  with_meta?: boolean
}

/**
 * Contadores agregados de GET /products/stats — calculados por SQL sobre el
 * catálogo COMPLETO (~14k), no sobre la página cargada.
 * `sin_costo`/`valor_invertido` solo viajan si el usuario puede ver costos
 * (can_view_cost) — por eso son opcionales.
 */
export interface ProductStats {
  total: number
  total_productos: number
  total_mangas: number
  agotados: number
  por_agotarse: number
  /** Umbral usado para por_agotarse (default 10). */
  threshold: number
  con_promo: number
  /** Tienda a la que quedó anclado el cálculo (null = todas). */
  store_id: number | null
  sin_costo?: number
  valor_invertido?: number
}

export interface ProductStatsParams {
  store_id?: number
  type?: 'product' | 'manga'
  threshold?: number
}

/**
 * Contadores reales del catálogo para la página Productos.
 * GET /products/stats
 */
export async function getProductStats(params?: ProductStatsParams): Promise<ProductStats> {
  const response = await apiClient.get<ProductStats>('/products/stats', { params })
  return response.data
}

/**
 * Slim product shape returned by GET /products?light=1.
 * Drops barcode, description, cost, category object, images array, timestamps.
 * Only first image URL is included as the flat `image` field.
 */
export interface ProductLight {
  id: number
  name: string
  sku: string
  barcode: string | null
  active: boolean
  category_id: number | null
  prices: {
    price_1: number | null
    price_2: number | null
    price_3: number | null
    price_4: number | null
    price_5: number | null
  }
  image: string | null
  allow_cash: boolean
  allow_card: boolean
  /** Stock vendible en Caja = Exhibición (con ?store_id). */
  stock_total: number
  /** Stock en Bodega (backstock atrás, no vendible) — para el badge "N en bodega". */
  stock_bodega?: number
  /**
   * Solo con ?store_id. false = el producto no tiene inventario en esta tienda
   * ("No asignado"). undefined en la vista global (sin store_id).
   */
  is_assigned?: boolean
  product_type?: 'product' | 'manga'
  /** Número de tomo (solo mangas) — distingue tomos de la misma serie en Caja. */
  volume_number?: number | null
  /** Promos NxM vigentes (Descuentos v2 Fase 3) — el backend ya las embebe.
   *  Con ?store_id el embed viene FILTRADO a esa tienda (o globales). */
  active_promotions?: { id: number; name: string; type?: 'nxm' | 'qty_discount'; buy_n: number | null; pay_m: number | null; min_qty?: number | null; discount_per_unit?: number | null; allow_cash?: boolean; allow_card?: boolean; priority: number; store_id?: number | null }[]
}

/**
 * Obtiene la lista de productos en formato slim para Caja.
 * ~60% más pequeño que getProducts(). Útil cuando hay miles de productos
 * que el cajero necesita cachear localmente.
 */
export async function getProductsLight(
  params?: Omit<GetProductsParams, 'page' | 'per_page'>
): Promise<PaginatedResponse<ProductLight>> {
  const response = await apiClient.get<PaginatedResponse<ProductLight> | ProductLight[]>('/products', {
    params: { ...params, light: 1, per_page: 0 },
  })
  const raw = response.data
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
 * Primera imagen del producto como data-URL base64. Para el banner de promo:
 * el export PNG (canvas) necesita bytes same-origin — la URL pública de GCS
 * sin CORS taintéa el canvas. 404 si el producto no tiene imagen.
 */
export async function getProductImageBase64(productId: number): Promise<string> {
  const response = await apiClient.get<{ data_url: string }>(`/products/${productId}/image-base64`)
  return response.data.data_url
}

/**
 * Reads price_N from a ProductLight's prices object. Same logic as getPrice
 * for regular Product. Returns 0 if the level is null/undefined.
 */
export function getLightPrice(product: ProductLight, level: 1 | 2 | 3 | 4 | 5 = 1): number {
  const key = `price_${level}` as keyof ProductLight['prices']
  return Number(product.prices?.[key] ?? 0) || 0
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
  const response = await apiClient.get<
    PaginatedResponse<Product> | Product[] | { items: Product[]; pagination: { total: number; per_page: number; current_page: number; last_page: number } }
  >('/products', { params })
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

  // ?with_meta=1 → { items, pagination } con el TOTAL real (paginación server
  // de la página Productos). El resto de consumidores no manda el flag y sigue
  // cayendo en la rama del array plano.
  if ('items' in raw && Array.isArray(raw.items)) {
    return { data: raw.items, ...raw.pagination }
  }

  // TS no reduce del todo el union tras los dos checks anteriores (interfaces
  // planas sin index signature) — en este punto solo puede ser PaginatedResponse.
  return raw as PaginatedResponse<Product>
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

export async function forceDeleteProduct(id: number): Promise<void> {
  await apiClient.delete(`/products/${id}/force`)
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
