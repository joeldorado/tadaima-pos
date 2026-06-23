import { apiClient } from './client'
import type {
  PreSaleCatalog,
  PreSaleCatalogListResponse,
  GetPreSaleCatalogsParams,
  CreatePreSaleCatalogInput,
  UpdatePreSaleCatalogInput,
  UpdatePreSaleCatalogStatusInput,
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
