import { describe, expect, it } from "vitest";
import type { SaleDetail } from "@tadaima/api";
import { buildGroupedProducts } from "./buildReportData";
import type { GroupedProduct } from "./reportTypes";
import {
  PRESALE_CATEGORY,
  UNCATEGORIZED,
  assignCategories,
  compareCategories,
  groupProductsByCategory,
} from "./reportCategories";

const row = (over: Partial<GroupedProduct>): GroupedProduct => ({
  id: 1, name: "X", sku: "X", sales_count: 1, total_quantity: 1, total_revenue: 100,
  payment_breakdown: {}, price_breakdown: {}, total_cost: 0, total_profit: 0, ...over,
});

describe("compareCategories", () => {
  it("ordena A-Z sin importar acentos ni mayúsculas", () => {
    expect(["manga", "Figuras", "Ánime", "Cómics"].sort(compareCategories)).toEqual(["Ánime", "Cómics", "Figuras", "manga"]);
  });

  it("deja Sin categoría y Preventas al final", () => {
    expect([PRESALE_CATEGORY, UNCATEGORIZED, "Zapatos", "Accesorios"].sort(compareCategories))
      .toEqual(["Accesorios", "Zapatos", UNCATEGORIZED, PRESALE_CATEGORY]);
  });
});

describe("assignCategories", () => {
  it("agrupa por la primera categoría y guarda todas", () => {
    const rows = [row({ base_product_id: 5 })];
    assignCategories(rows, new Map([[5, ["Manga", "Shonen"]]]));
    expect(rows[0]).toEqual(expect.objectContaining({ category: "Manga", categories: ["Manga", "Shonen"] }));
  });

  it("junta la misma categoría escrita distinto bajo el primer nombre", () => {
    const rows = [row({ base_product_id: 1 }), row({ base_product_id: 2 }), row({ base_product_id: 3 })];
    assignCategories(rows, new Map([[1, ["Cómics"]], [2, ["COMICS "]], [3, ["cómics"]]]));
    expect(rows.map(r => r.category)).toEqual(["Cómics", "Cómics", "Cómics"]);
    expect(rows[1]!.categories).toEqual(["COMICS "]);
  });

  it("producto sin categoría o borrado → Sin categoría; preventa → Preventas", () => {
    const rows = [
      row({ base_product_id: 7 }),
      row({ base_product_id: "del:Llavero" }),
      row({ id: 100_000_005, pre_sale_apartado: 0 }),
    ];
    assignCategories(rows, new Map());
    expect(rows.map(r => r.category)).toEqual([UNCATEGORIZED, UNCATEGORIZED, PRESALE_CATEGORY]);
  });
});

describe("groupProductsByCategory", () => {
  it("arma los grupos A-Z respetando el orden de los productos dentro", () => {
    const groups = groupProductsByCategory([
      row({ id: 1, category: "Manga" }),
      row({ id: 2, category: "Accesorios" }),
      row({ id: 3 }),
      row({ id: 4, category: "Manga" }),
    ]);
    expect(groups.map(g => [g.category, g.products.map(p => p.id)])).toEqual([
      ["Accesorios", [2]],
      ["Manga", [1, 4]],
      [UNCATEGORIZED, [3]],
    ]);
  });
});

describe("buildGroupedProducts con categorías", () => {
  const item = (id: number, name: string, qty: number, categories?: string[]) => ({
    id: id * 10, product_id: id, product_name: name, quantity: qty, price: 100, total: 100 * qty,
    product: { id, name, sku: `S-${id}`, ...(categories ? { categories } : {}) },
    created_at: "2026-10-03T18:00:00Z",
  });
  const sale = {
    id: 1, store_id: 1, user_id: 1, customer_id: null, draft_id: null,
    subtotal: 600, discount: 0, total: 600, commission_amount: 0,
    status: "completed", cancellation_status: "none", customer: null, user: { id: 1, name: "Diana" },
    items: [
      item(1, "Tomo 1", 3, ["Manga", "Shonen"]),
      item(2, "Llavero", 1),
      item(3, "Funda", 2, ["Accesorios"]),
    ],
    payments: [],
    sold_at: "2026-10-03T18:00:00Z", created_at: "2026-10-03T18:00:00Z",
  } as unknown as SaleDetail;

  it("ordena por categoría A-Z y luego por más vendidos", () => {
    const rows = buildGroupedProducts([sale], [], ["all"], "2026-10-01", "2026-10-31", false);
    expect(rows.map(r => [r.category, r.name])).toEqual([
      ["Accesorios", "Funda"],
      ["Manga", "Tomo 1"],
      [UNCATEGORIZED, "Llavero"],
    ]);
    expect(rows[1]!.categories).toEqual(["Manga", "Shonen"]);
  });

  it("una venta cancelada completa toma la categoría de lo cancelado", () => {
    const cancelled = {
      ...sale, id: 2, subtotal: 0, total: 0, status: "completed", cancellation_status: "full", items: [],
      cancelled_items: [{ product_id: 9, name: "Cargador", sku: "C-1", quantity: 1, price: 249, line_total: 249, categories: ["Electrónica"] }],
    } as unknown as SaleDetail;
    const row = buildGroupedProducts([cancelled], [], ["all"], "2026-10-01", "2026-10-31", false).find(r => r.name === "Cargador")!;
    expect(row.category).toBe("Electrónica");
  });
});
