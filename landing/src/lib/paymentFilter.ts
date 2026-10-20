/**
 * Filtro "método de pago" de la Lista de Ventas (2026-10-01) y del Historial
 * del Día de Caja (2026-10-08). Antes miraba solo el PRIMER pago (una venta
 * mixta salía solo bajo su primer método), no existía Transferencia y
 * "Dólares" buscaba el método viejo — desde 2026-05-28 los dólares se cobran
 * como Efectivo con `cash_received_usd`.
 */
import type { PreSaleOrder, SaleDetail } from "@tadaima/api";
import type { HistorialEntry } from "@/hooks/queries/useHistorial";
import { classifyMethodName, type PaymentKind } from "@/lib/paymentCorrection";

export type PaymentFilter = "all" | "efectivo" | "tarjeta" | "transferencia" | "dolares" | "mixto" | "varios";

/** Un pago de venta o de preventa: al filtro solo le importa el nombre del método. */
type PaymentLike = { payment_method?: { name: string } | null };

/** Lo mínimo que el filtro necesita de una venta (o de una preventa + su venta emparejada). */
export type FilterableSale = {
  payments?: PaymentLike[] | null;
  cash_received_usd?: number | null;
};

function kindsOf(sale: FilterableSale): Set<PaymentKind> {
  return new Set((sale.payments ?? []).map(p => classifyMethodName(p.payment_method?.name)));
}

/** ¿La venta entra en el filtro? Revisa TODOS sus pagos. */
export function saleMatchesPaymentFilter(sale: FilterableSale, filter: PaymentFilter): boolean {
  const kinds = kindsOf(sale);
  switch (filter) {
    case "all":
      return true;
    case "efectivo":
      // Sin pagos registrados (legacy) se mostraba como Efectivo.
      return kinds.size === 0 || kinds.has("efectivo");
    case "tarjeta":
      return kinds.has("tarjeta");
    case "transferencia":
      return kinds.has("transferencia");
    case "dolares":
      return Number(sale.cash_received_usd ?? 0) > 0 || kinds.has("dolares");
    case "mixto":
      return kinds.size > 1;
    case "varios":
      // "Varios / Preventas" muestra los movimientos de preventa, no ventas.
      return false;
  }
}

// ─── Historial del Día de Caja (2026-10-08) ──────────────────────────────────

/** Sin "Varios": en el Historial las preventas ya van mezcladas con las ventas. */
export type HistorialMethodFilter = Exclude<PaymentFilter, "varios">;

export const HISTORIAL_METHOD_OPTIONS: ReadonlyArray<{ value: HistorialMethodFilter; label: string }> = [
  { value: "all",           label: "Todos los pagos" },
  { value: "efectivo",      label: "Efectivo" },
  { value: "tarjeta",       label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "dolares",       label: "Dólares" },
  { value: "mixto",         label: "Mixto" },
];

/**
 * ¿La entrada del Historial entra en el filtro?
 * - Venta: igual que en Ventas (una venta legacy sin pagos cuenta como Efectivo).
 * - Preventa: por los pagos de su anticipo/liquidación, unidos a los de la venta
 *   emparejada cuando es un par "mixto" (preventa + venta cobradas juntas se
 *   pintan como UN bloque). Sin pagos y sin pareja solo entra en "Todos": no
 *   entró dinero, no hay método que filtrar.
 */
export function historialEntryMatchesPaymentFilter(
  entry: HistorialEntry,
  filter: HistorialMethodFilter,
  pairedSale?: Pick<SaleDetail, "payments" | "cash_received_usd"> | null,
): boolean {
  if (filter === "all") return true;
  if (entry.type === "sale") return saleMatchesPaymentFilter(entry.data, filter);
  const order: Pick<PreSaleOrder, "payments"> = entry.data;
  const payments: PaymentLike[] = [...(order.payments ?? []), ...(pairedSale?.payments ?? [])];
  if (payments.length === 0) return false;
  return saleMatchesPaymentFilter({ payments, cash_received_usd: pairedSale?.cash_received_usd ?? null }, filter);
}
