/**
 * Pago mixto Efectivo + Transferencia (Joel 2026-08-05).
 *
 * Modelo "split por monto" (patrón Square/Clover): el cajero captura cuánto
 * transfirió el cliente y el efectivo es EL RESTO. `cashPortion` se deriva
 * restando del mismo `total` que viaja al backend, así `transfer + cashPortion`
 * suma EXACTO el total — el checkout valida `Σ payments == total` (±0.01).
 */

export type MixedSplitReason = "empty" | "zero" | "exceeds"

export interface MixedSplit {
  /** Monto por transferencia, redondeado a 2 decimales. */
  transfer: number
  /** Efectivo a cobrar = total − transfer (2 decimales). */
  cashPortion: number
  /** true solo si 0 < transfer < total. */
  valid: boolean
  reason?: MixedSplitReason
}

const round2 = (n: number): number => Math.round(n * 100) / 100

export function computeMixedSplit(total: number, transferStr: string): MixedSplit {
  const trimmed = transferStr.trim()
  if (trimmed === "") {
    return { transfer: 0, cashPortion: round2(total), valid: false, reason: "empty" }
  }

  const parsed = parseFloat(trimmed)
  const transfer = Number.isFinite(parsed) ? round2(parsed) : 0
  if (transfer <= 0) {
    return { transfer: 0, cashPortion: round2(total), valid: false, reason: "zero" }
  }

  const totalR = round2(total)
  if (transfer >= totalR) {
    // transfer == total sería una venta 100% transferencia — para eso ya
    // existe el método Transferencia; el mixto exige DOS porciones reales.
    return { transfer, cashPortion: 0, valid: false, reason: "exceeds" }
  }

  return { transfer, cashPortion: round2(totalR - transfer), valid: true }
}
