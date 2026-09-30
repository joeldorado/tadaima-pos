import { describe, expect, it } from "vitest";
import { isEmptyMangaBatchDraft } from "./mangaBatchDraft";

const empty = {
  series: { nombre: "", editorial: "", genero: "", precioPublico: "", margenPct: "30" },
  prices: { price1: "", price2: "", price3: "", price4: "", price5: "" },
  warehouseGroups: [],
  tomos: [{ id: "a1", numero: "", isbn: "", status: "idle" }],
};

describe("isEmptyMangaBatchDraft", () => {
  it("el alta recién abierta (1 renglón vacío, id aleatorio) está vacía", () => {
    expect(isEmptyMangaBatchDraft(empty)).toBe(true);
    expect(isEmptyMangaBatchDraft({ ...empty, tomos: [{ id: "zz", numero: "", isbn: "", status: "idle" }] })).toBe(true);
  });

  it("cualquier captura cuenta", () => {
    expect(isEmptyMangaBatchDraft({ ...empty, series: { ...empty.series, nombre: "One Piece" } })).toBe(false);
    expect(isEmptyMangaBatchDraft({ ...empty, series: { ...empty.series, margenPct: "35" } })).toBe(false);
    expect(isEmptyMangaBatchDraft({ ...empty, series: { ...empty.series, categoryIds: [3] } })).toBe(false);
    expect(isEmptyMangaBatchDraft({ ...empty, prices: { ...empty.prices, price1: "150" } })).toBe(false);
    expect(isEmptyMangaBatchDraft({ ...empty, tomos: [{ id: "a", numero: "1", isbn: "", status: "idle" }] })).toBe(false);
    expect(isEmptyMangaBatchDraft({ ...empty, tomos: [...empty.tomos, { id: "b", numero: "", isbn: "", status: "idle" }] })).toBe(false);
    expect(isEmptyMangaBatchDraft({ ...empty, warehouseGroups: [{ id: "g" }] })).toBe(false);
  });

  it("tener la foto de un tomo también cuenta", () => {
    expect(isEmptyMangaBatchDraft(empty, true)).toBe(false);
  });
});
