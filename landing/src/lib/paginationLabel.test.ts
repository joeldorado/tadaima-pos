import { describe, it, expect } from "vitest";
import { paginationRangeLabel } from "./paginationLabel";

describe("paginationRangeLabel", () => {
  it("primera página completa", () => {
    expect(
      paginationRangeLabel({ pageIndex: 0, pageSize: 20, rowsOnPage: 20, total: 2803, pageCount: 141 }),
    ).toBe("Mostrando 1–20 de 2,803 · página 1 de 141");
  });

  it("página intermedia", () => {
    expect(
      paginationRangeLabel({ pageIndex: 2, pageSize: 50, rowsOnPage: 50, total: 2206, pageCount: 45 }),
    ).toBe("Mostrando 101–150 de 2,206 · página 3 de 45");
  });

  it("última página incompleta: el rango termina en el total", () => {
    expect(
      paginationRangeLabel({ pageIndex: 140, pageSize: 20, rowsOnPage: 3, total: 2803, pageCount: 141 }),
    ).toBe("Mostrando 2,801–2,803 de 2,803 · página 141 de 141");
  });

  it("sin resultados: 0–0 de 0 y al menos una página", () => {
    expect(
      paginationRangeLabel({ pageIndex: 0, pageSize: 20, rowsOnPage: 0, total: 0, pageCount: 0 }),
    ).toBe("Mostrando 0–0 de 0 · página 1 de 1");
  });
});
