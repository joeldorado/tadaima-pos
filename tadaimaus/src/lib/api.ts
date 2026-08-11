// Endpoints PÚBLICOS de la tienda US (catálogo, órdenes, leads) — sin auth.
// El panel de administración usa lib/adminApi.ts; ambos comparten el cliente
// de lib/http.ts.
import { ApiRequestError, request } from './http'
import type { UsCategory } from './constants'

// Se re-exportan para no romper a quien ya importaba desde aquí.
export { ApiRequestError, extractErrorMessage, resolveApiBase, resolveApiOrigin } from './http'

// ── Tipos (contrato congelado) ───────────────────────────────────────────────

export interface UsListing {
  readonly id: number
  readonly name: string
  readonly description: string | null
  /** Decimal string, e.g. "12.00". */
  readonly price_usd: string
  readonly image_url: string | null
  readonly category: string
}

export interface OrderItemInput {
  readonly listing_id: number
  readonly quantity: number
}

export interface OrderInput {
  readonly name: string
  readonly email: string
  readonly phone: string
  /** Honeypot anti-bots: siempre "" — un humano nunca ve/llena este campo. */
  readonly website?: string
  readonly items: readonly OrderItemInput[]
}

export interface OrderConfirmation {
  /** Folio like "TUS-000001". */
  readonly order_number: string
  readonly total_usd: string | number
}

// ── Endpoints públicos ───────────────────────────────────────────────────────

export interface CatalogFilters {
  readonly category?: UsCategory
  readonly search?: string
}

/** GET /us/catalog — only visible listings; server filters + caps at 200. */
export async function fetchCatalog(
  filters: CatalogFilters = {},
): Promise<readonly UsListing[]> {
  const params = new URLSearchParams()
  if (filters.category) params.set('category', filters.category)
  if (filters.search) params.set('search', filters.search)
  const query = params.toString()
  const data = await request<unknown>(`/us/catalog${query ? `?${query}` : ''}`)
  return Array.isArray(data) ? (data as readonly UsListing[]) : []
}

export interface LeadInput {
  readonly source: 'newsletter' | 'contact'
  readonly email: string
  readonly name?: string
  /** Obligatorio en el formulario de contacto; el newsletter no lo manda. */
  readonly subject?: string
  readonly message?: string
  /** Consentimiento explícito para email marketing (checkbox del newsletter). */
  readonly marketing_consent?: boolean
  /** Honeypot anti-bots: siempre "" — un humano nunca ve/llena este campo. */
  readonly website?: string
}

/** POST /us/leads — newsletter Sign Up y formulario de contacto. */
export async function submitLead(input: LeadInput): Promise<void> {
  await request<unknown>('/us/leads', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** POST /us/orders — server recomputes all prices; response carries the folio. */
export async function placeOrder(input: OrderInput): Promise<OrderConfirmation> {
  const data = await request<unknown>('/us/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as Record<string, unknown>)['order_number'] !== 'string'
  ) {
    throw new ApiRequestError('Unexpected response from the server. Please try again.')
  }
  return data as OrderConfirmation
}
