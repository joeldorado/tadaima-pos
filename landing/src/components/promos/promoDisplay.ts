import { promoBadge, promoBannerCopy, promoShortLabel, specialPrice } from "@/lib/promoLabel";
import type { LightPromo } from "@/lib/promoVigentes";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n || 0);

/**
 * Piezas de display por TIPO de promo (banner/TV/lista). El badge y el CTA salen
 * de `promoLabel` (fuente única compartida con Caja, el catálogo público y el
 * tab de promos); aquí solo se arma el subtítulo, que mezcla el nombre de la
 * promo con el precio ya calculado.
 */
export function promoDisplay(promo: LightPromo, price: number) {
  const { text: badge, scale: badgeScale } = promoBadge(promo);
  const cta = promoBannerCopy(promo);

  if (promo.type === "qty_discount") {
    return { badge, badgeScale, sub: `${promoShortLabel(promo)} · ${promo.name}`, cta };
  }

  // Precio especial (2026-11-15): el CTA dice a cuánto queda la pieza.
  if (promo.type === "special_price") {
    const final = specialPriceFinal(promo, price);
    return {
      badge,
      badgeScale,
      sub: `Precio especial · ${promo.name}`,
      cta: final != null && final < price ? `${cta} · antes ${fmt(price)}, ahora ${fmt(final)}` : cta,
    };
  }

  const free = (promo.buy_n ?? 0) - (promo.pay_m ?? 0);
  return {
    badge,
    badgeScale,
    sub: `${free === 1 ? "1 gratis" : `${free} gratis`} · ${promo.name}`,
    cta: `${cta} · ${fmt(price * (promo.pay_m ?? 0))}`,
  };
}

/** Precio final de UNA pieza con el precio especial, o null si no aplica. */
function specialPriceFinal(promo: LightPromo, price: number): number | null {
  const sp = specialPrice(promo);
  if (!sp || price <= 0) return null;
  if (sp.mode === "fixed") return sp.value < price ? sp.value : null;
  return Math.round(price * (1 - sp.value / 100) * 100) / 100;
}
