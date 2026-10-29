import { apiClient } from './client'

// ─── Actividad del sistema (solo admin, 2026-10-29) ───────────────────────────
// Feed unificado de `inventory_movements` + `system_logs`: quién hizo qué, con
// qué producto y en qué tienda. Contrato: backend/app/Services/ActivityFeedService.php.

export type ActivityGroup =
  | 'stock'
  | 'producto'
  | 'venta'
  | 'caja'
  | 'paquete'
  | 'preventa'
  | 'insumo'
  | 'sistema'
  | 'impresion'

export const ACTIVITY_GROUPS: readonly ActivityGroup[] = [
  'stock', 'producto', 'venta', 'caja', 'paquete', 'preventa', 'insumo', 'sistema', 'impresion',
] as const

export interface ActivityRef {
  id: number
  name: string
}

export interface ActivityProduct {
  id: number
  name: string
  sku: string | null
  type: 'product' | 'manga' | 'bundle' | null
  /** El producto ya no existe: nombre/SKU vienen del snapshot del log de borrado. */
  deleted: boolean
}

export interface ActivityEvent {
  /** `mov:123` (movimiento de inventario) o `log:456` (bitácora del sistema). */
  id: string
  source: 'mov' | 'log'
  /** ISO UTC. */
  at: string
  /** null = acción del sistema (comando artisan, sin usuario). */
  user: ActivityRef | null
  group: ActivityGroup
  /** `mov.<tipo>` para movimientos; la `action` del log para la bitácora. */
  action: string
  title: string
  product: ActivityProduct | null
  store: ActivityRef | null
  warehouse: { id: number; name: string; type: 'store' | 'bodega' | 'central' | null } | null
  qty_delta: number | null
  stock_before: number | null
  stock_after: number | null
  reference: string | null
  /** Solo logs: texto original de la bitácora. */
  description?: string | null
  /** Solo logs: entidad afectada. */
  entity?: { type: string; id: number | null } | null
  /** Logs: `meta` crudo (p. ej. `changes`). Movimientos: `{ type, quantity, notes }`. */
  meta: Record<string, unknown> | null
}

export interface ActivityPagination {
  total: number
  per_page: number
  current_page: number
  last_page: number
}

export interface ActivityFeedResponse {
  data: ActivityEvent[]
  pagination: ActivityPagination
}

export interface ActivitySummary {
  range: { from: string | null; to: string | null; dates: string[]; narrow: boolean }
  totals: { events: number; movements: number; logs: number }
  by_group: Array<{ group: ActivityGroup; count: number }>
  by_action: Array<{ action: string; title: string; group: ActivityGroup; count: number }>
  by_user: Array<{ user: ActivityRef | null; count: number }>
  by_day: Array<{ day: string; count: number }>
  top_products: Array<{ product: ActivityProduct; count: number }>
  noise_excluded: { zero_adjustments: number; print_logs: number; duplicate_adjust_logs: number }
}

export interface GetActivityParams {
  from?: string
  to?: string
  /** Fechas sueltas `a,b,c` (ganan sobre from/to). */
  dates?: string
  product_ids?: number[]
  user_id?: number
  store_id?: number
  /** Grupos separados por coma. */
  group?: string
  action?: string
  search?: string
  include_noise?: 0 | 1
  per_page?: number
  page?: number
}

export async function getActivity(params?: GetActivityParams): Promise<ActivityFeedResponse> {
  const response = await apiClient.get<ActivityFeedResponse>('/activity', { params })
  return response.data
}

export async function getActivitySummary(params?: GetActivityParams): Promise<ActivitySummary> {
  const response = await apiClient.get<ActivitySummary>('/activity/summary', { params })
  return response.data
}

/**
 * CSV con los mismos filtros (tope 20,000 filas en el servidor). Va por axios
 * (no por `<a href>`) porque el Bearer tiene que viajar en el header.
 */
export async function exportActivityCsv(params?: GetActivityParams): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>('/activity/export', { params, responseType: 'blob' })
  const disposition = String(response.headers['content-disposition'] ?? '')
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  return { blob: response.data, filename: match?.[1] ?? 'actividad.csv' }
}
