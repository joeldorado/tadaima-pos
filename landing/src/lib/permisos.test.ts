import { describe, it, expect } from "vitest";
import {
  canSeeCost,
  isMasterAdmin,
  isEligibleForPermManagement,
} from "./permisos";

// ─── canSeeCost ───────────────────────────────────────────────────────────────
describe("canSeeCost", () => {
  it("cajero CON permiso → puede ver costo real", () => {
    expect(canSeeCost(true)).toBe(true);
  });

  it("cajero SIN permiso → no puede ver costo real", () => {
    expect(canSeeCost(false)).toBe(false);
  });

  it("gerente CON permiso → puede ver costo real", () => {
    expect(canSeeCost(true)).toBe(true);
  });

  it("gerente SIN permiso → no puede ver costo real", () => {
    expect(canSeeCost(false)).toBe(false);
  });
});

// ─── isMasterAdmin ────────────────────────────────────────────────────────────
describe("isMasterAdmin", () => {
  it("super_admin es master admin", () => {
    expect(isMasterAdmin(["super_admin"])).toBe(true);
  });

  it("owner es master admin", () => {
    expect(isMasterAdmin(["owner"])).toBe(true);
  });

  it("dueño es master admin (variante en español)", () => {
    expect(isMasterAdmin(["dueño"])).toBe(true);
  });

  it("admin regular NO es master admin", () => {
    expect(isMasterAdmin(["admin"])).toBe(false);
  });

  it("cajero NO es master admin", () => {
    expect(isMasterAdmin(["cajero"])).toBe(false);
  });

  it("gerente NO es master admin", () => {
    expect(isMasterAdmin(["gerente"])).toBe(false);
  });

  it("es case-insensitive — OWNER cuenta como master", () => {
    expect(isMasterAdmin(["OWNER"])).toBe(true);
  });
});

// ─── isEligibleForPermManagement ─────────────────────────────────────────────
describe("isEligibleForPermManagement — quién aparece en la lista de permisos", () => {
  it("cajero SÍ aparece en lista (puede configurarse)", () => {
    expect(isEligibleForPermManagement(["cajero"])).toBe(true);
  });

  it("gerente SÍ aparece en lista (puede configurarse)", () => {
    expect(isEligibleForPermManagement(["gerente"])).toBe(true);
  });

  it("admin regular SÍ aparece en lista (puede configurarse)", () => {
    expect(isEligibleForPermManagement(["admin"])).toBe(true);
  });

  it("super_admin NO aparece — tiene acceso total, no se configura", () => {
    expect(isEligibleForPermManagement(["super_admin"])).toBe(false);
  });

  it("owner NO aparece — tiene acceso total, no se configura", () => {
    expect(isEligibleForPermManagement(["owner"])).toBe(false);
  });

  it("dueño NO aparece — tiene acceso total, no se configura", () => {
    expect(isEligibleForPermManagement(["dueño"])).toBe(false);
  });

  it("usuario con múltiples roles donde uno es master → no aparece", () => {
    expect(isEligibleForPermManagement(["admin", "super_admin"])).toBe(false);
  });
});
