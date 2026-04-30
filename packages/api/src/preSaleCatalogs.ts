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
