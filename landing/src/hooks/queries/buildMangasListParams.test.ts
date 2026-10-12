import { describe, it, expect } from "vitest";
import { buildMangasListParams, effectiveMangaSearch } from "./useMangas";

/**
 * buildMangasListParams arma los params (y por tanto el queryKey) del tab
 * Tomos. Bug de tienda 2026-10-12: el tab pedía UNA página sin filtros y
 * filtraba Agotados / Por agotarse / Sin categoría en el navegador sobre esas
 * 50 filas — "no despliega todos los mangas". Aquí se fija que página, tamaño
 * y chip viajan SIEMPRE al servidor.
 */
describe("buildMangasListParams", () => {
  it("base: siempre manda página y tamaño (paginación server-side)", () => {
    expect(buildMangasListParams({})).toEqual({ page: 1, per_page: 20 });
    expect(buildMangasListParams({ storeId: null, search: "" })).toEqual({ page: 1, per_page: 20 });
  });

  it("con tienda → store_id + include_unassigned", () => {
    expect(buildMangasListParams({ storeId: 4, page: 3, perPage: 50 })).toEqual({
      store_id: 4,
      include_unassigned: true,
      page: 3,
      per_page: 50,
    });
  });

  it("búsqueda de 1 caracter NO viaja; ≥2 sí, sin espacios", () => {
    expect(buildMangasListParams({ search: "a" })).toEqual({ page: 1, per_page: 20 });
    expect(buildMangasListParams({ search: " naruto " })).toEqual({
      search: "naruto",
      page: 1,
      per_page: 20,
    });
  });

  it("chip Agotados → out_of_stock", () => {
    expect(buildMangasListParams({ filter: "out_of_stock" })).toEqual({
      out_of_stock: true,
      page: 1,
      per_page: 20,
    });
  });

  it("chip Por agotarse → low_stock + threshold", () => {
    expect(buildMangasListParams({ filter: "low_stock", threshold: 10 })).toEqual({
      low_stock: true,
      threshold: 10,
      page: 1,
      per_page: 20,
    });
    expect(buildMangasListParams({ filter: "low_stock" })).toEqual({
      low_stock: true,
      page: 1,
      per_page: 20,
    });
  });

  it("chip Sin categoría → no_category", () => {
    expect(buildMangasListParams({ filter: "no_category" })).toEqual({
      no_category: true,
      page: 1,
      per_page: 20,
    });
  });

  it("los chips que solo existen en Productos (promos, top) no viajan", () => {
    // El chip activo es compartido entre pestañas: al pasar a Tomos con
    // "Promos" o "Más vendidos" encendido se lista todo, como antes.
    expect(buildMangasListParams({ filter: "promos" })).toEqual({ page: 1, per_page: 20 });
    expect(buildMangasListParams({ filter: "top" })).toEqual({ page: 1, per_page: 20 });
  });

  it("tienda + búsqueda + chip + página combinan", () => {
    expect(
      buildMangasListParams({
        storeId: 2,
        search: "panini",
        filter: "out_of_stock",
        page: 5,
        perPage: 100,
      }),
    ).toEqual({
      store_id: 2,
      include_unassigned: true,
      search: "panini",
      out_of_stock: true,
      page: 5,
      per_page: 100,
    });
  });

  it("el threshold solo viaja con el chip Por agotarse", () => {
    expect(buildMangasListParams({ filter: "out_of_stock", threshold: 10 })).toEqual({
      out_of_stock: true,
      page: 1,
      per_page: 20,
    });
    expect(buildMangasListParams({ threshold: 10 })).toEqual({ page: 1, per_page: 20 });
  });
});

describe("effectiveMangaSearch", () => {
  it("menos de 2 caracteres no es una búsqueda", () => {
    expect(effectiveMangaSearch(undefined)).toBe("");
    expect(effectiveMangaSearch("")).toBe("");
    expect(effectiveMangaSearch(" a ")).toBe("");
  });

  it("2 o más caracteres: el término sin espacios a los lados", () => {
    expect(effectiveMangaSearch("na")).toBe("na");
    expect(effectiveMangaSearch("  one piece ")).toBe("one piece");
  });

  it("es el mismo término que arma los params", () => {
    for (const term of ["a", "na", "  9786075286518 "]) {
      const params = buildMangasListParams({ search: term });
      expect(params.search ?? "").toBe(effectiveMangaSearch(term));
    }
  });
});
