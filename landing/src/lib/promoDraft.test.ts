import { describe, expect, it } from "vitest";
import type { Promotion } from "@tadaima/api";
import {
  draftFromPromo, draftLabel, draftNamePrefix, draftToInput, emptyDraft, validateDetails, validateWhat,
  withReactivation,
} from "./promoDraft";

const ADMIN = { isAdmin: true, canManage: true, storeId: 1 };
const GERENTE = { isAdmin: false, canManage: true, storeId: 2 };

describe("emptyDraft", () => {
  it("arranca como 2x1, con los dos métodos de pago y sin fechas", () => {
    const d = emptyDraft();
    expect(d.kind).toBe("nxm");
    expect([d.buyN, d.payM]).toEqual(["2", "1"]);
    expect([d.allowCash, d.allowCard]).toEqual([true, true]);
    expect([d.startsAt, d.endsAt]).toEqual(["", ""]);
    expect(d.storeId).toBeNull();
  });
});

describe("validateWhat", () => {
  it("acepta 2x1 y 3x2", () => {
    expect(validateWhat(emptyDraft())).toBeNull();
    expect(validateWhat({ ...emptyDraft(), buyN: "3", payM: "2" })).toBeNull();
  });

  it("NxM: al menos 2 piezas y pagar menos de las que se lleva", () => {
    expect(validateWhat({ ...emptyDraft(), buyN: "1" })).toMatch(/al menos 2/);
    expect(validateWhat({ ...emptyDraft(), buyN: "2", payM: "2" })).toMatch(/menos/i);
    expect(validateWhat({ ...emptyDraft(), buyN: "2", payM: "0" })).toMatch(/menos/i);
  });

  it("mayoreo: desde 2 piezas y descuento mayor a cero", () => {
    const mayoreo = { ...emptyDraft(), kind: "qty_discount" as const };
    expect(validateWhat({ ...mayoreo, minQty: "1", perUnit: "10" })).toMatch(/2 piezas/);
    expect(validateWhat({ ...mayoreo, minQty: "5", perUnit: "" })).toMatch(/cuánto/i);
    expect(validateWhat({ ...mayoreo, minQty: "5", perUnit: "20" })).toBeNull();
  });
});

describe("validateDetails", () => {
  it("pide nombre", () => {
    expect(validateDetails({ ...emptyDraft(), name: "  " })).toMatch(/nombre/i);
  });

  it("pide al menos un método de pago", () => {
    expect(validateDetails({ ...emptyDraft(), name: "X", allowCash: false, allowCard: false })).toMatch(/pago/i);
  });

  it("la fecha de fin no puede ser antes del inicio", () => {
    expect(validateDetails({ ...emptyDraft(), name: "X", startsAt: "2026-10-10", endsAt: "2026-10-05" })).toMatch(/fin/i);
    expect(validateDetails({ ...emptyDraft(), name: "X", startsAt: "2026-10-10", endsAt: "2026-10-10" })).toBeNull();
  });
});

describe("draftToInput", () => {
  it("NxM manda solo los campos de su tipo y las fechas SIEMPRE (null si vacías)", () => {
    const input = draftToInput({ ...emptyDraft(), name: " 2x1 Mangas " }, ADMIN);
    expect(input).toEqual({
      name: "2x1 Mangas", type: "nxm", buy_n: 2, pay_m: 1,
      allow_cash: true, allow_card: true, starts_at: null, ends_at: null, priority: 0, store_id: null,
    });
  });

  it("mayoreo manda min_qty y discount_per_unit", () => {
    const input = draftToInput(
      { ...emptyDraft(), name: "Mayoreo", kind: "qty_discount", minQty: "5", perUnit: "20.5", startsAt: "2026-10-03" },
      ADMIN,
    );
    expect(input).toMatchObject({ type: "qty_discount", min_qty: 5, discount_per_unit: 20.5, starts_at: "2026-10-03" });
    expect(input).not.toHaveProperty("buy_n");
  });

  it("el admin elige tienda; el gerente queda en la suya", () => {
    expect(draftToInput({ ...emptyDraft(), name: "X", storeId: 4 }, ADMIN).store_id).toBe(4);
    expect(draftToInput({ ...emptyDraft(), name: "X", storeId: 4 }, GERENTE).store_id).toBe(2);
  });
});

describe("withReactivation", () => {
  const input = draftToInput({ ...emptyDraft(), name: "X" }, ADMIN);
  const HOY = "2026-10-03";

  it("una promo terminada vuelve a activa si se le quita o se le extiende la fecha de fin", () => {
    expect(withReactivation({ status: "expired" }, input, HOY).status).toBe("active");
    expect(withReactivation({ status: "expired" }, { ...input, ends_at: "2026-10-03" }, HOY).status).toBe("active");
    expect(withReactivation({ status: "expired" }, { ...input, ends_at: "2026-11-01" }, HOY).status).toBe("active");
  });

  it("si la fecha de fin sigue en el pasado no cambia el estado", () => {
    expect(withReactivation({ status: "expired" }, { ...input, ends_at: "2026-09-01" }, HOY)).not.toHaveProperty("status");
  });

  it("no toca promos activas ni pausadas", () => {
    expect(withReactivation({ status: "active" }, input, HOY)).toBe(input);
    expect(withReactivation({ status: "paused" }, input, HOY)).toBe(input);
  });
});

describe("draftFromPromo y draftLabel", () => {
  const promo: Promotion = {
    id: 3, name: "Mayoreo cables", type: "qty_discount", buy_n: null, pay_m: null,
    min_qty: 5, discount_per_unit: 20, allow_cash: true, allow_card: false,
    // 15 de octubre 23:59 Tijuana.
    starts_at: null, ends_at: "2026-10-16T06:59:59Z", status: "active", priority: 2, store_id: 4,
  };

  it("prellena desde una promo existente con el día de negocio", () => {
    const d = draftFromPromo(promo);
    expect(d).toMatchObject({
      kind: "qty_discount", name: "Mayoreo cables", minQty: "5", perUnit: "20",
      allowCash: true, allowCard: false, startsAt: "", endsAt: "2026-10-15", priority: "2", storeId: 4,
    });
  });

  it("la etiqueta corta sale del borrador", () => {
    expect(draftLabel(emptyDraft())).toBe("2x1");
    expect(draftLabel(draftFromPromo(promo))).toBe("5+ pzas −$20 c/u");
  });

  it("el nombre sugerido arranca con la promo, o con 'Mayoreo'", () => {
    expect(draftNamePrefix({ ...emptyDraft(), buyN: "3", payM: "2" })).toBe("3x2");
    expect(draftNamePrefix(draftFromPromo(promo))).toBe("Mayoreo");
  });
});
