import { describe, expect, it } from "vitest";
import { SheetBuilder, cellMap, colLetter, formulaText, resolveResults } from "./excelSheetModel";

describe("colLetter", () => {
  it("convierte el número de columna a letra de Excel", () => {
    expect([1, 26, 27, 44].map(colLetter)).toEqual(["A", "Z", "AA", "AR"]);
  });
});

describe("formulaText", () => {
  it("suma de un rango (una sola fila se escribe sin rango)", () => {
    expect(formulaText({ op: "sum", col: 4, r1: 10, r2: 162 })).toBe("SUM(D10:D162)");
    expect(formulaText({ op: "sum", col: 23, r1: 22, r2: 22 })).toBe("SUM(W22)");
  });

  it("suma y resta de celdas", () => {
    expect(formulaText({ op: "add", refs: [{ row: 5, col: 4 }, { row: 5, col: 6 }, { row: 5, col: 8 }] })).toBe("D5+F5+H5");
    expect(formulaText({ op: "sub", refs: [{ row: 10, col: 12 }, { row: 10, col: 14 }, { row: 10, col: 15 }] })).toBe("L10-N10-O10");
  });

  it("celda por constante, sin basura de punto flotante", () => {
    expect(formulaText({ op: "mulConst", ref: { row: 10, col: 14 }, k: 0.16 })).toBe("N10*0.16");
    expect(formulaText({ op: "mulConst", ref: { row: 10, col: 14 }, k: 0.14000000000000001 })).toBe("N10*0.14");
  });
});

describe("resolveResults", () => {
  it("calcula el valor de cada fórmula desde las celdas del modelo, en cadena", () => {
    const b = new SheetBuilder();
    b.set(10, 3, 100); b.set(10, 4, 150); b.set(10, 5, { op: "sub", refs: [{ row: 10, col: 4 }, { row: 10, col: 3 }] });
    b.set(11, 3, 20);  b.set(11, 4, 200); b.set(11, 5, { op: "sub", refs: [{ row: 11, col: 4 }, { row: 11, col: 3 }] });
    b.set(12, 5, { op: "sum", col: 5, r1: 10, r2: 11 });
    b.set(5, 2, { op: "add", refs: [{ row: 12, col: 5 }, { row: 10, col: 4 }] });
    b.set(13, 5, { op: "mulConst", ref: { row: 12, col: 5 }, k: 0.16 });

    const results = resolveResults(b.build());

    expect(results.get("E10")).toBe(50);
    expect(results.get("E11")).toBe(180);
    expect(results.get("E12")).toBe(230);
    expect(results.get("B5")).toBe(380);
    expect(results.get("E13")).toBeCloseTo(36.8);
  });

  it("texto o celda inexistente cuenta como 0", () => {
    const b = new SheetBuilder();
    b.set(1, 1, "Producto");
    b.set(2, 1, { op: "add", refs: [{ row: 1, col: 1 }, { row: 9, col: 9 }] });
    expect(resolveResults(b.build()).get("A2")).toBe(0);
  });
});

describe("SheetBuilder", () => {
  it("la última escritura de una celda gana y el alto de fila conserva el mayor", () => {
    const b = new SheetBuilder();
    b.set(1, 1, "a"); b.set(1, 1, "b");
    b.rowHeight(1, 25); b.rowHeight(1, 18);
    const model = b.build();
    expect(cellMap(model).get("A1")?.value).toBe("b");
    expect(model.cells).toHaveLength(1);
    expect(model.rowHeights[1]).toBe(25);
  });
});
