/**
 * Aviso de Caja cuando la promo que ganó una línea no se puede cobrar con el
 * método de pago actual (Joel 2026-10-10). Caso real: método favorito =
 * Tarjeta y el cliente lleva 3 Toploader con una promo "solo efectivo"; el
 * cobro quedaba trabado y la salida a la mano era "Cobrar sin promo".
 *
 * Caja NO cambia el método sola: avisa y el cajero decide entre conservar la
 * promo (cambia el método) o cobrar sin ella. Aquí vive la lógica pura; el
 * modal es `components/sell/PromoPaymentAlertModal.tsx`.
 */

/** Método con el que la promo SÍ se puede cobrar. */
export type PromoKeepMethod = "Efectivo" | "Tarjeta";

/** Línea del carrito bloqueada por la restricción de pago de SU promo. */
export interface PromoBlockedLine {
  productName: string;
  promoId: number;
  promoName: string | null;
}

/** Lo que el aviso necesita del cálculo por línea (subconjunto de `CalcLineResult`). */
export interface PromoCalcLine {
  lineId: string;
  promoPart?: { promoId?: number; amount: number } | null;
  poolPromoId?: number;
}

export interface PromoPaymentAlert {
  /** Identifica ESTE choque (caja + método + promos): "Decidir después" lo
   *  calla hasta que cambie alguno de los tres. */
  key: string;
  currentMethod: string;
  keepMethod: PromoKeepMethod;
  /** Promo y producto de la primera línea bloqueada (los que se nombran). */
  promoName: string | null;
  productName: string;
  /** Otras líneas bloqueadas por promo además de la nombrada. */
  extraLines: number;
  promoIds: number[];
  /** Lo que las promos bloqueadas descuentan en este carrito (monto del
   *  motor; con socio no es la diferencia exacta contra cobrar sin promo). */
  savings: number;
}

const KEY_SEP = "|";

/**
 * Arma el aviso, o `null` si ninguna línea está bloqueada por su promo.
 * La restricción de una promo es efectivo-o-tarjeta: si el método actual es
 * Tarjeta la promo es solo efectivo, y con cualquier otro es solo tarjeta.
 */
export function buildPromoPaymentAlert(
  mesaId: string | number,
  method: string,
  blocked: readonly PromoBlockedLine[],
  lines: readonly PromoCalcLine[],
): PromoPaymentAlert | null {
  const first = blocked[0];
  if (!first) return null;

  const promoIds = [...new Set(blocked.map((b) => b.promoId))].sort((a, b) => a - b);
  const savings = lines.reduce(
    (sum, l) => (l.promoPart?.promoId != null && promoIds.includes(l.promoPart.promoId) ? sum + l.promoPart.amount : sum),
    0,
  );

  return {
    key: [mesaId, method, promoIds.join(",")].join(KEY_SEP),
    currentMethod: method,
    keepMethod: method === "Tarjeta" ? "Efectivo" : "Tarjeta",
    promoName: first.promoName,
    productName: first.productName,
    extraLines: blocked.length - 1,
    promoIds,
    savings,
  };
}

/**
 * Líneas que arman las promos dadas: las que recibieron el descuento y las
 * que solo aportaron piezas (mix & match). "Cobrar sin la promo" las suelta
 * todas juntas; si saliera una sola, el beneficio brincaría a otra línea.
 */
export function promoPoolLineIds(
  lines: readonly PromoCalcLine[],
  promoIds: readonly number[],
): Set<string> {
  const ids = new Set<string>();
  for (const l of lines) {
    const promoId = l.promoPart?.promoId ?? l.poolPromoId;
    if (promoId != null && promoIds.includes(promoId)) ids.add(l.lineId);
  }
  return ids;
}

/**
 * Olvida los avisos pospuestos de una caja (cuando su choque se resolvió),
 * para que uno nuevo vuelva a avisar. Mismo set si no había nada que quitar.
 */
export function clearDismissedForMesa(
  dismissed: ReadonlySet<string>,
  mesaId: string | number,
): ReadonlySet<string> {
  const prefix = `${mesaId}${KEY_SEP}`;
  const kept = [...dismissed].filter((key) => !key.startsWith(prefix));
  return kept.length === dismissed.size ? dismissed : new Set(kept);
}
