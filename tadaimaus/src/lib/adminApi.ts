// Endpoints AUTENTICADOS del panel de TadaimaUS.
//
// Todos existen ya en el backend (backend/routes/api.php, grupo auth:sanctum) y
// cada método del controlador gatea con adminOnlyError() — el panel no puede
// saltarse eso, solo refleja el permiso en la UI.
//
// El panel NO publica productos del POS: todo lo que se da de alta aquí es un
// listing "custom" (product_id null) con su propio nombre, precio y foto.
import { request, resolveApiOrigin } from './http'
import type { UsCategory } from './constants'

// ── Sesión ───────────────────────────────────────────────────────────────────

export interface AdminUser {
  readonly id: number
  readonly name: string
  readonly email: string
  readonly roles: readonly string[]
}

interface LoginResponse {
  readonly token: string
  readonly user: AdminUser
}

/** POST /auth/login — devuelve un personal access token de Sanctum. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return data
}

/** GET /auth/me — valida el token guardado al recargar la página. */
export async function fetchMe(): Promise<AdminUser> {
  return await request<AdminUser>('/auth/me', { auth: true })
}

/** POST /auth/logout — revoca el token del lado del servidor. */
export async function logout(): Promise<void> {
  await request<unknown>('/auth/logout', { method: 'POST', auth: true })
}

const ADMIN_ROLES = ['admin', 'super_admin', 'owner', 'dueño']

/** El backend responde 403 a todo el módulo US si el usuario no es admin. */
export function isAdmin(user: AdminUser): boolean {
  return user.roles.some((role) => ADMIN_ROLES.includes(role.toLowerCase()))
}

// ── Artículos ────────────────────────────────────────────────────────────────

/** Un artículo tal como lo devuelve el backend (`formatListing`). */
export interface AdminListing {
  readonly id: number
  readonly name: string
  readonly description: string | null
  readonly price_usd: number
  readonly category: UsCategory
  readonly image_url: string | null
  readonly visible: boolean
  /** false ⇒ tiene producto del POS detrás y se quedó sin stock: la tienda lo oculta. */
  readonly in_stock: boolean
  /** true ⇒ sin producto del POS detrás; siempre disponible. */
  readonly is_custom: boolean
  readonly created_at: string
}

export interface ListingInput {
  readonly name: string
  readonly description?: string
  readonly price_usd: number
  readonly category: UsCategory
  readonly image_url?: string | null
  readonly visible?: boolean
}

interface RawListing {
  readonly id: number
  readonly name: string
  readonly description: string | null
  /** El backend serializa decimal(10,2) como string ("12.00"). */
  readonly price_usd: string | number
  readonly category: string
  readonly image_url: string | null
  readonly visible: boolean
  readonly in_stock?: boolean
  readonly is_custom?: boolean
  readonly created_at: string
}

const CATEGORY_FALLBACK: UsCategory = 'other'

function toCategory(value: string): UsCategory {
  const allowed: readonly string[] = ['figures', 'manga', 'tcg', 'other']
  return allowed.includes(value) ? (value as UsCategory) : CATEGORY_FALLBACK
}

export function mapListing(raw: RawListing): AdminListing {
  const price = Number(raw.price_usd)
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    price_usd: Number.isFinite(price) ? price : 0,
    category: toCategory(raw.category),
    image_url: absoluteImageUrl(raw.image_url),
    visible: raw.visible,
    in_stock: raw.in_stock ?? true,
    is_custom: raw.is_custom ?? true,
    created_at: raw.created_at,
  }
}

/**
 * Resuelve la URL de una foto contra el origen del API.
 *
 * `POST /us/uploads` devuelve lo que dé `Storage::url()`: con el disco `gcs`
 * (producción) es absoluta y se usa tal cual, pero con el disco `public`
 * (desarrollo) es relativa — `/storage/...` — y colgaría del :5178 de la tienda
 * en vez del :8000 del backend.
 */
export function absoluteImageUrl(url: string | null): string | null {
  if (url === null || url === '') return null
  if (/^(https?:)?\/\//.test(url)) return url
  if (url.startsWith('/')) return `${resolveApiOrigin()}${url}`
  return `${resolveApiOrigin()}/${url}`
}

/** Tope del backend: sin paginación, corta en 200. */
export const LISTINGS_CAP = 200

/** GET /us/listings */
export async function listListings(search?: string): Promise<readonly AdminListing[]> {
  const query = search !== undefined && search.trim() !== ''
    ? `?search=${encodeURIComponent(search.trim())}`
    : ''
  const data = await request<readonly RawListing[]>(`/us/listings${query}`, { auth: true })
  return Array.isArray(data) ? data.map(mapListing) : []
}

function toBody(input: Partial<ListingInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body['name'] = input.name
  if (input.description !== undefined) body['description'] = input.description
  if (input.price_usd !== undefined) body['price_usd'] = input.price_usd
  if (input.category !== undefined) body['category'] = input.category
  if (input.image_url !== undefined) body['image_url'] = input.image_url
  if (input.visible !== undefined) body['visible'] = input.visible
  return body
}

/** POST /us/listings — siempre custom: sin producto del POS detrás. */
export async function createListing(input: ListingInput): Promise<AdminListing> {
  const raw = await request<RawListing>('/us/listings', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ ...toBody(input), product_id: null }),
  })
  return mapListing(raw)
}

/** PUT /us/listings/{id} — parcial. */
export async function updateListing(
  id: number,
  patch: Partial<ListingInput>,
): Promise<AdminListing> {
  const raw = await request<RawListing>(`/us/listings/${id}`, {
    method: 'PUT',
    auth: true,
    body: JSON.stringify(toBody(patch)),
  })
  return mapListing(raw)
}

/** DELETE /us/listings/{id} — los pedidos conservan su snapshot. */
export async function deleteListing(id: number): Promise<void> {
  await request<unknown>(`/us/listings/${id}`, { method: 'DELETE', auth: true })
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** POST /us/uploads — multipart, campo `image`, máx. 5 MB del lado del backend. */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('image', file)
  const data = await request<{ readonly url: string }>('/us/uploads', {
    method: 'POST',
    auth: true,
    body: form,
  })
  return absoluteImageUrl(data.url) ?? data.url
}

// ── Leads ────────────────────────────────────────────────────────────────────

export type LeadSource = 'newsletter' | 'contact'

export interface AdminLead {
  readonly id: number
  readonly source: LeadSource
  readonly name: string | null
  readonly email: string
  /** Asunto del formulario de contacto; null en los del newsletter. */
  readonly subject: string | null
  readonly message: string | null
  /** Marcó "I want to subscribe to your mailing list" en el newsletter. */
  readonly marketing_consent: boolean
  readonly created_at: string
}

/** Tope del backend: sin paginación, corta en 500. */
export const LEADS_CAP = 500

/** GET /us/leads */
export async function listLeads(source?: LeadSource): Promise<readonly AdminLead[]> {
  const query = source !== undefined ? `?source=${source}` : ''
  const data = await request<readonly AdminLead[]>(`/us/leads${query}`, { auth: true })
  return Array.isArray(data) ? data : []
}
