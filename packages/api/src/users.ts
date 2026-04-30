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
