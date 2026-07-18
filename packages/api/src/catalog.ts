import { apiClient } from './client'

export interface CatalogProductItem {
  id: number
  name: string
  description: string | null
  category: { id: number; name: string } | null
  images: Array<{ id: number; path: string | null; url?: string | null; sort_order: number }>
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
  /** 'featured' antepone destacados server-side (Catálogo v3). */
  sort?: 'featured'
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
  /** Destacado por el admin (Catálogo v3). Opcional: tolera API previa al rollout. */
  featured?: boolean
  /**
   * Puesto en el "top" manual del admin (Catálogo v5); null = sin acomodar.
   * Opcional: tolera API previa al rollout.
   */
  catalog_position?: number | null
  category: { id: number; name: string } | null
  /** `url` = URL absoluta lista para usar (GCS en prod). `path` queda como fallback legacy. */
  images: Array<{ id: number; path: string | null; url?: string | null; sort_order: number }>
  price?: number
  /** Desglose de stock vendible por sucursal (solo las que tienen existencia). */
  stores: CatalogStoreStock[]
  total: number
  /** Promos vigentes (globales o por tienda; store_id null = todas). */
  active_promotions?: Array<{
    id: number
    name: string
    /** 'nxm' (2x1) | 'qty_discount' (escalones por cantidad). */
    type?: 'nxm' | 'qty_discount'
    buy_n: number | null
    pay_m: number | null
    tiers?: Array<{ qty: number; amount: number }> | null
    ends_at: string | null
    store_id: number | null
  }>
}

// ─── Catálogo v3: apariencia (tema/redes) + footer con sucursales ─────────────

export type CatalogThemeSlug = 'tadaima' | 'gradient' | 'navidad' | 'halloween' | 'patrio' | 'muertos'
export type CatalogSortDefault = 'new' | 'featured'

/**
 * Catálogo v4 — el fondo es un eje INDEPENDIENTE del tema: el tema pone el
 * color, el fondo pone el efecto. `null` = sin configurar, lo decide el tema.
 */
export type CatalogBackgroundSlug = 'shader' | 'gradient' | 'galaxy'

/** Catálogo v4 — acomodo de la tienda pública. */
export type CatalogLayoutSlug = 'classic' | 'sidebar' | 'masonry'

/** URLs de redes sociales del footer — solo se pintan las no vacías. */
export interface CatalogSocials {
  instagram?: string
  facebook?: string
  tiktok?: string
  x?: string
  youtube?: string
  discord?: string
}

export interface CatalogAppearance {
  theme: CatalogThemeSlug
  socials: CatalogSocials
  description: string | null
  /** Opcionales: toleran una API previa al rollout de Catálogo v4. */
  background?: CatalogBackgroundSlug | null
  layout?: CatalogLayoutSlug
}

export interface CatalogFooterStore {
  id: number
  name: string
  /** null cuando catalog_show_address está apagado (o la tienda no tiene). */
  address: string | null
  /** null cuando catalog_show_contact está apagado. */
  phone: string | null
  whatsapp: string | null
}

export interface CatalogFooterData {
  show_stores: boolean
  show_address: boolean
  show_contact: boolean
  stores: CatalogFooterStore[]
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
    /** Orden de entrada del catálogo (configurable en admin). Opcional: rollout. */
    default_sort?: CatalogSortDefault
  }
  /** Opcionales: toleran una API previa al rollout de Catálogo v3. */
  appearance?: CatalogAppearance
  footer?: CatalogFooterData
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

// ─── Catálogo v3: flags por producto (admin — destacado / oculto) ─────────────

export interface ProductFlagRow {
  id: number
  name: string
  sku: string
  active: boolean
  featured: boolean
  catalog_visible: boolean
  /** Puesto en el "top" manual (Catálogo v5); null = sin acomodar. */
  catalog_position: number | null
  /**
   * Si el producto SÍ se ve hoy en la tienda pública. Esta lista no filtra por
   * active/visible/stock, así que un destacado agotado aparece aquí pero no
   * allá — el panel lo avisa y no lo cuenta para el "top 20".
   */
  in_public_catalog: boolean
  price_1: number | null
  category: { id: number; name: string } | null
  image: string | null
}

export interface ProductFlagsResponse {
  data: ProductFlagRow[]
  pagination: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

export interface ProductFlagsParams {
  search?: string
  filter?: 'all' | 'featured' | 'hidden'
  per_page?: number
  page?: number
}

export async function getCatalogProductFlags(params?: ProductFlagsParams): Promise<ProductFlagsResponse> {
  const response = await apiClient.get<ProductFlagsResponse>('/catalog/product-flags', { params })
  return response.data
}

export async function updateProductFlags(
  productId: number,
  payload: { featured?: boolean; catalog_visible?: boolean }
): Promise<{ id: number; name: string; featured: boolean; catalog_visible: boolean }> {
  const response = await apiClient.put<{ id: number; name: string; featured: boolean; catalog_visible: boolean }>(
    `/catalog/product-flags/${productId}`,
    payload
  )
  return response.data
}

/**
 * Guarda el "top" manual del catálogo (Catálogo v5): la posición de cada
 * producto es su índice en `order`. Se manda la lista COMPLETA de destacados —
 * lo que no venga se desacomoda.
 *
 * Devuelve la lista CANÓNICA (el server descarta ids que ya perdieron la ★);
 * el llamador debe reemplazar su estado con ella en vez de asumir la suya.
 */
export async function reorderFeaturedProducts(order: number[]): Promise<{ order: number[] }> {
  const response = await apiClient.put<{ order: number[] }>('/catalog/featured-order', { order })
  return response.data
}
