/**
 * Ayuda contextual: mapea rutas del router (`router/index.tsx`) al tema de
 * documentación que las explica. Solo DATA — el consumidor (item "Ayuda" del
 * menú del avatar, botón contextual, etc.) se integra en una fase posterior.
 *
 * Los patterns matchean el path exacto y sus subrutas (`/caja`, `/caja/lo-que-sea`).
 * `route-help.test.ts` garantiza que cada `topic` exista en DOC_TOPICS.
 */

export interface RouteHelp {
  pattern: RegExp
  /** Slug del tema de documentación (`?tema=<slug>` en /documentacion). */
  topic: string
}

export const ROUTE_HELP: RouteHelp[] = [
  { pattern: /^\/caja(?:\/|$)/, topic: "cobro-caja" },
  { pattern: /^\/products(?:\/|$)/, topic: "alta-producto" },
  { pattern: /^\/cortes(?:\/|$)/, topic: "cortes-caja" },
  { pattern: /^\/pre-sales(?:\/|$)/, topic: "preventas" },
  { pattern: /^\/sales(?:\/|$)/, topic: "historial-ventas" },
  { pattern: /^\/transfers(?:\/|$)/, topic: "traslados" },
  { pattern: /^\/clients(?:\/|$)/, topic: "clientes" },
  { pattern: /^\/reports(?:\/|$)/, topic: "reportes" },
  { pattern: /^\/layaways(?:\/|$)/, topic: "apartados" },
  { pattern: /^\/promos(?:\/|$)/, topic: "promos-nxm" },
  { pattern: /^\/insumos(?:\/|$)/, topic: "insumos" },
  { pattern: /^\/buscar-tiendas(?:\/|$)/, topic: "buscar-en-tiendas" },
  { pattern: /^\/settings(?:\/|$)/, topic: "tienda-online" },
  { pattern: /^\/stores(?:\/|$)/, topic: "tiendas-almacenes" },
  { pattern: /^\/admin(?:\/|$)/, topic: "usuarios-rbac" },
]

/** Tema de ayuda para un pathname, o undefined si la ruta no tiene tutorial. */
export function helpTopicFor(pathname: string): string | undefined {
  return ROUTE_HELP.find((entry) => entry.pattern.test(pathname))?.topic
}
