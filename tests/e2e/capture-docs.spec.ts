import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import {
  BASE_URL,
  ADMIN_EMAIL, ADMIN_PASSWORD,
  CASHIER_EMAIL, CASHIER_PASSWORD,
  MANAGER_EMAIL, MANAGER_PASSWORD,
  apiLogin, apiReq,
} from './helpers'

/**
 * Captura de screenshots para la documentación in-app (Documentación 2.0).
 *
 * NO es parte de la suite e2e normal — solo corre con DOCS_CAPTURE=1:
 *     npm run docs:capture
 *
 * Prerrequisitos: backend sqlitelocal en :8000 con `npm run docs:seed` corrido,
 * y el landing dev en :5173. Escribe PNGs @2x (viewport 1440x900 → 2880x1800)
 * a landing/src/assets/docs/<tema>/<nn>-<nombre>.png.
 */

test.skip(!process.env.DOCS_CAPTURE, 'solo para capturas de docs')
test.use({ deviceScaleFactor: 2 })

const OUT_DIR = resolve(__dirname, '..', '..', 'landing', 'src', 'assets', 'docs')

type Role = 'admin' | 'cajero' | 'gerente'

const CREDS: Record<Role, { email: string; password: string }> = {
  admin: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  cajero: { email: CASHIER_EMAIL, password: CASHIER_PASSWORD },
  gerente: { email: MANAGER_EMAIL, password: MANAGER_PASSWORD },
}

interface SceneHelpers {
  /** Token de API del rol de la escena (para preparar estado vía backend). */
  token: string
}

interface Scene {
  topic: string
  name: string
  role?: Role
  prepare: (page: Page, helpers: SceneHelpers) => Promise<void>
  shot?: { selector?: string; fullPage?: boolean }
}

// ─── Helpers de escena ────────────────────────────────────────────────────────

async function uiLogin(page: Page, email: string, password: string) {
  // Login por UI: seedAuth vía localStorage no hidrata /caja de forma
  // confiable (mismo patrón que line-discounts.spec.ts).
  await page.goto(`${BASE_URL}/login`)
  await page.waitForSelector('input[type="email"]')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE_URL}/`, { timeout: 15_000 })
}

/** Asegura sesión de caja abierta del admin en Tienda 1 (reusa si ya hay). */
async function ensureCajaAbierta(token: string) {
  const current = await apiReq('GET', token, '/cash/session') as { data?: { id?: number } | null }
  if (current.data?.id) return
  const stores = await apiReq('GET', token, '/stores') as { data: Array<{ id: number; name: string }> }
  const t1 = stores.data.find(s => /Tienda 1/.test(s.name)) ?? stores.data[0]
  await apiReq('POST', token, '/cash/open', { store_id: t1!.id, opening_cash: 1000 })
}

async function gotoCaja(page: Page) {
  await page.goto(`${BASE_URL}/caja`)
  await page.waitForLoadState('networkidle')

  // Admin sin tienda activa → selector de tienda de pantalla completa.
  const picker = page.getByText('Selecciona una tienda').first()
  if (await picker.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole('button', { name: /Tienda 1/ }).first().click()
    await page.waitForLoadState('networkidle')
  }

  await expect(page.locator('input[placeholder*="Añadir producto"]').first())
    .toBeVisible({ timeout: 15_000 })
}

function cajaSearch(page: Page) {
  return page.locator('input[placeholder*="Añadir producto"]').first()
}

async function buscarProducto(page: Page, nombre: string) {
  await cajaSearch(page).fill(nombre)
  await expect(page.getByText(nombre).first()).toBeVisible({ timeout: 10_000 })
}

async function agregarAlCarrito(page: Page, nombre: string) {
  await buscarProducto(page, nombre)
  await page.getByText(nombre).first().click()
  await expect(page.locator('.group', { hasText: nombre }).first())
    .toBeVisible({ timeout: 5_000 })
  await cajaSearch(page).fill('') // cierra el dropdown de resultados
}

// ─── Escenas ──────────────────────────────────────────────────────────────────
// El índice nn (01, 02, …) se calcula por tema según el orden de este array.

const SCENES: Scene[] = [
  // ── Caja ────────────────────────────────────────────────────────────────────
  {
    topic: 'caja',
    name: 'pantalla-caja',
    prepare: async (page, { token }) => {
      await ensureCajaAbierta(token)
      await gotoCaja(page)
    },
  },
  {
    topic: 'caja',
    name: 'busqueda-producto',
    prepare: async (page, { token }) => {
      await ensureCajaAbierta(token)
      await gotoCaja(page)
      await buscarProducto(page, 'Audífonos Bluetooth Sony WH-CH520')
    },
  },
  {
    topic: 'caja',
    name: 'carrito-con-productos',
    prepare: async (page, { token }) => {
      await ensureCajaAbierta(token)
      await gotoCaja(page)
      await agregarAlCarrito(page, 'Audífonos Bluetooth Sony WH-CH520')
      await agregarAlCarrito(page, 'Manga Chainsaw Man Tomo 1')
      await agregarAlCarrito(page, 'Taza Studio Ghibli Totoro')
    },
  },
  {
    topic: 'caja',
    name: 'metodos-de-pago',
    prepare: async (page, { token }) => {
      await ensureCajaAbierta(token)
      await gotoCaja(page)
      await agregarAlCarrito(page, 'Audífonos Bluetooth Sony WH-CH520')
      // El selector de método es un dropdown que abre hacia arriba.
      await page.getByRole('button', { name: /Efectivo/ }).last().click()
      await expect(page.getByRole('button', { name: 'Mixto' })).toBeVisible({ timeout: 5_000 })
    },
  },

  // ── Cortes ──────────────────────────────────────────────────────────────────
  {
    topic: 'cortes',
    name: 'historial-de-cortes',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/cortes`)
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: 'Este mes' }).click()
      await expect(page.getByText('Cargando cortes…')).toHaveCount(0)
      await expect(
        page.getByText(/sesiones ·/).or(page.getByText('Sin cortes en este período')).first(),
      ).toBeVisible({ timeout: 10_000 })
    },
  },

  // ── Productos ───────────────────────────────────────────────────────────────
  {
    topic: 'productos',
    name: 'listado-almacen',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/products`)
      await expect(page.getByRole('heading', { name: /Almacén/ })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId('filter-dropdown')).toBeVisible({ timeout: 15_000 })
      await page.waitForLoadState('networkidle')
    },
  },
  {
    topic: 'productos',
    name: 'filtros',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/products`)
      await expect(page.getByTestId('filter-dropdown')).toBeVisible({ timeout: 15_000 })
      await page.waitForLoadState('networkidle')
      await page.getByTestId('filter-dropdown').click()
      await expect(page.getByTestId('filter-clear')).toBeVisible({ timeout: 5_000 })
    },
  },
  {
    topic: 'productos',
    name: 'tipo-de-alta',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/products`)
      await expect(page.getByTestId('filter-dropdown')).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Alta de Producto' }).click()
      await expect(page.getByText('¿Qué tipo de producto?')).toBeVisible({ timeout: 5_000 })
    },
  },
  {
    topic: 'productos',
    name: 'alta-de-producto',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/products`)
      await expect(page.getByTestId('filter-dropdown')).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Alta de Producto' }).click()
      // Chooser de tipo → "Producto Normal" abre el formulario de alta.
      await page.getByRole('button', { name: /Producto Normal/ }).click()
      await expect(page.getByText('Nuevo Producto')).toBeVisible({ timeout: 5_000 })
    },
  },

  // ── Preventas ───────────────────────────────────────────────────────────────
  {
    topic: 'preventas',
    name: 'catalogos',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/pre-sales`)
      await expect(page.getByRole('heading', { name: /Preventas/ })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('Catálogos de Preventa')).toBeVisible({ timeout: 10_000 })
      await page.waitForLoadState('networkidle')
    },
  },
  {
    topic: 'preventas',
    name: 'folios',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/pre-sales`)
      await expect(page.getByRole('heading', { name: /Preventas/ })).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Folios' }).click()
      // Los folios demo del seeder (PREV-…) deben estar visibles.
      await expect(page.getByText(/PREV-\d+/).first()).toBeVisible({ timeout: 10_000 })
    },
  },
  {
    topic: 'preventas',
    name: 'nuevo-catalogo',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/pre-sales`)
      await expect(page.getByText('Catálogos de Preventa')).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Nuevo Catálogo' }).click()
      await expect(page.getByText('Nuevo Catálogo de Preventa')).toBeVisible({ timeout: 5_000 })
    },
  },

  // ── Promos ──────────────────────────────────────────────────────────────────
  {
    topic: 'promos',
    name: 'gestion-de-promos',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/promos`)
      await expect(page.getByRole('heading', { name: 'Promos' })).toBeVisible({ timeout: 15_000 })
      await page.getByTestId('promos-tab-gestion').click()
      await expect(page.getByTestId('new-promo-btn')).toBeVisible({ timeout: 10_000 })
      await page.waitForLoadState('networkidle')
    },
  },
  {
    topic: 'promos',
    name: 'promos-asignadas',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/promos`)
      await expect(page.getByRole('heading', { name: 'Promos' })).toBeVisible({ timeout: 15_000 })
      await page.getByTestId('promos-tab-asignadas').click()
      await expect(page.getByText(/Vigentes por producto/)).toBeVisible({ timeout: 10_000 })
    },
  },

  // ── Historial de ventas ─────────────────────────────────────────────────────
  {
    topic: 'historial',
    name: 'historial-de-ventas',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/sales`)
      await expect(page.getByText(/REPORTE DE/).first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('No. Ticket').first()).toBeVisible({ timeout: 10_000 })
      await page.waitForLoadState('networkidle')
    },
  },

  // ── Buscar en tiendas ───────────────────────────────────────────────────────
  {
    topic: 'buscar-tiendas',
    name: 'existencias-por-tienda',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/buscar-tiendas`)
      await expect(page.getByRole('heading', { name: 'Existencias por Tienda' }))
        .toBeVisible({ timeout: 15_000 })
    },
  },
  {
    topic: 'buscar-tiendas',
    name: 'resultado-busqueda',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/buscar-tiendas`)
      const search = page.locator('input[placeholder*="Escanea código de barras"]').first()
      await expect(search).toBeVisible({ timeout: 15_000 })
      await search.fill('Audífonos')
      await expect(page.getByText('Audífonos Bluetooth Sony WH-CH520').first())
        .toBeVisible({ timeout: 10_000 })
    },
  },

  // ── Dashboard / inicio por rol ──────────────────────────────────────────────
  {
    topic: 'dashboard',
    name: 'panel-administracion',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/admin`)
      await expect(page.getByText('Administración')).toBeVisible({ timeout: 15_000 })
      await page.waitForLoadState('networkidle')
    },
  },
  {
    topic: 'dashboard',
    name: 'dashboard-gerente',
    role: 'gerente',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/`)
      await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible({ timeout: 15_000 })
      await page.waitForLoadState('networkidle')
    },
  },
  {
    topic: 'dashboard',
    name: 'perfil-cajero',
    role: 'cajero',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/`)
      await expect(page.getByText('Mi Perfil')).toBeVisible({ timeout: 15_000 })
      await page.waitForLoadState('networkidle')
    },
  },

  // ── Clientes ────────────────────────────────────────────────────────────────
  {
    topic: 'clientes',
    name: 'gestion-de-clientes',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/clients`)
      await expect(page.getByText(/GESTIÓN DE/).first()).toBeVisible({ timeout: 15_000 })
      // Cliente demo del seeder → la lista ya cargó.
      await expect(page.getByText('Carlos Mendoza').first()).toBeVisible({ timeout: 10_000 })
    },
  },
]

// ─── Runner ───────────────────────────────────────────────────────────────────

const topicCounters: Record<string, number> = {}
const scenesConArchivo = SCENES.map(scene => {
  topicCounters[scene.topic] = (topicCounters[scene.topic] ?? 0) + 1
  const nn = String(topicCounters[scene.topic]).padStart(2, '0')
  return { ...scene, file: join(OUT_DIR, scene.topic, `${nn}-${scene.name}.png`) }
})

for (const scene of scenesConArchivo) {
  test(`captura ${scene.topic}/${scene.file.split('/').pop()}`, async ({ page }) => {
    // El primer hit a cada página compila en Vite dev — margen amplio.
    test.setTimeout(120_000)

    const role = scene.role ?? 'admin'
    const creds = CREDS[role]
    const token = await apiLogin(creds.email, creds.password)

    await uiLogin(page, creds.email, creds.password)
    await scene.prepare(page, { token })

    // Settle corto para animaciones de entrada (motion ~300ms).
    await page.waitForTimeout(400)

    mkdirSync(dirname(scene.file), { recursive: true })
    if (scene.shot?.selector) {
      await page.locator(scene.shot.selector).first().screenshot({ path: scene.file })
    } else {
      await page.screenshot({ path: scene.file, fullPage: scene.shot?.fullPage ?? false })
    }
  })
}
