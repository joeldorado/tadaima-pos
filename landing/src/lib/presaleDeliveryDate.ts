import { BUSINESS_TZ } from "./date";

/**
 * Fecha de entrega de un folio de preventa (2026-11-19, pedido de Tadaima Tijuana:
 * «que aparezca la fecha de entrega y no la fecha en que se hizo»).
 *
 * El dato vive por partida en `pre_sale_order_items.delivered_at` (lo llenan Caja,
 * la entrega parcial y el endpoint viejo por partida; revertir la entrega lo regresa
 * a null). El folio no tiene fecha propia de entrega: se toma la más reciente de sus
 * partidas entregadas.
 */

export interface DeliverableItem {
  status: "pending" | "delivered";
  delivered_at: string | null;
}

export interface PresaleDeliveryInfo {
  /** Fecha (ISO) de la última partida entregada; null si no se ha entregado nada. */
  lastDeliveredAt: string | null;
  deliveredCount: number;
  totalCount: number;
  /** Se entregó algo pero no todo. */
  isPartial: boolean;
}

function toTime(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function presaleDeliveryInfo(
  items: readonly DeliverableItem[] | null | undefined,
): PresaleDeliveryInfo {
  const list = items ?? [];
  const delivered = list.filter((i) => i.status === "delivered");
  const latest = delivered.reduce<{ iso: string; t: number } | null>((best, item) => {
    const t = toTime(item.delivered_at);
    if (t === null || item.delivered_at === null) return best;
    return best === null || t > best.t ? { iso: item.delivered_at, t } : best;
  }, null);

  return {
    lastDeliveredAt: latest?.iso ?? null,
    deliveredCount: delivered.length,
    totalCount: list.length,
    isPartial: delivered.length > 0 && delivered.length < list.length,
  };
}

/** «18 nov 26» en la zona del negocio. Vacío si la fecha no es válida. */
export function formatPresaleDate(iso: string | null | undefined, withYear = true): string {
  const t = toTime(iso ?? null);
  if (t === null) return "";
  return new Date(t).toLocaleDateString("es-MX", {
    timeZone: BUSINESS_TZ,
    day: "2-digit",
    month: "short",
    ...(withYear ? { year: "2-digit" as const } : {}),
  });
}

/** «3:42 p. m.» en la zona del negocio. Vacío si la fecha no es válida. */
export function formatPresaleTime(iso: string | null | undefined): string {
  const t = toTime(iso ?? null);
  if (t === null) return "";
  return new Date(t).toLocaleTimeString("es-MX", {
    timeZone: BUSINESS_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}
