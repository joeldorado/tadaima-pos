import { describe, expect, it } from "vitest";
import {
  buildMixedCheckout,
  buildSaleDirectItems,
  findMesaWithFolio,
  lineAdjustmentPayload,
  splitMesaLines,
  staleFolioError,
  unloadFolioFromMesa,
  type CheckoutCartLine,
  type LineCalcInfo,
} from "./mixedCheckout";

// ── Carrito del caso de tienda (2026-11-17, T-006) ───────────────────────────
// Folio con una figura de $700 y $300 de anticipo (faltan $400) + un producto
// normal de $250 en la misma mesa.
const figura: CheckoutCartLine = {
  lineId: "L-folio", product: { id: "catalog-9" }, quantity: 1, priceLevel: "a",
  isFromPreSale: true, preSaleOrderItemId: 31, preSaleItemDelivered: false,
  preSalePending: 400, preSaleUnitPrice: 700, depositAmount: 300,
};
const funda: CheckoutCartLine = { lineId: "L-funda", product: { id: "12" }, quantity: 1, priceLevel: "a" };
const preventaNueva: CheckoutCartLine = {
  lineId: "L-nueva", product: { id: "catalog-5" }, quantity: 2, priceLevel: "b",
  sellingCatalogId: 5, depositAmount: 500,
};

const PRICES: Record<string, number> = { "L-funda": 250, "L-socio": 980, "L-regalo": 120, "L-danado": 300 };
const listPriceOf = (l: CheckoutCartLine): number => PRICES[l.lineId] ?? 0;
const calc = (unitPrice: number, net: number, promoRepriced = false): LineCalcInfo => ({ unitPrice, net, promoRepriced });

const base = {
  storeId: 1,
  registerSessionId: 8,
  customerId: 44,
  preSaleOrderId: 100,
  folioCharge: 400,
  paymentMethodId: 1,
  calcById: { "L-funda": calc(250, 250) } as Record<string, LineCalcInfo>,
  listPriceOf,
  cash: { received: 0, receivedUsd: 0, exchangeRate: 18 },
};

describe("splitMesaLines — qué es cada línea de la mesa", () => {
  it("separa folio, productos regulares y preventas nuevas", () => {
    const parts = splitMesaLines([figura, funda, preventaNueva]);
    expect(parts.liquidation).toEqual([figura]);
    expect(parts.regular).toEqual([funda]);
    expect(parts.newCatalog).toEqual([preventaNueva]);
  });

  it("una partida del folio ya entregada no se liquida otra vez", () => {
    const parts = splitMesaLines([{ ...figura, preSaleItemDelivered: true }, funda]);
    expect(parts.liquidation).toEqual([]);
    expect(parts.regular).toEqual([funda]);
  });
});

describe("buildSaleDirectItems — las líneas de venta como las espera POST /sales", () => {
  const ctx = { calcById: base.calcById, listPriceOf };

  it("línea normal: precio del motor y nivel del carrito", () => {
    expect(buildSaleDirectItems([funda], ctx)).toEqual([
      { product_id: 12, quantity: 1, price: 250, price_level: "a" },
    ]);
  });

  it("promo que re-precia a NORMAL: viaja el precio efectivo y nivel a", () => {
    const socio: CheckoutCartLine = { lineId: "L-socio", product: { id: "7" }, quantity: 2, priceLevel: "b" };
    const items = buildSaleDirectItems([socio], { calcById: { "L-socio": calc(1100, 1100, true) }, listPriceOf });
    expect(items).toEqual([{ product_id: 7, quantity: 2, price: 1100, price_level: "a" }]);
  });

  it("niveles d y e no existen en la venta: viajan como a", () => {
    const linea: CheckoutCartLine = { ...funda, priceLevel: "d" };
    expect(buildSaleDirectItems([linea], ctx)[0]?.price_level).toBe("a");
  });

  it("regalo: precio de CATÁLOGO aunque el motor lo deje en $0", () => {
    const regalo: CheckoutCartLine = { lineId: "L-regalo", product: { id: "3" }, quantity: 1, priceLevel: "a", isGift: true, giftNote: "cliente frecuente" };
    const items = buildSaleDirectItems([regalo], { calcById: { "L-regalo": calc(0, 0) }, listPriceOf });
    expect(items).toEqual([
      { product_id: 3, quantity: 1, price: 120, price_level: "a", is_gift: true, gift_note: "cliente frecuente" },
    ]);
  });

  it("dañado: precio manual y la bandera", () => {
    const danado: CheckoutCartLine = { lineId: "L-danado", product: { id: "4" }, quantity: 1, priceLevel: "a", isDamaged: true, damagedPrice: 99 };
    const items = buildSaleDirectItems([danado], { calcById: { "L-danado": calc(300, 99) }, listPriceOf });
    expect(items).toEqual([{ product_id: 4, quantity: 1, price: 99, price_level: "a", is_damaged: true }]);
  });

  it("descuento, sin promo y comentario viajan como captura (nunca un monto)", () => {
    const linea: CheckoutCartLine = {
      ...funda, skipPromo: true, comment: "  para la promo  ",
      discount: { kind: "percent", basis: "line", value: 10, reason: "exhibicion", note: "caja rota" },
    };
    expect(buildSaleDirectItems([linea], ctx)).toEqual([{
      product_id: 12, quantity: 1, price: 250, price_level: "a",
      line_discount: { kind: "percent", basis: "line", value: 10, reason: "exhibicion", note: "caja rota" },
      skip_promotion: true,
      comment: "para la promo",
    }]);
  });

  it("una línea sin id de producto válido no viaja", () => {
    const rara: CheckoutCartLine = { ...funda, product: { id: "catalog-1" } };
    expect(buildSaleDirectItems([rara, funda], ctx)).toHaveLength(1);
  });

  it("sin dato del motor cae al precio de lista", () => {
    expect(buildSaleDirectItems([funda], { calcById: {}, listPriceOf })[0]?.price).toBe(250);
  });
});

describe("lineAdjustmentPayload — descuento O aumento O regalo", () => {
  it("aumento", () => {
    expect(lineAdjustmentPayload({ surcharge: { kind: "fixed", basis: "unit", value: 20, reason: "envio" } }))
      .toEqual({ line_surcharge: { kind: "fixed", basis: "unit", value: 20, reason: "envio" } });
  });

  it("el regalo gana sobre cualquier ajuste", () => {
    expect(lineAdjustmentPayload({ isGift: true, discount: { kind: "fixed", basis: "line", value: 5, reason: "otro" } }))
      .toEqual({ is_gift: true });
  });

  it("sin ajuste no agrega nada", () => {
    expect(lineAdjustmentPayload({})).toEqual({});
  });
});

describe("buildMixedCheckout — el cobro de una mesa con folio en UNA llamada", () => {
  it("folio + producto: liquidación y venta en el mismo payload", () => {
    const built = buildMixedCheckout({ ...base, lines: [figura, funda], cash: { received: 700, receivedUsd: 0, exchangeRate: 18 } });

    expect(built.payload).toEqual({
      store_id: 1,
      register_session_id: 8,
      customer_id: 44,
      liquidation: {
        pre_sale_order_id: 100,
        item_ids: [31],
        payment: { amount: 400, payment_method_id: 1 },
      },
      sale: {
        calc_version: 2,
        items: [{ product_id: 12, quantity: 1, price: 250, price_level: "a" }],
        payments: [{ payment_method_id: 1, amount: 250 }],
        cash_received: 700,
        change_amount: 50,
      },
    });
    expect(built.amounts).toEqual({ folio: 400, regularNet: 250, newDeposit: 0, total: 650 });
    expect(built.saleItems).toHaveLength(1);
  });

  it("solo el folio: sin bloque de venta ni de preventa nueva", () => {
    const { payload } = buildMixedCheckout({ ...base, lines: [figura] });
    expect(payload.sale).toBeUndefined();
    expect(payload.new_order).toBeUndefined();
    expect(payload.liquidation).toEqual({
      pre_sale_order_id: 100, item_ids: [31], payment: { amount: 400, payment_method_id: 1 },
    });
  });

  it("folio ya cubierto por el anticipo: se entrega sin cobro", () => {
    const pagada = { ...figura, preSalePending: 0, depositAmount: 700 };
    const { payload, amounts } = buildMixedCheckout({ ...base, folioCharge: 0, lines: [pagada] });
    expect(payload.liquidation).toEqual({ pre_sale_order_id: 100, item_ids: [31] });
    expect(amounts.total).toBe(0);
  });

  it("solo viajan las partidas que siguen en el carrito (entrega parcial)", () => {
    const otra = { ...figura, lineId: "L-folio-2", preSaleOrderItemId: 32 };
    const entregada = { ...figura, lineId: "L-folio-3", preSaleOrderItemId: 33, preSaleItemDelivered: true };
    const { payload } = buildMixedCheckout({ ...base, lines: [figura, otra, entregada] });
    expect(payload.liquidation.item_ids).toEqual([31, 32]);
  });

  it("folio sin piezas por entregar (carrito viejo): no arma el cobro", () => {
    const entregada = { ...figura, preSaleItemDelivered: true };
    const sinId: CheckoutCartLine = { ...figura, preSaleOrderItemId: undefined };
    expect(() => buildMixedCheckout({ ...base, lines: [entregada, funda] })).toThrow("vuelve a cargarlo");
    expect(() => buildMixedCheckout({ ...base, lines: [sinId, funda] })).toThrow("vuelve a cargarlo");
  });

  it("descuento de la pieza dañada del folio", () => {
    const danada = { ...figura, discount: { kind: "fixed" as const, basis: "line" as const, value: 100, reason: "danado" as const } };
    const { payload } = buildMixedCheckout({ ...base, folioCharge: 300, lines: [danada] });
    expect(payload.liquidation.item_discounts).toEqual([
      { item_id: 31, kind: "fixed", basis: "line", value: 100, reason: "danado" },
    ]);
    expect(payload.liquidation.payment).toEqual({ amount: 300, payment_method_id: 1 });
  });

  it("preventa nueva: solo su anticipo, con el método de pago de la mesa", () => {
    const built = buildMixedCheckout({ ...base, lines: [figura, funda, preventaNueva] });
    expect(built.payload.new_order).toEqual({
      items: [{ catalog_id: 5, quantity: 2, price_level: 2 }],
      advance_amount: 500,
      payment_method_id: 1,
    });
    expect(built.amounts).toEqual({ folio: 400, regularNet: 250, newDeposit: 500, total: 1150 });
  });

  it("preventa nueva sin anticipo no manda monto ni método", () => {
    const sinAnticipo = { ...preventaNueva, depositAmount: 0 };
    const { payload } = buildMixedCheckout({ ...base, lines: [figura, sinAnticipo] });
    expect(payload.new_order).toEqual({ items: [{ catalog_id: 5, quantity: 2, price_level: 2 }] });
  });

  it("preventa nueva sin cliente: no arma el cobro", () => {
    expect(() => buildMixedCheckout({ ...base, customerId: null, lines: [figura, preventaNueva] }))
      .toThrow("Falta cliente para la nueva preventa");
  });

  it("sin cliente y sin preventa nueva sí se puede (no viaja customer_id)", () => {
    const { payload } = buildMixedCheckout({ ...base, customerId: null, lines: [figura, funda] });
    expect(payload).not.toHaveProperty("customer_id");
  });

  it("el pago de la venta es el NETO del motor (con descuento por línea)", () => {
    const conDescuento = { ...funda, discount: { kind: "fixed" as const, basis: "line" as const, value: 50, reason: "otro" as const } };
    const built = buildMixedCheckout({ ...base, lines: [figura, conDescuento], calcById: { "L-funda": calc(250, 200) } });
    expect(built.payload.sale?.payments).toEqual([{ payment_method_id: 1, amount: 200 }]);
    expect(built.amounts.total).toBe(600);
  });

  it("parte regular solo de regalos: venta en $0 (sale el stock)", () => {
    const regalo: CheckoutCartLine = { lineId: "L-regalo", product: { id: "3" }, quantity: 1, priceLevel: "a", isGift: true };
    const built = buildMixedCheckout({ ...base, lines: [figura, regalo], calcById: { "L-regalo": calc(0, 0) } });
    expect(built.payload.sale?.payments).toEqual([{ payment_method_id: 1, amount: 0 }]);
    expect(built.payload.sale?.items[0]).toMatchObject({ product_id: 3, price: 120, is_gift: true });
  });

  it("producto regular en $0 que no es regalo no genera venta", () => {
    const gratis: CheckoutCartLine = { lineId: "L-cero", product: { id: "9" }, quantity: 1, priceLevel: "a" };
    const { payload } = buildMixedCheckout({ ...base, lines: [figura, gratis], calcById: { "L-cero": calc(0, 0) } });
    expect(payload.sale).toBeUndefined();
  });

  it("tarjeta: la terminal viaja en el pago de la venta", () => {
    const { payload } = buildMixedCheckout({ ...base, paymentMethodId: 2, terminalId: 6, lines: [figura, funda] });
    expect(payload.sale?.payments).toEqual([{ payment_method_id: 2, amount: 250, terminal_id: 6 }]);
  });

  it("dólares: recibido en pesos (USD × TC) y cambio contra TODO el ticket", () => {
    const built = buildMixedCheckout({
      ...base, lines: [figura, funda, preventaNueva],
      cash: { received: 200, receivedUsd: 60, exchangeRate: 18 },
    });
    // 200 + 60 × 18 = 1,280 recibidos contra 1,150 del ticket.
    expect(built.payload.sale).toMatchObject({
      cash_received_usd: 60, exchange_rate: 18, cash_received: 1280, change_amount: 130,
    });
    expect(built.cash).toEqual({ received: 1280, receivedUsd: 60, change: 130 });
  });

  it("recibido de menos: cambio 0, nunca negativo", () => {
    const built = buildMixedCheckout({ ...base, lines: [figura, funda], cash: { received: 100, receivedUsd: 0, exchangeRate: 18 } });
    expect(built.payload.sale?.change_amount).toBe(0);
  });

  it("sin efectivo capturado no viaja nada de efectivo", () => {
    const { payload } = buildMixedCheckout({ ...base, lines: [figura, funda] });
    expect(payload.sale).not.toHaveProperty("cash_received");
    expect(payload.sale).not.toHaveProperty("cash_received_usd");
  });

  it("los centavos no se descuadran al sumar", () => {
    const a: CheckoutCartLine = { lineId: "A", product: { id: "1" }, quantity: 1, priceLevel: "a" };
    const b: CheckoutCartLine = { lineId: "B", product: { id: "2" }, quantity: 1, priceLevel: "a" };
    const built = buildMixedCheckout({
      ...base, folioCharge: 0.3, lines: [figura, a, b],
      calcById: { A: calc(0.1, 0.1), B: calc(0.2, 0.2) },
    });
    expect(built.amounts.regularNet).toBe(0.3);
    expect(built.amounts.total).toBe(0.6);
  });
});

describe("findMesaWithFolio — un folio no se carga en dos mesas", () => {
  const mesas = [
    { id: "m1", loadedPreSaleOrderId: 100 },
    { id: "m2" },
    { id: "m3", loadedPreSaleOrderId: 200 },
  ];

  it("encuentra la otra mesa que ya lo tiene", () => {
    expect(findMesaWithFolio(mesas, 100, "m2")?.id).toBe("m1");
  });

  it("la misma mesa no cuenta (recargar el folio ahí sí se vale)", () => {
    expect(findMesaWithFolio(mesas, 100, "m1")).toBeUndefined();
  });

  it("folio que nadie tiene", () => {
    expect(findMesaWithFolio(mesas, 999, "m2")).toBeUndefined();
  });
});

describe("unloadFolioFromMesa — quita el folio y deja lo demás", () => {
  const mesa = {
    id: "m1", name: "Caja 1", customerId: "44", paymentMethod: "Efectivo",
    items: [figura, funda, preventaNueva],
    depositAmount: 400,
    loadedPreSaleOrderId: 100, loadedPreSaleOrderCode: "PREV-00100", loadedPreSaleOldDebt: 50,
  };

  it("se van las partidas del folio y se quedan los productos y la preventa nueva", () => {
    const out = unloadFolioFromMesa(mesa);
    expect(out.items).toEqual([funda, preventaNueva]);
    expect(out.depositAmount).toBe(0);
    expect(out.loadedPreSaleOrderId).toBeUndefined();
    expect(out.loadedPreSaleOrderCode).toBeUndefined();
    expect(out.loadedPreSaleOldDebt).toBeUndefined();
    expect(out.customerId).toBe("44");
  });

  it("no muta la mesa original", () => {
    unloadFolioFromMesa(mesa);
    expect(mesa.items).toHaveLength(3);
    expect(mesa.loadedPreSaleOrderId).toBe(100);
  });
});

describe("staleFolioError — el servidor dice que el folio ya no se puede entregar", () => {
  it("ya entregado", () => {
    const err = { message: "El folio PREV-00100 no está listo para liquidar (estado: delivered).", errors: { code: ["PRESALE_ORDER_ALREADY_DELIVERED"] } };
    expect(staleFolioError(err)).toEqual({ alreadyDelivered: true, message: err.message });
  });

  it("ya no está listo (cancelado, vencido)", () => {
    const err = { message: "El folio PREV-00100 no está listo para liquidar (estado: cancelled).", errors: { code: ["PRESALE_ORDER_NOT_READY"] } };
    expect(staleFolioError(err)).toEqual({ alreadyDelivered: false, message: err.message });
  });

  it("otros errores no son del folio", () => {
    expect(staleFolioError({ message: "Stock insuficiente", errors: { code: ["CASH_SESSION_STALE"] } })).toBeNull();
    expect(staleFolioError({ message: "Precio fuera del catálogo" })).toBeNull();
    expect(staleFolioError(new Error("Network Error"))).toBeNull();
    expect(staleFolioError(null)).toBeNull();
  });
});
