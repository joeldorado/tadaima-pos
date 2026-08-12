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

/** Producto publicado en la tienda US con precio manual en dólares. */
export interface UsListing {
  id: number
  /** null = listing CUSTOM (dummy del panel o migrado del Wix), sin producto POS. */
  product_id: number | null
  /** true ⇔ product_id null — sin stock POS detrás; siempre "disponible". */
  is_custom: boolean
  /** Nombre del producto en el POS (fallback cuando name_en es null). */
  product_name: string
  sku: string
  image_url: string | null
  name_en: string | null
  description_en: string | null
  price_usd: number
  category: UsCategory
  visible: boolean
  /** Agotado MANUAL: la tienda lo muestra con badge "Sold Out" y bloquea la compra. */
  sold_out: boolean
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
  /** Omitir/null = listing CUSTOM (dummy) — entonces name_en es obligatorio. */
  product_id?: number | null
  price_usd: number
  /** Vacío = la tienda US usa el nombre del producto del POS (custom: requerido). */
  name_en?: string
  description_en?: string
  /** figures | manga | tcg | other (default backend: other). */
  category?: UsCategory
  /** Foto propia (URL de /us/uploads o externa). */
  image_url?: string
  visible?: boolean
  sold_out?: boolean
}

export interface UpdateUsListingInput {
  price_usd?: number
  /** null = volver al nombre del producto del POS. */
  name_en?: string | null
  description_en?: string | null
  category?: UsCategory
  image_url?: string | null
  visible?: boolean
  sold_out?: boolean
}

export interface GetUsOrdersParams {
  status?: UsOrderStatus
  page?: number
  per_page?: number
}

// ── Shapes crudos del backend ────────────────────────────────────────────────

interface RawListing {
  id: number
  product_id: number | null
  is_custom?: boolean
  name: string
  description: string | null
  price_usd: string
  category: UsCategory
  image_url: string | null
  visible: boolean
  /** Ausente en un backend viejo (pre-migración sold_out) ⇒ false. */
  sold_out?: boolean
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
  const isCustom = raw.is_custom ?? raw.product_id === null
  const productName = raw.product?.name ?? raw.name
  return {
    id: raw.id,
    product_id: raw.product_id,
    is_custom: isCustom,
    product_name: productName,
    sku: raw.product?.sku ?? '',
    image_url: raw.image_url,
    // name igual al del producto = sin nombre EN custom (la UI muestra "usa el
    // del POS"). En un custom el name ES el nombre real — nunca null.
    name_en: isCustom ? raw.name : raw.name === productName ? null : raw.name,
    description_en: raw.description,
    price_usd: Number(raw.price_usd),
    category: raw.category ?? 'other',
    visible: raw.visible,
    sold_out: raw.sold_out ?? false,
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
  if (input.image_url !== undefined) body['image_url'] = input.image_url
  if (input.visible !== undefined) body['visible'] = input.visible
  if (input.sold_out !== undefined) body['sold_out'] = input.sold_out
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

/**
 * Sube la foto de un listing custom (multipart) y devuelve su URL pública.
 * POST /us/uploads — GCS absoluto en prod, /storage local en dev.
 */
export async function uploadUsImage(file: File): Promise<{ url: string }> {
  const form = new FormData()
  form.append('image', file)
  // Sin Content-Type explícito — el interceptor lo borra para FormData y el
  // browser pone multipart/form-data con el boundary correcto (patrón products.ts).
  const response = await apiClient.post<{ path: string; url: string }>('/us/uploads', form)
  return { url: response.data.url }
}

// ─── Leads del sitio US (newsletter "We hear you!" + contacto) ───────────────

export type UsLeadSource = 'newsletter' | 'contact'

export interface UsLead {
  id: number
  source: UsLeadSource
  name: string | null
  email: string
  message: string | null
  /** Marcó "I want to subscribe to your mailing list" en el newsletter. */
  marketing_consent: boolean
  created_at: string
}

export interface GetUsLeadsParams {
  source?: UsLeadSource
}

/**
 * Bandeja de leads (más nuevos primero, cap 500 del backend).
 * GET /us/leads?source=
 */
export async function listUsLeads(params?: GetUsLeadsParams): Promise<UsLead[]> {
  const response = await apiClient.get<UsLead[]>('/us/leads', {
    params: params?.source ? { source: params.source } : {},
  })
  return response.data
}
