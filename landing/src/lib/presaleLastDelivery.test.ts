import { describe, expect, it } from "vitest";
import { lastPresaleDelivery } from "./presaleLastDelivery";

// «Revertir entrega» deshace la ÚLTIMA entrega de un folio y su cobro, nunca el
// anticipo (2026-11-13). Antes el modal estimaba «el último pago del folio».

const item = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  id, status: "pending", delivered_at: null as string | null, delivery_id: null as number | null,
  delivery_payment_id: null as number | null, catalog: { product_name: name }, ...over,
});
const pay = (id: number, amount: number, created_at: string, notes: string | null = null) => ({ id, amount, created_at, notes });

const ANTICIPO = "2026-11-02T18:00:00Z";
const VISITA_1 = "2026-11-10T18:00:00Z";
const VISITA_2 = "2026-11-12T18:00:00Z";

describe("lastPresaleDelivery", () => {
  it("sin partidas entregadas no hay nada que revertir", () => {
    expect(lastPresaleDelivery([item(1, "A")], [pay(1, 600, ANTICIPO)])).toBeNull();
  });

  it("folio entregado en dos visitas: la última es solo la tercera pieza y sus $100", () => {
    const items = [
      item(1, "A", { status: "delivered", delivered_at: VISITA_1, delivery_id: 7, delivery_payment_id: 2 }),
      item(2, "B", { status: "delivered", delivered_at: VISITA_1, delivery_id: 7, delivery_payment_id: 2 }),
      item(3, "C", { status: "delivered", delivered_at: VISITA_2, delivery_id: 8, delivery_payment_id: 3 }),
    ];
    const payments = [pay(1, 600, ANTICIPO), pay(2, 1100, VISITA_1), pay(3, 100, VISITA_2)];

    expect(lastPresaleDelivery(items, payments)).toEqual({ itemIds: [3], names: ["C"], refund: 100 });
  });

  it("entrega parcial vigente: revierte las 2 piezas entregadas y su cobro", () => {
    const items = [
      item(1, "A", { status: "delivered", delivered_at: VISITA_1, delivery_id: 7, delivery_payment_id: 2 }),
      item(2, "B", { status: "delivered", delivered_at: VISITA_1, delivery_id: 7, delivery_payment_id: 2 }),
      item(3, "C"),
    ];

    expect(lastPresaleDelivery(items, [pay(1, 600, ANTICIPO), pay(2, 1100, VISITA_1)]))
      .toEqual({ itemIds: [1, 2], names: ["A", "B"], refund: 1100 });
  });

  it("entrega sin cobro (el anticipo ya cubría): no se devuelve nada", () => {
    const items = [item(1, "A", { status: "delivered", delivered_at: VISITA_1, delivery_id: 7 })];

    expect(lastPresaleDelivery(items, [pay(1, 200, ANTICIPO)])?.refund).toBe(0);
  });

  it("folio anterior al registro: el pago que siguió al anticipo es la liquidación", () => {
    const items = [item(1, "A", { status: "delivered", delivered_at: VISITA_1 })];
    const payments = [pay(1, 100, ANTICIPO, "Anticipo inicial"), pay(2, 300, VISITA_1)];

    expect(lastPresaleDelivery(items, payments)?.refund).toBe(300);
  });

  it("folio anterior al registro pagado solo con su anticipo inicial: no se devuelve el anticipo", () => {
    const items = [item(1, "A", { status: "delivered", delivered_at: VISITA_1 })];

    expect(lastPresaleDelivery(items, [pay(1, 200, ANTICIPO, "Anticipo inicial")])?.refund).toBe(0);
  });
});
