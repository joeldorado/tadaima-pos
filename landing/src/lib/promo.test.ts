import { describe, it, expect } from "vitest";
import { computePromoDiscount, computeRegularChargeAmount, discountPct } from "./promo";

describe("computePromoDiscount", () => {
  it("calcula el descuento por porcentaje", () => {
    expect(computePromoDiscount({ subtotal: 560, pct: 10 })).toBe(56);
    expect(computePromoDiscount({ subtotal: 200, pct: 5 })).toBe(10);
  });

  it("calcula el descuento por precio final del combo (2 funkos = 510)", () => {
    expect(computePromoDiscount({ subtotal: 560, finalPrice: 510 })).toBe(50);
  });

  it("precio final mayor o igual al subtotal no genera descuento", () => {
    expect(computePromoDiscount({ subtotal: 560, finalPrice: 560 })).toBe(0);
    expect(computePromoDiscount({ subtotal: 560, finalPrice: 600 })).toBe(0);
  });

  it("clampa el descuento al subtotal (nunca mayor)", () => {
    // precio final negativo/absurdo → descuento tope = subtotal, no más.
    expect(computePromoDiscount({ subtotal: 560, finalPrice: -100 })).toBe(560);
    expect(computePromoDiscount({ subtotal: 100, pct: 200 })).toBe(100);
  });

  it("redondea a 2 decimales", () => {
    expect(computePromoDiscount({ subtotal: 99.99, pct: 10 })).toBe(10);
    expect(computePromoDiscount({ subtotal: 333.33, pct: 15 })).toBe(50);
  });

  it("entradas inválidas o sin promo devuelven 0", () => {
    expect(computePromoDiscount({ subtotal: 0, pct: 10 })).toBe(0);
    expect(computePromoDiscount({ subtotal: -10, finalPrice: 5 })).toBe(0);
    expect(computePromoDiscount({ subtotal: 560 })).toBe(0);
    expect(computePromoDiscount({ subtotal: 560, pct: 0 })).toBe(0);
    expect(computePromoDiscount({ subtotal: 560, pct: NaN })).toBe(0);
  });
});

describe("computeRegularChargeAmount", () => {
  it("resta el descuento del monto a cobrar (bug 4r.png: 360 con promo 60 → 300)", () => {
    expect(computeRegularChargeAmount({ regularSubtotal: 360, catalogDeposit: 0, discountAmt: 60 })).toBe(300);
  });

  it("sin descuento cobra el subtotal completo", () => {
    expect(computeRegularChargeAmount({ regularSubtotal: 360, catalogDeposit: 0, discountAmt: 0 })).toBe(360);
  });

  it("clampa a 0 si el descuento excede el cobro (cart mixto)", () => {
    expect(computeRegularChargeAmount({ regularSubtotal: 100, catalogDeposit: 0, discountAmt: 150 })).toBe(0);
  });

  it("suma anticipos de catálogo y luego resta el descuento", () => {
    expect(computeRegularChargeAmount({ regularSubtotal: 200, catalogDeposit: 100, discountAmt: 50 })).toBe(250);
  });
});

describe("discountPct", () => {
  it("deriva el % del descuento sobre el subtotal previo", () => {
    expect(discountPct(56, 560)).toBe(10);
    expect(discountPct(60, 300)).toBe(20);
  });

  it("redondea el % cuando el descuento fue por precio final (no redondo)", () => {
    expect(discountPct(60, 360)).toBe(17); // 16.67 → 17
  });

  it("devuelve 0 sin descuento o con subtotal inválido", () => {
    expect(discountPct(0, 360)).toBe(0);
    expect(discountPct(60, 0)).toBe(0);
    expect(discountPct(-10, 360)).toBe(0);
    expect(discountPct(60, NaN)).toBe(0);
  });
});
