import { describe, it, expect } from "vitest";
import type { ActivityEvent } from "@tadaima/api";
import { describeEvent, formatChanges, formatDelta, formatEventTime, groupStyle } from "./activityFormat";

const base: ActivityEvent = {
  id: "mov:1",
  source: "mov",
  at: "2026-10-29T20:30:02.000000Z",
  user: { id: 1, name: "Pier" },
  group: "stock",
  action: "mov.ajuste",
  title: "Ajuste de stock",
  product: { id: 3349, name: "Booster", sku: "4012", type: "product", deleted: false },
  store: { id: 1, name: "Tadaima CENTRO" },
  warehouse: { id: 1, name: "Tadaima CENTRO", type: "store" },
  qty_delta: -2,
  stock_before: 10,
  stock_after: 8,
  reference: null,
  meta: { type: "ajuste", quantity: -2, notes: "Ajuste manual: 10 → 8" },
};

describe("formatDelta", () => {
  it("pone signo tipográfico", () => {
    expect(formatDelta(5)).toBe("+5");
    expect(formatDelta(-2)).toBe("−2");
    expect(formatDelta(0)).toBe("0");
    expect(formatDelta(null)).toBe("—");
  });
});

describe("describeEvent", () => {
  it("ajuste: antes → después (delta) · almacén", () => {
    expect(describeEvent(base)).toBe("10 → 8 (−2) · Tadaima CENTRO");
  });

  it("venta: delta · referencia · almacén", () => {
    expect(describeEvent({ ...base, action: "mov.venta", stock_before: null, stock_after: null, qty_delta: -1, reference: "VENTA-3300", meta: { type: "venta", quantity: 1, notes: null } }))
      .toBe("−1 · VENTA-3300 · Tadaima CENTRO");
  });

  it("edición: lista los cambios con etiqueta en español y dinero en precios", () => {
    const e: ActivityEvent = {
      ...base,
      id: "log:9", source: "log", action: "product.updated", group: "producto", title: "Producto editado",
      warehouse: null, store: null, qty_delta: null, stock_before: null, stock_after: null,
      description: "Producto editado: Booster (SKU: 4012)",
      meta: { changes: { name: { old: "Fig SHF Gon mx", new: "Fig SHF Gon mx OF" }, "prices.price_1": { old: 980, new: 1100 } } },
    };
    expect(describeEvent(e)).toBe("Nombre: «Fig SHF Gon mx» → «Fig SHF Gon mx OF» · Precio Normal: «$980» → «$1,100»");
  });

  it("edición sin cambios registrados cae a la descripción", () => {
    const e: ActivityEvent = { ...base, id: "log:9", source: "log", action: "product.updated", meta: { changes: [] }, description: "Producto editado: Booster (SKU: 4012)" };
    expect(describeEvent(e)).toBe("Producto editado: Booster (SKU: 4012)");
  });

  it("cancelación: modo y devuelto", () => {
    const e: ActivityEvent = { ...base, id: "log:2", source: "log", action: "sale.cancelled", meta: { mode: "full", amount_refunded: 300 }, description: "Venta #2391 cancelada" };
    expect(describeEvent(e)).toBe("cancelación total · devuelto $300");
  });
});

describe("formatChanges", () => {
  it("tolera meta sin changes o changes vacío", () => {
    expect(formatChanges(null)).toEqual([]);
    expect(formatChanges({ changes: [] })).toEqual([]);
  });
  it("booleanos y vacíos legibles", () => {
    const [a, b] = formatChanges({ changes: { active: { old: true, new: false }, "details.editorial": { old: "Kamite", new: null } } });
    expect(a).toMatchObject({ label: "Activo", from: "sí", to: "no" });
    expect(b).toMatchObject({ label: "Editorial", from: "Kamite", to: "vacío" });
  });
});

describe("formatEventTime", () => {
  it("convierte a hora de Tijuana (UTC-7 en octubre)", () => {
    expect(formatEventTime("2026-10-29T20:30:02.000000Z")).toBe("29 oct 13:30");
  });
});

describe("groupStyle", () => {
  it("grupo desconocido cae a sistema", () => {
    expect(groupStyle("lo-que-sea").label).toBe("Sistema");
  });
});
