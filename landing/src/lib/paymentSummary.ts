import type { SaleDetail } from "@tadaima/api";

/**
 * Normaliza "cómo se pagó" una venta a una estructura única que consumen el
 * ticket (impresión/reimpresión) y los detalles del Historial (SellPage Caja +
 * SalesPage). Antes cada superficie reconstruía el desglose por su cuenta y la
 * reimpresión perdía los dólares/efectivo/cambio (usaba el TC de HOY en vez del
 * de la venta). Toda la verdad vive ahora en el backend:
 *   - payments[]          → método(s) + monto MXN
 *   - cash_received_usd    → dólares físicos recibidos
 *   - exchange_rate        → TC snapshot al cobrar
 *   - cash_received        → efectivo total entregado en MXN (incluye USD)
 *   - change_amount        → cambio devuelto en MXN
 */

/** Nombre corto para la UI: "Tarjeta débito/crédito" → "Tarjeta" (no cabe). */
export const shortMethodName = (name: string): string =>
  /tarjeta/i.test(name) ? "Tarjeta" : name;

export interface PaymentLine {
  name: string;
  amount: number;
}

export interface PaymentSummary {
  /** Etiqueta corta: "Efectivo" | "Tarjeta" | "Transferencia" | "Mixto" | … */
  methodLabel: string;
  /** Un renglón por pago registrado (para cobros divididos / mixtos). */
  lines: PaymentLine[];
  /** ¿se usó más de un método distinto? */
  isMixed: boolean;
  /** Dólares físicos recibidos (0 si no entraron USD). */
  usd: number;
  /** TC USD→MXN usado al cobrar (snapshot), o null. */
  exchangeRate: number | null;
  /** Equivalente en MXN de los dólares recibidos (usd × TC). */
  usdAsMxn: number;
  /** Efectivo total entregado en MXN, incluye USD convertido. null si no fue efectivo. */
  cashReceived: number | null;
  /** Porción en pesos del efectivo (cashReceived − usdAsMxn). null si no aplica. */
  pesosCash: number | null;
  /** Cambio devuelto en MXN. null si no aplica. */
  change: number | null;
  /** ¿entraron dólares físicos? */
  hasUsd: boolean;
}

/** Shape mínimo que necesita el resumen — compatible con SaleDetail. */
export type SaleLikeForPayment = Pick<
  SaleDetail,
  "payments" | "cash_received_usd" | "exchange_rate" | "cash_received" | "change_amount"
>;

export function buildPaymentSummary(sale: SaleLikeForPayment): PaymentSummary {
  const payments = sale.payments ?? [];
  const lines: PaymentLine[] = payments.map((p) => ({
    name: shortMethodName(p.payment_method?.name ?? "Efectivo"),
    amount: p.amount ?? 0,
  }));

  const distinct = new Set(lines.map((l) => l.name.toLowerCase()));
  const isMixed = distinct.size > 1;
  const methodLabel =
    lines.length === 0 ? "Efectivo" : isMixed ? "Mixto" : lines[0]!.name;

  const usd = Number(sale.cash_received_usd ?? 0) || 0;
  const exchangeRate = sale.exchange_rate != null ? Number(sale.exchange_rate) : null;
  const usdAsMxn = usd > 0 && exchangeRate ? usd * exchangeRate : 0;

  const cashReceived = sale.cash_received != null ? Number(sale.cash_received) : null;
  const change = sale.change_amount != null ? Number(sale.change_amount) : null;
  const pesosCash = cashReceived != null ? Math.max(0, cashReceived - usdAsMxn) : null;

  return {
    methodLabel,
    lines,
    isMixed,
    usd,
    exchangeRate,
    usdAsMxn,
    cashReceived,
    pesosCash,
    change,
    hasUsd: usd > 0,
  };
}
