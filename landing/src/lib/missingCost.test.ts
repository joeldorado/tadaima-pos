import { describe, it, expect } from "vitest";
import { buildMissingCostParams, MISSING_COST_PAGE_SIZE } from "./missingCost";

describe("buildMissingCostParams", () => {
  it("default: con stock, más piezas primero, sin tienda", () => {
    expect(buildMissingCostParams({ storeId: null, stockFilter: "con_stock", term: "", page: 1 })).toEqual({
      no_cost: true, type: "product", with_meta: true,
      per_page: MISSING_COST_PAGE_SIZE, page: 1, sort: "stock_desc",
    });
  });

  it("manda el chip, la búsqueda y la tienda (incluye no asignados)", () => {
    expect(buildMissingCostParams({ storeId: 3, stockFilter: "exhibicion", term: "goku", page: 2 })).toMatchObject({
      no_cost_stock: "exhibicion", search: "goku", store_id: 3, include_unassigned: true, page: 2,
    });
  });

  it("'todos' incluye agotados", () => {
    expect(buildMissingCostParams({ storeId: null, stockFilter: "todos", term: "", page: 1 }).no_cost_stock).toBe("todos");
  });
});
