import { apiClient } from './client'

// ─── TadaimaUS (tienda US en USD) — módulo admin ─────────────────────────────
// ADAPTADOR al backend real (routes/api.php es la fuente de verdad):
//   GET/POST  /us/listings            PUT/DELETE /us/listings/{id}
//   GET       /us/orders              PUT        /us/orders/{id}/status
//   GET       /us/products?search=    (búsqueda de productos aún no listados)
// Todos dentro de auth:sanctum y gateados a admin (adminOnlyError).
//
// La superficie exportada (tipos/funciones) se conserva tal como la consume la
// UI (TabTadaimaUS/PublishedPanel/OrdersPanel); el mapeo raw→UI vive aquí:
//   backend name/description  ⇄  name_en/description_en de la UI
//   backend order_number      ⇄  code de la UI
//   new-count                 =  derivado client-side (no hay endpoint)

export type UsCategory = 'figures' | 'manga' | 'tcg' | 'other'

/** Producto del POS publicado en la tienda US con precio manual en dólares. */
export interface UsListing {
  id: number
  product_id: number
  /** Nombre del producto en el POS (fallback cuando name_en es null). */
  product_name: string
  sku: string
  image_url: string | null
  name_en: string | null
  description_en: string | null
  price_usd: number
  category: UsCategory
  visible: boolean
  /** Stock vendible (SellableStock del backend) — false ⇒ oculto en la tienda US. */
  in_stock: boolean
  created_at: string
}

export type UsOrderStatus = 'new' | 'contacted' | 'completed' | 'cancelled'

export interface UsOrderItem {
  /** null si el listing fue borrado (nullOnDelete) — queda el snapshot. */
  product_id: number | null
  name: string
  /** Precio congelado al momento del pedido — editar el listing NO lo cambia. */
  unit_price_usd: number
  quantity: number
}

/** Pedido dummy de la tienda US (folio TUS-XXXXXX, sin cobro online). */
export interface UsOrder {
  id: number
  code: string
  customer_name: string
  customer_email: string
  customer_phone: string
  notes: string | null
  status: UsOrderStatus
  total_usd: number
  created_at: string
  items: UsOrderItem[]
}

interface ListPagination {
  current_page: number
  last_page: number
  total: number
  per_page: number
}

export interface UsListingListResponse {
  data: UsListing[]
  pagination: ListPagination
}

export interface UsOrderListResponse {
  data: UsOrder[]
  pagination: ListPagination
}

export interface GetUsListingsParams {
  search?: string
  page?: number
  per_page?: number
}

export interface CreateUsListingInput {
  product_id: number
  price_usd: number
  /** Vacío = la tienda US usa el nombre del producto del POS. */
  name_en?: string
  description_en?: string
  /** figures | manga | tcg | other (default backend: other). */
  category?: UsCategory
  visible?: boolean
}

export interface UpdateUsListingInput {
  price_usd?: number
  /** null = volver al nombre del producto del POS. */
  name_en?: string | null
  description_en?: string | null
  category?: UsCategory
  visible?: boolean
}

export interface GetUsOrdersParams {
  status?: UsOrderStatus
  page?: number
  per_page?: number
}

// ── Shapes crudos del backend ────────────────────────────────────────────────

interface RawListing {
  id: number
  product_id: number
  name: string
  description: string | null
  price_usd: string
  category: UsCategory
  image_url: string | null
  visible: boolean
  /** Stock vendible (SellableStock) — sin él, la tienda US oculta el listing. */
  in_stock?: boolean
  created_at: string | null
  product: { id: number; name: string; sku: string | null } | null
}

interface RawOrderItem {
  id: number
  us_listing_id: number | null
  name: string
  price_usd: string
  quantity: number
  line_total_usd: string
}

interface RawOrder {
  id: number
  order_number: string
  customer_name: string
  customer_email: string
  customer_phone: string
  total_usd: string
  status: UsOrderStatus
  created_at: string | null
  items: RawOrderItem[]
}

function mapListing(raw: RawListing): UsListing {
  const productName = raw.product?.name ?? raw.name
  return {
    id: raw.id,
    product_id: raw.product_id,
    product_name: productName,
    sku: raw.product?.sku ?? '',
    image_url: raw.image_url,
    // name igual al del producto = sin nombre EN custom (la UI muestra "usa el del POS").
    name_en: raw.name === productName ? null : raw.name,
    description_en: raw.description,
    price_usd: Number(raw.price_usd),
    category: raw.category ?? 'other',
    visible: raw.visible,
    // Backends viejos sin el campo → asumir disponible (no alarmar de más).
    in_stock: raw.in_stock ?? true,
    created_at: raw.created_at ?? '',
  }
}

function mapOrder(raw: RawOrder): UsOrder {
  return {
    id: raw.id,
    code: raw.order_number,
    customer_name: raw.customer_name,
    customer_email: raw.customer_email,
    customer_phone: raw.customer_phone,
    notes: null,
    status: raw.status,
    total_usd: Number(raw.total_usd),
    created_at: raw.created_at ?? '',
    items: raw.items.map((i) => ({
      product_id: i.us_listing_id,
      name: i.name,
      unit_price_usd: Number(i.price_usd),
      quantity: i.quantity,
    })),
  }
}

function paginateAll<T>(data: T[]): { data: T[]; pagination: ListPagination } {
  return {
    data,
    pagination: { current_page: 1, last_page: 1, total: data.length, per_page: data.length || 1 },
  }
}

/** Traducción UI → body del backend para create/update. */
function toListingBody(input: CreateUsListingInput | UpdateUsListingInput): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if ('product_id' in input && input.product_id !== undefined) body['product_id'] = input.product_id
  if (input.price_usd !== undefined) body['price_usd'] = input.price_usd
  if (input.name_en !== undefined) body['name'] = input.name_en
  if (input.description_en !== undefined) body['description'] = input.description_en
  if (input.category !== undefined) body['category'] = input.category
  if (input.visible !== undefined) body['visible'] = input.visible
  return body
}

/**
 * Lista de productos publicados en la tienda US.
 * GET /us/listings?search=
 */
export async function listUsListings(
  params?: GetUsListingsParams
): Promise<UsListingListResponse> {
  const response = await apiClient.get<RawListing[]>('/us/listings', {
    params: params?.search ? { search: params.search } : {},
  })
  return paginateAll(response.data.map(mapListing))
}

/**
 * Publica un producto EXISTENTE del POS en la tienda US.
 * POST /us/listings — product_id duplicado responde 422 (unique).
 */
export async function createUsListing(input: CreateUsListingInput): Promise<UsListing> {
  const response = await apiClient.post<RawListing>('/us/listings', toListingBody(input))
  return mapListing(response.data)
}

/**
 * Edita precio USD / nombre EN / categoría / visibilidad de un listing.
 * PUT /us/listings/{id} — NO toca pedidos existentes (snapshot congelado).
 */
export async function updateUsListing(
  id: number,
  payload: UpdateUsListingInput
): Promise<UsListing> {
  const response = await apiClient.put<RawListing>(`/us/listings/${id}`, toListingBody(payload))
  return mapListing(response.data)
}

/**
 * Quita el producto de la tienda US (no borra nada del POS).
 * DELETE /us/listings/{id}
 */
export async function deleteUsListing(id: number): Promise<void> {
  await apiClient.delete(`/us/listings/${id}`)
}

/**
 * Pedidos de la tienda US (más nuevos primero, cap 200 del backend).
 * El filtro por status es client-side (el endpoint no filtra).
 * GET /us/orders
 */
export async function listUsOrders(params?: GetUsOrdersParams): Promise<UsOrderListResponse> {
  const response = await apiClient.get<RawOrder[]>('/us/orders')
  const orders = response.data.map(mapOrder)
  const filtered = params?.status ? orders.filter((o) => o.status === params.status) : orders
  return paginateAll(filtered)
}

/**
 * Transiciona el status del pedido (new → contacted → completed | cancelled).
 * PUT /us/orders/{id}/status
 */
export async function updateUsOrderStatus(
  id: number,
  status: UsOrderStatus
): Promise<UsOrder> {
  const response = await apiClient.put<RawOrder>(`/us/orders/${id}/status`, { status })
  return mapOrder(response.data)
}

/**
 * Count de pedidos en status `new` — badge del tab TadaimaUS en Admin.
 * Derivado de la lista (no existe endpoint de count).
 */
export async function getUsOrdersNewCount(): Promise<number> {
  const { data } = await listUsOrders({ status: 'new' })
  return data.length
}
