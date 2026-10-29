import { describe, it, expect } from "vitest";
import {
  buildActivityParams,
  buildActivitySummaryParams,
  effectiveGroups,
  filtersEqual,
  filtersFromSearchParams,
  filtersToSearchParams,
  type ActivityFilterState,
} from "./activityParams";

const defaults = { from: "2026-09-29", to: "2026-10-29" };

const state: ActivityFilterState = {
  from: defaults.from,
  to: defaults.to,
  productIds: [],
  userId: null,
  storeId: null,
  groups: [],
  search: "",
  includeNoise: false,
  page: 1,
  perPage: 50,
  armed: true,
};

describe("effectiveGroups", () => {
  it("vacío = sin filtro de tipo", () => {
    expect(effectiveGroups([])).toBeNull();
  });
  it("todos marcados = sin filtro", () => {
    expect(effectiveGroups(["stock", "producto", "venta", "caja", "paquete", "preventa", "insumo", "sistema", "impresion"])).toBeNull();
  });
  it("respeta el orden canónico", () => {
    expect(effectiveGroups(["venta", "stock"])).toEqual(["stock", "venta"]);
  });
});

describe("buildActivityParams", () => {
  it("default: rango + página, sin filtro de tipo", () => {
    expect(buildActivityParams(state)).toEqual({ from: "2026-09-29", to: "2026-10-29", page: 1, per_page: 50 });
  });
  it("manda producto, usuario, tienda, búsqueda y ruido; ordena los ids", () => {
    expect(buildActivityParams({ ...state, productIds: [30, 10], userId: 4, storeId: 2, search: "  ygo ", includeNoise: true, page: 3 }))
      .toMatchObject({ product_ids: [10, 30], user_id: 4, store_id: 2, search: "ygo", include_noise: 1, page: 3 });
  });
  it("el resumen no lleva paginación", () => {
    const p = buildActivitySummaryParams(state);
    expect(p).not.toHaveProperty("page");
    expect(p).not.toHaveProperty("per_page");
  });
});

describe("URL ⇄ estado", () => {
  it("ida y vuelta conserva los filtros y omite los defaults", () => {
    const s: ActivityFilterState = { ...state, productIds: [3349], userId: 14, groups: ["stock", "venta"], search: "booster", includeNoise: true, page: 2, perPage: 100, from: "2026-10-01" };
    const sp = filtersToSearchParams(s, defaults, new URLSearchParams("tab=actividad"));
    expect(sp.get("tab")).toBe("actividad");
    expect(sp.get("to")).toBeNull();
    expect(sp.get("from")).toBe("2026-10-01");
    expect(sp.get("go")).toBe("1");
    expect(filtersFromSearchParams(sp, defaults)).toEqual(s);
  });
  it("sin «go» en la URL la pestaña entra desarmada (no consulta)", () => {
    expect(filtersFromSearchParams(new URLSearchParams("tab=actividad"), defaults).armed).toBe(false);
  });
  it("ignora basura en la URL", () => {
    const sp = new URLSearchParams("p=abc,0,7&g=stock,nope&pp=33&page=-4");
    const s = filtersFromSearchParams(sp, defaults);
    expect(s.productIds).toEqual([7]);
    expect(s.groups).toEqual(["stock"]);
    expect(s.perPage).toBe(50);
    expect(s.page).toBe(1);
  });
});

describe("filtersEqual", () => {
  it("ignora la página y el tamaño, compara lo demás", () => {
    expect(filtersEqual(state, { ...state, page: 3 })).toBe(true);
    expect(filtersEqual(state, { ...state, search: "x" })).toBe(false);
    expect(filtersEqual(state, { ...state, groups: ["stock", "producto", "venta", "caja", "paquete", "preventa", "insumo", "sistema", "impresion"] })).toBe(true);
    expect(filtersEqual(state, { ...state, groups: ["stock"] })).toBe(false);
  });
});
