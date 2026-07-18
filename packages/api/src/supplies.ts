import { apiClient } from './client'

/**
 * Insumos (Fase 2): catálogo de insumos de operación + compras pagadas con
 * efectivo de la caja (crean un cash_movement 'salida' linkeado en la misma
 * transacción — el corte se auto-balancea).
 */

export interface Supply {
  id: number
  company_id: number
  /** null = toda la empresa; con valor = solo esa tienda (scoping 2026-07-16). */
  store_id?: number | null
  name: string
  category: string | null
  unit: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

/** Origen del dinero de una compra: caja del usuario, caja chica o dinero propio. */
export type SupplyMoneySource = 'caja' | 'caja_chica' | 'propio'

export interface SupplyMovementRecord {
  id: number
  supply_id: number
  type: 'purchase' | 'consumption' | 'adjustment'
  quantity: number
  amount: number
  note: string | null
  /** null en consumo/ajuste (no manejan dinero); compras legacy = 'caja'. */
  money_source: SupplyMoneySource | null
  /** Solo con money_source='propio': quién puso el dinero. */
  payer_name: string | null
  register_session_id: number | null
  cash_movement_id: number | null
  user_id: number
  created_at: string
  supply?: Pick<Supply, 'id' | 'name' | 'category' | 'unit' | 'store_id'>
  user?: { id: number; name: string }
}

export interface SupplyReport {
  period: { from: string; to: string }
  total: number
  by_category: Array<{ category: string; purchases: number; total: number }>
  /** Desglose por origen del dinero — solo 'caja' descuenta del corte. */
  by_source: Array<{ source: SupplyMoneySource; purchases: number; total: number }>
  top_supplies: Array<{
    id: number
    name: string
    category: string | null
    purchases: number
    quantity: number
    total: number
  }>
}

export async function getSupplies(params?: { all?: boolean }): Promise<Supply[]> {
  const response = await apiClient.get<Supply[]>('/supplies', {
    params: params?.all ? { all: 1 } : {},
  })
  return response.data
}

export async function createSupply(input: {
  name: string
  category?: string
  unit?: string
  is_active?: boolean
  /** null/omitido = toda la empresa (admin); gerente queda forzado a la suya. */
  store_id?: number | null
}): Promise<Supply> {
  const response = await apiClient.post<Supply>('/supplies', input)
  return response.data
}

export async function updateSupply(
  id: number,
  input: { name: string; category?: string; unit?: string; is_active?: boolean },
): Promise<Supply> {
  const response = await apiClient.put<Supply>(`/supplies/${id}`, input)
  return response.data
}

/**
 * Compra de insumo. Origen default 'caja' = efectivo de la caja abierta del
 * usuario (422 si no hay caja). Con 'caja_chica' o 'propio' NO se exige caja
 * ni se toca el corte — solo queda el registro (propio requiere payer_name).
 */
export async function registerSupplyPurchase(input: {
  supply_id: number
  quantity: number
  amount: number
  note?: string
  money_source?: SupplyMoneySource
  payer_name?: string
}): Promise<SupplyMovementRecord> {
  const response = await apiClient.post<SupplyMovementRecord>('/supplies/movements', input)
  return response.data
}

export async function getSupplyMovements(params?: {
  supply_id?: number
  type?: 'purchase' | 'consumption' | 'adjustment'
  /** Rango de fechas (día-negocio) — mismo criterio que /reports/supplies. */
  from?: string
  to?: string
  /** Filtra por la tienda dueña del insumo (supplies.store_id). Solo admin. */
  store_id?: number
}): Promise<SupplyMovementRecord[]> {
  const response = await apiClient.get<SupplyMovementRecord[]>('/supplies/movements', { params })
  return response.data
}

export async function getSupplyReport(params?: { from?: string; to?: string }): Promise<SupplyReport> {
  const response = await apiClient.get<SupplyReport>('/reports/supplies', { params })
  return response.data
}
