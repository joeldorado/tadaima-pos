import { test, expect, type BrowserContext } from '@playwright/test'

/**
 * Descuentos v2 — Fase 1 (2026-07-14): descuento POR LÍNEA con split.
 *
 * Caso del cliente: 3 uds de $100, 2 dañadas con −$20 c/u, 1 buena → $260.
 * Cubre: API checkout v2 (split + recompute server-side + rechazo de montos
 * manipulados) y el flujo UI (modal Desc. → split → badge → merge-back).
 */

const BASE_URL = 'http://localhost:5173'
const API_URL = 'http://localhost:8000/api/v1'
const ADMIN_EMAIL = 'admin@tadaima.mx'
const ADMIN_PASSWORD = 'password'
const TOKEN_KEY = 'tadaima_token'

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const json = (await res.json()) as { data: { token: string } }
  return json.data.token
}

async function seedAuth(context: BrowserContext, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  const token = await apiLogin(email, password)
  await context.addInitScript(args => {
    localStorage.setItem(args.key, args.token)
  }, { key: TOKEN_KEY, token })
  return token
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

test.describe('Descuentos v2 · por línea', () => {
  let token: string
  let storeId: number
  let warehouseId: number
  let sessionId: number
  let cashMethodId: number

  async function makeProduct(price: number, stock = 100): Promise<{ id: number; name: string }> {
    const name = `LineDisc ${Date.now()}-${Math.floor(Math.random() * 1e4)}`
    const prodRes = await apiReq('POST', token, '/products', {
      name, sku: `LD-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      cost: 10, active: true, prices: { price_1: price },
    })
    const id = (dataOf(prodRes)['id'] ?? 0) as number
    expect(id, `producto creado (${JSON.stringify(prodRes.json).slice(0, 200)})`).toBeGreaterThan(0)
    await apiReq('PUT', token, `/inventory/${id}/${warehouseId}`, { quantity: stock, reason: 'seed e2e' })
    return { id, name }
  }

  test.beforeAll(async () => {
    token = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)

    // Tienda + warehouse Exhibición (el POST /stores auto-crea el warehouse).
    const stores = await apiReq('GET', token, '/stores')
    const list = (stores.json['data'] ?? []) as Array<{ id: number; name: string }>
    expect(list.length).toBeGreaterThan(0)
    storeId = list[0]!.id

    const whs = await apiReq('GET', token, '/warehouses')
    const whList = (whs.json['data'] ?? []) as Array<{ id: number; store_id: number; type?: string }>
    const wh = whList.find(w => w.store_id === storeId && (w.type ?? 'store') === 'store') ?? whList.find(w => w.store_id === storeId)
    expect(wh, 'warehouse de la tienda').toBeTruthy()
    warehouseId = wh!.id

    // Método Efectivo
    const methods = await apiReq('GET', token, '/payment-methods')
    const mList = (methods.json['data'] ?? []) as Array<{ id: number; name: string }>
    const cash = mList.find(m => /efectivo/i.test(m.name)) ?? mList[0]
    expect(cash, 'método Efectivo').toBeTruthy()
    cashMethodId = cash!.id

    // Sesión de caja del admin (reusar si ya hay una abierta).
    const current = await apiReq('GET', token, '/cash/session')
    const openSession = dataOf(current)
    if (openSession && openSession['id']) {
      sessionId = openSession['id'] as number
    } else {
      const opened = await apiReq('POST', token, '/cash/open', { store_id: storeId, opening_cash: 0 })
      sessionId = (dataOf(opened)['id'] ?? (dataOf(opened)['session'] as Record<string, unknown> | undefined)?.['id'] ?? 0) as number
    }
    expect(sessionId).toBeGreaterThan(0)
  })

  test('LD-01 · API: split 2 líneas del mismo producto → $260 (caso del cliente)', async () => {
    const product = await makeProduct(100)

    const res = await apiReq('POST', token, '/sales', {
      calc_version: 2,
      store_id: storeId,
      register_session_id: sessionId,
      items: [
        { product_id: product.id, quantity: 1, price: 100 },
        { product_id: product.id, quantity: 2, price: 100, line_discount: { kind: 'fixed', basis: 'unit', value: 20, reason: 'danado' } },
      ],
      payments: [{ payment_method_id: cashMethodId, amount: 260 }],
    })

    expect(res.status).toBe(201)
    const sale = dataOf(res)
    expect(sale['subtotal']).toBe(300)
    expect(sale['discount']).toBe(40)
    expect(sale['total']).toBe(260)
    const items = (sale['items'] ?? []) as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    expect(items[1]!['discount_amount']).toBe(40)
    expect(items[1]!['discount_reason']).toBe('danado')
  })

  test('LD-02 · API: el server recomputa — pago con monto manipulado se rechaza', async () => {
    const product = await makeProduct(100)

    const res = await apiReq('POST', token, '/sales', {
      calc_version: 2,
      store_id: storeId,
      register_session_id: sessionId,
      items: [
        { product_id: product.id, quantity: 3, price: 100, line_discount: { kind: 'fixed', basis: 'unit', value: 20, reason: 'danado' } },
      ],
      // El cliente "cree" que el descuento es $50/ud → paga $150. Server: $240.
      payments: [{ payment_method_id: cashMethodId, amount: 150 }],
    })
    expect(res.status).toBe(422)
  })

  test('LD-03 · API: descuento global legacy prohibido con calc_version 2', async () => {
    const product = await makeProduct(100)

    const res = await apiReq('POST', token, '/sales', {
      calc_version: 2,
      store_id: storeId,
      register_session_id: sessionId,
      discount: 10,
      items: [{ product_id: product.id, quantity: 1, price: 100 }],
      payments: [{ payment_method_id: cashMethodId, amount: 90 }],
    })
    expect(res.status).toBe(422)
  })

  test('LD-04 · UI: modal Desc. → split → badge → total $260 → merge-back', async ({ page }) => {
    const product = await makeProduct(100)

    // Login por UI (seedAuth vía localStorage no hidrata /caja de forma
    // confiable en CI local — mismo patrón que TC-01).
    await page.goto(`${BASE_URL}/login`)
    await page.waitForSelector('input[type="email"]')
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 })

    await page.goto(`${BASE_URL}/caja`)
    await page.waitForLoadState('networkidle')

    // Admin con varias tiendas → selector de tienda antes de entrar a Caja.
    const storePicker = page.getByText(/selecciona.*tienda|elige.*tienda/i).first()
    if (await storePicker.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.getByText(/Tienda 1/).first().click()
      await page.waitForTimeout(800)
    }

    // Buscar el producto y agregarlo (la búsqueda tarda por el debounce).
    const search = page.locator('input[placeholder*="Añadir producto"], input[placeholder*="producto"]').first()
    await search.fill(product.name)
    await page.waitForTimeout(1_200)
    const card = page.getByText(product.name).first()
    await expect(card).toBeVisible({ timeout: 8_000 })
    await card.click()
    await page.waitForTimeout(300)

    // Subir a 3 unidades con el stepper "+" DE LA FILA del producto (hay
    // otros botones con "+" en la página — scope a la fila del carrito).
    const row = page.locator('.group', { hasText: product.name }).first()
    await expect(row).toBeVisible({ timeout: 5_000 })
    const plus = row.locator('button:has(svg.lucide-plus)').first()
    await plus.click()
    await page.waitForTimeout(200)
    await plus.click()
    await page.waitForTimeout(400)
    await expect(row.getByText('3', { exact: true }).first()).toBeVisible()

    // Abrir el modal de descuento de la línea.
    await row.getByRole('button', { name: /Desc\./ }).first().click()
    await expect(page.getByText('Descuento en línea')).toBeVisible({ timeout: 5_000 })

    // 2 unidades, $20 por unidad, motivo Dañado (default).
    await page.getByTestId('ld-units').fill('2')
    await expect(page.getByText(/Se separará en 2 líneas/)).toBeVisible()
    await page.getByTestId('ld-value').fill('20')
    // Preview en vivo: 2 uds × $100 − $40 = $160
    await expect(page.getByText(/= \$160/)).toBeVisible()
    await page.getByTestId('ld-confirm').click()

    // Split visible: 2 líneas del producto + badge con motivo.
    await expect(page.getByText(product.name)).toHaveCount(2)
    await expect(page.getByText(/−\$40 · Dañado/)).toBeVisible()

    // Total a pagar = $260 (1×$100 + 2×$100 − $40).
    await expect(page.getByText('$260').first()).toBeVisible()

    // Merge-back: quitar el descuento re-fusiona a una sola línea de 3.
    await page.getByText(/−\$40 · Dañado/).click()
    await expect(page.getByText(product.name)).toHaveCount(1)
    await expect(page.getByText('$300').first()).toBeVisible()
  })
})
