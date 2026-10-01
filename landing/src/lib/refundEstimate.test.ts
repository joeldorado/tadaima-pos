import { describe, expect, it } from "vitest";
import { estimateSaleRefund, splitRefundByCash } from "./refundEstimate";

// Mismos casos que backend/tests/Feature/CancellationNetRefundTest.php.
describe("estimateSaleRefund", () => {
  it("cancelación total de una línea con descuento devuelve lo cobrado", () => {
    const sale = { discount: 40, total: 160, items: [{ id: 1, quantity: 2, price: 100, total: 200, discount_amount: 40 }] };
    expect(estimateSaleRefund(sale)).toEqual({ total: 160, perLine: { 1: 160 } });
  });

  it("parcial prorratea el descuento: 3 × $100 −$20 c/u, cancelo 1 → $80", () => {
    const sale = { discount: 60, total: 240, items: [{ id: 1, quantity: 3, price: 100, total: 300, discount_amount: 60 }] };
    expect(estimateSaleRefund(sale, { 1: 1 }).total).toBe(80);
  });

  it("parcial prorratea la promo: 2 × $50 con 2x1, cancelo 1 → $25", () => {
    const sale = { discount: 50, total: 50, items: [{ id: 1, quantity: 2, price: 50, total: 100, discount_amount: 50 }] };
    expect(estimateSaleRefund(sale, { 1: 1 }).total).toBe(25);
  });

  it("aumento: total devuelve $300, parcial $150", () => {
    const sale = { discount: 0, surcharge: 100, total: 300, items: [{ id: 1, quantity: 2, price: 100, total: 200, surcharge_amount: 100 }] };
    expect(estimateSaleRefund(sale).total).toBe(300);
    expect(estimateSaleRefund(sale, { 1: 1 }).total).toBe(150);
  });

  it("legacy (descuento global): total $510; dos parciales de $90", () => {
    expect(estimateSaleRefund({ discount: 50, total: 510, items: [{ id: 1, quantity: 2, price: 280, total: 560 }] }).total).toBe(510);
    const partial = { discount: 20, total: 180, items: [{ id: 1, quantity: 2, price: 100, total: 200 }] };
    expect(estimateSaleRefund(partial, { 1: 1 }).total).toBe(90);
  });

  it("varias líneas: cada una devuelve su neto", () => {
    const sale = {
      discount: 20, surcharge: 20, total: 300,
      items: [
        { id: 1, quantity: 2, price: 100, total: 200, discount_amount: 20 },
        { id: 2, quantity: 1, price: 100, total: 100, surcharge_amount: 20 },
      ],
    };
    expect(estimateSaleRefund(sale, { 1: 1 })).toEqual({ total: 90, perLine: { 1: 90 } });
    expect(estimateSaleRefund(sale, { 2: 1 })).toEqual({ total: 120, perLine: { 2: 120 } });
    expect(estimateSaleRefund(sale)).toEqual({ total: 300, perLine: { 1: 180, 2: 120 } });
  });
});

describe("splitRefundByCash", () => {
  const p = (name: string | null, amount: number) => ({ amount, payment_method: name === null ? null : { name } });

  it("efectivo: todo sale del cajón", () => {
    expect(splitRefundByCash(500, [p("Efectivo", 500)])).toEqual({ cash: 500, other: 0 });
  });

  it("tarjeta o transferencia: nada sale del cajón (2026-09-30)", () => {
    expect(splitRefundByCash(500, [p("Tarjeta Débito", 500)])).toEqual({ cash: 0, other: 500 });
    expect(splitRefundByCash(500, [p("Transferencia", 500)])).toEqual({ cash: 0, other: 500 });
  });

  it("mixto: en proporción a lo cobrado en efectivo", () => {
    expect(splitRefundByCash(250, [p("Efectivo", 300), p("Transferencia", 200)])).toEqual({ cash: 150, other: 100 });
  });

  it("sin pagos o sin método cuenta como efectivo (como el backend)", () => {
    expect(splitRefundByCash(100, [])).toEqual({ cash: 100, other: 0 });
    expect(splitRefundByCash(100, [p(null, 100)])).toEqual({ cash: 100, other: 0 });
  });
});
