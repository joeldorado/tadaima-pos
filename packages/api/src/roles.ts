import { apiClient } from './client'

export interface Permission {
  id: number
  name: string
  guard_name: string
}

export interface Role {
  id: number
  name: string
  guard_name: string
  permissions: Permission[]
}

export async function getRoles(): Promise<Role[]> {
  const response = await apiClient.get<Role[]>('/roles')
  return response.data
}

export async function createRole(name: string): Promise<Role> {
  const response = await apiClient.post<Role>('/roles', { name })
  return response.data
}

export async function updateRole(id: number, name: string): Promise<Role> {
  const response = await apiClient.put<Role>(`/roles/${id}`, { name })
  return response.data
}

export async function getPermissions(): Promise<Permission[]> {
  const response = await apiClient.get<Permission[]>('/permissions')
  return response.data
}

export async function assignRolePermissions(roleId: number, permissionIds: number[]): Promise<Role> {
  const response = await apiClient.post<Role>(`/roles/${roleId}/permissions`, { permissions: permissionIds })
  return response.data
}
