import { describe, expect, it } from "vitest"
import { computeMixedSplit } from "./mixedPayment"

describe("computeMixedSplit", () => {
  it("split normal: transfer + cashPortion suman exacto el total", () => {
    const split = computeMixedSplit(500, "200")
    expect(split).toEqual({ transfer: 200, cashPortion: 300, valid: true })
    expect(split.transfer + split.cashPortion).toBe(500)
  })

  it("transfer vacío es inválido (reason empty) y el efectivo queda como el total", () => {
    const split = computeMixedSplit(500, "")
    expect(split.valid).toBe(false)
    expect(split.reason).toBe("empty")
    expect(split.cashPortion).toBe(500)
  })

  it("solo espacios cuenta como vacío", () => {
    expect(computeMixedSplit(500, "   ").reason).toBe("empty")
  })

  it("transfer 0 es inválido (reason zero)", () => {
    const split = computeMixedSplit(500, "0")
    expect(split.valid).toBe(false)
    expect(split.reason).toBe("zero")
  })

  it("transfer negativo es inválido (reason zero)", () => {
    expect(computeMixedSplit(500, "-50").reason).toBe("zero")
  })

  it("texto no numérico es inválido", () => {
    const split = computeMixedSplit(500, "abc")
    expect(split.valid).toBe(false)
    expect(split.reason).toBe("zero")
  })

  it("transfer igual al total es inválido (para eso está el método Transferencia)", () => {
    const split = computeMixedSplit(500, "500")
    expect(split.valid).toBe(false)
    expect(split.reason).toBe("exceeds")
    expect(split.cashPortion).toBe(0)
  })

  it("transfer mayor al total es inválido (reason exceeds)", () => {
    expect(computeMixedSplit(500, "600").reason).toBe("exceeds")
  })

  it("redondea a 2 decimales y la suma sigue cuadrando con centavos", () => {
    // 0.1 + 0.2 típico de flotantes: 199.995 → 200.00; 333.33 − 200 = 133.33
    const split = computeMixedSplit(333.33, "199.995")
    expect(split.transfer).toBe(200)
    expect(split.cashPortion).toBe(133.33)
    expect(split.valid).toBe(true)
    expect(Math.round((split.transfer + split.cashPortion) * 100) / 100).toBe(333.33)
  })

  it("acepta decimales chicos mientras dejen porción de efectivo real", () => {
    const split = computeMixedSplit(100, "99.99")
    expect(split.valid).toBe(true)
    expect(split.cashPortion).toBe(0.01)
  })
})
