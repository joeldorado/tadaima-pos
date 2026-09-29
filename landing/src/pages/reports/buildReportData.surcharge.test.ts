import { describe, expect, it } from "vitest";
import type { SaleDetail } from "@tadaima/api";
import { buildGroupedProducts } from "./buildReportData";

// Venta con aumento de precio (2026-09-29): el reporte cuenta el NETO real de
// la línea (bruto + aumento) y registra quién/por qué.
const sale = (over: Partial<SaleDetail>): SaleDetail => ({
  id: 1, store_id: 1, user_id: 1, customer_id: null, draft_id: null,
  subtotal: 100, discount: 0, surcharge: 50, total: 150, commission_amount: 0,
  status: "completed", cancellation_status: "none",
  customer: null, user: { id: 1, name: "Diana" },
  items: [{
    id: 10, product_id: 5, product_name: "Figura", quantity: 1, price: 100, total: 100,
    discount_amount: 0, surcharge_amount: 50, surcharge_reason: "escasez", surcharge_note: "última",
    product: { id: 5, name: "Figura", sku: "F-1" }, created_at: "2026-09-29T18:00:00Z",
  }],
  payments: [{ id: 1, payment_method_id: 1, terminal_id: null, amount: 150, commission_amount: 0, payment_method: { id: 1, name: "Efectivo" }, created_at: "2026-09-29T18:00:00Z" }],
  sold_at: "2026-09-29T18:00:00Z", created_at: "2026-09-29T18:00:00Z",
  ...over,
} as SaleDetail);

describe("buildGroupedProducts con aumentos", () => {
  it("una venta solo con aumento cuenta el neto y guarda el detalle", () => {
    const rows = buildGroupedProducts([sale({})], [], ["all"], "2026-09-01", "2026-09-30", false);
    const row = rows.find(r => r.name === "Figura")!;
    expect(row.total_revenue).toBe(150);
    expect(row.surcharge_total).toBe(50);
    expect(row.surcharge_breakdown?.escasez).toEqual({ cash: 50, card: 0 });
    expect(row.surcharge_entries?.[0]).toEqual(expect.objectContaining({ sale_id: 1, cashier: "Diana", reason: "escasez", note: "última", amount: 50 }));
  });
});

describe("buildGroupedProducts — neto por renglón", () => {
  const item = (over: Record<string, unknown>) => ({
    id: 10, product_id: 5, product_name: "Figura", quantity: 2, price: 100, total: 200,
    product: { id: 5, name: "Figura", sku: "F-1" }, created_at: "2026-09-29T18:00:00Z", ...over,
  });

  it("venta v2 con cancelación parcial cuenta el neto del renglón que queda", () => {
    const s = sale({
      subtotal: 200, discount: 40, surcharge: 0, total: 160, cancellation_status: "partial",
      items: [item({ discount_amount: 40, benefit_type: "discount", discount_reason: "danado" })] as never,
      cancelled_items: [{ product_id: 5, name: "Figura", sku: "F-1", quantity: 1, price: 100, line_total: 80 }],
      payments: [],
    });
    const row = buildGroupedProducts([s], [], ["all"], "2026-09-01", "2026-09-30", false).find(r => r.name === "Figura")!;
    expect(row.total_revenue).toBe(160);
  });

  it("venta legacy (descuento global) sigue prorrateando", () => {
    const s = sale({
      subtotal: 560, discount: 50, surcharge: 0, total: 510,
      items: [item({ quantity: 2, price: 280, total: 560, discount_amount: 0 })] as never,
      payments: [],
    });
    const row = buildGroupedProducts([s], [], ["all"], "2026-09-01", "2026-09-30", false).find(r => r.name === "Figura")!;
    expect(row.total_revenue).toBe(510);
  });
});
