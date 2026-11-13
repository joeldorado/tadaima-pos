/**
 * La última entrega de un folio de preventa: qué partidas se llevó el cliente
 * en esa visita y cuánto se cobró. Es lo que deshace «Revertir entrega».
 *
 * Espejo de `SaleCancellationService::lastPreSaleDelivery` (backend), que es
 * quien de verdad decide; aquí solo se arma el aviso del modal.
 *
 *  - Con registro de entrega (`delivery_id`, desde 2026-11-13): las partidas de
 *    la entrega más reciente y el pago ligado a ella ($0 si no hubo cobro).
 *  - Folios anteriores: todas las partidas entregadas y, como cobro, el último
 *    pago del folio — salvo que sea el «Anticipo inicial» (el cliente ya había
 *    pagado todo y se entregó sin cobro): ese no se devuelve.
 */

/** Nota del primer pago de un folio (lo escribe el backend al crearlo). */
const INITIAL_ADVANCE_NOTE = "Anticipo inicial";

interface DeliveryItem {
  id: number;
  status: string;
  delivery_id?: number | null;
  delivery_payment_id?: number | null;
  catalog?: { product_name: string } | null;
}

interface DeliveryPayment {
  id: number;
  amount: number;
  notes?: string | null;
}

export interface LastPresaleDelivery {
  itemIds: number[];
  names: string[];
  /** Lo que se devuelve al revertir (el cobro de esa entrega). */
  refund: number;
}

export function lastPresaleDelivery(
  items: readonly DeliveryItem[] | null | undefined,
  payments: readonly DeliveryPayment[] | null | undefined,
): LastPresaleDelivery | null {
  const delivered = (items ?? []).filter((it) => it.status === "delivered");
  if (delivered.length === 0) return null;

  const tracked = delivered.filter((it) => it.delivery_id != null);
  const summary = (group: readonly DeliveryItem[], refund: number): LastPresaleDelivery => ({
    itemIds: group.map((it) => it.id),
    names: group.map((it) => it.catalog?.product_name ?? `Partida #${it.id}`),
    refund,
  });

  if (tracked.length > 0) {
    const lastId = Math.max(...tracked.map((it) => it.delivery_id!));
    const group = tracked.filter((it) => it.delivery_id === lastId);
    const paymentId = group[0]?.delivery_payment_id ?? null;
    const payment = (payments ?? []).find((p) => p.id === paymentId);
    return summary(group, payment?.amount ?? 0);
  }

  const last = [...(payments ?? [])].sort((a, b) => b.id - a.id)[0];
  const isLiquidation = !!last && last.notes !== INITIAL_ADVANCE_NOTE;
  return summary(delivered, isLiquidation ? last.amount : 0);
}
