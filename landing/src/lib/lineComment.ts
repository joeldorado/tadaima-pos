/**
 * Comentario por línea del carrito de Caja (2026-10-03): un texto corto que el
 * cajero anota desde el menú ⋮ como recordatorio ("para la promo", "regalo").
 * Se ve junto al nombre del producto y se guarda en `sale_items.comment`; no
 * cambia montos ni se imprime en el ticket.
 *
 * Lógica pura, estructural (no importa CartItem) para probarla en aislamiento.
 */

/** Debe coincidir con `SaleItem::COMMENT_MAX` del backend. */
export const LINE_COMMENT_MAX = 80;

/** Texto listo para guardar: sin espacios de sobra y dentro del tope. "" = sin comentario. */
export function normalizeLineComment(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, LINE_COMMENT_MAX).trim();
}

/** Copia de la línea con el comentario puesto; vacío quita la llave. */
export function withLineComment<T extends { comment?: string }>(line: T, raw: string): T {
  const comment = normalizeLineComment(raw);
  const copy = { ...line };
  delete copy.comment;
  return comment ? { ...copy, comment } : copy;
}

/** Fragmento del payload de cobro: `comment` solo viaja si hay algo que guardar. */
export function lineCommentPayload(line: { comment?: string }): { comment?: string } {
  const comment = normalizeLineComment(line.comment ?? "");
  return comment ? { comment } : {};
}
