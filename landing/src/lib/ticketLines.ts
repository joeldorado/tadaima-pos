/**
 * Renglón de ticket con PRECIO FINAL (decisión Joel 2026-09-29): una línea con
 * aumento de precio se imprime ya con el aumento incluido ("1 × $250"), sin
 * renglón aparte de "aumento". El detalle queda en Historial y Reportes.
 *
 * El importe de la línea va explícito para que el ticket sume al centavo:
 * 3 × $100 + $100 de aumento = $400, aunque $400 / 3 = $133.33 por pieza.
 */

export interface FinalPriceLine {
  /** Precio por pieza a imprimir (con el aumento incluido). */
  price: number;
  /** Importe de la línea (bruto + aumento) — lo que se suma en el ticket. */
  lineTotal: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function finalPriceLine(unitPrice: number, qty: number, surcharge = 0): FinalPriceLine {
  const lineTotal = round2(unitPrice * qty + (surcharge || 0));
  const price = qty > 0 && surcharge ? round2(lineTotal / qty) : unitPrice;
  return { price, lineTotal };
}
