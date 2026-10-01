/**
 * Filtro "método de pago" de la Lista de Ventas (2026-10-01). Antes miraba
 * solo el PRIMER pago (una venta mixta salía solo bajo su primer método), no
 * existía Transferencia y "Dólares" buscaba el método viejo — desde 2026-05-28
 * los dólares se cobran como Efectivo con `cash_received_usd`.
 */
import type { SaleDetail } from "@tadaima/api";
import { classifyMethodName, type PaymentKind } from "@/lib/paymentCorrection";

export type PaymentFilter = "all" | "efectivo" | "tarjeta" | "transferencia" | "dolares" | "mixto" | "varios";

type FilterableSale = Pick<SaleDetail, "payments" | "cash_received_usd">;

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
