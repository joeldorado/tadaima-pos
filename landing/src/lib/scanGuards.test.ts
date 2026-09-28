import { describe, expect, it } from "vitest";
import { classifyCashEnter, looksLikeProductCode } from "./scanGuards";

describe("looksLikeProductCode", () => {
  it("SKUs y códigos de barras cuentan como código", () => {
    expect(looksLikeProductCode("DEMO-ELE-001")).toBe(true);
    expect(looksLikeProductCode("7501234500011")).toBe(true);
    expect(looksLikeProductCode("cartap10")).toBe(true);
    expect(looksLikeProductCode("  7501234500011  ")).toBe(true);
  });

  it("nombres y términos cortos no", () => {
    expect(looksLikeProductCode("goku")).toBe(false);      // sin dígitos
    expect(looksLikeProductCode("tomo 5")).toBe(false);    // con espacio
    expect(looksLikeProductCode("750")).toBe(false);       // muy corto
    expect(looksLikeProductCode("")).toBe(false);
  });
});

describe("classifyCashEnter", () => {
  it("montos normales y el Enter vacío (pago exacto) cobran", () => {
    expect(classifyCashEnter("500", "500")).toBe("pay");
    expect(classifyCashEnter("1500.50", "1500.50")).toBe("pay");
    expect(classifyCashEnter("999999", "999999")).toBe("pay");
    expect(classifyCashEnter("", "")).toBe("pay");
    expect(classifyCashEnter("", "200")).toBe("pay");       // tecleado hace rato
  });

  it("un código de barras numérico tecleado en el efectivo es un escaneo", () => {
    expect(classifyCashEnter("7501234500011", "7501234500011")).toBe("scan");
    expect(classifyCashEnter("1234567", "1234567")).toBe("scan");
    expect(classifyCashEnter("", "7501234500011")).toBe("scan");
  });

  it("un SKU con letras es escaneo aunque el campo numérico quede vacío", () => {
    expect(classifyCashEnter("DEMO-ELE-001", "")).toBe("scan");
    expect(classifyCashEnter("cartap10", "10")).toBe("scan");
  });
});
