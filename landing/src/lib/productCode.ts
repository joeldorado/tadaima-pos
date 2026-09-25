/**
 * Reglas del aviso "este código ya existe" en el alta de producto
 * (Joel 2026-09-25). El sistema viejo preguntaba "Ya existe artículo con
 * código X, ¿desea modificarlo?"; aquí mostramos CUÁL es y ofrecemos editarlo.
 * El match real lo hace el backend (GET /products/lookup, exacto contra SKU o
 * código de barras, sin distinguir mayúsculas) — esto solo decide CUÁNDO
 * preguntar y QUÉ tipo de coincidencia es.
 */

/** Forma canónica para comparar códigos: sin espacios a los lados, en mayúsculas. */
export function normalizeCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

/** Mínimo de caracteres para consultar (mismo tope que el backend). */
export const MIN_LOOKUP_LENGTH = 3;

/**
 * ¿Vale la pena consultar este código? No con menos de 3 caracteres (medio
 * tecleado) ni con un placeholder `PEND-…` (lo genera el sistema, es único).
 */
export function shouldLookupCode(code: string | null | undefined): boolean {
  const c = normalizeCode(code);
  return c.length >= MIN_LOOKUP_LENGTH && !c.startsWith("PEND-");
}

/**
 * ¿La coincidencia es por SKU? Un SKU repetido lo rechaza el backend (único);
 * si solo coincide el código de barras de otro producto, el alta sí procede
 * (solo avisamos).
 */
export function isSkuMatch(product: { sku: string }, code: string | null | undefined): boolean {
  return normalizeCode(product.sku) === normalizeCode(code);
}
