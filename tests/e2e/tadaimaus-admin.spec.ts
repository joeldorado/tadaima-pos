import { test, expect, type Page } from '@playwright/test'

/**
 * Panel de administración de TadaimaUS (`tadaimaus/src/admin/`, ruta `#/admin`
 * de la MISMA app standalone que la tienda, dev port 5178).
 *
 * Requiere `npm run dev:us` corriendo aparte — igual que el spec de la tienda,
 * este puerto no está en el `playwright.config.ts` de la raíz.
 *
 * Todo el backend va mockeado con `page.route` (login, /auth/me, listings y
 * leads): no hace falta PHP ni una cuenta sembrada, y el resultado no depende
 * de lo que tenga cada base local.
 */

const US_BASE_URL = 'http://localhost:5178'
const TOKEN = 'fake-sanctum-token'

const ADMIN_USER = {
  id: 1,
  name: 'Admin',
  email: 'admin@tadaima.mx',
  roles: ['admin'],
}

const CASHIER_USER = { ...ADMIN_USER, id: 2, email: 'cajero@tadaima.mx', roles: ['cajero'] }

interface RawListing {
  id: number
  name: string
  description: string | null
  price_usd: string
  category: string
  image_url: string | null
  visible: boolean
  in_stock: boolean
  is_custom: boolean
  created_at: string
}

function seedListings(): RawListing[] {
  return [
    {
      id: 1,
      name: 'Rengoku Figure',
      description: 'Scale figure',
      price_usd: '45.00',
      category: 'figures',
      image_url: null,
      visible: true,
      in_stock: true,
      is_custom: true,
      created_at: '2026-08-01T10:00:00Z',
    },
    {
      id: 2,
      name: 'Naruto Manga Vol. 1',
      description: null,
      price_usd: '9.99',
      category: 'manga',
      image_url: null,
      visible: false,
      in_stock: true,
      is_custom: true,
      created_at: '2026-08-02T10:00:00Z',
    },
  ]
}

const LEADS = [
  {
    id: 1,
    source: 'newsletter',
    name: null,
    email: 'fan@example.com',
    subject: null,
    message: null,
    marketing_consent: true,
    created_at: '2026-08-05T18:30:00Z',
  },
  {
    id: 2,
    source: 'contact',
    name: 'Jamie',
    email: 'jamie@example.com',
    subject: 'Shipping',
    message: 'Do you ship to Texas?',
    marketing_consent: false,
    created_at: '2026-08-04T12:00:00Z',
  },
]

function ok(data: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data, message: null }),
  }
}

function fail(error: string, status: number) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, error }),
  }
}

/**
 * Backend falso con estado: las mutaciones se reflejan en los GET siguientes,
 * que es lo que hace significativo probar ocultar / editar precio / borrar.
 */
async function mockBackend(page: Page, user = ADMIN_USER): Promise<RawListing[]> {
  const listings = seedListings()
  let nextId = 100

  await page.route('**/api/v1/auth/login', async (route) => {
    const body = route.request().postDataJSON() as { email: string; password: string }
    if (body.password !== 'correct-horse') {
      await route.fulfill(fail('Credenciales incorrectas.', 401))
      return
    }
    await route.fulfill(ok({ token: TOKEN, user }))
  })

  await page.route('**/api/v1/auth/me', async (route) => route.fulfill(ok(user)))
  await page.route('**/api/v1/auth/logout', async (route) => route.fulfill(ok(null)))

  await page.route('**/api/v1/us/listings**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const idMatch = url.pathname.match(/\/us\/listings\/(\d+)$/)

    if (request.method() === 'GET') {
      const search = url.searchParams.get('search')?.toLowerCase() ?? ''
      const data = listings.filter((item) => item.name.toLowerCase().includes(search))
      await route.fulfill(ok(data))
      return
    }

    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>
      const created: RawListing = {
        id: nextId++,
        name: String(body['name']),
        description: (body['description'] as string | null) ?? null,
        price_usd: Number(body['price_usd']).toFixed(2),
        category: String(body['category'] ?? 'other'),
        image_url: (body['image_url'] as string | null) ?? null,
        visible: true,
        in_stock: true,
        is_custom: true,
        created_at: '2026-08-10T10:00:00Z',
      }
      listings.unshift(created)
      await route.fulfill(ok(created, 201))
      return
    }

    const id = Number(idMatch?.[1])
    const index = listings.findIndex((item) => item.id === id)

    if (request.method() === 'PUT' && index >= 0) {
      const body = request.postDataJSON() as Record<string, unknown>
      const current = listings[index]!
      const updated: RawListing = {
        ...current,
        ...(body['name'] !== undefined ? { name: String(body['name']) } : {}),
        ...(body['category'] !== undefined ? { category: String(body['category']) } : {}),
        ...(body['visible'] !== undefined ? { visible: Boolean(body['visible']) } : {}),
        ...(body['price_usd'] !== undefined
          ? { price_usd: Number(body['price_usd']).toFixed(2) }
          : {}),
      }
      listings[index] = updated
      await route.fulfill(ok(updated))
      return
    }

    if (request.method() === 'DELETE' && index >= 0) {
      listings.splice(index, 1)
      await route.fulfill(ok(null))
      return
    }

    await route.fulfill(fail('Not found', 404))
  })

  await page.route('**/api/v1/us/leads**', async (route) => {
    const source = new URL(route.request().url()).searchParams.get('source')
    const data = source === null ? LEADS : LEADS.filter((lead) => lead.source === source)
    await route.fulfill(ok(data))
  })

  return listings
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`${US_BASE_URL}/#/admin`)
  await page.fill('#admin-email', ADMIN_USER.email)
  await page.fill('#admin-password', 'correct-horse')
  await page.click('button[type=submit]')
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible()
}

test.describe('TadaimaUS admin · login', () => {
  test('pide credenciales antes de mostrar nada del panel', async ({ page }) => {
    await mockBackend(page)
    await page.goto(`${US_BASE_URL}/#/admin`)

    await expect(page.locator('.admin-login-card')).toBeVisible()
    await expect(page.locator('.admin-table')).toHaveCount(0)
  })

  test('rechaza credenciales malas en inglés, no en español', async ({ page }) => {
    await mockBackend(page)
    await page.goto(`${US_BASE_URL}/#/admin`)

    await page.fill('#admin-email', ADMIN_USER.email)
    await page.fill('#admin-password', 'nope')
    await page.click('button[type=submit]')

    // El backend contesta "Credenciales incorrectas."; el panel lo traduce.
    await expect(page.locator('.admin-error')).toHaveText('Wrong email or password.')
    await expect(page.locator('.admin-table')).toHaveCount(0)
  })

  test('una cuenta sin rol admin no entra (el backend la 403-earía igual)', async ({ page }) => {
    await mockBackend(page, CASHIER_USER)
    await page.goto(`${US_BASE_URL}/#/admin`)

    await page.fill('#admin-email', CASHIER_USER.email)
    await page.fill('#admin-password', 'correct-horse')
    await page.click('button[type=submit]')

    await expect(page.locator('.admin-error')).toContainText('cannot manage the store')
    await expect(page.locator('.admin-table')).toHaveCount(0)
  })

  test('la sesión sobrevive a una recarga', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    await page.reload()
    await expect(page.locator('.admin-table tbody tr').first()).toBeVisible()
    await expect(page.locator('.admin-login-card')).toHaveCount(0)
  })

  test('cerrar sesión regresa al login y limpia el token', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    await page.click('button:has-text("Sign out")')
    await expect(page.locator('.admin-login-card')).toBeVisible()

    const token = await page.evaluate(() =>
      window.localStorage.getItem('tadaimaus-admin-token-v1'),
    )
    expect(token).toBeNull()
  })
})

test.describe('TadaimaUS admin · artículos', () => {
  test('lista los artículos con su estatus', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    await expect(page.locator('.admin-table tbody tr')).toHaveCount(2)
    await expect(page.locator('.admin-head-count')).toHaveText('2 items in the store')

    const rows = page.locator('.admin-table tbody tr')
    await expect(rows.nth(0)).toContainText('Rengoku Figure')
    await expect(rows.nth(0).locator('.admin-badge')).toHaveText('Live')
    // El segundo viene con visible=false en el fixture.
    await expect(rows.nth(1).locator('.admin-badge')).toHaveText('Hidden')
  })

  test('crea un artículo y aparece en la tabla', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    await page.click('button:has-text("New item")')
    await page.fill('#listing-name', 'Gojo Figure')
    await page.fill('#listing-price', '52.5')
    await page.selectOption('#listing-category', 'figures')
    await page.click('button:has-text("Create item")')

    await expect(page.locator('.admin-table tbody tr')).toHaveCount(3)
    await expect(page.locator('.admin-cell-name', { hasText: 'Gojo Figure' })).toBeVisible()
    await expect(page.locator('.admin-cell-input').first()).toHaveValue('52.50')
  })

  test('no deja crear sin nombre ni con precio en cero', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    await page.click('button:has-text("New item")')
    await page.fill('#listing-price', '10')
    await page.click('button:has-text("Create item")')
    await expect(page.locator('.admin-modal .admin-error')).toContainText('name')

    await page.fill('#listing-name', 'Sin precio')
    await page.fill('#listing-price', '0')
    await page.click('button:has-text("Create item")')
    await expect(page.locator('.admin-modal .admin-error')).toContainText('greater than 0')

    // Nada se creó.
    await page.click('button:has-text("Cancel")')
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(2)
  })

  test('el ojo alterna la visibilidad y el badge la refleja', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    const row = page.locator('.admin-table tbody tr').first()
    await expect(row.locator('.admin-badge')).toHaveText('Live')

    await row.locator('button[aria-label="Hide Rengoku Figure from the store"]').click()
    await expect(row.locator('.admin-badge')).toHaveText('Hidden')

    await row.locator('button[aria-label="Show Rengoku Figure in the store"]').click()
    await expect(row.locator('.admin-badge')).toHaveText('Live')
  })

  test('el precio se edita en la celda y Escape revierte', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    const price = page.locator('.admin-cell-input').first()
    await expect(price).toHaveValue('45.00')

    await price.fill('61.5')
    await price.press('Enter')
    await expect(price).toHaveValue('61.50')

    // Escape descarta el borrador sin mandar nada al servidor.
    await price.fill('999')
    await price.press('Escape')
    await expect(price).toHaveValue('61.50')
  })

  test('el buscador filtra contra el servidor', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    await page.fill('#admin-listing-search', 'naruto')
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)
    await expect(page.locator('.admin-cell-name')).toContainText('Naruto')

    await page.fill('#admin-listing-search', 'zzznomatch')
    await expect(page.locator('.admin-state-title')).toHaveText('No matches')
  })

  test('borrar pide confirmación y quita la fila', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    page.once('dialog', (dialog) => void dialog.accept())
    await page.click('button[aria-label="Delete Rengoku Figure"]')

    await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)
    await expect(page.locator('.admin-cell-name', { hasText: 'Rengoku' })).toHaveCount(0)
  })

  test('cancelar la confirmación NO borra', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    page.once('dialog', (dialog) => void dialog.dismiss())
    await page.click('button[aria-label="Delete Rengoku Figure"]')

    await expect(page.locator('.admin-table tbody tr')).toHaveCount(2)
  })
})

test.describe('TadaimaUS admin · leads', () => {
  test('lista los leads con su badge de opt-in y filtra por origen', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    await page.click('.admin-nav a:has-text("Leads")')
    await expect(page.locator('.admin-lead')).toHaveCount(2)
    await expect(page.locator('.admin-badge', { hasText: 'Opt-in' })).toHaveCount(1)
    await expect(page.locator('.admin-lead').nth(1)).toContainText('Do you ship to Texas?')
    // El asunto se muestra aparte del mensaje.
    await expect(page.locator('.admin-lead-subject')).toHaveText('Shipping')
    // El del newsletter no trae asunto: no debe pintar el párrafo vacío.
    await expect(page.locator('.admin-lead').nth(0).locator('.admin-lead-subject')).toHaveCount(0)

    await page.click('.admin-chip:has-text("Contact")')
    await expect(page.locator('.admin-lead')).toHaveCount(1)
    await expect(page.locator('.admin-lead')).toContainText('jamie@example.com')
  })
})

test.describe('TadaimaUS admin · aislamiento de la tienda', () => {
  test('el panel no monta header, footer ni carrito de la tienda', async ({ page }) => {
    await mockBackend(page)
    await signIn(page)

    await expect(page.locator('header.site-header')).toHaveCount(0)
    await expect(page.locator('.site-footer')).toHaveCount(0)
    await expect(page.locator('.drawer')).toHaveCount(0)
  })

  test('el ícono de login del header lleva al login del CLIENTE (no al panel)', async ({ page }) => {
    // Desde las cuentas de cliente (2026-08), "Sign in" es la sesión del
    // comprador; el panel de admin queda accesible SOLO tecleando #/admin.
    await mockBackend(page)
    await page.goto(`${US_BASE_URL}/`)

    const login = page.locator('header.site-header a.header-login')
    await expect(login).toBeVisible()
    await expect(login).toHaveAttribute('href', '#/login')

    await login.click()
    await expect(page.locator('.customer-login')).toBeVisible()
    await expect(page).toHaveURL(/#\/login$/)
  })

  test('el ícono de login sigue tocable en móvil (pierde el texto, no el botón)', async ({
    page,
  }) => {
    await mockBackend(page)
    await page.setViewportSize({ width: 390, height: 780 })
    await page.goto(`${US_BASE_URL}/`)

    const login = page.locator('a.header-login')
    await expect(login).toBeVisible()
    await expect(page.locator('.header-login-label')).toBeHidden()
    const box = await login.boundingBox()
    // Objetivo táctil mínimo razonable — no un ícono de 12px imposible de picar.
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36)
  })
})
