// Tiny fetch client for the TWO public endpoints of the US storefront.
// Backend envelopes (same convention as the whole repo):
//   success → { success, data, message }
//   error   → { success: false, error, errors }
import type { UsCategory } from './constants'

// ── Types (frozen contract) ──────────────────────────────────────────────────

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

// ── Errors ───────────────────────────────────────────────────────────────────

export class ApiRequestError extends Error {
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>

  constructor(
    message: string,
    fieldErrors: Readonly<Record<string, readonly string[]>> = {},
  ) {
    super(message)
    this.name = 'ApiRequestError'
    this.fieldErrors = fieldErrors
  }
}

export function extractErrorMessage(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback
  const record = body as Record<string, unknown>
  if (typeof record['error'] === 'string') return record['error']
  if (typeof record['message'] === 'string') return record['message']
  return fallback
}

function extractFieldErrors(body: unknown): Record<string, readonly string[]> {
  if (typeof body !== 'object' || body === null) return {}
  const raw = (body as Record<string, unknown>)['errors']
  if (typeof raw !== 'object' || raw === null) return {}
  const result: Record<string, readonly string[]> = {}
  for (const [field, messages] of Object.entries(raw)) {
    if (!Array.isArray(messages)) continue
    const strings = messages.filter((m): m is string => typeof m === 'string')
    if (strings.length > 0) result[field] = strings
  }
  return result
}

// ── Base URL (same pattern as packages/api/src/client.ts) ────────────────────

const DEV_FALLBACK_API = 'http://127.0.0.1:8000/api/v1'

export function resolveApiBase(): string {
  const envUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
  if (envUrl !== '') {
    return envUrl.endsWith('/api/v1') ? envUrl : `${envUrl}/api/v1`
  }
  if (import.meta.env.PROD) return `${window.location.origin}/api/v1`
  return DEV_FALLBACK_API
}

// ── Request helper ───────────────────────────────────────────────────────────

const NETWORK_ERROR_MESSAGE =
  'We could not reach the store right now. Please check your connection and try again.'

const RATE_LIMIT_MESSAGE =
  'Easy there! Too many requests in a row — please wait a minute and try again.'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${resolveApiBase()}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new ApiRequestError(NETWORK_ERROR_MESSAGE)
  }

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Non-JSON body (proxy error page, empty 500…) — fall through to status check.
  }

  const success =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)['success']
      : undefined

  if (response.status === 429) {
    // Public endpoints are throttled (10/min) — Laravel's default message is curt.
    throw new ApiRequestError(RATE_LIMIT_MESSAGE)
  }

  if (!response.ok || success === false) {
    throw new ApiRequestError(
      extractErrorMessage(body, `Request failed (${response.status})`),
      extractFieldErrors(body),
    )
  }

  const data =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)['data']
      : undefined
  return data as T
}

// ── Public endpoints ─────────────────────────────────────────────────────────

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
