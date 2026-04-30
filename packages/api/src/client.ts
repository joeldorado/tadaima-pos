import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import type { ApiError } from './types'

// Backend uses { error: string } for failures and { message: string } for success messages.
// This helper extracts whichever is present so error messages always surface correctly.
function isApiErrorShape(data: unknown): data is { message?: string; error?: string; errors?: Record<string, string[]> } {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return typeof d['message'] === 'string' || typeof d['error'] === 'string'
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (typeof data !== 'object' || data === null) return fallback
  const d = data as Record<string, unknown>
  if (typeof d['error'] === 'string') return d['error']
  if (typeof d['message'] === 'string') return d['message']
  return fallback
}

// ─── Token getter ─────────────────────────────────────────────────────────────
// Default is () => null — AuthProvider must call setTokenGetter on mount.

let _getToken: () => string | null = () => null

/**
 * Registers a function that returns the current auth token.
 * Call once in AuthProvider before any API request is made.
 */
export function setTokenGetter(fn: () => string | null): void {
  _getToken = fn
}

// ─── Unauthorized callback ────────────────────────────────────────────────────
// Called by the 401 interceptor. Responsible for clearing BOTH storage and
// React state so the UI immediately reflects the unauthenticated status.

let _onUnauthorized: () => void = () => {}

/**
 * Registers a callback invoked on every 401 response.
 * AuthProvider uses this to clear storage AND set user to null atomically.
 *
 * @example
 *   setOnUnauthorized(() => { storage.clear(); setUser(null) })
 */
export function setOnUnauthorized(fn: () => void): void {
  _onUnauthorized = fn
}

// ─── Base URL resolution ──────────────────────────────────────────────────────

const FALLBACK_BASE_URL = 'http://127.0.0.1:8000/api/v1'

function resolveBaseUrl(): string {
  // import.meta.env is injected by Vite at build time
  const metaEnv = (import.meta as unknown as Record<string, Record<string, unknown>>)['env'] ?? {}
  const viteUrl = typeof metaEnv['VITE_API_URL'] === 'string' ? metaEnv['VITE_API_URL'] : ''

  if (!viteUrl) {
    if (metaEnv['PROD'] === true) {
      // Hard failure in production — a missing URL would silently send credentials
      // to localhost over plain HTTP, which must never happen in production.
      throw new Error(
        '[api] VITE_API_URL is required in production. Set the environment variable before building.',
      )
    }
    if (metaEnv['DEV'] === true) {
      console.warn('[api] VITE_API_URL not set — using dev fallback:', FALLBACK_BASE_URL)
    }
    return FALLBACK_BASE_URL
  }

  return `${viteUrl}/api/v1`
}

// ─── Axios instance factory ───────────────────────────────────────────────────

function createApiClient(baseURL: string): AxiosInstance {
  // Content-Type is NOT set here so there is no default to fight against.
  // It is injected per-request in the interceptor below (skipped for FormData
  // so the browser can set multipart/form-data with the correct boundary).
  const instance = axios.create({
    baseURL,
    headers: { 'Accept': 'application/json' },
  })

  // ── Request interceptor: inject token + Content-Type ─────────────────────
  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = _getToken()
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }
    config.headers.set('Accept', 'application/json')
    if (config.data instanceof FormData) {
      // Let the browser set multipart/form-data with the correct boundary.
      // Any explicit Content-Type here would strip the boundary and break parsing.
      config.headers.delete('Content-Type')
    } else {
      config.headers.set('Content-Type', 'application/json')
    }
    return config
  })

  // ── Response interceptor: unwrap payload / handle errors ──────────────────
  instance.interceptors.response.use(
    (response) => {
      // Laravel returns { data: T, message: string } — unwrap so callers
      // don't need to access .data.data
      if (
        response.data !== null &&
        typeof response.data === 'object' &&
        'data' in response.data
      ) {
        return { ...response, data: response.data.data }
      }
      return response
    },
    (error) => {
      if (!axios.isAxiosError(error)) {
        return Promise.reject(error)
      }

      const status = error.response?.status

      // 401 — token invalid or expired: notify auth layer to clear BOTH
      // storage and React state so the UI reflects the unauthenticated status.
      if (status === 401) {
        _onUnauthorized()
      }

      // 422 — extract validation errors
      if (status === 422) {
        const raw = error.response?.data
        const validationError: ApiError = {
          message: extractErrorMessage(raw, 'Error de validación'),
          ...(isApiErrorShape(raw) && raw.errors !== undefined ? { errors: raw.errors } : {}),
        }
        return Promise.reject(validationError)
      }

      // Other errors — normalise to ApiError shape
      const raw = error.response?.data
      const apiError: ApiError = {
        message: extractErrorMessage(raw, error.message ?? 'Error desconocido'),
        ...(isApiErrorShape(raw) && raw.errors !== undefined ? { errors: raw.errors } : {}),
      }
      return Promise.reject(apiError)
    }
  )

  return instance
}

// ─── Shared instance ──────────────────────────────────────────────────────────
export const apiClient: AxiosInstance = createApiClient(resolveBaseUrl())

/**
 * Resolves a Laravel storage path (e.g. "products/1/img.jpg") to a full URL.
 * Uses the same base as VITE_API_URL so it works in both dev and production.
 */
export function storageUrl(path: string): string {
  const metaEnv = (import.meta as unknown as Record<string, Record<string, unknown>>)['env'] ?? {}
  const viteUrl = typeof metaEnv['VITE_API_URL'] === 'string' ? metaEnv['VITE_API_URL'] : 'http://127.0.0.1:8000'
  return `${viteUrl}/storage/${path}`
}
