import { apiClient } from './client'

export interface ProductCategory {
  id: number
  name: string
  description: string | null
  active: boolean
  /** Productos asignados (GET /categories lo trae siempre; una categoría con productos no se puede eliminar). */
  products_count?: number
  created_at: string
  updated_at: string
}

export interface CreateCategoryPayload {
  name: string
  description?: string
  active?: boolean
}

export interface UpdateCategoryPayload {
  name?: string
  description?: string
  active?: boolean
}

export async function getCategories(params?: { active?: boolean }): Promise<ProductCategory[]> {
  const response = await apiClient.get<ProductCategory[]>('/categories', { params })
  return response.data
}

export async function createCategory(payload: CreateCategoryPayload): Promise<ProductCategory> {
  const response = await apiClient.post<ProductCategory>('/categories', payload)
  return response.data
}

export async function updateCategory(id: number, payload: UpdateCategoryPayload): Promise<ProductCategory> {
  const response = await apiClient.put<ProductCategory>(`/categories/${id}`, payload)
  return response.data
}

/** Producto vinculado a una categoría (GET /categories/{id}/products). */
export interface CategoryLinkedProduct {
  id: number
  name: string
  sku: string | null
  active: boolean
  product_type: string
  /** Cuántas OTRAS categorías tiene: 0 = quedará "Sin categoría" si se borra esta. */
  other_categories_count: number
}

export interface CategoryProductsResponse {
  category: { id: number; name: string }
  total: number
  /** Tope 300 filas; `total` es el real. */
  products: CategoryLinkedProduct[]
}

/** Productos vinculados a la categoría — para confirmar antes de borrarla (2026-08-17). */
export async function getCategoryProducts(id: number): Promise<CategoryProductsResponse> {
  const { data } = await apiClient.get<CategoryProductsResponse>(`/categories/${id}/products`)
  return data
}

export interface DeleteCategoryResult {
  /** Productos que estaban vinculados y se desvincularon. */
  unlinked: number
  /** De esos, cuántos quedaron sin ninguna categoría. */
  left_without_category: number
}

/**
 * Borra la categoría DESVINCULANDO sus productos (ya no bloquea, 2026-08-17).
 * Devuelve conteos para el toast.
 */
export async function deleteCategory(id: number): Promise<DeleteCategoryResult> {
  const { data } = await apiClient.delete<DeleteCategoryResult>(`/categories/${id}`)
  return data
}
