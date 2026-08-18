import { describe, it, expect } from "vitest";
import { buildProductsListParams } from "./useProducts";

/**
 * buildProductsListParams es la ÚNICA fuente del queryKey de la lista de
 * productos. El modo legacy (sin withMeta) lo comparte SalesPage/Caja: si sus
 * params cambian aunque sea en una llave, cambia el queryKey y se pierde el
 * cache persistido (IndexedDB) — estos tests lo fijan bit a bit.
 */
describe("buildProductsListParams — modo legacy (Caja/SalesPage)", () => {
  it("sin tienda ni búsqueda → undefined (página default del backend)", () => {
    expect(buildProductsListParams({})).toBeUndefined();
    expect(buildProductsListParams({ storeId: null })).toBeUndefined();
    expect(buildProductsListParams({ search: "" })).toBeUndefined();
  });

  it("búsqueda de 1 caracter NO viaja al server", () => {
    expect(buildProductsListParams({ search: "a" })).toBeUndefined();
  });

  it("con tienda → store_id + include_unassigned, sin per_page", () => {
    expect(buildProductsListParams({ storeId: 3 })).toEqual({
      store_id: 3,
      include_unassigned: true,
    });
  });

  it("búsqueda ≥2 chars → search + per_page 200 (histórico exacto)", () => {
    expect(buildProductsListParams({ search: " goku " })).toEqual({
      search: "goku",
      per_page: 200,
    });
  });

  it("tienda + búsqueda combinan", () => {
    expect(buildProductsListParams({ storeId: 2, search: "poster" })).toEqual({
      store_id: 2,
      include_unassigned: true,
      search: "poster",
      per_page: 200,
    });
  });

  it("las opciones admin se IGNORAN sin withMeta (no contaminan el queryKey)", () => {
    expect(
      buildProductsListParams({ storeId: 3, filter: "out_of_stock", page: 4, perPage: 20, categoryId: 9 }),
    ).toEqual({ store_id: 3, include_unassigned: true });
  });
});

describe("buildProductsListParams — modo admin (página Productos)", () => {
  it("base: with_meta + type + paginación con defaults", () => {
    expect(buildProductsListParams({ withMeta: true, type: "product" })).toEqual({
      with_meta: true,
      type: "product",
      page: 1,
      per_page: 100,
    });
  });

  it("tienda + búsqueda + categoría + chip low_stock combinan por AND", () => {
    expect(
      buildProductsListParams({
        withMeta: true,
        type: "product",
        storeId: 5,
        search: "goku",
        categoryId: 7,
        filter: "low_stock",
        threshold: 10,
        page: 2,
        perPage: 50,
      }),
    ).toEqual({
      with_meta: true,
      type: "product",
      store_id: 5,
      include_unassigned: true,
      search: "goku",
      category_id: 7,
      low_stock: true,
      threshold: 10,
      page: 2,
      per_page: 50,
    });
  });

  it("out_of_stock y promos mapean a sus flags", () => {
    expect(buildProductsListParams({ withMeta: true, filter: "out_of_stock" })).toEqual({
      with_meta: true,
      out_of_stock: true,
      page: 1,
      per_page: 100,
    });
    expect(buildProductsListParams({ withMeta: true, filter: "promos" })).toEqual({
      with_meta: true,
      has_promo: true,
      page: 1,
      per_page: 100,
    });
  });

  it("'no_category' mapea a no_category:true y combina con tienda/búsqueda/paginación", () => {
    expect(buildProductsListParams({ withMeta: true, type: "product", filter: "no_category" })).toEqual({
      with_meta: true,
      type: "product",
      no_category: true,
      page: 1,
      per_page: 100,
    });
    expect(
      buildProductsListParams({ withMeta: true, storeId: 3, search: "goku", filter: "no_category", page: 2, perPage: 20 }),
    ).toEqual({
      with_meta: true,
      store_id: 3,
      include_unassigned: true,
      search: "goku",
      no_category: true,
      page: 2,
      per_page: 20,
    });
  });

  it("'top' pisa la paginación: sort=top, per_page 50, page 1", () => {
    expect(
      buildProductsListParams({ withMeta: true, filter: "top", page: 5, perPage: 20 }),
    ).toEqual({
      with_meta: true,
      sort: "top",
      per_page: 50,
      page: 1,
    });
  });

  it("en admin la búsqueda NO manda el per_page 200 legacy (pagina normal)", () => {
    expect(
      buildProductsListParams({ withMeta: true, search: "goku", page: 1, perPage: 20 }),
    ).toEqual({
      with_meta: true,
      search: "goku",
      page: 1,
      per_page: 20,
    });
  });
});
