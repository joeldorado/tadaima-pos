// Cliente HTTP compartido por las TRES superficies de la app:
//   · la tienda pública (lib/api.ts) — sin auth (checkout con sesión opcional)
//   · el panel de administración (lib/adminApi.ts) — token Sanctum de User POS
//   · la cuenta del cliente (lib/customerApi.ts) — token Sanctum de UsCustomer
//
// Envelopes del backend (misma convención que todo el repo):
//   éxito → { success, data, message }
//   error → { success: false, error, errors, code? }

// ── Errores ──────────────────────────────────────────────────────────────────

export class ApiRequestError extends Error {
  /** Código HTTP; 0 cuando ni siquiera se pudo alcanzar el servidor. */
  readonly status: number
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>
  /** Código de negocio opcional del backend (p.ej. 'account_exists'). */
  readonly code: string | undefined

  constructor(
    message: string,
    status = 0,
    fieldErrors: Readonly<Record<string, readonly string[]>> = {},
    code?: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.code = code
  }
}

function extractCode(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const code = (body as Record<string, unknown>)['code']
  return typeof code === 'string' ? code : undefined
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

// ── Base URL (mismo patrón que packages/api/src/client.ts) ───────────────────

const DEV_FALLBACK_API = 'http://127.0.0.1:8000/api/v1'

export function resolveApiBase(): string {
  const envUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
  if (envUrl !== '') {
    return envUrl.endsWith('/api/v1') ? envUrl : `${envUrl}/api/v1`
  }
  if (import.meta.env.PROD) return `${window.location.origin}/api/v1`
  return DEV_FALLBACK_API
}

/**
 * Origen del backend, sin el `/api/v1`. Sirve para resolver rutas relativas que
 * el backend devuelve fuera del API (p.ej. `/storage/...` de las fotos subidas):
 * en dev el API vive en :8000 y la tienda en :5178, así que una ruta relativa
 * apuntaría al puerto equivocado.
 */
export function resolveApiOrigin(): string {
  return resolveApiBase().replace(/\/api\/v1$/, '')
}

// ── Tokens de sesión ─────────────────────────────────────────────────────────
// DOS slots a nivel módulo (mismo patrón que `setTokenGetter` del POS): el del
// ADMIN (panel #/admin, User del POS) y el del CLIENTE (cuenta de la tienda,
// UsCustomer). Son sesiones independientes — jamás deben pisarse.

export type AuthKind = 'admin' | 'customer'

let authToken: string | null = null
let onUnauthorized: (() => void) | null = null
let customerToken: string | null = null
let onCustomerUnauthorized: (() => void) | null = null

/** Token del PANEL de administración (back-compat: nombre original). */
export function setAuthToken(token: string | null): void {
  authToken = token
}

/** Se dispara cuando el backend rechaza el token del admin. */
export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler
}

/** Token de la CUENTA del cliente de la tienda. */
export function setCustomerToken(token: string | null): void {
  customerToken = token
}

/** ¿Hay sesión de cliente activa? (el checkout decide si manda bearer). */
export function hasCustomerToken(): boolean {
  return customerToken !== null
}

/** Se dispara cuando el backend rechaza el token del cliente. */
export function setOnCustomerUnauthorized(handler: (() => void) | null): void {
  onCustomerUnauthorized = handler
}

// ── Helper de request ────────────────────────────────────────────────────────

const NETWORK_ERROR_MESSAGE =
  'We could not reach the store right now. Please check your connection and try again.'

const RATE_LIMIT_MESSAGE =
  'Easy there! Too many requests in a row — please wait a minute and try again.'

export interface RequestOptions extends RequestInit {
  /** Manda el bearer token y activa el manejo de 401. */
  readonly auth?: boolean
  /**
   * Qué sesión usa la llamada. Default 'admin' (back-compat: adminApi no
   * cambia); customerApi y el checkout mandan 'customer'.
   */
  readonly as?: AuthKind
}

export async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { auth = false, as: kind = 'admin', headers: extraHeaders, ...rest } = init
  const isFormData = rest.body instanceof FormData

  const token = kind === 'customer' ? customerToken : authToken

  const headers: Record<string, string> = { Accept: 'application/json' }
  // Con FormData el navegador debe poner el Content-Type él mismo: necesita
  // agregarle el boundary del multipart.
  if (!isFormData) headers['Content-Type'] = 'application/json'
  if (auth && token !== null) headers['Authorization'] = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${resolveApiBase()}${path}`, {
      ...rest,
      headers: { ...headers, ...(extraHeaders as Record<string, string> | undefined) },
    })
  } catch {
    throw new ApiRequestError(NETWORK_ERROR_MESSAGE)
  }

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Cuerpo no-JSON (página de error del proxy, 500 vacío…) — cae al status.
  }

  const success =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)['success']
      : undefined

  if (response.status === 401 && auth && token !== null) {
    // Token vencido o revocado: avisar al handler de LA sesión usada para que
    // esa superficie regrese a su login (la otra sesión no se toca).
    if (kind === 'customer') onCustomerUnauthorized?.()
    else onUnauthorized?.()
    throw new ApiRequestError('Your session expired. Please sign in again.', 401)
  }

  if (response.status === 429) {
    // Los endpoints públicos van throttled (10/min) y el mensaje de Laravel es seco.
    throw new ApiRequestError(RATE_LIMIT_MESSAGE, 429)
  }

  if (!response.ok || success === false) {
    throw new ApiRequestError(
      extractErrorMessage(body, `Request failed (${response.status})`),
      response.status,
      extractFieldErrors(body),
      extractCode(body),
    )
  }

  const data =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)['data']
      : undefined
  return data as T
}
