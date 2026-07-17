/**
 * Etiquetas de promoción compartidas por TODOS los puntos de render (tab de
 * promos, pills del catálogo de Caja, card pública, PromosPage, tickets).
 *
 * Dos tipos (2026-07-20):
 *  - 'nxm'          → "2x1"
 *  - 'qty_discount' → "2+ pzas −$100" (el escalón MENOR como gancho) y el
 *                     detalle completo por escalones para tooltips.
 */

export interface PromoLike {
  type?: "nxm" | "qty_discount" | string | null | undefined;
  buy_n?: number | null | undefined;
  pay_m?: number | null | undefined;
  tiers?: Array<{ qty: number; amount: number }> | null | undefined;
}

const fmtMoney = (n: number): string =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n || 0);

const sortedTiers = (promo: PromoLike): Array<{ qty: number; amount: number }> =>
  [...(promo.tiers ?? [])]
    .filter((t) => t.qty >= 2 && t.amount > 0)
    .sort((a, b) => a.qty - b.qty);

export function isQtyDiscountPromo(promo: PromoLike): boolean {
  return promo.type === "qty_discount";
}

/** Etiqueta corta para pills/badges: "2x1" o "2+ pzas −$100". */
export function promoShortLabel(promo: PromoLike): string {
  if (isQtyDiscountPromo(promo)) {
    const first = sortedTiers(promo)[0];
    if (!first) return "Por cantidad";
    return `${first.qty}+ pzas −${fmtMoney(first.amount)}`;
  }
  return `${promo.buy_n ?? "?"}x${promo.pay_m ?? "?"}`;
}

/** Detalle por escalones: "2 pzas −$100 · 3 pzas −$400" (tooltips/listas). */
export function promoTiersLabel(promo: PromoLike): string {
  if (!isQtyDiscountPromo(promo)) return promoShortLabel(promo);
  const tiers = sortedTiers(promo);
  if (tiers.length === 0) return "Por cantidad";
  return tiers.map((t) => `${t.qty} pzas −${fmtMoney(t.amount)}`).join(" · ");
}

/** Copy largo para banners (PromosPage): "Llévate 2 y ahorra $100". */
export function promoBannerCopy(promo: PromoLike): string {
  if (isQtyDiscountPromo(promo)) {
    const first = sortedTiers(promo)[0];
    if (!first) return "Descuento por cantidad";
    return `Llévate ${first.qty} y ahorra ${fmtMoney(first.amount)}`;
  }
  const free = (promo.buy_n ?? 0) - (promo.pay_m ?? 0);
  return `Llévate ${promo.buy_n}, paga ${promo.pay_m}${free > 0 ? ` (${free} gratis)` : ""}`;
}
