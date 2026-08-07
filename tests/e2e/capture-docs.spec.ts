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
/** 'publico' = contexto SIN login (pantallas públicas: /login, tienda online). */
type SceneRole = Role | 'publico'

const CREDS: Record<Role, { email: string; password: string }> = {
  admin: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  cajero: { email: CASHIER_EMAIL, password: CASHIER_PASSWORD },
  gerente: { email: MANAGER_EMAIL, password: MANAGER_PASSWORD },
}

interface SceneHelpers {
  /** Token de API del rol de la escena (vacío en 'publico'). */
  token: string
}

interface Scene {
  topic: string
  name: string
  role?: SceneRole
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
      // El carrito persiste en localStorage (client-authoritative): si la
      // escena anterior dejó items, se reutilizan; si no, agrega uno.
      if (await page.locator('.group', { hasText: 'Audífonos Bluetooth Sony WH-CH520' }).count() === 0) {
        await agregarAlCarrito(page, 'Audífonos Bluetooth Sony WH-CH520')
      }
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

  // ── Reportes ────────────────────────────────────────────────────────────────
  {
    topic: 'reportes',
    name: 'centro-de-reportes',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/reports`)
      await expect(page.getByRole('heading', { name: /Centro de/ })).toBeVisible({ timeout: 15_000 })
      // Los botones de exportación del header — protagonistas de la captura.
      await expect(page.getByRole('button', { name: 'Excel' })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('button', { name: 'PDF' })).toBeVisible({ timeout: 5_000 })
      await page.waitForLoadState('networkidle')
    },
  },

  // ── Cobro en Caja ───────────────────────────────────────────────────────────
  // OJO al orden: la calculadora USD y los presets requieren método Efectivo
  // (default); la escena Mixto va AL FINAL porque el método queda pegado a la
  // mesa (persiste en localStorage) para el resto del run.
  {
    topic: 'cobro-caja',
    name: 'calculadora-usd',
    prepare: async (page, { token }) => {
      await ensureCajaAbierta(token)
      await gotoCaja(page)
      if (await page.locator('.group', { hasText: 'Audífonos Bluetooth Sony WH-CH520' }).count() === 0) {
        await agregarAlCarrito(page, 'Audífonos Bluetooth Sony WH-CH520')
      }
      await page.getByTestId('usd-calc-open').click()
      await expect(page.getByTestId('usd-calculator-modal')).toBeVisible({ timeout: 5_000 })
      // Con un monto capturado el modal muestra la conversión (simulación).
      await page.getByTestId('usd-calc-input').fill('20')
      await expect(page.getByTestId('usd-calc-result')).toBeVisible({ timeout: 5_000 })
    },
  },
  {
    topic: 'cobro-caja',
    name: 'pagos-de-esta-venta',
    prepare: async (page, { token }) => {
      await ensureCajaAbierta(token)
      await gotoCaja(page)
      if (await page.locator('.group', { hasText: 'Audífonos Bluetooth Sony WH-CH520' }).count() === 0) {
        await agregarAlCarrito(page, 'Audífonos Bluetooth Sony WH-CH520')
      }
      // Dos entregas del cliente vía presets de billetes → entradas del log.
      await page.getByRole('button', { name: '$200', exact: true }).click()
      await page.getByRole('button', { name: '$50', exact: true }).click()
      await expect(page.getByTestId('paylog-panel')).toBeVisible({ timeout: 5_000 })
      // El panel arranca COLAPSADO por default — expándelo si hace falta.
      if (!(await page.getByText('Billete +$200').isVisible().catch(() => false))) {
        await page.getByTestId('paylog-toggle').click()
      }
      await expect(page.getByText('Billete +$200')).toBeVisible({ timeout: 5_000 })
      await page.getByTestId('paylog-panel').scrollIntoViewIfNeeded()
    },
  },
  {
    topic: 'cobro-caja',
    name: 'pago-mixto',
    prepare: async (page, { token }) => {
      await ensureCajaAbierta(token)
      await gotoCaja(page)
      if (await page.locator('.group', { hasText: 'Audífonos Bluetooth Sony WH-CH520' }).count() === 0) {
        await agregarAlCarrito(page, 'Audífonos Bluetooth Sony WH-CH520')
      }
      // Dropdown de método (abre hacia arriba) → Mixto.
      await page.getByRole('button', { name: /Efectivo/ }).last().click()
      await page.getByRole('button', { name: 'Mixto' }).click()
      const transferInput = page.getByTestId('mixto-transfer-input')
      await expect(transferInput).toBeVisible({ timeout: 5_000 })
      // Con monto capturado se ve el split: "Efectivo: $X" (el resto).
      await transferInput.fill('500')
      await expect(page.getByText(/Efectivo: \$/)).toBeVisible({ timeout: 5_000 })
      await transferInput.scrollIntoViewIfNeeded()
    },
  },

  // ── Cortes de Caja ──────────────────────────────────────────────────────────
  {
    topic: 'cortes-caja',
    name: 'cerrar-caja-debe-haber',
    prepare: async (page, { token }) => {
      await ensureCajaAbierta(token)
      await gotoCaja(page)
      await page.getByRole('button', { name: 'Cerrar Caja', exact: true }).click()
      await expect(page.getByTestId('close-cash-expected')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('Debe haber en el cajón')).toBeVisible({ timeout: 5_000 })
      // Espera el preview del esperado (pesos/dólares) — NO se confirma el
      // cierre: la caja debe seguir abierta para el resto del run.
      await expect(page.getByText('Calculando…')).toHaveCount(0, { timeout: 10_000 })
    },
  },

  // ── Historial de ventas: Reporte del Día ────────────────────────────────────
  {
    topic: 'historial-ventas',
    name: 'reporte-del-dia',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/sales`)
      await expect(page.getByText(/REPORTE DE/).first()).toBeVisible({ timeout: 15_000 })
      // El tab se llama "Reporte" (el contenido dice "Reporte del Día · tienda").
      await page.getByRole('button', { name: 'Reporte', exact: true }).click()
      await expect(page.getByText(/Reporte del Día ·/).first()).toBeVisible({ timeout: 10_000 })
      await page.waitForLoadState('networkidle')
    },
  },

  // ── Primeros pasos: login ───────────────────────────────────────────────────
  {
    topic: 'primeros-pasos',
    name: 'pantalla-login',
    role: 'publico',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/login`)
      await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('button', { name: /Iniciar sesión/ })).toBeVisible({ timeout: 5_000 })
    },
  },

  // ── Configuración ───────────────────────────────────────────────────────────
  {
    topic: 'configuracion',
    name: 'control-del-sistema',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/settings`)
      await expect(page.getByRole('heading', { name: /Control del/ })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('button', { name: 'Catálogo Online' })).toBeVisible({ timeout: 10_000 })
      await page.waitForLoadState('networkidle')
    },
  },
  {
    topic: 'configuracion',
    name: 'catalogo-online',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/settings`)
      await expect(page.getByRole('button', { name: 'Catálogo Online' })).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Catálogo Online' }).click()
      // Sub-tabs del catálogo (Visibilidad activa por default).
      await expect(page.getByRole('button', { name: 'Apariencia', exact: true })).toBeVisible({ timeout: 10_000 })
      await page.waitForLoadState('networkidle')
    },
  },

  // ── Tienda Online ───────────────────────────────────────────────────────────
  {
    topic: 'tienda-online',
    name: 'panel-apariencia',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/settings`)
      await expect(page.getByRole('button', { name: 'Catálogo Online' })).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Catálogo Online' }).click()
      await page.getByRole('button', { name: 'Apariencia', exact: true }).click()
      // Pickers de color/fondo/layout cargados.
      await expect(page.getByText('Fondo').first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('button', { name: 'Guardar Apariencia' })).toBeVisible({ timeout: 10_000 })
      await page.waitForLoadState('networkidle')
    },
  },
  {
    topic: 'tienda-online',
    name: 'tienda-publica',
    role: 'publico',
    prepare: async (page) => {
      // Catálogo de cadena (v2): URL global pública, sin slug ni login.
      await page.goto(`${BASE_URL}/tienda-online`)
      await expect(page.getByText('Audífonos Bluetooth Sony WH-CH520').first())
        .toBeVisible({ timeout: 15_000 })
      await page.waitForLoadState('networkidle')
    },
  },

  // ── Promos en pantalla ──────────────────────────────────────────────────────
  {
    topic: 'promos-pantalla',
    name: 'modo-tv',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/promos`)
      await expect(page.getByRole('heading', { name: 'Promos' })).toBeVisible({ timeout: 15_000 })
      await page.waitForLoadState('networkidle') // promos cargadas antes de proyectar
      await page.getByTestId('tv-mode-btn').click()
      const tv = page.getByTestId('tv-mode')
      await expect(tv).toBeVisible({ timeout: 10_000 })
      await expect(tv.getByText('Promociones vigentes')).toBeVisible({ timeout: 5_000 })
      // Margen para la animación de entrada de la card rotativa.
      await page.waitForTimeout(1_200)
    },
  },
  {
    topic: 'promos-pantalla',
    name: 'compartir-promo',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/promos`)
      await expect(page.getByRole('heading', { name: 'Promos' })).toBeVisible({ timeout: 15_000 })
      await page.getByTestId('promos-tab-asignadas').click()
      const share = page.locator('[data-testid^="share-promo-"]').first()
      await expect(share).toBeVisible({ timeout: 10_000 })
      await share.click()
      const modal = page.getByTestId('share-banner-modal')
      await expect(modal).toBeVisible({ timeout: 10_000 })
      await expect(modal.getByText('Compartir promo')).toBeVisible({ timeout: 5_000 })
      // El banner 1080×1350 se pinta escalado; margen para assets/placeholder.
      await page.waitForTimeout(800)
    },
  },

  // ── Precios por nivel ───────────────────────────────────────────────────────
  {
    topic: 'precios-por-nivel',
    name: 'tab-precios',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/products`)
      await expect(page.getByTestId('filter-dropdown')).toBeVisible({ timeout: 15_000 })
      // Filtra a un producto demo y abre su edición.
      await page.locator('input[placeholder*="Escanea o busca"]').first().fill('Audífonos')
      await expect(page.getByText('Audífonos Bluetooth Sony WH-CH520').first())
        .toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Editar', exact: true }).first().click()
      await expect(page.getByText('Editar Producto')).toBeVisible({ timeout: 5_000 })
      await page.getByRole('button', { name: 'Precios' }).click()
      await expect(page.getByText('Precio Socio').first()).toBeVisible({ timeout: 5_000 })
    },
  },

  // ── Buscar y filtrar productos: modal "Productos sin Costo" ─────────────────
  {
    topic: 'buscar-filtrar-productos',
    name: 'productos-sin-costo',
    prepare: async (page) => {
      await page.goto(`${BASE_URL}/products`)
      await expect(page.getByTestId('filter-dropdown')).toBeVisible({ timeout: 15_000 })
      // El chip se habilita cuando /products/stats reporta sin_costo > 0
      // (el DemoSeeder siembra 2 productos DEMO-SIN-* con cost NULL).
      const chip = page.getByRole('button', { name: /Productos sin Costo/ })
      await expect(chip).toBeEnabled({ timeout: 10_000 })
      await chip.click()
      const modal = page.getByTestId('missing-cost-modal')
      await expect(modal).toBeVisible({ timeout: 10_000 })
      await expect(modal.getByText('Póster Attack on Titan 60×90'))
        .toBeVisible({ timeout: 10_000 })
    },
  },
]

// ─── Runner ───────────────────────────────────────────────────────────────────
// UN SOLO test con un contexto compartido por rol: 1 login por rol y el cache
// de React Query se reutiliza entre escenas → el run completo queda muy por
// debajo del throttle del API (120 req/min por usuario en routes/api.php).

const topicCounters: Record<string, number> = {}
const scenesConArchivo = SCENES.map(scene => {
  topicCounters[scene.topic] = (topicCounters[scene.topic] ?? 0) + 1
  const nn = String(topicCounters[scene.topic]).padStart(2, '0')
  return { ...scene, file: join(OUT_DIR, scene.topic, `${nn}-${scene.name}.png`) }
})

test('captura de screenshots de documentación', async ({ browser }) => {
  // Primer hit a cada página compila en Vite dev — margen amplio para el run.
  test.setTimeout(15 * 60_000)

  const sessions = new Map<SceneRole, { page: Page; token: string }>()

  async function sessionFor(role: SceneRole): Promise<{ page: Page; token: string }> {
    const existing = sessions.get(role)
    if (existing) return existing
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    let token = ''
    if (role !== 'publico') {
      const creds = CREDS[role]
      token = await apiLogin(creds.email, creds.password)
      await uiLogin(page, creds.email, creds.password)
    }
    const session = { page, token }
    sessions.set(role, session)
    return session
  }

  const fallas: string[] = []

  for (const scene of scenesConArchivo) {
    const id = `${scene.topic}/${scene.file.split('/').pop()}`
    await test.step(`captura ${id}`, async () => {
      try {
        const { page, token } = await sessionFor(scene.role ?? 'admin')
        await scene.prepare(page, { token })

        // Settle corto para animaciones de entrada (motion ~300ms).
        await page.waitForTimeout(400)

        mkdirSync(dirname(scene.file), { recursive: true })
        if (scene.shot?.selector) {
          await page.locator(scene.shot.selector).first().screenshot({ path: scene.file })
        } else {
          await page.screenshot({ path: scene.file, fullPage: scene.shot?.fullPage ?? false })
        }
      } catch (err) {
        // Sigue con las demás escenas y reporta todas las fallas al final.
        fallas.push(`${id}: ${(err as Error).message?.split('\n')[0]}`)
      }
    })
  }

  for (const { page } of sessions.values()) {
    await page.context().close()
  }

  expect(fallas, `Escenas fallidas:\n${fallas.join('\n')}`).toEqual([])
})
