/**
 * Detalle de productos de un traslado (2026-10-09): la tarjeta solo enseña el
 * primero y "+N más"; el popup lista todos con su cantidad. Aquí vive la parte
 * pura (resumen, búsqueda y texto del botón) para testearla sin React.
 */
import type { TransferItem } from "@tadaima/api";
import { normalizeSearchText } from "./customerSearch";

export interface TransferItemsSummary {
  /** Productos distintos (renglones del traslado). */
  skus: number;
  /** Piezas totales (suma de cantidades). */
  pieces: number;
}

export function summarizeTransferItems(items: readonly TransferItem[] | null): TransferItemsSummary {
  const list = items ?? [];
  return {
    skus: list.length,
    pieces: list.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0),
  };
}

/** Busca por nombre o SKU: todas las palabras deben aparecer, sin acentos. */
export function filterTransferItems(items: readonly TransferItem[] | null, query: string): TransferItem[] {
  const list = items ?? [];
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...list];
  return list.filter(it => {
    if (!it.product) return false;
    const haystack = normalizeSearchText(`${it.product.name} ${it.product.sku}`);
    return words.every(w => haystack.includes(w));
  });
}

export function transferItemsLabel(count: number): string {
  return count === 1 ? "Ver producto" : `Ver ${count} productos`;
}
