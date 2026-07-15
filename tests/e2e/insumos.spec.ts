import { test, expect } from '@playwright/test'

/**
 * Insumos (Fase 2): compras pagadas con efectivo de la caja.
 * IN-01/02 validan el API (salida linkeada + expected_cash); IN-03 el flujo UI.
 */

const BASE_URL = 'http://localhost:5173'
const API_URL = 'http://localhost:8000/api/v1'
const ADMIN_EMAIL = 'admin@tadaima.mx'
const ADMIN_PASSWORD = 'password'

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const json = (await res.json()) as { data: { token: string } }
  return json.data.token
}

async function apiReq(method: string, token: string, path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

function dataOf(r: { json: Record<string, unknown> }): Record<string, unknown> {
  return (r.json['data'] ?? {}) as Record<string, unknown>
}

test.describe('Insumos · compras con efectivo de caja', () => {
  let token: string
  let storeId: number
  let sessionId: number
  let supplyId: number
  const supplyName = `Cinta e2e ${Date.now()}`

  test.beforeAll(async () => {
    token = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)

    const stores = await apiReq('GET', token, '/stores')
    storeId = ((stores.json['data'] ?? []) as Array<{ id: number }>)[0]!.id

    // Sesión de caja (reusar la abierta si existe).
    const current = await apiReq('GET', token, '/cash/session')
    const openSession = dataOf(current)
    if (openSession && openSession['id']) {
      sessionId = openSession['id'] as number
    } else {
      const opened = await apiReq('POST', token, '/cash/open', { store_id: storeId, opening_cash: 0 })
      sessionId = (dataOf(opened)['id'] ?? 0) as number
    }
    expect(sessionId).toBeGreaterThan(0)

    // Insumo de catálogo para las pruebas.
    const created = await apiReq('POST', token, '/supplies', {
      name: supplyName, category: 'Empaque e2e', unit: 'rollo',
    })
    supplyId = (dataOf(created)['id'] ?? 0) as number
    expect(supplyId).toBeGreaterThan(0)
  })

  test('IN-01 · API: compra crea salida linkeada y el corte la refleja', async () => {
    // expected_cash ANTES de la compra.
    const before = await apiReq('GET', token, `/reports/cash?from=2026-01-01&to=2030-01-01`)
    const rowBefore = ((before.json['data'] as Record<string, unknown>)['sessions'] as Array<Record<string, unknown>>)
      .find(r => r['id'] === sessionId)
    expect(rowBefore, 'sesión en el reporte').toBeTruthy()
    const expectedBefore = rowBefore!['expected_cash'] as number
    const suppliesBefore = (rowBefore!['total_supplies'] as number) ?? 0

    const res = await apiReq('POST', token, '/supplies/movements', {
      supply_id: supplyId, quantity: 2, amount: 80, note: 'e2e',
    })
    expect(res.status).toBe(201)
    const movement = dataOf(res)
    expect(movement['type']).toBe('purchase')
    expect(movement['cash_movement_id']).toBeTruthy()

    // El corte refleja la compra: salidas +80 → expected −80, y el bloque
    // informativo de insumos sube (sin re-restarse).
    const after = await apiReq('GET', token, `/reports/cash?from=2026-01-01&to=2030-01-01`)
    const rowAfter = ((after.json['data'] as Record<string, unknown>)['sessions'] as Array<Record<string, unknown>>)
      .find(r => r['id'] === sessionId)!
    expect(rowAfter['expected_cash']).toBeCloseTo(expectedBefore - 80, 2)
    expect(rowAfter['total_supplies']).toBeCloseTo(suppliesBefore + 80, 2)

    // Drill-down del corte incluye la compra.
    const detail = await apiReq('GET', token, `/reports/cash/${sessionId}/detail`)
    const purchases = (dataOf(detail)['supply_purchases'] ?? []) as Array<Record<string, unknown>>
    expect(purchases.some(p => p['name'] === supplyName && p['amount'] === 80)).toBe(true)
  })

  test('IN-02 · API: compra con caja cerrada → 422 (nada persiste)', async () => {
    // Usuario nuevo SIN caja abierta.
    const uEmail = `insumo-e2e-${Date.now()}@test.com`
    await apiReq('POST', token, '/users', {
      name: 'Sin Caja', email: uEmail, password: 'password123', store_id: storeId,
    })
    const noCashToken = await apiLogin(uEmail, 'password123')

    const res = await apiReq('POST', noCashToken, '/supplies/movements', {
      supply_id: supplyId, quantity: 1, amount: 50,
    })
    expect(res.status).toBe(422)
  })

  test('IN-03 · UI: registrar compra desde la página Insumos', async ({ page }) => {
    // Login por UI (patrón line-discounts.spec.ts).
    await page.goto(`${BASE_URL}/login`)
    await page.waitForSelector('input[type="email"]')
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 })

    await page.goto(`${BASE_URL}/insumos`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Insumos' })).toBeVisible({ timeout: 8_000 })

    // Elegir el insumo creado en beforeAll, capturar cantidad + efectivo.
    await page.locator('select').first().selectOption({ label: `${supplyName} · Empaque e2e (rollo)` })
    await page.locator('input[type="number"]').nth(0).fill('1')
    await page.locator('input[placeholder="80"]').fill('45')
    // Hay 2 botones "Registrar compra" (el tab y el submit) — usar el último (submit, full-width).
    await page.getByRole('button', { name: /Registrar compra/i }).last().click()

    await expect(page.getByText(/Compra registrada/)).toBeVisible({ timeout: 8_000 })
    // Aparece en "Compras recientes" (locator de <p>, no el <option> oculto del select).
    await expect(page.locator('p', { hasText: supplyName }).first()).toBeVisible({ timeout: 8_000 })
  })
})
