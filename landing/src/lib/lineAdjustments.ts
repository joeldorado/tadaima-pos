/**
 * Ajuste manual por línea del carrito de Caja: DESCUENTO o AUMENTO de precio
 * (2026-09-29). Una línea lleva uno u otro, nunca ambos.
 *
 * Aplicar a menos unidades que la línea la separa en 2 (split): la original
 * conserva las unidades a precio normal y la nueva lleva el ajuste + referencia
 * al padre. Quitar el ajuste la vuelve a fusionar con su padre (o con otra
 * línea "simple" del mismo producto y nivel).
 *
 * Lógica pura (sin React ni stores), estructural como cartSync.ts: no importa
 * CartItem, así se prueba en aislamiento.
 */
import type { LineDiscount, LineSurcharge } from "@/lib/saleCalc";

/** Lo mínimo que necesita de una línea del carrito. */
export interface AdjustableLine {
  lineId: string;
  parentLineId?: string;
  product: { id: string };
  quantity: number;
  priceLevel: string;
  discount?: LineDiscount;
  surcharge?: LineSurcharge;
  isDamaged?: boolean;
  isFromPreSale?: boolean;
  sellingCatalogId?: number | null;
}

export type LineAdjustment =
  | { direction: "discount"; discount: LineDiscount }
  | { direction: "surcharge"; surcharge: LineSurcharge };

/** Línea "simple": sin ajuste, no dañada, no preventa. Solo estas se fusionan. */
export function isPlainLine(l: AdjustableLine): boolean {
  return !l.discount && !l.surcharge && !l.isDamaged && !l.isFromPreSale && l.sellingCatalogId == null;
}

/** Ajuste actual de la línea (para precargar el modal en modo edición). */
export function lineAdjustmentOf(l: AdjustableLine): LineAdjustment | undefined {
  if (l.discount) return { direction: "discount", discount: l.discount };
  if (l.surcharge) return { direction: "surcharge", surcharge: l.surcharge };
  return undefined;
}

/** Copia de la línea sin ningún ajuste (y opcionalmente sin padre). */
function stripAdjustment<T extends AdjustableLine>(line: T, dropParent = false): T {
  const copy = { ...line };
  delete copy.discount;
  delete copy.surcharge;
  if (dropParent) delete copy.parentLineId;
  return copy;
}

function withAdjustment<T extends AdjustableLine>(line: T, adj: LineAdjustment): T {
  const base = stripAdjustment(line);
  return adj.direction === "discount"
    ? { ...base, discount: adj.discount }
    : { ...base, surcharge: adj.surcharge };
}

/**
 * Aplica el ajuste a `units` unidades de la línea. Menos que la línea → split.
 * Reemplaza cualquier ajuste previo (descuento ↔ aumento son excluyentes).
 */
export function applyLineAdjustment<T extends AdjustableLine>(
  items: readonly T[],
  lineId: string,
  unitsToAdjust: number,
  adj: LineAdjustment,
  newId: () => string,
): T[] {
  const idx = items.findIndex(i => i.lineId === lineId);
  const line = items[idx];
  if (!line) return [...items];
  const units = Math.max(1, Math.min(Math.floor(unitsToAdjust), line.quantity));

  if (units >= line.quantity) {
    return items.map(i => (i.lineId === lineId ? withAdjustment(i, adj) : i));
  }

  const adjusted: T = { ...withAdjustment(line, adj), lineId: newId(), parentLineId: line.lineId, quantity: units };
  const next = [...items];
  next[idx] = { ...line, quantity: line.quantity - units };
  next.splice(idx + 1, 0, adjusted);
  return next;
}

/**
 * Quita el ajuste. Merge-back: prefiere la línea PADRE del split; si ya no
 * existe, cualquier otra línea simple del mismo producto y nivel. Si no hay
 * con quién fusionar, la línea queda sin ajuste.
 */
export function removeLineAdjustment<T extends AdjustableLine>(items: readonly T[], lineId: string): T[] {
  const line = items.find(i => i.lineId === lineId);
  if (!line) return [...items];

  const isPlainSibling = (i: T) =>
    i.lineId !== lineId &&
    i.product.id === line.product.id &&
    i.priceLevel === line.priceLevel &&
    isPlainLine(i);
  const target =
    (line.parentLineId ? items.find(i => i.lineId === line.parentLineId && isPlainSibling(i)) : undefined)
    ?? items.find(isPlainSibling);

  if (target) {
    return items
      .filter(i => i.lineId !== lineId)
      .map(i => (i.lineId === target.lineId ? { ...i, quantity: i.quantity + line.quantity } : i));
  }
  return items.map(i => (i.lineId === lineId ? stripAdjustment(i, true) : i));
}
