/**
 * Etiquetas de promoción compartidas por TODOS los puntos de render (tab de
 * promos, pills del catálogo de Caja, card pública, PromosPage, tickets).
 *
 * Dos tipos:
 *  - 'nxm'          → "2x1"
 *  - 'qty_discount' → MAYOREO (2026-07-23): "5+ pzas −$100 c/u"
 *  - 'special_price' → PRECIO ESPECIAL (2026-11-15): "$350 c/u" o "−45%"
 *
 * El "c/u" no es adorno: antes esto decía "2+ pzas −$100" para un descuento que
 * en realidad era $100 por CADA PAR, o sea la etiqueta mentía. Ahora el texto y
 * la matemática dicen lo mismo.
 */

export interface PromoLike {
  /** 'nxm' | 'qty_discount' | 'special_price' (viaja como string desde varios payloads). */
  type?: "nxm" | "qty_discount" | string | null | undefined;
  buy_n?: number | null | undefined;
  pay_m?: number | null | undefined;
  /** Mayoreo: desde cuántas piezas aplica. */
  min_qty?: number | null | undefined;
  /** Mayoreo: cuánto se descuenta a cada pieza. */
  discount_per_unit?: number | null | undefined;
  /** Precio especial: 'fixed' = precio final por pieza; 'percent' = % menos. */
  price_mode?: string | null | undefined;
  special_value?: number | null | undefined;
}

const fmtMoney = (n: number): string =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n || 0);

/** Los dos números del mayoreo, o null si la promo está sin configurar. */
function mayoreo(promo: PromoLike): { minQty: number; perUnit: number } | null {
  const minQty = Number(promo.min_qty);
  const perUnit = Number(promo.discount_per_unit);
  if (!Number.isFinite(minQty) || minQty < 2) return null;
  if (!Number.isFinite(perUnit) || perUnit <= 0) return null;
  return { minQty, perUnit };
}

export function isQtyDiscountPromo(promo: PromoLike): boolean {
  return promo.type === "qty_discount";
}

export function isSpecialPricePromo(promo: PromoLike): boolean {
  return promo.type === "special_price";
}

/** Modo y valor del precio especial, o null si está mal configurado. */
export function specialPrice(promo: PromoLike): { mode: "fixed" | "percent"; value: number } | null {
  const value = Number(promo.special_value);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (promo.price_mode === "percent") return value < 100 ? { mode: "percent", value } : null;
  if (promo.price_mode === "fixed") return { mode: "fixed", value };
  return null;
}

const fmtPercent = (n: number): string => `${Number(n.toFixed(2))}%`;

/**
 * Una promo de mayoreo a la que le faltan los números — las que dejó pausadas
 * la migración de escalones. Existe, pero nunca descontaría nada.
 */
export function isPromoSinConfigurar(promo: PromoLike): boolean {
  if (isSpecialPricePromo(promo)) return specialPrice(promo) === null;
  return isQtyDiscountPromo(promo) && mayoreo(promo) === null;
}

/** Etiqueta corta para pills/badges: "2x1", "5+ pzas −$100 c/u", "$350 c/u" o "−45%". */
export function promoShortLabel(promo: PromoLike): string {
  if (isSpecialPricePromo(promo)) {
    const sp = specialPrice(promo);
    if (!sp) return "Precio especial";
    return sp.mode === "fixed" ? `${fmtMoney(sp.value)} c/u` : `−${fmtPercent(sp.value)}`;
  }
  if (isQtyDiscountPromo(promo)) {
    const m = mayoreo(promo);
    if (!m) return "Mayoreo";
    return `${m.minQty}+ pzas −${fmtMoney(m.perUnit)} c/u`;
  }
  return `${promo.buy_n ?? "?"}x${promo.pay_m ?? "?"}`;
}

/** Detalle con el ejemplo ya calculado, para tooltips y listas. */
export function promoDetailLabel(promo: PromoLike): string {
  if (isSpecialPricePromo(promo)) {
    const sp = specialPrice(promo);
    if (!sp) return "Precio especial sin configurar";
    return sp.mode === "fixed"
      ? `Precio especial: cada pieza a ${fmtMoney(sp.value)}, desde 1 pieza`
      : `Precio especial: ${fmtPercent(sp.value)} menos en cada pieza, desde 1 pieza`;
  }
  if (!isQtyDiscountPromo(promo)) return promoShortLabel(promo);
  const m = mayoreo(promo);
  if (!m) return "Mayoreo sin configurar";
  return `Desde ${m.minQty} pzas: −${fmtMoney(m.perUnit)} por pieza (${m.minQty} pzas = −${fmtMoney(m.minQty * m.perUnit)})`;
}

/** Copy largo para banners (PromosPage): "Llévate 5 o más y ahorra $100 en cada una". */
export function promoBannerCopy(promo: PromoLike): string {
  if (isSpecialPricePromo(promo)) {
    const sp = specialPrice(promo);
    if (!sp) return "Precio especial";
    return sp.mode === "fixed" ? `Cada pieza a ${fmtMoney(sp.value)}` : `${fmtPercent(sp.value)} menos en cada pieza`;
  }
  if (isQtyDiscountPromo(promo)) {
    const m = mayoreo(promo);
    if (!m) return "Precio de mayoreo";
    return `Llévate ${m.minQty} o más y ahorra ${fmtMoney(m.perUnit)} en cada una`;
  }
  const free = (promo.buy_n ?? 0) - (promo.pay_m ?? 0);
  return `Llévate ${promo.buy_n}, paga ${promo.pay_m}${free > 0 ? ` (${free} gratis)` : ""}`;
}

/**
 * Badge grande del banner compartible y del Modo TV. `scale` ajusta el tamaño
 * de fuente: "2×1" cabe grande, "−$100 c/u" necesita achicarse.
 */
export function promoBadge(promo: PromoLike): { text: string; scale: number } {
  if (isSpecialPricePromo(promo)) {
    const sp = specialPrice(promo);
    if (!sp) return { text: "ESPECIAL", scale: 0.5 };
    return sp.mode === "fixed"
      ? { text: fmtMoney(sp.value), scale: 0.5 }
      : { text: `−${fmtPercent(sp.value)}`, scale: 0.6 };
  }
  if (isQtyDiscountPromo(promo)) {
    const m = mayoreo(promo);
    return m ? { text: `−${fmtMoney(m.perUnit)} c/u`, scale: 0.42 } : { text: "MAYOREO", scale: 0.5 };
  }
  return { text: `${promo.buy_n ?? "?"}×${promo.pay_m ?? "?"}`, scale: 1 };
}
