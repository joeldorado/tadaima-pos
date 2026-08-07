import { test, expect } from '@playwright/test'
import { BASE_URL, seedAuth } from './helpers'

/**
 * Humo de tours guiados (F1B): abrir el picker vía el evento global
 * `tadaima:open-tour-picker` (hook de integración/e2e del TourPickerDialog),
 * arrancar "Venta completa en Caja", avanzar 2 pasos y salir con Esc.
 */

test('Tour humo · picker → venta-caja → 2 pasos → Esc', async ({ page, context }) => {
  await seedAuth(context)
  await page.goto(`${BASE_URL}/`)
  // Sidebar montada = Layout (y por lo tanto TourPickerDialog) vivo.
  await page.waitForSelector('aside', { timeout: 10_000 })

  // Abrir el picker por el hook de integración (equivale al item
  // "Hacer un tour" del menú del avatar, sin depender de sus clics).
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('tadaima:open-tour-picker'))
  })
  await expect(page.getByText('Tours guiados')).toBeVisible({ timeout: 5_000 })

  // Arrancar "Venta completa en Caja".
  await page.click('[data-testid="tour-start-venta-caja"]')

  // Paso 1: tarjeta de intro centrada.
  const popover = page.locator('[data-testid="tour-popover"]')
  await expect(popover).toBeVisible({ timeout: 5_000 })
  await expect(popover).toContainText('Paso 1 de')

  // Avanzar 2 pasos con Siguiente.
  await popover.getByRole('button', { name: 'Siguiente' }).click()
  await expect(popover).toContainText('Paso 2 de', { timeout: 5_000 })

  await popover.getByRole('button', { name: 'Siguiente' }).click()
  // El paso 3 navega a /caja; según el estado de la caja puede mostrarse el
  // contenido normal o la variante bloqueada (ámbar) — en ambos casos el
  // overlay sigue vivo.
  await expect(page).toHaveURL(`${BASE_URL}/caja`, { timeout: 10_000 })
  await expect(popover).toBeVisible({ timeout: 10_000 })

  // Esc cierra el tour por completo.
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
  await expect(page.locator('[data-testid="tour-overlay"]')).toHaveCount(0)

  console.log('✅ Tour humo OK (picker + arranque + navegación + Esc)')
})
