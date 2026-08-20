import { describe, it, expect } from "vitest";
import { generateBarcode, generatePlaceholderSku } from "./barcode";

describe("generateBarcode", () => {
  it("genera 13 dígitos con el prefijo interno 200", () => {
    const code = generateBarcode();
    expect(code).toMatch(/^200\d{10}$/);
  });
});

describe("generatePlaceholderSku", () => {
  it("tiene el prefijo PEND- y respeta el límite de 100 caracteres del backend", () => {
    const sku = generatePlaceholderSku();
    expect(sku).toMatch(/^PEND-[0-9A-Z]+-[0-9A-Z]{6}$/);
    expect(sku.length).toBeLessThan(100);
  });

  it("no repite valores en 1000 llamadas seguidas", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generatePlaceholderSku());
    }
    expect(seen.size).toBe(1000);
  });
});
