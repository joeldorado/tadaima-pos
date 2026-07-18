import { apiClient } from './client'
import type { ProductPromotion } from './types'

/**
 * Promociones NxM por producto (Fase 3). CRUD del editor de producto; el motor
 * de Caja NO usa estos endpoints — consume `active_promotions` embebido en el
 * payload de productos.
 */

export interface ProductPromotionInput {
  name: string
  /** 'nxm' (default) usa buy_n/pay_m; 'qty_discount' usa tiers. */
  type?: 'nxm' | 'qty_discount'
  buy_n?: number
  pay_m?: number
  /** Solo qty_discount: escalones [{qty, amount}]. */
  tiers?: Array<{ qty: number; amount: number }>
  starts_at?: string | null
  ends_at?: string | null
  status?: 'active' | 'paused' | 'expired'
  priority?: number
  /** null/omitido = todas las tiendas (admin); gerente queda forzado a la suya. */
  store_id?: number | null
}

export async function getProductPromotions(productId: number): Promise<ProductPromotion[]> {
  const response = await apiClient.get<ProductPromotion[]>(`/products/${productId}/promotions`)
  return response.data
}

export async function createProductPromotion(
  productId: number,
  input: ProductPromotionInput,
): Promise<ProductPromotion> {
  const response = await apiClient.post<ProductPromotion>(`/products/${productId}/promotions`, input)
  return response.data
}

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

export async function deleteProductPromotion(productId: number, promotionId: number): Promise<void> {
  await apiClient.delete(`/products/${productId}/promotions/${promotionId}`)
}
