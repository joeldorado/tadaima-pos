import { describe, it, expect } from "vitest";
import {
  duplicateNoticeActions,
  duplicateNoticeTitle,
  findBatchDuplicateIds,
  findSkuOwner,
  isMangaMatch,
  showAskManagerHint,
} from "./duplicateCodeActions";

const ALL = { editProduct: true, editManga: true, stock: true };
const tomo = { sku: "9786071234567", product_type: "manga" };
const producto = { sku: "ABC-123", product_type: "product" };

describe("isMangaMatch", () => {
  it("solo product_type manga es tomo", () => {
    expect(isMangaMatch(tomo)).toBe(true);
    expect(isMangaMatch(producto)).toBe(false);
    expect(isMangaMatch({ product_type: null })).toBe(false);
  });
});

describe("duplicateNoticeTitle", () => {
  it("dice 'tomo' cuando el código es de un tomo", () => {
    expect(duplicateNoticeTitle(tomo, "9786071234567", "create")).toBe("Este código ya es de un tomo");
    expect(duplicateNoticeTitle(tomo, "OTRO", "create")).toBe("Este código ya es el código de barras de un tomo");
    expect(duplicateNoticeTitle(tomo, "x", "edit")).toBe("Un tomo ya usa este código");
  });
  it("mantiene los textos de siempre para productos", () => {
    expect(duplicateNoticeTitle(producto, " abc-123 ", "create")).toBe("Este código ya existe");
    expect(duplicateNoticeTitle(producto, "750100", "create")).toBe("Este código ya es el código de barras de otro producto");
    expect(duplicateNoticeTitle(producto, "x", "edit")).toBe("Otro producto ya usa este código");
  });
});

describe("duplicateNoticeActions", () => {
  it("un tomo ofrece editar tomo y cambiar existencia", () => {
    expect(duplicateNoticeActions(tomo, { mode: "create", canEdit: true, handlers: ALL })).toEqual(["edit-manga", "stock-manga"]);
  });
  it("un producto ofrece editar ese producto", () => {
    expect(duplicateNoticeActions(producto, { mode: "create", canEdit: true, handlers: ALL })).toEqual(["edit-product"]);
  });
  it("un tomo nunca se abre en el modal de producto", () => {
    const soloProducto = { editProduct: true, editManga: false, stock: false };
    expect(duplicateNoticeActions(tomo, { mode: "create", canEdit: true, handlers: soloProducto })).toEqual([]);
  });
  it("sin permiso o en edición no hay botones", () => {
    expect(duplicateNoticeActions(tomo, { mode: "create", canEdit: false, handlers: ALL })).toEqual([]);
    expect(duplicateNoticeActions(producto, { mode: "edit", canEdit: true, handlers: ALL })).toEqual([]);
  });
  it("solo los handlers que existen", () => {
    expect(duplicateNoticeActions(tomo, { mode: "create", canEdit: true, handlers: { editProduct: false, editManga: true, stock: false } }))
      .toEqual(["edit-manga"]);
  });
});

describe("showAskManagerHint", () => {
  it("cajero en alta con SKU tomado", () => {
    expect(showAskManagerHint(producto, "abc-123", { mode: "create", canEdit: false })).toBe(true);
  });
  it("no si solo coincide el código de barras, si puede editar o si es edición", () => {
    expect(showAskManagerHint(producto, "750100", { mode: "create", canEdit: false })).toBe(false);
    expect(showAskManagerHint(producto, "abc-123", { mode: "create", canEdit: true })).toBe(false);
    expect(showAskManagerHint(producto, "abc-123", { mode: "edit", canEdit: false })).toBe(false);
  });
});

describe("findSkuOwner", () => {
  it("regresa la coincidencia por SKU, no la de código de barras", () => {
    const porBarcode = { sku: "OTRO", product_type: "product" };
    expect(findSkuOwner([porBarcode, producto], "ABC-123")).toBe(producto);
    expect(findSkuOwner([porBarcode], "ABC-123")).toBeUndefined();
  });
});

describe("findBatchDuplicateIds", () => {
  it("marca todos los renglones con el mismo código (sin mayúsculas ni espacios)", () => {
    const ids = findBatchDuplicateIds([
      { id: "a", code: "978-1" },
      { id: "b", code: " 978-1 " },
      { id: "c", code: "978-2" },
      { id: "d", code: "isbn-x" },
      { id: "e", code: "ISBN-X" },
    ]);
    expect([...ids].sort()).toEqual(["a", "b", "d", "e"]);
  });
  it("ignora los vacíos", () => {
    expect(findBatchDuplicateIds([{ id: "a", code: "" }, { id: "b", code: "  " }]).size).toBe(0);
  });
});
