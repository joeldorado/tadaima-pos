// Los tres "cajones" del reporte de ventas: efectivo, tarjeta y transferencia.
// Misma regla que `buildPaymentBreakdown` (la fila de resumen del reporte):
// tarjeta; si no, transferencia/depósito; todo lo demás (Efectivo, dólares,
// "Otro") es efectivo. Así el TOTAL de cada bloque del Excel/PDF cuadra con
// "Efectivo / Tarjetas / Depósitos" del resumen.

export type PayBucket = "cash" | "card" | "transfer";

export const PAY_BUCKETS: readonly PayBucket[] = ["cash", "card", "transfer"];

const isCardName = (n: string): boolean =>
  n.includes("tarjeta") || n.includes("credit") || n.includes("debito") || n.includes("tpv") || n.includes("terminal");

const isTransferName = (n: string): boolean =>
  n.includes("transfer") || n.includes("deposit") || n.includes("spei");

/** Cajón de un método de pago por su nombre ("Transferencia (Devuelto)" → transfer). */
export function payBucketOf(methodName: string | null | undefined): PayBucket {
  const n = (methodName ?? "").toLowerCase();
  if (isCardName(n)) return "card";
  if (isTransferName(n)) return "transfer";
  return "cash";
}

interface PaymentLike {
  amount?: number | null;
  payment_method?: { name?: string | null } | null;
}

/**
 * Parte de un ticket pagada con cada cajón (suma 1). Una venta mixta se
 * reparte proporcional al monto de cada pago; sin pagos (o pagado $0) todo va
 * al cajón del método de respaldo.
 */
export function bucketShares(
  payments: ReadonlyArray<PaymentLike | null | undefined> | null | undefined,
  fallbackMethodName: string,
): Record<PayBucket, number> {
  const shares: Record<PayBucket, number> = { cash: 0, card: 0, transfer: 0 };
  const paid = (payments ?? []).filter((p): p is PaymentLike => !!p);
  const total = paid.reduce((sum, p) => sum + (p.amount || 0), 0);
  if (total <= 0) {
    shares[payBucketOf(fallbackMethodName)] = 1;
    return shares;
  }
  for (const p of paid) {
    shares[payBucketOf(p.payment_method?.name)] += (p.amount || 0) / total;
  }
  return shares;
}
