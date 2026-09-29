import { describe, expect, it } from "vitest";
import { hasLineAdjustments, isLegacyGlobalDiscountSale, saleItemNet, saleItemRevenue } from "./saleItemNet";

describe("saleItemNet", () => {
  it("bruto − descuento + aumento", () => {
    expect(saleItemNet({ total: 200 })).toBe(200);
    expect(saleItemNet({ total: 200, discount_amount: 40 })).toBe(160);
    expect(saleItemNet({ total: 200, surcharge_amount: 100 })).toBe(300);
    expect(saleItemNet({ total: 100, discount_amount: 50, surcharge_amount: 5 })).toBe(55);
    expect(saleItemNet({ total: 100, discount_amount: 150 })).toBe(0);
  });
});

describe("tipo de venta", () => {
  it("v2 con ajustes vs legacy con descuento global", () => {
    const v2 = { discount: 0, items: [{ total: 100, surcharge_amount: 20 }] };
    const legacy = { discount: 50, items: [{ total: 560, discount_amount: 0 }] };
    expect(hasLineAdjustments(v2)).toBe(true);
    expect(isLegacyGlobalDiscountSale(v2)).toBe(false);
    expect(hasLineAdjustments(legacy)).toBe(false);
    expect(isLegacyGlobalDiscountSale(legacy)).toBe(true);
    expect(isLegacyGlobalDiscountSale({ discount: 0, items: [{ total: 100 }] })).toBe(false);
  });
});

describe("saleItemRevenue", () => {
  it("v2 = neto del renglón; legacy = prorrateo", () => {
    const v2 = { subtotal: 100, discount: 0, total: 150, items: [{ total: 100, surcharge_amount: 50 }] };
    expect(saleItemRevenue(v2, v2.items[0]!)).toBe(150);
    const legacy = { subtotal: 560, discount: 50, total: 510, items: [{ total: 560 }] };
    expect(saleItemRevenue(legacy, legacy.items[0]!)).toBe(510);
    const plain = { subtotal: 100, discount: 0, total: 100, items: [{ total: 100 }] };
    expect(saleItemRevenue(plain, plain.items[0]!)).toBe(100);
  });
});
