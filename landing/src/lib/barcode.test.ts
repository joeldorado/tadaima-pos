import { describe, it, expect } from "vitest";
import {
  ean13CheckDigit, generateBarcode, generateEan13, generatePlaceholderSku, isValidEan13,
} from "./barcode";

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

// ─── EAN-13 (Paquetes) ───────────────────────────────────────────────────────
describe("ean13CheckDigit", () => {
  it("calcula el verificador de códigos conocidos", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(ean13CheckDigit("590123412345")).toBe(7);
  });

  it("la suma múltiplo de 10 da verificador 0 (no 10)", () => {
    // 1·1 + 0·3 + ... → 000000000000 suma 0 → (10 − 0) % 10 = 0
    expect(ean13CheckDigit("000000000000")).toBe(0);
  });

  it("revienta si no son exactamente 12 dígitos", () => {
    expect(() => ean13CheckDigit("12345678901")).toThrow();
    expect(() => ean13CheckDigit("1234567890123")).toThrow();
    expect(() => ean13CheckDigit("40063813339A")).toThrow();
  });
});

describe("isValidEan13", () => {
  it("acepta códigos de 13 dígitos con verificador correcto", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("5901234123457")).toBe(true);
  });

  it("rechaza verificador incorrecto", () => {
    expect(isValidEan13("4006381333932")).toBe(false);
  });

  it("rechaza 12 caracteres, letras, vacío, null y undefined", () => {
    expect(isValidEan13("400638133393")).toBe(false);
    expect(isValidEan13("400638133393A")).toBe(false);
    expect(isValidEan13("")).toBe(false);
    expect(isValidEan13(null)).toBe(false);
    expect(isValidEan13(undefined)).toBe(false);
  });
});

describe("generateEan13", () => {
  it("genera 13 dígitos con prefijo 200 y verificador válido", () => {
    const code = generateEan13();
    expect(code).toMatch(/^200\d{10}$/);
    expect(isValidEan13(code)).toBe(true);
  });

  it("respeta un prefijo distinto", () => {
    const code = generateEan13("299");
    expect(code).toMatch(/^299\d{10}$/);
    expect(isValidEan13(code)).toBe(true);
  });

  it("500 llamadas: todas válidas y casi todas distintas", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateEan13();
      expect(isValidEan13(code)).toBe(true);
      seen.add(code);
    }
    // Hay 4 dígitos de azar por milisegundo: alguna colisión es tolerable.
    expect(seen.size).toBeGreaterThan(450);
  });
});
