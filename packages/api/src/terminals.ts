import { apiClient } from './client'

export interface Terminal {
  id: number
  store_id: number
  name: string
  commission_percent: number
  active: boolean
  store: { id: number; name: string } | null
  created_at: string
  updated_at: string
}

export interface CreateTerminalPayload {
  store_id: number
  name: string
  commission_percent?: number
  active?: boolean
}

export interface UpdateTerminalPayload {
  name?: string
  commission_percent?: number
  active?: boolean
}

export async function getTerminals(params?: { store_id?: number; active?: boolean }): Promise<Terminal[]> {
  const response = await apiClient.get<Terminal[]>('/terminals', { params })
  return response.data
}

export async function createTerminal(payload: CreateTerminalPayload): Promise<Terminal> {
  const response = await apiClient.post<Terminal>('/terminals', payload)
  return response.data
}

export async function updateTerminal(id: number, payload: UpdateTerminalPayload): Promise<Terminal> {
  const response = await apiClient.put<Terminal>(`/terminals/${id}`, payload)
  return response.data
}

export async function deleteTerminal(id: number): Promise<void> {
  await apiClient.delete(`/terminals/${id}`)
}
