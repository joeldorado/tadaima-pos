import { describe, expect, it } from "vitest"
import { needsPaymentList, splitTablePayment } from "./presalePayments"

const sum = (rows: { amount: number }[]): number => Math.round(rows.reduce((s, r) => s + r.amount * 100, 0)) / 100

describe("splitTablePayment", () => {
  it("un método: cada bloque lleva un pago por su monto y los bloques en $0 quedan vacíos", () => {
    const out = splitTablePayment([800, 0, 200], { kind: "single", paymentMethodId: 1 })
    expect(out).toEqual([
      [{ amount: 800, payment_method_id: 1 }],
      [],
      [{ amount: 200, payment_method_id: 1 }],
    ])
  })

  it("tarjeta: cada pago lleva la terminal", () => {
    const out = splitTablePayment([150.5, 99.99], { kind: "single", paymentMethodId: 2, terminalId: 7 })
    expect(out).toEqual([
      [{ amount: 150.5, payment_method_id: 2, terminal_id: 7 }],
      [{ amount: 99.99, payment_method_id: 2, terminal_id: 7 }],
    ])
  })

  it("mixto: reparte la transferencia en orden y lo demás es efectivo", () => {
    const out = splitTablePayment([500, 300, 200], { kind: "mixto", cashMethodId: 1, transferMethodId: 4, transfer: 650 })
    expect(out).toEqual([
      [{ amount: 500, payment_method_id: 4 }],
      [{ amount: 150, payment_method_id: 1 }, { amount: 150, payment_method_id: 4 }],
      [{ amount: 200, payment_method_id: 1 }],
    ])
  })

  it("mixto: cada bloque suma exacto su monto y el total de transferencia cuadra en centavos", () => {
    const amounts = [333.33, 0.01, 666.66]
    const out = splitTablePayment(amounts, { kind: "mixto", cashMethodId: 1, transferMethodId: 4, transfer: 333.34 })
    out.forEach((rows, i) => expect(sum(rows)).toBe(amounts[i]))
    const transfer = out.flat().filter((r) => r.payment_method_id === 4)
    expect(sum(transfer)).toBe(333.34)
  })

  it("mixto: una transferencia mayor al total no inventa dinero", () => {
    const out = splitTablePayment([100], { kind: "mixto", cashMethodId: 1, transferMethodId: 4, transfer: 500 })
    expect(out).toEqual([[{ amount: 100, payment_method_id: 4 }]])
  })
})

describe("needsPaymentList", () => {
  it("un pago simple viaja con los campos de siempre", () => {
    expect(needsPaymentList([{ amount: 10, payment_method_id: 1 }])).toBe(false)
  })

  it("con terminal o con dos pagos viaja como lista", () => {
    expect(needsPaymentList([{ amount: 10, payment_method_id: 2, terminal_id: 3 }])).toBe(true)
    expect(needsPaymentList([{ amount: 5, payment_method_id: 1 }, { amount: 5, payment_method_id: 4 }])).toBe(true)
  })
})
