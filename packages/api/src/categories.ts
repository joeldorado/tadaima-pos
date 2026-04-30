import { apiClient } from './client'

export interface ProductCategory {
  id: number
  name: string
  description: string | null
  active: boolean
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

export async function deleteCategory(id: number): Promise<void> {
  await apiClient.delete(`/categories/${id}`)
}
