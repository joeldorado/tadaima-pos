import { describe, it, expect } from "vitest";
import { isValidEmail, isValidPhone } from "./validation";

// ─── isValidEmail ─────────────────────────────────────────────────────────────
describe("isValidEmail", () => {
  it("acepta correos normales", () => {
    expect(isValidEmail("tienda@email.com")).toBe(true);
    expect(isValidEmail("dsd@gmail.com")).toBe(true);
    expect(isValidEmail("a.b+tag@sub.dominio.mx")).toBe(true);
  });

  it("acepta con espacios alrededor (se recortan)", () => {
    expect(isValidEmail("  tienda@email.com  ")).toBe(true);
  });

  it("rechaza formatos inválidos", () => {
    expect(isValidEmail("sin-arroba.com")).toBe(false);
    expect(isValidEmail("dos@@arrobas.com")).toBe(false);
    expect(isValidEmail("sin@tld")).toBe(false);
    expect(isValidEmail("con espacio@mail.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

// ─── isValidPhone ─────────────────────────────────────────────────────────────
describe("isValidPhone", () => {
  it("acepta 10 dígitos con o sin formato", () => {
    expect(isValidPhone("5512345678")).toBe(true);
    expect(isValidPhone("55 1234 5678")).toBe(true);
    expect(isValidPhone("(55) 1234-5678")).toBe(true);
  });

  it("acepta lada de país 52", () => {
    expect(isValidPhone("+52 55 1234 5678")).toBe(true);
    expect(isValidPhone("525512345678")).toBe(true);
  });

  it("rechaza números incompletos o basura", () => {
    expect(isValidPhone("55334")).toBe(false); // el caso del QA
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("55123456789")).toBe(false); // 11 dígitos sin lada 52
    expect(isValidPhone("abc1234567")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });
});
