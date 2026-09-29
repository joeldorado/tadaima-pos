import { describe, expect, it } from "vitest";
import { finalPriceLine } from "./ticketLines";

describe("finalPriceLine", () => {
  it("sin aumento deja el precio de catálogo", () => {
    expect(finalPriceLine(100, 2)).toEqual({ price: 100, lineTotal: 200 });
  });

  it("con aumento imprime el precio final por pieza", () => {
    expect(finalPriceLine(100, 2, 100)).toEqual({ price: 150, lineTotal: 300 });
  });

  it("el importe de la línea cuadra al centavo aunque el unitario no sea exacto", () => {
    const l = finalPriceLine(100, 3, 100);
    expect(l.price).toBe(133.33);
    expect(l.lineTotal).toBe(400);
  });
});
