/**
 * Neto de un renglón de venta ya cobrada (2026-09-29).
 *
 * `sale_items.total` es BRUTO (qty × precio). El neto real de la línea es
 * total − discount_amount (promo + descuento manual) + surcharge_amount
 * (aumento de precio). Ventas legacy (antes de Descuentos v2) traen el
 * descuento solo a nivel venta: esas se prorratean por total/subtotal.
 */

export interface SaleItemAmounts {
  total: number;
  discount_amount?: number | null;
  surcharge_amount?: number | null;
}

export interface SaleAmounts {
  subtotal?: number | null;
  discount?: number | null;
  total?: number | null;
  items?: readonly SaleItemAmounts[] | null;
}

const EPS = 0.005;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Neto del renglón: max(0, bruto − descuento) + aumento (igual que SaleCalculator). */
export function saleItemNet(i: SaleItemAmounts): number {
  return round2(Math.max(0, Number(i.total || 0) - Number(i.discount_amount || 0)) + Number(i.surcharge_amount || 0));
}

/** ¿Algún renglón trae descuento/promo o aumento propio? (venta v2 con ajustes). */
export function hasLineAdjustments(sale: SaleAmounts): boolean {
  return (sale.items ?? []).some(
    i => Number(i.discount_amount || 0) > EPS || Number(i.surcharge_amount || 0) > EPS,
  );
}

/** Venta legacy: descuento global sin montos por renglón → prorrateo por total/subtotal. */
export function isLegacyGlobalDiscountSale(sale: SaleAmounts): boolean {
  return Number(sale.discount || 0) > EPS && !hasLineAdjustments(sale);
}

/**
 * Lo que realmente ingresó por un renglón: neto por línea en ventas v2 (con
 * descuento/promo/aumento propios) o prorrateo total/subtotal en ventas legacy.
 */
export function saleItemRevenue(sale: SaleAmounts, item: SaleItemAmounts): number {
  if (!isLegacyGlobalDiscountSale(sale)) return saleItemNet(item);
  const subtotal = Number(sale.subtotal || 0);
  const ratio = subtotal > 0 ? Number(sale.total || 0) / subtotal : 1;
  return round2(Number(item.total || 0) * ratio);
}
