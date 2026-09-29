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

/** Cómo le dicen en tienda a cada almacén (Exhibición = piso, Bodega = almacén). */
const WAREHOUSE_TYPE_HINT: Partial<Record<WarehouseType, string>> = {
  store: 'piso',
  bodega: 'almacén',
}

/** Orden dentro de una tienda: Exhibición, Bodega, Central. */
const WAREHOUSE_TYPE_ORDER: Record<WarehouseType, number> = { store: 0, bodega: 1, central: 2 }

export interface WarehouseLike {
  name?: string | null
  type?: string | null
  store?: { name?: string | null } | null
}

/**
 * Etiqueta para selects/listas: "Tadaima MACRO · Exhibición (piso)".
 * Cada tienda tiene 2 almacenes; con solo el nombre de la tienda salían dos
 * opciones idénticas (bug prueba real 2026-09-28, editar tomo → Inventario).
 */
export function warehouseOptionLabel(w: WarehouseLike): string {
  const place = w.store?.name ?? w.name ?? '—'
  if (!w.type) return place
  const hint = WAREHOUSE_TYPE_HINT[w.type as WarehouseType]
  const kind = hint ? `${warehouseTypeLabel(w.type)} (${hint})` : warehouseTypeLabel(w.type)
  return `${place} · ${kind}`
}

/** Comparador: por tienda y, dentro de la tienda, Exhibición antes que Bodega. */
export function compareWarehouses(a: WarehouseLike, b: WarehouseLike): number {
  const byPlace = (a.store?.name ?? a.name ?? '').localeCompare(b.store?.name ?? b.name ?? '', 'es')
  if (byPlace !== 0) return byPlace
  const rank = (t?: string | null) => WAREHOUSE_TYPE_ORDER[t as WarehouseType] ?? 3
  return rank(a.type) - rank(b.type)
}
