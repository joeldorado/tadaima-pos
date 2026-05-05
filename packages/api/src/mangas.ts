import { apiClient } from './client'
import type { Manga, CreateMangaInput, UpdateMangaInput, MangaInventoryItem } from './types'

export interface GetMangasParams {
  store_id?: number
  genre?: string
  editorial?: string
  search?: string
  active?: boolean
  per_page?: number
}

export async function getMangas(params?: GetMangasParams): Promise<Manga[]> {
  const response = await apiClient.get<{ data: Manga[] }>('/mangas', { params })
  return response.data.data
}

export async function createManga(input: CreateMangaInput): Promise<Manga> {
  const response = await apiClient.post<Manga>('/mangas', input)
  return response.data
}

export async function getMangaInventory(mangaId: number): Promise<MangaInventoryItem[]> {
  const response = await apiClient.get<{ data: MangaInventoryItem[] }>('/manga-inventory', { params: { manga_id: mangaId } })
  return response.data.data
}

export async function updateManga(id: number, input: UpdateMangaInput): Promise<Manga> {
  const response = await apiClient.put<Manga>(`/mangas/${id}`, input)
  return response.data
}

export async function deleteManga(id: number): Promise<void> {
  await apiClient.delete(`/mangas/${id}`)
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
