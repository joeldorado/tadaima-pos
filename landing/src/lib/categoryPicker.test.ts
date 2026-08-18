import { describe, expect, it } from "vitest";
import { joinCategoryNames, normalizeCategoryText, pickCategoryMatches } from "./categoryPicker";

const CATS = [
  { id: 1, name: "Figuras", active: true },
  { id: 2, name: "Funko", active: true },
  { id: 3, name: "Manga extranjero", active: true },
  { id: 4, name: "Cómics", active: false },
  { id: 5, name: "amiibos", active: true },
  { id: 6, name: "Decoración", active: true },
];

describe("pickCategoryMatches", () => {
  it("sin texto lista todas las no seleccionadas, activas primero y alfabético", () => {
    const { matches, exact } = pickCategoryMatches(CATS, "", [2]);
    expect(matches.map(c => c.name)).toEqual(["amiibos", "Decoración", "Figuras", "Manga extranjero", "Cómics"]);
    expect(exact).toBe(false);
  });

  it("filtra sin acentos ni mayúsculas, 'empieza con' antes que 'contiene'", () => {
    const { matches } = pickCategoryMatches(CATS, "co", []);
    expect(matches.map(c => c.name)).toEqual(["Cómics", "Decoración"]);
  });

  it("excluye las ya seleccionadas de la lista", () => {
    const { matches } = pickCategoryMatches(CATS, "f", [1]);
    expect(matches.map(c => c.name)).toEqual(["Funko"]);
  });

  it("exact=true si el texto ya existe (aunque esté seleccionada) → no ofrecer crear", () => {
    expect(pickCategoryMatches(CATS, "  funko ", [2]).exact).toBe(true);
    expect(pickCategoryMatches(CATS, "COMICS", []).exact).toBe(true);
    expect(pickCategoryMatches(CATS, "Funkos", []).exact).toBe(false);
  });
});

describe("helpers", () => {
  it("normalizeCategoryText quita acentos y espacios", () => {
    expect(normalizeCategoryText("  Cómics  ")).toBe("comics");
  });
  it("joinCategoryNames une con · y cae a 'Sin categoría'", () => {
    expect(joinCategoryNames(["Funko", "Figuras"])).toBe("Funko · Figuras");
    expect(joinCategoryNames([" ", ""])).toBe("Sin categoría");
  });
});
