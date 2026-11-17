/**
 * Descuento manual de una pieza de preventa al liquidar en Caja (2026-11-16, T-003).
 *
 * Es el mismo descuento de una venta normal ($ o %, por pieza o por línea, con
 * motivo y nota), calculado sobre el precio pactado de la pieza. Tope: lo que
 * le FALTA pagar (decisión de Joel: nunca sale dinero de la caja). El servidor
 * lo recalcula y rechaza lo que pase de ahí (`App\Support\PresaleItemDiscount`).
 */
import { computeLineDiscountAmount, type LineDiscount } from "./saleCalc";
import type { PreSaleItemDiscountInput } from "@tadaima/api";

export interface PresaleDiscountLine {
  quantity: number;
  /** Precio pactado por pieza (bruto). */
  preSaleUnitPrice?: number | undefined;
  /** Lo que le falta pagar a la pieza antes del descuento. */
  preSalePending?: number | undefined;
  /** Anticipo ya cubierto de la pieza (para reconstruir el precio en carritos viejos). */
  depositAmount?: number | undefined;
  preSaleOrderItemId?: number | undefined;
  discount?: LineDiscount | undefined;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Precio pactado por pieza. Carritos guardados antes del cambio: anticipo + saldo. */
export function presaleGrossUnitPrice(line: PresaleDiscountLine): number {
  if (line.preSaleUnitPrice != null) return line.preSaleUnitPrice;
  const qty = Math.max(1, line.quantity || 1);
  return round2(((line.depositAmount ?? 0) + (line.preSalePending ?? 0)) / qty);
}

/** Monto del descuento de la pieza (sin tope): mismo cálculo que una venta. */
export function presaleLineDiscount(line: PresaleDiscountLine): number {
  if (!line.discount) return 0;
  return computeLineDiscountAmount(line.discount, { unitPrice: presaleGrossUnitPrice(line), qty: line.quantity });
}

/** Lo que se cobra hoy de la pieza: lo que le falta menos su descuento (nunca negativo). */
export function presaleLineCharge(line: PresaleDiscountLine, pendingFallback = 0): number {
  const pending = line.preSalePending ?? pendingFallback;
  return round2(Math.max(0, pending - presaleLineDiscount(line)));
}

/** Desglose de una línea de folio cargado en Caja, para enseñarlo completo. */
export interface PresaleLineBreakdown {
  /** Precio pactado por pieza. */
  unitPrice: number;
  /** Precio pactado × piezas. */
  gross: number;
  /** Anticipo que ya cubre a esta línea. */
  deposit: number;
  /** Lo que le falta antes del descuento. */
  pending: number;
  /** Descuento manual, topado a lo que falta. */
  discount: number;
  /** Lo que se cobra hoy. */
  charge: number;
}

/**
 * Lo que Caja enseña de una línea de folio: precio pactado, anticipo y lo que
 * falta. Antes la línea decía «2 × $399» con lo que FALTA por pieza y parecía
 * que el anticipo no se había restado (caso de tienda 2026-11-17: 2 × $599 con
 * $400 de anticipo). Carritos guardados sin `preSaleUnitPrice`: anticipo + saldo.
 */
export function presaleLineBreakdown(line: PresaleDiscountLine, pendingFallback = 0): PresaleLineBreakdown {
  const qty = Math.max(1, line.quantity || 1);
  const pending = round2(Math.max(0, line.preSalePending ?? pendingFallback));
  const gross = line.preSaleUnitPrice != null
    ? round2(line.preSaleUnitPrice * qty)
    : round2((line.depositAmount ?? 0) + pending);
  const unitPrice = line.preSaleUnitPrice ?? round2(gross / qty);
  const discount = line.discount
    ? round2(Math.min(pending, Math.max(0, computeLineDiscountAmount(line.discount, { unitPrice, qty: line.quantity }))))
    : 0;
  return {
    unitPrice,
    gross,
    deposit: round2(Math.max(0, gross - pending)),
    pending,
    discount,
    charge: round2(pending - discount),
  };
}

/** Descuentos de las piezas que se entregan, como los espera `PATCH /pre-sale-orders/{id}/status`. */
export function presaleDiscountPayload(lines: readonly PresaleDiscountLine[]): PreSaleItemDiscountInput[] {
  return lines.flatMap((l) => {
    if (!l.discount || l.preSaleOrderItemId == null) return [];
    const d = l.discount;
    return [{
      item_id: l.preSaleOrderItemId,
      kind: d.kind,
      basis: d.basis,
      value: d.value,
      reason: d.reason,
      ...(d.note ? { note: d.note } : {}),
    }];
  });
}
