import { describe, it, expect } from "vitest";
import { isSkuMatch, normalizeCode, shouldLookupCode } from "./productCode";

describe("normalizeCode", () => {
  it("quita espacios y pasa a mayúsculas", () => {
    expect(normalizeCode("  abc-123 ")).toBe("ABC-123");
  });
  it("tolera null/undefined", () => {
    expect(normalizeCode(null)).toBe("");
    expect(normalizeCode(undefined)).toBe("");
  });
});

describe("shouldLookupCode", () => {
  it("no consulta con menos de 3 caracteres", () => {
    expect(shouldLookupCode("")).toBe(false);
    expect(shouldLookupCode(" ab ")).toBe(false);
    expect(shouldLookupCode("abc")).toBe(true);
  });
  it("ignora los placeholders PEND- (los genera el sistema)", () => {
    expect(shouldLookupCode("PEND-20260925-X1")).toBe(false);
    expect(shouldLookupCode("pend-abc")).toBe(false);
  });
  it("consulta códigos de barras normales", () => {
    expect(shouldLookupCode("196214108417")).toBe(true);
  });
});

describe("isSkuMatch", () => {
  it("compara sin distinguir mayúsculas ni espacios", () => {
    expect(isSkuMatch({ sku: "ABC-196214" }, " abc-196214")).toBe(true);
  });
  it("false cuando la coincidencia fue por código de barras", () => {
    expect(isSkuMatch({ sku: "OP-001" }, "196214108417")).toBe(false);
  });
});
