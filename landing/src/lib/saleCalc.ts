/**
 * Calculadora ÚNICA de totales de venta (Descuentos v2, Joel 2026-07-14).
 *
 * Regla de oro que mata el bug del descuento atorado: el total es SIEMPRE una
 * función pura del estado actual de las líneas — se recalcula completo en cada
 * cambio del carrito y NUNCA se acarrea un descuento acumulado en el header.
 *
 * STACKING (regla actualizada por Joel 2026-07-17; antes era no-stacking):
 * la promo NxM aplica PRIMERO y el descuento manual se calcula sobre el
 * resultado de la promo (percent sobre el neto-promo; fixed clampeado al
 * neto-promo). neto de línea = gross − promo − manual, nunca negativo.
 * El cupón aplica a nivel venta pero SOLO sobre líneas sin beneficio.
 *
 * El gemelo server-side (backend/app/Services/SaleCalculator.php) implementa
 * exactamente este algoritmo — si cambias algo aquí, cámbialo allá.
 *
 * `promo.ts` queda congelado como legacy: solo renderiza tickets históricos.
 */

export type DiscountReason = "danado" | "caducidad" | "exhibicion" | "cortesia" | "otro";

export interface LineDiscount {
  kind: "fixed" | "percent";
  /** fixed: por unidad o por línea. percent siempre es sobre la base de la línea. */
  basis: "unit" | "line";
  value: number;
  reason: DiscountReason;
  note?: string;
  authorizedByUserId?: number;
}

export interface PromoDef {
  id: number;
  /** product.id del catálogo de Caja (string — así viaja en el carrito). */
  productId: string;
  name: string;
  /** 'nxm' (default, usa buyN/payM) | 'qty_discount' = MAYOREO (usa minQty/discountPerUnit). */
  type?: "nxm" | "qty_discount";
  buyN: number;
  payM: number;
  /** Mayoreo: desde cuántas piezas aplica. */
  minQty?: number | null;
  /** Mayoreo: cuánto se descuenta a CADA pieza. */
  discountPerUnit?: number | null;
  priority: number;
  /** null/undefined = promo GLOBAL; con valor = promo LOCAL de una tienda.
   *  Override local (2026-07-20): si el producto tiene local, la global se
   *  desactiva en esa tienda (el embed ya viene filtrado a global+tu tienda). */
  storeId?: number | null;
}

export interface CouponDef {
  id: number;
  code: string;
  kind: "fixed" | "percent";
  value: number;
  scope: "whole_sale" | "products";
  productIds?: string[];
  minPurchase?: number;
  maxDiscount?: number;
}

export interface CalcLine {
  lineId: string;
  productId: string;
  unitPrice: number;
  qty: number;
  discount?: LineDiscount;
}

export interface LineBenefit {
  type: "discount" | "promo";
  amount: number;
  promoId?: number;
  promoLabel?: string;
  freeQty?: number;
}

export interface CalcLineResult {
  lineId: string;
  gross: number;
  /** Beneficio COMBINADO de la línea (promo + manual). Con manual presente el
   *  type es 'discount' (compat con consumidores previos); amount = suma. */
  benefit: LineBenefit | null;
  /** Parte PROMO del beneficio (stacking 2026-07-17) — null si no aplicó. */
  promoPart?: LineBenefit | null;
  /** Monto de la parte MANUAL (calculada sobre el neto-promo). 0 si no hay. */
  manualPart?: number;
  net: number;
}

export type CouponRejectedReason = "min_purchase" | "no_eligible_lines";

export interface SaleCalcResult {
  lines: CalcLineResult[];
  /** Σ gross (antes de cualquier beneficio). */
  subtotal: number;
  /** Σ beneficios por línea (manual + promo), sin cupón. */
  lineBenefitTotal: number;
  couponDiscount: number;
  /** Σ net − cupón. Nunca negativo. */
  total: number;
  couponRejectedReason?: CouponRejectedReason;
}

export function newLineId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ln-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Monto del descuento manual de una línea, clampeado a [0, base de la línea].
 * fixed+unit → value × qty · fixed+line → value · percent → base × value/100.
 */
export function computeLineDiscountAmount(
  d: LineDiscount,
  line: { unitPrice: number; qty: number },
  /** Base sobre la que aplica (stacking): el neto DESPUÉS de la promo.
   *  Default = bruto de la línea (líneas sin promo). */
  baseOverride?: number,
): number {
  const base = baseOverride ?? line.unitPrice * line.qty;
  if (!Number.isFinite(d.value) || d.value <= 0 || base <= 0) return 0;
  let raw = 0;
  if (d.kind === "percent") raw = base * (d.value / 100);
  else raw = d.basis === "unit" ? d.value * line.qty : d.value;
  return Math.min(round2(raw), round2(base));
}

/**
 * MAYOREO (decisión Joel 2026-07-23): al alcanzar `minQty` piezas, TODAS las de
 * la línea llevan `perUnit` de descuento. 5 pzas con (min 5, −$100) = −$500;
 * 7 pzas = −$700; 4 pzas = $0.
 *
 * `Math.floor` para el umbral Y para el multiplicador: media pieza no gana
 * descuento. Espejo exacto de `mayoreoAmount` en SaleCalculator.php.
 *
 * Reemplazó al modelo por grupos con escalones, que daba −$X por cada grupo
 * completo de N y nada al remanente.
 */
export function mayoreoAmount(
  minQty: number | null | undefined,
  perUnit: number | null | undefined,
  qty: number,
): number {
  if (!Number.isFinite(minQty) || (minQty as number) < 2) return 0;
  if (!Number.isFinite(perUnit) || (perUnit as number) <= 0) return 0;
  const units = Math.floor(qty);
  if (units < (minQty as number)) return 0;
  return round2(units * (perUnit as number));
}

/**
 * Beneficio de una promo sobre una línea (evaluada POR LÍNEA, no pooled
 * entre líneas split del mismo producto — default pre-aprobado spec §8).
 * - 'nxm': groups = floor(Q/N) · gratis = groups × (N−M) · resto a precio
 *   completo. freeQty > 0.
 * - 'qty_discount' = MAYOREO: desde minQty piezas, −discountPerUnit a CADA una
 *   (freeQty = 0), clampeado al bruto de la línea.
 * Devuelve null si la promo no alcanza a aplicar o es inválida.
 * Espejo de bestPromoBenefit en SaleCalculator.php.
 */
export function computePromoBenefit(
  promo: PromoDef,
  line: { unitPrice: number; qty: number },
): LineBenefit | null {
  if (promo.type === "qty_discount") {
    // Clamp con la cantidad REAL (no floor): en líneas fraccionarias el bruto
    // es mayor y clampear con floor recortaría de más.
    const gross = round2(line.unitPrice * line.qty);
    const amount = Math.min(mayoreoAmount(promo.minQty, promo.discountPerUnit, line.qty), gross);
    if (amount <= 0) return null;
    return { type: "promo", amount, promoId: promo.id, promoLabel: promo.name, freeQty: 0 };
  }
  const { buyN, payM } = promo;
  if (!Number.isInteger(buyN) || !Number.isInteger(payM)) return null;
  if (buyN < 1 || payM < 1 || payM >= buyN) return null;
  const groups = Math.floor(line.qty / buyN);
  const freeQty = groups * (buyN - payM);
  if (freeQty <= 0) return null;
  const amount = round2(freeQty * line.unitPrice);
  if (amount <= 0) return null;
  return { type: "promo", amount, promoId: promo.id, promoLabel: promo.name, freeQty };
}

/**
 * Mejor promo para el cliente: mayor ahorro; empate → mayor priority, luego
 * menor id. OVERRIDE LOCAL (2026-07-20, espejo de SaleCalculator.php): si el
 * producto tiene promo LOCAL (storeId != null — el embed ya viene filtrado a
 * global+tienda del usuario), las GLOBALES del producto se descartan; gana la
 * local aunque ahorre menos, y si no alcanza por cantidad la global NO revive.
 */
function bestPromoBenefit(
  promos: PromoDef[],
  line: { productId: string; unitPrice: number; qty: number },
): LineBenefit | null {
  let candidates = promos.filter((p) => p.productId === line.productId);
  if (candidates.some((p) => p.storeId != null)) {
    candidates = candidates.filter((p) => p.storeId != null);
  }
  let best: { benefit: LineBenefit; promo: PromoDef } | null = null;
  for (const promo of candidates) {
    const benefit = computePromoBenefit(promo, line);
    if (!benefit) continue;
    if (
      !best ||
      benefit.amount > best.benefit.amount ||
      (benefit.amount === best.benefit.amount &&
        (promo.priority > best.promo.priority ||
          (promo.priority === best.promo.priority && promo.id < best.promo.id)))
    ) {
      best = { benefit, promo };
    }
  }
  return best?.benefit ?? null;
}

/**
 * LA función de totales. Llamar tras CADA mutación del carrito — nunca acarrear
 * un descuento previo. Redondeo una sola vez, a nivel line-net.
 *
 * `legacyGlobalDiscount` existe SOLO durante la Fase 0 (passthrough del
 * descuento global viejo para paridad exacta); muere en la Fase 1.
 */
export function recalculateSale(input: {
  lines: CalcLine[];
  promotions?: PromoDef[];
  coupon?: CouponDef | null;
  legacyGlobalDiscount?: number;
}): SaleCalcResult {
  const promotions = input.promotions ?? [];

  const lines: CalcLineResult[] = input.lines.map((l) => {
    const gross = round2(l.unitPrice * l.qty);

    // STACKING (Joel 2026-07-17): la promo aplica SIEMPRE que alcance; el
    // descuento manual se calcula sobre el neto-promo (antes lo reemplazaba).
    const promoPart = bestPromoBenefit(promotions, l);
    const promoAmount = promoPart?.amount ?? 0;
    const baseAfterPromo = round2(Math.max(0, gross - promoAmount));

    let manualPart = 0;
    if (l.discount) {
      manualPart = computeLineDiscountAmount(l.discount, l, baseAfterPromo);
    }

    const totalBenefit = round2(promoAmount + manualPart);
    let benefit: LineBenefit | null = null;
    if (totalBenefit > 0) {
      benefit = manualPart > 0
        ? {
            type: "discount",
            amount: totalBenefit,
            ...(promoPart ? { promoId: promoPart.promoId, promoLabel: promoPart.promoLabel, freeQty: promoPart.freeQty } : {}),
          }
        : promoPart;
    }

    const net = round2(Math.max(0, gross - totalBenefit));
    return { lineId: l.lineId, gross, benefit, promoPart, manualPart, net };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.gross, 0));
  const netSum = round2(lines.reduce((s, l) => s + l.net, 0));
  const lineBenefitTotal = round2(subtotal - netSum);

  let couponDiscount = 0;
  let couponRejectedReason: CouponRejectedReason | undefined;
  const coupon = input.coupon;
  if (coupon) {
    const eligible: CalcLineResult[] = [];
    lines.forEach((l, idx) => {
      if (l.benefit !== null) return;
      const src = input.lines[idx];
      if (!src) return;
      if (coupon.scope === "products" && !(coupon.productIds ?? []).includes(src.productId)) return;
      eligible.push(l);
    });
    const eligibleBase = round2(eligible.reduce((s, l) => s + l.net, 0));
    if (eligibleBase <= 0) {
      couponRejectedReason = "no_eligible_lines";
    } else if (coupon.minPurchase != null && eligibleBase < coupon.minPurchase) {
      couponRejectedReason = "min_purchase";
    } else {
      const raw = coupon.kind === "percent" ? eligibleBase * (coupon.value / 100) : coupon.value;
      const capped = coupon.maxDiscount != null ? Math.min(raw, coupon.maxDiscount) : raw;
      couponDiscount = round2(Math.min(Math.max(0, capped), eligibleBase));
    }
  }

  // Passthrough Fase 0: replica el clamp del descuento global viejo. Se elimina en Fase 1.
  const legacy = Math.min(Math.max(0, input.legacyGlobalDiscount ?? 0), subtotal);

  const total = round2(Math.max(0, netSum - couponDiscount - legacy));

  const result: SaleCalcResult = { lines, subtotal, lineBenefitTotal, couponDiscount, total };
  if (couponRejectedReason) result.couponRejectedReason = couponRejectedReason;
  return result;
}
