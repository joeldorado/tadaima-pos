import { test, expect, type Page } from '@playwright/test'

/**
 * TadaimaUS — cuentas de CLIENTE (checkout con registro, login, My Orders).
 * Igual que los otros specs de tadaimaus: requiere `npm run dev:us` en :5178
 * y TODO el backend va mockeado con page.route (sin PHP).
 */

const US_BASE_URL = 'http://localhost:5178'

const CUSTOMER = {
  id: 7,
  name: 'John Doe',
  email: 'john@example.com',
  phone: '6195550100',
  address: '742 Evergreen Terrace',
  city: 'San Diego',
  state: 'CA',
  zip: '92101',
  country: 'United States',
}

const FIXTURE_LISTING = {
  id: 1,
  name: 'Rengoku Figure',
  description: null,
  price_usd: '45.00',
  image_url: null,
  category: 'figures',
  sold_out: false,
}

async function mockCatalog(page: Page): Promise<void> {
  await page.route('**/us/catalog**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [FIXTURE_LISTING], message: null }),
    })
  })
}

/** Sesión de cliente ya iniciada: token en storage + /us/account/me válido. */
async function mockSignedInCustomer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('tadaimaus-customer-token-v1', 'test-token')
  })
  await page.route('**/us/account/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: CUSTOMER, message: null }),
    })
  })
}

async function addItemToCart(page: Page): Promise<void> {
  await page.goto(`${US_BASE_URL}/#/product/1`)
  await page.getByRole('button', { name: 'Add to cart' }).click()
  // El drawer se abre al agregar — cerrarlo para navegar sin estorbo.
  await page.keyboard.press('Escape')
}

test.beforeEach(async ({ page }) => {
  await mockCatalog(page)
})

// ─── Login del cliente ───────────────────────────────────────────────────────

test.describe('TadaimaUS cuentas · login', () => {
  test('credenciales malas muestran el error del backend', async ({ page }) => {
    await page.route('**/us/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Invalid credentials. Please check your email or phone and password.',
        }),
      })
    })

    await page.goto(`${US_BASE_URL}/#/login`)
    await page.locator('#login-identifier').fill('john@example.com')
    await page.locator('#login-password').fill('wrong')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.locator('.form-server-error')).toContainText('Invalid credentials')
    await expect(page).toHaveURL(/#\/login$/)
  })

  test('login correcto redirige a My Orders y el header muestra el nombre', async ({ page }) => {
    await page.route('**/us/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { token: 'test-token', customer: CUSTOMER },
          message: 'Signed in.',
        }),
      })
    })
    await page.route('**/us/account/orders', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], message: null }),
      })
    })

    await page.goto(`${US_BASE_URL}/#/login`)
    await page.locator('#login-identifier').fill('john@example.com')
    await page.locator('#login-password').fill('super-secret-1')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page).toHaveURL(/#\/account$/)
    // El header cambia a menú de cuenta con el primer nombre.
    await expect(page.locator('button.header-login .header-login-label')).toHaveText('John')
  })
})

// ─── Guard de la cuenta ──────────────────────────────────────────────────────

test.describe('TadaimaUS cuentas · guard', () => {
  test('#/account sin sesión redirige al login', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/#/account`)
    await expect(page).toHaveURL(/#\/login$/)
    await expect(page.locator('.customer-login')).toBeVisible()
  })
})

// ─── My Orders ───────────────────────────────────────────────────────────────

test.describe('TadaimaUS cuentas · My Orders', () => {
  test('lista pedidos con folio, badge de status e items', async ({ page }) => {
    await mockSignedInCustomer(page)
    await page.route('**/us/account/orders', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 1,
              order_number: 'TUS-000001',
              status: 'new',
              total_usd: '90.00',
              created_at: '2026-08-12T10:00:00Z',
              shipping: {
                address: '742 Evergreen Terrace', city: 'San Diego',
                state: 'CA', zip: '92101', country: 'United States',
              },
              items: [
                { id: 9, name: 'Rengoku Figure', price_usd: '45.00', quantity: 2, line_total_usd: '90.00' },
              ],
            },
          ],
          message: null,
        }),
      })
    })

    await page.goto(`${US_BASE_URL}/#/account`)

    await expect(page.locator('.account-order-number')).toHaveText('TUS-000001')
    await expect(page.locator('.status-badge')).toHaveText('Received')
    await expect(page.locator('.account-order-items')).toContainText('Rengoku Figure')
    await expect(page.locator('.account-order-total')).toContainText('USD 90.00')
  })
})

// ─── Checkout con cuenta ─────────────────────────────────────────────────────

test.describe('TadaimaUS cuentas · checkout', () => {
  test('invitado: crea cuenta con el pedido, auto-login y confirmación completa', async ({ page }) => {
    await page.route('**/us/orders', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      // El payload lleva TODOS los campos nuevos (dirección + password).
      expect(body['address']).toBe('742 Evergreen Terrace')
      expect(body['zip']).toBe('92101')
      expect(body['password']).toBe('super-secret-1')
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            order_number: 'TUS-000042',
            total_usd: '45.00',
            token: 'fresh-token',
            customer: { id: 7, name: 'John Doe', email: 'john@example.com' },
            shipping: {
              address: '742 Evergreen Terrace', city: 'San Diego',
              state: 'CA', zip: '92101', country: 'United States',
            },
          },
          message: 'Order received',
        }),
      })
    })

    await addItemToCart(page)
    await page.goto(`${US_BASE_URL}/#/checkout`)

    await page.locator('#checkout-name').fill('John Doe')
    await page.locator('#checkout-email').fill('john@example.com')
    await page.locator('#checkout-phone').fill('619 555 0100')
    await page.locator('#checkout-address').fill('742 Evergreen Terrace')
    await page.locator('#checkout-city').fill('San Diego')
    await page.locator('#checkout-state').fill('CA')
    await page.locator('#checkout-zip').fill('92101')
    // country ya trae "United States" por default
    await page.locator('#checkout-password').fill('super-secret-1')
    await page.getByRole('button', { name: 'Place Order' }).click()

    // Confirmación estilo Wix: gracias + folio + 3 columnas + CTA a la cuenta.
    await expect(page.locator('.order-success h1')).toContainText('Thank you, John')
    await expect(page.locator('.order-success-number')).toContainText('TUS-000042')
    await expect(page.locator('.order-success-details')).toContainText('742 Evergreen Terrace')
    await expect(page.locator('.order-success-details')).toContainText('Cash on Delivery')
    await expect(page.getByRole('link', { name: 'View my orders' })).toBeVisible()

    // Auto-login: header con menú de cuenta y token persistido.
    await expect(page.locator('button.header-login .header-login-label')).toHaveText('John')
    const stored = await page.evaluate(() =>
      window.localStorage.getItem('tadaimaus-customer-token-v1'),
    )
    expect(stored).toBe('fresh-token')
  })

  test('email ya registrado: CTA "Sign in to continue" lleva al login', async ({ page }) => {
    await page.route('**/us/orders', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          code: 'account_exists',
          error: 'An account with this email already exists. Please sign in to place your order.',
          errors: { email: ['An account with this email already exists.'] },
        }),
      })
    })

    await addItemToCart(page)
    await page.goto(`${US_BASE_URL}/#/checkout`)

    await page.locator('#checkout-name').fill('John Doe')
    await page.locator('#checkout-email').fill('john@example.com')
    await page.locator('#checkout-phone').fill('619 555 0100')
    await page.locator('#checkout-address').fill('742 Evergreen Terrace')
    await page.locator('#checkout-city').fill('San Diego')
    await page.locator('#checkout-state').fill('CA')
    await page.locator('#checkout-zip').fill('92101')
    await page.locator('#checkout-password').fill('super-secret-1')
    await page.getByRole('button', { name: 'Place Order' }).click()

    const cta = page.locator('.checkout-account-exists')
    await expect(cta).toContainText('This email already has an account.')
    await cta.getByRole('button', { name: 'Sign in to continue' }).click()
    await expect(page).toHaveURL(/#\/login$/)
  })

  test('logueado: banner, datos pre-llenados y orden sin password', async ({ page }) => {
    await mockSignedInCustomer(page)
    await page.route('**/us/orders', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      expect(body['password']).toBeUndefined()
      expect(body['email']).toBe('john@example.com')
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { order_number: 'TUS-000043', total_usd: '45.00' },
          message: 'Order received',
        }),
      })
    })

    await addItemToCart(page)
    await page.goto(`${US_BASE_URL}/#/checkout`)

    // Banner de sesión + resumen de datos (sin form) con botón Change.
    await expect(page.locator('.checkout-banner')).toContainText('john@example.com')
    await expect(page.locator('.checkout-details-summary')).toContainText('742 Evergreen Terrace')
    await expect(page.locator('#checkout-password')).toHaveCount(0)

    await page.getByRole('button', { name: 'Place Order' }).click()
    await expect(page.locator('.order-success-number')).toContainText('TUS-000043')
  })
})
