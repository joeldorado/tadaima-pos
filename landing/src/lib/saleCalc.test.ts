import { describe, it, expect } from "vitest";
import {
  recalculateSale,
  computeLineDiscountAmount,
  computePromoBenefit,
  newLineId,
  type CalcLine,
  type PromoDef,
  type CouponDef,
} from "./saleCalc";

const line = (over: Partial<CalcLine> = {}): CalcLine => ({
  lineId: over.lineId ?? newLineId(),
  productId: "1",
  unitPrice: 100,
  qty: 1,
  ...over,
});

describe("recalculateSale — carrito sin beneficios (Fase 0: paridad con math actual)", () => {
  it("carrito vacío → todo en cero", () => {
    const r = recalculateSale({ lines: [] });
    expect(r.subtotal).toBe(0);
    expect(r.total).toBe(0);
    expect(r.lineBenefitTotal).toBe(0);
    expect(r.couponDiscount).toBe(0);
    expect(r.lines).toEqual([]);
  });

  it("suma simple qty × precio por línea", () => {
    const r = recalculateSale({
      lines: [line({ unitPrice: 100, qty: 2 }), line({ productId: "2", unitPrice: 50.5, qty: 3 })],
    });
    expect(r.subtotal).toBe(351.5);
    expect(r.total).toBe(351.5);
    expect(r.lines[1]!.net).toBe(151.5);
  });

  it("passthrough del descuento global legacy (Fase 0): clamp [0, subtotal]", () => {
    const lines = [line({ unitPrice: 100, qty: 2 })];
    expect(recalculateSale({ lines, legacyGlobalDiscount: 60 }).total).toBe(140);
    expect(recalculateSale({ lines, legacyGlobalDiscount: -5 }).total).toBe(200);
    expect(recalculateSale({ lines, legacyGlobalDiscount: 999 }).total).toBe(0);
  });

  it("recompute es puro: mismas líneas → mismos totales (sin estado atorado)", () => {
    const lines = [line({ unitPrice: 100, qty: 3 })];
    const a = recalculateSale({ lines });
    const b = recalculateSale({ lines });
    expect(a).toEqual(b);
  });
});

describe("computeLineDiscountAmount — descuento manual por línea", () => {
  it("fixed por unidad: $20 × 2 uds = $40", () => {
    expect(
      computeLineDiscountAmount(
        { kind: "fixed", basis: "unit", value: 20, reason: "danado" },
        { unitPrice: 100, qty: 2 },
      ),
    ).toBe(40);
  });

  it("fixed por línea: $20 total sin importar qty", () => {
    expect(
      computeLineDiscountAmount(
        { kind: "fixed", basis: "line", value: 20, reason: "danado" },
        { unitPrice: 100, qty: 3 },
      ),
    ).toBe(20);
  });

  it("percent siempre sobre la base de la línea", () => {
    expect(
      computeLineDiscountAmount(
        { kind: "percent", basis: "unit", value: 10, reason: "otro" },
        { unitPrice: 100, qty: 3 },
      ),
    ).toBe(30);
  });

  it("clamp: nunca deja la línea en negativo", () => {
    expect(
      computeLineDiscountAmount(
        { kind: "fixed", basis: "unit", value: 150, reason: "danado" },
        { unitPrice: 100, qty: 2 },
      ),
    ).toBe(200);
    expect(
      computeLineDiscountAmount(
        { kind: "percent", basis: "line", value: 200, reason: "otro" },
        { unitPrice: 100, qty: 1 },
      ),
    ).toBe(100);
  });

  it("valores inválidos → 0", () => {
    expect(
      computeLineDiscountAmount(
        { kind: "fixed", basis: "unit", value: NaN, reason: "otro" },
        { unitPrice: 100, qty: 1 },
      ),
    ).toBe(0);
    expect(
      computeLineDiscountAmount(
        { kind: "fixed", basis: "unit", value: -10, reason: "otro" },
        { unitPrice: 100, qty: 1 },
      ),
    ).toBe(0);
  });
});

describe("recalculateSale — caso del cliente (3 uds, 2 dañadas −$20 c/u, 1 buena = $260)", () => {
  it("línea buena $100 + línea dañada 2×$100−$40 = $260", () => {
    const r = recalculateSale({
      lines: [
        line({ productId: "X", unitPrice: 100, qty: 1 }),
        line({
          productId: "X",
          unitPrice: 100,
          qty: 2,
          discount: { kind: "fixed", basis: "unit", value: 20, reason: "danado" },
        }),
      ],
    });
    expect(r.subtotal).toBe(300);
    expect(r.lineBenefitTotal).toBe(40);
    expect(r.total).toBe(260);
    expect(r.lines[0]!.benefit).toBeNull();
    expect(r.lines[1]!.benefit).toEqual(
      expect.objectContaining({ type: "discount", amount: 40 }),
    );
  });
});

describe("computePromoBenefit — motor NxM", () => {
  const promo = (buyN: number, payM: number, over: Partial<PromoDef> = {}): PromoDef => ({
    id: 1,
    productId: "1",
    name: `${buyN}x${payM}`,
    buyN,
    payM,
    priority: 0,
    ...over,
  });

  it("2x1: Q=1 sin promo; Q=2 → 1 gratis; Q=3 → 1 gratis + 1 resto", () => {
    expect(computePromoBenefit(promo(2, 1), { unitPrice: 50, qty: 1 })).toBeNull();
    expect(computePromoBenefit(promo(2, 1), { unitPrice: 50, qty: 2 })).toEqual(
      expect.objectContaining({ amount: 50, freeQty: 1 }),
    );
    expect(computePromoBenefit(promo(2, 1), { unitPrice: 50, qty: 3 })).toEqual(
      expect.objectContaining({ amount: 50, freeQty: 1 }),
    );
  });

  it("3x2 sobre 7 uds @ $50: 2 grupos → 2 gratis = $100 (ejemplo del spec)", () => {
    expect(computePromoBenefit(promo(3, 2), { unitPrice: 50, qty: 7 })).toEqual(
      expect.objectContaining({ amount: 100, freeQty: 2 }),
    );
  });

  it("4x3 y 3x1", () => {
    expect(computePromoBenefit(promo(4, 3), { unitPrice: 10, qty: 8 })).toEqual(
      expect.objectContaining({ amount: 20, freeQty: 2 }),
    );
    expect(computePromoBenefit(promo(3, 1), { unitPrice: 10, qty: 3 })).toEqual(
      expect.objectContaining({ amount: 20, freeQty: 2 }),
    );
  });

  it("promo inválida (payM >= buyN o cantidades absurdas) → null", () => {
    expect(computePromoBenefit(promo(2, 2), { unitPrice: 50, qty: 4 })).toBeNull();
    expect(computePromoBenefit(promo(0, 1), { unitPrice: 50, qty: 4 })).toBeNull();
  });
});

describe("computePromoBenefit — tipo qty_discount = MAYOREO (por pieza desde N)", () => {
  const mayoreoPromo = (minQty: number, discountPerUnit: number): PromoDef => ({
    id: 9,
    productId: "1",
    name: "Mayoreo",
    type: "qty_discount",
    buyN: 0,
    payM: 0,
    minQty,
    discountPerUnit,
    priority: 0,
  });

  it("caso Joel: desde 5 pzas, −$100 c/u → 5 pzas = 500 y 10 pzas = 1000", () => {
    expect(computePromoBenefit(mayoreoPromo(5, 100), { unitPrice: 500, qty: 5 })).toEqual(
      expect.objectContaining({ type: "promo", amount: 500, freeQty: 0 }),
    );
    expect(computePromoBenefit(mayoreoPromo(5, 100), { unitPrice: 500, qty: 10 })?.amount).toBe(1000);
  });

  it("la cantidad intermedia SÍ cuenta (7 pzas = 700) — es lo que lo separa del modelo por grupos", () => {
    expect(computePromoBenefit(mayoreoPromo(5, 100), { unitPrice: 500, qty: 7 })?.amount).toBe(700);
  });

  it("exactamente en el umbral aplica; una pieza abajo no", () => {
    expect(computePromoBenefit(mayoreoPromo(5, 100), { unitPrice: 500, qty: 5 })?.amount).toBe(500);
    expect(computePromoBenefit(mayoreoPromo(5, 100), { unitPrice: 500, qty: 4 })).toBeNull();
  });

  it("clampeado al bruto de la línea (nunca deja la línea negativa)", () => {
    // −$500 c/u sobre piezas de $100: 2 pzas = bruto 200, no 1000.
    expect(
      computePromoBenefit(mayoreoPromo(2, 500), { unitPrice: 100, qty: 2 })?.amount,
    ).toBe(200);
  });

  it("cantidad fraccionaria: la media pieza no gana descuento (floor)", () => {
    expect(computePromoBenefit(mayoreoPromo(2, 100), { unitPrice: 500, qty: 2.9 })?.amount).toBe(200);
  });

  it("skipPromo: el cajero renunció a la promo → se cobra a precio normal", () => {
    // Es la salida cuando la promo restringe el método de pago: sin esto ese
    // producto simplemente no se le puede vender al cliente.
    const r = recalculateSale({
      lines: [{ lineId: "a", productId: "1", unitPrice: 200, qty: 5, skipPromo: true }],
      promotions: [mayoreoPromo(5, 100)],
    });
    expect(r.total).toBe(1000);
    expect(r.lines[0]?.promoPart ?? null).toBeNull();
  });

  it("sin configurar (min_qty o descuento faltantes/inválidos) → null", () => {
    expect(computePromoBenefit(mayoreoPromo(1, 50), { unitPrice: 100, qty: 5 })).toBeNull();
    expect(computePromoBenefit(mayoreoPromo(5, 0), { unitPrice: 100, qty: 5 })).toBeNull();
    const sinDatos: PromoDef = {
      id: 9, productId: "1", name: "Mayoreo", type: "qty_discount",
      buyN: 0, payM: 0, priority: 0,
    };
    expect(computePromoBenefit(sinDatos, { unitPrice: 100, qty: 50 })).toBeNull();
  });

  it("override local: la promo de tienda apaga la global (aunque ahorre menos)", () => {
    const global2x1: PromoDef = { id: 1, productId: "X", name: "2x1 Global", buyN: 2, payM: 1, priority: 0, storeId: null };
    const local4x3: PromoDef = { id: 2, productId: "X", name: "4x3 Local", buyN: 4, payM: 3, priority: 0, storeId: 7 };
    // 4 pzas @ $100: global daría −$200; con la local presente aplica −$100.
    const r = recalculateSale({
      lines: [{ lineId: "a", productId: "X", unitPrice: 100, qty: 4 }],
      promotions: [global2x1, local4x3],
    });
    expect(r.total).toBe(300);
    expect(r.lines[0]?.promoPart?.promoId).toBe(2);
  });

  it("override local: la global NO revive si la local no alcanza por cantidad", () => {
    const global2x1: PromoDef = { id: 1, productId: "X", name: "2x1 Global", buyN: 2, payM: 1, priority: 0, storeId: null };
    const local3x2: PromoDef = { id: 2, productId: "X", name: "3x2 Local", buyN: 3, payM: 2, priority: 0, storeId: 7 };
    const r = recalculateSale({
      lines: [{ lineId: "a", productId: "X", unitPrice: 100, qty: 2 }],
      promotions: [global2x1, local3x2],
    });
    expect(r.total).toBe(200); // precio completo — sin promo
    expect(r.lines[0]?.promoPart ?? null).toBeNull();
  });

  it("stacking: manual sobre el neto del mayoreo (espejo del test PHP)", () => {
    const result = recalculateSale({
      lines: [
        {
          lineId: "a",
          productId: "1",
          unitPrice: 200,
          qty: 2,
          discount: { kind: "fixed", basis: "line", value: 50, reason: "otro" },
        },
      ],
      // desde 2 pzas, −$50 c/u → 2 × 50 = 100 de promo
      promotions: [mayoreoPromo(2, 50)],
    });
    // gross 400 − promo 100 − manual 50 = 250
    expect(result.total).toBe(250);
    expect(result.lines[0]?.promoPart?.amount).toBe(100);
    expect(result.lines[0]?.manualPart).toBe(50);
  });
});

describe("recalculateSale — precedencia y no-stacking", () => {
  const promo2x1: PromoDef = { id: 7, productId: "X", name: "2x1", buyN: 2, payM: 1, priority: 0 };

  it("promo aplica sola cuando no hay descuento manual", () => {
    const r = recalculateSale({
      lines: [line({ productId: "X", unitPrice: 50, qty: 2 })],
      promotions: [promo2x1],
    });
    expect(r.lines[0]!.benefit).toEqual(
      expect.objectContaining({ type: "promo", amount: 50, promoId: 7 }),
    );
    expect(r.total).toBe(50);
  });

  it("STACKING (regla Joel 2026-07-17): promo primero, descuento manual sobre el resultado", () => {
    // 2×$50 con 2x1 → neto promo $50; 10% manual sobre ESE resultado = $5 → total $45.
    const r = recalculateSale({
      lines: [
        line({
          productId: "X",
          unitPrice: 50,
          qty: 2,
          discount: { kind: "percent", basis: "line", value: 10, reason: "danado" },
        }),
      ],
      promotions: [promo2x1],
    });
    expect(r.lines[0]!.promoPart).toEqual(
      expect.objectContaining({ type: "promo", amount: 50, promoId: 7 }),
    );
    expect(r.lines[0]!.manualPart).toBe(5);
    expect(r.lines[0]!.benefit).toEqual(
      expect.objectContaining({ type: "discount", amount: 55 }),
    );
    expect(r.total).toBe(45);
  });

  it("STACKING con monto fijo: caso QA Joel — 2×$2,900 con 2x1 y −$100 → $2,800", () => {
    const r = recalculateSale({
      lines: [
        line({
          productId: "X",
          unitPrice: 2900,
          qty: 2,
          discount: { kind: "fixed", basis: "line", value: 100, reason: "otro" },
        }),
      ],
      promotions: [{ id: 9, productId: "X", name: "2x1", buyN: 2, payM: 1, priority: 0 }],
    });
    expect(r.lines[0]!.promoPart?.amount).toBe(2900);
    expect(r.lines[0]!.manualPart).toBe(100);
    expect(r.total).toBe(2800);
  });

  it("el descuento manual se clampa al neto DESPUÉS de la promo", () => {
    // 2×$50 con 2x1 → neto $50; manual fijo $80 no puede exceder $50 → total $0.
    const r = recalculateSale({
      lines: [
        line({
          productId: "X",
          unitPrice: 50,
          qty: 2,
          discount: { kind: "fixed", basis: "line", value: 80, reason: "otro" },
        }),
      ],
      promotions: [promo2x1],
    });
    expect(r.lines[0]!.manualPart).toBe(50);
    expect(r.total).toBe(0);
  });

  it("con varias promos válidas gana la de mayor ahorro; empate → mayor priority", () => {
    const r = recalculateSale({
      lines: [line({ productId: "X", unitPrice: 50, qty: 6 })],
      promotions: [
        { id: 1, productId: "X", name: "3x2", buyN: 3, payM: 2, priority: 5 }, // 2 gratis = $100
        { id: 2, productId: "X", name: "2x1", buyN: 2, payM: 1, priority: 0 }, // 3 gratis = $150
      ],
    });
    expect(r.lines[0]!.benefit).toEqual(expect.objectContaining({ promoId: 2, amount: 150 }));

    const tie = recalculateSale({
      lines: [line({ productId: "X", unitPrice: 50, qty: 2 })],
      promotions: [
        { id: 1, productId: "X", name: "A", buyN: 2, payM: 1, priority: 1 },
        { id: 2, productId: "X", name: "B", buyN: 2, payM: 1, priority: 9 },
      ],
    });
    expect(tie.lines[0]!.benefit).toEqual(expect.objectContaining({ promoId: 2 }));
  });

  it("promos de otro producto no afectan la línea", () => {
    const r = recalculateSale({
      lines: [line({ productId: "Y", unitPrice: 50, qty: 2 })],
      promotions: [promo2x1],
    });
    expect(r.lines[0]!.benefit).toBeNull();
  });
});

describe("recalculateSale — cupón (solo líneas sin beneficio)", () => {
  const cFixed: CouponDef = { id: 1, code: "BUENFIN-7QK2", kind: "fixed", value: 100, scope: "whole_sale" };

  it("fixed resta de la base elegible y nunca la excede", () => {
    const r = recalculateSale({ lines: [line({ unitPrice: 60, qty: 1 })], coupon: cFixed });
    expect(r.couponDiscount).toBe(60);
    expect(r.total).toBe(0);
  });

  it("percent con tope max_discount", () => {
    const r = recalculateSale({
      lines: [line({ unitPrice: 1000, qty: 1 })],
      coupon: { id: 2, code: "X", kind: "percent", value: 10, scope: "whole_sale", maxDiscount: 50 },
    });
    expect(r.couponDiscount).toBe(50);
    expect(r.total).toBe(950);
  });

  it("solo cuenta líneas SIN beneficio (no-stacking) y scope products filtra", () => {
    const r = recalculateSale({
      lines: [
        line({ productId: "X", unitPrice: 50, qty: 2 }), // 2x1 → con beneficio, NO elegible
        line({ productId: "Y", unitPrice: 80, qty: 1 }), // elegible
      ],
      promotions: [{ id: 7, productId: "X", name: "2x1", buyN: 2, payM: 1, priority: 0 }],
      coupon: { id: 3, code: "Y10", kind: "percent", value: 10, scope: "products", productIds: ["Y"] },
    });
    expect(r.couponDiscount).toBe(8);
    expect(r.total).toBe(50 + 80 - 8);
  });

  it("min_purchase sobre la base elegible: si no alcanza, rechaza con razón", () => {
    const r = recalculateSale({
      lines: [line({ unitPrice: 40, qty: 1 })],
      coupon: { ...cFixed, minPurchase: 50 },
    });
    expect(r.couponDiscount).toBe(0);
    expect(r.couponRejectedReason).toBe("min_purchase");
    expect(r.total).toBe(40);
  });

  it("todas las líneas con beneficio → cupón rechazado por base cero", () => {
    const r = recalculateSale({
      lines: [line({ productId: "X", unitPrice: 50, qty: 2 })],
      promotions: [{ id: 7, productId: "X", name: "2x1", buyN: 2, payM: 1, priority: 0 }],
      coupon: cFixed,
    });
    expect(r.couponDiscount).toBe(0);
    expect(r.couponRejectedReason).toBe("no_eligible_lines");
  });
});

describe("redondeo — una sola vez, a nivel line-net", () => {
  it("percent con centavos: net redondeado a 2 decimales", () => {
    const r = recalculateSale({
      lines: [
        line({
          unitPrice: 33.33,
          qty: 1,
          discount: { kind: "percent", basis: "line", value: 15, reason: "otro" },
        }),
      ],
    });
    // 33.33 × 15% = 4.9995 → net = 33.33 − 4.9995 = 28.3305 → 28.33
    expect(r.lines[0]!.net).toBe(28.33);
    expect(r.total).toBe(28.33);
  });
});

describe("newLineId", () => {
  it("genera ids únicos", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newLineId()));
    expect(ids.size).toBe(200);
  });
});
