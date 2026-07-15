import { test, expect } from '@playwright/test'

/**
 * Promociones NxM (Fase 3): el server aplica la mejor promo vigente por línea
 * (PR-01/02 API) y la Caja muestra el badge verde + total con promo (PR-03 UI).
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

test.describe('Promociones NxM', () => {
  let token: string
  let storeId: number
  let warehouseId: number
  let sessionId: number
  let cashMethodId: number

  async function makeProductWithPromo(price: number, buyN: number, payM: number, promoName: string) {
    const name = `Promo e2e ${Date.now()}-${Math.floor(Math.random() * 1e4)}`
    const prodRes = await apiReq('POST', token, '/products', {
      name, sku: `PR-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      cost: 10, active: true, prices: { price_1: price },
    })
    const id = (dataOf(prodRes)['id'] ?? 0) as number
    expect(id).toBeGreaterThan(0)
    await apiReq('PUT', token, `/inventory/${id}/${warehouseId}`, { quantity: 100, reason: 'seed e2e' })
    const promoRes = await apiReq('POST', token, `/products/${id}/promotions`, {
      name: promoName, buy_n: buyN, pay_m: payM,
    })
    expect(promoRes.status).toBe(201)
    return { id, name }
  }

  test.beforeAll(async () => {
    token = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)

    const stores = await apiReq('GET', token, '/stores')
    storeId = ((stores.json['data'] ?? []) as Array<{ id: number }>)[0]!.id

    const whs = await apiReq('GET', token, '/warehouses')
    const whList = (whs.json['data'] ?? []) as Array<{ id: number; store_id: number; type?: string }>
    warehouseId = (whList.find(w => w.store_id === storeId && (w.type ?? 'store') === 'store') ?? whList[0])!.id

    const methods = await apiReq('GET', token, '/payment-methods')
    const mList = (methods.json['data'] ?? []) as Array<{ id: number; name: string }>
    cashMethodId = (mList.find(m => /efectivo/i.test(m.name)) ?? mList[0])!.id

    const current = await apiReq('GET', token, '/cash/session')
    const openSession = dataOf(current)
    if (openSession && openSession['id']) {
      sessionId = openSession['id'] as number
    } else {
      const opened = await apiReq('POST', token, '/cash/open', { store_id: storeId, opening_cash: 0 })
      sessionId = (dataOf(opened)['id'] ?? 0) as number
    }
    expect(sessionId).toBeGreaterThan(0)
  })

  test('PR-01 · API: 2x1 aplica server-side con snapshot en la venta', async () => {
    const product = await makeProductWithPromo(50, 2, 1, '2x1 e2e')

    const res = await apiReq('POST', token, '/sales', {
      calc_version: 2,
      store_id: storeId,
      register_session_id: sessionId,
      items: [{ product_id: product.id, quantity: 2, price: 50 }],
      payments: [{ payment_method_id: cashMethodId, amount: 50 }],
    })

    expect(res.status).toBe(201)
    const sale = dataOf(res)
    expect(sale['subtotal']).toBe(100)
    expect(sale['discount']).toBe(50)
    expect(sale['total']).toBe(50)
    const items = (sale['items'] ?? []) as Array<Record<string, unknown>>
    expect(items[0]!['benefit_type']).toBe('promo')
    expect(items[0]!['promo_name']).toBe('2x1 e2e')
    expect(items[0]!['promo_free_qty']).toBe(1)
  })

  test('PR-02 · API: promo pausada NO aplica (pagar con promo → 422)', async () => {
    const product = await makeProductWithPromo(50, 2, 1, 'Pausada e2e')
    // Pausar la promo recién creada.
    const list = await apiReq('GET', token, `/products/${product.id}/promotions`)
    const promo = ((list.json['data'] ?? []) as Array<Record<string, unknown>>)[0]!
    await apiReq('PUT', token, `/products/${product.id}/promotions/${promo['id']}`, {
      name: promo['name'], buy_n: promo['buy_n'], pay_m: promo['pay_m'], status: 'paused',
    })

    // Intentar pagar como si la promo aplicara → el server recomputa full → 422.
    const bad = await apiReq('POST', token, '/sales', {
      calc_version: 2,
      store_id: storeId,
      register_session_id: sessionId,
      items: [{ product_id: product.id, quantity: 2, price: 50 }],
      payments: [{ payment_method_id: cashMethodId, amount: 50 }],
    })
    expect(bad.status).toBe(422)

    // Precio completo sí pasa.
    const ok = await apiReq('POST', token, '/sales', {
      calc_version: 2,
      store_id: storeId,
      register_session_id: sessionId,
      items: [{ product_id: product.id, quantity: 2, price: 50 }],
      payments: [{ payment_method_id: cashMethodId, amount: 100 }],
    })
    expect(ok.status).toBe(201)
    expect(dataOf(ok)['discount']).toBe(0)
  })

  test('PR-03 · UI: badge verde de promo + total con descuento en Caja', async ({ page }) => {
    const product = await makeProductWithPromo(100, 2, 1, '2x1 Verano')

    await page.goto(`${BASE_URL}/login`)
    await page.waitForSelector('input[type="email"]')
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 })

    await page.goto(`${BASE_URL}/caja`)
    await page.waitForLoadState('networkidle')

    const search = page.locator('input[placeholder*="Añadir producto"], input[placeholder*="producto"]').first()
    await search.fill(product.name)
    await page.waitForTimeout(1_200)
    const card = page.getByText(product.name).first()
    await expect(card).toBeVisible({ timeout: 8_000 })
    await card.click()
    await page.waitForTimeout(300)

    // Con 1 pieza NO hay promo todavía.
    await expect(page.getByText(/2x1 Verano · 1 gratis/)).toHaveCount(0)

    // Subir a 2 piezas → el badge verde aparece y el total baja a $100.
    const row = page.locator('.group', { hasText: product.name }).first()
    await row.locator('button:has(svg.lucide-plus)').first().click()
    await page.waitForTimeout(400)

    await expect(page.getByText(/2x1 Verano · 1 gratis/)).toBeVisible({ timeout: 5_000 })
    // Total a Pagar = $100 (2×$100 − $100 de promo). Locator de <p> exacto —
    // getByText suelto matchea el <option> oculto "Normal $100" del select.
    await expect(page.locator('p', { hasText: /^\$100$/ }).first()).toBeVisible({ timeout: 5_000 })
  })
})
