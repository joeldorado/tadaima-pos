import { describe, expect, it } from "vitest";
import type { SaleDetail } from "@tadaima/api";
import { buildGroupedProducts } from "./buildReportData";

// Detalle por ticket de promos, descuentos y aumentos (2026-10-03): el Excel y
// el PDF lo listan bajo cada bloque (x.1 Descuentos y ofertas, x.2 Aumentos).
// Lo que ya usa la pantalla (`*_breakdown`, `surcharge_entries`) no cambia.
const payment = (name: string, amount: number) => ({
  id: 1, payment_method_id: 1, terminal_id: null, amount, commission_amount: 0,
  payment_method: { id: 1, name }, created_at: "2026-09-29T18:00:00Z",
});

const item = (over: Record<string, unknown>) => ({
  id: 10, product_id: 5, product_name: "Figura", quantity: 2, price: 100, total: 200,
  discount_amount: 0, product: { id: 5, name: "Figura", sku: "F-1" }, created_at: "2026-09-29T18:00:00Z", ...over,
});

const sale = (over: Partial<SaleDetail>): SaleDetail => ({
  id: 1, store_id: 1, user_id: 1, customer_id: null, draft_id: null,
  subtotal: 200, discount: 0, surcharge: 0, total: 200, commission_amount: 0,
  status: "completed", cancellation_status: "none",
  customer: null, user: { id: 1, name: "Diana" },
  items: [item({})], payments: [payment("Efectivo", 200)],
  sold_at: "2026-09-29T18:00:00Z", created_at: "2026-09-29T18:00:00Z",
  ...over,
});

const figura = (sales: SaleDetail[]) =>
  buildGroupedProducts(sales, [], ["all"], "2026-09-01", "2026-09-30", false).find(r => r.name === "Figura")!;

describe("buildGroupedProducts — detalle por ticket (adjustment_entries)", () => {
  it("descuento manual en efectivo: una entrada con motivo, nota y cajero", () => {
    const row = figura([sale({
      discount: 40, total: 160, payments: [payment("Efectivo", 160)] as never,
      items: [item({ discount_amount: 40, benefit_type: "discount", discount_reason: "danado", discount_note: "abierto" })] as never,
    })]);

    expect(row.adjustment_entries).toEqual([expect.objectContaining({
      kind: "discount", sale_id: 1, cashier: "Diana", reason: "danado", note: "abierto",
      quantity: 2, amount: 40, shares: { cash: 1, card: 0, transfer: 0 },
    })]);
    expect(row.discount_breakdown?.danado).toEqual({ cash: 40, card: 0 });
  });

  it("promo y descuento manual en la misma línea: dos entradas", () => {
    const row = figura([sale({
      discount: 150, total: 50, payments: [payment("Efectivo", 50)] as never,
      items: [item({ discount_amount: 150, benefit_type: "discount", promo_amount: 100, promo_name: "3x2", discount_reason: "otro" })] as never,
    })]);

    expect(row.adjustment_entries).toEqual([
      expect.objectContaining({ kind: "promo", reason: "3x2", amount: 100 }),
      expect.objectContaining({ kind: "discount", reason: "otro", amount: 50 }),
    ]);
    expect(row.promo_total).toBe(100);
    expect(row.manual_total).toBe(50);
  });

  it("venta mixta efectivo + transferencia: la entrada lleva el reparto por método", () => {
    const row = figura([sale({
      discount: 100, total: 100, payments: [payment("Efectivo", 60), payment("Transferencia", 40)] as never,
      items: [item({ discount_amount: 100, benefit_type: "discount", discount_reason: "cortesia" })] as never,
    })]);

    const entry = row.adjustment_entries![0]!;
    expect(entry.amount).toBe(100);
    expect(entry.shares.cash).toBeCloseTo(0.6);
    expect(entry.shares.transfer).toBeCloseTo(0.4);
    expect(entry.shares.card).toBe(0);
    // Lo que usa la pantalla sigue igual: transferencia cuenta dentro de "card".
    expect(row.discount_breakdown?.cortesia?.cash).toBeCloseTo(60);
    expect(row.discount_breakdown?.cortesia?.card).toBeCloseTo(40);
  });

  it("aumento de precio: entrada nueva sin tocar surcharge_entries", () => {
    const row = figura([sale({
      surcharge: 50, total: 250, payments: [payment("Tarjeta", 250)] as never,
      items: [item({ surcharge_amount: 50, surcharge_reason: "precio_especial", surcharge_note: "set" })] as never,
    })]);

    expect(row.adjustment_entries).toEqual([expect.objectContaining({
      kind: "surcharge", reason: "precio_especial", note: "set", amount: 50, shares: { cash: 0, card: 1, transfer: 0 },
    })]);
    expect(row.surcharge_entries).toHaveLength(1);
  });

  it("devolución legacy (venta anulada completa): sus descuentos no salen en el detalle", () => {
    const row = figura([sale({
      status: "returned", discount: 40, total: 160, payments: [payment("Efectivo", 160)] as never,
      items: [item({ discount_amount: 40, benefit_type: "discount", discount_reason: "danado" })] as never,
    })]);

    expect(row.adjustment_entries).toBeUndefined();
  });

  it("venta sin beneficios o con descuento global legacy: sin entradas", () => {
    expect(figura([sale({})]).adjustment_entries).toBeUndefined();
    const legacy = figura([sale({ discount: 50, total: 150, payments: [payment("Efectivo", 150)] as never })]);
    expect(legacy.adjustment_entries).toBeUndefined();
  });
});
