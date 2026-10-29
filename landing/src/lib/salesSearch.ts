/**
 * Buscador de la pantalla Ventas (Lista de Ventas y Por Producto), 2026-10-29.
 *
 * Antes cada línea se comparaba contra UN solo nombre y UN solo SKU, con
 * prioridad al producto actual (`item.product`) y el snapshot de la venta
 * (`product_name` / `product_sku`) solo como respaldo. Si el producto cambió de
 * nombre o SKU después de venderse, la venta ya no se encontraba con el dato
 * que decía el ticket. Aquí se juntan TODOS los nombres y códigos conocidos de
 * la línea y se compara sin acentos ni mayúsculas (misma normalización que la
 * búsqueda de clientes).
 */
import { normalizeSearchText } from "./customerSearch";

/** Lo mínimo de una línea de venta que necesita el buscador. */
export interface SearchableSaleItem {
  product?: { name?: string | null; sku?: string | null } | null;
  product_name?: string | null;
  product_sku?: string | null;
}

/** Dato del catálogo cargado aparte (productMap de SalesPage). */
export interface SearchableProductInfo {
  name?: string | null;
  sku?: string | null;
}

/** Texto de búsqueda listo para comparar: sin espacios sobrantes, acentos ni mayúsculas. */
export function normalizeSalesQuery(raw: string): string {
  return normalizeSearchText(raw.trim());
}

/**
 * Todos los nombres y códigos con los que se puede encontrar una línea, ya
 * normalizados y sin repetidos: producto actual, snapshot de la venta y
 * catálogo cargado aparte.
 */
export function saleItemSearchTerms(
  item: SearchableSaleItem,
  info?: SearchableProductInfo | null,
): string[] {
  const candidates = [
    item.product?.name,
    item.product_name,
    info?.name,
    item.product?.sku,
    item.product_sku,
    info?.sku,
  ];
  const terms = candidates
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .map(normalizeSearchText);
  return Array.from(new Set(terms));
}

/** `true` si algún nombre o código de la línea contiene el texto buscado (ya normalizado). */
export function saleItemMatchesQuery(
  item: SearchableSaleItem,
  normalizedQuery: string,
  info?: SearchableProductInfo | null,
): boolean {
  if (normalizedQuery === "") return true;
  return saleItemSearchTerms(item, info).some(term => term.includes(normalizedQuery));
}
