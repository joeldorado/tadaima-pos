import { describe, expect, it } from "vitest";
import type { SaleDetail } from "@tadaima/api";
import { buildGroupedProducts } from "./buildReportData";

// Comisión de terminal en tickets con varios pagos (2026-10-12, Ruben): la
// comisión de la venta se reparte entre sus productos aunque la tarjeta NO sea
// el pago más grande del ticket. Antes solo se sumaba si el pago principal era
// tarjeta: en un ticket 60% efectivo / 40% tarjeta la tabla de Tarjeta traía
// el bruto pero no la comisión (Neto Tarjeta inflado).
const CASH = { id: 1, name: "Efectivo" };
const CARD = { id: 2, name: "Tarjeta Crédito" };
const TRANSFER = { id: 4, name: "Transferencia" };

const pay = (id: number, method: { id: number; name: string }, amount: number, commission = 0) => ({
  id, payment_method_id: method.id, terminal_id: method === CARD ? 1 : null, amount,
  commission_amount: commission, payment_method: method, created_at: "2026-10-12T18:00:00Z",
});

const item = (id: number, productId: number, name: string, total: number) => ({
  id, product_id: productId, product_name: name, quantity: 1, price: total, total,
  discount_amount: 0, surcharge_amount: 0,
  product: { id: productId, name, sku: `SKU-${productId}` }, created_at: "2026-10-12T18:00:00Z",
});

const sale = (over: Record<string, unknown>): SaleDetail => ({
  id: 1, store_id: 1, user_id: 1, customer_id: null, draft_id: null,
  subtotal: 100, discount: 0, surcharge: 0, total: 100, commission_amount: 0,
  status: "completed", cancellation_status: "none",
  customer: null, user: { id: 1, name: "Diana" },
  items: [item(10, 5, "Figura", 100)],
  payments: [pay(1, CASH, 100)],
  sold_at: "2026-10-12T18:00:00Z", created_at: "2026-10-12T18:00:00Z",
  ...over,
} as unknown as SaleDetail);

const rows = (s: SaleDetail) => buildGroupedProducts([s], [], ["all"], "2026-10-01", "2026-10-31", false);
const row = (s: SaleDetail, name: string) => rows(s).find(r => r.name === name)!;

describe("buildGroupedProducts — comisión de terminal por producto", () => {
  it("ticket mixto con la tarjeta como pago MENOR suma la comisión al producto", () => {
    const s = sale({ commission_amount: 1.4, payments: [pay(1, CASH, 60), pay(2, CARD, 40, 1.4)] });
    const figura = row(s, "Figura");

    expect(figura.commission_amount).toBeCloseTo(1.4, 6);
    // La tabla de Tarjeta toma su bruto de aquí: 40 de tarjeta con su comisión.
    expect(figura.payment_breakdown["Tarjeta Crédito"]!.revenue).toBeCloseTo(40, 6);
    expect(figura.payment_breakdown["Efectivo"]!.revenue).toBeCloseTo(60, 6);
  });

  it("ticket mixto con la tarjeta como pago MAYOR sigue sumando la comisión", () => {
    const s = sale({ commission_amount: 2.45, payments: [pay(1, CASH, 30), pay(2, CARD, 70, 2.45)] });

    expect(row(s, "Figura").commission_amount).toBeCloseTo(2.45, 6);
  });

  it("reparte la comisión entre los productos según el valor de cada renglón", () => {
    const s = sale({
      commission_amount: 2,
      items: [item(10, 5, "Figura", 75), item(11, 6, "Sobre", 25)],
      payments: [pay(1, CASH, 60), pay(2, CARD, 40, 2)],
    });

    expect(row(s, "Figura").commission_amount).toBeCloseTo(1.5, 6);
    expect(row(s, "Sobre").commission_amount).toBeCloseTo(0.5, 6);
  });

  it("venta pagada solo con tarjeta carga toda su comisión", () => {
    const s = sale({ commission_amount: 3.5, payments: [pay(1, CARD, 100, 3.5)] });

    expect(row(s, "Figura").commission_amount).toBeCloseTo(3.5, 6);
  });

  it("venta sin tarjeta (efectivo + transferencia) no carga comisión", () => {
    const s = sale({ commission_amount: 0, payments: [pay(1, CASH, 60), pay(2, TRANSFER, 40)] });

    expect(row(s, "Figura").commission_amount).toBe(0);
  });
});
