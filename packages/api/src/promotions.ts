import { apiClient } from './client'
import type { ProductPromotion, Promotion } from './types'

/**
 * Promociones (Descuentos v2). Desde 2026-07-25 la promo es una entidad
 * GENERAL asignable a 1..N productos (endpoints /promotions). Los endpoints
 * anidados /products/{id}/promotions siguen vivos como shim de compatibilidad.
 * El motor de Caja NO usa nada de esto — consume `active_promotions` embebido
 * en el payload de productos.
 */

export interface ProductPromotionInput {
  name: string
  /** 'nxm' (default) usa buy_n/pay_m; 'qty_discount' = mayoreo, usa min_qty/discount_per_unit. */
  type?: 'nxm' | 'qty_discount'
  buy_n?: number
  pay_m?: number
  /** Mayoreo: desde cuántas piezas aplica (>= 2). */
  min_qty?: number
  /** Mayoreo: cuánto se le descuenta a CADA pieza. */
  discount_per_unit?: number
  /** Restricción de pago de la promo: si el método no sirve, bloquea el cobro. */
  allow_cash?: boolean
  allow_card?: boolean
  starts_at?: string | null
  ends_at?: string | null
  status?: 'active' | 'paused' | 'expired'
  priority?: number
  /** null/omitido = todas las tiendas (admin); gerente queda forzado a la suya. */
  store_id?: number | null
}

// ─── Promos GENERALES (2026-07-25) ────────────────────────────────────────────

/** TODAS las promos (activas/pausadas/vencidas) con products_count + products. */
export async function getPromotions(): Promise<Promotion[]> {
  const response = await apiClient.get<Promotion[]>('/promotions')
  return response.data
}

export async function getPromotion(id: number): Promise<Promotion> {
  const response = await apiClient.get<Promotion>(`/promotions/${id}`)
  return response.data
}

/** Crea una promo general — con 0 productos asignados es legal. */
export async function createPromotion(input: ProductPromotionInput): Promise<Promotion> {
  const response = await apiClient.post<Promotion>('/promotions', input)
  return response.data
}

/**
 * Editar / pausar / reanudar. OJO contrato: reenviar la promo COMPLETA
 * (name siempre; buy_n/pay_m si es nxm) — un PUT parcial pierde campos.
 */
export async function updatePromotion(id: number, input: ProductPromotionInput): Promise<Promotion> {
  const response = await apiClient.put<Promotion>(`/promotions/${id}`, input)
  return response.data
}

/** Borra la promo (las asignaciones caen en cascada; tickets históricos intactos). */
export async function deletePromotion(id: number): Promise<void> {
  await apiClient.delete(`/promotions/${id}`)
}

/**
 * Asignación batch TODO-o-NADA. Si algún producto choca (duplicado/tope/
 * exclusividad de tipo/conflicto de pago) el server responde 422 con
 * `errors` = { "<productId>": ["mensaje"] } y NO asigna ninguno.
 */
export async function attachPromotionProducts(id: number, productIds: number[]): Promise<Promotion> {
  const response = await apiClient.post<Promotion>(`/promotions/${id}/products`, {
    product_ids: productIds,
  })
  return response.data
}

/** Quita UN producto de la promo (la promo sigue existiendo). */
export async function detachPromotionProduct(id: number, productId: number): Promise<Promotion> {
  const response = await apiClient.delete<Promotion>(`/promotions/${id}/products/${productId}`)
  return response.data
}

// ─── Shim anidado legacy (/products/{id}/promotions) ──────────────────────────

/** Promos asignadas a UN producto (sigue siendo el GET canónico del tab). */
export async function getProductPromotions(productId: number): Promise<ProductPromotion[]> {
  const response = await apiClient.get<ProductPromotion[]>(`/products/${productId}/promotions`)
  return response.data
}

/** @deprecated Usa createPromotion + attachPromotionProducts (promos generales). */
export async function createProductPromotion(
  productId: number,
  input: ProductPromotionInput,
): Promise<ProductPromotion> {
  const response = await apiClient.post<ProductPromotion>(`/products/${productId}/promotions`, input)
  return response.data
}

/** @deprecated Usa updatePromotion (la promo ya no cuelga de un producto). */
export async function updateProductPromotion(
  productId: number,
  promotionId: number,
  input: ProductPromotionInput,
): Promise<ProductPromotion> {
  const response = await apiClient.put<ProductPromotion>(
    `/products/${productId}/promotions/${promotionId}`,
    input,
  )
  return response.data
}

/** @deprecated Usa detachPromotionProduct (quitar) o deletePromotion (borrar). */
export async function deleteProductPromotion(productId: number, promotionId: number): Promise<void> {
  await apiClient.delete(`/products/${productId}/promotions/${promotionId}`)
}
