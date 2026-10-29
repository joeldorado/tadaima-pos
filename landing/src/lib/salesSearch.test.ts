import { describe, it, expect } from "vitest";
import { normalizeSalesQuery, saleItemMatchesQuery, saleItemSearchTerms } from "./salesSearch";

// Caso real (2026-10-29): "DBS premium card collection", SKU 810059789340.
const dbs = {
  product: { name: "DBS premium card collection", sku: "810059789340" },
  product_name: "DBS premium card collection",
  product_sku: "810059789340",
};

describe("normalizeSalesQuery", () => {
  it("quita espacios sobrantes, acentos y mayúsculas", () => {
    expect(normalizeSalesQuery("  Colección DBS ")).toBe("coleccion dbs");
    expect(normalizeSalesQuery("810059789340 ")).toBe("810059789340");
  });
});

describe("saleItemSearchTerms", () => {
  it("junta nombre y SKU actuales, snapshot y catálogo sin repetir", () => {
    const terms = saleItemSearchTerms(
      { product: { name: "Nombre nuevo", sku: "SKU-NUEVO" }, product_name: "Nombre viejo", product_sku: "810059789340" },
      { name: "Nombre nuevo", sku: "SKU-NUEVO" },
    );
    expect(terms).toEqual(["nombre nuevo", "nombre viejo", "sku-nuevo", "810059789340"]);
  });

  it("ignora valores vacíos o nulos", () => {
    expect(saleItemSearchTerms({ product: null, product_name: "  ", product_sku: null })).toEqual([]);
  });
});

describe("saleItemMatchesQuery", () => {
  it("encuentra por nombre parcial y por código completo", () => {
    expect(saleItemMatchesQuery(dbs, normalizeSalesQuery("premium card"))).toBe(true);
    expect(saleItemMatchesQuery(dbs, normalizeSalesQuery("810059789340"))).toBe(true);
  });

  it("encuentra por el nombre o SKU que tenía al venderse aunque el producto haya cambiado", () => {
    const renombrado = {
      product: { name: "Dragon Ball Super premium card", sku: "DBS-PCC" },
      product_name: "DBS premium card collection",
      product_sku: "810059789340",
    };
    expect(saleItemMatchesQuery(renombrado, normalizeSalesQuery("DBS premium"))).toBe(true);
    expect(saleItemMatchesQuery(renombrado, normalizeSalesQuery("810059789340"))).toBe(true);
    // ...y también por el dato actual.
    expect(saleItemMatchesQuery(renombrado, normalizeSalesQuery("dbs-pcc"))).toBe(true);
  });

  it("usa el catálogo cargado aparte cuando la línea no trae producto ni snapshot", () => {
    const huerfana = { product: null, product_name: null, product_sku: null };
    expect(saleItemMatchesQuery(huerfana, "sleeves", { name: "Sleeves DBS", sku: "810158838390" })).toBe(true);
    expect(saleItemMatchesQuery(huerfana, "sleeves")).toBe(false);
  });

  it("no distingue acentos ni mayúsculas", () => {
    const item = { product: { name: "Colección Shenlong", sku: "SHENGLONG" } };
    expect(saleItemMatchesQuery(item, normalizeSalesQuery("COLECCION"))).toBe(true);
  });

  it("con búsqueda vacía todo coincide", () => {
    expect(saleItemMatchesQuery(dbs, "")).toBe(true);
  });

  it("no coincide con un texto que no está en ningún campo", () => {
    expect(saleItemMatchesQuery(dbs, normalizeSalesQuery("booster"))).toBe(false);
  });
});
