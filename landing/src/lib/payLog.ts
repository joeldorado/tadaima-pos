/**
 * Log de pagos de la Caja (Joel 2026-07-30): registro visible POR MESA de lo
 * que el cliente fue entregando ("Billete +$200", "Dólares US$15"), como el
 * POS viejo. Vive en `Mesa.payLog` (se persiste con el borrador del carrito)
 * y se limpia al cobrar. Solo UI — nada de esto viaja al backend.
 */

export type PayLogKind =
  /** Billete/preset de pesos que SUMA al recibido. */
  | "mxn"
  /** Captura directa del input de pesos (reemplaza a la captura anterior). */
  | "mxn-input"
  /** Dólares aplicados/quitados desde la calculadora. */
  | "usd"
  /** Eventos informativos (cambio de método, etc.). */
  | "info";

export interface PayLogEntry {
  id: string;
  /** ISO timestamp del evento. */
  at: string;
  /** Texto que ve el cajero, ya formateado. */
  label: string;
  kind: PayLogKind;
}

/** Tope de entradas por mesa — las más viejas se van (una venta real no pasa de esto). */
export const PAY_LOG_MAX = 20;

const makeId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Agrega una entrada al log de forma INMUTABLE (devuelve arreglo nuevo).
 * Regla anti-ruido: una captura directa (`mxn-input`) consecutiva REEMPLAZA a
 * la anterior — teclear 2 → 20 → 200 deja UNA entrada, no tres.
 */
export function pushPayEntry(
  log: readonly PayLogEntry[] | undefined,
  entry: { label: string; kind: PayLogKind; at?: string },
): PayLogEntry[] {
  const base = log ?? [];
  const next: PayLogEntry = {
    id: makeId(),
    at: entry.at ?? new Date().toISOString(),
    label: entry.label,
    kind: entry.kind,
  };

  const last = base[base.length - 1];
  const replacing = entry.kind === "mxn-input" && last?.kind === "mxn-input";
  const kept = replacing ? base.slice(0, -1) : [...base];

  return [...kept, next].slice(-PAY_LOG_MAX);
}
