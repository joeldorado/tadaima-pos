/**
 * Reparto del cobro de una mesa de Caja entre sus bloques (2026-11-23,
 * autorizado por Pier: preventa con Tarjeta y Mixto).
 *
 * Una mesa puede cobrar hasta tres cosas en una sola operación: el folio que se
 * entrega, la venta regular y el anticipo de una preventa nueva. Cada bloque
 * viaja con sus propios pagos y el servidor exige que sumen su monto exacto.
 *
 *  - Un método (Efectivo, Transferencia, Tarjeta…): cada bloque lleva un pago
 *    por su monto; con Tarjeta, también la terminal.
 *  - Mixto (efectivo + transferencia): la transferencia que capturó el cajero
 *    se reparte en orden (folio → venta → preventa nueva) y lo demás de cada
 *    bloque es efectivo. Para el corte solo importa cuánto entró por cada
 *    método, y eso cuadra igual con cualquier orden.
 *
 * Todo en centavos enteros: los bloques suman exacto lo que suma el total.
 */

export interface BlockPayment {
  amount: number
  payment_method_id: number
  /** Solo con Tarjeta. */
  terminal_id?: number
}

export type TablePayment =
  | {
      kind: "single"
      paymentMethodId: number
      /** Solo con Tarjeta. */
      terminalId?: number | undefined
    }
  | {
      kind: "mixto"
      cashMethodId: number
      transferMethodId: number
      /** Monto por transferencia de TODO el ticket. */
      transfer: number
    }

const toCents = (n: number): number => Math.round(n * 100)
const fromCents = (c: number): number => c / 100

/**
 * Pagos de cada bloque, en el mismo orden que `amounts`. Un bloque en $0 queda
 * sin pagos. En Mixto un bloque puede quedar con un solo pago (todo efectivo o
 * toda transferencia) si así cae el reparto.
 */
export function splitTablePayment(amounts: readonly number[], payment: TablePayment): BlockPayment[][] {
  if (payment.kind === "single") {
    return amounts.map((amount) => {
      const cents = toCents(amount)
      if (cents <= 0) return []
      return [{
        amount: fromCents(cents),
        payment_method_id: payment.paymentMethodId,
        ...(payment.terminalId != null ? { terminal_id: payment.terminalId } : {}),
      }]
    })
  }

  let transferLeft = Math.max(0, toCents(payment.transfer))
  return amounts.map((amount) => {
    const cents = Math.max(0, toCents(amount))
    const transfer = Math.min(cents, transferLeft)
    transferLeft -= transfer
    const cash = cents - transfer
    return [
      ...(cash > 0 ? [{ amount: fromCents(cash), payment_method_id: payment.cashMethodId }] : []),
      ...(transfer > 0 ? [{ amount: fromCents(transfer), payment_method_id: payment.transferMethodId }] : []),
    ]
  })
}

/**
 * ¿El bloque viaja como lista (`payments`) o con los campos de siempre? La
 * lista solo hace falta con terminal o con dos pagos; un pago simple sigue
 * igual que antes (mismo payload que entiende cualquier versión del servidor).
 */
export function needsPaymentList(rows: readonly BlockPayment[]): boolean {
  return rows.length > 1 || rows.some((r) => r.terminal_id != null)
}
