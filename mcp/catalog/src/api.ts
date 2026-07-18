/**
 * Cliente HTTP mínimo hacia el API de Tadaima (Laravel, envelope
 * `{ success, data, message }` / `{ success:false, error, errors }`).
 *
 * NO reutiliza `@tadaima/api` (ese paquete está acoplado a Vite/browser:
 * import.meta.env + window). Aquí: fetch puro de Node + env vars.
 */

const BASE = (process.env.TADAIMA_API_URL ?? "https://tadaima.poslite.com.mx/api/v1").replace(/\/$/, "")
const TOKEN = process.env.TADAIMA_API_TOKEN

export function assertConfigured(): void {
  if (!TOKEN) {
    throw new Error(
      "Falta TADAIMA_API_TOKEN. Genera uno con:\n" +
        `  curl -s -X POST ${BASE}/auth/login -H 'Content-Type: application/json' ` +
        `-d '{"email":"<admin>","password":"<pass>"}'\n` +
        "y exporta el campo data.token como TADAIMA_API_TOKEN."
    )
  }
}

interface Envelope<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
  errors?: Record<string, string[]>
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  assertConfigured()

  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(init?.headers ?? {}),
    },
  })

  let body: Envelope<T> | null = null
  try {
    body = (await resp.json()) as Envelope<T>
  } catch {
    throw new Error(`Respuesta no-JSON del API (HTTP ${resp.status}) en ${path}.`)
  }

  if (resp.status === 401) {
    throw new Error(
      "Token inválido o vencido (401). Genera uno nuevo con POST /auth/login (usuario admin) y actualiza TADAIMA_API_TOKEN."
    )
  }
  if (!resp.ok || body.success === false) {
    const details = body.errors ? ` · ${JSON.stringify(body.errors)}` : ""
    throw new Error(`${body.error ?? `Error HTTP ${resp.status}`}${details}`)
  }

  return body.data as T
}

// ─── Endpoints tipados que usa este MCP ──────────────────────────────────────

export type SettingsMap = Record<string, string | null>

export function getSettings(): Promise<SettingsMap> {
  return apiFetch<SettingsMap>("/settings")
}

export function putSettings(payload: Record<string, string>): Promise<SettingsMap> {
  return apiFetch<SettingsMap>("/settings", { method: "PUT", body: JSON.stringify(payload) })
}

export interface ProductFlagRow {
  id: number
  name: string
  sku: string
  active: boolean
  featured: boolean
  catalog_visible: boolean
  price_1: number | null
  category: { id: number; name: string } | null
  image: string | null
}

export interface ProductFlagsPage {
  data: ProductFlagRow[]
  pagination: { total: number; per_page: number; current_page: number; last_page: number }
}

export function getProductFlags(params: {
  search?: string
  filter?: "all" | "featured" | "hidden"
  page?: number
  per_page?: number
}): Promise<ProductFlagsPage> {
  const qs = new URLSearchParams()
  if (params.search) qs.set("search", params.search)
  if (params.filter) qs.set("filter", params.filter)
  if (params.page) qs.set("page", String(params.page))
  if (params.per_page) qs.set("per_page", String(params.per_page))
  const suffix = qs.toString() ? `?${qs.toString()}` : ""
  return apiFetch<ProductFlagsPage>(`/catalog/product-flags${suffix}`)
}

export function putProductFlags(
  productId: number,
  payload: { featured?: boolean; catalog_visible?: boolean }
): Promise<{ id: number; name: string; featured: boolean; catalog_visible: boolean }> {
  return apiFetch(`/catalog/product-flags/${productId}`, { method: "PUT", body: JSON.stringify(payload) })
}
