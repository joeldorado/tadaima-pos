import { apiClient } from './client'
import { deleteRequestConfig, type DeleteProductOptions } from './products'
import type { Manga, CreateMangaInput, UpdateMangaInput, MangaInventoryItem, PaginatedResponse } from './types'

export interface GetMangasParams {
  store_id?: number
  genre?: string
  editorial?: string
  search?: string
  active?: boolean
  page?: number
  per_page?: number
  /**
   * Con store_id: incluye tomos "no asignados" (sin inventario en la tienda)
   * con stock 0 + is_assigned=false, para que la sucursal les agregue stock.
   */
  include_unassigned?: boolean
  /**
   * Filtros server-side del tab Tomos (2026-10-12) — misma definición que los
   * contadores de GET /products/stats?type=manga, así que el total que
   * regresa el listado es el número del badge.
   */
  out_of_stock?: boolean
  /** Stock entre 1 y `threshold` (default 10 en el backend). */
  low_stock?: boolean
  threshold?: number
  /** Sin NINGUNA categoría (pivote vacío). */
  no_category?: boolean
}

interface MangasEnvelope {
  data: Manga[]
  pagination?: { total: number; per_page: number; current_page: number; last_page: number }
}

export async function getMangas(params?: GetMangasParams): Promise<Manga[]> {
  const response = await apiClient.get<{ data: Manga[] }>('/mangas', { params })
  return response.data.data
}

/**
 * GET /mangas con la paginación REAL del backend (total, last_page). El tab
 * Tomos pide página por página en vez de cargar solo la primera y contar lo
 * cargado — con ~2.8k tomos eso mostraba "50 tomos" (bug de tienda 2026-10-12).
 */
export async function getMangasPage(params?: GetMangasParams): Promise<PaginatedResponse<Manga>> {
  const response = await apiClient.get<MangasEnvelope>('/mangas', { params })
  const { data, pagination } = response.data
  const rows = Array.isArray(data) ? data : []
  return {
    data: rows,
    total: pagination?.total ?? rows.length,
    per_page: pagination?.per_page ?? rows.length,
    current_page: pagination?.current_page ?? 1,
    last_page: pagination?.last_page ?? 1,
  }
}

export async function createManga(input: CreateMangaInput): Promise<Manga> {
  const response = await apiClient.post<Manga>('/mangas', input)
  return response.data
}

export async function getMangaInventory(mangaId: number): Promise<MangaInventoryItem[]> {
  const response = await apiClient.get<MangaInventoryItem[]>('/manga-inventory', { params: { manga_id: mangaId } })
  return response.data ?? []
}

export async function updateManga(id: number, input: UpdateMangaInput): Promise<Manga> {
  const response = await apiClient.put<Manga>(`/mangas/${id}`, input)
  return response.data
}

/**
 * DELETE /mangas/{id}. Misma puerta que /products: la vista previa es
 * GET /products/{id}/delete-preview (un tomo es un producto) y `expected`
 * hace el mismo cross-check (2026-10-09).
 */
export async function deleteManga(id: number, opts?: DeleteProductOptions): Promise<void> {
  await apiClient.delete(`/mangas/${id}`, deleteRequestConfig(opts))
}

export async function uploadMangaImage(
  mangaId: number,
  file: File,
): Promise<{ image_url: string }> {
  const form = new FormData()
  form.append('image', file)
  const response = await apiClient.post<{ image_url: string }>(
    `/mangas/${mangaId}/image/upload`,
    form,
  )
  return response.data
}

export async function updateMangaInventory(
  mangaId: number,
  warehouseId: number,
  quantity: number,
): Promise<MangaInventoryItem> {
  const response = await apiClient.put<MangaInventoryItem>(
    `/manga-inventory/${mangaId}/${warehouseId}`,
    { quantity },
  )
  return response.data
}
