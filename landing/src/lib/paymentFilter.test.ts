import { describe, expect, it } from "vitest";
import type { PreSaleOrder, SaleDetail } from "@tadaima/api";
import type { HistorialEntry } from "@/hooks/queries/useHistorial";
import { historialEntryMatchesPaymentFilter, saleMatchesPaymentFilter } from "./paymentFilter";

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

// ─── Historial del Día de Caja ───────────────────────────────────────────────

/** Pago de preventa: solo trae método, monto, notas y cajero. */
const prePay = (name: string, amount: number) => ({
  id: 1, amount, notes: null, created_at: "2026-10-08T12:00:00Z",
  payment_method: { id: 1, name }, cashier: null,
});
const presaleEntry = (payments: ReturnType<typeof prePay>[]): HistorialEntry =>
  ({ type: "presale", data: { payments } as unknown as PreSaleOrder });
const saleEntry = (payments: ReturnType<typeof pay>[], usd: number | null = null): HistorialEntry =>
  ({ type: "sale", data: sale(payments, usd) as unknown as SaleDetail });

describe("historialEntryMatchesPaymentFilter", () => {
  it("una venta del historial se filtra igual que en Ventas", () => {
    expect(historialEntryMatchesPaymentFilter(saleEntry([pay("Efectivo", 500)], 30), "dolares")).toBe(true);
    expect(historialEntryMatchesPaymentFilter(saleEntry([pay("Tarjeta", 500)]), "tarjeta")).toBe(true);
    expect(historialEntryMatchesPaymentFilter(saleEntry([pay("Tarjeta", 500)]), "efectivo")).toBe(false);
    // Legacy sin pagos sigue contando como efectivo.
    expect(historialEntryMatchesPaymentFilter(saleEntry([]), "efectivo")).toBe(true);
  });

  it("la preventa se clasifica por cómo se pagó el anticipo", () => {
    const transfer = presaleEntry([prePay("Transferencia", 100)]);
    expect(historialEntryMatchesPaymentFilter(transfer, "transferencia")).toBe(true);
    expect(historialEntryMatchesPaymentFilter(transfer, "efectivo")).toBe(false);
    expect(historialEntryMatchesPaymentFilter(transfer, "all")).toBe(true);
    expect(historialEntryMatchesPaymentFilter(presaleEntry([prePay("Dólares", 100)]), "dolares")).toBe(true);
  });

  it("preventa sin anticipo solo entra en Todos", () => {
    const sinAnticipo = presaleEntry([]);
    expect(historialEntryMatchesPaymentFilter(sinAnticipo, "all")).toBe(true);
    expect(historialEntryMatchesPaymentFilter(sinAnticipo, "efectivo")).toBe(false);
    expect(historialEntryMatchesPaymentFilter(sinAnticipo, "mixto")).toBe(false);
  });

  it("par preventa + venta: se unen los pagos de las dos", () => {
    const anticipoEfectivo = presaleEntry([prePay("Efectivo", 100)]);
    const ventaTarjeta = sale([pay("Tarjeta Crédito", 400)]);
    expect(historialEntryMatchesPaymentFilter(anticipoEfectivo, "mixto", ventaTarjeta)).toBe(true);
    expect(historialEntryMatchesPaymentFilter(anticipoEfectivo, "efectivo", ventaTarjeta)).toBe(true);
    expect(historialEntryMatchesPaymentFilter(anticipoEfectivo, "tarjeta", ventaTarjeta)).toBe(true);
    expect(historialEntryMatchesPaymentFilter(anticipoEfectivo, "transferencia", ventaTarjeta)).toBe(false);
    // Los dólares del par vienen de la venta emparejada.
    expect(historialEntryMatchesPaymentFilter(anticipoEfectivo, "dolares", sale([pay("Efectivo", 400)], 20))).toBe(true);
  });
});
