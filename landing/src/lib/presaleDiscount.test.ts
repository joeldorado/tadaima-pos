import { describe, expect, it } from "vitest";
import {
  presaleDiscountPayload,
  presaleGrossUnitPrice,
  presaleLineCharge,
  presaleLineDiscount,
} from "./presaleDiscount";
import { presaleDeliveryCharge } from "./presaleAllocation";

// Pieza de $400 con $200 de anticipo: le faltan $200 (ejemplo de Joel).
const tomo = { quantity: 1, preSaleUnitPrice: 400, preSalePending: 200, depositAmount: 200, preSaleOrderItemId: 7 };

describe("presaleLineDiscount — mismo cálculo que una venta, sobre el precio pactado", () => {
  it("porcentaje sobre el precio de la pieza, no sobre lo que falta", () => {
    expect(presaleLineDiscount({ ...tomo, discount: { kind: "percent", basis: "line", value: 25, reason: "danado" } })).toBe(100);
  });

  it("$ por pieza multiplica por las piezas; $ por línea no", () => {
    const tres = { quantity: 3, preSaleUnitPrice: 400, preSalePending: 900 };
    expect(presaleLineDiscount({ ...tres, discount: { kind: "fixed", basis: "unit", value: 50, reason: "danado" } })).toBe(150);
    expect(presaleLineDiscount({ ...tres, discount: { kind: "fixed", basis: "line", value: 50, reason: "danado" } })).toBe(50);
  });

  it("sin descuento es 0", () => {
    expect(presaleLineDiscount(tomo)).toBe(0);
  });
});

describe("presaleLineCharge — lo que se cobra hoy de la pieza", () => {
  it("lo que le falta menos el descuento", () => {
    expect(presaleLineCharge({ ...tomo, discount: { kind: "fixed", basis: "line", value: 50, reason: "danado" } })).toBe(150);
  });

  it("nunca negativo aunque el descuento pase lo que falta", () => {
    expect(presaleLineCharge({ ...tomo, discount: { kind: "percent", basis: "line", value: 70, reason: "danado" } })).toBe(0);
  });

  it("carrito viejo sin `preSalePending`: usa el respaldo", () => {
    expect(presaleLineCharge({ quantity: 1 }, 300)).toBe(300);
  });
});

describe("presaleGrossUnitPrice", () => {
  it("carrito guardado antes del cambio: anticipo + saldo entre piezas", () => {
    expect(presaleGrossUnitPrice({ quantity: 2, depositAmount: 300, preSalePending: 500 })).toBe(400);
  });
});

describe("presaleDiscountPayload — lo que viaja al liquidar", () => {
  it("solo las piezas con descuento, con su id de partida y sin monto", () => {
    const lines = [
      { ...tomo, discount: { kind: "percent" as const, basis: "line" as const, value: 10, reason: "danado" as const, note: "caja rota" } },
      { ...tomo, preSaleOrderItemId: 8 },
    ];
    expect(presaleDiscountPayload(lines)).toEqual([
      { item_id: 7, kind: "percent", basis: "line", value: 10, reason: "danado", note: "caja rota" },
    ]);
  });
});

describe("reparto del anticipo con una pieza ya entregada con descuento", () => {
  it("la entregada cuenta a su neto: el resto del anticipo sigue siendo de las pendientes", () => {
    // A $1,000 entregada con $200 de descuento (neto $800); B $500 y C $300 pendientes.
    // Pagado: $600 de anticipo + $600 que se cobraron de A = $1,200 → $400 para B y C.
    const { pendingByLine } = presaleDeliveryCharge(
      [
        { quantity: 1, unit_price: 1000, discount_amount: 200, delivered: true },
        { quantity: 1, unit_price: 500, delivered: false },
        { quantity: 1, unit_price: 300, delivered: false },
      ],
      1200,
      [],
    );
    expect(pendingByLine).toEqual([0, 300, 100]);
  });
});
