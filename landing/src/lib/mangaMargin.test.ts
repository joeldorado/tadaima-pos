import { describe, expect, it } from "vitest";
import { costFromMargin, initialMarginInput, marginPayload, parseMarginPct } from "./mangaMargin";

describe("initialMarginInput", () => {
  it("sin margen del API (usuario sin permiso de costos o tomo sin costo) el campo va vacío", () => {
    expect(initialMarginInput(undefined)).toBe("");
    expect(initialMarginInput(null)).toBe("");
    expect(initialMarginInput(Number.NaN)).toBe("");
  });

  it("con margen muestra el número tal cual", () => {
    expect(initialMarginInput(30)).toBe("30");
    expect(initialMarginInput(32.6)).toBe("32.6");
  });
});

describe("parseMarginPct", () => {
  it("solo acepta un margen mayor a 0 y menor a 100", () => {
    expect(parseMarginPct("30")).toBe(30);
    expect(parseMarginPct("30.5")).toBe(30.5);
    expect(parseMarginPct("0")).toBeUndefined();
    expect(parseMarginPct("100")).toBeUndefined();
    expect(parseMarginPct("-5")).toBeUndefined();
    expect(parseMarginPct("")).toBeUndefined();
    expect(parseMarginPct("abc")).toBeUndefined();
  });
});

describe("marginPayload", () => {
  // Bug 2026-10-03: el modal mandaba `profit_margin_percent: 0` con el campo
  // vacío y el backend guardaba costo = precio público.
  it("sin margen válido NO manda la llave (el backend conserva el margen del tomo)", () => {
    for (const raw of ["", "undefined", "null", "abc", "0", "-5", "100"]) {
      expect(marginPayload(raw)).toEqual({});
      expect("profit_margin_percent" in marginPayload(raw)).toBe(false);
    }
  });

  it("con margen válido lo manda", () => {
    expect(marginPayload("30")).toEqual({ profit_margin_percent: 30 });
    expect(marginPayload("30.5")).toEqual({ profit_margin_percent: 30.5 });
  });
});

describe("costFromMargin", () => {
  it("costo = precio A × (1 − margen/100)", () => {
    expect(costFromMargin("159", "30")).toBe(111.3);
    expect(costFromMargin("179", "30")).toBe(125.3);
    expect(costFromMargin("200", "50")).toBe(100);
  });

  it("sin margen o sin precio válido no hay costo que mostrar", () => {
    expect(costFromMargin("159", "")).toBeNull();
    expect(costFromMargin("159", "0")).toBeNull();
    expect(costFromMargin("", "30")).toBeNull();
    expect(costFromMargin("0", "30")).toBeNull();
  });
});
