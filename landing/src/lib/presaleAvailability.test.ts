import { describe, it, expect } from "vitest";
import { cartUnitLimit, storeAvailability } from "./presaleAvailability";

// Caso real de prod (2026-10-09, "PREVENTA Booster bundle 30th"): preorder_limit
// viejo en 1, 12 por tienda en CENTRO (1) y MACRO (2), las dos llenas.
const boosterBundle = {
  preorder_limit: 1,
  limit_per_customer: 1,
  store_limits: [
    { store_id: 1, limit_qty: 12 },
    { store_id: 2, limit_qty: 12 },
  ],
  reserved_by_store: { "1": 12, "2": 12 },
};

describe("storeAvailability", () => {
  it("usa el cupo de la tienda, no preorder_limit (24/1 → 12/12)", () => {
    expect(storeAvailability(boosterBundle, 1)).toEqual({
      unassigned: false, limit: 12, reserved: 12, remaining: 0,
    });
  });

  it("cupo parcial: resta solo lo reservado en ESA tienda", () => {
    const c = { store_limits: [{ store_id: 1, limit_qty: 12 }, { store_id: 2, limit_qty: 12 }], reserved_by_store: { "1": 5, "2": 12 } };
    expect(storeAvailability(c, 1)).toEqual({ unassigned: false, limit: 12, reserved: 5, remaining: 7 });
  });

  it("tienda sin entrada en store_limits = sin asignar (no vende)", () => {
    expect(storeAvailability(boosterBundle, 3)).toEqual({ unassigned: true, limit: 0, reserved: 0, remaining: 0 });
  });

  it("sin reserved_by_store (relación no cargada) cuenta 0 reservados", () => {
    const c = { store_limits: [{ store_id: 1, limit_qty: 4 }] };
    expect(storeAvailability(c, 1)).toEqual({ unassigned: false, limit: 4, reserved: 0, remaining: 4 });
  });

  it("sin tienda activa = sin asignar", () => {
    expect(storeAvailability(boosterBundle, undefined).unassigned).toBe(true);
  });

  it("nunca da disponible negativo si se reservó de más", () => {
    const c = { store_limits: [{ store_id: 1, limit_qty: 2 }], reserved_by_store: { "1": 5 } };
    expect(storeAvailability(c, 1).remaining).toBe(0);
  });
});

describe("cartUnitLimit", () => {
  it("toma limit_per_customer, no preorder_limit", () => {
    const catalog = { preorder_limit: 1, limit_per_customer: 3 };
    expect(cartUnitLimit(catalog)).toBe(3);
  });

  it("sin límite por cliente = sin tope en el carrito aunque haya preorder_limit", () => {
    const catalog = { preorder_limit: 1, limit_per_customer: null };
    expect(cartUnitLimit(catalog)).toBeUndefined();
  });
});
