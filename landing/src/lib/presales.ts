import type { PreSaleStatus } from "@tadaima/api";

export const PRE_SALE_STATUS_LABELS: Record<PreSaleStatus, string> = {
  live:      "Abierta",
  ready:     "Lista para recoger",
  completed: "Entregada",
  cancelled: "Cancelada",
  expired:   "Vencida",
};

/** Calcula puntos ganados. `points = floor(total * multiplier)`. Nunca negativo. */
export function calculatePoints(total: number, multiplier: number): number {
  if (total <= 0 || multiplier <= 0) return 0;
  return Math.floor(total * multiplier);
}

/** True si la preventa puede ser liquidada (status live|ready y balance > 0). */
export function canLiquidate(
  preSale: { status: PreSaleStatus; balance: number | null }
): boolean {
  if (preSale.status !== "live" && preSale.status !== "ready") return false;
  return preSale.balance != null && preSale.balance > 0;
}

/**
 * True si la preventa está vencida: status === 'ready' y pickup_deadline < hoy.
 * El mismo día NO cuenta como vencida.
 */
export function isExpired(
  preSale: { status: PreSaleStatus; pickup_deadline: string | null },
  today: Date = new Date()
): boolean {
  if (preSale.status !== "ready") return false;
  if (!preSale.pickup_deadline) return false;
  const deadline = new Date(preSale.pickup_deadline + "T23:59:59");
  return deadline < today;
}

/** Etiqueta en español para cada status. */
export function getPreSaleStatusLabel(status: PreSaleStatus): string {
  return PRE_SALE_STATUS_LABELS[status] ?? status;
}

/** Valida formato de código de tarjeta: alfanumérico, 8–16 caracteres. */
export function isCardCode(input: string): boolean {
  return /^[A-Za-z0-9]{8,16}$/.test(input);
}
