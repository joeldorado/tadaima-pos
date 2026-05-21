import { apiClient } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CashRegister {
  id: number
  store_id: number
  name: string
  active: boolean
}

export interface CashMovement {
  id: number
  register_session_id: number
  type: 'entrada' | 'salida' | 'ajuste'
  amount: number
  description: string | null
  created_at: string
}

export interface CashSession {
  id: number
  register_id: number
  user_id: number
  status: 'open' | 'closed'
  opening_cash: number
  closing_cash: number | null
  opened_at: string
  closed_at: string | null
  /** Computed: opening_cash + entradas - salidas */
  balance: number | null
  register: { id: number; name: string; store_id: number } | null
  user: { id: number; name: string } | null
  movements: CashMovement[] | null
}

export interface CashMovementsResponse {
  session_id: number
  opening_cash: number
  balance: number
  data: CashMovement[]
  pagination: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/** GET /cash/session — sesión activa del usuario autenticado (null si no hay) */
export async function getActiveSession(): Promise<CashSession | null> {
  const response = await apiClient.get<CashSession | null>('/cash/session')
  return response.data
}

/** POST /cash/open */
export async function openSession(registerId: number, openingCash: number): Promise<CashSession> {
  const response = await apiClient.post<CashSession>('/cash/open', {
    register_id: registerId,
    opening_cash: openingCash,
  })
  return response.data
}

/** POST /cash/close */
export async function closeSession(closingCash: number): Promise<CashSession> {
  const response = await apiClient.post<CashSession>('/cash/close', { closing_cash: closingCash })
  return response.data
}

/** POST /cash/movements */
export async function addCashMovement(payload: {
  type: 'entrada' | 'salida' | 'ajuste'
  amount: number
  description?: string
}): Promise<CashMovement> {
  const response = await apiClient.post<CashMovement>('/cash/movements', payload)
  return response.data
}

/** GET /cash/registers — lista las cajas registradoras de una tienda */
export interface CashRegisterInfo {
  id: number
  store_id: number
  name: string
  active: boolean
}

export async function getCashRegisters(storeId?: number): Promise<CashRegisterInfo[]> {
  const response = await apiClient.get<CashRegisterInfo[]>('/cash/registers', {
    params: storeId ? { store_id: storeId } : undefined,
  })
  return response.data
}

export interface ActiveCashSessionSummary {
  id: number
  register_id: number
  register_name: string | null
  store_id: number | null
  user_id: number
  user_name: string | null
  /** URL absoluta lista para <img src> — null si el cajero usa iniciales */
  user_avatar_url: string | null
  opened_at: string
  opening_cash: number
}

/** GET /cash/active-sessions?store_id= — sesiones abiertas de una tienda con su cajero */
export async function getActiveSessions(storeId?: number): Promise<ActiveCashSessionSummary[]> {
  const response = await apiClient.get<ActiveCashSessionSummary[]>('/cash/active-sessions', {
    params: storeId ? { store_id: storeId } : undefined,
  })
  return response.data
}

/** GET /cash/movements */
export async function getCashMovements(params?: {
  session_id?: number
  type?: 'entrada' | 'salida' | 'ajuste'
  from?: string
  to?: string
  per_page?: number
}): Promise<CashMovementsResponse> {
  const response = await apiClient.get<CashMovementsResponse>('/cash/movements', { params })
  return response.data
}
