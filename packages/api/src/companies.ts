import { apiClient } from './client'

export interface Company {
  id: number
  name: string
  rfc: string | null
  address: string | null
  phone: string | null
  email: string | null
  logo_path: string | null
  active: boolean
  stores_count?: number
  created_at: string
  updated_at: string
}

export interface CreateCompanyPayload {
  name: string
  rfc?: string
  address?: string
  phone?: string
  email?: string
  active?: boolean
}

export type UpdateCompanyPayload = Partial<CreateCompanyPayload>

export async function getCompanies(params?: { active?: boolean }): Promise<Company[]> {
  const response = await apiClient.get<Company[]>('/companies', { params })
  return response.data
}

export async function createCompany(payload: CreateCompanyPayload): Promise<Company> {
  const response = await apiClient.post<Company>('/companies', payload)
  return response.data
}

export async function updateCompany(id: number, payload: UpdateCompanyPayload): Promise<Company> {
  const response = await apiClient.put<Company>(`/companies/${id}`, payload)
  return response.data
}
