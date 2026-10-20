import { apiClient } from './client'
import type {
  PreSaleCatalog,
  PreSaleCatalogListResponse,
  GetPreSaleCatalogsParams,
  CreatePreSaleCatalogInput,
  UpdatePreSaleCatalogInput,
  UpdatePreSaleCatalogStatusInput,
  CatalogCancelCounts,
  PreSaleCatalogStatus,
} from './types'

/**
 * Lista de catálogos de preventa creados por admin.
 * GET /pre-sale-catalogs
 */
export async function getPreSaleCatalogs(
  params?: GetPreSaleCatalogsParams
): Promise<PreSaleCatalogListResponse> {
  const response = await apiClient.get<PreSaleCatalogListResponse>(
    '/pre-sale-catalogs',
    { params }
  )
  return response.data
}

/**
 * Detalle de un catálogo con categoría, proveedor, producto y conteo reservado.
 * GET /pre-sale-catalogs/{id}
 */
export async function getPreSaleCatalog(id: number): Promise<PreSaleCatalog> {
  const response = await apiClient.get<PreSaleCatalog>(`/pre-sale-catalogs/${id}`)
  return response.data
}

/**
 * Admin crea un nuevo catálogo de preventa.
 * POST /pre-sale-catalogs
 */
export async function createPreSaleCatalog(
  input: CreatePreSaleCatalogInput
): Promise<PreSaleCatalog> {
  const response = await apiClient.post<PreSaleCatalog>('/pre-sale-catalogs', input)
  return response.data
}

/**
 * Admin o gerente edita campos de un catálogo existente.
 * PATCH /pre-sale-catalogs/{id}
 */
export async function updatePreSaleCatalog(
  id: number,
  input: UpdatePreSaleCatalogInput
): Promise<PreSaleCatalog> {
  const response = await apiClient.patch<PreSaleCatalog>(
    `/pre-sale-catalogs/${id}`,
    input
  )
  return response.data
}

/**
 * Admin cambia el status del catálogo.
 * PATCH /pre-sale-catalogs/{id}/status
 *
 * Transiciones válidas:
 *   draft     → published | cancelled
 *   published → closed | cancelled
 *   closed    → cancelled
 */
export async function updatePreSaleCatalogStatus(
  id: number,
  input: UpdatePreSaleCatalogStatusInput
): Promise<PreSaleCatalog> {
  const response = await apiClient.patch<PreSaleCatalog>(
    `/pre-sale-catalogs/${id}/status`,
    input
  )
  return response.data
}

// ─── Cancelar catálogo con vista previa (2026-10-09) ─────────────────────────

/** GET /pre-sale-catalogs/{id}/cancel-preview — lo que "Cancelar catálogo" tocaría. */
export interface CatalogCancelPreview {
  catalog: { id: number; product_name: string; status: PreSaleCatalogStatus; can_cancel: boolean }
  folios: {
    total: number
    /** Folios abiertos (pendientes y listos) que se cancelan. */
    to_cancel: number
    by_status: { pending: number; ready: number; delivered: number; expired: number; cancelled: number }
    /** De los que se cancelan: cuántos ya tienen anticipos cobrados. */
    with_money: number
    with_card: number
    /** Folios que también traen artículos de OTROS catálogos (se cancelan completos). */
    mixed: number
    /** Para gerente: folios abiertos de otras tiendas. Admin: 0. */
    other_stores: number
  }
  money: {
    /** Anticipos cobrados de los folios que se cancelan. NO se devuelven al cancelar así. */
    anticipos_cobrados: number
    anticipos_efectivo: number
    anticipos_tarjeta: number
    por_cobrar: number
  }
  stores: Array<{ store_id: number; store_name: string; is_mine: boolean; folios_to_cancel: number; anticipos: number }>
  units: { reserved: number; delivered: number }
  /** Se reenvían como `expected` en el PATCH de estado. */
  counts: CatalogCancelCounts
  warnings: string[]
  /** No vacío = no se puede cancelar (ya cancelado / completado). */
  blockers: string[]
}

export async function getPreSaleCatalogCancelPreview(id: number): Promise<CatalogCancelPreview> {
  const response = await apiClient.get<CatalogCancelPreview>(`/pre-sale-catalogs/${id}/cancel-preview`)
  return response.data
}

export interface CatalogCustomerUsage {
  catalog_id: number
  customer_id: number
  /** Límite por cliente del catálogo (null = sin límite). */
  limit: number | null
  /** Unidades que el cliente ya tiene de este catálogo (de por vida). */
  used: number
  /** Disponibles para ese cliente (null = sin límite). */
  remaining: number | null
}

/**
 * Cuánto ha usado un cliente de un catálogo (para el límite por cliente).
 * GET /pre-sale-catalogs/{id}/customer-usage?customer_id=X
 */
export async function getCatalogCustomerUsage(
  catalogId: number,
  customerId: number
): Promise<CatalogCustomerUsage> {
  const response = await apiClient.get<CatalogCustomerUsage>(
    `/pre-sale-catalogs/${catalogId}/customer-usage`,
    { params: { customer_id: customerId } }
  )
  return response.data
}

/**
 * Sube una imagen para el catálogo de preventa. Reemplaza la imagen previa
 * si existía (backend hace cleanup en GCS).
 * POST /pre-sale-catalogs/:id/image (multipart/form-data, campo "image", max 5MB)
 */
export async function uploadPreSaleCatalogImage(
  id: number,
  file: File
): Promise<{ id: number; image_path: string; image_url: string }> {
  const form = new FormData()
  form.append('image', file)
  const response = await apiClient.post<{ id: number; image_path: string; image_url: string }>(
    `/pre-sale-catalogs/${id}/image`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return response.data
}

/**
 * Elimina la imagen del catálogo (file + DB).
 * DELETE /pre-sale-catalogs/:id/image
 */
export async function removePreSaleCatalogImage(id: number): Promise<void> {
  await apiClient.delete(`/pre-sale-catalogs/${id}/image`)
}
