import type { DocTopic } from "./types"
import { hydrateTopics } from "./hydrate"
import primerosPasosData from "./data/primeros-pasos.json"
import catalogoData from "./data/catalogo.json"
import cajaData from "./data/caja.json"
import pedidosData from "./data/pedidos.json"
import inventarioData from "./data/inventario.json"
import clientesReportesData from "./data/clientes-reportes.json"
import adminData from "./data/admin.json"
import ayudaData from "./data/ayuda.json"

export type { DocTopic } from "./types"

/**
 * Registro ordenado de todos los temas de documentación.
 * El contenido vive en `data/*.json` (ver `schema.ts` / `hydrate.ts`).
 * Para agregar un tutorial: edita el JSON de su categoría y, si es una
 * categoría nueva, súmala aquí. El orden de este array define el orden del
 * hub y de las categorías (los JSON vacíos no aportan categorías al nav).
 */
export const DOC_TOPICS: DocTopic[] = [
  ...hydrateTopics(primerosPasosData, "primeros-pasos"),
  ...hydrateTopics(catalogoData, "catalogo"),
  ...hydrateTopics(cajaData, "caja"),
  ...hydrateTopics(pedidosData, "pedidos"),
  ...hydrateTopics(inventarioData, "inventario"),
  ...hydrateTopics(clientesReportesData, "clientes-reportes"),
  ...hydrateTopics(adminData, "admin"),
  ...hydrateTopics(ayudaData, "ayuda"),
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
