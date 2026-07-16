import { apiClient } from './client'
import type { User } from './types'

export interface CreateUserPayload {
  name: string
  email: string
  password: string
  phone?: string
  address?: string
  company_id?: number
  store_id?: number
  active?: boolean
  can_view_cost?: boolean
  can_edit_catalog?: boolean
  can_manage_promos?: boolean
  role_id?: number
}

export interface UpdateUserPayload {
  name?: string
  email?: string
  password?: string
  phone?: string
  address?: string
  company_id?: number | null
  store_id?: number | null
  active?: boolean
  can_view_cost?: boolean
  can_edit_catalog?: boolean
  can_manage_promos?: boolean
}

export interface GetUsersParams {
  store_id?: number
  company_id?: number
  active?: boolean
  search?: string
}

export async function getUsers(params?: GetUsersParams): Promise<User[]> {
  const response = await apiClient.get<User[]>('/users', { params })
  return response.data
}

export async function getUser(id: number): Promise<User> {
  const response = await apiClient.get<User>(`/users/${id}`)
  return response.data
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const response = await apiClient.post<User>('/users', payload)
  return response.data
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<User> {
  const response = await apiClient.put<User>(`/users/${id}`, payload)
  return response.data
}

export async function deleteUser(id: number): Promise<void> {
  await apiClient.delete(`/users/${id}`)
}

export async function assignRole(userId: number, roleId: number): Promise<{ roles: string[] }> {
  const response = await apiClient.post<{ roles: string[] }>(`/users/${userId}/roles`, { role_id: roleId })
  return response.data
}

export async function removeRole(userId: number, roleId: number): Promise<{ roles: string[] }> {
  const response = await apiClient.delete<{ roles: string[] }>(`/users/${userId}/roles/${roleId}`)
  return response.data
}

/** POST /users/{id}/avatar — sube foto custom al bucket (multipart). */
export async function uploadUserAvatar(userId: number, file: File): Promise<User> {
  const form = new FormData()
  form.append('image', file)
  const response = await apiClient.post<User>(`/users/${userId}/avatar`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

/** PUT /users/{id}/avatar/external — guarda URL externa (whitelisted: PokéAPI, DiceBear). */
export async function setUserExternalAvatar(userId: number, url: string): Promise<User> {
  const response = await apiClient.put<User>(`/users/${userId}/avatar/external`, { url })
  return response.data
}

/** DELETE /users/{id}/avatar — quita avatar (vuelve a iniciales). */
export async function removeUserAvatar(userId: number): Promise<User> {
  const response = await apiClient.delete<User>(`/users/${userId}/avatar`)
  return response.data
}

export interface OnlineUser {
  id: number
  name: string
  avatar_url: string | null
  store_id: number | null
  store_name: string | null
  last_seen_at: string | null
  roles: string[]
}

/** GET /users/online?store_id= — usuarios con last_seen_at < 2 min */
export async function getOnlineUsers(storeId?: number): Promise<OnlineUser[]> {
  const response = await apiClient.get<OnlineUser[]>('/users/online', {
    params: storeId ? { store_id: storeId } : undefined,
  })
  return response.data
}
