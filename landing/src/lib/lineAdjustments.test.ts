import { describe, expect, it } from "vitest";
import {
  applyLineAdjustment,
  isPlainLine,
  lineAdjustmentOf,
  removeLineAdjustment,
  type AdjustableLine,
  type LineAdjustment,
} from "./lineAdjustments";

const line = (over: Partial<AdjustableLine> = {}): AdjustableLine => ({
  lineId: "L1",
  product: { id: "P1" },
  quantity: 3,
  priceLevel: "a",
  ...over,
});

const aumento: LineAdjustment = {
  direction: "surcharge",
  surcharge: { kind: "fixed", basis: "unit", value: 50, reason: "precio_especial" },
};
const descuento: LineAdjustment = {
  direction: "discount",
  discount: { kind: "fixed", basis: "unit", value: 20, reason: "danado" },
};

let seq = 0;
const newId = () => `N${++seq}`;

describe("applyLineAdjustment", () => {
  it("toda la línea: pone el aumento sin separar", () => {
    const out = applyLineAdjustment([line()], "L1", 3, aumento, newId);
    expect(out).toHaveLength(1);
    expect(out[0]!.surcharge).toEqual({ kind: "fixed", basis: "unit", value: 50, reason: "precio_especial" });
    expect(out[0]!.discount).toBeUndefined();
  });

  it("menos unidades: separa en 2 líneas (normal + con aumento)", () => {
    const out = applyLineAdjustment([line()], "L1", 1, aumento, () => "NEW");
    expect(out.map(l => [l.lineId, l.quantity, !!l.surcharge, l.parentLineId])).toEqual([
      ["L1", 2, false, undefined],
      ["NEW", 1, true, "L1"],
    ]);
  });

  it("descuento y aumento son excluyentes: el nuevo ajuste reemplaza al anterior", () => {
    const conDesc = applyLineAdjustment([line()], "L1", 3, descuento, newId);
    const out = applyLineAdjustment(conDesc, "L1", 3, aumento, newId);
    expect(out[0]!.discount).toBeUndefined();
    expect(out[0]!.surcharge).toBeDefined();
    expect("discount" in out[0]!).toBe(false);
  });

  it("no muta el arreglo original", () => {
    const items = [line()];
    applyLineAdjustment(items, "L1", 1, aumento, newId);
    expect(items).toEqual([line()]);
  });
});

describe("removeLineAdjustment", () => {
  it("fusiona con la línea padre del split", () => {
    const split = applyLineAdjustment([line()], "L1", 1, aumento, () => "NEW");
    const out = removeLineAdjustment(split, "NEW");
    expect(out).toEqual([line()]);
  });

  it("sin con quién fusionar, solo quita el ajuste", () => {
    const out = removeLineAdjustment(applyLineAdjustment([line()], "L1", 3, aumento, newId), "L1");
    expect(out).toEqual([line()]);
  });

  it("no fusiona con una línea que tiene aumento (no es simple)", () => {
    const items = [
      line({ lineId: "A", quantity: 1, surcharge: { kind: "fixed", basis: "unit", value: 10, reason: "otro" } }),
      line({ lineId: "B", quantity: 2, discount: { kind: "fixed", basis: "unit", value: 5, reason: "danado" } }),
    ];
    const out = removeLineAdjustment(items, "B");
    expect(out).toHaveLength(2);
    expect(out[1]!.discount).toBeUndefined();
    expect(out[0]!.surcharge).toBeDefined();
  });
});

describe("isPlainLine / lineAdjustmentOf", () => {
  it("una línea con aumento no es simple", () => {
    expect(isPlainLine(line())).toBe(true);
    expect(isPlainLine(line({ surcharge: { kind: "fixed", basis: "unit", value: 1, reason: "otro" } }))).toBe(false);
    expect(isPlainLine(line({ isDamaged: true }))).toBe(false);
  });

  it("devuelve el ajuste con su dirección", () => {
    expect(lineAdjustmentOf(line())).toBeUndefined();
    expect(lineAdjustmentOf(line({ surcharge: { kind: "percent", basis: "line", value: 5, reason: "envio" } }))?.direction).toBe("surcharge");
  });
});
