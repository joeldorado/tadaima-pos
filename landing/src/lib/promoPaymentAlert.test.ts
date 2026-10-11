import { describe, expect, it } from "vitest";
import { recalculateSale, type CalcLine, type PromoDef } from "./saleCalc";
import {
  buildPromoPaymentAlert, clearDismissedForMesa, promoPoolLineIds,
  type PromoBlockedLine, type PromoCalcLine,
} from "./promoPaymentAlert";

// Aviso de Caja (2026-10-10): la promo aplicada no se puede cobrar con el
// método actual. Caso real: favorito Tarjeta + 3 Toploader con promo solo efectivo.
const TOPLOADER: PromoBlockedLine = { productName: "Toploader", promoId: 18, promoName: "Top loader 3x10" };
const ETB: PromoBlockedLine = { productName: "ETB Chaos rising ESP", promoId: 19, promoName: "ETB ESP 2x1800" };

const LINES: PromoCalcLine[] = [
  { lineId: "L1", promoPart: { promoId: 18, amount: 10 } },
  { lineId: "L2", poolPromoId: 18 },                       // aportó piezas, sin descuento
  { lineId: "L3", promoPart: { promoId: 19, amount: 400 } },
  { lineId: "L4", promoPart: null },
];

describe("buildPromoPaymentAlert", () => {
  it("sin líneas bloqueadas por promo no hay aviso", () => {
    expect(buildPromoPaymentAlert(1, "Tarjeta", [], LINES)).toBeNull();
  });

  it("promo solo efectivo con Tarjeta: propone Efectivo para conservar la promo", () => {
    const alert = buildPromoPaymentAlert(1, "Tarjeta", [TOPLOADER], LINES);

    expect(alert).toEqual({
      key: "1|Tarjeta|18",
      currentMethod: "Tarjeta",
      keepMethod: "Efectivo",
      promoName: "Top loader 3x10",
      productName: "Toploader",
      extraLines: 0,
      promoIds: [18],
      savings: 10,
    });
  });

  it("promo solo tarjeta con Efectivo, Dólares, Transferencia o Mixto: propone Tarjeta", () => {
    for (const method of ["Efectivo", "Dólares", "Transferencia", "Mixto"]) {
      expect(buildPromoPaymentAlert(1, method, [TOPLOADER], LINES)?.keepMethod).toBe("Tarjeta");
    }
  });

  it("varias promos bloqueadas: nombra la primera, cuenta el resto y suma el ahorro", () => {
    const alert = buildPromoPaymentAlert(2, "Tarjeta", [ETB, TOPLOADER], LINES);

    expect(alert?.productName).toBe("ETB Chaos rising ESP");
    expect(alert?.extraLines).toBe(1);
    expect(alert?.promoIds).toEqual([18, 19]);
    expect(alert?.savings).toBe(410);
  });

  it("la llave no depende del orden de las líneas y cambia con la caja, el método o las promos", () => {
    const key = (mesa: number, method: string, blocked: PromoBlockedLine[]) =>
      buildPromoPaymentAlert(mesa, method, blocked, LINES)?.key;

    expect(key(1, "Tarjeta", [ETB, TOPLOADER])).toBe(key(1, "Tarjeta", [TOPLOADER, ETB]));
    expect(key(1, "Tarjeta", [TOPLOADER])).not.toBe(key(2, "Tarjeta", [TOPLOADER]));
    expect(key(1, "Tarjeta", [TOPLOADER])).not.toBe(key(1, "Efectivo", [TOPLOADER]));
    expect(key(1, "Tarjeta", [TOPLOADER])).not.toBe(key(1, "Tarjeta", [TOPLOADER, ETB]));
  });

  it("dos líneas con la misma promo: un solo id y el descuento de las dos", () => {
    const lines: PromoCalcLine[] = [
      { lineId: "A", promoPart: { promoId: 18, amount: 10 } },
      { lineId: "B", promoPart: { promoId: 18, amount: 5 } },
    ];
    const alert = buildPromoPaymentAlert(1, "Tarjeta", [TOPLOADER, TOPLOADER], lines);

    expect(alert?.promoIds).toEqual([18]);
    expect(alert?.savings).toBe(15);
    expect(alert?.extraLines).toBe(1);
  });

  it("si el cálculo no trae la promo bloqueada, el descuento es 0", () => {
    expect(buildPromoPaymentAlert(1, "Tarjeta", [TOPLOADER], [{ lineId: "X", promoPart: null }])?.savings).toBe(0);
  });
});

describe("promoPoolLineIds", () => {
  it("incluye las líneas con descuento y las que solo aportaron piezas a la promo", () => {
    expect([...promoPoolLineIds(LINES, [18])].sort()).toEqual(["L1", "L2"]);
  });

  it("no toca líneas de otras promos ni líneas sin promo", () => {
    expect([...promoPoolLineIds(LINES, [19])]).toEqual(["L3"]);
    expect(promoPoolLineIds(LINES, []).size).toBe(0);
  });
});

describe("con el motor de Caja (recalculateSale)", () => {
  // Mix & match 3x2 solo efectivo: 1 sobre caro + 2 baratos. La pieza gratis
  // cae en la línea barata; la cara solo aporta al pool.
  const promo = (productId: string): PromoDef => ({
    id: 18, productId, name: "3x2 solo efectivo", type: "nxm", buyN: 3, payM: 2,
    allowCash: true, allowCard: false, priority: 0, storeId: null,
  });
  const promotions = [promo("caro"), promo("barato")];
  const lines: CalcLine[] = [
    { lineId: "caro-1", productId: "caro", unitPrice: 100, qty: 1 },
    { lineId: "barato-1", productId: "barato", unitPrice: 50, qty: 2 },
  ];

  it("\"seguir con el método\" suelta la promo completa: ninguna línea la conserva", () => {
    const before = recalculateSale({ lines, promotions });
    const blocked = before.lines
      .filter((l) => l.promoPart?.promoId === 18)
      .map(() => ({ productName: "Barato", promoId: 18, promoName: "3x2 solo efectivo" }));
    const alert = buildPromoPaymentAlert("m1", "Tarjeta", blocked, before.lines);
    expect(alert?.savings).toBe(50);

    const pool = promoPoolLineIds(before.lines, alert!.promoIds);
    expect([...pool].sort()).toEqual(["barato-1", "caro-1"]);

    const after = recalculateSale({
      lines: lines.map((l) => (pool.has(l.lineId) ? { ...l, skipPromo: true } : l)),
      promotions,
    });
    expect(after.lines.some((l) => l.promoPart != null || l.poolPromoId != null)).toBe(false);
    expect(after.total).toBe(200);
  });
});

describe("clearDismissedForMesa", () => {
  it("olvida los avisos pospuestos de esa caja y conserva los de las demás", () => {
    const dismissed = new Set(["1|Tarjeta|18", "1|Tarjeta|18,19", "2|Tarjeta|18"]);

    expect([...clearDismissedForMesa(dismissed, 1)]).toEqual(["2|Tarjeta|18"]);
  });

  it("devuelve el mismo set si no había nada de esa caja (no dispara renders)", () => {
    const dismissed = new Set(["2|Tarjeta|18"]);

    expect(clearDismissedForMesa(dismissed, 1)).toBe(dismissed);
    // La caja 1 no debe confundirse con la 11.
    const once = new Set(["11|Tarjeta|18"]);
    expect(clearDismissedForMesa(once, 1)).toBe(once);
  });
});
