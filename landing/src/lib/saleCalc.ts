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
 * AUMENTO (2026-09-29): en vez de descuento, una línea puede llevar un aumento
 * de precio (`surcharge`, mismo shape). Se calcula después de la promo (percent
 * sobre el neto-promo) y va en `surchargePart` — el beneficio sigue ≥ 0.
 * neto = max(0, gross − promo − manual) + aumento. Una línea lleva descuento O
 * aumento (lo garantiza Caja y el server).
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

export type SurchargeReason = "precio_especial" | "escasez" | "envio" | "otro";

/** Aumento de precio por línea (2026-09-29). Mismo shape que LineDiscount. */
export interface LineSurcharge {
  kind: "fixed" | "percent";
  basis: "unit" | "line";
  value: number;
  reason: SurchargeReason;
  note?: string;
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
  /**
   * Restricción de método de pago de la promo (2026-07-24). No entra al
   * cálculo: la promo se aplica igual y el BLOQUEO del cobro lo hace Caja
   * (`itemAcceptsMethod`) y el guard del server. Viaja aquí para que Caja
   * pueda leer los flags de la promo que realmente ganó la línea.
   */
  allowCash?: boolean;
  allowCard?: boolean;
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
  /** Aumento de precio (2026-09-29) — excluyente con `discount`. */
  surcharge?: LineSurcharge;
  /**
   * El cajero renunció a la promo de esta línea a propósito (2026-07-24). Es la
   * salida cuando la promo restringe el método de pago y el cliente no puede
   * pagar así — sin esto, ese producto simplemente no se le puede vender.
   * Espejo de `skip_promotion` en SaleCalculator.php.
   */
  skipPromo?: boolean;
  /**
   * Precio NORMAL (nivel 1) del producto (2026-09-30). Promo y precio socio
   * NO se suman: si la línea queda dentro de una promo aplicada, TODA la
   * línea se cobra a este precio y la promo se calcula encima. Sin él (o en
   * dañados) no hay re-precio. Espejo de `base_price` en SaleCalculator.php.
   */
  basePrice?: number;
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
  /** Precio unitario EFECTIVO (el de `basePrice` si la promo re-precio). */
  unitPrice: number;
  /** La línea se re-precio a NORMAL por estar en una promo (2026-09-30). */
  promoRepriced: boolean;
  gross: number;
  /** Beneficio COMBINADO de la línea (promo + manual). Con manual presente el
   *  type es 'discount' (compat con consumidores previos); amount = suma. */
  benefit: LineBenefit | null;
  /** Parte PROMO del beneficio (stacking 2026-07-17) — null si no aplicó. */
  promoPart?: LineBenefit | null;
  /** Monto de la parte MANUAL (calculada sobre el neto-promo). 0 si no hay. */
  manualPart?: number;
  /** Aumento de precio de la línea (2026-09-29). 0 si no hay. */
  surchargePart: number;
  net: number;
  /** Mix & match (2026-07-23): esta línea CONTRIBUYÓ al pool de una promo sin
   *  recibir descuento (la pieza gratis cayó en otra línea más barata). Solo
   *  informativo para el tag de Caja — OMITIDOS cuando no aplica. */
  poolPromoId?: number;
  poolLabel?: string;
}

export type CouponRejectedReason = "min_purchase" | "no_eligible_lines";

export interface SaleCalcResult {
  lines: CalcLineResult[];
  /** Σ gross (antes de cualquier beneficio). */
  subtotal: number;
  /** Σ beneficios por línea (manual + promo), sin cupón. */
  lineBenefitTotal: number;
  /** Σ aumentos de precio por línea (2026-09-29). */
  surchargeTotal: number;
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
 * Monto del aumento de una línea (2026-09-29). fixed+unit → value × qty ·
 * fixed+line → value · percent → base × value/100 (base = neto-promo). Sin
 * tope aquí: los límites los pone el modal y el server. Espejo de
 * lineSurchargeAmount en SaleCalculator.php.
 */
export function computeLineSurchargeAmount(
  s: LineSurcharge,
  line: { unitPrice: number; qty: number },
  baseOverride?: number,
): number {
  if (!Number.isFinite(s.value) || s.value <= 0) return 0;
  if (s.kind === "percent") {
    const base = baseOverride ?? line.unitPrice * line.qty;
    return base > 0 ? round2(base * (s.value / 100)) : 0;
  }
  return round2(s.basis === "unit" ? s.value * line.qty : s.value);
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
 * Beneficio de una promo sobre UNA línea aislada. Desde mix & match
 * (2026-07-23) el motor real agrupa por POOL (assignPoolBenefits — las líneas
 * split del mismo producto y los productos hermanos SÍ combinan; cambió la
 * spec §8); esta función queda para evaluaciones de una sola línea
 * (previews/etiquetas) y como referencia de la matemática por promo.
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

/** Reparto de una promo sobre su pool: beneficio por línea + contribuyentes. */
interface PoolAssignment {
  amount: number;
  freeQty: number;
}

interface PoolBenefits {
  /** índice de línea → beneficio de la promo que ganó su pool. */
  benefits: Map<number, LineBenefit>;
  /** índice de línea → promo a cuyo pool contribuyó SIN recibir descuento. */
  contributors: Map<number, { promoId: number; promoLabel: string }>;
  /** TODAS las líneas del pool de una promo aplicada (beneficiadas o no). */
  pooled: Set<number>;
}

/**
 * MIX & MATCH (Joel 2026-07-23) — reparto de beneficios por POOL.
 *
 * Las líneas de productos asignados a la MISMA promo forman un pool y sus
 * cantidades se combinan (1 de A + 1 de B disparan el 2x1 asignado a ambos).
 * Espejo EXACTO de assignPoolBenefits en SaleCalculator.php — si tocas un
 * paso aquí, tócalo allá o el checkout da 422.
 *
 * Paso 0 — candidatas por línea: promos del producto (copias del mismo id en
 *   varios productos colapsan por id), override LOCAL por producto intacto
 *   (si el producto tiene local, sus globales se descartan), skipPromo fuera.
 * Paso 1 — unidades enteras: units = floor(qty); una línea sin unidades
 *   enteras no entra a ningún pool. Con UNA sola línea el pool degenera
 *   exacto al comportamiento anterior.
 * Paso 2 — greedy por promo, repetir mientras alguna rinda > 0:
 *   · NxM: U = Σ units → freeTotal = floor(U/buyN)×(buyN−payM); las gratis
 *     van a las unidades MÁS BARATAS (precio asc → productId numérico asc →
 *     índice asc — comparar productId como NÚMERO: '10' < '9' en string).
 *   · Mayoreo: U ≥ minQty → cada línea recibe min(round2(units×perUnit),
 *     bruto real de la línea).
 *   · Gana: ahorro desc → priority desc → id asc. Al aplicar, TODO el pool
 *     queda consumido (también contribuyentes). Una línea = una promo.
 */
function assignPoolBenefits(lines: CalcLine[], promotions: PromoDef[]): PoolBenefits {
  // Paso 0 — candidatas por línea (ids) + catálogo de promos por id.
  const candidateIdsByLine: number[][] = [];
  const promoById = new Map<number, PromoDef>();
  lines.forEach((l, idx) => {
    const units = Math.floor(l.qty);
    if (l.skipPromo || units < 1) {
      candidateIdsByLine[idx] = [];
      return;
    }
    let candidates = promotions.filter((p) => p.productId === l.productId);
    if (candidates.some((p) => p.storeId != null)) {
      candidates = candidates.filter((p) => p.storeId != null);
    }
    candidateIdsByLine[idx] = candidates.map((p) => {
      if (!promoById.has(p.id)) promoById.set(p.id, p);
      return p.id;
    });
  });

  const consumed = new Set<number>();
  const pooled = new Set<number>();
  const benefits = new Map<number, LineBenefit>();
  const contributors = new Map<number, { promoId: number; promoLabel: string }>();

  for (;;) {
    const liveIds = new Set<number>();
    candidateIdsByLine.forEach((ids, idx) => {
      if (consumed.has(idx)) return;
      ids.forEach((id) => liveIds.add(id));
    });
    if (liveIds.size === 0) break;

    let best: {
      promo: PromoDef;
      amount: number;
      perLine: Map<number, PoolAssignment>;
      pool: number[];
    } | null = null;

    // Iteración por id asc (determinista); el ganador lo decide el comparador.
    for (const promoId of [...liveIds].sort((a, b) => a - b)) {
      const promo = promoById.get(promoId);
      if (!promo) continue;
      const poolIdxs: number[] = [];
      candidateIdsByLine.forEach((ids, idx) => {
        if (!consumed.has(idx) && ids.includes(promoId)) poolIdxs.push(idx);
      });
      if (poolIdxs.length === 0) continue;

      const perLine = poolBenefitPerLine(promo, lines, poolIdxs);
      if (!perLine) continue;
      let amountPool = 0;
      perLine.forEach((entry) => { amountPool += entry.amount; });
      amountPool = round2(amountPool);
      if (amountPool <= 0) continue;

      if (
        !best ||
        amountPool > best.amount ||
        (amountPool === best.amount &&
          (promo.priority > best.promo.priority ||
            (promo.priority === best.promo.priority && promo.id < best.promo.id)))
      ) {
        best = { promo, amount: amountPool, perLine, pool: poolIdxs };
      }
    }

    if (!best) break;

    const chosen = best;
    chosen.perLine.forEach((entry, idx) => {
      if (entry.amount > 0) {
        benefits.set(idx, {
          type: "promo",
          amount: entry.amount,
          promoId: chosen.promo.id,
          promoLabel: chosen.promo.name,
          freeQty: entry.freeQty,
        });
      } else {
        contributors.set(idx, { promoId: chosen.promo.id, promoLabel: chosen.promo.name });
      }
    });
    chosen.pool.forEach((idx) => {
      consumed.add(idx);
      pooled.add(idx);
    });
  }

  return { benefits, contributors, pooled };
}

/**
 * Beneficio de UNA promo sobre su pool, repartido por línea. Null si no
 * alcanza a disparar con las cantidades combinadas. Espejo de
 * poolBenefitPerLine en SaleCalculator.php.
 */
function poolBenefitPerLine(
  promo: PromoDef,
  lines: CalcLine[],
  poolIdxs: number[],
): Map<number, PoolAssignment> | null {
  let totalUnits = 0;
  for (const idx of poolIdxs) totalUnits += Math.floor(lines[idx]!.qty);
  if (totalUnits < 1) return null;

  if (promo.type === "qty_discount") {
    const minQty = promo.minQty;
    const perUnit = promo.discountPerUnit;
    if (!Number.isFinite(minQty) || (minQty as number) < 2) return null;
    if (!Number.isFinite(perUnit) || (perUnit as number) <= 0) return null;
    if (totalUnits < (minQty as number)) return null;

    const perLine = new Map<number, PoolAssignment>();
    for (const idx of poolIdxs) {
      const l = lines[idx]!;
      const units = Math.floor(l.qty);
      // Clamp al bruto REAL (qty con fracción): igual que siempre.
      const gross = round2(l.unitPrice * l.qty);
      const amount = Math.min(round2(units * (perUnit as number)), gross);
      perLine.set(idx, { amount: Math.max(0, amount), freeQty: 0 });
    }
    return perLine;
  }

  const { buyN, payM } = promo;
  if (!Number.isInteger(buyN) || !Number.isInteger(payM)) return null;
  if (buyN < 1 || payM < 1 || payM >= buyN) return null;
  const freeTotal = Math.floor(totalUnits / buyN) * (buyN - payM);
  if (freeTotal < 1) return null;

  // Las gratis caen en las unidades MÁS BARATAS. Desempates clavados
  // (idénticos en SaleCalculator.php o los motores divergen):
  // precio efectivo asc → productId NUMÉRICO asc → índice posicional asc.
  const order = [...poolIdxs].sort((a, b) => {
    const la = lines[a]!;
    const lb = lines[b]!;
    if (la.unitPrice !== lb.unitPrice) return la.unitPrice - lb.unitPrice;
    const pa = Number(la.productId);
    const pb = Number(lb.productId);
    if (pa !== pb) return pa - pb;
    return a - b;
  });

  const perLine = new Map<number, PoolAssignment>();
  let remaining = freeTotal;
  for (const idx of order) {
    const l = lines[idx]!;
    const units = Math.floor(l.qty);
    const take = Math.min(units, remaining);
    remaining -= take;
    perLine.set(idx, {
      amount: take > 0 ? round2(take * l.unitPrice) : 0,
      freeQty: take,
    });
  }
  return perLine;
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

  // MIX & MATCH (2026-07-23): el beneficio por línea sale del reparto de
  // pools — el loop de abajo (stacking, netos) queda casi intacto.
  let pool = assignPoolBenefits(input.lines, promotions);

  // PROMO VS NIVEL DE PRECIO (Joel 2026-09-30): promo y precio socio no se
  // suman. Las líneas que quedaron en una promo aplicada se re-precian a
  // NORMAL y se reparte de nuevo. Siempre gana la promo. Espejo de
  // SaleCalculator::calculate.
  const repriced = new Set<number>();
  const effLines = input.lines.map((l, idx) => {
    const base = l.basePrice ?? 0;
    if (pool.pooled.has(idx) && base > 0 && Math.abs(base - l.unitPrice) > 0.001) {
      repriced.add(idx);
      return { ...l, unitPrice: base };
    }
    return l;
  });
  if (repriced.size > 0) pool = assignPoolBenefits(effLines, promotions);

  const lines: CalcLineResult[] = effLines.map((l, idx) => {
    const gross = round2(l.unitPrice * l.qty);

    // STACKING (Joel 2026-07-17): la promo aplica SIEMPRE que alcance; el
    // descuento manual se calcula sobre el neto-promo (antes lo reemplazaba).
    // `skipPromo` ya quedó excluido del pool en el Paso 0.
    const promoPart = pool.benefits.get(idx) ?? null;
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

    const surchargePart = l.surcharge ? computeLineSurchargeAmount(l.surcharge, l, baseAfterPromo) : 0;
    const net = round2(Math.max(0, gross - totalBenefit) + surchargePart);
    const contributor = pool.contributors.get(idx);
    return {
      lineId: l.lineId,
      unitPrice: l.unitPrice,
      promoRepriced: repriced.has(idx),
      gross,
      benefit,
      promoPart,
      manualPart,
      surchargePart,
      net,
      // Tag "Cuenta para {promo}" en Caja — solo contribuyentes sin beneficio.
      ...(contributor ? { poolPromoId: contributor.promoId, poolLabel: contributor.promoLabel } : {}),
    };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.gross, 0));
  const netSum = round2(lines.reduce((s, l) => s + l.net, 0));
  // Rollups EXPLÍCITOS (2026-09-29): subtotal − Σneto restaría el aumento del descuento.
  const lineBenefitTotal = round2(lines.reduce((s, l) => s + (l.benefit?.amount ?? 0), 0));
  const surchargeTotal = round2(lines.reduce((s, l) => s + l.surchargePart, 0));

  let couponDiscount = 0;
  let couponRejectedReason: CouponRejectedReason | undefined;
  const coupon = input.coupon;
  if (coupon) {
    const eligible: CalcLineResult[] = [];
    lines.forEach((l, idx) => {
      if (l.benefit !== null || l.surchargePart > 0) return;
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

  const result: SaleCalcResult = { lines, subtotal, lineBenefitTotal, surchargeTotal, couponDiscount, total };
  if (couponRejectedReason) result.couponRejectedReason = couponRejectedReason;
  return result;
}
