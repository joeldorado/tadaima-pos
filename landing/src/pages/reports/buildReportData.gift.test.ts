import { describe, expect, it } from "vitest";
import type { SaleDetail } from "@tadaima/api";
import { buildGroupedProducts } from "./buildReportData";

// Regalo por línea (2026-10-31): la línea llega en price/total/cost = 0 y va en
// su propio renglón «(Regalo)» — no se mezcla con lo vendido del mismo producto.
const item = (over: Record<string, unknown>) => ({
  id: 10, product_id: 5, product_name: "Figura", quantity: 1, price: 100, total: 100, cost: 40,
  discount_amount: 0, surcharge_amount: 0,
  product: { id: 5, name: "Figura", sku: "F-1", cost: 40 }, created_at: "2026-10-31T18:00:00Z", ...over,
});

const sale = (items: unknown[]): SaleDetail => ({
  id: 1, store_id: 1, user_id: 1, customer_id: null, draft_id: null,
  subtotal: 100, discount: 0, surcharge: 0, total: 100, commission_amount: 0,
  status: "completed", cancellation_status: "none",
  customer: null, user: { id: 1, name: "Diana" },
  items,
  payments: [{ id: 1, payment_method_id: 1, terminal_id: null, amount: 100, commission_amount: 0, payment_method: { id: 1, name: "Efectivo" }, created_at: "2026-10-31T18:00:00Z" }],
  sold_at: "2026-10-31T18:00:00Z", created_at: "2026-10-31T18:00:00Z",
} as unknown as SaleDetail);

describe("buildGroupedProducts con regalos", () => {
  const s = sale([
    item({}),
    item({ id: 11, price: 0, total: 0, cost: 0, is_gift: true, gift: { list_price: 100, unit_cost: 40, note: null } }),
  ]);

  it.each([true, false])("el regalo va en su propio renglón en $0 (ver costos: %s)", canViewCost => {
    const rows = buildGroupedProducts([s], [], ["all"], "2026-10-01", "2026-10-31", canViewCost);
    const sold = rows.find(r => r.name === "Figura")!;
    const gift = rows.find(r => r.name === "Figura (Regalo)")!;

    expect(sold.total_revenue).toBe(100);
    expect(sold.total_cost).toBe(40);
    expect(gift.total_quantity).toBe(1);
    expect(gift.total_revenue).toBe(0);
    expect(gift.total_cost).toBe(0);
    expect(gift.total_profit).toBe(0);
  });

  it("un costo 0 guardado no cae al costo actual del catálogo", () => {
    const rows = buildGroupedProducts([sale([item({ price: 0, total: 0, cost: 0, is_gift: true })])], [], ["all"], "2026-10-01", "2026-10-31", true);
    expect(rows.find(r => r.name === "Figura (Regalo)")!.total_cost).toBe(0);
  });
});
