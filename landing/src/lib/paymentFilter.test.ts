import { describe, expect, it } from "vitest";
import { saleMatchesPaymentFilter } from "./paymentFilter";

const pay = (name: string, amount: number) => ({
  id: 1, payment_method_id: 1, terminal_id: null, amount, commission_amount: 0,
  payment_method: { id: 1, name }, created_at: "2026-10-01T12:00:00Z",
});
const sale = (payments: ReturnType<typeof pay>[], usd: number | null = null) => ({ payments, cash_received_usd: usd });

describe("saleMatchesPaymentFilter", () => {
  const mixta = sale([pay("Efectivo", 300), pay("Transferencia", 200)]);

  it("transferencia también encuentra las ventas mixtas", () => {
    expect(saleMatchesPaymentFilter(sale([pay("Transferencia", 500)]), "transferencia")).toBe(true);
    expect(saleMatchesPaymentFilter(mixta, "transferencia")).toBe(true);
    expect(saleMatchesPaymentFilter(sale([pay("Efectivo", 500)]), "transferencia")).toBe(false);
  });

  it("revisa todos los pagos, no solo el primero", () => {
    expect(saleMatchesPaymentFilter(mixta, "efectivo")).toBe(true);
    expect(saleMatchesPaymentFilter(sale([pay("Transferencia", 200), pay("Efectivo", 300)]), "efectivo")).toBe(true);
  });

  it("dólares = efectivo con USD recibidos (o el método viejo)", () => {
    expect(saleMatchesPaymentFilter(sale([pay("Efectivo", 500)], 30), "dolares")).toBe(true);
    expect(saleMatchesPaymentFilter(sale([pay("Dólares", 500)]), "dolares")).toBe(true);
    expect(saleMatchesPaymentFilter(sale([pay("Efectivo", 500)]), "dolares")).toBe(false);
  });

  it("tarjeta y mixto", () => {
    expect(saleMatchesPaymentFilter(sale([pay("Tarjeta Débito", 500)]), "tarjeta")).toBe(true);
    expect(saleMatchesPaymentFilter(mixta, "mixto")).toBe(true);
    expect(saleMatchesPaymentFilter(sale([pay("Efectivo", 500)]), "mixto")).toBe(false);
  });

  it("ventas legacy sin pagos cuentan como efectivo", () => {
    expect(saleMatchesPaymentFilter(sale([]), "efectivo")).toBe(true);
    expect(saleMatchesPaymentFilter(sale([]), "all")).toBe(true);
  });
});
