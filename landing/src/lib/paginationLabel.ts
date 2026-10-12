/**
 * Texto del pie de una tabla paginada EN EL SERVIDOR:
 * "Mostrando 21–40 de 2,803 · página 2 de 141".
 *
 * `total` es el total real que regresa el backend, no las filas cargadas —
 * contar lo cargado fue justo el bug del tab Tomos ("50 tomos" con ~2.8k en
 * catálogo, 2026-10-12).
 */
export interface PaginationRangeInput {
  /** Página actual, base 0. */
  pageIndex: number
  pageSize: number
  /** Filas que trae la página en pantalla. */
  rowsOnPage: number
  /** Total real del servidor. */
  total: number
  pageCount: number
}

const fmt = (n: number): string => n.toLocaleString('es-MX')

export function paginationRangeLabel(input: PaginationRangeInput): string {
  const { pageIndex, pageSize, rowsOnPage, total } = input
  const pageCount = Math.max(1, input.pageCount)
  const from = rowsOnPage === 0 ? 0 : pageIndex * pageSize + 1
  const to = pageIndex * pageSize + rowsOnPage
  return `Mostrando ${fmt(from)}–${fmt(to)} de ${fmt(total)} · página ${fmt(pageIndex + 1)} de ${fmt(pageCount)}`
}
