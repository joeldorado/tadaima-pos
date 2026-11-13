import { describe, expect, it } from "vitest";
import { allocatePresalePayments, chargeForLoadedLines, presaleDeliveryCharge, sumByLine } from "./presaleAllocation";

// Reparto de los pagos de un folio entre sus líneas (2026-11-01). Los pagos se
// guardan por folio, no por producto: la tienda aparta a $200 por pieza, y el
// reporte repartía el anticipo según el precio de cada línea (la Booster Box
// de $2,800 se llevaba $377.78 de un anticipo de $600 por tres piezas).

const line = (quantity: number, unit_price: number) => ({ quantity, unit_price });
const pay = (amount: number, created_at: string) => ({ amount, created_at });

const T1 = "2026-10-30T00:13:10Z";
const T2 = "2026-10-31T18:00:00Z";
const T3 = "2026-11-05T18:00:00Z";

const alloc = (lines: { quantity: number; unit_price: number }[], payments: { amount: number; created_at: string }[]) => {
  const result = allocatePresalePayments(lines, payments);
  return { ...result, rows: payments.map((p) => [...result.byPayment.get(p)!]) };
};

describe("allocatePresalePayments — parejo por pieza", () => {
  it("folio PREV-00040 (ETB + Bundle + Box, $600): $200 a cada pieza", () => {
    const { rows, pendingByLine } = alloc([line(1, 1100), line(1, 550), line(1, 2800)], [pay(600, T1)]);

    expect(rows[0]).toEqual([200, 200, 200]);
    expect(pendingByLine).toEqual([900, 350, 2600]);
  });

  it("folio PREV-00054 (Box + 2 Bundle + ETB, $800): la línea de 2 piezas se lleva $400", () => {
    const { rows } = alloc([line(1, 2800), line(2, 550), line(1, 1100)], [pay(800, T1)]);

    expect(rows[0]).toEqual([200, 400, 200]);
  });

  it("una sola línea: todo el pago es suyo", () => {
    const { rows, paidByLine, pendingByLine } = alloc([line(1, 2800)], [pay(200, T1)]);

    expect(rows[0]).toEqual([200]);
    expect(paidByLine).toEqual([200]);
    expect(pendingByLine).toEqual([2600]);
  });

  it("al liquidar, cada línea queda pagada exacto a su precio (lo que sobra de la barata pasa a la cara)", () => {
    const { rows, paidByLine, pendingByLine } = alloc([line(1, 1000), line(1, 300)], [pay(200, T1), pay(1100, T2)]);

    expect(rows[0]).toEqual([100, 100]);
    expect(rows[1]).toEqual([900, 200]);
    expect(paidByLine).toEqual([1000, 300]);
    expect(pendingByLine).toEqual([0, 0]);
  });

  it("el tope de una línea respeta lo que ya llevaba pagado de pagos anteriores", () => {
    // Línea 2 vale $300: con $150 del primer pago le quedan $150 de capacidad.
    const { rows } = alloc([line(1, 1000), line(1, 300)], [pay(300, T1), pay(400, T2)]);

    expect(rows[0]).toEqual([150, 150]);
    expect(rows[1]).toEqual([250, 150]);
  });

  it("procesa los pagos por fecha aunque lleguen desordenados", () => {
    const primero = pay(200, T1);
    const liquidacion = pay(1100, T2);
    const { byPayment } = allocatePresalePayments([line(1, 1000), line(1, 300)], [liquidacion, primero]);

    expect([...byPayment.get(primero)!]).toEqual([100, 100]);
    expect([...byPayment.get(liquidacion)!]).toEqual([900, 200]);
  });

  it("la suma de lo asignado a las líneas siempre es igual a lo pagado", () => {
    const casos: [ReturnType<typeof line>[], ReturnType<typeof pay>[]][] = [
      [[line(1, 1100), line(1, 550), line(1, 2800)], [pay(600, T1)]],
      [[line(1, 2800), line(2, 550), line(1, 1100)], [pay(800, T1), pay(1200, T2), pay(3000, T3)]],
      [[line(3, 99.99), line(1, 0.01)], [pay(50, T1), pay(33.33, T2)]],
    ];
    for (const [lines, payments] of casos) {
      const { byPayment } = allocatePresalePayments(lines, payments);
      for (const p of payments) {
        const asignado = byPayment.get(p)!.reduce((a, b) => a + b, 0);
        expect(asignado).toBeCloseTo(p.amount, 6);
      }
    }
  });

  it("pago mayor al total: el excedente no se pierde y el pendiente no baja de $0", () => {
    const { rows, paidByLine, pendingByLine } = alloc([line(1, 100), line(1, 100)], [pay(300, T1)]);

    expect(rows[0]).toEqual([150, 150]);
    expect(paidByLine).toEqual([150, 150]);
    expect(pendingByLine).toEqual([0, 0]);
  });

  it("folio con total $0: se reparte parejo por pieza", () => {
    const { rows } = alloc([line(1, 0), line(3, 0)], [pay(400, T1)]);

    expect(rows[0]).toEqual([100, 300]);
  });

  it("sin pagos: nada asignado y todo pendiente", () => {
    const { byPayment, paidByLine, pendingByLine } = allocatePresalePayments([line(2, 550)], []);

    expect(byPayment.size).toBe(0);
    expect(paidByLine).toEqual([0]);
    expect(pendingByLine).toEqual([1100]);
  });

  it("sin líneas: no truena", () => {
    const { byPayment, paidByLine } = allocatePresalePayments([], [pay(200, T1)]);

    expect([...byPayment.get(byPayment.keys().next().value!)!]).toEqual([]);
    expect(paidByLine).toEqual([]);
  });
});

describe("sumByLine", () => {
  it("suma por línea solo los pagos indicados (p. ej. los del rango o los de un método)", () => {
    const enRango = pay(600, T2);
    const previo = pay(300, T1);
    const { byPayment } = allocatePresalePayments([line(1, 1100), line(1, 550), line(1, 2800)], [previo, enRango]);

    expect(sumByLine(byPayment, [enRango])).toEqual([200, 200, 200]);
    expect(sumByLine(byPayment, [previo])).toEqual([100, 100, 100]);
    expect(sumByLine(byPayment, [previo, enRango])).toEqual([300, 300, 300]);
    expect(sumByLine(byPayment, [])).toEqual([0, 0, 0]);
  });
});

// Entrega parcial (2026-11-13). Caso de tienda: un folio de 3 productos y solo
// llegaron 2. Caja cobra lo que falta de las piezas que el cliente se lleva; la
// que se queda conserva su anticipo.

const dline = (unit_price: number, delivered = false, quantity = 1) => ({ quantity, unit_price, delivered });

describe("presaleDeliveryCharge — cobro de una entrega parcial", () => {
  const folio = [dline(1000), dline(500), dline(300)];

  it("anticipo $600 en 3 piezas, se lleva 2: cobra lo que les falta a esas 2", () => {
    const result = presaleDeliveryCharge(folio, 600, [0, 1]);

    expect(result.pendingByLine).toEqual([800, 300, 100]);
    expect(result.charge).toBe(1100);
    expect(result.oldDebt).toBe(0);
  });

  it("cuando llega la tercera, cobra solo su saldo", () => {
    const afterFirstVisit = [dline(1000, true), dline(500, true), dline(300)];
    const result = presaleDeliveryCharge(afterFirstVisit, 1700, [2]);

    expect(result.pendingByLine).toEqual([0, 0, 100]);
    expect(result.charge).toBe(100);
  });

  it("llevarse todas las pendientes cobra exacto el saldo del folio", () => {
    expect(presaleDeliveryCharge(folio, 600, [0, 1, 2]).charge).toBe(1200);
  });

  it("no pierde centavos: tres piezas de $333.33 con $100 de anticipo", () => {
    const lines = [dline(333.33), dline(333.33), dline(333.33)];
    const all = presaleDeliveryCharge(lines, 100, [0, 1, 2]);
    const two = presaleDeliveryCharge(lines, 100, [0, 1]);

    expect(all.charge).toBe(899.99);
    expect(all.pendingByLine.reduce((a, b) => a + b, 0)).toBeCloseTo(899.99, 2);
    // Lo pagado tras cobrar 2 cubre esas 2 (regla que valida el servidor).
    expect(100 + two.charge).toBeGreaterThanOrEqual(666.66);
  });

  it("el anticipo que no cabe en una pieza barata pasa a las otras", () => {
    // $600 en 3 piezas serían $200 c/u, pero la de $100 solo admite $100.
    const result = presaleDeliveryCharge([dline(100), dline(1000), dline(1000)], 600, [0]);

    expect(result.pendingByLine).toEqual([0, 750, 750]);
    expect(result.charge).toBe(0);
  });

  it("folio ya pagado completo: no cobra nada", () => {
    expect(presaleDeliveryCharge(folio, 1800, [0, 1]).charge).toBe(0);
  });

  it("sin anticipo cobra el precio completo de lo que se lleva", () => {
    expect(presaleDeliveryCharge(folio, 0, [1]).charge).toBe(500);
  });

  it("una línea de 2 piezas pesa doble en el reparto del anticipo", () => {
    const result = presaleDeliveryCharge([dline(550, false, 2), dline(1100)], 600, [1]);

    expect(result.pendingByLine).toEqual([700, 900]);
    expect(result.charge).toBe(900);
  });

  it("folio viejo con una pieza entregada sin cobrar: la deuda vieja se cobra en la siguiente entrega", () => {
    // A ($1,000) se marcó entregada con solo $600 pagados: faltan $400 de A.
    const result = presaleDeliveryCharge([dline(1000, true), dline(500)], 600, [1]);

    expect(result.oldDebt).toBe(400);
    expect(result.pendingByLine).toEqual([0, 500]);
    expect(result.charge).toBe(900);
  });

  it("sin líneas elegidas no cobra nada", () => {
    expect(presaleDeliveryCharge(folio, 600, []).charge).toBe(0);
  });
});

describe("allocatePresalePayments — pagos ligados a una entrega", () => {
  const deliveredLine = (quantity: number, unit_price: number, delivery_payment_id: number | null) =>
    ({ quantity, unit_price, delivery_payment_id });
  const paid = (id: number, amount: number, created_at: string) => ({ id, amount, created_at });

  it("el cobro de la primera entrega no se abona a la pieza que sigue pendiente", () => {
    const lines = [deliveredLine(1, 1000, 2), deliveredLine(1, 500, 2), deliveredLine(1, 300, null)];
    const payments = [paid(1, 600, T1), paid(2, 1100, T2)];
    const result = allocatePresalePayments(lines, payments);

    expect([...result.byPayment.get(payments[0]!)!]).toEqual([200, 200, 200]);
    expect([...result.byPayment.get(payments[1]!)!]).toEqual([800, 300, 0]);
    expect(result.pendingByLine).toEqual([0, 0, 100]);
  });

  it("la segunda entrega termina de pagar la pieza que faltaba", () => {
    const lines = [deliveredLine(1, 1000, 2), deliveredLine(1, 500, 2), deliveredLine(1, 300, 3)];
    const payments = [paid(1, 600, T1), paid(2, 1100, T2), paid(3, 100, T3)];
    const result = allocatePresalePayments(lines, payments);

    expect([...result.byPayment.get(payments[2]!)!]).toEqual([0, 0, 100]);
    expect(result.pendingByLine).toEqual([0, 0, 0]);
  });

  it("sin el dato de entrega reparte igual que siempre (folios anteriores)", () => {
    const withIds = allocatePresalePayments(
      [line(1, 1000), line(1, 300)],
      [paid(1, 200, T1), paid(2, 1100, T2)],
    );

    expect(withIds.paidByLine).toEqual([1000, 300]);
    expect([...withIds.byPayment.values()].map((share) => [...share])).toEqual([[100, 100], [900, 200]]);
  });
});

describe("chargeForLoadedLines — cobro de las partidas que quedan en el carrito", () => {
  it("suma lo pendiente de las partidas presentes", () => {
    expect(chargeForLoadedLines([800, 300], 0)).toBe(1100);
  });

  it("al quitar una partida el cobro baja a lo de las que quedan", () => {
    expect(chargeForLoadedLines([800], 0)).toBe(800);
  });

  it("suma la deuda vieja del folio mientras quede alguna partida", () => {
    expect(chargeForLoadedLines([500], 400)).toBe(900);
  });

  it("sin partidas no cobra nada, ni la deuda vieja", () => {
    expect(chargeForLoadedLines([], 400)).toBe(0);
  });

  it("no arrastra errores de punto flotante", () => {
    expect(chargeForLoadedLines([0.1, 0.2], 0)).toBe(0.3);
  });
});
