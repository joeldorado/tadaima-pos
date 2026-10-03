import { describe, expect, it } from "vitest";
import type { GroupedProduct, TicketAdjustment } from "./reportTypes";
import { buildVentasReportRows, sumMethodRows } from "./ventasReportRows";

const prod = (over: Partial<GroupedProduct>): GroupedProduct => ({
  id: 1, name: "Figura", sku: "F-1", sales_count: 1, total_quantity: 1, total_revenue: 100,
  payment_breakdown: { Efectivo: { qty: 1, revenue: 100 } }, price_breakdown: {},
  total_cost: 0, total_profit: 100, product_type: "product", ...over,
});

const entry = (over: Partial<TicketAdjustment>): TicketAdjustment => ({
  kind: "discount", sale_id: 1, date: "2026-09-29T18:00:00Z", cashier: "Diana", reason: "otro", note: null,
  quantity: 1, amount: 10, shares: { cash: 1, card: 0, transfer: 0 }, ...over,
});

describe("buildVentasReportRows — bloques por método", () => {
  it("un producto vendido por los tres métodos sale en los tres bloques", () => {
    const rows = buildVentasReportRows([prod({
      total_quantity: 4, total_revenue: 400, total_cost: 240, commission_amount: 2.5,
      payment_breakdown: {
        Efectivo: { qty: 2, revenue: 200 },
        "Tarjeta de crédito": { qty: 1, revenue: 100 },
        Transferencia: { qty: 1, revenue: 100 },
      },
    })]);

    // Costo por PIEZAS: costo unitario (240 / 4 = 60) × piezas del método.
    expect(rows.blocks.cash).toEqual([{ name: "Figura", isManga: false, qty: 2, revenue: 200, cost: 120, commission: 0 }]);
    expect(rows.blocks.card).toEqual([{ name: "Figura", isManga: false, qty: 1, revenue: 100, cost: 60, commission: 2.5 }]);
    expect(rows.blocks.transfer).toEqual([{ name: "Figura", isManga: false, qty: 1, revenue: 100, cost: 60, commission: 0 }]);
  });

  it("la transferencia ya no cae en el bloque de tarjeta, y Otro/dólares van a efectivo", () => {
    const rows = buildVentasReportRows([
      prod({ id: 1, name: "A", payment_breakdown: { Transferencia: { qty: 1, revenue: 100 } } }),
      prod({ id: 2, name: "B", payment_breakdown: { Otro: { qty: 1, revenue: 50 }, "Dólares": { qty: 1, revenue: 70 } } }),
    ]);

    expect(rows.blocks.card).toEqual([]);
    expect(rows.blocks.transfer.map(r => r.name)).toEqual(["A"]);
    expect(rows.blocks.cash).toEqual([expect.objectContaining({ name: "B", qty: 2, revenue: 120 })]);
  });

  it("orden: más vendidos primero sin importar la categoría, tomos al final", () => {
    const rows = buildVentasReportRows([
      prod({ id: 1, name: "Tomo 1 Naruto", total_quantity: 9, product_type: "manga", category: "MANGA", payment_breakdown: { Efectivo: { qty: 9, revenue: 900 } } }),
      prod({ id: 2, name: "Zapato", total_quantity: 1, category: "Accesorios" }),
      prod({ id: 3, name: "Carta", total_quantity: 5, category: "TCG", payment_breakdown: { Efectivo: { qty: 5, revenue: 50 } } }),
    ]);

    expect(rows.blocks.cash.map(r => r.name)).toEqual(["Carta", "Zapato", "Tomo 1 Naruto"]);
    expect(rows.blocks.cash.map(r => r.isManga)).toEqual([false, false, true]);
  });

  it("una venta legacy devuelta netea a cero y no deja renglón vacío", () => {
    const rows = buildVentasReportRows([prod({
      total_quantity: 0, total_revenue: 0,
      payment_breakdown: { Efectivo: { qty: 1, revenue: 100 }, "Efectivo (Devuelto)": { qty: -1, revenue: -100 } },
    })]);

    expect(rows.blocks.cash).toEqual([]);
  });

  it("devolución legacy con tarjeta: el renglón queda en cero pero conserva la comisión (es gasto)", () => {
    const rows = buildVentasReportRows([prod({
      total_quantity: 0, total_revenue: 0, commission_amount: 7.5,
      payment_breakdown: { Tarjeta: { qty: 1, revenue: 300 }, "Tarjeta (Devuelto)": { qty: -1, revenue: -300 } },
    })]);

    expect(rows.blocks.card).toEqual([{ name: "Figura", isManga: false, qty: 0, revenue: 0, cost: 0, commission: 7.5 }]);
  });

  it("una preventa de manga no cuenta como tomo vendido (Manga Nacional)", () => {
    const rows = buildVentasReportRows([
      prod({ id: 100_000_009, name: "Tomo especial (Apartada)", product_type: "manga", pre_sale_apartado: 200, total_quantity: 9 }),
      prod({ id: 2, name: "Carta", total_quantity: 1 }),
    ]);

    expect(rows.blocks.cash.map(r => [r.name, r.isManga])).toEqual([["Tomo especial (Apartada)", false], ["Carta", false]]);
  });

  it("el nombre lleva el costo cuando el mismo producto se vendió con costos distintos", () => {
    const rows = buildVentasReportRows([prod({ show_cost_tag: true, cost_tag: 250 })]);
    expect(rows.blocks.cash[0]!.name).toBe("Figura · Costo $250.00");
  });

  it("devoluciones: producto, cantidad y monto devuelto", () => {
    const rows = buildVentasReportRows([prod({ returned_quantity: 2, returned_revenue: 300 })]);
    expect(rows.returns).toEqual([{ name: "Figura", qty: 2, amount: 300 }]);
  });

  it("sumMethodRows suma cantidades y montos", () => {
    expect(sumMethodRows([
      { name: "A", isManga: false, qty: 2, revenue: 200, cost: 120, commission: 1 },
      { name: "B", isManga: true, qty: 1, revenue: 100, cost: 60, commission: 0.5 },
    ])).toEqual({ qty: 3, revenue: 300, cost: 180, commission: 1.5 });
  });
});

describe("buildVentasReportRows — detalle por ticket", () => {
  it("descuento, promo y aumento con su etiqueta, ordenados por ticket", () => {
    const rows = buildVentasReportRows([prod({
      adjustment_entries: [
        entry({ sale_id: 30, kind: "discount", reason: "danado", note: "Abierto", amount: 50 }),
        entry({ sale_id: 12, kind: "promo", reason: "Card Holders", quantity: 20, amount: 400 }),
        entry({ sale_id: 40, kind: "surcharge", reason: "precio_especial", note: "SET", amount: 20 }),
      ],
    })]);

    expect(rows.discounts.cash.map(r => ({ ...r, date: "" }))).toEqual([
      { kind: "promo", product: "Figura ×20", label: "Promo: Card Holders", ticket: "#12", cashier: "Diana", date: "", amount: 400 },
      { kind: "discount", product: "Figura ×1", label: "Dañado · Abierto", ticket: "#30", cashier: "Diana", date: "", amount: 50 },
    ]);
    expect(rows.discounts.cash.map(r => r.date)).toEqual([expect.stringMatching(/^29 sep/), expect.stringMatching(/^29 sep/)]);
    expect(rows.surcharges.cash).toEqual([
      expect.objectContaining({ kind: "surcharge", label: "Precio especial · SET", ticket: "#40", amount: 20 }),
    ]);
    expect(rows.discounts.card).toEqual([]);
  });

  it("venta mixta: un renglón por método con su parte, marcado (mixto)", () => {
    const rows = buildVentasReportRows([prod({
      adjustment_entries: [entry({ sale_id: 123, amount: 100, shares: { cash: 0.6, card: 0, transfer: 0.4 } })],
    })]);

    expect(rows.discounts.cash).toEqual([expect.objectContaining({ ticket: "#123 (mixto)", amount: 60 })]);
    expect(rows.discounts.transfer).toEqual([expect.objectContaining({ ticket: "#123 (mixto)", amount: 40 })]);
    expect(rows.discounts.card).toEqual([]);
  });

  it("la fecha del ticket va en día de negocio (Tijuana), no en UTC", () => {
    const rows = buildVentasReportRows([prod({ adjustment_entries: [entry({ date: "2026-10-01T02:30:00Z" })] })]);
    expect(rows.discounts.cash[0]!.date).toMatch(/^30 sep/);
  });
});
