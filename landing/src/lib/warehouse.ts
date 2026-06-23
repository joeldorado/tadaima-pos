/**
 * Tipos de almacén y sus etiquetas/colores para la UI.
 *
 * Modelo de 2 stocks por tienda (2026-06-17):
 *  - `store`  = **Exhibición** (front, vendible en Caja).
 *  - `bodega` = **Bodega** (backstock atrás, NO vendible).
 *  - `central` = bodega central sin tienda (legacy).
 */
export type WarehouseType = 'central' | 'store' | 'bodega'

export const WAREHOUSE_TYPE_LABEL: Record<WarehouseType, string> = {
  store: 'Exhibición',
  bodega: 'Bodega',
  central: 'Central',
}

/** Etiqueta amigable para cualquier `type` (con fallback al valor crudo). */
export function warehouseTypeLabel(type?: string | null): string {
  if (!type) return '—'
  return WAREHOUSE_TYPE_LABEL[type as WarehouseType] ?? type
}

/** Color del Badge (paleta existente: blue/amber/purple). */
export function warehouseTypeBadgeColor(type?: string | null): 'blue' | 'amber' | 'purple' {
  if (type === 'bodega') return 'amber'
  if (type === 'central') return 'purple'
  return 'blue' // store = Exhibición
}
