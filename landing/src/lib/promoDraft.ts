import type { ProductPromotionInput, Promotion } from "@tadaima/api";
import { toDateInput } from "@/lib/promoInput";
import { promoShortLabel } from "@/lib/promoLabel";
import type { PromoViewer } from "@/lib/promoList";

/**
 * Borrador del formulario de promo (asistente y edición): estado en strings
 * para inputs controlados, validación con mensajes llanos y conversión al body
 * que espera el server. Mismas reglas que `StoreProductPromotionRequest`.
 */

export type PromoKind = "nxm" | "qty_discount";

export interface PromoDraft {
  kind: PromoKind;
  name: string;
  /** NxM: se lleva N, paga M. */
  buyN: string;
  payM: string;
  /** Descuento por cantidad: desde cuántas piezas y cuánto baja cada una. */
  minQty: string;
  perUnit: string;
  allowCash: boolean;
  allowCard: boolean;
  /** Fechas planas YYYY-MM-DD; "" = sin fecha. */
  startsAt: string;
  endsAt: string;
  priority: string;
  /** null = todas las tiendas (solo el admin elige). */
  storeId: number | null;
}

const MIN_PIECES = 2;

export function emptyDraft(): PromoDraft {
  return {
    kind: "nxm",
    name: "",
    buyN: "2",
    payM: "1",
    minQty: "5",
    perUnit: "",
    allowCash: true,
    allowCard: true,
    startsAt: "",
    endsAt: "",
    priority: "0",
    storeId: null,
  };
}

export function draftFromPromo(promo: Promotion): PromoDraft {
  const base = emptyDraft();
  return {
    kind: promo.type === "qty_discount" ? "qty_discount" : "nxm",
    name: promo.name,
    buyN: String(promo.buy_n ?? base.buyN),
    payM: String(promo.pay_m ?? base.payM),
    minQty: String(promo.min_qty ?? base.minQty),
    perUnit: promo.discount_per_unit != null ? String(Number(promo.discount_per_unit)) : "",
    allowCash: promo.allow_cash !== false,
    allowCard: promo.allow_card !== false,
    startsAt: toDateInput(promo.starts_at),
    endsAt: toDateInput(promo.ends_at),
    priority: String(promo.priority ?? 0),
    storeId: promo.store_id ?? null,
  };
}

const toInt = (value: string): number => parseInt(value, 10) || 0;
const toMoney = (value: string): number => parseFloat(value) || 0;

/** Paso "¿Qué promo?": los números de la promo. null = todo bien. */
export function validateWhat(draft: PromoDraft): string | null {
  if (draft.kind === "nxm") {
    const buy = toInt(draft.buyN);
    const pay = toInt(draft.payM);
    if (buy < MIN_PIECES) return "La promo necesita al menos 2 piezas (por ejemplo 2x1).";
    if (pay < 1 || pay >= buy) return "Lo que paga debe ser menos de lo que se lleva (por ejemplo 2x1).";
    return null;
  }
  if (toInt(draft.minQty) < MIN_PIECES) return "El descuento por cantidad empieza desde 2 piezas.";
  if (toMoney(draft.perUnit) <= 0) return "Escribe cuánto se le descuenta a cada pieza (por ejemplo $20).";
  return null;
}

/** Nombre, forma de pago y fechas. null = todo bien. */
export function validateDetails(draft: PromoDraft): string | null {
  if (!draft.name.trim()) return "Ponle un nombre a la promo para reconocerla.";
  if (!draft.allowCash && !draft.allowCard) return "Marca al menos una forma de pago.";
  if (draft.startsAt && draft.endsAt && draft.endsAt < draft.startsAt) {
    return "La fecha de fin no puede ser antes del inicio.";
  }
  return null;
}

/**
 * Body para POST/PUT. Las fechas SIEMPRE viajan (null = sin fecha): el PUT
 * reenvía la promo completa y omitirlas borraría la vigencia sin querer.
 */
export function draftToInput(draft: PromoDraft, viewer: PromoViewer): ProductPromotionInput {
  const typed: Partial<ProductPromotionInput> = draft.kind === "nxm"
    ? { type: "nxm", buy_n: toInt(draft.buyN), pay_m: toInt(draft.payM) }
    : { type: "qty_discount", min_qty: toInt(draft.minQty), discount_per_unit: toMoney(draft.perUnit) };

  return {
    name: draft.name.trim(),
    ...typed,
    allow_cash: draft.allowCash,
    allow_card: draft.allowCard,
    starts_at: draft.startsAt || null,
    ends_at: draft.endsAt || null,
    priority: toInt(draft.priority),
    // El gerente queda en su tienda (el server lo fuerza igual).
    store_id: viewer.isAdmin ? draft.storeId : viewer.storeId,
  };
}

/**
 * Editar una promo TERMINADA y dejarle una fecha de fin vigente (o ninguna) la
 * reactiva: el server conserva `expired` si no se le manda `status`, y la
 * tarjeta seguiría en "Terminó" sin forma de reanudarla. Al reactivar, el
 * server revalida los conflictos contra todos sus productos.
 */
export function withReactivation(
  promo: Pick<Promotion, "status">,
  input: ProductPromotionInput,
  todayYmd: string,
): ProductPromotionInput {
  if (promo.status !== "expired") return input;
  const endsInThePast = typeof input.ends_at === "string" && input.ends_at < todayYmd;
  return endsInThePast ? input : { ...input, status: "active" };
}

/** Etiqueta corta del borrador: "2x1" o "5+ pzas −$20 c/u". */
export function draftLabel(draft: PromoDraft): string {
  return promoShortLabel(draft.kind === "nxm"
    ? { type: "nxm", buy_n: toInt(draft.buyN), pay_m: toInt(draft.payM) }
    : { type: "qty_discount", min_qty: toInt(draft.minQty), discount_per_unit: toMoney(draft.perUnit) });
}

/** Arranque del nombre sugerido: "2x1" o "Mayoreo" (la etiqueta de mayoreo es muy larga). */
export function draftNamePrefix(draft: PromoDraft): string {
  return draft.kind === "nxm" ? draftLabel(draft) : "Mayoreo";
}
