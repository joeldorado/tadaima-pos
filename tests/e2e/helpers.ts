import { type Page, type BrowserContext } from '@playwright/test'

/**
 * Helpers compartidos de la suite e2e (extraídos de tadaima.spec.ts).
 *
 * Dos variantes de request:
 *  - `apiReq`     → devuelve el JSON parseado directo (patrón tadaima.spec.ts)
 *  - `apiReqFull` → devuelve `{ status, json }` (patrón insumos/promotions/line-discounts)
 */

export const BASE_URL   = 'http://localhost:5173'
export const API_URL    = 'http://localhost:8000/api/v1'
export const ADMIN_EMAIL    = 'admin@tadaima.mx'
export const ADMIN_PASSWORD = 'password'
export const CASHIER_EMAIL    = 'cajero@test.com'
export const CASHIER_PASSWORD = 'password123'
export const MANAGER_EMAIL    = 'gerente@test.com'
export const MANAGER_PASSWORD = 'password123'
export const TOKEN_KEY  = 'tadaima_token'

export async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json() as { data: { token: string } }
  return json.data.token
}

export async function seedAuth(context: BrowserContext, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  const token = await apiLogin(email, password)
  await context.addInitScript((args) => {
    localStorage.setItem(args.key, args.token)
  }, { key: TOKEN_KEY, token })
  return token
}

export async function apiReq(method: string, token: string, path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return res.json()
}

export async function apiReqFull(method: string, token: string, path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

export function dataOf(r: { json: Record<string, unknown> }): Record<string, unknown> {
  return (r.json['data'] ?? {}) as Record<string, unknown>
}

export async function waitReady(page: Page) {
  await page.waitForLoadState('networkidle')
}

export function extractId(res: unknown): number {
  const r = res as Record<string, unknown>
  const data = r['data'] as Record<string, unknown> | undefined
  return (data?.['id'] ?? r['id'] ?? 0) as number
}
