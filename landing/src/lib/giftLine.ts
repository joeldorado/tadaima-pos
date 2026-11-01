/**
 * Regalo por línea (2026-10-31): la línea se cobra en $0 y su costo en la venta
 * es 0 (el del inventario no cambia). Constantes compartidas por Caja, Ventas y
 * el corte para que la etiqueta «Regalo» se vea igual en todos lados.
 */

/** Color de la etiqueta «Regalo». */
export const GIFT_COLOR = "#EC4899";

/** Largo máximo de la nota del regalo (espejo de SaleGift::NOTE_MAX). */
export const GIFT_NOTE_MAX = 80;
