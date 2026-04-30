import { apiClient } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransferItem {
  id: number
  transfer_id: number
  product_id: number
  quantity: number
  product: { id: number; name: string; sku: string } | null
  created_at: string
}

export interface Transfer {
  id: number
  from_warehouse_id: number
  to_warehouse_id: number
  user_id: number
  status: 'pending' | 'completed' | 'cancelled'
  notes: string | null
  from_warehouse: { id: number; name: string } | null
  to_warehouse: { id: number; name: string } | null
  user: { id: number; name: string } | null
  items: TransferItem[] | null
  created_at: string
  updated_at: string
}

export interface TransferListResponse {
  data: Transfer[]
  pagination: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

export interface CreateTransferPayload {
  from_warehouse_id: number
  to_warehouse_id: number
  notes?: string
  items: Array<{ product_id: number; quantity: number }>
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

export async function getTransfers(params?: {
  from_warehouse_id?: number
  to_warehouse_id?: number
  status?: 'pending' | 'completed' | 'cancelled'
  from?: string
  to?: string
  per_page?: number
}): Promise<TransferListResponse> {
  const response = await apiClient.get<TransferListResponse>('/transfers', { params })
  return response.data
}

export async function getTransfer(id: number): Promise<Transfer> {
  const response = await apiClient.get<Transfer>(`/transfers/${id}`)
  return response.data
}

export async function createTransfer(payload: CreateTransferPayload): Promise<Transfer> {
  const response = await apiClient.post<Transfer>('/transfers', payload)
  return response.data
}

export async function completeTransfer(id: number): Promise<Transfer> {
  const response = await apiClient.put<Transfer>(`/transfers/${id}/complete`)
  return response.data
}

export async function cancelTransfer(id: number): Promise<Transfer> {
  const response = await apiClient.put<Transfer>(`/transfers/${id}/cancel`)
  return response.data
}

export async function getTransferItems(id: number): Promise<TransferItem[]> {
  const response = await apiClient.get<TransferItem[]>(`/transfers/${id}/items`)
  return response.data
}
