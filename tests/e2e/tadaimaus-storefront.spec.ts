import { test, expect, type Page } from '@playwright/test'

/**
 * TadaimaUS storefront (`tadaimaus/`, standalone app, dev port 5178).
 * Requires `npm run dev:us` running separately — NOT covered by the root
 * `playwright.config.ts` (no `webServer`, no baseURL for this port).
 *
 * All `/us/catalog` and `/us/leads` calls are mocked via `page.route` — no
 * backend/PHP needed, and results don't depend on what's seeded per
 * environment. Cross-app coverage (admin creates a dummy listing → shows up
 * here) is intentionally out of scope; see the plan doc for why.
 */

const US_BASE_URL = 'http://localhost:5178'

interface FixtureListing {
  readonly id: number
  readonly name: string
  readonly description: string | null
  readonly price_usd: string
  readonly image_url: string | null
  readonly category: 'figures' | 'manga' | 'tcg' | 'other'
}

const FIXTURE_LISTINGS: readonly FixtureListing[] = [
  { id: 1, name: 'Rengoku Figure', description: null, price_usd: '45.00', image_url: null, category: 'figures' },
  { id: 2, name: 'Nezuko Figure', description: null, price_usd: '38.00', image_url: null, category: 'figures' },
  { id: 3, name: 'Naruto Manga Vol. 1', description: null, price_usd: '9.99', image_url: null, category: 'manga' },
  { id: 4, name: 'One Piece TCG Booster', description: null, price_usd: '5.50', image_url: null, category: 'tcg' },
]

async function mockCatalog(page: Page): Promise<void> {
  await page.route('**/us/catalog**', async (route) => {
    const url = new URL(route.request().url())
    const category = url.searchParams.get('category')
    const search = url.searchParams.get('search')?.toLowerCase() ?? ''

    const data = FIXTURE_LISTINGS.filter((listing) => {
      if (category !== null && listing.category !== category) return false
      if (search !== '' && !listing.name.toLowerCase().includes(search)) return false
      return true
    })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data, message: null }),
    })
  })
}

async function mockLeadsSuccess(page: Page): Promise<void> {
  await page.route('**/us/leads', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: null, message: 'ok' }),
    })
  })
}

test.beforeEach(async ({ page }) => {
  await mockCatalog(page)
  await mockLeadsSuccess(page)
})

test.describe('TadaimaUS storefront · home', () => {
  test('hero, carrusel featured y tiles de categoría', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/`)

    await expect(page.locator('h1#hero-heading')).toBeVisible()
    await expect(page.locator('.hero-dot')).toHaveCount(3)

    await expect(page.locator('article.product-card')).toHaveCount(FIXTURE_LISTINGS.length)
    for (const listing of FIXTURE_LISTINGS) {
      await expect(page.locator('.product-name', { hasText: listing.name })).toBeVisible()
    }

    const tiles = page.locator('.category-tile')
    await expect(tiles).toHaveCount(3)
    await expect(page.locator('.category-tile[href="#/figures"]')).toContainText('Figures')
    await expect(page.locator('.category-tile[href="#/manga"]')).toContainText('Manga')
    await expect(page.locator('.category-tile[href="#/tcg"]')).toContainText('TCG')
  })
})

test.describe('TadaimaUS storefront · filtros de categoría', () => {
  test('la página de Figures solo muestra figuras', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/#/figures`)

    await expect(page.locator('h1.page-title')).toHaveText('Figures')
    await expect(page.locator('.product-name', { hasText: 'Rengoku Figure' })).toBeVisible()
    await expect(page.locator('.product-name', { hasText: 'Nezuko Figure' })).toBeVisible()
    await expect(page.locator('.product-name', { hasText: 'Naruto Manga Vol. 1' })).toHaveCount(0)
    await expect(page.locator('.product-name', { hasText: 'One Piece TCG Booster' })).toHaveCount(0)
  })
})

test.describe('TadaimaUS storefront · search', () => {
  test('filtra con resultados, muestra "no results" y limpia', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/#/figures`)
    const search = page.getByLabel('Search Figures')

    const [matchResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/us/catalog') && res.url().toLowerCase().includes('search=rengoku')),
      search.fill('Rengoku'),
    ])
    expect(matchResponse.ok()).toBe(true)
    await expect(page.locator('.product-name')).toHaveCount(1)
    await expect(page.locator('.product-name', { hasText: 'Rengoku Figure' })).toBeVisible()

    const [noMatchResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/us/catalog') && res.url().includes('search=zzznomatch')),
      search.fill('zzznomatch'),
    ])
    expect(noMatchResponse.ok()).toBe(true)
    await expect(page.getByText('No results for “zzznomatch”')).toBeVisible()

    const [clearedResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/us/catalog') && res.url().includes('category=figures') && !res.url().includes('search='),
      ),
      page.getByRole('button', { name: 'Clear search' }).click(),
    ])
    expect(clearedResponse.ok()).toBe(true)
    await expect(page.locator('.product-name')).toHaveCount(2)
  })
})

test.describe('TadaimaUS storefront · newsletter', () => {
  test('valida el email y luego se suscribe', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/`)
    const email = page.locator('#newsletter-email')
    const submit = page.getByRole('button', { name: 'Sign Up' })

    await email.fill('not-an-email')
    await submit.click()
    await expect(page.getByText('Please enter a valid email address.')).toBeVisible()

    await email.fill('collector@example.com')
    await submit.click()
    await expect(page.getByText('You’re in — welcome home!')).toBeVisible()
  })

  test('manda marketing_consent según el checkbox', async ({ page }) => {
    // Sin marcar: el lead se guarda pero NO consintió publicidad.
    await page.goto(`${US_BASE_URL}/`)
    await page.locator('#newsletter-email').fill('nooptin@example.com')

    const [noConsent] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/us/leads') && req.method() === 'POST'),
      page.getByRole('button', { name: 'Sign Up' }).click(),
    ])
    expect(noConsent.postDataJSON()).toMatchObject({ marketing_consent: false })

    // Marcado: consentimiento explícito.
    await page.goto(`${US_BASE_URL}/`)
    await page.locator('#newsletter-email').fill('optin@example.com')
    await page.getByLabel('I want to subscribe to your mailing list.').check()

    const [withConsent] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/us/leads') && req.method() === 'POST'),
      page.getByRole('button', { name: 'Sign Up' }).click(),
    ])
    expect(withConsent.postDataJSON()).toMatchObject({ marketing_consent: true })
  })
})

test.describe('TadaimaUS storefront · ficha de producto', () => {
  test('breadcrumbs sin numeración y con separadores', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/#/product/1`)

    const crumbs = page.locator('.breadcrumbs li')
    await expect(crumbs).toHaveCount(3)
    await expect(crumbs.nth(2)).toHaveAttribute('aria-current', 'page')

    // El <ol> hereda marcadores decimales del navegador si nadie los apaga —
    // fue un bug real ("1. Home2. Figures3. …"), por eso se afirma explícito.
    const listStyle = await page
      .locator('.breadcrumbs ol')
      .evaluate((el) => getComputedStyle(el).listStyleType)
    expect(listStyle).toBe('none')

    await expect(page.locator('.breadcrumbs a').nth(1)).toHaveAttribute('href', '#/figures')
  })

  test('el selector de cantidad manda N unidades al carrito', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/#/product/1`)

    await page.getByRole('button', { name: 'Increase quantity' }).click()
    await page.getByRole('button', { name: 'Increase quantity' }).click()
    await expect(page.locator('.qty-stepper output')).toHaveText('3')

    await page.getByRole('button', { name: 'Add to cart' }).click()

    const drawer = page.locator('.drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText('Rengoku Figure')).toBeVisible()
    // 3 × USD 45.00 — el subtotal prueba que la cantidad viajó completa.
    await expect(page.locator('.drawer-subtotal-amount')).toHaveText('USD 135.00')
  })

  test('prev/next se mueve entre productos de la misma categoría', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/#/product/1`)

    // Primer item de Figures: no hay anterior.
    await expect(page.getByRole('button', { name: '← Previous' })).toBeDisabled()

    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.locator('.product-detail-title')).toHaveText('Nezuko Figure')
    await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled()
  })
})

test.describe('TadaimaUS storefront · catálogo', () => {
  test('Goods es navegable desde el nav y el sidebar', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/`)

    await page.locator('.site-header').getByRole('link', { name: 'Goods' }).click()
    await expect(page.locator('h1.page-title')).toHaveText('Goods')

    // La lista lateral incluye las 4 categorías + "All".
    await expect(page.locator('.category-filter-list button, .category-filter-list a')).toHaveCount(5)
  })

  test('las cartas no llevan botón de compra (se compra en la ficha)', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/#/figures`)

    await expect(page.locator('article.product-card')).not.toHaveCount(0)
    await expect(page.locator('article.product-card button')).toHaveCount(0)
    await expect(page.locator('.product-price').first()).toHaveText('USD 45.00')
  })
})

test.describe('TadaimaUS storefront · contacto', () => {
  test('valida campos vacíos y luego envía', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/#/contact`)

    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText('Please enter your name.')).toBeVisible()
    await expect(page.getByText('Please enter your email address.')).toBeVisible()
    await expect(page.getByText('Please enter a subject.')).toBeVisible()
    await expect(page.getByText('Please write a short message.')).toBeVisible()

    await page.locator('#contact-name').fill('Ada Lovelace')
    await page.locator('#contact-email').fill('ada@example.com')
    await page.locator('#contact-subject').fill('Support')
    await page.locator('#contact-message').fill('Do you have the Nezuko figure in stock?')
    await page.getByRole('button', { name: 'Send message' }).click()

    await expect(page.getByText('Message sent!')).toBeVisible()
  })

  test('manda el subject al backend — es columna propia, no parte del mensaje', async ({
    page,
  }) => {
    let body: Record<string, unknown> | null = null
    await page.route('**/us/leads', async (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null, message: 'ok' }),
      })
    })

    await page.goto(`${US_BASE_URL}/#/contact`)
    await page.locator('#contact-name').fill('Ada Lovelace')
    await page.locator('#contact-email').fill('ada@example.com')
    await page.locator('#contact-subject').fill('Preorder question')
    await page.locator('#contact-message').fill('When does the next box set land?')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText('Message sent!')).toBeVisible()

    expect(body).toMatchObject({
      source: 'contact',
      subject: 'Preorder question',
      message: 'When does the next box set land?',
    })
  })
})

test.describe('TadaimaUS storefront · newsletter global', () => {
  /**
   * Vive en App.tsx (arriba del Footer), NO dentro de HomePage: Joel lo quiere
   * sobre el pie en todas las páginas. Si alguien lo regresa a una página, este
   * test lo caza — y también caza el duplicado si queda en los dos lados.
   */
  test('aparece exactamente una vez sobre el pie de cada página', async ({ page }) => {
    for (const path of ['#/', '#/figures', '#/contact', '#/product/1', '#/checkout']) {
      await page.goto(`${US_BASE_URL}/${path}`)
      await expect(page.locator('.newsletter')).toHaveCount(1)

      // Y va ARRIBA del footer, no después.
      const order = await page.evaluate(() => {
        const nl = document.querySelector('.newsletter')
        const footer = document.querySelector('.site-footer')
        if (nl === null || footer === null) return 'falta'
        return nl.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING
          ? 'newsletter-antes'
          : 'newsletter-despues'
      })
      expect(order, `en ${path}`).toBe('newsletter-antes')
    }
  })

  test('el panel de admin NO lo monta', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/#/admin`)
    await expect(page.locator('.admin-login-card')).toBeVisible()
    await expect(page.locator('.newsletter')).toHaveCount(0)
  })
})

test.describe('TadaimaUS storefront · campos con etiqueta flotante', () => {
  /**
   * El patrón depende de dos detalles frágiles del markup: el input va ANTES
   * del label (selector hermano `+`) y lleva `placeholder=" "` (para que
   * `:placeholder-shown` distinga vacío de lleno). Si alguien reordena el JSX
   * o quita el placeholder, la etiqueta se queda encima del texto — esto lo caza.
   */
  test('la etiqueta sube al escribir y se queda arriba al salir del campo', async ({
    page,
  }) => {
    await page.goto(`${US_BASE_URL}/#/contact`)

    const input = page.locator('#contact-name')
    const label = page.locator('label[for="contact-name"]')

    // La etiqueta se anima (150ms): se sondea con expect.poll en vez de leer
    // el transform una sola vez y cazarlo a media transición.
    const scaleOf = async (): Promise<number> => {
      const matrix = await label.evaluate((el) => getComputedStyle(el).transform)
      if (matrix === 'none') return 1
      return Number(matrix.replace(/matrix\(([^,]+),.*/, '$1'))
    }

    // En reposo la etiqueta está a tamaño completo, encima del campo.
    await expect.poll(scaleOf).toBeCloseTo(1, 1)

    await input.fill('Joel')
    await expect.poll(scaleOf).toBeLessThan(0.9)

    // Al desenfocar con texto DEBE permanecer arriba, si no taparía lo escrito.
    await page.locator('#contact-email').click()
    await expect.poll(scaleOf).toBeLessThan(0.9)

    // Vaciar el campo la regresa a su lugar.
    await input.fill('')
    await page.locator('#contact-email').click()
    await expect.poll(scaleOf).toBeCloseTo(1, 1)
  })

  test('todos los campos con etiqueta flotante traen el placeholder que el CSS necesita', async ({
    page,
  }) => {
    const assertPlaceholders = async (): Promise<void> => {
      const inputs = page.locator('.field > input, .field > textarea')
      const total = await inputs.count()
      expect(total).toBeGreaterThan(0)
      for (let i = 0; i < total; i++) {
        await expect(inputs.nth(i)).toHaveAttribute('placeholder', ' ')
      }
    }

    await page.goto(`${US_BASE_URL}/#/contact`)
    await assertPlaceholders()

    // El checkout solo pinta el formulario con algo en el carrito; sin esto
    // la página muestra el estado vacío y el test pasaría sin revisar nada.
    await page.goto(`${US_BASE_URL}/#/product/1`)
    await page.getByRole('button', { name: 'Add to cart' }).click()
    await page.goto(`${US_BASE_URL}/#/checkout`)
    await assertPlaceholders()
  })
})

test.describe('TadaimaUS storefront · responsive', () => {
  const WIDTHS = [320, 768, 1024, 1440]

  for (const width of WIDTHS) {
    test(`sin overflow horizontal en ${width}px (home + categoría)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })

      await page.goto(`${US_BASE_URL}/`)
      const homeOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(homeOverflow).toBeLessThanOrEqual(1)

      await page.goto(`${US_BASE_URL}/#/figures`)
      const categoryOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(categoryOverflow).toBeLessThanOrEqual(1)
    })
  }
})

test.describe('TadaimaUS storefront · hero autoplay + reduced motion', () => {
  test('avanza de slide sola cuando no hay reduced motion', async ({ page }) => {
    await page.clock.install()
    await page.goto(`${US_BASE_URL}/`)

    await expect(page.locator('.hero-dot').nth(0)).toHaveAttribute('aria-current', 'true')
    await page.clock.fastForward('00:00:07')
    await expect(page.locator('.hero-dot').nth(1)).toHaveAttribute('aria-current', 'true')
  })

  test('se congela en el primer slide con reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install()
    await page.goto(`${US_BASE_URL}/`)

    await expect(page.locator('.hero-dot').nth(0)).toHaveAttribute('aria-current', 'true')
    await page.clock.fastForward('00:00:07')
    await expect(page.locator('.hero-dot').nth(0)).toHaveAttribute('aria-current', 'true')
  })
})

test.describe('TadaimaUS storefront · accesibilidad', () => {
  test('el skip link mueve el foco a #main', async ({ page }) => {
    await page.goto(`${US_BASE_URL}/`)

    await page.keyboard.press('Tab')
    await expect(page.locator('.skip-link')).toBeFocused()

    await page.keyboard.press('Enter')
    const activeId = await page.evaluate(() => document.activeElement?.id)
    expect(activeId).toBe('main')
  })
})
