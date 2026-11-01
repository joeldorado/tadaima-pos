import { describe, expect, it } from "vitest";
import { allocatePresalePayments, sumByLine } from "./presaleAllocation";

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
