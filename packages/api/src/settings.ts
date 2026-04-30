import { apiClient } from './client'

// ─── System Settings ──────────────────────────────────────────────────────────

/** Flat key→value map returned by GET /settings */
export type SystemSettingsMap = Record<string, string | null>

export async function getSystemSettings(): Promise<SystemSettingsMap> {
  const response = await apiClient.get<SystemSettingsMap>('/settings')
  return response.data
}

export async function updateSystemSetting(
  key: string,
  value: string | null
): Promise<{ key: string; value: string | null }> {
  const response = await apiClient.put<{ key: string; value: string | null }>(
    `/settings/${key}`,
    { value }
  )
  return response.data
}

export async function batchUpdateSystemSettings(
  payload: SystemSettingsMap
): Promise<SystemSettingsMap> {
  const response = await apiClient.put<SystemSettingsMap>('/settings', payload)
  return response.data
}

// ─── System Logs ──────────────────────────────────────────────────────────────

export interface SystemLog {
  id: number
  action: string
  description: string | null
  user: { id: number; name: string } | null
  created_at: string
}

export interface SystemLogsResponse {
  data: SystemLog[]
  pagination: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

export async function getSystemLogs(params?: {
  user_id?: number
  action?: string
  from?: string
  to?: string
  search?: string
  per_page?: number
  page?: number
}): Promise<SystemLogsResponse> {
  const response = await apiClient.get<SystemLogsResponse>('/logs', { params })
  return response.data
}

// ─── Catalog Settings ─────────────────────────────────────────────────────────

export interface CatalogSettings {
  id: number
  store_id: number
  store_name: string
  catalog_url: string | null
  show_price: boolean
  show_stock: boolean
  public_url: string | null
  updated_at: string | null
}

export interface UpdateCatalogSettingsPayload {
  catalog_url?: string | null
  show_price?: boolean
  show_stock?: boolean
}

export async function getCatalogSettings(storeId: number): Promise<CatalogSettings> {
  const response = await apiClient.get<CatalogSettings>(`/catalog/settings/${storeId}`)
  return response.data
}

export async function updateCatalogSettings(
  storeId: number,
  payload: UpdateCatalogSettingsPayload
): Promise<CatalogSettings> {
  const response = await apiClient.put<CatalogSettings>(
    `/catalog/settings/${storeId}`,
    payload
  )
  return response.data
}
