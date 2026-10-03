/**
 * Margen % del modal "Editar Tomo" (Joel 2026-10-03). Puro para poder probarlo
 * sin montar el modal.
 *
 * El costo de un tomo no se captura: se deriva del precio A y el margen
 * (`costo = precio A × (1 − margen/100)`; el manga nacional va al 30%). El API
 * no manda el margen a quien no puede ver costos ni cuando el tomo no tiene
 * costo. Antes el modal convertía ese hueco en `profit_margin_percent: 0` y el
 * backend guardaba costo = precio público. Regla: sin un margen válido, la
 * llave NO se manda y el backend conserva el margen que ya tiene el tomo.
 */

/** Margen capturado utilizable: mayor a 0 y menor a 100. */
export function parseMarginPct(raw: string): number | undefined {
  const margin = Number.parseFloat(raw);
  return Number.isFinite(margin) && margin > 0 && margin < 100 ? margin : undefined;
}

/** Valor inicial del campo: vacío si el API no mandó margen. */
export function initialMarginInput(margin: number | null | undefined): string {
  return typeof margin === "number" && Number.isFinite(margin) ? String(margin) : "";
}

/** Pedazo del payload de `updateManga`: `{}` cuando no hay margen válido. */
export function marginPayload(raw: string): { profit_margin_percent?: number } {
  const margin = parseMarginPct(raw);
  return margin === undefined ? {} : { profit_margin_percent: margin };
}

/** "Costo real" que muestra el modal; null si falta precio o margen válido. */
export function costFromMargin(priceRaw: string, marginRaw: string): number | null {
  const price = Number.parseFloat(priceRaw);
  const margin = parseMarginPct(marginRaw);
  if (!Number.isFinite(price) || price <= 0 || margin === undefined) return null;
  return Math.round(price * (1 - margin / 100) * 100) / 100;
}
