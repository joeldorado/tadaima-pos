import { apiClient } from './client'

export interface CatalogProductItem {
  id: number
  name: string
  description: string | null
  category: { id: number; name: string } | null
  images: Array<{ id: number; path: string | null; sort_order: number }>
  price?: number
  stock?: number
}

export interface CatalogProductsResponse {
  data: Array<{
    catalog_product_id: number
    visible: boolean
    added_at: string | null
    product: {
      id: number
      name: string
      sku: string
      description: string | null
      active: boolean
      category: { id: number; name: string } | null
      price_1: number | null
      images: Array<{ id: number; path: string | null; sort_order: number }>
    }
  }>
  pagination: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

export interface PublicCatalogResponse {
  store: { id: number; name: string }
  catalog: {
    show_price: boolean
    show_stock: boolean
    show_search: boolean
    show_categories: boolean
    show_description: boolean
    cart_enabled: boolean
    hide_out_of_stock: boolean
    /** Número al que se envían los pedidos del carrito (fallback al teléfono de la tienda). null si ninguno. */
    whatsapp_number: string | null
  }
  data: CatalogProductItem[]
  pagination: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

export interface CatalogProductsParams {
  visible?: boolean
  per_page?: number
  page?: number
}

export interface PublicCatalogParams {
  search?: string
  category_id?: number
  per_page?: number
  page?: number
}

export async function getCatalogProducts(
  storeId: number,
  params?: CatalogProductsParams
): Promise<CatalogProductsResponse> {
  const response = await apiClient.get<CatalogProductsResponse>(`/catalog/products/${storeId}`, { params })
  return response.data
}

export async function addCatalogProduct(
  storeId: number,
  payload: { product_id: number; visible?: boolean }
): Promise<CatalogProductsResponse['data'][number]> {
  const response = await apiClient.post<CatalogProductsResponse['data'][number]>(`/catalog/products/${storeId}`, payload)
  return response.data
}

export async function updateCatalogProduct(
  storeId: number,
  productId: number,
  payload: { visible: boolean }
): Promise<CatalogProductsResponse['data'][number]> {
  const response = await apiClient.put<CatalogProductsResponse['data'][number]>(
    `/catalog/products/${storeId}/${productId}`,
    payload
  )
  return response.data
}

export async function removeCatalogProduct(storeId: number, productId: number): Promise<void> {
  await apiClient.delete(`/catalog/products/${storeId}/${productId}`)
}

export async function getPublicCatalog(
  catalogUrl: string,
  params?: PublicCatalogParams
): Promise<PublicCatalogResponse> {
  const response = await apiClient.get<PublicCatalogResponse>(`/public/catalog/${catalogUrl}`, { params })
  return response.data
}

// ─── Catálogo global v2 (de cadena, por inventario) ────────────────────────────

/** Existencias de un producto en una sucursal + su WhatsApp de pedidos. */
export interface CatalogStoreStock {
  store_id: number
  store_name: string
  qty: number
  whatsapp: string | null
}

export interface GlobalCatalogItem {
  id: number
  name: string
  /** 'manga' (librería) | 'product' (general) — usado para las secciones del catálogo. */
  product_type: string
  description: string | null
  category: { id: number; name: string } | null
  images: Array<{ id: number; path: string | null; sort_order: number }>
  price?: number
  /** Desglose de stock vendible por sucursal (solo las que tienen existencia). */
  stores: CatalogStoreStock[]
  total: number
  /** Promos NxM vigentes (globales o por tienda; store_id null = todas). */
  active_promotions?: Array<{
    id: number
    name: string
    buy_n: number
    pay_m: number
    ends_at: string | null
    store_id: number | null
  }>
}

export interface GlobalCatalogResponse {
  catalog: {
    show_price: boolean
    show_stock: boolean
    show_search: boolean
    show_categories: boolean
    show_description: boolean
    cart_enabled: boolean
    hide_out_of_stock: boolean
  }
  data: GlobalCatalogItem[]
  pagination: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

export async function getGlobalCatalog(
  params?: PublicCatalogParams
): Promise<GlobalCatalogResponse> {
  const response = await apiClient.get<GlobalCatalogResponse>('/public/catalog', { params })
  return response.data
}
