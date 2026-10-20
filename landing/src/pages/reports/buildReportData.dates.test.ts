import { describe, expect, it } from "vitest";
import type { PreSaleOrder, PreSaleOrderPayment } from "@tadaima/api";
import { buildPresaleRows, presalePaymentsInRange } from "./buildReportData";

// Fechas sueltas (no consecutivas, 2026-10-19): `dates` gana sobre `from`/`to`
// — un pago a mitad del rango que NO está en la lista de días elegidos debe
// quedar fuera, aunque caiga dentro de from..to.
const payment = (id: number, amount: number, created_at: string): PreSaleOrderPayment => ({
  id, amount, notes: null, created_at, payment_method: { id: 1, name: "Efectivo" }, cashier: null,
});

const order = (payments: PreSaleOrderPayment[]): PreSaleOrder => ({
  id: 1, code: "PREV-00001", status: "pending",
  linked_sale_id: null, pickup_deadline: null, notes: null,
  created_at: payments[0]!.created_at, updated_at: payments[0]!.created_at,
  store: { id: 1, name: "Centro" }, user: null, customer: null,
  items: [{
    id: 10, pre_sale_catalog_id: 3, product_id: 7, quantity: 1, price_level: 1,
    unit_price: 300, subtotal: 300, cost: 200,
    status: "pending", delivered_at: null, created_at: payments[0]!.created_at,
    catalog: { id: 3, product_name: "Figura Z", image_path: null, status: null, pickup_deadline: null },
  }],
  payments,
  total: 300,
  paid_amount: payments.reduce((a, p) => a + p.amount, 0),
  balance: 300 - payments.reduce((a, p) => a + p.amount, 0),
});

describe("presalePaymentsInRange — fechas sueltas", () => {
  it("dates gana sobre from/to: solo trae los pagos de los días elegidos", () => {
    const payments = [
      payment(1, 100, "2026-10-01T18:00:00Z"),
      payment(2, 200, "2026-10-03T18:00:00Z"), // NO elegido — debe quedar fuera
      payment(3, 300, "2026-10-05T18:00:00Z"),
    ];

    const inRange = presalePaymentsInRange(payments, "2026-10-01", "2026-10-05", ["2026-10-01", "2026-10-05"]);

    expect(inRange.map((p) => p.id)).toEqual([1, 3]);
  });

  it("sin dates sigue siendo un rango continuo normal", () => {
    const payments = [
      payment(1, 100, "2026-10-01T18:00:00Z"),
      payment(2, 200, "2026-10-03T18:00:00Z"),
    ];

    const inRange = presalePaymentsInRange(payments, "2026-10-01", "2026-10-05");

    expect(inRange.map((p) => p.id)).toEqual([1, 2]);
  });

  it("buildPresaleRows respeta dates sueltas en el monto apartado", () => {
    const payments = [
      payment(1, 100, "2026-10-01T18:00:00Z"),
      payment(2, 200, "2026-10-03T18:00:00Z"), // fuera de la selección
    ];

    const rows = buildPresaleRows([order(payments)], "2026-10-01", "2026-10-05", ["2026-10-01", "2026-10-05"]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.apartado).toBe(100);
  });
});
