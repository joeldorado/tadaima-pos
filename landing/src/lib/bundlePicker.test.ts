import { describe, expect, it } from "vitest";
import type { ProductLight } from "@tadaima/api";
import { filterPickerPool, isPickable, pickerDisplayName, visibleStock } from "./bundlePicker";

const base: ProductLight = {
  id: 1, name: "Figura Goku", sku: "FIG-1", barcode: null, active: true, category_id: 10, category_ids: [10],
  prices: { price_1: 100, price_2: null, price_3: null, price_4: null, price_5: null },
  image: null, allow_cash: true, allow_card: true, stock_total: 5, stock_bodega: 2, product_type: "product",
};
const p = (over: Partial<ProductLight>): ProductLight => ({ ...base, ...over });

describe("visibleStock", () => {
  it("con tienda suma Exhibición y Bodega", () => {
    expect(visibleStock(p({ stock_total: 5, stock_bodega: 2 }), true)).toEqual({ exh: 5, bod: 2, total: 7, assigned: true });
  });
  it("sin tienda solo cuenta el total global y nunca negativo", () => {
    expect(visibleStock(p({ stock_total: -3, stock_bodega: 9 }), false)).toEqual({ exh: 0, bod: 0, total: 0, assigned: true });
  });
  it("marca no asignado", () => {
    expect(visibleStock(p({ is_assigned: false, stock_total: 0 }), true).assigned).toBe(false);
  });
});

describe("isPickable", () => {
  it("excluye paquetes e inactivos", () => {
    expect(isPickable(p({}))).toBe(true);
    expect(isPickable(p({ product_type: "bundle" }))).toBe(false);
    expect(isPickable(p({ active: false }))).toBe(false);
    expect(isPickable(p({ product_type: "manga" }))).toBe(true);
  });
});

describe("filterPickerPool", () => {
  const pool = [
    p({ id: 1, name: "Zapato", sku: "Z-1", category_ids: [1], stock_total: 0, stock_bodega: 0 }),
    p({ id: 2, name: "Álbum", sku: "A-1", category_ids: [2] }),
    p({ id: 3, name: "Bocina", sku: "B-1", category_ids: [], category_id: null }),
    p({ id: 4, name: "Paquete X", sku: "PAQ-0001", product_type: "bundle" }),
    p({ id: 5, name: "Cable", sku: "C-1", category_ids: [1], active: false }),
  ];
  it("ordena A-Z (sin acentos) y manda sin stock al final; excluye paquetes e inactivos", () => {
    expect(filterPickerPool(pool, { query: "", categoryId: null, hasStore: true }).map(x => x.name)).toEqual(["Álbum", "Bocina", "Zapato"]);
  });
  it("filtra por texto en nombre o código", () => {
    expect(filterPickerPool(pool, { query: "b-1", categoryId: null, hasStore: true }).map(x => x.id)).toEqual([3]);
    expect(filterPickerPool(pool, { query: "album", categoryId: null, hasStore: true }).map(x => x.id)).toEqual([2]);
  });
  it("filtra por categoría y por 'sin categoría'", () => {
    expect(filterPickerPool(pool, { query: "", categoryId: 1, hasStore: true }).map(x => x.id)).toEqual([1]);
    expect(filterPickerPool(pool, { query: "", categoryId: "none", hasStore: true }).map(x => x.id)).toEqual([3]);
  });
});

describe("pickerDisplayName", () => {
  it("agrega el tomo cuando existe", () => {
    expect(pickerDisplayName({ name: "Naruto", volume_number: 3 })).toBe("Naruto Vol. 3");
    expect(pickerDisplayName({ name: "Naruto", volume_number: null })).toBe("Naruto");
  });
});
