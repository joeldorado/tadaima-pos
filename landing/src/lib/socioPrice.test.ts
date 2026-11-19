import { describe, expect, it } from "vitest";
import { repriceForSocio, repriceOnPaymentChange, socioBadge, socioOptionNote } from "./socioPrice";
import type { PriceLevel } from "@/types/pos";

const line = (priceLevel: PriceLevel, price_b: number | null = 90) => ({ id: priceLevel, priceLevel, product: { price_b } });

describe("repriceForSocio — carril automático Normal ↔ Socio", () => {
  it("sube a Socio solo las líneas en Normal que tienen precio Socio", () => {
    const out = repriceForSocio([line("a"), line("a", null), line("c")], "b");
    expect(out.map(l => l.priceLevel)).toEqual(["b", "a", "c"]);
  });

  it("baja a Normal las líneas en Socio y respeta mayoreo", () => {
    const out = repriceForSocio([line("b"), line("d")], "a");
    expect(out.map(l => l.priceLevel)).toEqual(["a", "d"]);
  });

  it("no crea objetos nuevos para las líneas que no cambian", () => {
    const same = line("a");
    expect(repriceForSocio([same], "a")[0]).toBe(same);
  });
});

describe("repriceOnPaymentChange — cambiar a un método que no es tarjeta", () => {
  it("socio activo: vuelve a precio Socio", () => {
    const out = repriceOnPaymentChange([line("a")], { socioEligible: true, isPreventa: false });
    expect(out[0]!.priceLevel).toBe("b");
  });

  it("socio activo en preventa: precio Normal", () => {
    const out = repriceOnPaymentChange([line("b")], { socioEligible: true, isPreventa: true });
    expect(out[0]!.priceLevel).toBe("a");
  });

  it("socio vencido o sin socio: conserva el precio Socio puesto a mano", () => {
    // Caso de tienda (2026-11-18): el cajero da precio Socio a un vencido y
    // cambia de Efectivo a Transferencia. Antes la línea volvía a Normal sin avisar.
    const items = [line("b"), line("a")];
    const out = repriceOnPaymentChange(items, { socioEligible: false, isPreventa: false });
    expect(out.map(l => l.priceLevel)).toEqual(["b", "a"]);
    expect(out).toBe(items);
  });
});

describe("socioBadge — etiqueta bajo el nombre del cliente", () => {
  it("inactivo sin precio manual", () => {
    expect(socioBadge({ eligible: false, isTarjeta: false, hasManualSocio: false }))
      .toEqual({ tone: "inactive", label: "Socio inactivo · precio normal" });
  });

  it("inactivo con precio Socio puesto a mano", () => {
    expect(socioBadge({ eligible: false, isTarjeta: false, hasManualSocio: true }))
      .toEqual({ tone: "inactive", label: "Socio inactivo · precio socio manual" });
  });

  it("activo con tarjeta y activo normal no cambian", () => {
    expect(socioBadge({ eligible: true, isTarjeta: true, hasManualSocio: false }).label).toBe("Precio normal · tarjeta");
    expect(socioBadge({ eligible: true, isTarjeta: false, hasManualSocio: false }).label).toBe("Precio socio aplicado");
  });
});

describe("socioOptionNote — texto de la opción Socio en el selector", () => {
  it("avisa que es manual solo con socio inactivo", () => {
    expect(socioOptionNote("b", { isSocio: true, eligible: false })).toBe(" · manual");
    expect(socioOptionNote("b", { isSocio: true, eligible: true })).toBe("");
    expect(socioOptionNote("b", { isSocio: false, eligible: false })).toBe("");
    expect(socioOptionNote("a", { isSocio: true, eligible: false })).toBe("");
  });
});
