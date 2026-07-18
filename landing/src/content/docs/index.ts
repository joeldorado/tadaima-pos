import type { DocTopic } from "./types"
import { CATALOGO_TOPICS } from "./catalogo"
import { CAJA_TOPICS } from "./caja"
import { PEDIDOS_TOPICS } from "./pedidos"
import { INVENTARIO_TOPICS } from "./inventario"
import { CLIENTES_REPORTES_TOPICS } from "./clientes-reportes"
import { ADMIN_TOPICS } from "./admin"

export type { DocTopic } from "./types"

/**
 * Registro ordenado de todos los temas de documentación.
 * Para agregar un tutorial: crea/edita un archivo de categoría y súmalo aquí.
 * El orden de este array define el orden del hub y de las categorías.
 */
export const DOC_TOPICS: DocTopic[] = [
  ...CATALOGO_TOPICS,
  ...CAJA_TOPICS,
  ...PEDIDOS_TOPICS,
  ...INVENTARIO_TOPICS,
  ...CLIENTES_REPORTES_TOPICS,
  ...ADMIN_TOPICS,
]

/** Categorías en orden de aparición (derivadas del orden de DOC_TOPICS). */
export const DOC_CATEGORIES: string[] = DOC_TOPICS.reduce<string[]>((acc, t) => {
  if (!acc.includes(t.category)) acc.push(t.category)
  return acc
}, [])

export function findTopic(slug: string | null | undefined): DocTopic | undefined {
  if (!slug) return undefined
  return DOC_TOPICS.find((t) => t.slug === slug)
}
