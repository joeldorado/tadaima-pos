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

/**
 * Resultado de abrir caja.
 *  - `ok`: sesión creada exitosamente.
 *  - `conflict`: existe otra sesión activa que bloquea la apertura. El frontend
 *    debe mostrar `ResumeSessionModal` (mismo user) o `SessionConflictModal`
 *    (otro user) según `conflict.kind`.
 */
export type OpenSessionResult =
  | { ok: true; session: CashSession }
  | { ok: false; conflict: OpenSessionConflict }

export interface OpenSessionConflict {
  /** 'own' = el usuario ya tiene sesión abierta. 'foreign' = otro usuario. */
  kind: 'own' | 'foreign'
  error: string
  existing_session: {
    id: number
    opening_cash: number
    opened_at: string | null
    user: { id: number; name: string } | null
    register: { id: number; name: string } | null
    store: { id: number; name: string } | null
    /** true si la sesión existente es de la MISMA caja que el user intentó abrir. */
    same_register: boolean
  }
}

/**
 * POST /cash/open
 *
 * Devuelve `{ok: true, session}` en éxito o `{ok: false, conflict}` en 409.
 * Cualquier otro error sigue tirando excepción.
 */
export async function openSession(registerId: number, openingCash: number): Promise<OpenSessionResult> {
  try {
    const response = await apiClient.post<CashSession>('/cash/open', {
      register_id: registerId,
      opening_cash: openingCash,
    })
    return { ok: true, session: response.data }
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: OpenSessionConflict } }
    if (e?.response?.status === 409 && e.response.data?.kind) {
      return { ok: false, conflict: e.response.data }
    }
    throw err
  }
}

/**
 * POST /cash/sessions/{id}/force-close — admin cierra remotamente una sesión
 * colgada (típicamente de otro usuario que dejó la tab abierta).
 */
export async function forceCloseSession(sessionId: number, closingCash?: number): Promise<CashSession> {
  const response = await apiClient.post<CashSession>(`/cash/sessions/${sessionId}/force-close`, {
    ...(closingCash !== undefined ? { closing_cash: closingCash } : {}),
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

/**
 * GET /cash/registers extendido con `active_session` embebida — el selector
 * de cajas usa esta variante para marcar "Ocupada" / "Reanudar" sin doble query.
 * Backend siempre devuelve este shape; el legacy `CashRegisterInfo` solo es
 * una vista parcial.
 */
export interface CashRegisterWithSession extends CashRegisterInfo {
  active_session: {
    id: number
    user_id: number
    user_name: string | null
    opened_at: string | null
    opening_cash: number
    sales_count: number
  } | null
}

export async function getCashRegistersWithSession(storeId?: number): Promise<CashRegisterWithSession[]> {
  const response = await apiClient.get<CashRegisterWithSession[]>('/cash/registers', {
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
