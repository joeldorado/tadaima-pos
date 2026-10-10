import { describe, expect, it } from "vitest";
import type { PreSaleOrder, PreSaleOrderPayment } from "@tadaima/api";
import { buildPresaleRows, buildPresaleRowsByMethod } from "./buildReportData";
import { isCardMethod, isCashLike, isTransferMethod } from "./excelTopTables";
import type { PresaleRow } from "./reportTypes";

// Preventas por método de pago (2026-10-10): el costo de una preventa liquidada
// se reparte entre los métodos con los que se abonó en el rango. Si no, el
// Resumen del Excel lo cuenta una vez por pestaña y la utilidad sale de menos.
const APARTADO = "2026-10-01T18:00:00Z";
const LIQUIDACION = "2026-10-20T18:00:00Z";

const payment = (id: number, amount: number, method: string, created_at: string): PreSaleOrderPayment => ({
  id, amount, notes: null, created_at, payment_method: { id, name: method }, cashier: null,
});

/** Folio de una figura de $1,000 con costo real $800. */
const order = (payments: PreSaleOrderPayment[], delivered = true): PreSaleOrder => ({
  id: 1, code: "PREV-00001", status: delivered ? "delivered" : "pending",
  linked_sale_id: null, pickup_deadline: null, notes: null,
  created_at: APARTADO, updated_at: LIQUIDACION,
  store: { id: 1, name: "Centro" }, user: null, customer: null,
  items: [{
    id: 10, pre_sale_catalog_id: 3, product_id: 7, quantity: 1, price_level: 1,
    unit_price: 1000, subtotal: 1000, cost: 800,
    status: delivered ? "delivered" : "pending",
    delivered_at: delivered ? LIQUIDACION : null,
    created_at: APARTADO,
    catalog: { id: 3, product_name: "Figura Z", image_path: null, status: null, pickup_deadline: null },
  }],
  payments,
  total: 1000,
  paid_amount: payments.reduce((a, p) => a + p.amount, 0),
  balance: 1000 - payments.reduce((a, p) => a + p.amount, 0),
});

const OCTUBRE = ["2026-10-01", "2026-10-31"] as const;

const byMethod = (orders: PreSaleOrder[], from: string, to: string) => ({
  cash: buildPresaleRowsByMethod(orders, from, to, isCashLike),
  card: buildPresaleRowsByMethod(orders, from, to, isCardMethod),
  transfer: buildPresaleRowsByMethod(orders, from, to, isTransferMethod),
});

const sum = (rows: readonly PresaleRow[], pick: (r: PresaleRow) => number) => rows.reduce((a, r) => a + pick(r), 0);

describe("buildPresaleRowsByMethod — costo repartido entre métodos", () => {
  const mixto = [order([payment(1, 300, "Efectivo", APARTADO), payment(2, 700, "Tarjeta", LIQUIDACION)])];

  it("apartado en efectivo y liquidación con tarjeta en el mismo rango: cada método carga su parte del costo", () => {
    const { cash, card, transfer } = byMethod(mixto, ...OCTUBRE);

    expect(cash).toHaveLength(1);
    expect(cash[0]!.apartado).toBeCloseTo(300);
    expect(cash[0]!.costoNeto).toBeCloseTo(240); // 800 × 300/1000
    expect(cash[0]!.utilidad).toBeCloseTo(60);

    expect(card).toHaveLength(1);
    expect(card[0]!.apartado).toBeCloseTo(700);
    expect(card[0]!.costoNeto).toBeCloseTo(560); // 800 × 700/1000
    expect(card[0]!.utilidad).toBeCloseTo(140);

    expect(transfer).toEqual([]);
  });

  it("la suma de los tres métodos es igual a la tabla general de Preventas", () => {
    const general = buildPresaleRows(mixto, ...OCTUBRE);
    const { cash, card, transfer } = byMethod(mixto, ...OCTUBRE);
    const todos = [...cash, ...card, ...transfer];

    expect(sum(todos, (r) => r.apartado)).toBeCloseTo(sum(general, (r) => r.apartado));
    expect(sum(todos, (r) => r.costoNeto)).toBeCloseTo(sum(general, (r) => r.costoNeto)); // 800, no 1,600
    expect(sum(todos, (r) => r.utilidad)).toBeCloseTo(sum(general, (r) => r.utilidad));   // 200, no −600
  });

  it("un solo método: igual que la tabla general", () => {
    const soloEfectivo = [order([payment(1, 300, "Efectivo", APARTADO), payment(2, 700, "Efectivo", LIQUIDACION)])];
    const { cash, card } = byMethod(soloEfectivo, ...OCTUBRE);

    expect(card).toEqual([]);
    expect(cash[0]!.apartado).toBeCloseTo(1000);
    expect(cash[0]!.costoNeto).toBeCloseTo(800);
    expect(cash[0]!.utilidad).toBeCloseTo(200);
  });

  it("apartado antes del rango: la liquidación carga el costo menos lo ya abonado", () => {
    const { cash, card } = byMethod(mixto, "2026-10-15", "2026-10-31");

    expect(cash).toEqual([]);
    expect(card[0]!.apartado).toBeCloseTo(700);
    expect(card[0]!.costoNeto).toBeCloseTo(500); // 800 − 300 del apartado
    expect(card[0]!.utilidad).toBeCloseTo(200);
  });

  it("abono previo al rango y dos métodos dentro: el abono previo también se reparte", () => {
    const orders = [order([
      payment(1, 300, "Efectivo", "2026-09-20T18:00:00Z"),
      payment(2, 200, "Efectivo", APARTADO),
      payment(3, 500, "Tarjeta", LIQUIDACION),
    ])];
    const { cash, card } = byMethod(orders, ...OCTUBRE);

    // Costo del periodo = 800 − 300 previos = 500, repartido 200/700 y 500/700.
    expect(cash[0]!.costoNeto).toBeCloseTo(500 * 200 / 700);
    expect(cash[0]!.utilidad).toBeCloseTo(200 * 200 / 700);
    expect(card[0]!.costoNeto).toBeCloseTo(500 * 500 / 700);
    expect(card[0]!.utilidad).toBeCloseTo(200 * 500 / 700);
    expect(cash[0]!.costoNeto + card[0]!.costoNeto).toBeCloseTo(buildPresaleRows(orders, ...OCTUBRE)[0]!.costoNeto);
  });

  it("tres métodos en el rango: la suma sigue igual a la tabla general", () => {
    const orders = [order([
      payment(1, 100, "Efectivo", APARTADO),
      payment(2, 300, "Tarjeta", "2026-10-10T18:00:00Z"),
      payment(3, 600, "Transferencia", LIQUIDACION),
    ])];
    const general = buildPresaleRows(orders, ...OCTUBRE);
    const { cash, card, transfer } = byMethod(orders, ...OCTUBRE);
    const todos = [...cash, ...card, ...transfer];

    expect(sum(todos, (r) => r.costoNeto)).toBeCloseTo(sum(general, (r) => r.costoNeto));
    expect(sum(todos, (r) => r.utilidad)).toBeCloseTo(sum(general, (r) => r.utilidad));
  });

  it("apartada (sin entregar) con dos métodos: costo = abono y utilidad $0 en cada uno", () => {
    const apartada = [order([payment(1, 300, "Efectivo", APARTADO), payment(2, 200, "Transferencia", LIQUIDACION)], false)];
    const { cash, transfer } = byMethod(apartada, ...OCTUBRE);

    expect(cash[0]!.costoNeto).toBeCloseTo(300);
    expect(cash[0]!.utilidad).toBeCloseTo(0);
    expect(transfer[0]!.costoNeto).toBeCloseTo(200);
    expect(transfer[0]!.utilidad).toBeCloseTo(0);
  });
});
