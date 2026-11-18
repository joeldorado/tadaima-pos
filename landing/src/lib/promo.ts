/**
 * Promo / descuento por cantidad de Caja (MVP, Joel 2026-06-29).
 *
 * El cajero captura la promo de dos formas (botón "Promo", activo desde 2+ piezas):
 *  - **% rápido** (5/10/15/20): descuento = subtotal × pct/100.
 *  - **Precio final** del combo (ej. 2 funkos = $510): descuento = subtotal − precioFinal.
 *
 * Siempre devuelve un MONTO ABSOLUTO en pesos, redondeado a 2 decimales y
 * clampeado a [0, subtotal] (nunca negativo ni mayor que el subtotal — el backend
 * también valida `discount ≤ subtotal`). El módulo completo por temporada/producto
 * se hará después; aquí la promo es manual por venta.
 */
export function computePromoDiscount(input: {
  subtotal: number;
  pct?: number;
  finalPrice?: number;
}): number {
  const { subtotal, pct, finalPrice } = input;
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;

  let raw = 0;
  if (finalPrice != null && Number.isFinite(finalPrice)) {
    raw = subtotal - finalPrice;
  } else if (pct != null && Number.isFinite(pct)) {
    raw = subtotal * (pct / 100);
  }

  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(round2(raw), subtotal);
}

/**
 * Monto real a cobrar en una venta regular/mixta (sin preventa): precio completo
 * de los ítems regulares + anticipos de catálogo, MENOS el descuento de promo.
 *
 * Fuente única del "Total a pagar" del panel de cobro. Antes el cálculo en línea
 * de `SellPage` olvidaba restar el descuento (bug 2026-06-29 foto 4r.png: subtotal
 * $360 con promo −$60 seguía cobrando $360). Clampeado a ≥ 0.
 */
export function computeRegularChargeAmount(input: {
  regularSubtotal: number;
  catalogDeposit: number;
  discountAmt: number;
  /** Σ aumentos de precio por línea (2026-09-29). */
  surchargeAmt?: number;
}): number {
  return Math.max(0, input.regularSubtotal + input.catalogDeposit - input.discountAmt + (input.surchargeAmt ?? 0));
}

/**
 * Monto real a cobrar con un folio de preventa CARGADO en la mesa: lo que falta
 * de sus piezas (`folioCharge`) + el neto de los productos regulares + el
 * ANTICIPO de las preventas nuevas agregadas a la misma mesa.
 *
 * Antes el cálculo en línea de `SellPage` sumaba la preventa nueva a precio
 * completo, pero al cobrar solo viaja su anticipo: la pantalla pedía de más y el
 * botón se quedaba en «Faltan $X» (2026-11-17). El descuento y el aumento son de
 * las líneas regulares, así que el clamp ≥ 0 no toca al folio ni al anticipo.
 */
export function computeLoadedFolioChargeAmount(input: {
  /** Lo que falta de las piezas del folio que se entregan hoy. */
  folioCharge: number;
  /** Σ precio × cantidad de los productos regulares (sin catálogos de preventa). */
  regularSubtotal: number;
  /** Σ anticipos de las preventas nuevas de la mesa. */
  catalogDeposit: number;
  discountAmt: number;
  surchargeAmt?: number;
}): number {
  const regularNet = Math.max(0, input.regularSubtotal - input.discountAmt + (input.surchargeAmt ?? 0));
  return Math.max(0, input.folioCharge) + Math.max(0, input.catalogDeposit) + regularNet;
}

/**
 * Porcentaje de descuento derivado del monto y el subtotal previo, redondeado a
 * entero. El % no se persiste (el descuento es monto absoluto), pero se reconstruye
 * para mostrarlo en ticket e Historial ("Promo (17%) −$60"). Si fue por precio final
 * del combo, el % puede no ser redondo (ej. 16.67 → 17). 0 si no aplica.
 */
export function discountPct(discount: number, subtotalBefore: number): number {
  if (!Number.isFinite(discount) || !Number.isFinite(subtotalBefore)) return 0;
  if (discount <= 0 || subtotalBefore <= 0) return 0;
  return Math.round((discount / subtotalBefore) * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
